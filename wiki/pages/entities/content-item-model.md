---
title: ContentItem model
type: entity
code_refs: [src/types/content-item.ts, src/lib/content-items.ts, src/lib/content-item-schema.ts, src/types/carousel.ts, src/lib/db.ts, src/lib/content-item-row.ts, src/lib/content-item-snapshots.ts]
sources: [raw/decisions/carousel-to-content-item-pivot-2026-04-26.md]
related: [pages/entities/content-routes.md, pages/entities/generate-route.md, pages/entities/slide-editor.md, pages/entities/structured-slide-pipeline.md, pages/concepts/version-history.md, pages/concepts/append-only-agent-contract.md, pages/concepts/storage-architecture.md]
created: 2026-04-29
updated: 2026-05-01
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

`src/lib/content-items.ts` is the single mutation surface. All writes use prepared SQLite statements via `src/lib/db.ts`; multi-statement operations are wrapped in `db.transaction()`.

- `createContentItem(input)` always lands in `state: "idea"` regardless of input (see `src/lib/content-items.ts`).
- `updateContentItem(id, patch)` auto-stamps `generatedAt` on the first transition into `"generated"`. Does **not** create a content-item-level snapshot — snapshot triggers are limited to agent entry points (`/generate`, `/chat`). See [[concepts/version-history]].
- `appendSlide` enforces `MAX_SLIDES` (20, from `src/types/carousel.ts`) silently — returns `null` if exceeded.
- `updateSlide` snapshots into `previousVersions` only when an *editable* field changes (background, elements, legacyHtml) — `notes` updates do not consume undo budget. Any visual edit also clears `nextVersions` (the "edit branches redo history" invariant). See [[concepts/version-history]].
- `undoSlide` pops `previousVersions`, pushes current state to `nextVersions`. `redoSlide` is the mirror (added in commit `f99b603`).
- Asset operations: `addContentItemAsset` prepends (newest first); `removeContentItemAsset` returns `false` when the item or asset is missing.

Row (de)serialization between TypeScript objects and SQLite columns is handled by `src/lib/content-item-row.ts` (`contentItemToRow`, `rowToContentItem`, `slideToRow`, `rowToSlide`). JSON columns (`hashtags`, `reference_images`, `assets`, `tags`, `previous_versions`, `next_versions`, `elements`) are stringified on write and parsed on read.

## Validation

`src/lib/content-item-schema.ts` defines three zod schemas — full, patch (all fields optional except `id`), and `newContentItemInput` (only `hook` + `type` required, server applies defaults).

## Persistence

- **Storage**: `data/sales.db` (better-sqlite3, WAL mode, `synchronous=NORMAL`, `foreign_keys=ON`). DB connection singleton is in `src/lib/db.ts` (`getDb()` / `closeDb()`). Path resolved via `path.resolve(process.cwd(), "data", "sales.db")`; override with `DB_PATH` in production or `TEST_DB_PATH` under vitest.
- **Concurrency**: SQLite WAL transactions. The previous `async-mutex` + atomic temp-file rename approach (from `src/lib/data.ts`) is gone. `src/lib/data.ts` has been deleted — all resources (`brand`, `business-context`, `templates`, `style-presets`, `assets`, `staged-actions`) moved to `data/sales.db` in a follow-up migration. See [[concepts/storage-architecture]].
- **Schema** (three tables):

```sql
CREATE TABLE IF NOT EXISTS content_items (
  id               TEXT PRIMARY KEY,
  type             TEXT NOT NULL,
  state            TEXT NOT NULL,
  aspect_ratio     TEXT NOT NULL,
  hook             TEXT NOT NULL,
  body_idea        TEXT NOT NULL,
  caption          TEXT NOT NULL,
  hashtags         TEXT NOT NULL DEFAULT '[]',
  notes            TEXT,
  chat_session_id  TEXT,
  reference_images TEXT,
  assets           TEXT,
  tags             TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  generated_at     TEXT
);

CREATE TABLE IF NOT EXISTS slides (
  id                TEXT PRIMARY KEY,
  content_item_id   TEXT NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  slide_order       INTEGER NOT NULL,
  notes             TEXT NOT NULL DEFAULT '',
  background        TEXT NOT NULL,
  elements          TEXT NOT NULL,
  legacy_html       TEXT,
  previous_versions TEXT NOT NULL DEFAULT '[]',
  next_versions     TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS content_item_snapshots (
  id              TEXT PRIMARY KEY,
  content_item_id TEXT NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  created_at      TEXT NOT NULL,
  trigger         TEXT NOT NULL,
  label           TEXT,
  payload         TEXT NOT NULL
);
```

- **Migration**: `scripts/migrate-content-items-to-sqlite.mjs` — one-shot, reads `data/content-items.json`, backs it up to `data/content-items.json.bak.<ISO timestamp>` (kept as rollback artifact), inserts all items + slides in a single transaction, then spot-checks counts and 3 random round-trips. Run with `--dry-run` first; pass `--force` to overwrite an existing DB. The original JSON file is never deleted.
- **Rollback path**: stop the dev server, `rm data/sales.db`, restore `data/content-items.json.bak.<timestamp>` to `data/content-items.json`, revert Task 4 of the SQLite migration plan.

## Content-item-level snapshots

A separate versioning layer (coarser than slide-level undo) stores full `ContentItem` snapshots before agent turns. See [[concepts/version-history]] for the full spec. The library is in `src/lib/content-item-snapshots.ts` (`pushItemSnapshot`, `listItemSnapshots`, `restoreItemSnapshot`, `MAX_ITEM_SNAPSHOTS = 5`). API: `GET /api/content/[id]/versions`, `POST /api/content/[id]/versions/[versionId]/restore`.

## Recent changes

- 2026-04-26 (`e9e8e62`) — Initial type + zod schema.
- 2026-04-26 (`b2eb327`) — CRUD lib with mutex + version snapshots.
- 2026-04-26 (`cca70c2`) — Append-only agent invariant enforced at the slide route layer (see [[concepts/append-only-agent-contract]]).
- 2026-04-27 (`4468ea9`) — Removed deprecated `src/lib/carousels.ts` and `Carousel` surface.
- 2026-05-01 (lint) — Corrected `MAX_SLIDES` from 10 to 20 (drift from `src/types/carousel.ts:39`).
- 2026-05-01 (`f99b603`) — `redoSlide` added; `nextVersions` stack lands on slide rows.
- 2026-05-01 (SQLite migration plan) — Persistence moved from `data/content-items.json` to `data/sales.db` (better-sqlite3). `async-mutex` removed for ContentItem writes. Content-item-level snapshot layer added (`content-item-snapshots.ts`). Row helpers in `src/lib/content-item-row.ts`. Slide-level undo/redo cap raised to 25.
- 2026-05-01 (JSON resources migration) — All remaining JSON-backed resources migrated to `data/sales.db`. `src/lib/data.ts` deleted. See [[concepts/storage-architecture]].
