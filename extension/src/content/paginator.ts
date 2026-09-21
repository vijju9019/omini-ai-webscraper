import type { PaginationMode } from "../shared/models";
import { generatePageSelector } from "./clusterDetector";
import { cleanText, isElementVisible } from "./fieldClassifier";

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Robust smart settler for Load More, Read More, and Pagination:
 * Waits until new rows actually arrive in the DOM, or settles after active mutations finish.
 * Does NOT resolve prematurely before AJAX requests return.
 */
export async function waitForNewContentOrSettled(
  rowSelector: string,
  expectedMinCount: number,
  timeoutMs = 4000,
  debounceMs = 150,
  isStopped?: () => boolean
): Promise<void> {
  return new Promise((resolve) => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let resolved = false;
    const startTime = Date.now();

    const cleanup = () => {
      resolved = true;
      clearTimeout(maxTimer);
      if (debounceTimer) clearTimeout(debounceTimer);
      if (pollInterval) clearInterval(pollInterval);
      observer.disconnect();
    };

    const maxTimer = setTimeout(() => {
      cleanup();
      resolve();
    }, timeoutMs);

    const checkNewContent = () => {
      if (isStopped && isStopped()) {
        cleanup();
        resolve();
        return true;
      }
      try {
        const count = document.querySelectorAll(rowSelector).length;
        if (count > expectedMinCount) {
          // New items found! Wait brief debounce for sibling DOM painting, then resolve
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            cleanup();
            resolve();
          }, debounceMs);
          return true;
        }
      } catch {
        // ignore
      }
      return false;
    };

    // Initial check in case it loaded instantly
    if (checkNewContent()) return;

    // Mutation observer listens for DOM changes
    const observer = new MutationObserver(() => {
      if (resolved) return;
      if (isStopped && isStopped()) {
        cleanup();
        resolve();
        return;
      }

      if (checkNewContent()) return;

      // Only settle after at least 1200ms has elapsed and DOM has stopped mutating for 400ms
      // (prevents premature cut-offs while AJAX request is in-flight)
      const elapsed = Date.now() - startTime;
      if (elapsed > 1200) {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          cleanup();
          resolve();
        }, 400);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    // Periodic poll check every 60ms in case MutationObserver misses detached shadow DOM changes
    pollInterval = setInterval(() => {
      if (resolved) return;
      if (checkNewContent()) return;
    }, 60);
  });
}

/**
 * Auto-detects the 'Next' page link or button.
 */
export function findNextPageControl(customSelector?: string): HTMLElement | null {
  if (customSelector) {
    try {
      const el = document.querySelector<HTMLElement>(customSelector);
      if (el && isElementVisible(el)) return el;
    } catch {
      // invalid custom selector fallback
    }
  }

  // 1. Direct rel="next"
  const relNext = document.querySelector<HTMLElement>("a[rel='next'], link[rel='next']");
  if (relNext && isElementVisible(relNext)) return relNext;

  // 2. Scan buttons and anchors with aria-label or text
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>("a, button, [role='button'], [class*='pagination'] li, [class*='pager'] a")
  ).filter(isElementVisible);

  const nextRegex = /^(next|older|›|»|next\s+page|>)$/i;

  for (const el of candidates) {
    const text = cleanText(el.innerText || el.textContent);
    const aria = el.getAttribute("aria-label") || "";

    const isDisabled =
      el.hasAttribute("disabled") ||
      el.getAttribute("aria-disabled") === "true" ||
      el.classList.contains("disabled") ||
      el.classList.contains("paginate_button_disabled");

    if (isDisabled) continue;

    if (
      nextRegex.test(text) ||
      nextRegex.test(aria) ||
      text.toLowerCase() === "next >" ||
      aria.toLowerCase().includes("next page") ||
      el.getAttribute("title")?.toLowerCase() === "next"
    ) {
      return el;
    }
  }

  return null;
}

/**
 * Auto-detects a 'Load More' button.
 */
export function findLoadMoreControl(customSelector?: string): HTMLElement | null {
  if (customSelector) {
    try {
      const el = document.querySelector<HTMLElement>(customSelector);
      if (el && isElementVisible(el)) return el;
    } catch {
      // invalid fallback
    }
  }

  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>("button, a, [role='button'], div[class*='btn']")
  ).filter(isElementVisible);

  const loadMoreRegex = /(load\s+more|show\s+more|view\s+more|see\s+more|read\s+more|more\s+results|more\s+products|more\s+items|more\s+listings)/i;

  for (const el of candidates) {
    const text = cleanText(el.innerText || el.textContent);
    const aria = (el.getAttribute("aria-label") || "").toLowerCase();
    const isDisabled =
      el.hasAttribute("disabled") ||
      el.getAttribute("aria-disabled") === "true" ||
      el.classList.contains("disabled");

    if (isDisabled) continue;

    if (loadMoreRegex.test(text) || loadMoreRegex.test(aria)) {
      return el;
    }
  }

  return null;
}

