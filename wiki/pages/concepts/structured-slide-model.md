---
title: Structured slide model — JSON is the source of truth
type: concept
code_refs: [src/types/slide-model.ts, src/lib/slide-serializer.ts, src/lib/slide-html.ts, src/components/editor/SlideOverlay.tsx]
sources: [raw/decisions/structured-slide-model-2026-04-25.md]
related: [pages/entities/structured-slide-pipeline.md, pages/entities/slide-editor.md]
created: 2026-04-29
updated: 2026-04-29
confidence: high
---

# Structured slide model

Invariant: a slide's JSON (`SlideSnapshot`: `background` + `elements[]`) is the single source of truth. HTML is derived deterministically by `serializeSlideToHtml()`. Nothing in the system reads the rendered iframe DOM.

## Implications

- **Editing always mutates JSON, never HTML.** The overlay editor (see [[entities/slide-editor]]) computes hit-targets, drag deltas, and resize anchors from the model + canvas-coordinate math (`src/lib/slide-coords.ts`).
- **AI edits are JSON, not HTML.** Granular endpoints under `/api/content/[id]/slides/[slideId]/{elements,background}` accept zod-validated JSON. The agent never writes raw HTML.
- **Render path is one-way.** JSON → `serialize` → body HTML → `wrapSlideHtml()` → iframe (preview) or Puppeteer (export). The same `wrapSlideHtml()` is the rendering contract for both surfaces.
- **`legacyHtml` is a fallback.** Slides migrated from the old HTML-string model carry the original under `legacyHtml`; the serializer or renderer can use it when the structured model can't faithfully represent something.

## Element kinds

Only two: `container` (HTML body + scoped CSS) and `image` (single `<img>` + scoped CSS). Text and shapes both express as containers — keeps the schema tight.

## Scoped CSS

Each element's `scssStyles` is **native CSS with nesting** (`&` selectors), not actual SCSS. It is wrapped at runtime in a `<style>[data-element-id="ID"]>` block injected next to the element, so nested rules naturally target descendants.

## What this rules out

- Cross-frame DOM scraping during edits (fragile under sandbox).
- "Regenerate the entire HTML" agent edits (loses fine-grained control + version history).
- Round-tripping HTML edits back into JSON (the migrator runs once, not on every save).
