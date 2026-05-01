---
title: Per-slide version history (server-side undo + redo)
type: concept
code_refs: [src/lib/content-items.ts, src/types/carousel.ts, src/app/api/content/[id]/slides/[slideId]/undo/route.ts, src/app/api/content/[id]/slides/[slideId]/redo/route.ts]
sources: []
related: [pages/entities/content-item-model.md, pages/entities/content-routes.md, pages/entities/slide-editor.md]
created: 2026-04-29
updated: 2026-05-01
confidence: high
---

# Per-slide version history

Each `Slide` carries two snapshot stacks: `previousVersions: SlideSnapshot[]` (back-history) and `nextVersions: SlideSnapshot[]` (forward-history, populated only by undo). Every edit that changes the visual state pushes a snapshot of the *prior* state onto `previousVersions`, capped at `MAX_VERSIONS` (defined in `src/types/carousel.ts`). The undo and redo endpoints move snapshots between the two stacks.

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

`pushBounded` in `src/lib/content-items.ts` shifts the oldest snapshot out when a stack would exceed `MAX_VERSIONS = 5`. Both `previousVersions` and `nextVersions` use the same cap. There is no compaction strategy beyond this — older edits are simply lost.

## Undo / redo

- **Undo** — `POST /api/content/[id]/slides/[slideId]/undo` calls `undoSlide(itemId, slideId)`: snapshots the current state into `nextVersions`, pops the last snapshot from `previousVersions`, and restores `background`, `elements`, and `legacyHtml` (deleting the field if the snapshot didn't have it). Returns `null` (→ 404) when `previousVersions` is empty.
- **Redo** — `POST /api/content/[id]/slides/[slideId]/redo` calls `redoSlide(itemId, slideId)`: symmetric — snapshots current into `previousVersions`, pops from `nextVersions`. Returns `null` (→ 404) when `nextVersions` is empty.

The two endpoints are exact mirrors. Both share `snapshotOf`, `applySnapshot`, and `pushBounded` helpers in `src/lib/content-items.ts`.

## Branching on edit

Any non-undo edit (every call site that goes through `pushSnapshot`) clears `nextVersions`. The semantics: undoing into the past and then editing creates a new branch — the previously redo-able future is dropped. This matches the standard text-editor undo/redo behavior and keeps the model unambiguous (no DAG, no per-branch labels).

## Migration

Slides persisted before `nextVersions` existed are normalized lazily in `load()`: any slide missing the field gets `nextVersions = []` on read. No on-disk migration script was required.

## Scope

These are the only undo/redo mechanisms in the editor. There is **no** intra-session client-side undo stack — every operation is a server round-trip. That's intentional V1: it makes "undo" and "redo" the same operation whether the change came from the user (canvas drag, properties panel) or the agent (chat-driven slide rewrite).

The editor surface exposes two affordances on top of these endpoints: Undo/Redo buttons in the top-right of the toolbar, and the keyboard shortcuts `Cmd/Ctrl+Z` / `Cmd/Ctrl+Shift+Z`. See [[entities/slide-editor]].

## Recent changes

- 2026-05-01 (`f99b603`) — Added `nextVersions` stack, `redoSlide`, `POST /redo` route, and Undo/Redo toolbar buttons. Lazy migration in `load()` for pre-existing slides.
