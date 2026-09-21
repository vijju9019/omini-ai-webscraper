import type { RequestMessage, ResponseMessage } from "../shared/messages";
import type { CollectionCandidate, ExtractionRecipe, PaginationSettings } from "../shared/models";
import { detectCategories } from "./categoryDetector";
import { candidateFromElement, discoverCollections } from "./clusterDetector";
import { extractDetailPageData, extractRows, runConcurrentPool } from "./extractor";
import { cleanText } from "./fieldClassifier";
import {
  autoDetectPagination,
  clickPaginationElementFast,
  detectWarpPaginationUrls,
  executeInfiniteScrollFast,
  expandInlineReadMoreButtons,
  findLoadMoreControl,
  findNextPageControl,
  findNextPageUrlFromDoc,
  getPaginationSelector,
  wait,
  waitForNewContentOrSettled,
} from "./paginator";
import { sanitizeSingleRowForML } from "../shared/mlFeatureAnalyzer";
import {
  clearHighlights,
  hideScraperLockShield,
  highlightElements,
  showScraperLockShield,
  startInteractivePicker,
  updateScraperLockShield,
} from "./visualOverlay";

let isScraperRunning = false;
let isScraperPaused = false;
let isScraperStopped = false;
let currentLiveRows: Record<string, string>[] = [];

function findProductLink(row: Record<string, string>): string | null {
  // 0. Check internal detail URL captured directly from card container
  if (row["_detail_url"] && /^https?:\/\//i.test(row["_detail_url"])) {
    return row["_detail_url"];
  }

  // 1. Check explicit link/url columns
  for (const [k, v] of Object.entries(row)) {
    if (typeof v !== "string" || !v.trim()) continue;
    const lk = k.toLowerCase();
    if (lk.includes("link") || lk.includes("url") || lk === "href" || lk.includes("product") || lk.includes("item")) {
      const trimmed = v.trim();
      try {
        const u = new URL(trimmed, window.location.href).href;
        if (/^https?:\/\/[^/]+\/.+/i.test(u) && !/\.(png|jpe?g|gif|svg|webp|css|js)(\?|$)/i.test(u)) {
          return u;
        }
      } catch {}
    }
  }

  // 2. Check ANY value in the row that starts with http or looks like a product URL path
  for (const [k, v] of Object.entries(row)) {
    if (typeof v !== "string" || !v.trim()) continue;
    const trimmed = v.trim();
    if (/^https?:\/\/[^/]+\/.+/i.test(trimmed) && !/\.(png|jpe?g|gif|svg|webp|css|js)(\?|$)/i.test(trimmed)) {
      return trimmed;
    }
    if (/^\/[a-z0-9_-]+\/.+/i.test(trimmed) && !/\.(png|jpe?g|gif|svg|webp)(\?|$)/i.test(trimmed)) {
      try {
        return new URL(trimmed, window.location.href).href;
      } catch {}
    }
  }
  return null;
}

/**
 * Infer current category name from breadcrumbs or active menu on the page
 */
function inferCurrentCategoryName(): string {
  try {
    const breadcrumbs = Array.from(
      document.querySelectorAll(".breadcrumb a, [class*='breadcrumb' i] a, nav[aria-label*='breadcrumb' i] a, .breadcrumbs li")
    )
      .map((el) => cleanText(el.textContent))
      .filter((t) => t && !/^(home|index|all)$/i.test(t));
    if (breadcrumbs.length > 0) {
      return breadcrumbs[breadcrumbs.length - 1];
    }

    const activeNav = document.querySelector(".side_categories li.active a, nav a.active, [class*='category' i] .active");
    if (activeNav) {
      const t = cleanText(activeNav.textContent);
      if (t) return t.replace(/\([0-9,]+\)/g, "").trim();
    }
  } catch {
    // ignore
  }
  return "";
}

/**
 * Warp-Speed Parallel & Turbo extraction engine: achieves maximum network throughput.
 * Respects exact website page boundaries, instant 1-click pause/resume, and multi-category traversal.
 */
