---
origin: docs/plans/2026-04-25-structured-slide-editor.md (planning) + commits 4a66889, 643f9b6, 03c7d3a, 5fce5e3, 2e31a10, 5855b47, 17f2637, 0e840cd, 72f8597, 74d644e, b8c1354, af1c6a4, 3630a11
date: 2026-04-25
related_code: src/types/slide-model.ts, src/lib/slide-schema.ts, src/lib/slide-serializer.ts, src/lib/slide-migrator.ts, src/lib/slide-defaults.ts, src/lib/slide-coords.ts, src/components/editor/SlideCanvas.tsx, src/components/editor/SlideOverlay.tsx, src/components/editor/PropertiesPanel.tsx
---

# Decision — Replace HTML-string slides with a structured JSON model

## Context

Slides used to be a free-form `bodyHtml: string`. The agent generated arbitrary HTML; the editor either rendered it in an iframe (preview) or, for "edits", asked the agent to rewrite the whole body. There was no way to do click-to-edit, drag, or resize without parsing the iframe DOM at runtime, and no way to validate or transform AI output without HTML parsing.

This blocked the visual editor and the granular AI endpoints required for fast, predictable edits.

## Decision

The slide is now a JSON document (`SlideSnapshot`): a `BackgroundElement` (solid/gradient/image) plus an array of `SlideElement`s (`container` with `htmlContent` + scoped CSS, or `image`). The JSON is the **single source of truth**; a deterministic `serializeSlideToHtml()` produces body-only HTML that flows through the existing `wrapSlideHtml()` and into the iframe sandbox.

The editor lives as an overlay over the iframe and **never reads the iframe DOM** — it computes hit targets, drag deltas, and resize anchors from the JSON. Inline rich-text editing uses Lexical mounted over the selected `text` element on demand.

The AI moves from "regenerate the HTML" to granular endpoints: `POST /api/content/[id]/slides/[slideId]/elements`, `PATCH /elements/[id]`, `PUT /background`. All payloads validated by zod (`src/lib/slide-schema.ts`).

Migration is one-shot: `scripts/migrate-slides-to-structured.ts` parses every existing `bodyHtml` with `node-html-parser` and writes a best-effort structured equivalent, preserving the original under `legacyHtml` as a fallback (commit 5855b47).

## Alternatives considered

- **Keep HTML, parse the iframe DOM at runtime for edits** — rejected: cross-frame DOM access is fragile (sandbox restrictions), and there is no clean way to validate or version an arbitrary HTML diff.
- **Use a third-party schema (e.g. Excalidraw, tldraw)** — rejected: those are general drawing models; we need an Instagram-shaped model with native HTML container support so the AI can express typography and decorative compositions naturally.
- **Make `scssStyles` actual SCSS via a build step** — rejected: it is treated as native CSS with nesting (`&` selectors) and scoped via an injected `<style>[data-element-id="ID"]>` block. Authors can write nested rules without a transpiler.

## Constraints

- The export PNG pipeline (`src/lib/export-slides.ts` → Puppeteer) must keep working unchanged. Achieved because `wrapSlideHtml()` remains the rendering contract; the serializer only changes what the body contains.
- Two element kinds only — `container` and `image`. No `text` / `shape` primitives; text and shapes both express as containers with `htmlContent` + `scssStyles`. Keeps the schema small and the migration simple.
- Out of scope V1: multi-select, groups, rotation, animations, snap-to-other-elements (only grid + canvas centers).

## Outcome

Shipped across commits `4a66889..2e31a10` (data model + serializer + migrator), `b8c1354..0e840cd` (editor canvas + overlay + properties + Lexical), `3630a11` (granular API endpoints), `5855b47` (data migration), and `17f2637` (editor wiring refactor).
