---
title: ContentItem model
type: entity
code_refs: [src/types/content-item.ts, src/lib/content-items.ts, src/lib/content-item-schema.ts, src/types/carousel.ts]
sources: [raw/decisions/carousel-to-content-item-pivot-2026-04-26.md]
related: [pages/entities/content-routes.md, pages/entities/generate-route.md, pages/entities/slide-editor.md, pages/entities/structured-slide-pipeline.md, pages/concepts/version-history.md, pages/concepts/append-only-agent-contract.md]
created: 2026-04-29
updated: 2026-04-29
confidence: high
---

# ContentItem model

The unified entity that replaces the legacy `Carousel`. One row per Instagram deliverable in flight — a `post`, `story`, or `carousel` — moving through `idea → generating → generated`.

## Shape

Defined in `src/types/content-item.ts`:

- `type: "post" | "story" | "carousel"` — drives default `aspectRatio` via `DEFAULT_ASPECT_RATIO_FOR_TYPE` (see `src/types/content-item.ts:37`).
- `state: "idea" | "generating" | "generated"` — the only state machine in the system.
- Copy fields: `hook`, `bodyIdea`, `caption`, `hashtags[]`, optional `notes`.
- Visual: `aspectRatio` (`1:1` / `4:5` / `9:16`) + `slides: Slide[]`.
- Optional context: `chatSessionId`, `referenceImages[]`, `assets[]`, `tags[]`.
- Audit: `createdAt`, `updatedAt`, optional `generatedAt`.

Slides are still defined in `src/types/carousel.ts` (re-exported by `content-item.ts`) — only the parent entity changed during the pivot.

## CRUD lib

`src/lib/content-items.ts` is the single mutation surface. All writes go through `data.ts` (`readDataSafe` / `writeData`) which uses `async-mutex` + atomic temp-file rename.

- `createContentItem(input)` always lands in `state: "idea"` regardless of input (see `src/lib/content-items.ts:75`).
- `updateContentItem(id, patch)` auto-stamps `generatedAt` on the first transition into `"generated"` (see `src/lib/content-items.ts:102`).
- `appendSlide` enforces `MAX_SLIDES` (10, from `carousel.ts`) silently — returns `null` if exceeded.
- `updateSlide` snapshots into `previousVersions` only when an *editable* field changes (background, elements, legacyHtml) — `notes` updates do not consume undo budget. See [[concepts/version-history]].
- `undoSlide` pops the last snapshot; restores `legacyHtml` only if it was present in the snapshot.
- Asset operations: `addContentItemAsset` prepends (newest first); `removeContentItemAsset` returns `false` when the item or asset is missing.

## Validation

`src/lib/content-item-schema.ts` defines three zod schemas — full, patch (all fields optional except `id`), and `newContentItemInput` (only `hook` + `type` required, server applies defaults).

## Persistence

- File: `data/content-items.json`.
- Format: `{ contentItems: ContentItem[] }`.
- Concurrency: per-file mutex from `src/lib/data.ts`.
- Migration from legacy carousels: `scripts/migrate-to-content-items.mjs` (one-shot, lifts every existing carousel into `state: "generated"`).

## Recent changes

- 2026-04-26 (`e9e8e62`) — Initial type + zod schema.
- 2026-04-26 (`b2eb327`) — CRUD lib with mutex + version snapshots.
- 2026-04-26 (`cca70c2`) — Append-only agent invariant enforced at the slide route layer (see [[concepts/append-only-agent-contract]]).
- 2026-04-27 (`4468ea9`) — Removed deprecated `src/lib/carousels.ts` and `Carousel` surface.
