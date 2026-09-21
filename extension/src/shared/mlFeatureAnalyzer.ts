/**
 * Machine Learning Feature Analyzer & Column Intelligence Engine:
 * Analyzes columns and extracted tabular records across any website to separate high-value,
 * predictive ML features (titles, prices, ratings, categories, brands, specs, descriptions)
 * from noisy, unusual, or non-informative artifacts (URLs, images, buttons, navigation junk).
 *
 * Prepares datasets directly for machine learning pipelines (pandas, scikit-learn, PyTorch, etc.).
 */

// Column names that represent non-informative, unusual or noisy metadata for ML models
const UNWANTED_NAME_REGEX = /^(link|href|url|uri|permalink|redirect|image|img|photo|picture|thumbnail|thumb|src|srcset|alt|icon|avatar|badge_img|button|action|cart|wishlist|share|modal|popup|dialog|close|dismiss|click)$/i;

const UNWANTED_SUBSTRING_REGEX = /(link|href|url|image|img|thumbnail|photo|picture|srcset|data-src|icon|btn|button)/i;

// Text patterns for common website action buttons, navigation artifacts, and boilerplate
const ACTION_BOILERPLATE_REGEX = /^(add\s+to\s+cart|buy\s+now|buy\s+it\s+now|add\s+to\s+wishlist|quick\s+view|quick\s+look|compare|select\s+options|see\s+details|view\s+details|view\s+product|view\s+item|read\s+more|show\s+more|learn\s+more|click\s+here|share|save|close|next|prev|previous|›|»|★|♥|\+[\s]*more|\d+\s*colors?)$/i;

// Regex to detect raw URLs, file paths, or base64 blobs
const URL_VALUE_REGEX = /^(https?:\/\/|\/\/|data:image\/|blob:|\/catalogue\/|\/product\/|\/item\/|\/[a-z0-9_-]+\/[a-z0-9_-]+)/i;

/**
 * Checks if a specific column is unwanted for Machine Learning modeling.
 */
export function isUnwantedColumn(columnName: string, sampleValues: string[] = []): boolean {
  const cleanName = columnName.trim();
  const lowerName = cleanName.toLowerCase();

  // Internal scraper tracking keys (e.g. _detail_url)
  if (cleanName.startsWith("_") || cleanName.startsWith("__")) {
    return true;
  }

  // Exact unwanted name match (e.g. "Link", "Image", "href", "src")
  if (UNWANTED_NAME_REGEX.test(cleanName)) {
    return true;
  }

  // Substring matches for obvious image or URL columns
  if (
    lowerName.includes("image") ||
    lowerName.includes("img") ||
    lowerName.includes("thumbnail") ||
    lowerName === "src" ||
    lowerName === "alt" ||
    lowerName === "href" ||
    lowerName === "url" ||
    lowerName.endsWith(" url") ||
    lowerName.endsWith("_url") ||
    lowerName.endsWith(" link") ||
    lowerName.endsWith("_link")
  ) {
    return true;
  }

  // If sample values are provided, inspect distribution
  if (sampleValues.length > 0) {
    let urlCount = 0;
    let actionCount = 0;
    let emptyCount = 0;

    for (const val of sampleValues) {
      const v = (val || "").trim();
      if (!v) {
        emptyCount++;
      } else if (URL_VALUE_REGEX.test(v) || /\.(png|jpe?g|gif|svg|webp)(\?|$)/i.test(v)) {
        urlCount++;
      } else if (ACTION_BOILERPLATE_REGEX.test(v)) {
        actionCount++;
      }
    }

    const total = sampleValues.length;
    // If 100% of values are empty
    if (emptyCount === total) return true;
    // If more than 40% of values are raw URLs or file paths
    if (urlCount / total > 0.4) return true;
    // If more than 50% of values are action buttons / boilerplate
    if (actionCount / total > 0.5) return true;
  }

  return false;
}

/**
 * Normalizes and cleans an individual field value for ML models.
 */
