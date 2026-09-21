import React, { useState } from "react";
import { Icons } from "./Icons";

interface ExportBarProps {
  rowCount: number;
  onExport: (format: "csv" | "xlsx" | "json" | "tsv") => Promise<void>;
  isExporting: boolean;
}

export const ExportBar: React.FC<ExportBarProps> = ({
  rowCount,
  onExport,
  isExporting,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopyTsv = async () => {
    await onExport("tsv");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h2 className="card-title">
            <Icons.Download />
            <span>Export Extracted Dataset ({rowCount} rows)</span>
          </h2>
          <p className="card-desc">
            Download the scraped data locally or copy to clipboard for spreadsheets.
          </p>
        </div>
      </div>

      <div className="export-grid">
        <button
          className="btn-secondary"
          onClick={() => onExport("csv")}
          disabled={rowCount === 0 || isExporting}
          title="Download as CSV with UTF-8 BOM"
        >
          <Icons.Download />
          <span>CSV (.csv)</span>
        </button>

        <button
          className="btn-secondary"
          onClick={() => onExport("xlsx")}
          disabled={rowCount === 0 || isExporting}
          title="Download as Microsoft Excel Workbook"
        >
          <Icons.Download />
          <span>Excel (.xlsx)</span>
        </button>

        <button
          className="btn-secondary"
          onClick={() => onExport("json")}
          disabled={rowCount === 0 || isExporting}
          title="Download as structured JSON"
        >
          <Icons.Download />
          <span>JSON (.json)</span>
        </button>

        <button
          className={copied ? "btn-success" : "btn-secondary"}
          onClick={handleCopyTsv}
          disabled={rowCount === 0 || isExporting}
          title="Copy formatted TSV data for Google Sheets"
        >
          {copied ? <Icons.Check /> : <Icons.Copy />}
          <span>{copied ? "Copied TSV!" : "Copy (TSV)"}</span>
        </button>
      </div>
    </div>
  );
};
