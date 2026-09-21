import type { CollectionCandidate, ExtractionRecipe, PaginationSettings, StoredJob } from "./models";

export type RequestMessage =
  | { type: "DISCOVER" }
  | { type: "EXTRACT_PREVIEW"; recipe: ExtractionRecipe; limit?: number }
  | { type: "PICK_COLLECTION" }
  | { type: "CANCEL_PICKER" }
  | { type: "PICK_PAGINATION_CONTROL" }
  | { type: "HIGHLIGHT_COLLECTION"; selector?: string | null }
  | { type: "RUN_EXTRACTION"; recipe: ExtractionRecipe; pagination: PaginationSettings }
  | { type: "PAUSE_EXTRACTION" }
  | { type: "RESUME_EXTRACTION" }
  | { type: "STOP_EXTRACTION" }
  | { type: "GET_JOB" }
  | { type: "RESET_JOB" }
  | { type: "EXPORT"; format: "csv" | "json" | "xlsx" | "tsv" };

export type ContentEventMessage =
  | {
      type: "EXTRACTION_PROGRESS";
      rows: Record<string, string>[];
      pages: number;
      duplicates: number;
      message: string;
      latestItem?: string;
      paused?: boolean;
    }
  | {
      type: "EXTRACTION_DONE";
      rows: Record<string, string>[];
      message: string;
      errors?: string[];
    };

export type ResponseMessage =
  | { ok: true; candidates: CollectionCandidate[] }
  | { ok: true; rows: Record<string, string>[] }
  | { ok: true; selected: CollectionCandidate }
  | { ok: true; paginationSelector: string; text?: string }
  | { ok: true; started: true }
  | { ok: true; paused: true }
  | { ok: true; resumed: true }
  | { ok: true; stopped: true }
  | { ok: true; highlighted: boolean }
  | { ok: true; job: StoredJob | null }
  | { ok: true; reset: true }
  | { ok: true; exported: true; filename?: string; tsvData?: string }
  | { ok: false; error: string };