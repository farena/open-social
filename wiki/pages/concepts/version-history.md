---
title: Version history — slide-level undo/redo + content-item-level snapshots
type: concept
code_refs: [src/lib/content-items.ts, src/types/carousel.ts, "src/app/api/content/[id]/slides/[slideId]/undo/route.ts", "src/app/api/content/[id]/slides/[slideId]/redo/route.ts", src/lib/content-item-snapshots.ts, "src/app/api/content/[id]/versions/route.ts", "src/app/api/content/[id]/versions/[versionId]/restore/route.ts"]
sources: []
related: [pages/entities/content-item-model.md, pages/entities/content-routes.md, pages/entities/slide-editor.md, pages/entities/generate-route.md, pages/entities/chat-route.md]
created: 2026-04-29
updated: 2026-05-01
confidence: high
---

# Version history

There are **two layers** of version history in the system, operating at different granularities:

1. **Slide-level undo / redo** — per-slide bounded snapshot stacks. Lets the user undo/redo individual visual edits to a slide. Cap: 25 snapshots per stack.
2. **Content-item-level snapshots** — per-item FIFO snapshots of the full `ContentItem` (all slides). Lets the user roll back "the agent rewrote my whole carousel". Cap: 5 snapshots per item.

The two layers are independent: slide-level stacks live in the `slides` table alongside each slide row; item-level snapshots live in the `content_item_snapshots` table and are triggered only at agent entry points.

---

## Slide-level undo / redo

Each `Slide` carries two snapshot stacks: `previousVersions: SlideSnapshot[]` (back-history) and `nextVersions: SlideSnapshot[]` (forward-history, populated only by undo). Every edit that changes the visual state pushes a snapshot of the *prior* state onto `previousVersions`, capped at `MAX_VERSIONS` (defined in `src/types/carousel.ts`). The undo and redo endpoints move snapshots between the two stacks.

### What triggers a snapshot

`updateSlide` in `src/lib/content-items.ts` snapshots only when an editable visual field changes:

- `background`
- `elements`
- `legacyHtml`

Notes-only edits do **not** consume undo budget — by design, so the user can keep tinkering with copy without burning the visual undo history.

### What gets stored

A `SlideSnapshot` is `{ background, elements, legacyHtml? }` — exactly the visual fields. `notes` and identity (`id`, `order`) are not part of the snapshot.

`structuredClone` is used to ensure snapshots are independent of the live slide.

### Bounded growth

`pushBounded` in `src/lib/content-items.ts` shifts the oldest snapshot out when a stack would exceed `MAX_VERSIONS = 25`. Both `previousVersions` and `nextVersions` use the same cap via `pushBounded`. There is no compaction strategy beyond this — older edits are simply lost.

The editor persist debounce is **5 s** (originally 400 ms; bumped to 10 s with the SQLite migration, then halved to 5 s for tighter "Saved" badge feedback in the preview — see `5df9355`). Each keystroke burst produces at most one snapshot per debounce window, so 25 cap slots represent roughly ≈ 2 minutes of continuous active editing before the oldest visual checkpoint is evicted.

### Undo / redo

