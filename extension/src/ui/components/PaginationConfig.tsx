import React from "react";
import type { PaginationMode, PaginationSettings } from "../../shared/models";
import { Icons } from "./Icons";

interface PaginationConfigProps {
  settings: PaginationSettings;
  onChange: (settings: PaginationSettings) => void;
  onPickNextControl: () => void;
  isPicking: boolean;
}

export const PaginationConfig: React.FC<PaginationConfigProps> = ({
  settings,
  onChange,
  onPickNextControl,
  isPicking,
}) => {
  const setMode = (mode: PaginationMode) => {
    onChange({ ...settings, mode });
  };

  const updateSetting = <K extends keyof PaginationSettings>(key: K, val: PaginationSettings[K]) => {
    onChange({ ...settings, [key]: val });
  };

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">
            <Icons.ChevronRight />
            <span>Pagination & Multi-Page Scraping</span>
          </h2>
          <p className="card-desc">
            Configure how the scraper traverses pages and dynamically loaded content.
          </p>
        </div>
      </div>

      {/* Segmented Mode Selector */}
      <div className="segmented-modes">
        <button
          className={`segmented-btn ${settings.mode === "none" ? "active" : ""}`}
          onClick={() => setMode("none")}
        >
          Single Page
        </button>
        <button
          className={`segmented-btn ${settings.mode === "next" ? "active" : ""}`}
          onClick={() => setMode("next")}
        >
          Next Button
        </button>
        <button
          className={`segmented-btn ${settings.mode === "load-more" ? "active" : ""}`}
          onClick={() => setMode("load-more")}
        >
          Load More
        </button>
        <button
          className={`segmented-btn ${settings.mode === "infinite-scroll" ? "active" : ""}`}
          onClick={() => setMode("infinite-scroll")}
        >
          Infinite Scroll
        </button>
      </div>

      {/* Next / Load-more custom selector option */}
      {(settings.mode === "next" || settings.mode === "load-more") && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, background: "var(--bg-app)", padding: 10, borderRadius: "var(--radius-sm)", border: "1px solid var(--border-color)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-muted)" }}>
              {settings.mode === "next" ? "Next Page Control" : "Load More Button"}
            </span>
            <button
              className="btn-secondary btn-sm"
              onClick={onPickNextControl}
              disabled={isPicking}
              title="Click on the button directly on the page"
            >
              <Icons.Crosshair />
              <span>{isPicking ? "Selecting…" : "Pick on Page"}</span>
            </button>
          </div>

          <input
            type="text"
            placeholder="Auto-detects rel='next', Next, › or enter custom selector"
            value={settings.nextSelector ?? ""}
            onChange={(e) => updateSetting("nextSelector", e.target.value)}
          />
        </div>
      )}

      {/* Numeric Limits & Timing */}
      <div className="config-grid">
        <div className="config-item">
          <label className="config-label">Maximum Pages</label>
          <input
            type="number"
            min={1}
            max={500}
            disabled={settings.mode === "none"}
            value={settings.maxPages}
            onChange={(e) => updateSetting("maxPages", Math.max(1, parseInt(e.target.value, 10) || 1))}
          />
        </div>

        <div className="config-item">
          <label className="config-label">Max Rows (0 = unlimited)</label>
          <input
            type="number"
            min={0}
            max={50000}
            value={settings.maxRows}
            onChange={(e) => updateSetting("maxRows", Math.max(0, parseInt(e.target.value, 10) || 0))}
          />
        </div>

        <div className="config-item">
          <label className="config-label">Wait per Page (ms)</label>
          <input
            type="number"
            min={300}
            max={10000}
            step={100}
            value={settings.waitMs}
            onChange={(e) => updateSetting("waitMs", Math.max(300, parseInt(e.target.value, 10) || 1200))}
          />
        </div>

        <div className="config-item" style={{ justifyContent: "center" }}>
          <span style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 14 }}>
            ⚡ Automatic MutationObserver debouncing ensures dynamic AJAX data has finished rendering.
          </span>
        </div>
      </div>
    </div>
  );
};
