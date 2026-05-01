---
origin: scripts/wiki-query/parser.ts (preprocessFrontmatter) + commit cb72059
date: 2026-05-01
related_code: [scripts/wiki-query/parser.ts, wiki/pages/entities/generate-route.md, wiki/pages/entities/content-routes.md, wiki/pages/concepts/sse-streaming.md]
---

# Decision — Pre-process flow-sequence frontmatter in wiki-query, don't re-quote the wiki

## Context

`scripts/wiki-query/` is a Node BM25 CLI built to search the wiki without an LLM. It uses `gray-matter` (which delegates to `js-yaml`) to parse each page's YAML frontmatter.

The wiki's established convention puts Next.js dynamic-route paths into flow-sequence list values, e.g.:

```yaml
code_refs: [src/app/api/content/[id]/generate/route.ts, src/lib/foo.ts]
```

This convention is fine for human readers but technically invalid YAML: inside a flow sequence, `[` reads as the start of a nested list and js-yaml aborts with `missed comma between flow collection entries`. 11 pages in `wiki/pages/` carry this pattern (`generate-route`, `content-routes`, `sse-streaming`, `chat-route`, `version-history`, `append-only-agent-contract`, `structured-slide-model`, plus the corresponding `pages/sources/` entries).

Without a fix, the CLI silently dropped those pages from its corpus, hiding the most heavily-cross-linked entries from every search.

## Decision

Pre-process the frontmatter region in the wiki-query parser before handing it to `gray-matter`. Convert any line of the form `key: [a, b, c]` into a block sequence with quoted scalars:

```yaml
key:
  - "a"
  - "b"
  - "c"
```

Done at the string level with a depth-aware comma split (so `[id]` segments stay attached to their path). Implemented in `preprocessFrontmatter` in `scripts/wiki-query/parser.ts`. The wiki files themselves stay untouched; readability for humans is preserved.

## Alternatives considered

- **Re-quote every flow-sequence entry in the wiki** (`code_refs: ["src/app/api/content/[id]/route.ts", ...]`). Rejected: muddies the wiki's readability, has to be enforced on every new page going forward, and one missed quote would silently drop the page from search again. The convention is set; the parser should accommodate it.
- **Switch from `gray-matter` to a lenient YAML parser** (custom or alternative library). Rejected: `gray-matter` is the de-facto standard for markdown-with-frontmatter in Node, and the issue is YAML grammar, not gray-matter's fault. Replacing it would trade a known good dep for a marginal one.
- **Convert all flow sequences to block sequences in the wiki itself** with a one-shot script. Rejected for the same reason as re-quoting: the convention re-emerges every time someone writes a new page from memory, and we'd be back to dropped pages.

## Constraints

- The CLI must work against the existing wiki without modifying it.
- The 11 affected pages are the most heavily cross-linked entries — they cannot be excluded from search.
- The fix must survive future pages that add new bracket-path `code_refs`.

## Outcome

The 4-test real-wiki smoke suite (`scripts/wiki-query/__tests__/real-wiki.test.ts`) exercises the preprocessor directly via `--refs src/app/api/content/[id]/generate/route.ts` and asserts `wiki/pages/entities/generate-route.md` is found. Before the fix, that page was invisible to the CLI; after the fix it ranks first.

Shipped in commit `cb72059`.
