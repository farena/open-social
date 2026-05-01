import type { Page } from "./types.js";

export interface FilterOptions {
  type?: string;
  refs?: string;
  related?: string;
}

const norm = (s: string): string =>
  s.replace(/^pages\//, "").replace(/\.md$/, "");

export function applyFilters(pages: Page[], options: FilterOptions): Page[] {
  const { type, refs, related } = options;

  return pages.filter((page) => {
    if (type !== undefined) {
      if (page.frontmatter.type !== type) return false;
    }

    if (refs !== undefined) {
      const codeRefs = page.frontmatter.code_refs;
      if (!codeRefs || codeRefs.length === 0) return false;
      if (!codeRefs.some((r) => r.includes(refs))) return false;
    }

    if (related !== undefined) {
      const relatedEntries = page.frontmatter.related;
      if (!relatedEntries || relatedEntries.length === 0) return false;
      const normalizedQuery = norm(related);
      if (!relatedEntries.some((r) => norm(r) === normalizedQuery)) return false;
    }

    return true;
  });
}
