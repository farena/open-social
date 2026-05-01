---
name: project-wiki
description: Build and maintain a Karpathy-style LLM wiki about this project (Open Social). Knowledge is "compiled" once at ingest time and persisted as interlinked markdown pages — not re-derived per query. The project's source code is the source of truth for *what* the system does; `wiki/raw/` only stores the *why* (decisions, incidents, external docs). Three operations — ingest, query, lint — over `wiki/raw/` (immutable history) and `wiki/pages/` (generated pages). Triggers when the user says "wiki", "ingest this", "ingest source", "query the wiki", "lint wiki", "document in the wiki", "update the project wiki", "build a wiki about this project", or equivalent.
---

# Project Wiki (Karpathy LLM-Wiki pattern)

## Purpose

Maintain a *compounding* knowledge base about Open Social following Andrej Karpathy's pattern ([gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)). Decisions, incidents and external references are "compiled" into linked markdown pages with `[[wiki-links]]`. Each query reads already-distilled pages, not raw sources or full code.

Difference vs. classic RAG: RAG compiles at query time; this wiki compiles at ingest time.

## Core principle: code is the source of truth

The project's source code (under `src/`, `app/`, etc.) is **the** ground truth for *what* the system does. The wiki must never duplicate code into `raw/` — pages reference code by path and line (e.g. `src/lib/data.ts:42`), and `git` is the canonical history of code changes.

`wiki/raw/` is reserved for things the code *cannot* tell you on its own:

- **Decisions** — why a path was chosen, what alternatives were considered, what constraints applied at the time. Captured as short ADR-style entries.
- **Incidents** — postmortems, notable bugs, near-misses.
- **External** — library docs snapshots, blog posts, papers, vendor changelogs we relied on.

If a fact is derivable by reading `src/`, do not write it into `raw/`. Cite the file path on the page instead.

## Repo layout

```
wiki/
  raw/                       # immutable history (read-only for the agent)
    decisions/               # ADR-style entries: why we chose X, alternatives, constraints
    external/                # library docs snapshots, blog posts, papers
    incidents/               # postmortems, notable bugs
  pages/                     # pages generated and maintained by the agent
    concepts/                # ideas/patterns (e.g. wrap-slide-html, sse-streaming)
    entities/                # components/modules (e.g. chat-route, brand-config)
    sources/                 # 1:1 summary of each ingested raw/ entry
    comparisons/             # comparison tables, tradeoffs
  index.md                   # master catalog, one line per page
  log.md                     # append-only, one line per operation; also tracks last-ingested commit
```

If `wiki/` does not exist when the skill fires, **scaffold it first** (create the folders, an `index.md` with empty sections, and an empty `log.md` with a header line including a `last-ingest-commit:` placeholder).

## Page conventions

Every page under `wiki/pages/**/*.md` starts with frontmatter:

```yaml
---
title: Human-readable title
type: concept | entity | source | comparison
code_refs: [src/lib/data.ts, src/app/api/chat/route.ts:45]
sources: [raw/decisions/sse-over-websocket-2026-04-29.md]
related: [pages/concepts/sse-streaming.md, pages/entities/chat-route.md]
created: 2026-04-29
updated: 2026-04-29
confidence: high | medium | low
---
```

- `code_refs` lists the canonical files (and optionally `:line`) that back the page. Every entity page **must** have at least one `code_ref`.
- `sources` lists `raw/` entries (decisions, incidents, external). May be empty for purely code-derived pages.
- File names in `kebab-case.md`.
- Internal links: `[[concepts/sse-streaming]]` (no extension, path relative to `pages/`).
- One page = one entity/concept/source/comparison. Don't mix.
- Cite the backing for each non-trivial claim: code refs as `(see \`src/lib/data.ts:42\`)`, decisions as `(see [[sources/sse-over-websocket-2026-04-29]])`.

## Operation: ingest

Triggered by: "ingest this", "ingest <file>", "add this to the wiki", or when the user pastes content and asks to document it. For ingesting *code changes since last run*, see the `/run-ingest` command — this manual operation is for decisions, incidents and external docs.

Steps (in order, no skipping):

1. **Classify the input.**
   - Is it a *decision* (why we chose X, what we tried, constraints)? → `wiki/raw/decisions/`.
   - A *postmortem / bug story*? → `wiki/raw/incidents/`.
   - A *library doc / blog / paper / vendor changelog*? → `wiki/raw/external/`.
   - **A code excerpt or file dump? Refuse and reference the path instead.** Code lives in the project, not in the wiki.
2. **Capture the raw.** Write to `wiki/raw/<category>/<slug>-YYYY-MM-DD.md` with a minimal header (origin, URL if applicable, date, related code paths). Keep it short and decision-focused. **Never mutate raw after creation.**
3. **Discuss takeaways in 3-5 bullets** before touching `pages/`. Wait for user confirmation only if scope is ambiguous; if it's clear, proceed.
4. **Create `pages/sources/<slug>.md`** with frontmatter `type: source`, structured summary, and a link back to the raw.
5. **Update affected pages in `pages/concepts/` and `pages/entities/`.** A single source can touch 5-15 pages. If an entity/concept is mentioned but has no page, **create it** with `confidence: low`, at least one `code_refs` entry pointing to the relevant file(s), and a stub.
6. **Update `wiki/index.md`** by adding/refreshing the corresponding line under the appropriate section.
7. **Append to `wiki/log.md`** a single line: `## [YYYY-MM-DD] ingest | <slug> — N pages touched`.
8. **Report to the user**: list of pages created/modified plus suggestions of what to ingest/ask next.

