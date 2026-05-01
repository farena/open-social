---
title: Export pipeline
type: entity
code_refs: [src/lib/export-slides.ts, src/lib/fonts.ts, "src/app/api/content/[id]/export/route.ts", src/components/editor/ExportButton.tsx]
sources: [raw/incidents/puppeteer-heavy-font-timeout-2026-04-29.md]
related: [pages/entities/structured-slide-pipeline.md, pages/concepts/structured-slide-model.md]
created: 2026-04-29
updated: 2026-04-29
confidence: medium
---

# Export pipeline

Renders structured slides to PNG via Puppeteer and ships them as a ZIP. Same `wrapSlideHtml()` contract as the preview iframe — the export is *not* a separate renderer, it just runs the preview HTML in headless Chromium and screenshots the viewport.

## Modules

- **`src/lib/export-slides.ts`** — owns the singleton Puppeteer browser, `exportSlide()` (serialize → wrap → setContent → screenshot), and `exportAllSlides()` (concurrency-controlled batching with progress callbacks). Inlines `/uploads/*` images as data URIs before handing HTML to the page.
- **`src/lib/fonts.ts`** — server-side Google Fonts CSS cache + `@font-face` inliner. Uses `buildGoogleFontsFamilyParam` from `slide-html.ts` so cached/inlined Material Symbols match the variable-axis behavior the preview uses.
- **`src/app/api/content/[id]/export/route.ts`** — POST endpoint. Streams progress and returns the ZIP. Per `content-routes.md`.
- **`src/components/editor/ExportButton.tsx`** — client-side trigger. Builds a download anchor, calls the route, deferred-revokes the blob URL.

## Invariants

- The export renders the *same* document the preview iframe renders. `wrapSlideHtml()` is the single rendering contract; if exports drift from preview, fix `wrapSlideHtml`, not the exporter.
- Image references in slide HTML are paths (`/uploads/x.png`). The exporter rewrites them to `data:` URIs before setContent so headless Chromium does not need to fetch from the local server.
- Slide JSON is the source of truth. The exporter serializes JSON → HTML each time; never persist exported HTML.

## Tuning

- **Browser singleton** is launched with `--no-sandbox --disable-setuid-sandbox --disable-gpu --disable-dev-shm-usage` and `protocolTimeout: 300_000`. The dev-shm flag is required for containerized dev environments where `/dev/shm` is small.
- **Page wait** uses `document.fonts.ready` only — *not* an iteration over `document.fonts`. Material Symbols ships hundreds of `unicode-range` faces and forcing all of them to `loaded` stalls the renderer. See [[raw/incidents/puppeteer-heavy-font-timeout-2026-04-29]].
- **Screenshot** uses `captureBeyondViewport: false` — slides are sized to the viewport, and the full-page capture path adds an unneeded layout pass.
- **Concurrency** is 3 by default but drops to 1 when any slide references `Material Symbols ` (substring scan over the serialized slide). Heavy icon fonts inflate per-page memory enough that parallel renders thrash the browser.

## Client download

`ExportButton` builds an `<a>` element, *appends it to the DOM*, calls `click()`, removes it, then `setTimeout(() => URL.revokeObjectURL(url), 1000)`. Synchronous `revokeObjectURL` after `click()` races the browser's download dispatch and cancels the download in some browsers — the deferred revoke avoids that without leaking the blob URL meaningfully.

## Recent changes

- 2026-04-29 (`e2ff372`) — Switched font wait from per-`FontFace` enumeration to `document.fonts.ready`; added `protocolTimeout` and `--disable-dev-shm-usage`; concurrency drops to 1 for heavy-icon-font carousels; deferred `URL.revokeObjectURL` to fix download cancellation. See incident page.
