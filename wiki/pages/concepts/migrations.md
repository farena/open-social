---
title: Database migrations
type: concept
code_refs: [scripts/migrate.ts, migrations/README.md, "migrations/20260101000000-init.ts", "migrations/20260502120000-add-downloaded-to-content-items.ts", src/lib/db.ts, package.json]
sources: [raw/decisions/migration-runner-2026-05-02.md]
related: [pages/concepts/storage-architecture.md, pages/entities/content-item-model.md]
created: 2026-05-02
updated: 2026-05-02
confidence: high
---

# Database migrations

Schema evolution for `data/sales.db` is handled by a single Sequelize-style migration runner at `scripts/migrate.ts`. Each migration file lives under `migrations/`, exports `up(db)` / `down(db)`, and is tracked in a `migrations` table inside the database itself.

This is the *forward-only* counterpart to the bootstrap path in `src/lib/db.ts` (`SCHEMA_SQL`). New databases can be created either by running every migration or by letting `getDb()` execute `SCHEMA_SQL` on first open — both must converge on the same schema. See [[concepts/storage-architecture]] for the bootstrap side.

## File layout

```
migrations/
├── README.md
├── 20260101000000-init.ts
└── 20260502120000-add-downloaded-to-content-items.ts
```

- Filenames must match `^\d{14}-.+\.(ts|mjs|js)$`. The 14-digit prefix is a UTC timestamp (`date -u +"%Y%m%d%H%M%S"`) and determines lexicographic = chronological execution order.
- Each file exports two functions:

  ```ts
  import type Database from "better-sqlite3";

  export function up(db: Database.Database): void { /* forward */ }
  export function down(db: Database.Database): void { /* reverse */ }
  ```

  Both may be `async` and return `Promise<void>`. The runner awaits them either way.

## The `migrations` table

```sql
CREATE TABLE IF NOT EXISTS migrations (
  name        TEXT PRIMARY KEY,
  executed_at TEXT NOT NULL
)
```

`up` reads this table, computes `pending = files-on-disk \ executed`, and runs them in lexicographic order. Each `up()` plus its bookkeeping `INSERT` is wrapped in a single `BEGIN IMMEDIATE` transaction — failure rolls the DB back to its pre-migration state. `undo` reads the most recent row (`ORDER BY name DESC LIMIT 1`), runs that file's `down()`, and deletes the row, all in one transaction. It only ever undoes one migration; run repeatedly to step further back.

## Commands

```
npm run migrate             # apply pending migrations to data/sales.db
npm run migrate:undo        # revert most recent migration on data/sales.db
npm run migrate:test        # same as migrate, but against the test DB
npm run migrate:test:undo   # same as migrate:undo, but against the test DB
```

All four are thin wrappers around `tsx scripts/migrate.ts`. The `:test` variants pass `--test`, which calls `applyTestDbOverride()`: it sets `process.env.DB_PATH` to `TEST_DB_PATH` if defined, otherwise to `data/test.db`, *before* `getDb()` opens the connection. **Use the `:test` variants when iterating on or validating a migration** — never the dev variants.

The `:test` migrate target is independent of the vitest fixture in `tests/setup-db.ts`, which seeds its own per-worker `TEST_DB_PATH`. Vitest does not run migrations; it bootstraps from `SCHEMA_SQL`.

## Idempotency convention

`up()` should be idempotent when feasible. Pattern for column additions:

```ts
const cols = db.prepare("PRAGMA table_info(content_items)")
  .all() as { name: string }[];
if (!cols.some((c) => c.name === "downloaded")) {
  db.exec("ALTER TABLE content_items ADD COLUMN downloaded INTEGER NOT NULL DEFAULT 0");
}
```

This makes the migration safe to re-run against a DB that already has the column (e.g., one bootstrapped from a newer `SCHEMA_SQL`). The seed `20260101000000-init.ts` uses `CREATE TABLE IF NOT EXISTS` everywhere for the same reason — running it on an existing DB is a no-op.

## Sync constraint with `SCHEMA_SQL`

`src/lib/db.ts` declares the **current** schema in `SCHEMA_SQL` for fresh databases. Migrations evolve **existing** databases. After running every migration, both paths must produce identical schemas. When you add a migration that introduces a column or table, edit `SCHEMA_SQL` in lockstep. There is no automated check for this; drift will manifest as fresh-bootstrap and migrated DBs disagreeing on column presence.

## Adding a new migration

1. `date -u +"%Y%m%d%H%M%S"` for a fresh timestamp.
2. Create `migrations/<timestamp>-<short-kebab-description>.ts` with `up` + `down`.
3. Make `up()` idempotent (e.g., guard `ADD COLUMN` with a `PRAGMA table_info` check).
4. Edit `SCHEMA_SQL` in `src/lib/db.ts` to reflect the new shape.
5. `npm run migrate:test` to validate, then `npm run migrate` for the dev DB.
6. Commit migration + `SCHEMA_SQL` change together.

## Recent changes

- 2026-05-02 (`54e3db5`) — Migration runner introduced; seeded with `20260101000000-init.ts` (idempotent baseline) and `20260502120000-add-downloaded-to-content-items.ts`. See [[raw/decisions/migration-runner-2026-05-02]].