async function runExtractionLoop(recipe: ExtractionRecipe, pagination: PaginationSettings): Promise<void> {
  if (isScraperRunning) {
    console.warn("Extraction is already in progress.");
    return;
  }

  isScraperRunning = true;
  isScraperPaused = false;
  isScraperStopped = false;

  const allRows: Record<string, string>[] = [];
  currentLiveRows = allRows;
  const seenRowHashes = new Set<string>();
  let currentPage = 1;
  let consecutiveNoNewData = 0;
  let duplicateCount = 0;

  // Bounded page limit: strictly crawl only the detected pages of the website
  const autoPag = autoDetectPagination();
  const detectedLimit = autoPag.totalPages && autoPag.totalPages > 0 ? autoPag.totalPages : null;
  const effectiveMaxPages =
    pagination.maxPages && pagination.maxPages > 0
      ? pagination.maxPages
      : detectedLimit || (pagination.mode === "none" ? 1 : 10);

  showScraperLockShield("⚡ OmniScrape AI Active", "Extracting data with bounded page crawling…");

  try {
    // Visually highlight detected items on the live webpage
    try {
      const matched = Array.from(document.querySelectorAll(recipe.selector));
      highlightElements(matched.slice(0, 48), "⚡ Scraping");
    } catch {
      // ignore
    }

    // ==========================================
    // OPTION A: MULTI-CATEGORY TRAVERSAL
    // (Visits each category on the site & extracts rows with "Category: [Name]")
    // ==========================================
    if (pagination.traverseCategories && !isScraperStopped) {
      const detectedCats = detectCategories();
      const categoriesToCrawl =
        pagination.selectedCategories && pagination.selectedCategories.length > 0
          ? detectedCats.filter((c) => pagination.selectedCategories!.includes(c.url))
          : detectedCats;

      if (categoriesToCrawl.length > 0) {
        updateScraperLockShield(
          `🌐 Multi-Category Extraction (${categoriesToCrawl.length} Categories)`,
          `Discovered ${categoriesToCrawl.length} categories. Visiting each and extracting all items into one unified table…`
        );

        for (let catIdx = 0; catIdx < categoriesToCrawl.length; catIdx++) {
          if (isScraperStopped) break;
          while (isScraperPaused && !isScraperStopped) {
            updateScraperLockShield("⏸️ Extraction Paused (1-Click)", "Click Resume in OmniScrape panel to continue.");
            await wait(60);
          }
          if (isScraperStopped) break;

          const cat = categoriesToCrawl[catIdx];
          updateScraperLockShield(
            `🌐 Category ${catIdx + 1}/${categoriesToCrawl.length}: "${cat.name}"`,
            `Extracting items from category "${cat.name}" into table…`
          );

          chrome.runtime.sendMessage({
            type: "EXTRACTION_PROGRESS",
            rows: allRows,
            pages: catIdx + 1,
            duplicates: duplicateCount,
            message: `Visiting Category ${catIdx + 1}/${categoriesToCrawl.length}: "${cat.name}"…`,
            latestItem: `Category: ${cat.name}`,
            paused: isScraperPaused,
          });

          try {
            let catBatch: Record<string, string>[] = [];
            const currentClean = window.location.href.split("#")[0].replace(/\/$/, "");
            const catClean = cat.url.split("#")[0].replace(/\/$/, "");
            const isCurrentPage = currentClean === catClean;

            let firstPageDoc: Document | null = null;
            if (isCurrentPage) {
              expandInlineReadMoreButtons(document);
              catBatch = extractRows(recipe, 100000);
              firstPageDoc = document;
            } else {
              const controller = new AbortController();
              const timer = setTimeout(() => controller.abort(), 7500);
              const res = await fetch(cat.url, { credentials: "same-origin", signal: controller.signal });
              clearTimeout(timer);
              if (res.ok) {
                const html = await res.text();
                const catDoc = new DOMParser().parseFromString(html, "text/html");
                catBatch = extractRows(recipe, 100000, catDoc);
                firstPageDoc = catDoc;
              }
            }

            // Tag Page 1 items with Category
            for (const row of catBatch) {
              row["Category"] = cat.name;
            }

            // If crawlAllPages is true, crawl subsequent pages of this category!
            if (pagination.crawlAllPages && firstPageDoc && !isScraperStopped) {
              let nextCatUrl: string | null = findNextPageUrlFromDoc(firstPageDoc, cat.url);
              let catPage = 2;
              const maxCatPages = pagination.maxPages > 1 ? pagination.maxPages : 500;

              while (nextCatUrl && catPage <= maxCatPages && !isScraperStopped) {
                while (isScraperPaused && !isScraperStopped) {
                  await wait(60);
                }
                if (isScraperStopped) break;

                try {
                  const controller = new AbortController();
                  const timer = setTimeout(() => controller.abort(), 7500);
                  const res = await fetch(nextCatUrl, { credentials: "same-origin", signal: controller.signal });
                  clearTimeout(timer);
                  if (!res.ok) break;

                  const html = await res.text();
                  const nextPageDoc = new DOMParser().parseFromString(html, "text/html");
                  const subBatch = extractRows(recipe, 100000, nextPageDoc);
                  if (subBatch.length === 0) break;

                  for (const r of subBatch) {
                    r["Category"] = cat.name;
                    catBatch.push(r);
                  }

                  chrome.runtime.sendMessage({
                    type: "EXTRACTION_PROGRESS",
                    rows: allRows.concat(catBatch),
                    pages: catIdx + 1,
                    duplicates: duplicateCount,
                    message: `Category "${cat.name}": Page ${catPage} loaded (${catBatch.length} items so far)…`,
                    latestItem: subBatch[0] ? subBatch[0]["Title"] || Object.values(subBatch[0])[0] : undefined,
                    paused: isScraperPaused,
                  });

                  nextCatUrl = findNextPageUrlFromDoc(nextPageDoc, nextCatUrl);
                  catPage++;
                } catch {
                  break;
                }
              }
            }

            // Deep detail extraction for this category's products if enabled
            if (pagination.deepScrape && catBatch.length > 0 && !isScraperStopped) {
              await runConcurrentPool(
                catBatch,
                14,
                async (row, idx) => {
                  if (isScraperStopped) return;
                  const link = findProductLink(row);
                  if (link) {
                    const detail = await extractDetailPageData(link);
                    Object.assign(row, detail);
                    row["Category"] = cat.name;

                    if (idx % 2 === 0 || idx === catBatch.length - 1) {
                      chrome.runtime.sendMessage({
                        type: "EXTRACTION_PROGRESS",
                        rows: allRows,
                        pages: catIdx + 1,
                        duplicates: duplicateCount,
                        message: `Deep visiting [${cat.name}] item ${idx + 1}/${catBatch.length}…`,
                        latestItem: row["Full Title"] || row["Title"] || Object.values(row)[0] || "",
                        paused: isScraperPaused,
                      });
                    }
                  }
                },
                () => isScraperPaused,
                () => isScraperStopped
              );
            }

            for (const row of catBatch) {
              const cleanRow = sanitizeSingleRowForML(row);
              const hash = Object.values(cleanRow).join("||");
              if (!hash.trim()) continue;
              if (seenRowHashes.has(hash)) {
                duplicateCount++;
              } else {
                seenRowHashes.add(hash);
                allRows.push(cleanRow);
              }
            }

            chrome.runtime.sendMessage({
              type: "EXTRACTION_PROGRESS",
              rows: allRows,
              pages: catIdx + 1,
              duplicates: duplicateCount,
              message: `Extracted ${catBatch.length} items from "${cat.name}". Unified Table: ${allRows.length} rows.`,
              latestItem: catBatch[0] ? catBatch[0]["Title"] || Object.values(catBatch[0])[0] : `Category: ${cat.name}`,
              paused: isScraperPaused,
            });
          } catch (catErr) {
            console.warn(`Error crawling category ${cat.name}:`, catErr);
          }
        }

        // Multi-category crawl completed
        return;
      }
    }

    // ==========================================
    // OPTION B: SINGLE / MULTI-PAGE BOUNDED EXTRACTION
    // ==========================================
    const currentCategory = inferCurrentCategoryName();

    // STEP 1: EXTRACT PAGE 1 FROM LIVE DOM FIRST (0ms delay)
    expandInlineReadMoreButtons(document);
    const page1Batch = extractRows(recipe, 100000);
    for (const row of page1Batch) {
      if (currentCategory && !row["Category"]) {
        row["Category"] = currentCategory;
      }
      const cleanRow = sanitizeSingleRowForML(row);
      const hash = Object.values(cleanRow).join("||");
      if (!hash.trim()) continue;
      if (!seenRowHashes.has(hash)) {
        seenRowHashes.add(hash);
        allRows.push(cleanRow);
      }
    }

    // Immediately show Page 1 items in UI grid
    const sampleItem = allRows[0] ? allRows[0]["Title"] || Object.values(allRows[0])[0] || "" : "";
    chrome.runtime.sendMessage({
      type: "EXTRACTION_PROGRESS",
      rows: allRows,
      pages: 1,
      duplicates: duplicateCount,
      message: `Extracted ${allRows.length.toLocaleString()} items from page 1! Crawling remaining pages…`,
      latestItem: sampleItem,
      paused: isScraperPaused,
    });

    // Deep product crawl for Page 1 if enabled
    if (pagination.deepScrape && page1Batch.length > 0 && !isScraperStopped) {
      updateScraperLockShield(
        `⚡ Visiting & Extracting Details… (${page1Batch.length} items)`,
        `Visiting each item link to extract complete specifications & descriptions…`
      );
      await runConcurrentPool(
        page1Batch,
        16,
        async (row, idx) => {
          if (isScraperStopped) return;
          const link = findProductLink(row);
          if (link) {
            const detail = await extractDetailPageData(link);
            Object.assign(row, detail);
            if (currentCategory && !row["Category"]) {
              row["Category"] = currentCategory;
            }
            const clean = sanitizeSingleRowForML(row);
            Object.keys(row).forEach((k) => delete row[k]);
            Object.assign(row, clean);

            if (idx % 2 === 0 || idx === page1Batch.length - 1) {
              chrome.runtime.sendMessage({
                type: "EXTRACTION_PROGRESS",
                rows: allRows,
                pages: 1,
                duplicates: duplicateCount,
                message: `Deep visiting & extracting item ${idx + 1} of ${page1Batch.length}…`,
                latestItem: row["Full Title"] || row["Title"] || Object.values(row)[0] || "",
                paused: isScraperPaused,
              });
            }
          }
        },
        () => isScraperPaused,
        () => isScraperStopped
      );
    }

    // Update Lock Shield after Page 1
    updateScraperLockShield(
      `⚡ Page 1 Extracted (${allRows.length.toLocaleString()} items captured)`,
      sampleItem ? `Captured: "${sampleItem.slice(0, 35)}…"` : "Continuing to crawl bounded pages…"
    );

    chrome.runtime.sendMessage({
      type: "EXTRACTION_PROGRESS",
      rows: allRows,
      pages: 1,
      duplicates: duplicateCount,
      message: `Extracted ${allRows.length.toLocaleString()} items from page 1! Crawling remaining pages…`,
      latestItem: sampleItem,
      paused: isScraperPaused,
    });

    if (isScraperStopped || pagination.crawlAllPages === false || pagination.mode === "none" || effectiveMaxPages <= 1) {
      return;
    }

    // STEP 2: HIGH-SPEED PARALLEL BATCH CRAWLER (IF URLS DISCOVERED)
    const warpPlan = detectWarpPaginationUrls();
    let usedWarp = false;

    if (warpPlan.isWarpCapable && pagination.mode !== "infinite-scroll" && !isScraperStopped) {
      const targetPages = Math.min(effectiveMaxPages, warpPlan.totalPages);
      const urlsToCrawl: { page: number; url: string }[] = [];

      if (warpPlan.generateUrl) {
        for (let p = 2; p <= targetPages; p++) {
          urlsToCrawl.push({ page: p, url: warpPlan.generateUrl(p) });
        }
      } else if (warpPlan.explicitUrls.length > 0) {
        warpPlan.explicitUrls.slice(0, targetPages - 1).forEach((url, idx) => {
          urlsToCrawl.push({ page: idx + 2, url });
        });
      }

      if (urlsToCrawl.length > 0) {
        let pagesCrawled = 1;
        let warpAddedRows = 0;

        await runConcurrentPool(
          urlsToCrawl,
          15,
          async (task) => {
            if (isScraperStopped) return;
            while (isScraperPaused && !isScraperStopped) {
              await wait(60);
            }
            if (isScraperStopped) return;

            try {
              const controller = new AbortController();
              const timer = setTimeout(() => controller.abort(), 6500);
              const res = await fetch(task.url, { credentials: "same-origin", signal: controller.signal });
              clearTimeout(timer);

              if (!res.ok) return;
              const html = await res.text();
              const doc = new DOMParser().parseFromString(html, "text/html");

              const batch = extractRows(recipe, 100000, doc);
              if (batch.length === 0) return;

              if (pagination.deepScrape) {
                await runConcurrentPool(
                  batch,
                  14,
                  async (row) => {
                    if (isScraperStopped) return;
                    const link = findProductLink(row);
                    if (link) {
                      const detail = await extractDetailPageData(link);
                      Object.assign(row, detail);
                      if (currentCategory && !row["Category"]) {
                        row["Category"] = currentCategory;
                      }
                    }
                  },
                  () => isScraperPaused,
                  () => isScraperStopped
                );
              }

              for (const row of batch) {
                if (currentCategory && !row["Category"]) {
                  row["Category"] = currentCategory;
                }
                const cleanRow = sanitizeSingleRowForML(row);
                const hash = Object.values(cleanRow).join("||");
                if (!hash.trim()) continue;
                if (seenRowHashes.has(hash)) {
                  duplicateCount++;
                } else {
                  seenRowHashes.add(hash);
                  allRows.push(cleanRow);
                  warpAddedRows++;
                }
              }

              pagesCrawled++;
              currentPage = pagesCrawled;

              updateScraperLockShield(
                `⚡ Warp Speed: ${allRows.length.toLocaleString()} Items Extracted`,
                `Processed Page ${task.page} (${pagesCrawled}/${targetPages} completed)`
              );

              chrome.runtime.sendMessage({
                type: "EXTRACTION_PROGRESS",
                rows: allRows,
                pages: pagesCrawled,
                duplicates: duplicateCount,
                message: `⚡ Warp Speed: ${allRows.length.toLocaleString()} rows captured across ${pagesCrawled} pages…`,
                latestItem: batch[0] ? batch[0]["Title"] || Object.values(batch[0])[0] : undefined,
                paused: isScraperPaused,
              });
            } catch {
              // ignore network interruption
            }
          },
          () => isScraperPaused,
          () => isScraperStopped
        );

        if (warpAddedRows > 0) {
          usedWarp = true;
        }
      }
    }

    // STEP 3: LIVE DOM CRAWLER (BOUNDED TO EXACT DETECTED PAGE COUNT)
    if (!usedWarp && !isScraperStopped) {
      while (currentPage < effectiveMaxPages && !isScraperStopped) {
        while (isScraperPaused && !isScraperStopped) {
          updateScraperLockShield("⏸️ Extraction Paused (1-Click)", "Click Resume in the OmniScrape panel to continue.");
          await wait(60);
        }
        if (isScraperStopped) break;

        let advanced = false;

        if (pagination.mode === "infinite-scroll") {
          const scrolled = await executeInfiniteScrollFast(recipe.selector, allRows.length, 50);
          advanced = scrolled;
        } else if (pagination.mode === "load-more") {
          const loadBtn = findLoadMoreControl(pagination.nextSelector);
          if (loadBtn) {
            await clickPaginationElementFast(loadBtn, recipe.selector, allRows.length, 60, () => isScraperStopped);
            advanced = true;
          } else {
            advanced = await executeInfiniteScrollFast(recipe.selector, allRows.length, 60);
          }
        } else if (pagination.mode === "next") {
          const nextBtn = findNextPageControl(pagination.nextSelector);
          if (nextBtn) {
            await clickPaginationElementFast(nextBtn, recipe.selector, allRows.length, 80, () => isScraperStopped);
            advanced = true;
          }
        }

        if (!advanced) {
          consecutiveNoNewData++;
          if (consecutiveNoNewData >= 2) break;
        } else {
          consecutiveNoNewData = 0;
        }

        if (isScraperStopped) break;
        while (isScraperPaused && !isScraperStopped) {
          updateScraperLockShield("⏸️ Extraction Paused (1-Click)", "Click Resume in the OmniScrape panel to continue.");
          await wait(50);
        }
        if (isScraperStopped) break;

        // Auto-expand any inline 'read more' or 'show more' specs before extracting rows
        expandInlineReadMoreButtons(document);
        // Extract newly loaded rows from DOM
        const currentBatch = extractRows(recipe, 100000);
        let newCount = 0;

        if (pagination.deepScrape && currentBatch.length > 0 && !isScraperStopped) {
          await runConcurrentPool(
            currentBatch,
            16,
            async (row) => {
              if (isScraperStopped) return;
              const link = findProductLink(row);
              if (link) {
                const detailData = await extractDetailPageData(link);
                Object.assign(row, detailData);
                if (currentCategory && !row["Category"]) {
                  row["Category"] = currentCategory;
                }
              }
            },
            () => isScraperPaused,
            () => isScraperStopped
          );
        }

        for (const row of currentBatch) {
          if (currentCategory && !row["Category"]) {
            row["Category"] = currentCategory;
          }
          const cleanRow = sanitizeSingleRowForML(row);
          const hash = Object.values(cleanRow).join("||");
          if (!hash.trim()) continue;
          if (seenRowHashes.has(hash)) {
            duplicateCount++;
          } else {
            seenRowHashes.add(hash);
            allRows.push(cleanRow);
            newCount++;
          }
        }

        currentPage++;

        updateScraperLockShield(
          `⚡ Scraping Page ${currentPage}/${effectiveMaxPages} (${allRows.length.toLocaleString()} items captured)`,
          `Crawl in progress… ${newCount} new items on this page.`
        );

        chrome.runtime.sendMessage({
          type: "EXTRACTION_PROGRESS",
          rows: allRows,
          pages: currentPage,
          duplicates: duplicateCount,
          message: `Extracted ${allRows.length.toLocaleString()} rows across ${currentPage}/${effectiveMaxPages} page(s)…`,
          latestItem: currentBatch[0] ? currentBatch[0]["Title"] || Object.values(currentBatch[0])[0] : undefined,
          paused: isScraperPaused,
        });

        if (newCount === 0 && !advanced) {
          break;
        }
      }
    }
  } catch (err) {
    console.error("Extraction error:", err);
  } finally {
    isScraperRunning = false;
    isScraperPaused = false;
    isScraperStopped = false;
    clearHighlights();
    hideScraperLockShield();

    chrome.runtime.sendMessage({
      type: "EXTRACTION_DONE",
      rows: allRows,
      message: `Extraction finished! Extracted ${allRows.length.toLocaleString()} rows across ${currentPage} page(s).`,
    });
  }
}

