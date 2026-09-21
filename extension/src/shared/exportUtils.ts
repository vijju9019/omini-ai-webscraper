import * as XLSX from "xlsx";
import { sanitizeDatasetForML } from "./mlFeatureAnalyzer";

export function formatTimestamp(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-z0-9_-]/gi, "_").toLowerCase().slice(0, 40) || "export";
}

export function buildCsv(rows: Record<string, string>[]): string {
  const cleanRows = sanitizeDatasetForML(rows);
  if (cleanRows.length === 0) return "";

  const columns = Array.from(
    cleanRows.reduce((acc, row) => {
      Object.keys(row).forEach((k) => acc.add(k));
      return acc;
    }, new Set<string>())
  );

  const escapeCell = (val: string | null | undefined): string => {
    const str = val === null || val === undefined ? "" : String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headerLine = columns.map(escapeCell).join(",");
  const dataLines = cleanRows.map((row) => columns.map((col) => escapeCell(row[col])).join(","));
  return "\ufeff" + [headerLine, ...dataLines].join("\r\n");
}

export function buildTsv(rows: Record<string, string>[]): string {
  const cleanRows = sanitizeDatasetForML(rows);
  if (cleanRows.length === 0) return "";

  const columns = Array.from(
    cleanRows.reduce((acc, row) => {
      Object.keys(row).forEach((k) => acc.add(k));
      return acc;
    }, new Set<string>())
  );

  const cleanCell = (val: string | null | undefined): string => {
    return (val === null || val === undefined ? "" : String(val))
      .replace(/\t/g, " ")
      .replace(/[\r\n]+/g, " ")
      .trim();
  };

  const headerLine = columns.join("\t");
  const dataLines = cleanRows.map((row) => columns.map((col) => cleanCell(row[col])).join("\t"));
  return [headerLine, ...dataLines].join("\n");
}

export function buildJson(rows: Record<string, string>[], sourceUrl: string): string {
  const cleanRows = sanitizeDatasetForML(rows);
  const payload = {
    metadata: {
      sourceUrl,
      exportedAt: new Date().toISOString(),
      rowCount: cleanRows.length,
      note: "Sanitized ML-ready feature dataset (links, images, and noisy artifacts excluded)",
    },
    data: cleanRows,
  };
  return JSON.stringify(payload, null, 2);
}

export function buildXlsxBase64(rows: Record<string, string>[]): string {
  const cleanRows = sanitizeDatasetForML(rows);
  const sheet = XLSX.utils.json_to_sheet(cleanRows);

  if (cleanRows.length > 0) {
    const colKeys = Object.keys(cleanRows[0]);
    sheet["!cols"] = colKeys.map((key) => {
      let maxLen = key.length;
      for (let i = 0; i < Math.min(cleanRows.length, 50); i++) {
        const val = cleanRows[i][key];
        if (val) maxLen = Math.max(maxLen, String(val).length);
      }
      return { wch: Math.min(Math.max(maxLen + 2, 10), 60) };
    });
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "ML Dataset");

  return XLSX.write(workbook, { bookType: "xlsx", type: "base64" });
}

export function getExportData(
  rows: Record<string, string>[],
  format: "csv" | "json" | "xlsx" | "tsv",
  sourceUrl: string
): { dataUrl?: string; tsvData?: string; filename: string } {
  const cleanRows = sanitizeDatasetForML(rows);
  const stamp = formatTimestamp();
  let host = "ml_dataset";
  try {
    host = sanitizeFilename(new URL(sourceUrl).hostname);
  } catch {
    // fallback
  }

  const baseFilename = `${host}_scrape_${stamp}`;

  switch (format) {
    case "csv": {
      const csv = buildCsv(rows);
      // UTF-8 BOM base64 or URI encoded
      const encoded = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
      return { dataUrl: encoded, filename: `${baseFilename}.csv` };
    }
    case "xlsx": {
      const base64 = buildXlsxBase64(rows);
      const dataUrl = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}`;
      return { dataUrl, filename: `${baseFilename}.xlsx` };
    }
    case "json": {
      const json = buildJson(rows, sourceUrl);
      const encoded = "data:application/json;charset=utf-8," + encodeURIComponent(json);
      return { dataUrl: encoded, filename: `${baseFilename}.json` };
    }
    case "tsv": {
      return { tsvData: buildTsv(rows), filename: `${baseFilename}.tsv` };
    }
  }
}
