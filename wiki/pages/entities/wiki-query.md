---
title: wiki-query CLI
type: entity
code_refs: [scripts/wiki-query/cli.ts, scripts/wiki-query/loader.ts, scripts/wiki-query/parser.ts, scripts/wiki-query/ranker.ts, scripts/wiki-query/filters.ts, scripts/wiki-query/snippet.ts, scripts/wiki-query/render.ts, scripts/wiki-query/types.ts, scripts/wiki-query/README.md, package.json]
sources: [raw/decisions/wiki-query-frontmatter-preprocessor-2026-05-01.md]
related: [pages/concepts/structured-slide-model.md]
created: 2026-05-01
updated: 2026-05-01
confidence: high
---

# wiki-query CLI

Local BM25 search tool over the project wiki. Pure Node + TypeScript, no LLM, no network, no model download. Runs as `npx wiki-query "<query>" [options]` from the repo root; the binary is wired through the `bin` field in `package.json` and uses `tsx` to execute `scripts/wiki-query/cli.ts` directly.

## Why it exists

Both Claude (during chat / generation) and the human author need a fast way to find relevant wiki pages without loading them all into context. The wiki is small enough today that an in-memory index built per query is fine; if the corpus ever exceeds ~500 pages an mtime-keyed cache can be added (out of scope for v1).

The tool deliberately does not use embeddings or an LLM — keyword BM25 is enough for the corpus size, has zero infrastructure cost, and produces deterministic, debuggable results.

## Pipeline

`cli.ts` parses flags → `loader.ts` walks `wiki/pages/` (and optionally `wiki/raw/`) → `parser.ts` reads frontmatter and body → `filters.ts` applies `--type` / `--refs` / `--related` predicates → `ranker.ts` builds a MiniSearch BM25 index over the body and runs the query (`fuzzy: 0.1`, `prefix: true`, `combineWith: AND`) → `snippet.ts` excerpts the matched window → `render.ts` writes text or `--json` to stdout.

The custom MiniSearch tokenizer preserves `/`, `.`, `-`, `_` so file references like `src/lib/data.ts` remain searchable as a unit.

## Frontmatter pre-processor

`scripts/wiki-query/parser.ts` runs `preprocessFrontmatter` before handing markdown to `gray-matter`. Without this, every wiki page whose `code_refs` lists a Next.js dynamic-route path (e.g. `src/app/api/content/[id]/route.ts`) silently fails to parse and disappears from the corpus. See the raw decision and source page for full rationale: [[sources/wiki-query-frontmatter-preprocessor-2026-05-01]].

## Exit codes

| Code | Meaning |
|---|---|
| `0` | One or more results found and printed |
| `1` | No matches for the given query/filters |
| `2` | Usage error (unknown flag, invalid `--limit`, etc.) |

## Tests

`scripts/wiki-query/__tests__/` covers the CLI end-to-end (`cli.test.ts`), each pipeline stage (loader, parser, ranker, filters, snippet), and a `real-wiki.test.ts` that runs against the project's actual `wiki/` so the bracket-path edge case stays covered.

## Where it's invoked

- Humans: `npx wiki-query "..."` ad hoc.
- Claude (this repo): `CLAUDE.md` documents the command under "Conventions". The chat / generate prompts do not call it directly today; they read pages by path. If/when prompt-time wiki search becomes a thing, this is the entry point.

## Recent changes

- 2026-05-01 (`cb72059`) — Initial CLI: BM25 over `wiki/pages/`, `--type`/`--refs`/`--related` filters, JSON output.
- 2026-05-01 (`00d310f`) — Frontmatter pre-processor merged so dynamic-route `code_refs` parse correctly.
