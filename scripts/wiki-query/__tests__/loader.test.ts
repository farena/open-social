import { describe, it, expect } from "vitest";
import * as nodePath from "node:path";
import { fileURLToPath } from "node:url";
import { loadCorpus } from "../loader.js";

const __dirname = nodePath.dirname(fileURLToPath(import.meta.url));
const FIXTURES_WIKI = nodePath.join(__dirname, "fixtures/wiki");
// repoRoot is one level above the fixtures/wiki dir (i.e. fixtures/)
// We use a consistent repoRoot so paths are deterministic relative to it.
const REPO_ROOT = nodePath.resolve(FIXTURES_WIKI, "../..");

describe("loadCorpus", () => {
  it("excludeRaw: returns exactly 1 page (entities/x.md)", () => {
    const pages = loadCorpus(FIXTURES_WIKI, { includeRaw: false }, REPO_ROOT);
    expect(pages).toHaveLength(1);
    expect(pages[0].path).toContain("entities/x.md");
  });

  it("includeRaw: returns exactly 2 pages (entities/x.md + raw/decisions/y.md)", () => {
    const pages = loadCorpus(FIXTURES_WIKI, { includeRaw: true }, REPO_ROOT);
    expect(pages).toHaveLength(2);
    const paths = pages.map((p) => p.path);
    expect(paths.some((p) => p.includes("entities/x.md"))).toBe(true);
    expect(paths.some((p) => p.includes("raw/decisions/y.md"))).toBe(true);
  });

  it("index.md and log.md are never returned regardless of includeRaw", () => {
    const pagesExcl = loadCorpus(FIXTURES_WIKI, { includeRaw: false }, REPO_ROOT);
    const pagesIncl = loadCorpus(FIXTURES_WIKI, { includeRaw: true }, REPO_ROOT);
    for (const pages of [pagesExcl, pagesIncl]) {
      for (const page of pages) {
        expect(page.path).not.toMatch(/(^|\/)index\.md$/);
        expect(page.path).not.toMatch(/(^|\/)log\.md$/);
      }
    }
  });

  it("Page.path strings use forward slashes and are relative to repoRoot", () => {
    const pages = loadCorpus(FIXTURES_WIKI, { includeRaw: true }, REPO_ROOT);
    for (const page of pages) {
      expect(page.path).not.toContain("\\");
      // must not start with / (relative path)
      expect(page.path).not.toMatch(/^\//);
    }
  });

  it("result is path-sorted", () => {
    const pages = loadCorpus(FIXTURES_WIKI, { includeRaw: true }, REPO_ROOT);
    const paths = pages.map((p) => p.path);
    const sorted = [...paths].sort();
    expect(paths).toEqual(sorted);
  });
});
