# OminiAI Web Scraper Extension 🚀

> Free, unlimited, and privacy-focused AI web scraper browser extension & showcase website for Microsoft Edge and Google Chrome (Manifest V3).

![OminiAI Logo](website/assets/logo-300.png)

## Overview

**OminiAI Web Scraper** is a developer-grade browser extension built with **React 19**, **TypeScript**, and **Vite**. It transforms any website into structured, ML-ready datasets in 2 clicks without writing a line of code.

This repository contains both:
1. **`extension/`**: The Manifest V3 browser extension (React 19 + TypeScript + Vite + CrxJS).
2. **`website/`**: The product landing page, interactive live scraper sandbox, and store-compliant Privacy Policy.

---

## 🌟 Key Features

- ⚡ **Automated DOM Clustering**: Identifies repeating cards, lists, and tables via sibling token similarity.
- 🧠 **AI Semantic Field Classifier**: Automatically classifies columns into titles, prices, ratings, timestamps, and normalized image URLs.
- 🔄 **Multi-Strategy Pagination Engine**: Crawls multi-page catalogs via Next Page buttons, Load More buttons, and automated infinite scroll with dynamic mutation settling.
- 📊 **1-Click Multi-Format Export**:
  - **Excel (`.xlsx` / `.xls`)**: Native spreadsheet formatting with auto-fitted headers.
  - **CSV**: RFC-4180 compliant with UTF-8 BOM (`\uFEFF`) for zero encoding issues.
  - **JSON**: Clean structured developer schema.
  - **Clipboard (TSV)**: Instant tab-separated values ready to paste into Google Sheets.
- 🛡️ **100% Client-Side Privacy**: No external proxy servers, no tracking, and no credentials required.

---

## 📁 Repository Structure

```
ominiai-web-scraper-extension/
├── extension/                 # Manifest V3 Extension Source
│   ├── manifest.config.ts    # Store-compliant MV3 configuration
│   ├── package.json          # Node dependencies & build scripts
│   ├── src/                  # React UI, Content Scripts, Background Worker
│   │   ├── content/          # Cluster detection, field classifiers, paginator
│   │   ├── background/       # Service worker & message coordination
│   │   ├── ui/               # Side panel React application
│   │   └── shared/           # ML feature analyzers, models, export utilities
│   └── public/               # Extension icons (16, 32, 48, 128, 300, 512)
│
├── website/                   # Official Product Showcase & Landing Page
│   ├── index.html            # Landing page with interactive scraping simulator
│   ├── style.css             # Glassmorphism design system & glowing animations
│   ├── app.js                # Live scraper playground & dynamic export generator
│   ├── privacy.html          # Edge Add-ons & Chrome Web Store Privacy Policy
│   └── assets/               # High-res logos and favicons
│
├── .gitignore
└── README.md
```

---

## 🛠️ Quick Start

### 1. Build Extension

```bash
cd extension
npm install
npm run build
```

The compiled extension is output to `extension/dist/`.

To package a submission-ready `.zip` for Microsoft Edge Add-ons or Chrome Web Store:
```bash
npm run package
```

### 2. Load into Microsoft Edge or Chrome

1. Open `edge://extensions/` or `chrome://extensions/`.
2. Enable **Developer mode** toggle.
3. Click **Load unpacked**.
4. Select the `extension/dist` folder.

### 3. Run Showcase Website Locally

```bash
cd website
node serve.js
```
Open [http://localhost:4173](http://localhost:4173) in your browser.

---

## 📜 Store Compliance & Privacy

OminiAI Web Scraper complies strictly with the Microsoft Edge Partner Center and Google Chrome Web Store policies:
- Single-purpose web scraping without collecting browsing histories or personal identifiable information.
- Full privacy documentation available in [`website/privacy.html`](website/privacy.html).

---

## 📄 License

MIT License &copy; 2026 OminiAI.
