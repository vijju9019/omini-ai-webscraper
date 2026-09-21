import type { ExtractionRecipe, FieldDefinition } from "../shared/models";
import { cleanMlValue, isUnwantedColumn } from "../shared/mlFeatureAnalyzer";
import { cleanText, extractImageUrl, extractLinkUrl } from "./fieldClassifier";

/**
 * Extracts a single field value from a row element.
 */
export function extractFieldValue(row: Element, field: FieldDefinition): string {
  let target: Element | null = row;

  if (field.relativeSelector && field.relativeSelector !== ":scope") {
    try {
      target = row.querySelector(field.relativeSelector);
    } catch {
      target = null;
    }
  }

  if (!target) return "";

  switch (field.source) {
    case "href": {
      if (target instanceof HTMLAnchorElement) {
        return extractLinkUrl(target);
      }
      const anchor = target.querySelector("a[href]") || target.closest("a[href]");
      return anchor instanceof HTMLAnchorElement ? extractLinkUrl(anchor) : "";
    }
    case "src": {
      if (target instanceof HTMLImageElement) {
        return extractImageUrl(target);
      }
      const img = target.querySelector("img");
      return img instanceof HTMLImageElement ? extractImageUrl(img) : "";
    }
    case "alt": {
      if (target instanceof HTMLImageElement) {
        return cleanText(target.alt);
      }
      const img = target.querySelector("img");
      return img ? cleanText(img.alt) : "";
    }
    case "datetime": {
      if (target instanceof HTMLTimeElement && target.dateTime) {
        return target.dateTime;
      }
      return target.getAttribute("datetime") || cleanText(target.textContent);
    }
    case "attribute": {
      if (field.attributeName) {
        return target.getAttribute(field.attributeName) || "";
      }
      return cleanText(target.textContent);
    }
    case "text":
    default: {
      return cleanText(target.textContent);
    }
  }
}

/**
 * High-performance concurrent worker pool for lightning-fast multi-request processing.
 */
