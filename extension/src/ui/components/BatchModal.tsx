import React, { useState } from "react";
import { Icons } from "./Icons";

interface BatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartBatch: (urls: string[]) => Promise<void>;
  isBatchRunning: boolean;
  batchProgress: {
    current: number;
    total: number;
    currentUrl: string;
    rowCount: number;
  } | null;
}

export const BatchModal: React.FC<BatchModalProps> = ({
  isOpen,
  onClose,
  onStartBatch,
  isBatchRunning,
  batchProgress,
}) => {
  const [urlsText, setUrlsText] = useState(
    "https://techmart.store/products/gadgets\nhttps://remotetech.jobs/search?q=engineer\nhttps://metro-estates.com/listings/ny"
  );

  if (!isOpen) return null;

  const urlCount = urlsText
    .split("\n")
    .map((u) => u.trim())
    .filter(Boolean).length;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const urls = urlsText
      .split("\n")
      .map((u) => u.trim())
      .filter(Boolean);
    if (urls.length > 0) {
      void onStartBatch(urls);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(4px)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          background: "#0f172a",
          border: "1px solid rgba(255, 255, 255, 0.15)",
          borderRadius: 8,
          width: "100%",
          maxWidth: 480,
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.8)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "#0b1120",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                background: "rgba(37, 99, 235, 0.15)",
                color: "#60a5fa",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "1px solid rgba(37, 99, 235, 0.3)",
              }}
            >
              <Icons.Layers />
            </div>
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: 14,
                  fontWeight: 700,
                  color: "#f8fafc",
                }}
              >
                Multi-Website Batch Extraction
              </h2>
              <p style={{ margin: 0, fontSize: 11, color: "#94a3b8" }}>
                Extract repeating datasets across N websites into Excel and CSV
              </p>
            </div>
          </div>

          {!isBatchRunning && (
            <button
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                color: "#94a3b8",
                cursor: "pointer",
                padding: 4,
                fontSize: 18,
                lineHeight: 1,
              }}
              title="Close modal"
            >
              &times;
            </button>
          )}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: 20 }}>
          <div style={{ marginBottom: 14 }}>
            <label
              style={{
                display: "block",
                fontSize: 11.5,
                fontWeight: 600,
                color: "#e2e8f0",
                marginBottom: 6,
              }}
            >
              Website URLs (one per line):
            </label>
            <textarea
              rows={6}
              value={urlsText}
              onChange={(e) => setUrlsText(e.target.value)}
              disabled={isBatchRunning}
              placeholder="https://example1.com/products&#10;https://example2.com/catalog&#10;https://example3.com/items"
              style={{
                width: "100%",
                padding: "10px 12px",
                background: "#080c14",
                border: "1px solid rgba(255, 255, 255, 0.12)",
                borderRadius: 6,
                color: "#f8fafc",
                fontSize: 11.5,
                fontFamily: "monospace",
                lineHeight: 1.5,
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 10.5,
                color: "#94a3b8",
                marginTop: 4,
              }}
            >
              <span>{urlCount} website(s) queued</span>
              <span>Generates .xlsx and .csv files</span>
            </div>
          </div>

          {/* Progress Banner */}
          {isBatchRunning && batchProgress && (
            <div
              style={{
                background: "#131c2e",
                border: "1px solid rgba(14, 165, 233, 0.3)",
                borderRadius: 6,
                padding: 12,
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#38bdf8",
                  marginBottom: 6,
                }}
              >
                <span>
                  Processing site {batchProgress.current} of {batchProgress.total}
                </span>
                <span>{batchProgress.rowCount} rows extracted</span>
              </div>
              <div
                style={{
                  height: 4,
                  background: "#1e293b",
                  borderRadius: 2,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${(batchProgress.current / batchProgress.total) * 100}%`,
                    background: "#0ea5e9",
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
              <div
                style={{
                  fontSize: 10.5,
                  color: "#94a3b8",
                  marginTop: 6,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                Target: {batchProgress.currentUrl}
              </div>
            </div>
          )}

          {/* Actions */}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
              marginTop: 10,
            }}
          >
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={onClose}
              disabled={isBatchRunning}
              style={{ borderRadius: 6, padding: "8px 16px", fontSize: 12 }}
            >
              Cancel
            </button>

            <button
              type="submit"
              className="btn-primary btn-sm"
              disabled={isBatchRunning || urlCount === 0}
              style={{
                borderRadius: 6,
                padding: "8px 18px",
                fontSize: 12,
                fontWeight: 600,
                background: "#2563eb",
                borderColor: "#3b82f6",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {isBatchRunning ? (
                <>
                  <Icons.Refresh />
                  <span>Extracting Sites...</span>
                </>
              ) : (
                <>
                  <Icons.Play />
                  <span>Start Batch Extraction</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
