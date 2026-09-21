import { getExportData } from "../shared/exportUtils";
import type { ContentEventMessage, RequestMessage, ResponseMessage } from "../shared/messages";
import type { StoredJob } from "../shared/models";

let activeScrapingTabId: number | null = null;

const createEmptyJob = (url = ""): StoredJob => ({
  url,
  rows: [],
  status: {
    running: false,
    paused: false,
    message: "Ready",
    pages: 0,
    rows: 0,
    duplicates: 0,
    errors: [],
  },
  updatedAt: Date.now(),
});

async function getActiveTab(): Promise<chrome.tabs.Tab> {
  // If we have an active scraping tab tracked, try to verify it
  if (activeScrapingTabId) {
    try {
      const tab = await chrome.tabs.get(activeScrapingTabId);
      if (tab?.id) return tab;
    } catch {
      activeScrapingTabId = null;
    }
  }

  // 1. Try active tab in current window
  const currentTabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (currentTabs[0]?.id && currentTabs[0].url && !currentTabs[0].url.startsWith("chrome-extension://")) {
    return currentTabs[0];
  }

  // 2. Try active tab in last focused window
  const lastFocusedTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (lastFocusedTabs[0]?.id && lastFocusedTabs[0].url && !lastFocusedTabs[0].url.startsWith("chrome-extension://")) {
    return lastFocusedTabs[0];
  }

  // 3. Fallback: find any http/https tab in any window
  const allTabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
  if (allTabs[0]?.id) {
    return allTabs[0];
  }

  throw new Error("No active browser webpage tab found.");
}

async function getStoredJob(): Promise<StoredJob | null> {
  const data = await chrome.storage.session.get("job");
  return data.job ?? null;
}

async function setStoredJob(job: StoredJob | null): Promise<void> {
  if (job) {
    await chrome.storage.session.set({ job: { ...job, updatedAt: Date.now() } });
  } else {
    await chrome.storage.session.remove("job");
  }
}

// Ensure side panel opens when clicking extension icon
chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
  }
});

