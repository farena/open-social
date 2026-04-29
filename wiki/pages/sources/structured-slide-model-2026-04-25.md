---
title: Source — Structured slide model (HTML → JSON)
type: source
code_refs: [src/types/slide-model.ts, src/lib/slide-schema.ts, src/lib/slide-serializer.ts, src/lib/slide-migrator.ts, src/lib/slide-defaults.ts, src/lib/slide-coords.ts]
sources: [raw/decisions/structured-slide-model-2026-04-25.md]
related: [pages/entities/structured-slide-pipeline.md, pages/entities/slide-editor.md, pages/concepts/structured-slide-model.md]
created: 2026-04-29
updated: 2026-04-29
confidence: high
---

# Source — Structured slide model (2026-04-25)

## What it changes

Replaces `slide.bodyHtml: string` with a JSON document (`SlideSnapshot`): a `BackgroundElement` plus an array of `SlideElement`s (`container` or `image`). The serializer derives body-only HTML; the existing `wrapSlideHtml()` still wraps it for the iframe and Puppeteer.

## Pages affected

- [[entities/structured-slide-pipeline]] — new types/schema/serializer/migrator/coords/defaults.
- [[entities/slide-editor]] — overlay-based editor that operates on the JSON, not the iframe DOM.
- [[concepts/structured-slide-model]] — invariant: JSON is the source of truth, HTML is derived.

## Key claims (with citations)

- Two element kinds only: `container` and `image` (see `src/types/slide-model.ts:91`).
- `scssStyles` is **native CSS with nesting**, scoped via `<style>[data-element-id="ID"]>` injection — not actual SCSS (see `src/types/slide-model.ts:62`).
- The editor never reads the iframe DOM; coordinates are canvas pixels (see `src/types/slide-model.ts:6`).
- Migration preserves the original under `legacyHtml` as a fallback (see `src/lib/slide-migrator.ts`).
- AI granular endpoints under `/api/content/[id]/slides/[slideId]/{elements,background}` are validated by zod schemas in `src/lib/slide-schema.ts`.

See raw: `wiki/raw/decisions/structured-slide-model-2026-04-25.md`.