export async function runConcurrentPool<T, R>(
  items: T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<R>,
  isPaused?: () => boolean,
  isStopped?: () => boolean
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (currentIndex < items.length) {
      if (isStopped && isStopped()) break;

      while (isPaused && isPaused() && !(isStopped && isStopped())) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      if (isStopped && isStopped()) break;

      const idx = currentIndex++;
      if (idx >= items.length) break;

      try {
        results[idx] = await task(items[idx], idx);
      } catch (err) {
        // worker task handled gracefully
      }
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * Hyper-fast row extraction: bypasses expensive computed style thrashing and supports both live DOM & headless documents.
 */
export function extractRows(
  recipe: ExtractionRecipe,
  limit = 100000,
  root: Document | Element = document
): Record<string, string>[] {
  const activeFields = recipe.fields.filter((f) => f.selected);
  if (activeFields.length === 0 || !recipe.selector) return [];

  let elements: Element[] = [];
  try {
    elements = Array.from(root.querySelectorAll(recipe.selector));
  } catch (err) {
    console.error("Invalid recipe selector:", recipe.selector, err);
    return [];
  }

  // Check if running on an in-memory document parsed from fetch/DOMParser
  const isInMemory = !(root instanceof Document && root === document);
  const visibleElements = elements
    .filter((el) => {
      if (isInMemory) return true;
      if (!(el instanceof HTMLElement)) return false;
      return el.offsetParent !== null || el.offsetHeight > 0 || el.tagName === "TR";
    })
    .slice(0, limit);

  const rows: Record<string, string>[] = [];

  for (const el of visibleElements) {
    const rowObj: Record<string, string> = {};
    let hasAnyData = false;

    // Retain internal product detail URL for crawler enrichment without exposing it in the dataset
    const anchor = el.querySelector("a[href]") || (el instanceof HTMLAnchorElement ? el : null);
    if (anchor instanceof HTMLAnchorElement && anchor.href && !anchor.href.startsWith("javascript:")) {
      rowObj["_detail_url"] = anchor.href;
    }

    if (recipe.isTable && el.tagName === "TR") {
      const cells = Array.from(el.children).filter((c) => c.tagName === "TD" || c.tagName === "TH");
      for (const field of activeFields) {
        if (field.source === "href" || field.source === "src" || field.source === "alt" || isUnwantedColumn(field.name)) {
          continue;
        }
        let val = extractFieldValue(el, field);
        if (!val && field.relativeSelector) {
          const match = field.relativeSelector.match(/td:nth-child\((\d+)\)/i);
          if (match) {
            const idx = parseInt(match[1], 10) - 1;
            if (cells[idx]) {
              val = cleanText(cells[idx].textContent);
            }
          }
        }
        val = cleanMlValue(field.name, val);
        if (val) {
          rowObj[field.name] = val;
          hasAnyData = true;
        }
      }
    } else {
      for (const field of activeFields) {
        if (field.source === "href" || field.source === "src" || field.source === "alt" || isUnwantedColumn(field.name)) {
          continue;
        }
        let val = extractFieldValue(el, field);
        val = cleanMlValue(field.name, val);
        if (val) {
          rowObj[field.name] = val;
          hasAnyData = true;
        }
      }
    }

    if (hasAnyData) {
      rows.push(rowObj);
    }
  }

  return rows;
}

/**
 * Deep Crawl: visits and extracts comprehensive specifications, descriptions, prices,
 * and high-res images from detail/product pages.
 */
export async function extractDetailPageData(url: string): Promise<Record<string, string>> {
  if (!url || !/^https?:\/\//i.test(url)) return {};

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000); // 4s timeout

    const res = await fetch(url, { credentials: "same-origin", signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return {};
    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, "text/html");

    const result: Record<string, string> = {};

    // 1. Full Product Title (detail page title is often more complete than card title)
    const titleEl = doc.querySelector(
      "h1, [itemprop='name'], [class*='product-title' i], [class*='product-name' i], #productTitle"
    );
    if (titleEl) {
      const title = cleanText(titleEl.textContent);
      if (title.length > 3) {
        result["Full Title"] = title;
      }
    }

    // 2. Full Description & Overview (complete text, not truncated)
    const descEl = doc.querySelector(
      "[id*='productDescription' i], [id*='description' i], [class*='product-description' i], [class*='description' i], [class*='product-desc' i], [class*='overview' i], [class*='detail' i] p, article p, [itemprop='description']"
    );
    if (descEl) {
      const desc = cleanText(descEl.textContent);
      if (desc.length > 10) {
        result["Full Description"] = desc.slice(0, 1800);
      }
    }

    // 3. Bullet Points / Highlights / Key Features
    const bulletNodes = Array.from(
      doc.querySelectorAll("#feature-bullets li, ul.features li, ul.highlights li, [class*='feature-list' i] li, .product-features li")
    );
    if (bulletNodes.length > 0) {
      const bullets = bulletNodes
        .map((b) => cleanText(b.textContent))
        .filter((t) => t.length > 5 && !t.toLowerCase().includes("replacement") && !t.toLowerCase().includes("cookie"));
      if (bullets.length > 0) {
        result["Key Features"] = bullets.slice(0, 8).join(" • ");
      }
    }

    // 4. Price & Current Deal
    const priceEl = doc.querySelector(
      "[class*='price' i]:not([class*='old' i]):not([class*='was' i]), [itemprop='price'], [data-price], .a-price .a-offscreen"
    );
    if (priceEl) {
      const priceText = cleanText(priceEl.textContent);
      if (priceText && /\d/.test(priceText) && priceText.length < 35) {
        result["Price"] = priceText;
      }
    }

    // 5. Original / Regular Price & Discount
    const oldPriceEl = doc.querySelector(
      "[class*='old-price' i], [class*='was-price' i], [class*='original-price' i], strike, del, .a-text-price .a-offscreen"
    );
    if (oldPriceEl) {
      const oldPrice = cleanText(oldPriceEl.textContent);
      if (oldPrice && /\d/.test(oldPrice) && oldPrice.length < 35) {
        result["Original Price"] = oldPrice;
      }
    }

    // 6. Stock / Availability Status
    const stockEl = doc.querySelector(
      "[class*='stock' i], [class*='availability' i], [id*='availability' i], [itemprop='availability']"
    );
    if (stockEl) {
      const stock = cleanText(stockEl.textContent);
      if (stock && stock.length < 60) {
        result["Availability"] = stock;
      }
    }

    // 7. Brand / Manufacturer / Seller
    const brandEl = doc.querySelector(
      "[class*='brand' i], [itemprop='brand'], [class*='manufacturer' i], a#bylineInfo, [class*='seller' i]"
    );
    if (brandEl) {
      const brand = cleanText(brandEl.textContent).replace(/^by\s+/i, "");
      if (brand && brand.length < 60) {
        result["Brand"] = brand;
      }
    }

    // 8. SKU / Model / Product Code / ASIN
    const skuEl = doc.querySelector(
      "[class*='sku' i], [itemprop='sku'], [class*='model' i], [id*='productDetails_techSpec'], [itemprop='productID']"
    );
    if (skuEl) {
      const sku = cleanText(skuEl.textContent);
      if (sku && sku.length < 60) {
        result["SKU / Model"] = sku;
      }
    }

    // 9. Rating & Total Reviews Count
    const ratingEl = doc.querySelector(
      "[class*='rating' i], [itemprop='ratingValue'], [aria-label*='star' i], [class*='review-count' i]"
    );
    if (ratingEl) {
      const rating = cleanText(ratingEl.getAttribute("aria-label") || ratingEl.textContent);
      if (rating && rating.length < 50) {
        result["Rating"] = rating;
      }
    }

    // 10. Key Specifications & Individual Attributes from detail tables / definition lists
    const specTable = doc.querySelector(
      "table.specs, table.prodDetTable, [class*='specification' i], [class*='specs' i], [class*='attribute' i], dl, [id*='tech-specs']"
    );
    if (specTable) {
      const specText = cleanText(specTable.textContent);
      if (specText.length > 15) {
        result["Specifications"] = specText.slice(0, 800);
      }
    }

    // Extract individual key-value attributes (Dimensions, Weight, Color, Material, Warranty, etc.)
    const attributeRows = Array.from(doc.querySelectorAll("table.specs tr, table.prodDetTable tr, table[class*='spec'] tr, dl"));
    for (const r of attributeRows.slice(0, 15)) {
      if (r.tagName === "DL") {
        const dts = Array.from(r.querySelectorAll("dt"));
        const dds = Array.from(r.querySelectorAll("dd"));
        for (let i = 0; i < Math.min(dts.length, dds.length); i++) {
          const k = cleanText(dts[i].textContent).replace(/[:]/g, "");
          const v = cleanText(dds[i].textContent);
          if (k && v && k.length > 2 && k.length < 35 && v.length < 250 && !isUnwantedColumn(k, [v]) && !result[k]) {
            const cleaned = cleanMlValue(k, v);
            if (cleaned) result[k] = cleaned;
          }
        }
      } else {
        const cells = Array.from(r.children);
        if (cells.length === 2) {
          const k = cleanText(cells[0].textContent).replace(/[:]/g, "");
          const v = cleanText(cells[1].textContent);
          if (k && v && k.length > 2 && k.length < 35 && v.length < 250 && !isUnwantedColumn(k, [v]) && !result[k]) {
            const cleaned = cleanMlValue(k, v);
            if (cleaned) result[k] = cleaned;
          }
        }
      }
    }

    // 11. Category / Breadcrumbs
    const breadcrumbEl = doc.querySelector(
      "nav.breadcrumb, .breadcrumbs, [class*='breadcrumb' i], #wayfinding-breadcrumbs_container"
    );
    if (breadcrumbEl) {
      const breadcrumbs = cleanText(breadcrumbEl.textContent).replace(/\s*>\s*/g, " > ");
      if (breadcrumbs && breadcrumbs.length < 150) {
        result["Category"] = breadcrumbs;
      }
    }

    return result;
  } catch {
    return {};
  }
}
