---
title: Structured slide pipeline
type: entity
code_refs: [src/types/slide-model.ts, src/lib/slide-schema.ts, src/lib/slide-serializer.ts, src/lib/slide-migrator.ts, src/lib/slide-defaults.ts, src/lib/slide-coords.ts, src/lib/slide-html.ts, src/lib/fonts.ts, scripts/migrate-slides-to-structured.ts]
sources: [raw/decisions/structured-slide-model-2026-04-25.md]
related: [pages/concepts/structured-slide-model.md, pages/entities/slide-editor.md, pages/concepts/version-history.md]
created: 2026-04-29
updated: 2026-04-29
confidence: high
---

# Structured slide pipeline

The chain of modules that owns the slide JSON model, validates it, turns it into HTML, and migrates legacy data.

## Modules

- **`src/types/slide-model.ts`** — `BackgroundElement` (`solid` | `gradient` | `image`), `SlideElement` discriminated union of `container` (HTML body + scoped CSS) and `image` (single `<img>`), `SlideSnapshot` (background + elements + optional `legacyHtml`).
- **`src/lib/slide-schema.ts`** — zod schemas mirroring the types. Used by every slide-mutating route and by the agent endpoints.
- **`src/lib/slide-serializer.ts`** — `serializeSlideToHtml(slide)` produces a body-only string. Deterministic; injects `<style>[data-element-id="ID"]>` blocks for each element's `scssStyles` (treated as native CSS with nesting).
- **`src/lib/slide-migrator.ts`** — `parseHtmlToSlide(html, aspectRatio)` one-shot best-effort parse. Stores the original under `legacyHtml`.
- **`src/lib/slide-defaults.ts`** — element factories (`createTextElement`, `createImageElement`, `createDefaultBackground`, etc.).
- **`src/lib/slide-coords.ts`** — `clampToCanvas`, `snapToGrid`, `screenToCanvas`, `canvasToScreen`. Editor-only math.
- **`src/lib/slide-html.ts`** — `wrapSlideHtml(body, opts)` adds the full HTML document chrome (DOCTYPE, font links, dimension constraints). The shared rendering contract between preview iframe and Puppeteer export. Also exports `buildGoogleFontsFamilyParam(family)` — used by both the preview link tag and `fonts.ts` cache fetch — which spells out variable-font axes (`opsz,wght,FILL,GRAD`) for `Material Symbols Outlined|Rounded|Sharp`. Without those axes Google serves a fixed default and `font-variation-settings` becomes a silent no-op, which is why the helper exists.
- **`src/lib/fonts.ts`** — server-side font cache + inliner used by Puppeteer export. Routes its CSS fetch through `buildGoogleFontsFamilyParam` so cached/inlined Material Symbols match the variable-axis behavior used in preview.

## Invariants

- The JSON is the source of truth; HTML is derived. Never read the iframe DOM. See [[concepts/structured-slide-model]].
- Coordinates are canvas pixels (e.g. 0..1080 × 0..1350 for 4:5).
- Two element kinds only: `container` and `image`. Text/shape primitives don't exist — express them as containers with `htmlContent` + `scssStyles`.
- `scssStyles` is **not actual SCSS**. It is native CSS with nesting (`&` selectors), scoped at runtime via the injected style block.

## One-shot migration

`scripts/migrate-slides-to-structured.ts` walks `data/carousels.json`, runs the migrator, writes the result, and keeps the original `bodyHtml` under `legacyHtml`. Idempotent: skips slides that already have an `elements` array.

## Recent changes

- 2026-04-25 (`4a66889`, `643f9b6`) — Types + zod schema.
- 2026-04-25 (`03c7d3a`, `5fce5e3`) — Defaults, coords, serializer.
- 2026-04-25 (`2e31a10`) — Migrator.
- 2026-04-25 (`5855b47`) — Data migration applied.
- 2026-04-25 (`af1c6a4`) — Storage + APIs + UI adapted to the structured model.
- 2026-04-29 (`c896e9e`) — `buildGoogleFontsFamilyParam` extracted from `wrapSlideHtml`; reused by `fonts.ts` cache fetch so Material Symbols variable axes are spelled out in both preview and exported builds.
