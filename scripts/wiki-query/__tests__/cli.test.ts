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

describe("cli smoke", () => {
  it("prints version on --version and exits 0", () => {
    const result = spawnSync(
      "npx",
      ["tsx", CLI_PATH, "--version"],
      { cwd: REPO_ROOT, encoding: "utf8" }
    );
    expect(result.status, `stderr: ${result.stderr}`).toBe(0);
    expect(result.stdout.trim()).toMatch(/^wiki-query \d+\.\d+\.\d+$/);
  });
});

describe("cli integration", () => {
  const wikiExists = fs.existsSync(WIKI_PAGES_DIR);

  it("real wiki — query 'session' returns exit 0 with a page path", () => {
    if (!wikiExists) {
      console.log("skip: wiki/pages/ does not exist");
      return;
    }
    const result = spawnSync(
      "npx",
      ["tsx", CLI_PATH, "session", "--root", WIKI_ROOT],
      { cwd: REPO_ROOT, encoding: "utf8" }
    );
    expect(result.status, `stderr: ${result.stderr}`).toBe(0);
    // stdout should contain at least one .md path
    expect(result.stdout).toMatch(/\.md/);
  });

  it("filter-only mode — --type entity exits 0 with at least one entity path", () => {
    if (!wikiExists) {
      console.log("skip: wiki/pages/ does not exist");
      return;
    }
    const result = spawnSync(
      "npx",
      ["tsx", CLI_PATH, "--type", "entity", "--root", WIKI_ROOT],
      { cwd: REPO_ROOT, encoding: "utf8" }
    );
    expect(result.status, `stderr: ${result.stderr}`).toBe(0);
    expect(result.stdout).toMatch(/\.md/);
  });

  it("no matches — exits 1, stderr contains 'no matches'", () => {
    if (!wikiExists) {
      console.log("skip: wiki/pages/ does not exist");
      return;
    }
    const result = spawnSync(
      "npx",
      ["tsx", CLI_PATH, "totally-not-in-the-wiki-xyzzy", "--root", WIKI_ROOT],
      { cwd: REPO_ROOT, encoding: "utf8" }
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("no matches");
  });

  it("JSON output — exits 0, stdout parses as JSON array with required keys", () => {
    if (!wikiExists) {
      console.log("skip: wiki/pages/ does not exist");
      return;
    }
    const result = spawnSync(
      "npx",
      ["tsx", CLI_PATH, "session", "--json", "--root", WIKI_ROOT],
      { cwd: REPO_ROOT, encoding: "utf8" }
    );
    expect(result.status, `stderr: ${result.stderr}`).toBe(0);
    let parsed: unknown;
    expect(() => {
      parsed = JSON.parse(result.stdout);
    }).not.toThrow();
    expect(Array.isArray(parsed)).toBe(true);
    const arr = parsed as Record<string, unknown>[];
    expect(arr.length).toBeGreaterThan(0);
    for (const item of arr) {
      expect(item).toHaveProperty("path");
      expect(item).toHaveProperty("score");
      expect(item).toHaveProperty("frontmatter");
      expect(item).toHaveProperty("snippet");
    }
  });

  it("limit — --limit 2 returns at most 2 result blocks", () => {
    if (!wikiExists) {
      console.log("skip: wiki/pages/ does not exist");
      return;
    }
    const result = spawnSync(
      "npx",
      ["tsx", CLI_PATH, "", "--limit", "2", "--type", "entity", "--root", WIKI_ROOT],
      { cwd: REPO_ROOT, encoding: "utf8" }
    );
    expect(result.status, `stderr: ${result.stderr}`).toBe(0);
    // Each result block has a header line matching "*.md  (score ...)"
    const blocks = (result.stdout.match(/\.md  \(score /g) ?? []).length;
    expect(blocks).toBeLessThanOrEqual(2);
  });

  it("raw flag — exits 0, stdout includes a path under wiki/raw/", () => {
    const rawDir = path.join(WIKI_ROOT, "raw");
    const rawExists = fs.existsSync(rawDir) &&
      fs.readdirSync(rawDir, { recursive: true, withFileTypes: true })
        .some((e) => (e as { isFile: () => boolean }).isFile());

    if (!wikiExists || !rawExists) {
      console.log("skip: no raw entries");
      return;
    }
    const result = spawnSync(
      "npx",
      ["tsx", CLI_PATH, "puppeteer", "--raw", "--limit", "20", "--root", WIKI_ROOT],
      { cwd: REPO_ROOT, encoding: "utf8" }
    );
    expect(result.status, `stderr: ${result.stderr}`).toBe(0);
    expect(result.stdout).toMatch(/wiki\/raw\//);
  });
});
