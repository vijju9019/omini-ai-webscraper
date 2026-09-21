export type FieldSource = "text" | "href" | "src" | "alt" | "datetime" | "attribute";

export type PaginationMode = "none" | "next" | "load-more" | "infinite-scroll";

export interface FieldDefinition {
  id: string;
  name: string;
  relativeSelector: string;
  source: FieldSource;
  attributeName?: string;
  selected: boolean;
  sampleValue?: string;
}

export interface CategoryItem {
  name: string;
  url: string;
  count?: number;
}

export interface CollectionCandidate {
  id: string;
  label: string;
  selector: string;
  score: number;
  rowCount: number;
  isTable?: boolean;
  fields: FieldDefinition[];
  sampleRows: Record<string, string>[];
  autoPagination?: {
    mode: PaginationMode;
    nextSelector?: string;
    label: string;
    totalPages?: number | null;
  };
  detectedCategories?: CategoryItem[];
}

export interface ExtractionRecipe {
  selector: string;
  isTable?: boolean;
  fields: FieldDefinition[];
}

export interface PaginationSettings {
  mode: PaginationMode;
  nextSelector?: string;
  maxPages: number;
  maxRows: number;
  waitMs: number;
  scrollDelayMs?: number;
  deepScrape?: boolean;
  traverseCategories?: boolean;
  crawlAllPages?: boolean;
  selectedCategories?: string[];
}

export interface ExtractionStatus {
  running: boolean;
  paused: boolean;
  message: string;
  pages: number;
  rows: number;
  duplicates: number;
  errors: string[];
  latestItem?: string;
}

export interface StoredJob {
  url: string;
  title?: string;
  recipe?: ExtractionRecipe;
  pagination?: PaginationSettings;
  rows: Record<string, string>[];
  status: ExtractionStatus;
  updatedAt?: number;
}