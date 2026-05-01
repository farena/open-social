import * as nodeFs from "node:fs";
import * as nodePath from "node:path";
import { parsePage } from "./parser.js";
import type { Page } from "./types.js";

const SKIP_BASENAMES = new Set(["index.md", "log.md"]);

/**
 * Walk the wiki directory and return all parseable pages.
 *
 * @param wikiRoot   Absolute path to the wiki root directory.
 * @param options    includeRaw: whether to include files under wiki/raw/.
 * @param repoRoot   Absolute path to the repo root (used for relative paths).
 *                   Defaults to the parent of wikiRoot.
 */
export function loadCorpus(
  wikiRoot: string,
  options: { includeRaw: boolean },
  repoRoot?: string
): Page[] {
  const resolvedRepoRoot = repoRoot ?? nodePath.resolve(wikiRoot, "..");

  const entries = nodeFs.readdirSync(wikiRoot, {
    recursive: true,
    withFileTypes: true,
  });

  // Normalize the raw directory prefix using posix separators for comparison
  const rawSegment = ["wiki", "raw"].join("/");

  const pages: Page[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!entry.name.endsWith(".md")) continue;
    if (SKIP_BASENAMES.has(entry.name)) continue;

    // entry.parentPath is available in Node 20.12+ (was entry.path before)
    // Use whichever is available
    const parentPath =
      (entry as { parentPath?: string }).parentPath ??
      (entry as { path?: string }).path ??
      "";
    const absPath = nodePath.join(parentPath, entry.name);

    // Compute posix-relative path from repoRoot to check raw exclusion
    const relPosix = nodePath
      .relative(resolvedRepoRoot, absPath)
      .split(nodePath.sep)
      .join("/");

    const isUnderRaw =
      relPosix.includes(`/${rawSegment}/`) ||
      relPosix.startsWith(`${rawSegment}/`);

    if (isUnderRaw && !options.includeRaw) continue;

    try {
      pages.push(parsePage(absPath, resolvedRepoRoot));
    } catch {
      // Skip files that fail to parse (e.g. no frontmatter)
    }
  }

  // Sort by path for deterministic output
  pages.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  return pages;
}
