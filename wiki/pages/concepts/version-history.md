---
title: Per-slide version history (server-side undo)
type: concept
code_refs: [src/lib/content-items.ts, src/types/carousel.ts, src/app/api/content/[id]/slides/[slideId]/undo/route.ts]
sources: []
related: [pages/entities/content-item-model.md, pages/entities/content-routes.md]
created: 2026-04-29
updated: 2026-04-29
confidence: high
---

# Per-slide version history

Each `Slide` carries a `previousVersions: SlideSnapshot[]` array. Every edit that changes the visual state pushes a snapshot of the *prior* state onto the array, capped at `MAX_VERSIONS` (defined in `src/types/carousel.ts`). The undo endpoint pops one snapshot.

## What triggers a snapshot

`updateSlide` in `src/lib/content-items.ts:158` snapshots only when an editable visual field changes:

- `background`
- `elements`
- `legacyHtml`

Notes-only edits do **not** consume undo budget — by design, so the user can keep tinkering with copy without burning the visual undo history.

## What gets stored

A `SlideSnapshot` is `{ background, elements, legacyHtml? }` — exactly the visual fields. `notes` and identity (`id`, `order`) are not part of the snapshot.

`structuredClone` is used to ensure snapshots are independent of the live slide.

## Bounded growth

When `previousVersions.length > MAX_VERSIONS`, the oldest snapshot is shifted out. There is no compaction strategy beyond this — older edits are simply lost.

## Undo

`POST /api/content/[id]/slides/[slideId]/undo` calls `undoSlide(itemId, slideId)` which pops the last snapshot and restores `background`, `elements`, and `legacyHtml` (deleting the field if the snapshot didn't have it). Returns `null` (→ 404) if the slide has no history.

## Scope

This is the only undo mechanism in the editor. There is **no** intra-session undo (Ctrl-Z client-side); every undo is a server round-trip. That's intentional V1: it makes "undo" the same operation whether the change came from the user or the agent.
