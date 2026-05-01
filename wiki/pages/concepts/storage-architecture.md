---
title: Storage architecture — unified SQLite
type: concept
code_refs: [src/lib/db.ts, src/lib/kv-config.ts, src/lib/brand.ts, src/lib/templates.ts, src/lib/style-presets.ts, src/lib/assets.ts, src/lib/staged-actions.ts, src/lib/content-items.ts, src/lib/content-item-snapshots.ts, scripts/migrate-content-items-to-sqlite.mjs, scripts/migrate-json-resources-to-sqlite.mjs]
related: [pages/entities/content-item-model.md, pages/concepts/version-history.md]
created: 2026-05-01
updated: 2026-05-01
confidence: high
---

# Storage architecture — unified SQLite

All durable state lives in a single SQLite database: `data/sales.db`. The previous approach — one JSON file per resource protected by `async-mutex` + atomic temp-file rename — was replaced in two migration phases. `src/lib/data.ts` (the JSON IO helper) has been deleted and has no callers.

## Database connection

`src/lib/db.ts` exports two functions:

- `getDb()` — returns a module-level singleton `Database` instance, opening and initialising the DB on first call.
- `closeDb()` — closes the singleton and resets the reference to `null`. Called in test teardown.

Pragmas set at open time:

```
PRAGMA journal_mode = WAL;
PRAGMA synchronous  = NORMAL;
PRAGMA foreign_keys = ON;
```

Path resolution (in priority order):

1. **Under vitest** (`process.env.VITEST === "1"`): reads `TEST_DB_PATH`. If absent, `getDb()` throws — this is intentional; it prevents tests from silently touching the production file.
2. **Production / dev**: reads `DB_PATH` env var, falling back to `path.resolve(process.cwd(), "data", "sales.db")`.

## Eight tables

### Content-item tables (phase 1 migration)

| Table | Purpose | Key JSON columns |
|---|---|---|
| `content_items` | One row per Instagram deliverable | `hashtags`, `reference_images`, `assets`, `tags` |
| `slides` | Ordered slides owned by a content item | `background`, `elements`, `previous_versions`, `next_versions` |
| `content_item_snapshots` | Full content-item snapshots before agent turns | `payload` |

`slides` has a composite index on `(content_item_id, slide_order)`. `content_item_snapshots` has an index on `(content_item_id, created_at DESC)`. Both tables reference `content_items(id)` with `ON DELETE CASCADE`.

### Singleton config table (phase 2 migration)

| Table | Purpose | Key JSON columns |
|---|---|---|
| `kv_config` | One keyed row per singleton configuration document | `value` |

Currently two rows: `brand` and `business-context`. The generic helpers in `src/lib/kv-config.ts` (`getKvConfig<T>(key, default)` / `setKvConfig<T>(key, value)`) handle serialisation and upsert. Both `src/lib/brand.ts` and `src/lib/business-context.ts` are built on top of these helpers.

Singleton default behaviour: if the row is absent, `getKvConfig` returns the in-memory `defaultValue` without inserting a row. The row is created on the first `setKvConfig` call (upsert via `INSERT … ON CONFLICT DO UPDATE`).

### Collection tables (phase 2 migration)

| Table | Purpose | Key JSON columns |
|---|---|---|
| `templates` | Reusable slide sets | `slides`, `tags` |
| `style_presets` | Named style bundles | `payload` |
| `assets` | Brand media library | _(all scalar)_ |
| `staged_actions` | Agent-proposed file mutations | _(all scalar)_ |

Each collection table follows the same pattern as `content_items`: stable `id TEXT PRIMARY KEY`, scalar fields as columns, nested arrays/objects in `TEXT` JSON columns. Lib modules (`src/lib/templates.ts`, etc.) stringify on write and parse on read.

`assets` has an index on `added_at DESC` to preserve newest-first ordering without an `ORDER BY` on every read. `staged_actions` has an index on `status`.

## Two storage patterns

### Singleton (`kv_config` keyed rows)

Use when the resource is a single configuration document (no stable ID, no list operations). Access via `getKvConfig` / `setKvConfig` in `src/lib/kv-config.ts`.

### Collection (one table per resource)

Use when the resource is a list of records with stable IDs, list/get/create/delete operations, and possible ordering requirements. One table per resource; lib module owns all SQL.

## The deleted `src/lib/data.ts`

`src/lib/data.ts` previously provided:

- `readData<T>(filename)` / `writeData<T>(filename, data)` — JSON file IO with `async-mutex` and atomic temp-file rename (`fs.rename`).
- `readDataSafe<T>(filename, default)` — `readData` with a caught ENOENT fallback.

It was the sole IO layer for `brand.json`, `business-context.json`, `templates.json`, `style-presets.json`, `assets.json`, and `staged-actions.json`. All callers were migrated to SQLite in phase 2; the file was then deleted with no remaining imports.

## Migration history

### Phase 1 — ContentItems to SQLite

Script: `scripts/migrate-content-items-to-sqlite.mjs`

Reads `data/content-items.json`, backs it up to `data/content-items.json.bak.<ISO timestamp>`, inserts all items and slides in a single transaction, then spot-checks counts and 3 random round-trips. Supports `--dry-run` and `--force`. The original JSON is never deleted by the script.

### Phase 2 — JSON resources to SQLite

Script: `scripts/migrate-json-resources-to-sqlite.mjs`

Mirrors the phase-1 script for the six remaining JSON files (`brand.json`, `business-context.json`, `templates.json`, `style-presets.json`, `assets.json`, `staged-actions.json`). Each file is backed up to `data/<name>.json.bak.<ISO timestamp>` before any write. Supports `--dry-run` and `--force`. The original JSON files are not deleted; they remain as `.bak.*` artifacts pending user confirmation.

## Test isolation

The vitest setup file (`tests/setup-db.ts`) seeds `TEST_DB_PATH` with a per-worker temporary path before any test runs. Individual test files call `closeDb()` in `afterEach` so the module-level singleton is reset between tests. The guard in `getDb()` — throwing when `VITEST` is set but `TEST_DB_PATH` is absent — makes accidental production-DB access a hard error rather than a silent hazard.

## Rollback path

1. Stop the dev server.
2. `rm data/sales.db`
3. Restore the `.bak.<timestamp>` files to their original names.
4. Revert the relevant lib modules to their JSON-backed versions.

Phase-1 rollback also requires reverting `src/lib/content-items.ts`, `src/lib/content-item-snapshots.ts`, and `src/lib/content-item-row.ts`.

## Decision record

Prior to phase 1, every resource used `async-mutex` + atomic rename to prevent concurrent Next.js requests from corrupting JSON files. SQLite WAL achieves the same serialisation guarantee at the OS level with lower latency and no application-level lock. The migration also enables SQL queries (filtering, ordering, joins) without loading entire files into memory, and makes the test isolation story explicit and enforceable.

## Recent changes

- 2026-05-01 (phase 1) — `content_items`, `slides`, `content_item_snapshots` migrated from `data/content-items.json`.
- 2026-05-01 (phase 2) — `kv_config`, `templates`, `style_presets`, `assets`, `staged_actions` migrated from six JSON files. `src/lib/data.ts` deleted.