// Listen for messages from popup, sidepanel, or background
chrome.runtime.onMessage.addListener(
  (message: RequestMessage, _sender, sendResponse: (result: ResponseMessage) => void) => {
    (async () => {
      try {
        switch (message.type) {
          case "DISCOVER": {
            const pagination = autoDetectPagination();
            const categories = detectCategories();
            const rawCandidates = discoverCollections();
            const candidates = rawCandidates.map((c) => ({
              ...c,
              autoPagination: pagination,
              detectedCategories: categories,
            }));
            sendResponse({ ok: true, candidates });
            break;
          }

          case "EXTRACT_PREVIEW": {
            const limit = message.limit ?? 25;
            const rows = extractRows(message.recipe, limit);
            const curCat = inferCurrentCategoryName();
            if (curCat) {
              for (const r of rows) {
                if (!r["Category"]) r["Category"] = curCat;
              }
            }
            sendResponse({ ok: true, rows });
            break;
          }

          case "PICK_COLLECTION": {
            const candidate = await startInteractivePicker<CollectionCandidate>({
              bannerText: "Click on any repeated card or item on the page. Use ↑ / ↓ to adjust hierarchy.",
              onSelect: (el) => candidateFromElement(el),
            });
            if (candidate) {
              candidate.autoPagination = autoDetectPagination();
              candidate.detectedCategories = detectCategories();
            }
            sendResponse({ ok: true, selected: candidate });
            break;
          }

          case "PICK_PAGINATION_CONTROL": {
            const result = await startInteractivePicker<{ selector: string; text?: string }>({
              bannerText: "Click on the 'Next Page' or 'Load More' button.",
              onSelect: (el) => {
                const selector = getPaginationSelector(el);
                return { selector, text: el.innerText || el.textContent || "" };
              },
            });
            sendResponse({
              ok: true,
              paginationSelector: result.selector,
              text: result.text,
            });
            break;
          }

          case "HIGHLIGHT_COLLECTION": {
            if (message.selector) {
              const matched = Array.from(document.querySelectorAll(message.selector)).slice(0, 50);
              highlightElements(matched, "Detected Row");
              sendResponse({ ok: true, highlighted: true });
            } else {
              clearHighlights();
              sendResponse({ ok: true, highlighted: false });
            }
            break;
          }

          case "RUN_EXTRACTION": {
            void runExtractionLoop(message.recipe, message.pagination);
            sendResponse({ ok: true, started: true });
            break;
          }

          case "PAUSE_EXTRACTION": {
            isScraperPaused = true;
            updateScraperLockShield(
              "⏸️ Extraction Paused (1-Click)",
              "Click Resume in the OmniScrape panel to continue."
            );
            chrome.runtime.sendMessage({
              type: "EXTRACTION_PROGRESS",
              rows: currentLiveRows,
              pages: 1,
              duplicates: 0,
              message: "⏸️ Extraction Paused (1-click) - Click Resume to continue",
              paused: true,
            }).catch(() => {});
            sendResponse({ ok: true, paused: true });
            break;
          }

          case "RESUME_EXTRACTION": {
            isScraperPaused = false;
            updateScraperLockShield("⚡ OmniScrape Active", "Resumed extraction…");
            chrome.runtime.sendMessage({
              type: "EXTRACTION_PROGRESS",
              rows: currentLiveRows,
              pages: 1,
              duplicates: 0,
              message: "▶️ Resuming extraction…",
              paused: false,
            }).catch(() => {});
            sendResponse({ ok: true, resumed: true });
            break;
          }

          case "STOP_EXTRACTION": {
            isScraperStopped = true;
            isScraperRunning = false;
            isScraperPaused = false;
            clearHighlights();
            hideScraperLockShield();
            chrome.runtime.sendMessage({
              type: "EXTRACTION_DONE",
              rows: currentLiveRows,
              message: `Extraction stopped by user. Captured ${currentLiveRows.length.toLocaleString()} rows.`,
            }).catch(() => {});
            sendResponse({ ok: true, stopped: true });
            break;
          }

          default:
            break;
        }
      } catch (err) {
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : "Error executing content script command.",
        });
      }
    })();

    return true; // Keep channel open for async response
  }
);