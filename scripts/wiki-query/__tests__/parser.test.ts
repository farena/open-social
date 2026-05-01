import { describe, it, expect } from "vitest";
import * as nodePath from "node:path";
import * as nodeFs from "node:fs";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import { parsePage } from "../parser.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = nodePath.dirname(__filename);
const REPO_ROOT = nodePath.resolve(__dirname, "../../..");
const FIXTURES_DIR = nodePath.join(__dirname, "fixtures");
const SAMPLE_ENTITY = nodePath.join(FIXTURES_DIR, "sample-entity.md");

describe("parsePage", () => {
  it("happy path: parses entity fixture correctly", () => {
    const page = parsePage(SAMPLE_ENTITY, REPO_ROOT);

    expect(page.frontmatter.type).toBe("entity");
    expect(Array.isArray(page.frontmatter.code_refs)).toBe(true);
    expect(page.frontmatter.code_refs).toHaveLength(2);
    expect(page.frontmatter.code_refs?.[0]).toBe("src/lib/foo.ts");
    expect(page.body).not.toMatch(/^---/m);
    // body starts with the first content line (not blank)
    expect(page.body.trimStart()).toMatch(/^[^-]/);
    expect(page.path).toMatch(/scripts\/wiki-query\/__tests__\/fixtures\/sample-entity\.md$/);
    expect(page.path).not.toContain("\\");
  });

  it("no frontmatter: throws an Error naming the path", () => {
    const tmpDir = os.tmpdir();
    const tmpFile = nodePath.join(tmpDir, "no-frontmatter.md");
    nodeFs.writeFileSync(tmpFile, "Just some content without frontmatter.\n\nSecond paragraph.\n", "utf8");
    expect(() => parsePage(tmpFile, REPO_ROOT)).toThrowError(/no-frontmatter\.md/);
  });

  it("body contains literal ---: parsed body still includes the separator", () => {
    const tmpDir = os.tmpdir();
    const tmpFile = nodePath.join(tmpDir, "with-separator.md");
    const content = [
      "---",
      "title: Separator Test",
      "type: concept",
      "---",
      "",
      "First section.",
      "",
      "---",
      "",
      "Second section after a horizontal rule.",
      "",
    ].join("\n");
    nodeFs.writeFileSync(tmpFile, content, "utf8");
    const page = parsePage(tmpFile, REPO_ROOT);
    expect(page.body).toContain("---");
    expect(page.body).toContain("Second section after a horizontal rule.");
  });

  it("list values: flow style and block style both produce string[]", () => {
    const tmpDir = os.tmpdir();

    const flowFile = nodePath.join(tmpDir, "flow-list.md");
    nodeFs.writeFileSync(
      flowFile,
      "---\ntitle: Flow\ntype: entity\ncode_refs: [a, b]\n---\nBody.\n",
      "utf8"
    );
    const flowPage = parsePage(flowFile, REPO_ROOT);
    expect(Array.isArray(flowPage.frontmatter.code_refs)).toBe(true);
    expect(flowPage.frontmatter.code_refs).toEqual(["a", "b"]);

    const blockFile = nodePath.join(tmpDir, "block-list.md");
    nodeFs.writeFileSync(
      blockFile,
      "---\ntitle: Block\ntype: entity\ncode_refs:\n  - a\n  - b\n---\nBody.\n",
      "utf8"
    );
    const blockPage = parsePage(blockFile, REPO_ROOT);
    expect(Array.isArray(blockPage.frontmatter.code_refs)).toBe(true);
    expect(blockPage.frontmatter.code_refs).toEqual(["a", "b"]);
  });
});
