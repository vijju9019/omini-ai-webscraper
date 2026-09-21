import type { CategoryItem } from "../shared/models";
import { cleanText, isElementVisible } from "./fieldClassifier";

/**
 * Intelligent Category & Department Detector:
 * Identifies category links, taxonomies, and department menus across e-commerce, directory,
 * catalog, and content websites so that all categories can be visited and extracted into one unified table.
 */
export function detectCategories(root: Document = document): CategoryItem[] {
  const categories: CategoryItem[] = [];
  const seenUrls = new Set<string>();
  const seenNames = new Set<string>();

  const currentHost = window.location.hostname;
  const currentUrl = window.location.href;

  // 1. Selector targets for category navigation structures
  const containerSelectors = [
    ".side_categories a[href]",
    "[class*='category' i] a[href]",
    "[id*='category' i] a[href]",
    "[class*='department' i] a[href]",
    "[id*='department' i] a[href]",
    "[class*='taxonomy' i] a[href]",
    "nav[aria-label*='category' i] a[href]",
    "nav[aria-label*='department' i] a[href]",
    "aside a[href]",
    ".sidebar a[href]",
    "[class*='nav-list'] a[href]",
    "header nav a[href]",
    ".navbar a[href]",
    "nav a[href]",
  ];

  const matchedAnchors: HTMLAnchorElement[] = [];
  for (const sel of containerSelectors) {
    try {
      const els = Array.from(root.querySelectorAll<HTMLAnchorElement>(sel));
      matchedAnchors.push(...els);
    } catch {
      // ignore invalid selector
    }
  }

  // 2. Also find links with prominent category URL patterns anywhere on page
  const categoryPathRegex = /(\/category\/|\/categories\/|\/catalogue\/category\/|\/collections\/|\/department\/|\/c\/|\/shop\/[a-z0-9_-]+|\/browse\/|\/dept\/)/i;
  try {
    const allLinks = Array.from(root.querySelectorAll<HTMLAnchorElement>("a[href]"));
    for (const a of allLinks) {
      const href = a.getAttribute("href") || "";
      if (categoryPathRegex.test(href)) {
        matchedAnchors.push(a);
      }
    }
  } catch {
    // ignore
  }

  // Utility URLs to strictly exclude
  const excludeRegex = /(login|signin|register|signup|logout|cart|checkout|basket|account|profile|wishlist|order|contact|about|privacy|terms|faq|help|shipping|returns|cookie|blog|press|career|jobs|void\(0\)|\.png|\.jpe?g|\.svg|\.pdf)/i;
  const genericNames = new Set([
    "home",
    "all",
    "see all",
    "view all",
    "menu",
    "back",
    "next",
    "previous",
    "prev",
    "more",
    "close",
    "search",
    "help",
    "cart",
    "account",
    "sign in",
    "log in",
    "terms",
    "privacy",
  ]);

  for (const anchor of matchedAnchors) {
    try {
      const rawHref = anchor.getAttribute("href");
      if (!rawHref || rawHref.startsWith("#") || rawHref.startsWith("javascript:") || rawHref.startsWith("mailto:")) {
        continue;
      }

      // Resolve full URL
      const fullUrlObj = new URL(rawHref, currentUrl);
      if (fullUrlObj.hostname !== currentHost) {
        continue; // skip external domains
      }

      const cleanUrl = fullUrlObj.origin + fullUrlObj.pathname;
      if (excludeRegex.test(cleanUrl)) {
        continue;
      }

      // Check text content
      const rawText = anchor.innerText || anchor.textContent || "";
      let text = cleanText(rawText);
      if (!text || text.length > 50) continue;

      // Extract item count if present (e.g. "Travel (11)" or "Books 24")
      let count: number | undefined;
      const countMatch = text.match(/\(([0-9,]+)\)|\[([0-9,]+)\]/);
      if (countMatch) {
        count = parseInt((countMatch[1] || countMatch[2]).replace(/,/g, ""), 10);
        text = cleanText(text.replace(countMatch[0], ""));
      }

      // Clean leading icons, bullets or arrows
      text = text.replace(/^[›»•\-–—►▶\s]+|[›»•\-–—►▶\s]+$/g, "").trim();
      const lowerName = text.toLowerCase();

      if (text.length < 2 || genericNames.has(lowerName)) {
        continue;
      }

      // Deduplicate by URL and name
      if (seenUrls.has(cleanUrl) || seenNames.has(lowerName)) {
        continue;
      }

      seenUrls.add(cleanUrl);
      seenNames.add(lowerName);

      categories.push({
        name: text,
        url: fullUrlObj.href,
        count,
      });
    } catch {
      // ignore URL parse errors
    }
  }

  return categories;
}
