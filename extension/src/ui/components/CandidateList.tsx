import React from "react";
import type { CollectionCandidate } from "../../shared/models";
import { Icons } from "./Icons";

interface CandidateListProps {
  candidates: CollectionCandidate[];
  selectedId?: string;
  onSelect: (candidate: CollectionCandidate) => void;
  onHover?: (selector: string | null) => void;
  onDetect: () => void;
  onPick: () => void;
  isScanning: boolean;
}

export const CandidateList: React.FC<CandidateListProps> = ({
  candidates,
  selectedId,
  onSelect,
  onHover,
  onDetect,
  onPick,
  isScanning,
}) => {
  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">
            <Icons.Layers />
            <span>Repeating Data Collections</span>
          </h2>
          <p className="card-desc">
            Select a repeating container detected on the page or pick one manually.
          </p>
        </div>
      </div>

      {candidates.length === 0 ? (
        <div style={{ textAlign: "center", padding: "28px 16px" }}>
          <p style={{ color: "var(--text-muted)", marginBottom: 14 }}>
            No repeating data collections detected yet. Click "Detect" to scan the page, or use the interactive picker to select any item directly.
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: 10 }}>
            <button className="btn-secondary" onClick={onPick} disabled={isScanning}>
              <Icons.Crosshair />
              <span>Pick on Page</span>
            </button>
            <button className="btn-primary" onClick={onDetect} disabled={isScanning}>
              {isScanning ? <Icons.Refresh /> : <Icons.Search />}
              <span>{isScanning ? "Scanning Page…" : "Detect Page Data"}</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="candidates-grid">
          {candidates.map((cand) => {
            const isSelected = selectedId === cand.id;
            return (
              <div
                key={cand.id}
                className={`candidate-item ${isSelected ? "selected" : ""}`}
                onClick={() => onSelect(cand)}
                onMouseEnter={() => onHover?.(cand.selector)}
                onMouseLeave={() => onHover?.(null)}
              >
                <div className="candidate-meta">
                  <div className="candidate-name">{cand.label}</div>
                  <div className="candidate-selector" title={cand.selector}>
                    {cand.selector}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {cand.isTable && (
                    <span className="badge-pill badge-primary" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <Icons.Table /> Table
                    </span>
                  )}
                  <span className="badge-pill badge-success">{cand.rowCount} rows</span>
                  <span className="badge-pill">{cand.score}% score</span>
                  <span style={{ color: isSelected ? "var(--primary)" : "var(--text-dim)" }}>
                    <Icons.ChevronRight />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
