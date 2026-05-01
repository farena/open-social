import { describe, it, expect } from "vitest";
import { snippet } from "../snippet.js";
import type { Page } from "../types.js";

function makePage(body: string): Page {
  return {
    path: "wiki/pages/test.md",
    frontmatter: { title: "Test" },
    body,
  };
}

describe("snippet", () => {
  it("match present: includes matched token and length ≤ 200", () => {
    const body =
      "Buffer stdout, split on newline, parse each line as JSON, translate to SSE frames.";
    const page = makePage(body);
    const result = snippet(page, "stdout");
    expect(result).toContain("stdout");
    expect(result.length).toBeLessThanOrEqual(200);
  });

  it("empty query: returns first 200 chars of body with whitespace collapsed", () => {
    const body = "a".repeat(300);
    const page = makePage(body);
    const result = snippet(page, "");
    expect(result.length).toBeLessThanOrEqual(200);
    expect(result).toBe(body.slice(0, 200));
  });

  it("no match: returns full body when shorter than 200", () => {
    const page = makePage("foo bar baz");
    const result = snippet(page, "xyzzy");
    expect(result).toBe("foo bar baz");
  });

  it("whitespace collapse: collapses newlines to single spaces", () => {
    const page = makePage("line one\n\n\nline two");
    const result = snippet(page, "");
    expect(result).toBe("line one line two");
  });

  it("earliest match across multiple query tokens: window centers around earliest token", () => {
    const body = "alpha beta gamma delta";
    const page = makePage(body);
    // "alpha" is at index 0, "gamma" is at index 12
    const result = snippet(page, "gamma alpha");
    // Window should be centered around "alpha" (index 0), so snippet starts at beginning
    expect(result.startsWith("alpha")).toBe(true);
  });

  it("window cap: result is ≤ 200 chars and contains the target", () => {
    // Build a 500-char body with "target" around char 250
    const prefix = "x ".repeat(125); // 250 chars
    const suffix = "x ".repeat(125); // 250 chars
    const body = prefix + "target" + suffix;
    const page = makePage(body);
    const result = snippet(page, "target");
    expect(result.length).toBeLessThanOrEqual(200);
    expect(result).toContain("target");
  });
});
