import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { RequestMessage, ResponseMessage } from "../shared/messages";
import type {
  CollectionCandidate,
  ExtractionRecipe,
  FieldDefinition,
  PaginationMode,
  PaginationSettings,
  StoredJob,
} from "../shared/models";
import { FieldEditor } from "./components/FieldEditor";
import { Header } from "./components/Header";
import { Icons } from "./components/Icons";
import { PaginationConfig } from "./components/PaginationConfig";
import { PreviewTable } from "./components/PreviewTable";
import "./styles.css";

async function sendRequest(message: RequestMessage): Promise<ResponseMessage> {
  // If pause, resume, or stop: directly signal content script in active tab for immediate sub-1ms reaction
  if (
    message.type === "PAUSE_EXTRACTION" ||
    message.type === "RESUME_EXTRACTION" ||
    message.type === "STOP_EXTRACTION"
  ) {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, message).catch(() => {});
      }
    } catch {}
    try {
      const lastTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (lastTabs[0]?.id) {
        chrome.tabs.sendMessage(lastTabs[0].id, message).catch(() => {});
      }
    } catch {}
  }

  return chrome.runtime.sendMessage(message);
}

export const App: React.FC = () => {
  const [candidates, setCandidates] = useState<CollectionCandidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<CollectionCandidate | null>(null);
  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [storedJob, setStoredJob] = useState<StoredJob | null>(null);

  const [paginationSettings, setPaginationSettings] = useState<PaginationSettings>({
    mode: "next",
    maxPages: 10,
    maxRows: 10000,
    waitMs: 180,
  });

  const [targetMaxPages, setTargetMaxPages] = useState<number>(10);
  const [turboMode, setTurboMode] = useState<boolean>(true);
  const [deepScrape, setDeepScrape] = useState<boolean>(true);
  const [crawlAllPages, setCrawlAllPages] = useState<boolean>(true);
  const [traverseCategories, setTraverseCategories] = useState<boolean>(false);
  const [isPausedOptimistic, setIsPausedOptimistic] = useState<boolean>(false);
  const [targetHost, setTargetHost] = useState<string>("");
  const [currentActiveHost, setCurrentActiveHost] = useState<string>("");
  const [showSettings, setShowSettings] = useState(false);
  const [copiedTsv, setCopiedTsv] = useState(false);

  const [notice, setNotice] = useState<{ message: string; type: "info" | "error" | "success" } | null>(
    null
  );
  const [isScanning, setIsScanning] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Poll stored job state at high frequency & track active tab host
  const syncJob = useCallback(async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url) {
        try {
          const host = new URL(tab.url).hostname;
          setCurrentActiveHost(host);
          setTargetHost((prev) => prev || host);
        } catch {}
      }

      const resp = await sendRequest({ type: "GET_JOB" });
      if (resp.ok && "job" in resp && resp.job) {
        setStoredJob((prev) => {
          // If the user clicked pause optimistically, do NOT let background poll overwrite it to false
          if (isPausedOptimistic && !resp.job!.status.paused && resp.job!.status.running) {
            return {
              ...resp.job!,
              status: { ...resp.job!.status, paused: true, message: "⏸️ Extraction Paused (1-click) - Click Resume to continue" },
            };
          }
          return resp.job;
        });
      }
    } catch {
      // Worker idle
    }
  }, [isPausedOptimistic]);

  useEffect(() => {
    void syncJob();
    const interval = window.setInterval(syncJob, 250);
    return () => window.clearInterval(interval);
  }, [syncJob]);

  // Listen to tab activation changes
  useEffect(() => {
    const handleTabChange = async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (tab?.url) {
          setCurrentActiveHost(new URL(tab.url).hostname);
        }
      } catch {}
    };

    chrome.tabs.onActivated.addListener(handleTabChange);
    return () => {
      chrome.tabs.onActivated.removeListener(handleTabChange);
    };
  }, []);

  // Active recipe from selected candidate
  const currentRecipe: ExtractionRecipe | null = useMemo(() => {
    if (!selectedCandidate) return null;
    return {
      selector: selectedCandidate.selector,
      isTable: selectedCandidate.isTable,
      fields: selectedCandidate.fields,
    };
  }, [selectedCandidate]);

  // Direct runtime message listener: updates table rows live with 0ms lag as they stream in
  useEffect(() => {
    const handleProgress = (msg: any) => {
      if (msg && msg.type === "EXTRACTION_PROGRESS") {
        const isMsgPaused = typeof msg.paused === "boolean" ? msg.paused : isPausedOptimistic;
        if (typeof msg.paused === "boolean") {
          setIsPausedOptimistic(msg.paused);
        }

        setStoredJob((prev) => ({
          url: prev?.url || window.location.href,
          title: prev?.title,
          recipe: currentRecipe || prev?.recipe,
          pagination: prev?.pagination,
          rows: msg.rows,
          updatedAt: Date.now(),
          status: {
            running: true,
            paused: isMsgPaused,
            pages: msg.pages,
            rows: msg.rows.length,
            duplicates: msg.duplicates,
            errors: prev?.status.errors || [],
            message: msg.message,
            latestItem: msg.latestItem,
          },
        }));
      } else if (msg && msg.type === "EXTRACTION_DONE") {
        setIsPausedOptimistic(false);
        setStoredJob((prev) =>
          prev
            ? {
                ...prev,
                rows: msg.rows,
                status: {
                  ...prev.status,
                  running: false,
                  paused: false,
                  message: msg.message,
                },
              }
            : null
        );
      }
    };

    chrome.runtime.onMessage.addListener(handleProgress);
  }, [currentRecipe, isPausedOptimistic]);

  // Fetch live preview of current recipe
  const fetchPreview = useCallback(async (recipeToPreview = currentRecipe) => {
    if (!recipeToPreview || !recipeToPreview.selector) return;
    try {
      const resp = await sendRequest({
        type: "EXTRACT_PREVIEW",
        recipe: recipeToPreview,
        limit: 25,
      });
      if (resp.ok && "rows" in resp) {
        setPreviewRows(resp.rows);
      }
    } catch (err) {
      console.warn("Preview error:", err);
    }
  }, [currentRecipe]);

  useEffect(() => {
    if (currentRecipe) {
      void fetchPreview(currentRecipe);
    }
  }, [currentRecipe, fetchPreview]);

  // Auto-discover collections on mount (Thunderbit 0-click experience)
  const handleDiscover = useCallback(async () => {
    setIsScanning(true);
    try {
      const resp = await sendRequest({ type: "DISCOVER" });
      if (resp.ok && "candidates" in resp && resp.candidates.length > 0) {
        setCandidates(resp.candidates);
        const best = resp.candidates[0];
        setSelectedCandidate(best);

        // Auto-configure pagination from intelligent detection
        if (best.autoPagination) {
          setPaginationSettings((prev) => ({
            ...prev,
            mode: best.autoPagination?.mode ?? "next",
            nextSelector: best.autoPagination?.nextSelector,
          }));
        }

        setNotice({
          message: `Auto-detected "${best.label}". Pagination: ${best.autoPagination?.label || "None"}.`,
          type: "success",
        });
      } else if (!resp.ok) {
        setNotice({ message: resp.error, type: "error" });
      } else {
        setNotice({
          message: "No repeating datasets found automatically. Use 'Pick Item' to click any card.",
          type: "info",
        });
      }
    } catch (err) {
      setNotice({
        message: err instanceof Error ? err.message : "Auto-scan failed. Try refreshing the page.",
        type: "error",
      });
    } finally {
      setIsScanning(false);
    }
  }, []);

  // Run auto-discovery on mount
  useEffect(() => {
    void handleDiscover();
  }, [handleDiscover]);

  // Interactive element picker
  const handlePickCollection = async () => {
    setIsPicking(true);
    setNotice({
      message: "Hover and click any item on the page. Use ↑ / ↓ to adjust card container.",
      type: "info",
    });

    try {
      const resp = await sendRequest({ type: "PICK_COLLECTION" });
      if (resp.ok && "selected" in resp) {
        setSelectedCandidate(resp.selected);
        setCandidates((prev) => [resp.selected, ...prev]);

        if (resp.selected.autoPagination) {
          setPaginationSettings((prev) => ({
            ...prev,
            mode: resp.selected.autoPagination?.mode ?? "next",
            nextSelector: resp.selected.autoPagination?.nextSelector,
          }));
        }

        setNotice({
          message: `Custom collection defined with ${resp.selected.rowCount} rows.`,
          type: "success",
        });
      } else if (!resp.ok) {
        setNotice({ message: resp.error, type: "error" });
      }
    } catch (err) {
      setNotice({
        message: err instanceof Error ? err.message : "Selection cancelled.",
        type: "info",
      });
    } finally {
      setIsPicking(false);
    }
  };

  const handlePickNextControl = async () => {
    setIsPicking(true);
    try {
      const resp = await sendRequest({ type: "PICK_PAGINATION_CONTROL" });
      if (resp.ok && "paginationSelector" in resp) {
        setPaginationSettings((prev) => ({
          ...prev,
          nextSelector: resp.paginationSelector,
        }));
        setNotice({
          message: `Set pagination button: "${resp.text || resp.paginationSelector}"`,
          type: "success",
        });
      }
    } catch {
      // ignore
    } finally {
      setIsPicking(false);
    }
  };

  // 1-Click Auto Scrape (Bounded to exact detected page count or multi-category traversal)
  const handleStartExtraction = async () => {
    if (!currentRecipe) return;
    const detectedPages = selectedCandidate?.autoPagination?.totalPages;
    const detectedCats = selectedCandidate?.detectedCategories?.length || 0;

    // Bounded crawl: strictly respect actual pages if crawlAllPages is true
    const boundedPages = crawlAllPages
      ? (detectedPages && detectedPages > 0 ? detectedPages : 500)
      : 1;

    const effectiveMode = crawlAllPages
      ? (paginationSettings.mode !== "none" ? paginationSettings.mode : (selectedCandidate?.autoPagination?.mode ?? "next"))
      : "none";

    const isMultiCategory = traverseCategories && detectedCats > 0;

    const settings: PaginationSettings = {
      ...paginationSettings,
      mode: effectiveMode,
      maxPages: boundedPages,
      waitMs: 0,
      deepScrape,
      crawlAllPages,
      traverseCategories: isMultiCategory,
    };

    setIsPausedOptimistic(false);

    const pagesDesc = crawlAllPages
      ? (detectedPages ? `${detectedPages} page(s)` : "all pages")
      : "current page only";

    setNotice({
      message: isMultiCategory
        ? `📂 Multi-Category Crawl: Extracting across ${detectedCats} categories (${pagesDesc}) at maximum turbo speed…`
        : `⚡ Bounded Crawl: Extracting ${pagesDesc} at maximum turbo speed…`,
      type: "info",
    });

    try {
      const resp = await sendRequest({
        type: "RUN_EXTRACTION",
        recipe: currentRecipe,
        pagination: settings,
      });
      if (!resp.ok) {
        setNotice({ message: resp.error, type: "error" });
      }
    } catch (err) {
      setNotice({
        message: err instanceof Error ? err.message : "Failed to start extraction.",
        type: "error",
      });
    }
  };

  const handlePause = async () => {
    setIsPausedOptimistic(true);
    setStoredJob((prev) =>
      prev
        ? {
            ...prev,
            status: {
              ...prev.status,
              paused: true,
              message: "⏸️ Extraction Paused (1-click) - Click Resume to continue",
            },
          }
        : null
    );
    try {
      await sendRequest({ type: "PAUSE_EXTRACTION" });
    } catch {
      // ignore
    }
  };

  const handleResume = async () => {
    setIsPausedOptimistic(false);
    setStoredJob((prev) =>
      prev
        ? {
            ...prev,
            status: {
              ...prev.status,
              paused: false,
              message: "▶️ Resuming extraction…",
            },
          }
        : null
    );
    try {
      await sendRequest({ type: "RESUME_EXTRACTION" });
    } catch {
      // ignore
    }
  };

  const handleStop = async () => {
    try {
      await sendRequest({ type: "STOP_EXTRACTION" });
      setIsPausedOptimistic(false);
      setStoredJob((prev) =>
        prev
          ? {
              ...prev,
              status: { ...prev.status, running: false, paused: false, message: "Extraction stopped by user." },
            }
          : null
      );
      setNotice({
        message: `Extraction stopped. All ${rowsToShow.length.toLocaleString()} captured records are ready to export.`,
        type: "info",
      });
    } catch {
      // ignore
    }
  };

  const handleReset = async () => {
    await sendRequest({ type: "RESET_JOB" });
    setIsPausedOptimistic(false);
    setStoredJob(null);
    setNotice({ message: "Cleared previous crawl dataset.", type: "info" });
  };

  // Export handling
  const handleExport = async (format: "csv" | "xlsx" | "json" | "tsv") => {
    setIsExporting(true);
    try {
      const resp = await sendRequest({ type: "EXPORT", format });
      if (resp.ok) {
        if (format === "tsv" && "tsvData" in resp && resp.tsvData) {
          await navigator.clipboard.writeText(resp.tsvData);
          setCopiedTsv(true);
          setTimeout(() => setCopiedTsv(false), 2200);
          setNotice({
            message: "Copied table data to clipboard! Ready to paste into Google Sheets.",
            type: "success",
          });
        } else {
          setNotice({
            message: `Downloaded ${format.toUpperCase()} export file successfully.`,
            type: "success",
          });
        }
      } else {
        setNotice({ message: resp.error, type: "error" });
      }
    } catch (err) {
      setNotice({
        message: err instanceof Error ? err.message : "Export failed.",
        type: "error",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const isScraping = storedJob?.status.running ?? false;
  const isPaused = isPausedOptimistic || (storedJob?.status.paused ?? false);
  const extractedRows = storedJob?.rows ?? [];
  const rowsToShow = isScraping || extractedRows.length > 0 ? extractedRows : previewRows;
  const hasRowsToExport = rowsToShow.length > 0;

  return (
    <div className="app-container">
      <Header
        onDiscover={handleDiscover}
        onPick={handlePickCollection}
        isScraping={isScraping}
        isDiscovering={isScanning}
      />

      {notice && (
        <div className={`notice-banner notice-${notice.type}`}>
          <span>{notice.message}</span>
          <button
            style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", fontSize: 13 }}
            onClick={() => setNotice(null)}
          >
            ✕
          </button>
        </div>
      )}

      <main className="app-content">
        {/* 100% Free Forever Trust Banner (Thunderbit free replacement) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 12px",
            background: "linear-gradient(90deg, rgba(16, 185, 129, 0.12) 0%, rgba(59, 130, 246, 0.12) 100%)",
            border: "1px solid rgba(16, 185, 129, 0.25)",
            borderRadius: 8,
            fontSize: 11.5,
            color: "#34d399",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span>⚡</span>
            <span>
              <strong>100% Free Forever</strong> · Zero Subscriptions · Unlimited Credits · No Paywall
            </span>
          </div>
          <span style={{ fontSize: 10, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Unlimited Scrapes
          </span>
        </div>

        {/* Website Switched Warning Banner (User navigated to a different site) */}
        {targetHost && currentActiveHost && targetHost !== currentActiveHost && (
          <div
            style={{
              background: "linear-gradient(90deg, rgba(239, 68, 68, 0.22) 0%, rgba(185, 28, 28, 0.22) 100%)",
              border: "1px solid rgba(239, 68, 68, 0.5)",
              borderRadius: 8,
              padding: "10px 14px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              margin: "10px 0 0 0",
              color: "#fca5a5",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 20 }}>⚠️</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 12.5, color: "#ef4444" }}>
                  Website Changed! You are viewing: <u>{currentActiveHost}</u>
                </div>
                <div style={{ fontSize: 11, color: "var(--text-main)", marginTop: 2 }}>
                  The scraper is attached to <strong>{targetHost}</strong>. Please switch back to the original tab, or click &quot;Scrape This Tab&quot;.
                </div>
              </div>
            </div>

            <button
              className="btn-secondary btn-sm"
              onClick={() => void handleDiscover()}
              style={{ fontSize: 11, padding: "5px 10px", flexShrink: 0, fontWeight: 600 }}
              title="Switch scraper to extract from this newly opened tab"
            >
              Scrape This Tab
            </button>
          </div>
        )}

        {/* Dataset Switcher Pills (if multiple collections exist) */}
        {candidates.length > 1 && (
          <div className="collection-pills-bar">
            {candidates.map((c, idx) => (
              <button
                key={c.id}
                className={`collection-pill ${selectedCandidate?.id === c.id ? "active" : ""}`}
                onClick={() => setSelectedCandidate(c)}
              >
                {c.isTable ? "📊 Table" : `📦 Dataset ${idx + 1}`} ({c.rowCount} rows)
              </button>
            ))}
          </div>
        )}

        {/* 1-Click Hero Action Bar (Thunderbit style) */}
        <div className="hero-card">
          <div className="hero-header">
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span className="hero-status-pill">
                  {selectedCandidate?.isTable ? <Icons.Table /> : <Icons.Layers />}
                  <span>{selectedCandidate ? `${selectedCandidate.rowCount} items found on page` : "Scanning…"}</span>
                </span>

                <span
                  style={{
                    fontSize: 11.5,
                    color: "var(--text-dim)",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  ⚡ {selectedCandidate?.autoPagination?.label || "Single Page"}
                </span>
              </div>

              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-main)" }}>
                {isScraping
                  ? storedJob?.status.message || "Scraping in progress…"
                  : selectedCandidate
                  ? `${selectedCandidate.fields.filter((f) => f.selected).length} columns auto-classified & ready`
                  : "Scanning page…"}
              </div>
            </div>

            {/* Main Action Controls */}
            <div className="hero-controls">
              {!isScraping ? (
                <>
                  <button
                    className="btn-scrape-all"
                    onClick={() => void handleStartExtraction()}
                    disabled={!selectedCandidate || isScanning}
                    title="Start automated extraction with active toggles"
                  >
                    <Icons.Play />
                    <span>
                      {traverseCategories && (selectedCandidate?.detectedCategories?.length || 0) > 0
                        ? crawlAllPages
                          ? `⚡ Scrape All Categories (${selectedCandidate?.detectedCategories?.length}) & All Pages`
                          : `⚡ Scrape All Categories (${selectedCandidate?.detectedCategories?.length}) (Page 1)`
                        : crawlAllPages
                        ? `⚡ Scrape All Pages (${selectedCandidate?.autoPagination?.totalPages ? `${selectedCandidate.autoPagination.totalPages} Pages` : "Auto"})`
                        : `⚡ Scrape Current Page`}
                    </span>
                  </button>

                  <button
                    className={`btn-toggle ${crawlAllPages ? "btn-toggle-active" : "btn-toggle-inactive"}`}
                    onClick={() => setCrawlAllPages((prev) => !prev)}
                    title={
                      crawlAllPages
                        ? "All Pages: ON — Scraper traverses all pages, load-more, and scroll pagination on the site"
                        : "All Pages: OFF — Scraper extracts items from the current page / page 1 only"
                    }
                  >
                    📄 All Pages: <strong>{crawlAllPages ? "ON" : "OFF"}</strong>
                  </button>

                  <button
                    className={`btn-toggle ${traverseCategories ? "btn-toggle-active" : "btn-toggle-inactive"}`}
                    onClick={() => setTraverseCategories((prev) => !prev)}
                    title={
                      traverseCategories
                        ? `All Categories: ON — Scraper visits all ${selectedCandidate?.detectedCategories?.length || 0} discovered categories on the website and extracts all items into one unified table`
                        : "All Categories: OFF — Scraper extracts from the current page / category only"
                    }
                  >
                    🏷️ All Categories {(selectedCandidate?.detectedCategories?.length || 0) > 0 ? `(${selectedCandidate?.detectedCategories?.length})` : ""}:{" "}
                    <strong>{traverseCategories ? "ON" : "OFF"}</strong>
                  </button>

                  <button
                    className={`btn-toggle ${deepScrape ? "btn-toggle-active" : "btn-toggle-inactive"}`}
                    onClick={() => setDeepScrape((prev) => !prev)}
                    title={
                      deepScrape
                        ? "Deep Details: ON — Automatically visits each item/product link to extract complete specifications, full descriptions & extra details into the table"
                        : "Deep Details: OFF — Extracts only fields visible on the listing card"
                    }
                  >
                    📦 Deep Details: <strong>{deepScrape ? "ON" : "OFF"}</strong>
                  </button>
                </>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {isPaused ? (
                    <button
                      className="btn-success btn-sm"
                      onClick={handleResume}
                      style={{
                        background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                        color: "#fff",
                        fontWeight: 700,
                        padding: "7px 14px",
                        boxShadow: "0 0 12px rgba(16, 185, 129, 0.45)",
                        border: "none",
                        cursor: "pointer",
                      }}
                      title="1-Click Resume: Continue extraction right where you paused"
                    >
                      <Icons.Play /> ▶️ Resume (1-Click)
                    </button>
                  ) : (
                    <button
                      className="btn-secondary btn-sm"
                      onClick={handlePause}
                      style={{
                        background: "rgba(234, 179, 8, 0.16)",
                        borderColor: "rgba(234, 179, 8, 0.5)",
                        color: "#fde047",
                        fontWeight: 700,
                        padding: "7px 14px",
                        cursor: "pointer",
                      }}
                      title="1-Click Pause: Instantly freeze extraction"
                    >
                      <Icons.Pause /> ⏸️ Pause (1-Click)
                    </button>
                  )}
                  <button
                    className="btn-danger"
                    onClick={handleStop}
                    style={{
                      background: "linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)",
                      color: "#fff",
                      fontWeight: 700,
                      padding: "8px 18px",
                      fontSize: 13,
                      boxShadow: "0 2px 10px rgba(239, 68, 68, 0.5)",
                      border: "none",
                      cursor: "pointer",
                    }}
                    title="Click to stop scraping immediately and keep all extracted items"
                  >
                    <Icons.Square />
                    <span>⏹️ Stop Scraping ({rowsToShow.length.toLocaleString()})</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Real-time Progress Metrics (shown when running or finished) */}
          {(isScraping || extractedRows.length > 0) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {isPaused && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    background: "rgba(234, 179, 8, 0.15)",
                    border: "1px solid rgba(234, 179, 8, 0.4)",
                    borderRadius: 6,
                    color: "#fde047",
                    fontSize: 12,
                    fontWeight: 650,
                  }}
                >
                  <span>⏸️ Extraction Paused (1-Click) · Network workers paused</span>
                  <button
                    className="btn-success btn-sm"
                    onClick={handleResume}
                    style={{
                      background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                      color: "#fff",
                      fontWeight: 700,
                      padding: "4px 10px",
                      fontSize: 11,
                      border: "none",
                      borderRadius: 4,
                      cursor: "pointer",
                    }}
                  >
                    ▶️ Resume Now
                  </button>
                </div>
              )}

              <div className="stats-grid">
                <div className="stat-box">
                  <div className="stat-value" style={{ color: "#60a5fa" }}>
                    {(storedJob?.rows.length ?? 0).toLocaleString()}
                  </div>
                  <div className="stat-label">Rows Scraped</div>
                </div>

                <div className="stat-box">
                  <div className="stat-value">
                    {storedJob?.status.pages ?? 1}
                    <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                      {" "}
                      /{" "}
                      {traverseCategories
                        ? `${selectedCandidate?.detectedCategories?.length || 1} Cats`
                        : selectedCandidate?.autoPagination?.totalPages || 1}
                    </span>
                  </div>
                  <div className="stat-label">
                    {traverseCategories ? "Categories / Pages" : "Pages Crawled (Bounded)"}
                  </div>
                </div>

                <div className="stat-box">
                  <div className="stat-value" style={{ color: "var(--text-dim)" }}>
                    {storedJob?.status.duplicates ?? 0}
                  </div>
                  <div className="stat-label">Duplicates Filtered</div>
                </div>
              </div>

              {isScraping && (
                <div className="progress-bar-wrap">
                  <div
                    className="progress-bar-fill pulse"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(
                          12,
                          Math.round(
                            ((storedJob?.status.pages ?? 1) /
                              (selectedCandidate?.autoPagination?.totalPages || 20)) *
                              100
                          )
                        )
                      )}%`,
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Quick 1-Click Export Buttons */}
          <div className="quick-export-row">
            <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-muted)", marginRight: 4 }}>
              Export ({rowsToShow.length} rows):
            </span>

            <button
              className="export-chip"
              onClick={() => void handleExport("csv")}
              disabled={!hasRowsToExport || isExporting}
              style={{
                borderColor: "rgba(16, 185, 129, 0.5)",
                color: "#34d399",
                fontWeight: 700,
              }}
              title="Download extracted rows directly as CSV file"
            >
              <Icons.Download /> CSV (Direct)
            </button>

            <button
              className="export-chip"
              onClick={() => void handleExport("xlsx")}
              disabled={!hasRowsToExport || isExporting}
              title="Download extracted rows as Excel (.xlsx) file"
            >
              <Icons.Download /> Excel (.xlsx)
            </button>

            <button
              className="export-chip"
              onClick={() => void handleExport("json")}
              disabled={!hasRowsToExport || isExporting}
              title="Download extracted rows as JSON file"
            >
              <Icons.Download /> JSON
            </button>

            <button
              className="export-chip"
              onClick={() => void handleExport("tsv")}
              disabled={!hasRowsToExport || isExporting}
              style={{ color: copiedTsv ? "#34d399" : "inherit" }}
            >
              {copiedTsv ? <Icons.Check /> : <Icons.Copy />}
              <span>{copiedTsv ? "Copied!" : "Copy to Sheets"}</span>
            </button>

            {extractedRows.length > 0 && !isScraping && (
              <button
                className="btn-secondary btn-sm"
                onClick={handleReset}
                title="Clear dataset and return to live preview"
                style={{ marginLeft: "auto" }}
              >
                <Icons.Trash /> Clear
              </button>
            )}
          </div>
        </div>

        {/* Live Data Grid Preview with direct download options */}
        <PreviewTable
          rows={rowsToShow}
          title={extractedRows.length > 0 ? "Extracted Records" : "Auto-Detected Live Preview"}
          onRefresh={() => void fetchPreview()}
          isLiveScraping={isScraping}
          latestItem={storedJob?.status.latestItem}
          onExport={handleExport}
        />

        {/* Optional Collapsible Settings (for customizing columns / pagination) */}
        <div className="accordion-box">
          <div className="accordion-header" onClick={() => setShowSettings((prev) => !prev)}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, fontSize: 12.5 }}>
              <Icons.Table />
              <span>Customize Columns & Advanced Pagination</span>
            </div>
            <span style={{ transform: showSettings ? "rotate(90deg)" : "none", transition: "transform 0.15s ease" }}>
              <Icons.ChevronRight />
            </span>
          </div>

          {showSettings && selectedCandidate && (
            <div className="accordion-content">
              <FieldEditor
                fields={selectedCandidate.fields}
                onChange={(newFields) => {
                  const updated = { ...selectedCandidate, fields: newFields };
                  setSelectedCandidate(updated);
                  setCandidates((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
                }}
                onRefreshPreview={() => void fetchPreview()}
              />

              <PaginationConfig
                settings={paginationSettings}
                onChange={setPaginationSettings}
                onPickNextControl={handlePickNextControl}
                isPicking={isPicking}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
};