import type { Result } from "./types.js";

/**
 * Render results as human-readable text.
 *
 * Format per result:
 *   wiki/pages/concepts/sse-streaming.md  (score 4.21)
 *     Buffer stdout, split on newline…
 */
export function renderText(results: Result[]): string {
  if (results.length === 0) return "";

  return results
    .map((r) => {
      const header = `${r.page.path}  (score ${r.score.toFixed(2)})`;
      const body = `  ${r.snippet}`;
      return `${header}\n${body}`;
    })
    .join("\n\n");
}

/**
 * Render results as a JSON array.
 *
 * Each item: { path, score, frontmatter, snippet }
 */
export function renderJson(results: Result[]): string {
  const payload = results.map((r) => ({
    path: r.page.path,
    score: r.score,
    frontmatter: r.page.frontmatter,
    snippet: r.snippet,
  }));

  return JSON.stringify(payload, null, 2);
}
