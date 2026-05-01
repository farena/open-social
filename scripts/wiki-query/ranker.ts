import MiniSearch from "minisearch";
import type { Page, Result } from "./types.js";

const tokenize = (text: string): string[] =>
  text.toLowerCase().match(/[a-z0-9_./-]+/g) ?? [];

export function rank(pages: Page[], query: string, limit: number): Result[] {
  if (query.trim() === "") {
    return [...pages]
      .sort((a, b) => a.path.localeCompare(b.path))
      .slice(0, limit)
      .map((page) => ({ page, score: 0, snippet: "" }));
  }

  const ms = new MiniSearch<Page>({
    fields: ["body"],
    storeFields: ["path"],
    idField: "path",
    tokenize,
    searchOptions: {
      tokenize,
      fuzzy: 0.1,
      prefix: true,
      combineWith: "AND",
    },
  });

  ms.addAll(pages);

  const hits = ms.search(query);

  const pageByPath = new Map<string, Page>(pages.map((p) => [p.path, p]));

  return hits
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((hit) => ({
      page: pageByPath.get(hit.id as string)!,
      score: hit.score,
      snippet: "",
    }));
}