/**
 * Automatically inspects the page for total pages or total results count.
 */
export function detectTotalPages(root: Document = document): number | null {
  try {
    const bodyText = root.body ? (root.body.innerText || root.body.textContent || "") : "";

    // 1. "Page 1 of 50" or "Page 1 / 50"
    const pageOfMatch = bodyText.match(/page\s+\d+\s*(?:of|\/)\s*([0-9,]+)/i);
    if (pageOfMatch) {
      const total = parseInt(pageOfMatch[1].replace(/,/g, ""), 10);
      if (!isNaN(total) && total >= 1 && total <= 5000) return total;
    }

    // 2. "Showing 1-20 of 100" or "Showing 1 to 24 of 48 items"
    const rangeMatch = bodyText.match(/(?:showing|displaying|viewing)?\s*(\d+)\s*(?:-|to)\s*(\d+)\s+of\s+([0-9,]+)/i);
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10);
      const end = parseInt(rangeMatch[2], 10);
      const total = parseInt(rangeMatch[3].replace(/,/g, ""), 10);
      const perPage = Math.max(1, end - start + 1);
      if (!isNaN(total) && total > 0 && perPage > 0) {
        const calcPages = Math.ceil(total / perPage);
        if (calcPages >= 1 && calcPages <= 5000) return calcPages;
      }
    }

    // 3. Look for numbered page elements in pagination containers
    const pagerItems = Array.from(
      root.querySelectorAll(
        "nav[aria-label*='pagination' i] a, [class*='pagination' i] a, [class*='pagination' i] button, [class*='pager' i] a, [class*='page-number' i], [class*='paginate'] a"
      )
    );

    let maxPageNum = 0;
    for (const item of pagerItems) {
      const text = (item.textContent || "").trim();
      if (/^\d+$/.test(text)) {
        const num = parseInt(text, 10);
        if (num > maxPageNum && num < 3000) {
          maxPageNum = num;
        }
      }
    }
    if (maxPageNum > 1) {
      return maxPageNum;
    }

    // 4. Look for pagination URLs with page parameter: ?page=5 or &p=5 or /page/5
    const pageLinks = Array.from(
      root.querySelectorAll<HTMLAnchorElement>("a[href*='page='], a[href*='p='], a[href*='/page/']")
    );
    let maxFromUrls = 0;
    for (const a of pageLinks) {
      const href = a.getAttribute("href") || "";
      const m = href.match(/(?:page=|p=|\/page\/)(\d+)/i);
      if (m) {
        const pNum = parseInt(m[1], 10);
        if (pNum > maxFromUrls && pNum < 3000) {
          maxFromUrls = pNum;
        }
      }
    }
    if (maxFromUrls > 1) {
      return maxFromUrls;
    }

    // 5. Look for "of 1,250 results" and estimate from visible row items
    const resultsMatch = bodyText.match(/(?:of|total)\s+([0-9,]+)\s+(?:results|products|items|records|listings)/i);
    if (resultsMatch) {
      const totalItems = parseInt(resultsMatch[1].replace(/,/g, ""), 10);
      if (!isNaN(totalItems) && totalItems > 0 && totalItems < 100000) {
        const cards = root.querySelectorAll("article, [class*='card'], [class*='item'], tr").length;
        const perPage = Math.max(10, Math.min(cards || 20, 60));
        return Math.ceil(totalItems / perPage);
      }
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Intelligent automatic detection of pagination type & total page count for 1-click scraping.
 */
export function autoDetectPagination(): {
  mode: PaginationMode;
  nextSelector?: string;
  label: string;
  totalPages: number | null;
} {
  const totalPages = detectTotalPages();
  const nextBtn = findNextPageControl();
  if (nextBtn) {
    const selector = generatePageSelector(nextBtn);
    const text = cleanText(nextBtn.innerText || nextBtn.textContent) || "Next";
    return {
      mode: "next",
      nextSelector: selector,
      label: totalPages
        ? `⚡ Auto-detected: ${totalPages} Pages Total (Exact Crawl)`
        : `⚡ Auto-detected: Next Page ("${text.slice(0, 15)}")`,
      totalPages,
    };
  }

  const loadMoreBtn = findLoadMoreControl();
  if (loadMoreBtn) {
    const selector = generatePageSelector(loadMoreBtn);
    const text = cleanText(loadMoreBtn.innerText || loadMoreBtn.textContent) || "Load More";
    return {
      mode: "load-more",
      nextSelector: selector,
      label: totalPages
        ? `⚡ Auto-detected: Load More (${totalPages} Pages)`
        : `⚡ Auto-detected: Load More Button`,
      totalPages,
    };
  }

  const isTallDoc = document.documentElement.scrollHeight > window.innerHeight * 2.2;
  if (isTallDoc) {
    return {
      mode: "infinite-scroll",
      label: totalPages
        ? `⚡ Auto-detected: Infinite Scroll (~${totalPages} pages)`
        : "⚡ Auto-detected: Infinite Scroll",
      totalPages,
    };
  }

  return {
    mode: "none",
    label: "⚡ Single Page (1 page total)",
    totalPages: 1,
  };
}

/**
 * Fast-track infinite scroll: triggers virtual scroll and resolves as soon as new items load.
 */
export async function executeInfiniteScrollFast(rowSelector: string, currentCount: number, waitMs = 250): Promise<boolean> {
  const prevHeight = document.documentElement.scrollHeight;
  const prevScrollTop = window.scrollY || window.pageYOffset;

  window.scrollTo({ top: prevHeight, behavior: "smooth" });
  window.dispatchEvent(new Event("scroll"));
  window.dispatchEvent(new WheelEvent("wheel", { deltaY: 150 }));

  // Wait for new items to appear with fast debounce
  await waitForNewContentOrSettled(rowSelector, currentCount, Math.max(waitMs * 2, 700), 80);

  const newHeight = document.documentElement.scrollHeight;
  const newScrollTop = window.scrollY || window.pageYOffset;
  const newCount = document.querySelectorAll(rowSelector).length;

  return newHeight > prevHeight || newScrollTop > prevScrollTop || newCount > currentCount;
}

/**
 * Fast-track click on pagination element with immediate event dispatch and robust settling.
 */
export async function clickPaginationElementFast(
  element: HTMLElement,
  rowSelector: string,
  currentCount: number,
  waitMs = 300,
  isStopped?: () => boolean
): Promise<void> {
  // First auto-expand any inline read-more or view-more buttons
  expandInlineReadMoreButtons(document);

  // Dispatch click immediately without artificial scroll sleep
  element.scrollIntoView({ block: "center", inline: "center", behavior: "auto" });
  element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
  element.click();

  // Wait until new content arrives or settled (up to 4000ms for slow networks)
  await waitForNewContentOrSettled(rowSelector, currentCount, 4000, 150, isStopped);

  // Expand again on newly arrived items
  expandInlineReadMoreButtons(document);
}

/**
 * Finds next page URL from any Document (including in-memory parsed category pages).
 */
export function findNextPageUrlFromDoc(doc: Document, currentUrl: string): string | null {
  try {
    // 1. rel="next"
    const relNext = doc.querySelector<HTMLAnchorElement | HTMLLinkElement>("a[rel='next'], link[rel='next']");
    if (relNext) {
      const href = relNext.getAttribute("href");
      if (href && !href.startsWith("javascript:") && !href.startsWith("#")) {
        return new URL(href, currentUrl).href;
      }
    }

    // 2. Scan anchors
    const anchors = Array.from(
      doc.querySelectorAll<HTMLAnchorElement>(
        "a[href], nav[aria-label*='pagination' i] a, [class*='pagination' i] a, [class*='pager' i] a, li.next a"
      )
    );

    const nextRegex = /^(next|older|›|»|next\s+page|>|next\s*>)$/i;

    for (const a of anchors) {
      const text = cleanText(a.innerText || a.textContent);
      const aria = (a.getAttribute("aria-label") || "").toLowerCase();
      const title = (a.getAttribute("title") || "").toLowerCase();
      const className = (a.className || "").toLowerCase();
      const parentClass = (a.parentElement?.className || "").toLowerCase();

      const isDisabled =
        a.hasAttribute("disabled") ||
        a.getAttribute("aria-disabled") === "true" ||
        className.includes("disabled") ||
        parentClass.includes("disabled");

      if (isDisabled) continue;

      if (
        nextRegex.test(text) ||
        aria.includes("next") ||
        title.includes("next") ||
        className.includes("next") ||
        parentClass.includes("next")
      ) {
        const href = a.getAttribute("href");
        if (href && !href.startsWith("javascript:") && !href.startsWith("#")) {
          return new URL(href, currentUrl).href;
        }
      }
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Automatically expands any truncated inline 'Read More' / 'Show More' / 'View Details' buttons
 * inside cards or detail sections before extraction, ensuring 100% of descriptions and specs are captured.
 */
export function expandInlineReadMoreButtons(root: Element | Document = document): void {
  try {
    const expandButtons = Array.from(
      root.querySelectorAll<HTMLElement>(
        "button, a, [role='button'], .read-more, .show-more, [class*='readmore' i], [class*='showmore' i], [class*='see-more' i], [class*='expand' i], [class*='more-details' i]"
      )
    );
    const expandRegex = /^(read\s+more|show\s+more|see\s+more|view\s+more|view\s+details|more\s+details|\+[\s]*more)$/i;
    for (const btn of expandButtons) {
      const txt = cleanText(btn.innerText || btn.textContent);
      if (expandRegex.test(txt) && isElementVisible(btn)) {
        try {
          btn.click();
        } catch {}
      }
    }
  } catch {}
}

/**
 * Generates selector for an element clicked as pagination control.
 */
export function getPaginationSelector(element: HTMLElement): string {
  return generatePageSelector(element);
}

export interface WarpPaginationPlan {
  isWarpCapable: boolean;
  totalPages: number;
  generateUrl: ((page: number) => string) | null;
  explicitUrls: string[];
}

/**
 * Discovers if the webpage uses URL-based pagination and constructs a high-speed parallel fetch plan.
 */
export function detectWarpPaginationUrls(): WarpPaginationPlan {
  const total = detectTotalPages() || 1;
  const currentUrl = window.location.href;

  // 1. Check next page control anchor
  const nextControl = findNextPageControl();
  let nextHref: string | null = null;
  if (nextControl instanceof HTMLAnchorElement && nextControl.href) {
    nextHref = nextControl.href;
  } else if (nextControl) {
    const a = nextControl.querySelector("a[href]") || nextControl.closest("a[href]");
    if (a instanceof HTMLAnchorElement && a.href) {
      nextHref = a.href;
    }
  }

  // Check <link rel="next">
  if (!nextHref) {
    const linkNext = document.querySelector<HTMLLinkElement>("link[rel='next']");
    if (linkNext?.href) nextHref = linkNext.href;
  }

  // 2. Scan all anchor tags for pagination parameter patterns
  const anchorHrefs = Array.from(
    document.querySelectorAll<HTMLAnchorElement>(
      "a[href*='page='], a[href*='p='], a[href*='pg='], a[href*='/page/'], [class*='pagination'] a[href], [class*='pager'] a[href]"
    )
  ).map((a) => a.href);

  // Collect explicit page URLs
  const explicitUrls: string[] = [];
  for (const href of anchorHrefs) {
    if (/^https?:\/\//i.test(href) && !explicitUrls.includes(href) && href !== currentUrl) {
      explicitUrls.push(href);
    }
  }

  // Deduce query parameter template
  const candidateUrl = nextHref || (explicitUrls.length > 0 ? explicitUrls[0] : null);
  if (candidateUrl) {
    try {
      const parsed = new URL(candidateUrl, currentUrl);
      const searchParams = parsed.searchParams;

      // Common pagination param names
      const paramNames = ["page", "p", "pg", "paged", "page_number", "pageIndex", "start", "offset"];
      for (const param of paramNames) {
        if (searchParams.has(param)) {
          const rawVal = parseInt(searchParams.get(param) || "0", 10);
          const isOffset = param === "start" || param === "offset";
          const step = isOffset && rawVal > 1 ? rawVal : 1;

          return {
            isWarpCapable: true,
            totalPages: total > 1 ? total : Math.max(explicitUrls.length + 1, 20),
            generateUrl: (page: number) => {
              const u = new URL(parsed.href);
              const val = isOffset ? (page - 1) * step : page;
              u.searchParams.set(param, String(val));
              return u.href;
            },
            explicitUrls,
          };
        }
      }

      // Check path template: /page/2/
      if (/\/page\/\d+\/?/i.test(parsed.pathname)) {
        return {
          isWarpCapable: true,
          totalPages: total > 1 ? total : Math.max(explicitUrls.length + 1, 20),
          generateUrl: (page: number) => {
            const u = new URL(parsed.href);
            u.pathname = u.pathname.replace(/\/page\/\d+\/?/i, `/page/${page}/`);
            return u.href;
          },
          explicitUrls,
        };
      }
    } catch {
      // ignore
    }
  }

  // If we found explicit URLs but no formula
  if (explicitUrls.length >= 2) {
    return {
      isWarpCapable: true,
      totalPages: Math.max(total, explicitUrls.length + 1),
      generateUrl: null,
      explicitUrls,
    };
  }

  return {
    isWarpCapable: false,
    totalPages: total,
    generateUrl: null,
    explicitUrls: [],
  };
}