## Operation: query

Triggered by: "query the wiki", "what does the wiki say about X", "according to the wiki…", or any question where the user expects a wiki-backed answer.

Steps:

1. **Find candidate pages with `wiki-query`.** Run the CLI from the repo root — it does BM25 ranking over the body plus frontmatter filtering, no LLM, no network:

   ```bash
   npx wiki-query "<the user's question or keywords>" --limit 5
   ```

   Common variants:
   - `--type concept | entity | source | comparison` — restrict by page type.
   - `--refs <path>` — filter to pages whose `code_refs` mention this path. Substring match, so `--refs useSlideEditor` catches `src/components/editor/useSlideEditor.ts`. Works without a positional query (filter-only mode).
   - `--related <page>` — exact match against `related:` entries (after stripping `pages/` prefix and `.md` suffix). E.g. `--related entities/chat-route.md`.
   - `--raw` — extend the corpus to include `wiki/raw/decisions/` and `wiki/raw/incidents/`. Off by default because raw entries are immutable history; use it when the user is asking about *why* / past incidents.
   - `--json` — emit machine-readable output (each item: `path`, `score`, `frontmatter`, `snippet`).

   Exit codes: `0` results found, `1` no matches (suggest `--raw` or rephrasing), `2` usage error.

   Fall back to reading `wiki/index.md` only if the CLI is unavailable for some reason. See `scripts/wiki-query/README.md` for the full surface.
2. Read the candidate pages the CLI surfaced. If a claim is fuzzy, **read the code at `code_refs`** before reading raws — code is the source of truth. Read `sources` raws for *why* context.
3. Synthesize the answer with `[[wiki-link]]` citations to every page used, plus direct code-path citations where helpful.
4. **If the answer has reusable value**, offer to file it as a new page (`pages/comparisons/...` or `pages/concepts/...`). If accepted, create it and update `index.md` and `log.md` (`## [YYYY-MM-DD] query-archived | <slug>`).
5. If the wiki **does not have the answer**, say so explicitly and suggest either ingesting a missing decision, or running `/run-ingest` to refresh from recent commits.

## Operation: lint

Triggered by: "lint wiki", "review the wiki", "wiki health".

Checks (report findings, don't fix without confirmation — except trivial fixes like an obviously broken link):

1. **Contradictions**: pages claiming opposite things about the same entity/concept.
2. **Stale code refs**: `code_refs` pointing to files that no longer exist or symbols that have been renamed (use `git log` / `grep` to verify).
3. **Orphans**: pages in `pages/` with no inbound links from other pages or from `index.md`.
4. **Orphan concepts**: terms mentioned ≥3 times across `pages/` without a page of their own.
5. **Stale decisions**: `pages/sources/*` whose underlying decision has been overridden by later code (detect via mismatch between source claims and current `code_refs` content).
6. **Broken frontmatter**: missing fields, invalid dates, links to non-existent pages, entity pages with no `code_refs`.
7. **Index drift**: pages in `pages/` not listed in `index.md`, or `index.md` entries with no file.
8. **Gap suggestions**: 3-5 concrete questions the wiki should be able to answer but can't yet, with which decision/incident/external doc to ingest to cover them.

After a successful lint: append `## [YYYY-MM-DD] lint | N findings` to `log.md`.

## Hard rules

- **Code lives in `src/`, not in `wiki/raw/`.** Never copy code excerpts into the wiki. Reference by path and line.
- **Never mutate `wiki/raw/`.** It is the immutable record of past decisions/incidents/external context. If a decision is reversed, ingest a new decision entry that supersedes the old one — leave the old one in place.
- **Don't make things up.** If a claim has no code path or raw to back it, mark the page `confidence: low` and leave an explicit TODO.
- **Don't duplicate pages.** Before creating, read `index.md` and look for a similar slug.
- **`index.md` and `log.md` are updated on every operation that modifies `pages/`** — never skip this; it's what makes the wiki navigable.
- **Keep pages short and linked**, not monolithic documents. If a page exceeds ~150 lines, split it.
- This wiki documents **the project** (decisions, architecture, external libraries, incidents). It does not replace `CLAUDE.md` (operational instructions for the main agent) or user memory.

## Tracking the last ingest

`wiki/log.md` carries a header line of the form:

```
last-ingest-commit: <git-sha>
```

The `/run-ingest` command reads this to compute the diff window and updates it on success. Manual ingests (this skill) do **not** advance this marker — it represents only code-level ingest progress.

## Typical categories for Open Social

Suggestions of what to maintain:

- **entities/**: `chat-route`, `data-storage`, `slide-html-wrapper`, `content-item-model`, `claude-cli-subprocess`, `puppeteer-export`, `brand-config`. Each must point to one or more files under `src/`.
- **concepts/**: `sse-streaming`, `iframe-sandboxing`, `async-mutex-locking`, `version-history`, `instagram-dimensions`, `slide-html-contract`.
- **sources/**: every architecture decision, every external doc snapshot (Anthropic SDK, Next.js 16 release notes, Tailwind v4 migration), every incident.
- **comparisons/**: `json-storage-vs-sqlite`, `claude-cli-vs-sdk`, `puppeteer-vs-playwright`.

## Output to the user

- **Ingest**: list of pages touched + 1-2 suggestions of what to ingest next.
- **Query**: answer with `[[link]]` citations + offer to archive if applicable.
- **Lint**: findings grouped by type + short remediation plan.

Stay concise. The wiki is the persistent artifact; chat is ephemeral.
