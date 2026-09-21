import React from "react";
import type { ExtractionStatus } from "../../shared/models";
import { Icons } from "./Icons";

interface ExtractionMonitorProps {
  status: ExtractionStatus;
  maxPages: number;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onReset: () => void;
  canStart: boolean;
}

export const ExtractionMonitor: React.FC<ExtractionMonitorProps> = ({
  status,
  maxPages,
  onStart,
  onPause,
  onResume,
  onStop,
  onReset,
  canStart,
}) => {
  const percent = maxPages > 0 ? Math.min(100, Math.round((status.pages / maxPages) * 100)) : 0;

  return (
    <div className="card monitor-card">
      <div className="card-header">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {status.running && <span className="pulse-indicator" />}
          <h2 className="card-title">
            <span>Extraction Dashboard</span>
          </h2>
          <span
            className={`badge-pill ${
              status.running
                ? "badge-primary"
                : status.rows > 0
                ? "badge-success"
                : ""
            }`}
          >
            {status.running
              ? status.paused
                ? "Paused"
                : "Scraping…"
              : status.rows > 0
              ? "Completed"
              : "Ready"}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {!status.running ? (
            <>
              <button
                className="btn-primary"
                onClick={onStart}
                disabled={!canStart}
                title="Start crawling and extracting data"
              >
                <Icons.Play />
                <span>Start Extraction</span>
              </button>
              {status.rows > 0 && (
                <button
                  className="btn-secondary btn-sm"
                  onClick={onReset}
                  title="Clear extracted dataset"
                >
                  <Icons.Trash />
                  <span>Clear</span>
                </button>
              )}
            </>
          ) : (
            <>
              {status.paused ? (
                <button className="btn-success btn-sm" onClick={onResume} title="Resume extraction">
                  <Icons.Play />
                  <span>Resume</span>
                </button>
              ) : (
                <button className="btn-secondary btn-sm" onClick={onPause} title="Pause extraction">
                  <Icons.Pause />
                  <span>Pause</span>
                </button>
              )}
              <button className="btn-danger btn-sm" onClick={onStop} title="Stop extraction">
                <Icons.Square />
                <span>Stop</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Stats Counters */}
      <div className="stats-grid">
        <div className="stat-box">
          <div className="stat-value" style={{ color: "#60a5fa" }}>
            {status.rows.toLocaleString()}
          </div>
          <div className="stat-label">Unique Rows</div>
        </div>

        <div className="stat-box">
          <div className="stat-value">
            {status.pages}
            {maxPages > 1 && <span style={{ fontSize: 12, color: "var(--text-dim)" }}> / {maxPages}</span>}
          </div>
          <div className="stat-label">Pages Crawled</div>
        </div>

        <div className="stat-box">
          <div className="stat-value" style={{ color: "var(--text-dim)" }}>
            {status.duplicates.toLocaleString()}
          </div>
          <div className="stat-label">Duplicates Filtered</div>
        </div>
      </div>

      {/* Progress Bar */}
      {status.running && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div className="progress-bar-wrap">
            <div
              className={`progress-bar-fill ${status.running && !status.paused ? "pulse" : ""}`}
              style={{ width: `${Math.max(percent, 8)}%` }}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-dim)" }}>
            <span>{status.message}</span>
            {maxPages > 1 && <span>{percent}%</span>}
          </div>
        </div>
      )}

      {/* Status Message when not running */}
      {!status.running && status.message && status.message !== "Ready" && (
        <div style={{ fontSize: 11.5, color: "var(--text-muted)", background: "var(--bg-app)", padding: "6px 10px", borderRadius: "var(--radius-sm)" }}>
          {status.message}
        </div>
      )}
    </div>
  );
};