export function cleanMlValue(key: string, val: string | null | undefined): string {
  if (val === null || val === undefined) return "";
  let clean = String(val).replace(/\s+/g, " ").trim();

  // If the value itself is a raw URL or image path, reject it
  if (URL_VALUE_REGEX.test(clean) || /\.(png|jpe?g|gif|svg|webp)(\?|$)/i.test(clean)) {
    return "";
  }

  // Remove trailing boilerplate colons
  clean = clean.replace(/^[•\-–—►▶\s]+|[•\-–—►▶\s]+$/g, "").trim();

  const lowerKey = key.toLowerCase();

  // Price formatting: clean numeric value with currency intact
  if (lowerKey.includes("price") || lowerKey.includes("cost") || lowerKey === "msrp") {
    // Check if price text has extra words like "Price: $19.99 Incl. Tax"
    const priceMatch = clean.match(/([$€£¥₹元]|usd|eur|gbp|inr)?\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{1,2})?|\.[0-9]{1,2})/i);
    if (priceMatch) {
      const symbol = priceMatch[1] || "";
      const num = priceMatch[2];
      clean = symbol ? `${symbol}${num}` : num;
    }
  }

  // Rating formatting: e.g. "4.8 out of 5 stars" -> "4.8"
  if (lowerKey.includes("rating") || lowerKey.includes("score")) {
    const starMatch = clean.match(/([0-5](?:\.[0-9]+)?)\s*(?:out of|\/|\s*stars?)/i);
    if (starMatch) {
      clean = starMatch[1];
    } else {
      const numOnly = clean.match(/^[0-5](?:\.[0-9]+)?$/);
      if (numOnly) clean = numOnly[0];
    }
  }

  // Reviews count formatting: e.g. "(1,234 customer ratings)" -> "1234"
  if (lowerKey.includes("review") || lowerKey.includes("ratings count")) {
    const countMatch = clean.match(/([0-9,]+)/);
    if (countMatch && !lowerKey.includes("description")) {
      clean = countMatch[1].replace(/,/g, "");
    }
  }

  return clean;
}

/**
 * Evaluates semantic priority for an ML feature column so datasets are structured
 * intuitively for training, analysis, and feature engineering.
 */
function getColumnPriority(name: string): number {
  const n = name.toLowerCase();

  if (n === "title" || n === "full title" || n === "name" || n === "product name") return 100;
  if (n === "category" || n === "department" || n === "subcategory") return 95;
  if (n === "brand" || n === "manufacturer" || n === "seller") return 90;
  if (n === "price" || n === "current price") return 85;
  if (n === "original price" || n === "was price" || n === "list price") return 80;
  if (n === "discount") return 78;
  if (n === "rating" || n === "stars" || n === "score") return 75;
  if (n === "reviews" || n === "review count" || n === "ratings count") return 70;
  if (n === "availability" || n === "stock" || n === "stock status") return 65;
  if (n === "sku" || n === "sku / model" || n === "model" || n === "item number" || n === "asin") return 60;
  if (n === "key features" || n === "highlights") return 55;
  if (n === "specifications" || n === "specs") return 50;
  if (n === "full description" || n === "description" || n === "overview") return 45;
  if (n === "date" || n === "published date" || n === "created at") return 40;

  return 30;
}

/**
 * Intelligent Dataset Sanitizer & ML Column Analyzer:
 * Takes raw extracted records from any website, removes noise (links, images, action buttons),
 * cleans cell values, and formats columns ready for Machine Learning models.
 */
export function sanitizeDatasetForML(rows: Record<string, string>[]): Record<string, string>[] {
  if (rows.length === 0) return [];

  // Step 1: Collect all distinct column names
  const allColumns = new Set<string>();
  for (const row of rows) {
    for (const k of Object.keys(row)) {
      allColumns.add(k);
    }
  }

  // Step 2: Analyze each column across all rows to determine if it should be kept
  const validColumns: string[] = [];

  for (const col of allColumns) {
    const sampleVals = rows.map((r) => r[col]).filter((v) => v !== undefined && v !== null);
    if (!isUnwantedColumn(col, sampleVals)) {
      // Check if column has at least one non-empty value in the entire dataset
      const hasContent = sampleVals.some((v) => (v || "").trim().length > 0);
      if (hasContent) {
        validColumns.push(col);
      }
    }
  }

  // Step 3: Sort valid columns by semantic ML feature priority
  validColumns.sort((a, b) => getColumnPriority(b) - getColumnPriority(a));

  // Step 4: Build sanitized rows containing ONLY the valid ML features
  const cleanRows: Record<string, string>[] = [];

  for (const row of rows) {
    const cleanRow: Record<string, string> = {};
    let hasAnyData = false;

    for (const col of validColumns) {
      const rawVal = row[col];
      const cleaned = cleanMlValue(col, rawVal);
      cleanRow[col] = cleaned;
      if (cleaned) hasAnyData = true;
    }

    if (hasAnyData) {
      cleanRows.push(cleanRow);
    }
  }

  return cleanRows;
}

/**
 * Sanitizes a single row object for live streaming or storage,
 * stripping internal link/image noise while keeping product data pristine.
 */
export function sanitizeSingleRowForML(row: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [k, v] of Object.entries(row)) {
    if (isUnwantedColumn(k, [v])) continue;
    const clean = cleanMlValue(k, v);
    if (clean) {
      result[k] = clean;
    }
  }

  return result;
}
