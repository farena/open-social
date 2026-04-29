---
origin: commit e2ff372 ("fix(export): improve export functionality and performance")
date: 2026-04-29
related_code: src/lib/export-slides.ts, src/components/editor/ExportButton.tsx
---

# Incident — Slide export timed out on slides using Material Symbols

## Symptom

Exporting a carousel that referenced any `Material Symbols *` family (icon font) intermittently failed with a Puppeteer `captureScreenshot` protocol timeout. Smaller carousels using only normal Google Fonts exported fine. The browser instance survived, but individual slide screenshots would hang past the default protocol timeout, breaking the ZIP export.

## Root cause

Two compounding issues, both rooted in how Material Symbols is shaped:

1. **`document.fonts` enumeration stalled the renderer.** Material Symbols ships hundreds of `@font-face` declarations split by `unicode-range`. The export waited on a custom predicate that iterated *every* `FontFace` and required all of them to reach `status === "loaded"` — but most ranges are never used by the slide and the browser does not load them. The wait would burn its 10s budget on faces that would never load, and only then proceed.
2. **Parallel pages thrashed the renderer for heavy fonts.** Concurrency was a fixed 3 across all slides. With several MB of inlined `@font-face` data per page (post `fonts.ts` inlining), three pages decoding in parallel was enough to push `captureScreenshot` past its protocol timeout.

The `URL.revokeObjectURL` path on the client side was also racing the browser's download trigger — the link was never appended to the DOM, and the URL was revoked synchronously after `a.click()`, so some browsers cancelled the download.

## Fix

- Replace the custom `[...document.fonts].every(loaded)` wait with a plain `document.fonts.ready` wait. That resolves once the faces *the page actually uses* are loaded, ignoring unused unicode-range subsets.
- Bump `setContent` timeout from 15s → 30s and add `protocolTimeout: 300_000` on the browser launch so a slow page can't kill the whole CDP session.
- Add `--disable-dev-shm-usage` to the Chromium args (avoids `/dev/shm` exhaustion under containerized dev).
- Pass `captureBeyondViewport: false` to `page.screenshot` — slide pages are sized to the viewport already; capturing beyond it forces an extra layout pass.
- Detect "heavy font" usage (regex over the serialized slide for `Material Symbols `) and drop concurrency to 1 in that case. Normal carousels still run at 3.
- Client side: append the download `<a>` to the DOM before `click()`, then `setTimeout(() => URL.revokeObjectURL(url), 1000)` so the browser keeps the blob URL alive long enough to start the download.

## Lessons

- `document.fonts.ready` is the right wait for "fonts I'm using". Iterating `document.fonts` is the wrong primitive when any variable/segmented font is in play — its `FontFace` set includes faces the page will never load, and forcing them to "loaded" is impossible.
- Puppeteer concurrency is not free: each page is a renderer process. Tune it by *content weight*, not just slide count.
- Always raise `protocolTimeout` on long-running CDP sessions; the default kills the whole browser, not just one page.
- Object URL lifetimes: keep the anchor in the DOM until the click is processed and defer `revokeObjectURL` by a beat — synchronous revocation races the browser's download intent.

## Outcome

Shipped in `e2ff372`. Material Symbols carousels now export reliably; non-icon carousels keep their 3-way concurrency. The heavy-font detector is a string scan over the slide JSON — coarse but cheap.
