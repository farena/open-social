import type { Page } from "./types.js";

const WINDOW = 100;
const MAX_LEN = 200;

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function snippet(page: Page, query: string): string {
  const body = page.body;

  const tokens = query.toLowerCase().match(/[a-z0-9_./-]+/g) ?? [];

  if (tokens.length === 0) {
    return collapseWhitespace(body.slice(0, MAX_LEN));
  }

  const bodyLower = body.toLowerCase();
  let earliestIdx = -1;
  let earliestTokenLen = 0;

  for (const token of tokens) {
    const idx = bodyLower.indexOf(token);
    if (idx !== -1) {
      if (earliestIdx === -1 || idx < earliestIdx) {
        earliestIdx = idx;
        earliestTokenLen = token.length;
      }
    }
  }

  if (earliestIdx === -1) {
    return collapseWhitespace(body.slice(0, MAX_LEN));
  }

  const start = Math.max(0, earliestIdx - WINDOW);
  const end = Math.min(body.length, earliestIdx + WINDOW + earliestTokenLen);
  const window = collapseWhitespace(body.slice(start, end));

  return window.slice(0, MAX_LEN);
}
