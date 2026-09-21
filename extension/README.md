# WebScraper Pro: Structured Web Scraping Extension (Manifest V3)

A developer-grade Chrome Manifest V3 browser extension built with **React 19**, **TypeScript**, and **Vite** (`@crxjs/vite-plugin`). It automatically detects repeated and structured data on any webpage, classifies semantic fields (titles, links, prices, images, dates), allows interactive field selection and custom column definitions, displays real-time live preview grids, handles complex pagination and dynamic content, and exports to CSV (UTF-8 BOM), Excel XLSX, JSON, and Clipboard (TSV).

---

## Key Features

1. **Automatic Repeated Pattern & Table Detection**:
   - Sibling clustering algorithm grouping elements by DOM depth, tag structure, and CSS class token similarity.
   - Dedicated table parser for standard `<table>`, `thead`, and `tbody > tr` elements.
   - Interactive Point-and-Click Picker with visual outline, hover badges, and `ArrowUp` / `ArrowDown` hierarchy navigation.

2. **Automatic Semantic Field Identification**:
   - Resilient relative CSS selectors (e.g. `h2.title`, `.price`, `a.detail-link`, `img.thumbnail`, `time`).
   - Intelligent attribute extraction:
     - Full normalized URLs (`href`)
     - High-res images (`src`, `srcset`, `data-src`, `data-lazy-src`, `data-original`)
     - Image `alt` text
     - ISO timestamps (`datetime`)
     - Clean text
   - Semantic naming heuristics identifying titles, prices, ratings, dates, authors, badges, and descriptions.

3. **Interactive Field Editor**:
   - Checkboxes to include or exclude columns.
   - In-place renaming of columns.
   - Extraction source dropdown (`text`, `href`, `src`, `alt`, `datetime`).
   - "Add Custom Field" via CSS selectors or custom names.

4. **Multi-Strategy Pagination & Dynamic Content**:
   - **Next Page Button**: Auto-detects `rel="next"`, "Next", "Older", "›", or lets you click the button with the visual picker.
   - **Load More Button**: Auto-clicks "Load More" / "View More" until disabled or target reached.
   - **Infinite Scroll**: Smooth simulated scrolling stimulating IntersectionObservers and dynamic lazy loading.
   - **Dynamic Settling**: Built-in `MutationObserver` debouncer ensuring asynchronous AJAX/GraphQL updates finish rendering before scraping the next batch.
   - Loop protection & de-duplication hashing.

5. **Multi-Format Export**:
   - **CSV**: RFC-4180 compliant with UTF-8 BOM (`\ufeff`) for seamless opening in Excel and Google Sheets without encoding corruptions.
   - **Excel (XLSX)**: Native workbook with auto-fitted column widths.
   - **JSON**: Formatted JSON with crawl metadata.
   - **Clipboard (TSV)**: Instant tab-separated values ready for pasting directly into Google Sheets or spreadsheets.

6. **Modern Side Panel UI**:
   - Hosted in the Chrome Side Panel alongside the target website.
   - Built with modern dark-slate aesthetics, stepped guided navigation, real-time counters, and live preview data tables.

---

## Installation & Development

### 1. Build the Extension

```powershell
cd "c:\Users\Lenovo\Desktop\offline application\web-scraper-extension"
npm run build
```

### 2. Load into Chrome

1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **Developer mode** in the top-right corner.
3. Click **Load unpacked**.
4. Select the `dist` directory:
   `c:\Users\Lenovo\Desktop\offline application\web-scraper-extension\dist`

### 3. How to Use

1. Navigate to any website containing list items, e-commerce products, search results, or tables (e.g. Amazon, GitHub repositories, Hacker News, Wikipedia).
2. Click the **WebScraper Pro** icon in the Chrome toolbar.
3. Click **Open Scraper Side Panel** (or click the Side Panel icon in Chrome's top bar and select WebScraper Pro).
4. Click **Detect** to auto-scan the page, or click **Pick Item** to click on any card directly.
5. In **Fields**, customize columns, rename headers, or add custom fields.
6. In **Pagination**, choose your pagination mode (Next Button, Load More, Infinite Scroll) and configure page limits.
7. Click **Start Extraction** to crawl and watch live rows populate the preview table.
8. Click **CSV**, **Excel**, **JSON**, or **Copy (TSV)** to export your data!