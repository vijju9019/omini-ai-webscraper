import React, { useEffect, useMemo, useRef, useState } from "react";
import { isUnwantedColumn, cleanMlValue } from "../../shared/mlFeatureAnalyzer";
import { Icons } from "./Icons";

interface PreviewTableProps {
  rows: Record<string, string>[];
  title?: string;
  onRefresh?: () => void;
  isLiveScraping?: boolean;
  latestItem?: string;
  onExport?: (format: "csv" | "xlsx" | "json" | "tsv") => void;
}

export const PreviewTable: React.FC<PreviewTableProps> = ({
  rows,
  title = "Extracted Records",
  onRefresh,
  isLiveScraping = false,
  latestItem,
  onExport,
}) => {
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const [isBigView, setIsBigView] = useState(false);
  const [showAllRows, setShowAllRows] = useState(true);

  // Dynamically collect all informative columns, strictly excluding URLs, links, images, and noise
  const columns = useMemo(() => {
    if (rows.length === 0) return [];

    const colSet = new Set<string>();

    // Priority ordering for ML features
    const priority = [
      "Title",
      "Full Title",
      "Product Title",
      "Name",
      "Category",
      "Brand",
      "Price",
      "Original Price",
      "Discount",
      "Rating",
      "Reviews",
      "Availability",
      "SKU / Model",
      "Key Features",
      "Specifications",
      "Full Description",
      "Description",
      "Date",
    ];

    const available = new Set<string>();
    for (const row of rows) {
      for (const k of Object.keys(row)) {
        if (isUnwantedColumn(k, rows.map((r) => r[k]))) {
          continue;
        }
        available.add(k);
      }
    }

    // Add priority fields first if available
    for (const p of priority) {
      if (available.has(p)) {
        colSet.add(p);
        available.delete(p);
      }
    }

    // Add remaining clean attribute columns (e.g. Dimensions, Weight, Color, Material, etc.)
    for (const k of available) {
      colSet.add(k);
    }

    return Array.from(colSet);
  }, [rows]);

  // Auto-scroll to newly captured rows during live extraction
  useEffect(() => {
    if (isLiveScraping && tableContainerRef.current) {
      tableContainerRef.current.scrollTo({
        top: tableContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [rows.length, isLiveScraping]);

  const maxRowsDisplay = 2000;
  const displayedRows =
    rows.length <= maxRowsDisplay || showAllRows ? rows : rows.slice(-maxRowsDisplay);

  return (
    <div className={`card ${isBigView ? "table-card-expanded" : ""}`}>
      <div className="card-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h2 className="card-title">
              <Icons.Eye />
              <span>
                {title} ({rows.length.toLocaleString()} rows · {columns.length} features)
              </span>
            </h2>
            <span
              style={{
                background: "rgba(99, 102, 241, 0.18)",
                border: "1px solid rgba(99, 102, 241, 0.45)",
                color: "#a5b4fc",
                fontSize: 10.5,
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: 6,
                letterSpacing: "0.03em",
              }}
              title="Columns analyzed and filtered for Machine Learning modeling (URLs, images, and noisy artifacts excluded)"
            >
              🤖 ML-READY FEATURES
            </span>
            {isLiveScraping && (
              <span
                style={{
                  background: "rgba(16, 185, 129, 0.2)",
                  border: "1px solid rgba(16, 185, 129, 0.5)",
                  color: "#34d399",
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "3px 10px",
                  borderRadius: 9999,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  letterSpacing: "0.04em",
                  boxShadow: "0 0 12px rgba(16, 185, 129, 0.3)",
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "#10b981",
                    boxShadow: "0 0 8px #10b981",
                    animation: "pulse 1s infinite",
                  }}
                />
                LIVE FILLING TABLE
              </span>
            )}
          </div>
          <p className="card-desc">
            {isLiveScraping
              ? "Live streaming and visiting each product to extract complete specifications and descriptions into the table…"
              : "Clean tabular features optimized for ML models (Titles, Categories, Prices, Ratings, Specs; URLs & images excluded)."}
          </p>
        </div>

        {/* Action buttons in table header */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {onExport && rows.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                className="btn-success btn-sm"
                onClick={() => onExport("csv")}
                title="Download current extracted rows directly to CSV"
                style={{
                  background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 11.5,
                  padding: "6px 13px",
                  borderRadius: 6,
                  boxShadow: "0 2px 8px rgba(16, 185, 129, 0.4)",
                  border: "none",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <Icons.Download />
                <span>Download CSV ({rows.length.toLocaleString()})</span>
              </button>

              <button
                className="btn-secondary btn-sm"
                onClick={() => onExport("xlsx")}
                title="Download current extracted rows to formatted Excel (.xlsx)"
                style={{ fontSize: 11.5, padding: "6px 10px" }}
              >
                <Icons.Download />
                <span>Excel (.xlsx)</span>
              </button>

              <button
                className="btn-secondary btn-sm"
                onClick={() => onExport("json")}
                title="Download current extracted rows to JSON"
                style={{ fontSize: 11.5, padding: "6px 10px" }}
              >
                <Icons.Download />
                <span>JSON</span>
              </button>
            </div>
          )}

          {/* Fullscreen Big View Toggle Button */}
          <button
            className="btn-secondary btn-sm"
            onClick={() => setIsBigView((prev) => !prev)}
            title={isBigView ? "Close big view" : "Expand table to big fullscreen desktop view"}
            style={{
              fontSize: 11.5,
              padding: "6px 11px",
              fontWeight: 650,
              background: isBigView ? "rgba(59, 130, 246, 0.2)" : undefined,
              borderColor: isBigView ? "#3b82f6" : undefined,
            }}
          >
            <span>{isBigView ? "🗗 Standard View" : "⛶ Big View"}</span>
          </button>

          {onRefresh && !isLiveScraping && (
            <button className="btn-secondary btn-sm" onClick={onRefresh} title="Refresh preview">
              <Icons.Refresh />
              <span>Refresh</span>
            </button>
          )}
        </div>
      </div>


      {/* Live extraction item ticker banner with instant download */}
      {isLiveScraping && (
        <div
          style={{
            background: "linear-gradient(90deg, rgba(16, 185, 129, 0.18) 0%, rgba(59, 130, 246, 0.15) 100%)",
            border: "1px solid rgba(16, 185, 129, 0.4)",
            borderRadius: "var(--radius-sm)",
            padding: "9px 14px",
            fontSize: 12.5,
            color: "#34d399",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            boxShadow: "0 2px 10px rgba(16, 185, 129, 0.15)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, overflow: "hidden" }}>
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: "50%",
                background: "#34d399",
                boxShadow: "0 0 10px #34d399",
                animation: "pulse 1s infinite",
                flexShrink: 0,
              }}
            />
            <span style={{ fontWeight: 700, color: "#10b981", flexShrink: 0 }}>
              Live Filling Table ({rows.length.toLocaleString()} rows · {columns.length} columns):
            </span>
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                color: "var(--text-main)",
                fontWeight: 600,
              }}
            >
              {latestItem ? `"${latestItem}"` : "Visiting items & streaming details into grid…"}
            </span>
          </div>

          {onExport && rows.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <button
                onClick={() => onExport("csv")}
                style={{
                  background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 5,
                  padding: "5px 12px",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  boxShadow: "0 2px 8px rgba(16, 185, 129, 0.5)",
                }}
                title="Download whatever has been captured so far into CSV immediately"
              >
                <Icons.Download />
                <span>Download CSV Now</span>
              </button>
            </div>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <div style={{ textAlign: "center", padding: "36px 20px", color: "var(--text-dim)" }}>
          No rows to preview yet. Make sure at least one field is selected and the selector matches visible elements.
        </div>
      ) : (
        <div className="table-container" ref={tableContainerRef}>
          {rows.length > maxRowsDisplay && (
            <div
              style={{
                fontSize: 11.5,
                color: "var(--text-muted)",
                padding: "8px 12px",
                background: "rgba(59, 130, 246, 0.1)",
                borderBottom: "1px solid rgba(59, 130, 246, 0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <span>
                ⚡ Big Grid View: Showing {showAllRows ? "all" : `latest ${maxRowsDisplay}`} of{" "}
                <strong>{rows.length.toLocaleString()}</strong> rows ({columns.length} columns active)
              </span>
              <button
                className="btn-secondary btn-sm"
                onClick={() => setShowAllRows((prev) => !prev)}
                style={{ fontSize: 11, padding: "3px 8px" }}
              >
                {showAllRows ? "Show Latest 100" : `Load All ${rows.length.toLocaleString()} Rows`}
              </button>
            </div>
          )}

          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 44, textAlign: "center" }}>#</th>
                {columns.map((col) => (
                  <th key={col} title={col}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayedRows.map((row, relativeIdx) => {
                const globalIdx =
                  rows.length > maxRowsDisplay && !showAllRows
                    ? rows.length - maxRowsDisplay + relativeIdx
                    : relativeIdx;
                const isRecent =
                  isLiveScraping &&
                  relativeIdx >= displayedRows.length - 4;

                return (
                  <tr
                    key={globalIdx}
                    style={{
                      backgroundColor: isRecent ? "rgba(16, 185, 129, 0.18)" : undefined,
                      boxShadow: isRecent ? "inset 3px 0 0 #10b981" : undefined,
                      transition: "all 0.3s ease",
                    }}
                  >
                    <td
                      style={{
                        color: "var(--text-dim)",
                        fontFamily: "monospace",
                        textAlign: "center",
                        fontWeight: 600,
                      }}
                    >
                      {globalIdx + 1}
                    </td>
                    {columns.map((col) => {
                      const val = row[col];
                      const isPrice = col.toLowerCase().includes("price") && val;
                      const isTitle =
                        (col.toLowerCase().includes("title") || col.toLowerCase() === "name") && val;

                      return (
                        <td
                          key={col}
                          title={val}
                          style={{
                            fontWeight: isTitle ? 650 : isPrice ? 700 : undefined,
                            color: isPrice ? "#34d399" : undefined,
                          }}
                        >
                          {val || <span style={{ color: "var(--text-dim)" }}>—</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
