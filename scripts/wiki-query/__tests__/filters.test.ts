import { describe, it, expect } from "vitest";
import { applyFilters } from "../filters.js";
import type { Page } from "../types.js";

const makePage = (overrides: Partial<Page> & { frontmatter: Page["frontmatter"] }): Page => ({
  path: "wiki/pages/test.md",
  body: "",
  ...overrides,
});

describe("applyFilters", () => {
  it("test 1 — type filter returns only matching type", () => {
    const pages: Page[] = [
      makePage({ path: "wiki/pages/entities/a.md", frontmatter: { type: "entity" } }),
      makePage({ path: "wiki/pages/concepts/b.md", frontmatter: { type: "concept" } }),
      makePage({ path: "wiki/pages/sources/c.md", frontmatter: { type: "source" } }),
    ];
    const result = applyFilters(pages, { type: "concept" });
    expect(result).toHaveLength(1);
    expect(result[0].frontmatter.type).toBe("concept");
  });

  it("test 2 — refs substring match", () => {
    const pages: Page[] = [
      makePage({ path: "a.md", frontmatter: { code_refs: ["src/lib/data.ts"] } }),
      makePage({ path: "b.md", frontmatter: { code_refs: ["src/lib/foo.ts"] } }),
    ];
    const resultData = applyFilters(pages, { refs: "data.ts" });
    expect(resultData).toHaveLength(1);
    expect(resultData[0].frontmatter.code_refs).toContain("src/lib/data.ts");

    const resultLib = applyFilters(pages, { refs: "src/lib" });
    expect(resultLib).toHaveLength(2);
  });

  it("test 3 — related exact match with normalization", () => {
    const pageA: Page = makePage({
      path: "a.md",
      frontmatter: { related: ["pages/entities/chat-route.md"] },
    });
    const pageB: Page = makePage({
      path: "b.md",
      frontmatter: { related: ["pages/concepts/sse-streaming.md"] },
    });
    const pages = [pageA, pageB];

    const r1 = applyFilters(pages, { related: "entities/chat-route.md" });
    expect(r1).toHaveLength(1);
    expect(r1[0]).toBe(pageA);

    const r2 = applyFilters(pages, { related: "pages/entities/chat-route" });
    expect(r2).toHaveLength(1);
    expect(r2[0]).toBe(pageA);

    const r3 = applyFilters(pages, { related: "concepts/sse-streaming" });
    expect(r3).toHaveLength(1);
    expect(r3[0]).toBe(pageB);
  });

  it("test 4 — AND composition: type and refs both must match", () => {
    const pages: Page[] = [
      makePage({ path: "a.md", frontmatter: { type: "entity", code_refs: ["src/lib/data.ts"] } }),
      makePage({ path: "b.md", frontmatter: { type: "entity", code_refs: ["src/lib/foo.ts"] } }),
      makePage({ path: "c.md", frontmatter: { type: "concept", code_refs: ["src/lib/data.ts"] } }),
    ];
    const result = applyFilters(pages, { type: "entity", refs: "data.ts" });
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe("a.md");
  });

  it("test 5 — missing fields exclude page when filter is set", () => {
    const noRefs: Page = makePage({ path: "a.md", frontmatter: {} });
    const noRelated: Page = makePage({ path: "b.md", frontmatter: {} });

    const r1 = applyFilters([noRefs], { refs: "data.ts" });
    expect(r1).toHaveLength(0);

    const r2 = applyFilters([noRelated], { related: "entities/chat-route" });
    expect(r2).toHaveLength(0);
  });

  it("test 6 — no options returns all pages unchanged", () => {
    const pages: Page[] = [
      makePage({ path: "a.md", frontmatter: { type: "entity" } }),
      makePage({ path: "b.md", frontmatter: { type: "concept" } }),
      makePage({ path: "c.md", frontmatter: {} }),
    ];
    const result = applyFilters(pages, {});
    expect(result).toHaveLength(3);
    expect(result).toEqual(pages);
  });
});
