---
title: Source — wiki-query frontmatter pre-processor
type: source
code_refs: [scripts/wiki-query/parser.ts]
sources: [raw/decisions/wiki-query-frontmatter-preprocessor-2026-05-01.md]
related: [pages/entities/generate-route.md, pages/entities/content-routes.md, pages/concepts/sse-streaming.md]
created: 2026-05-01
updated: 2026-05-01
confidence: high
---

# Source — wiki-query frontmatter pre-processor (2026-05-01)

## Decision

`scripts/wiki-query/parser.ts` pre-processes flow-sequence frontmatter (e.g. `code_refs: [src/app/api/content/[id]/route.ts, ...]`) into block sequences with quoted scalars before handing the markdown to `gray-matter`. The wiki convention of Next.js dynamic-route paths in `code_refs` is preserved on disk; the CLI accommodates it at parse time.

## Why this matters

Without the pre-processor, 11 of the most cross-linked wiki pages (every page whose `code_refs` mentions a dynamic Next.js route — `generate-route`, `content-routes`, `chat-route`, `sse-streaming`, etc.) silently fail to parse and disappear from BM25 search. The wiki would still render fine for humans, but the CLI's corpus would be skewed.

## Pages affected

- `pages/entities/generate-route` — `code_refs` includes `src/app/api/content/[id]/generate/route.ts`.
- `pages/entities/content-routes` — every dynamic slide/asset/reference endpoint.
- `pages/entities/chat-route`, `pages/concepts/sse-streaming`, `pages/concepts/append-only-agent-contract`, `pages/concepts/version-history`, `pages/concepts/structured-slide-model`, plus their corresponding `pages/sources/` entries.

## Alternatives considered

- Re-quote every flow-sequence entry in the wiki itself.
- Replace `gray-matter` with a lenient YAML parser.
- One-shot script to convert all flow sequences to block sequences.

All rejected — see raw decision for the full rationale.

## Implementation note

Depth-aware comma split (so `[id]` stays attached to the path) followed by per-entry quoting with `\` and `"` escaping. Implemented as `preprocessFrontmatter` (~25 lines) in `scripts/wiki-query/parser.ts`.

See raw: `wiki/raw/decisions/wiki-query-frontmatter-preprocessor-2026-05-01.md`.