// Central message dispatcher
chrome.runtime.onMessage.addListener(
  (
    message: RequestMessage | ContentEventMessage,
    sender,
    sendResponse: (result: ResponseMessage) => void
  ) => {
    (async () => {
      try {
        // Content script event: extraction progress
        if (message.type === "EXTRACTION_PROGRESS") {
          const current = (await getStoredJob()) ?? createEmptyJob(sender.tab?.url);
          const isPausedVal = typeof message.paused === "boolean" ? message.paused : current.status.paused;
          const updated: StoredJob = {
            ...current,
            rows: message.rows,
            status: {
              ...current.status,
              running: true,
              paused: isPausedVal,
              pages: message.pages,
              rows: message.rows.length,
              duplicates: message.duplicates,
              message: message.message,
              latestItem: message.latestItem || current.status.latestItem,
            },
          };
          await setStoredJob(updated);
          chrome.runtime.sendMessage(message).catch(() => {});
          return;
        }

        // Content script event: extraction completed
        if (message.type === "EXTRACTION_DONE") {
          activeScrapingTabId = null;
          const current = (await getStoredJob()) ?? createEmptyJob(sender.tab?.url);
          const updated: StoredJob = {
            ...current,
            rows: message.rows,
            status: {
              ...current.status,
              running: false,
              paused: false,
              rows: message.rows.length,
              message: message.message,
              errors: message.errors || current.status.errors,
            },
          };
          await setStoredJob(updated);
          chrome.runtime.sendMessage(message).catch(() => {});
          return;
        }

        // Job query / reset
        if (message.type === "GET_JOB") {
          sendResponse({ ok: true, job: await getStoredJob() });
          return;
        }

        if (message.type === "RESET_JOB") {
          activeScrapingTabId = null;
          await setStoredJob(null);
          sendResponse({ ok: true, reset: true });
          return;
        }

        // Instant Pause control: updates session storage + dispatches to content script
        if (message.type === "PAUSE_EXTRACTION") {
          const current = await getStoredJob();
          if (current) {
            current.status.paused = true;
            current.status.message = "⏸️ Extraction Paused (1-click) - Click Resume to continue";
            await setStoredJob(current);
          }

          if (activeScrapingTabId) {
            chrome.tabs.sendMessage(activeScrapingTabId, message).catch(() => {});
          }
          try {
            const tab = await getActiveTab();
            if (tab.id && tab.id !== activeScrapingTabId) {
              chrome.tabs.sendMessage(tab.id, message).catch(() => {});
            }
          } catch {}

          chrome.runtime.sendMessage({
            type: "EXTRACTION_PROGRESS",
            rows: current?.rows || [],
            pages: current?.status.pages || 0,
            duplicates: current?.status.duplicates || 0,
            message: "⏸️ Extraction Paused (1-click) - Click Resume to continue",
            paused: true,
          }).catch(() => {});

          sendResponse({ ok: true, paused: true });
          return;
        }

        // Instant Resume control: updates session storage + dispatches to content script
        if (message.type === "RESUME_EXTRACTION") {
          const current = await getStoredJob();
          if (current) {
            current.status.paused = false;
            current.status.message = "▶️ Resuming extraction…";
            await setStoredJob(current);
          }

          if (activeScrapingTabId) {
            chrome.tabs.sendMessage(activeScrapingTabId, message).catch(() => {});
          }
          try {
            const tab = await getActiveTab();
            if (tab.id && tab.id !== activeScrapingTabId) {
              chrome.tabs.sendMessage(tab.id, message).catch(() => {});
            }
          } catch {}

          chrome.runtime.sendMessage({
            type: "EXTRACTION_PROGRESS",
            rows: current?.rows || [],
            pages: current?.status.pages || 0,
            duplicates: current?.status.duplicates || 0,
            message: "▶️ Resuming extraction…",
            paused: false,
          }).catch(() => {});

          sendResponse({ ok: true, resumed: true });
          return;
        }

        // Instant Stop control: immediately marks job stopped in storage & halts content script
        if (message.type === "STOP_EXTRACTION") {
          const current = await getStoredJob();
          if (current) {
            current.status.running = false;
            current.status.paused = false;
            current.status.message = "⏹️ Extraction stopped by user.";
            await setStoredJob(current);
          }

          if (activeScrapingTabId) {
            chrome.tabs.sendMessage(activeScrapingTabId, message).catch(() => {});
          }
          try {
            const tab = await getActiveTab();
            if (tab.id && tab.id !== activeScrapingTabId) {
              chrome.tabs.sendMessage(tab.id, message).catch(() => {});
            }
          } catch {}

          chrome.runtime.sendMessage({
            type: "EXTRACTION_DONE",
            rows: current?.rows || [],
            message: "⏹️ Extraction stopped by user.",
          }).catch(() => {});

          activeScrapingTabId = null;
          sendResponse({ ok: true, stopped: true });
          return;
        }

        // File exports
        if (message.type === "EXPORT") {
          const current = await getStoredJob();
          if (!current?.rows.length) {
            throw new Error("No extracted data is available to export.");
          }

          const exportResult = getExportData(current.rows, message.format, current.url);

          if (message.format === "tsv") {
            sendResponse({ ok: true, exported: true, tsvData: exportResult.tsvData });
            return;
          }

          if (exportResult.dataUrl) {
            await chrome.downloads.download({
              url: exportResult.dataUrl,
              filename: exportResult.filename,
              saveAs: true,
            });
            sendResponse({ ok: true, exported: true, filename: exportResult.filename });
            return;
          }

          throw new Error("Unable to generate export data.");
        }

        // Forward general commands to active tab
        const tab = await getActiveTab();
        const tabId = tab.id;
        if (!tabId) throw new Error("Active tab has no ID.");

        if (!tab.url || !/^https?:/i.test(tab.url)) {
          throw new Error("Web scraping only works on standard http(s) webpages. Please navigate to a webpage.");
        }

        if (message.type === "RUN_EXTRACTION") {
          activeScrapingTabId = tabId;
          await setStoredJob({
            url: tab.url,
            title: tab.title,
            recipe: message.recipe,
            pagination: message.pagination,
            rows: [],
            status: {
              running: true,
              paused: false,
              message: "Starting extraction…",
              pages: 0,
              rows: 0,
              duplicates: 0,
              errors: [],
            },
          });
        }

        try {
          const response = (await chrome.tabs.sendMessage(tabId, message)) as ResponseMessage;
          sendResponse(response);
        } catch (tabErr) {
          const errMessage =
            tabErr instanceof Error ? tabErr.message : "Could not communicate with tab content script.";
          if (errMessage.includes("Receiving end does not exist")) {
            sendResponse({
              ok: false,
              error: "The scraper connection was refreshed. Please reload this webpage tab once to re-attach the scraper.",
            });
          } else {
            sendResponse({ ok: false, error: errMessage });
          }
        }
      } catch (err) {
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : "Background service worker error.",
        });
      }
    })();

    return true; // Keep channel open
  }
);