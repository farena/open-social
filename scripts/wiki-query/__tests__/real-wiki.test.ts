import { spawnSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, "../../..");
const CLI_PATH = path.join(REPO_ROOT, "scripts/wiki-query/cli.ts");
const WIKI_ROOT = path.join(REPO_ROOT, "wiki");
const WIKI_PAGES_DIR = path.join(WIKI_ROOT, "pages");

const wikiExists = fs.existsSync(WIKI_PAGES_DIR);
const rawDir = path.join(WIKI_ROOT, "raw");
const rawExists =
  fs.existsSync(rawDir) &&
  (fs.readdirSync(rawDir, { recursive: true, withFileTypes: true }) as fs.Dirent[]).some(
    (e) => e.isFile()
  );

describe("real-wiki smoke tests", () => {
  it("puppeteer query — top 5 includes export-pipeline.md", (ctx) => {
    if (!wikiExists) {
      ctx.skip();
      return;
    }
    const result = spawnSync(
      "npx",
      ["tsx", CLI_PATH, "puppeteer", "--limit", "5", "--root", WIKI_ROOT],
      { cwd: REPO_ROOT, encoding: "utf8" }
    );
    expect(result.status, `stderr: ${result.stderr}`).toBe(0);
    expect(result.stdout, `stdout: ${result.stdout}`).toContain(
      "wiki/pages/entities/export-pipeline.md"
    );
  });

  it("--raw broadens the corpus to include wiki/raw/ entries", (ctx) => {
    if (!wikiExists || !rawExists) {
      ctx.skip();
      return;
    }
    // Filter-only mode (no query) returns every page in the corpus, sorted by
    // path. With --raw and a high limit, at least one wiki/raw/ entry must
    // appear. Without --raw, none should.
    const withRaw = spawnSync(
      "npx",
      ["tsx", CLI_PATH, "--limit", "100", "--raw", "--root", WIKI_ROOT],
      { cwd: REPO_ROOT, encoding: "utf8" }
    );
    expect(withRaw.status, `stderr: ${withRaw.stderr}`).toBe(0);
    expect(withRaw.stdout).toMatch(/wiki\/raw\//);

    const withoutRaw = spawnSync(
      "npx",
      ["tsx", CLI_PATH, "--limit", "100", "--root", WIKI_ROOT],
      { cwd: REPO_ROOT, encoding: "utf8" }
    );
    expect(withoutRaw.status, `stderr: ${withoutRaw.stderr}`).toBe(0);
    expect(withoutRaw.stdout).not.toMatch(/wiki\/raw\//);
  });

  it("--type concept — includes sse-streaming.md", (ctx) => {
    if (!wikiExists) {
      ctx.skip();
      return;
    }
    const result = spawnSync(
      "npx",
      ["tsx", CLI_PATH, "--type", "concept", "--root", WIKI_ROOT],
      { cwd: REPO_ROOT, encoding: "utf8" }
    );
    expect(result.status, `stderr: ${result.stderr}`).toBe(0);
    expect(result.stdout, `stdout: ${result.stdout}`).toContain(
      "wiki/pages/concepts/sse-streaming.md"
    );
  });

  it("--refs path-style — finds pages whose code_refs contain a Next.js dynamic-route path", (ctx) => {
    if (!wikiExists) {
      ctx.skip();
      return;
    }
    // src/app/api/content/[id]/generate/route.ts lives in code_refs of generate-route.md
    // — exercises the bracket-path frontmatter pre-processor.
    const result = spawnSync(
      "npx",
      [
        "tsx",
        CLI_PATH,
        "--refs",
        "src/app/api/content/[id]/generate/route.ts",
        "--root",
        WIKI_ROOT,
      ],
      { cwd: REPO_ROOT, encoding: "utf8" }
    );
    expect(result.status, `stderr: ${result.stderr}`).toBe(0);
    expect(result.stdout, `stdout: ${result.stdout}`).toContain(
      "wiki/pages/entities/generate-route.md"
    );
  });
});
