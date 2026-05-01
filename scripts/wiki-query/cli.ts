#!/usr/bin/env -S npx tsx
import { parseArgs } from "node:util";
import path from "node:path";
import { loadCorpus } from "./loader.js";
import { applyFilters } from "./filters.js";
import { rank } from "./ranker.js";
import { snippet } from "./snippet.js";
import { renderText, renderJson } from "./render.js";

const VERSION = "0.1.0";

let values: {
  version?: boolean;
  type?: string;
  refs?: string;
  related?: string;
  root?: string;
  limit?: string;
  raw?: boolean;
  json?: boolean;
};
let positionals: string[];

try {
  const parsed = parseArgs({
    args: process.argv.slice(2),
    options: {
      type: { type: "string" },
      refs: { type: "string" },
      related: { type: "string" },
      root: { type: "string" },
      limit: { type: "string", default: "5" },
      raw: { type: "boolean" },
      json: { type: "boolean" },
      version: { type: "boolean" },
    },
    allowPositionals: true,
    strict: true,
  });
  values = parsed.values as typeof values;
  positionals = parsed.positionals;
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`wiki-query: ${message}\n`);
  process.exit(2);
}

if (values.version) {
  process.stdout.write(`wiki-query ${VERSION}\n`);
  process.exit(0);
}

const query = positionals[0] ?? "";
const limit = parseInt(values.limit ?? "5", 10);
if (!Number.isInteger(limit) || limit < 1) {
  process.stderr.write("wiki-query: --limit must be a positive integer\n");
  process.exit(2);
}

const wikiRoot = values.root
  ? path.resolve(values.root)
  : path.resolve(process.cwd(), "wiki");

const repoRoot = path.resolve(wikiRoot, "..");

let pages = loadCorpus(wikiRoot, { includeRaw: !!values.raw }, repoRoot);

pages = applyFilters(pages, {
  type: values.type,
  refs: values.refs,
  related: values.related,
});

const results = rank(pages, query, limit);

// Fill snippet field — ranker leaves it as "" per contract
for (const result of results) {
  result.snippet = snippet(result.page, query);
}

if (results.length === 0) {
  process.stderr.write("no matches\n");
  process.exit(1);
}

const output = values.json ? renderJson(results) : renderText(results);
process.stdout.write(output + "\n");
process.exit(0);
