import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { StoredJob } from "../shared/models";
import { Icons } from "../ui/components/Icons";
import "../ui/styles.css";

function Popup() {
  const [job, setJob] = useState<StoredJob | null>(null);

  useEffect(() => {
    chrome.runtime.sendMessage({ type: "GET_JOB" }, (resp) => {
      if (resp?.ok && resp.job) {
        setJob(resp.job);
      }
    });
  }, []);

  const openSidePanel = async () => {
    try {
      const current = await chrome.windows.getCurrent();
      if (current.id !== undefined) {
        await chrome.sidePanel.open({ windowId: current.id });
        window.close();
      }
    } catch (err) {
      console.error("Could not open side panel:", err);
    }
  };

  return (
    <main
      style={{
        width: 320,
        padding: 16,
        background: "var(--bg-app)",
        color: "var(--text-main)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <div className="brand-icon">
          <Icons.Layers />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>WebScraper Pro</div>
          <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
            Manifest V3 Web Scraper
          </div>
        </div>
      </div>

      {job && job.rows.length > 0 && (
        <div
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border-color)",
            borderRadius: "var(--radius-md)",
            padding: "10px 12px",
            marginBottom: 12,
            fontSize: 12,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ color: "var(--text-muted)" }}>Extracted Data:</span>
            <span style={{ fontWeight: 600, color: "#60a5fa" }}>
              {job.rows.length} rows
            </span>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
            Status: {job.status.message}
          </div>
        </div>
      )}

      <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14, lineHeight: 1.4 }}>
        Open the Side Panel alongside your webpage to detect repeated cards, configure columns, and export data.
      </p>

      <button
        className="btn-primary"
        style={{ width: "100%", justifyContent: "center", padding: "9px 14px" }}
        onClick={() => void openSidePanel()}
      >
        <Icons.Layers />
        <span>Open Scraper Side Panel</span>
      </button>
    </main>
  );
}

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(<Popup />);
}