/**
 * OmniScrape AI - Autonomous Multi-Website / Batch Scraping Engine
 * 
 * Usage:
 *   node scripts/scrape.js <url1> <url2> ... <urlN>
 *   node scripts/scrape.js --urls="https://example.com,https://site2.com"
 *   node scripts/scrape.js --file="urls.txt"
 * 
 * Features:
 *   - Visits 1 to N websites in automated headless Chromium/Edge sessions
 *   - Auto-detects repeating item clusters, tables, and product cards
 *   - Normalizes columns (Title, Price, URL, Image, Category, Description)
 *   - Automatically creates both .xlsx (Excel) and .csv (RFC-4180 BOM) files
 *   - Generates merged .xlsx and .csv when N >= 2 websites are processed
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { saveDatasets } = require('./excel-writer');

const CDP_PORT = 9335;
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA_DIR = path.join(__dirname, '..', '.edge-batch-scraper-profile');
const EXPORT_DIR = path.join(__dirname, '..', 'exports');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function sanitizeFilename(str) {
  return str
    .replace(/^https?:\/\//i, '')
    .replace(/[^a-z0-9_-]/gi, '_')
    .toLowerCase()
    .slice(0, 40)
    .replace(/_+$/, '') || 'scraped_site';
}

function normalizeUrl(input) {
  let url = input.trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) {
    // If localhost, default to http
    if (url.startsWith('localhost') || url.startsWith('127.0.0.1')) {
      url = 'http://' + url;
    } else {
      url = 'https://' + url;
    }
  }
  return url;
}

function getTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// In-page extraction script passed to browser
const IN_PAGE_EXTRACTOR = `
(() => {
  // 1. Table Detection
  const tables = Array.from(document.querySelectorAll('table')).filter(t => t.offsetParent !== null || t.offsetWidth > 0);
  for (const table of tables) {
    const rows = Array.from(table.querySelectorAll('tr')).filter(r => r.offsetParent !== null || r.offsetHeight > 0);
    if (rows.length >= 3) {
      const headers = [];
      const ths = table.querySelectorAll('th');
      if (ths.length > 0) {
        ths.forEach((th, i) => headers.push(th.textContent.trim().replace(/\\s+/g, ' ') || 'Col_' + (i + 1)));
      } else {
        const firstRowCells = rows[0].querySelectorAll('td');
        firstRowCells.forEach((td, i) => headers.push('Col_' + (i + 1)));
      }
      const dataRows = [];
      const startIdx = ths.length > 0 ? 0 : 1;
      for (let i = startIdx; i < Math.min(rows.length, 100); i++) {
        const cells = rows[i].querySelectorAll('td');
        if (cells.length === 0) continue;
        const rowObj = {};
        cells.forEach((cell, cIdx) => {
          const colName = headers[cIdx] || ('Col_' + (cIdx + 1));
          rowObj[colName] = cell.textContent.trim().replace(/\\s+/g, ' ');
        });
        if (Object.keys(rowObj).length > 0) dataRows.push(rowObj);
      }
      if (dataRows.length >= 2) return { mode: 'table', records: dataRows };
    }
  }

  // 2. DOM Sibling Clustering
  const ignoredTags = new Set(['SCRIPT', 'STYLE', 'SVG', 'NAV', 'HEADER', 'FOOTER', 'NOSCRIPT', 'IFRAME', 'BUTTON']);
  const allElements = Array.from(document.body.querySelectorAll('*'));
  const clusters = new Map();

  for (const el of allElements) {
    if (ignoredTags.has(el.tagName)) continue;
    const parent = el.parentElement;
    if (!parent || ignoredTags.has(parent.tagName)) continue;

    const rect = el.getBoundingClientRect();
    if (rect.width < 60 || rect.height < 25) continue;

    const classTokens = Array.from(el.classList).slice(0, 2).sort().join('.');
    const sig = el.tagName + ':' + classTokens;

    if (!clusters.has(parent)) clusters.set(parent, new Map());
    const parentMap = clusters.get(parent);
    if (!parentMap.has(sig)) parentMap.set(sig, []);
    parentMap.get(sig).push(el);
  }

  let bestItems = [];
  let bestScore = 0;

  for (const [parent, sigMap] of clusters.entries()) {
    for (const [sig, items] of sigMap.entries()) {
      if (items.length < 2) continue;

      let totalTextLength = 0;
      let interactiveBonus = 0;
      for (const item of items) {
        const txt = item.textContent.trim();
        totalTextLength += txt.length;
        if (item.querySelector('a[href]') || item.tagName === 'A') interactiveBonus++;
        if (item.querySelector('img')) interactiveBonus++;
      }
      const avgText = totalTextLength / items.length;
      if (avgText < 15) continue;

      const score = items.length * Math.log2(avgText + 1) * (interactiveBonus > 0 ? 1.6 : 1.0);
      if (score > bestScore) {
        bestScore = score;
        bestItems = items;
      }
    }
  }

  if (bestItems.length === 0) return { mode: 'none', records: [] };

  // 3. Extract attributes from each card/item
  const records = [];
  for (let idx = 0; idx < Math.min(bestItems.length, 100); idx++) {
    const item = bestItems[idx];
    const record = {};

    // Title / Main Heading
    const titleEl = item.querySelector('h1, h2, h3, h4, h5, [class*="title" i], [class*="heading" i], [class*="name" i], strong') || item.querySelector('a');
    if (titleEl) {
      record['Title'] = titleEl.textContent.trim().replace(/\\s+/g, ' ');
    } else {
      record['Title'] = item.textContent.trim().slice(0, 90).replace(/\\s+/g, ' ');
    }

    // Price / Numeric Value
    const priceEl = item.querySelector('[class*="price" i], [class*="cost" i], [class*="salary" i], [class*="amount" i]');
    if (priceEl) {
      record['Price'] = priceEl.textContent.trim().replace(/\\s+/g, ' ');
    } else {
      const match = item.textContent.match(/([$€£¥₹]\\s*[\\d,]+(\\.\\d+)?|\\b\\d+([,.]\\d{2})?\\s*(USD|EUR|GBP|INR)\\b)/i);
      if (match) record['Price'] = match[0].trim();
    }

    // Target Link URL
    const anchor = item.tagName === 'A' ? item : item.querySelector('a[href]');
    if (anchor && anchor.href && !anchor.href.startsWith('javascript:')) {
      record['URL'] = anchor.href;
    }

    // Image URL
    const img = item.querySelector('img[src], img[data-src]');
    if (img) {
      const src = img.getAttribute('data-src') || img.src;
      if (src && !src.startsWith('data:image')) {
        record['Image_URL'] = src;
      }
    }

    // Category / Tag / Badge
    const tagEl = item.querySelector('[class*="tag" i], [class*="badge" i], [class*="category" i], [class*="type" i], [class*="label" i]');
    if (tagEl && tagEl !== titleEl) {
      record['Category'] = tagEl.textContent.trim().replace(/\\s+/g, ' ');
    }

    // Description / Summary
    const descEl = item.querySelector('p, [class*="desc" i], [class*="summary" i], [class*="detail" i]');
    if (descEl && descEl !== titleEl) {
      record['Description'] = descEl.textContent.trim().slice(0, 180).replace(/\\s+/g, ' ');
    }

    // Metadata / Stock / Location
    const metaEl = item.querySelector('[class*="meta" i], [class*="loc" i], [class*="city" i], [class*="stock" i], [class*="avail" i]');
    if (metaEl && metaEl !== titleEl && metaEl !== descEl && metaEl !== tagEl) {
      record['Metadata'] = metaEl.textContent.trim().replace(/\\s+/g, ' ');
    }

    records.push(record);
  }

  return { mode: 'cluster', records };
})()
`;

// Simple CDP Client
class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.msgId = 1;
    this.callbacks = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.callbacks.has(msg.id)) {
          const { res, rej } = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) rej(new Error(msg.error.message));
          else res(msg.result);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.msgId++;
      this.callbacks.set(id, { res: resolve, rej: reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
    }
  }
}

async function scrapeSingleUrl(cdp, url) {
  console.log(`\n============================================================`);
  console.log(`🌐 [Visiting Target]: ${url}`);
  console.log(`============================================================`);

  // Navigate to URL
  await cdp.send('Page.navigate', { url });

  // Wait for initial DOM settlement
  await sleep(2500);

  // Auto-scroll to trigger lazy loading / IntersectionObservers
  await cdp.send('Runtime.evaluate', {
    expression: 'window.scrollTo(0, document.body.scrollHeight / 2);'
  });
  await sleep(600);
  await cdp.send('Runtime.evaluate', {
    expression: 'window.scrollTo(0, 0);'
  });
  await sleep(400);

  // Execute extraction in page context
  const evalResult = await cdp.send('Runtime.evaluate', {
    expression: IN_PAGE_EXTRACTOR,
    returnByValue: true
  });

  const data = evalResult?.result?.value;
  if (!data || !data.records || data.records.length === 0) {
    console.log(`⚠️  No repeating items or tables detected on ${url}`);
    return [];
  }

  console.log(`✅ Extracted ${data.records.length} items using [${data.mode.toUpperCase()}] pattern.`);
  return data.records;
}

async function runBatchScraper(urls) {
  console.log(`\n============================================================`);
  console.log(`⚡ OmniScrape AI - Batch Scraping Engine Initialized`);
  console.log(`🎯 Targets Queue: ${urls.length} website(s)`);
  urls.forEach((u, idx) => console.log(`   ${idx + 1}. ${u}`));
  console.log(`============================================================\n`);

  // Launch Headless Edge
  const edgeArgs = [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-features=RendererCodeIntegrity',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-sync',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${USER_DATA_DIR}`,
    'about:blank'
  ];

  const edgeProc = spawn(EDGE_PATH, edgeArgs, { stdio: 'ignore' });

  // Connect to CDP
  let wsUrl = null;
  for (let i = 0; i < 30; i++) {
    await sleep(400);
    try {
      const listRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
      const list = await listRes.json();
      const pageTarget = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
      if (pageTarget) {
        wsUrl = pageTarget.webSocketDebuggerUrl;
        break;
      }
    } catch (e) {}
  }

  if (!wsUrl) {
    edgeProc.kill();
    throw new Error(`Failed to bind to Edge CDP on port ${CDP_PORT}`);
  }

  const cdp = new CDPClient(wsUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('DOM.enable');

  const timestamp = getTimestamp();
  const summaryResults = [];
  const allMergedRecords = [];

  for (let i = 0; i < urls.length; i++) {
    const currentUrl = urls[i];
    const domainName = sanitizeFilename(currentUrl);

    try {
      const records = await scrapeSingleUrl(cdp, currentUrl);

      if (records.length > 0) {
        // Save individual site files (both .xlsx and .csv)
        const baseFilename = `${domainName}_${timestamp}`;
        const saveInfo = saveDatasets(EXPORT_DIR, baseFilename, records, domainName);

        console.log(`📁 Saved Excel (.xlsx): ${saveInfo.xlsxPath} (${(saveInfo.xlsxSize / 1024).toFixed(1)} KB)`);
        console.log(`📁 Saved CSV   (.csv):  ${saveInfo.csvPath} (${(saveInfo.csvSize / 1024).toFixed(1)} KB)`);

        summaryResults.push({
          site: currentUrl,
          records: records.length,
          csvFile: saveInfo.csvPath,
          xlsxFile: saveInfo.xlsxPath
        });

        // Add to merged list with source identifier
        records.forEach(r => {
          allMergedRecords.push({
            Source_Site: domainName,
            Source_URL: currentUrl,
            ...r
          });
        });
      } else {
        summaryResults.push({
          site: currentUrl,
          records: 0,
          csvFile: null,
          xlsxFile: null
        });
      }
    } catch (err) {
      console.error(`❌ Error scraping ${currentUrl}:`, err.message);
      summaryResults.push({
        site: currentUrl,
        records: 0,
        error: err.message
      });
    }
  }

  // If multiple sites were scraped, generate a consolidated merged dataset!
  let mergedFiles = null;
  if (urls.length > 1 && allMergedRecords.length > 0) {
    console.log(`\n------------------------------------------------------------`);
    console.log(`📊 Generating Consolidated Multi-Site Master Dataset...`);
    const mergedBase = `batch_merged_${timestamp}`;
    mergedFiles = saveDatasets(EXPORT_DIR, mergedBase, allMergedRecords, 'All Scraped Sites');
    console.log(`🌟 Master Excel: ${mergedFiles.xlsxPath} (${allMergedRecords.length} total rows)`);
    console.log(`🌟 Master CSV:   ${mergedFiles.csvPath}`);
    console.log(`------------------------------------------------------------`);
  }

  // Cleanup
  cdp.close();
  try { edgeProc.kill(); } catch (e) {}
  try { fs.rmSync(USER_DATA_DIR, { recursive: true, force: true }); } catch (e) {}

  // Final Summary Output
  console.log(`\n============================================================`);
  console.log(`🎉 BATCH SCRAPING COMPLETED: ${urls.length} site(s) processed`);
  console.log(`============================================================`);
  summaryResults.forEach((res, idx) => {
    console.log(` [${idx + 1}] ${res.site} -> ${res.records} rows extracted`);
    if (res.xlsxFile) console.log(`     Excel: ${res.xlsxFile}`);
    if (res.csvFile)  console.log(`     CSV:   ${res.csvFile}`);
  });
  if (mergedFiles) {
    console.log(`\n 📦 Master Consolidated Files:`);
    console.log(`     Excel: ${mergedFiles.xlsxPath}`);
    console.log(`     CSV:   ${mergedFiles.csvPath}`);
  }
  console.log(`============================================================\n`);

  return {
    summary: summaryResults,
    merged: mergedFiles,
    totalRecords: allMergedRecords.length
  };
}

// CLI Argument Parsing
function parseArgs() {
  const args = process.argv.slice(2);
  const rawUrls = [];

  for (const arg of args) {
    if (arg.startsWith('--urls=')) {
      const parts = arg.replace('--urls=', '').split(',');
      parts.forEach(p => rawUrls.push(p));
    } else if (arg.startsWith('--file=')) {
      const filePath = arg.replace('--file=', '');
      if (fs.existsSync(filePath)) {
        const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
        lines.forEach(l => {
          if (l.trim() && !l.startsWith('#')) rawUrls.push(l.trim());
        });
      }
    } else if (!arg.startsWith('--')) {
      rawUrls.push(arg);
    }
  }

  const validUrls = rawUrls.map(normalizeUrl).filter(Boolean);
  return validUrls;
}

// Main execution
(async () => {
  const urls = parseArgs();

  if (urls.length === 0) {
    console.log(`
OmniScrape AI - Batch Multi-Website Scraper
Usage:
  node scripts/scrape.js <url1> [url2] ... [urlN]
  node scripts/scrape.js --urls="https://site1.com,https://site2.com"
  node scripts/scrape.js --file="sites.txt"

Example:
  node scripts/scrape.js "http://localhost:4173" "https://news.ycombinator.com"
`);
    process.exit(1);
  }

  try {
    await runBatchScraper(urls);
    process.exit(0);
  } catch (err) {
    console.error('Batch scraper execution failed:', err);
    process.exit(1);
  }
})();