- **Undo** — `POST /api/content/[id]/slides/[slideId]/undo` calls `undoSlide(itemId, slideId)`: snapshots the current state into `nextVersions`, pops the last snapshot from `previousVersions`, and restores `background`, `elements`, and `legacyHtml` (deleting the field if the snapshot didn't have it). Returns `null` (→ 404) when `previousVersions` is empty.
- **Redo** — `POST /api/content/[id]/slides/[slideId]/redo` calls `redoSlide(itemId, slideId)`: symmetric — snapshots current into `previousVersions`, pops from `nextVersions`. Returns `null` (→ 404) when `nextVersions` is empty.

The two endpoints are exact mirrors. Both share `snapshotOf`, `applySnapshot`, and `pushBounded` helpers in `src/lib/content-items.ts`.

### Branching on edit (the "edit clears redo" invariant)

Any non-undo edit — every call site that goes through `pushSnapshot` — clears `nextVersions` (`slide.nextVersions = []`). This line is preserved verbatim in `src/lib/content-items.ts`. The semantics: undoing into the past and then making a new edit creates a new branch — the previously redo-able future is dropped. This matches standard text-editor undo/redo behavior and keeps the model unambiguous (no DAG, no per-branch labels).

### Migration

Slides persisted before `nextVersions` existed are normalized lazily: any slide row missing the field gets `nextVersions = []` on read. No on-disk migration script was required.

### Scope

These are the only slide-level undo/redo mechanisms in the editor. There is **no** intra-session client-side undo stack — every operation is a server round-trip. That's intentional V1: it makes "undo" and "redo" the same operation whether the change came from the user (canvas drag, properties panel) or the agent (chat-driven slide rewrite).

The editor surface exposes two affordances on top of these endpoints: Undo/Redo buttons in the top-right of the toolbar, and the keyboard shortcuts `Cmd/Ctrl+Z` / `Cmd/Ctrl+Shift+Z`. See [[entities/slide-editor]].

---

## Content-item-level snapshots

### Purpose

Coarser than per-slide undo. Lets the user revert "the agent ruined my carousel" — restoring the entire `ContentItem` (all slides and their metadata) to a known-good state captured before an agent turn began. Slide-level undo cannot serve this use case because the agent may have added, reordered, or deleted slides, not just edited visual fields within an existing slide.

### Trigger points

A snapshot is pushed **before** an agent begins writing:

| Entry point | Trigger type |
|---|---|
| `POST /api/content/[id]/generate` | `"generate"` |
| `POST /api/chat` (when `contentItemId` is in context) | `"chat"` |

Manual `PATCH /api/content/[id]` (field edits by the user) does **not** create a snapshot. Only agent entry points do.

Snapshot failures are best-effort: the trigger is wrapped in try/catch; a snapshot error logs a warning but does **not** abort generation or chat.

### Retention

5 newest snapshots per item (FIFO). When a 6th snapshot would be inserted, the oldest is deleted in the same transaction. Constant: `MAX_ITEM_SNAPSHOTS = 5` in `src/lib/content-item-snapshots.ts`.

### What gets stored

The full serialized `ContentItem` — all scalar fields plus all slides (including their `previousVersions` and `nextVersions` stacks). Stored as JSON in the `payload` column of `content_item_snapshots`. The `trigger` column records which entry point created it (`"generate"`, `"chat"`, or `"pre-restore"`); `label` is an optional short description (for `"chat"` snapshots: first 80 chars of the user message).

### Restore

`POST /api/content/[id]/versions/[versionId]/restore` is transactional:

1. Fetches the current state of the item.
2. Pushes a defensive `"pre-restore"` snapshot of the *current* state (so the user can undo the restore itself). FIFO trim applies.
3. Replaces the `content_items` row and all `slides` rows from the snapshot payload.
4. Returns the fully restored `ContentItem`.

The restore endpoint rejects with `409` if `item.state === "generating"` — a restore mid-generation would race the agent.

Returns `404` if either the item or the snapshot is not found.

### API

- `GET /api/content/[id]/versions` — lists up to 5 snapshots for the item, newest first. Response shape: `{ versions: [{ id, createdAt, trigger, label }] }`. Payload is **not** included in the list response.
- `POST /api/content/[id]/versions/[versionId]/restore` — restores the item. Returns the restored `ContentItem`.

### Storage

`content_item_snapshots` table in `data/sales.db` (better-sqlite3, WAL mode). Schema:

```sql
CREATE TABLE IF NOT EXISTS content_item_snapshots (
  id              TEXT PRIMARY KEY,
  content_item_id TEXT NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  created_at      TEXT NOT NULL,
  trigger         TEXT NOT NULL,
  label           TEXT,
  payload         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snapshots_item ON content_item_snapshots(content_item_id, created_at DESC);
```

---

## Recent changes

- 2026-05-01 (`f99b603`) — Added `nextVersions` stack, `redoSlide`, `POST /redo` route, and Undo/Redo toolbar buttons. Lazy migration for pre-existing slides.
- 2026-05-01 (SQLite migration plan) — Raised `MAX_VERSIONS` cap from 5 to 25; bumped editor persist debounce from 400 ms to 10 s. Added content-item-level snapshots layer (`content-item-snapshots.ts`, `GET /versions`, `POST .../restore`). Persistence moved to `data/sales.db`.
- 2026-05-01 (`5df9355`) — Lowered persist debounce from 10 s to 5 s and surfaced a "Saved" badge in `CarouselPreview` on each successful PUT. Halves the worst-case "edit in flight" window per debounce.
