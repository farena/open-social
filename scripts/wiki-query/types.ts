export interface Page {
  path: string; // posix path relative to repo root, e.g. "wiki/pages/concepts/sse-streaming.md"
  frontmatter: {
    title?: string;
    type?: "entity" | "concept" | "source" | string;
    code_refs?: string[];
    related?: string[];
    sources?: string[];
    tags?: string[];
    confidence?: string;
    [k: string]: unknown;
  };
  body: string;
}

export interface Result {
  page: Page;
  score: number; // 0 in filter-only mode
  snippet: string;
}

export interface QueryOptions {
  query?: string;
  type?: string;
  refs?: string; // substring match against any code_refs entry
  related?: string; // exact match against any related entry
  limit?: number; // default 5
  includeRaw?: boolean; // default false
}
