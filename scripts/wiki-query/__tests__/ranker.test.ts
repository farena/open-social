import { describe, it, expect } from "vitest";
import { rank } from "../ranker.js";
import type { Page } from "../types.js";

const puppeteerPage: Page = {
  path: "wiki/pages/entities/export-pipeline.md",
  frontmatter: { type: "entity" },
  body: "Puppeteer is used to screenshot HTML slides. It loads fonts before capturing. Font timeout issues can cause export failures.",
};

const reactPage: Page = {
  path: "wiki/pages/concepts/react-hooks.md",
  frontmatter: { type: "concept" },
  body: "React hooks provide a way to use state and lifecycle features in function components. useState and useEffect are the most common hooks.",
};

const yamlPage: Page = {
  path: "wiki/pages/concepts/yaml-parsers.md",
  frontmatter: { type: "concept" },
  body: "YAML parsers convert YAML documents to JavaScript objects. js-yaml and gray-matter are popular choices in the Node ecosystem.",
};

const pathRefPage: Page = {
  path: "wiki/pages/entities/data-layer.md",
  frontmatter: { type: "entity", code_refs: ["src/lib/data.ts"] },
  body: "The data layer is implemented in src/lib/data.ts using async-mutex for safe concurrent writes.",
};

const pages: Page[] = [puppeteerPage, reactPage, yamlPage];

describe("rank", () => {
  it("ranking: puppeteer page scores highest for 'puppeteer' query", () => {
    const results = rank(pages, "puppeteer", 3);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].page.path).toBe(puppeteerPage.path);
    expect(results[0].score).toBeGreaterThan(0);
  });

  it("empty query: returns all pages with score 0 sorted by path", () => {
    const results = rank(pages, "", 5);
    expect(results).toHaveLength(pages.length);
    for (const r of results) {
      expect(r.score).toBe(0);
    }
    const paths = results.map((r) => r.page.path);
    const sorted = [...paths].sort((a, b) => a.localeCompare(b));
    expect(paths).toEqual(sorted);
  });

  it("limit: rank(pages, '', 1) returns exactly 1 result", () => {
    const results = rank(pages, "", 1);
    expect(results).toHaveLength(1);
  });

  it("path tokenizer: page with 'src/lib/data.ts' in body is retrievable by that query", () => {
    const corpus = [...pages, pathRefPage];
    const results = rank(corpus, "src/lib/data.ts", 5);
    expect(results.length).toBeGreaterThan(0);
    const match = results.find((r) => r.page.path === pathRefPage.path);
    expect(match).toBeDefined();
    expect(match!.score).toBeGreaterThan(0);
  });

  it("no matches: returns empty array for absent keyword", () => {
    const results = rank(pages, "totallyabsentkeyword", 5);
    expect(results).toEqual([]);
  });
});
