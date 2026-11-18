import React from "react";
import { Icons } from "./Icons";

interface HeaderProps {
  onDiscover: () => void;
  onPick: () => void;
  onOpenBatch: () => void;
  isScraping: boolean;
  isDiscovering: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onDiscover,
  onPick,
  onOpenBatch,
  isScraping,
  isDiscovering,
}) => {
  return (
    <header className="app-header">
      <div className="brand">
        <div className="brand-icon" style={{ background: "transparent", padding: 0, overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <img src="/icons/icon-48.png" alt="OmniScrape AI" style={{ width: 32, height: 32, borderRadius: 8, objectFit: "cover" }} />
        </div>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <h1 className="brand-title" style={{ margin: 0, fontSize: 14.5, fontWeight: 700, letterSpacing: "-0.02em" }}>
              OmniScrape AI
            </h1>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: "2px 6px",
                borderRadius: 4,
                background: "rgba(16, 185, 129, 0.2)",
                color: "#34d399",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              100% Free Forever
            </span>
          </div>
          <div style={{ fontSize: 10.5, color: "var(--text-dim)", marginTop: 1 }}>
            AI Web Scraper & Automation Agent · Unlimited
          </div>
        </div>
      </div>

      <div className="header-actions">
        <button
          className="btn-secondary btn-sm"
          onClick={onOpenBatch}
          disabled={isScraping || isDiscovering}
          title="Scrape multiple websites in batch mode"
          style={{ borderRadius: 6 }}
        >
          <Icons.Layers />
          <span>Batch URLs</span>
        </button>

        <button
          className="btn-secondary btn-sm"
          onClick={onPick}
          disabled={isScraping || isDiscovering}
          title="Pick an element directly on the webpage"
          style={{ borderRadius: 6 }}
        >
          <Icons.Crosshair />
          <span>Pick Item</span>
        </button>

        <button
          className="btn-primary btn-sm"
          onClick={onDiscover}
          disabled={isScraping || isDiscovering}
          title="Detect structured repeating data on current page"
          style={{ borderRadius: 6 }}
        >
          {isDiscovering ? <Icons.Refresh /> : <Icons.Search />}
          <span>{isDiscovering ? "Scanning…" : "Detect"}</span>
        </button>
      </div>
    </header>
  );
};
