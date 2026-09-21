import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "OmniScrape AI - Web Scraper & ML Extractor",
  description: "Free AI web scraper. Auto-detect tables & lists, crawl pages, and export clean datasets to CSV, Excel, and JSON.",
  version: "1.0.0",
  icons: {
    "16": "icons/icon-16.png",
    "32": "icons/icon-32.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png",
  },
  action: {
    default_title: "Open OmniScrape AI",
    default_popup: "src/popup/index.html",
    default_icon: {
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png",
    },
  },
  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
  side_panel: {
    default_path: "src/sidepanel/index.html",
  },
  permissions: ["activeTab", "scripting", "storage", "downloads", "sidePanel", "tabs"],
  content_scripts: [
    {
      matches: ["<all_urls>"],
      js: ["src/content/index.ts"],
      run_at: "document_idle",
    },
  ],
});