# Migrations

Sequelize-style schema migrations for the SQLite DB at `data/sales.db`.

## Commands

```bash
npm run migrate             # apply every pending migration to the dev DB (data/sales.db)
npm run migrate:undo        # revert the most recently applied migration on the dev DB
npm run migrate:test        # same as `migrate` but against the test DB
npm run migrate:test:undo   # same as `migrate:undo` but against the test DB
```

All four commands are thin wrappers around `tsx scripts/migrate.ts`. The
`:test` variants pass a `--test` flag to the runner, which redirects
`DB_PATH` to a dedicated test database before opening the connection so
that iterating on migrations never clobbers the dev DB. The test DB
path is taken from the `TEST_DB_PATH` env var when set, otherwise it
falls back to `data/test.db`. Use the `:test` variants when developing
or validating migrations — keep the dev DB clean.

## How it works

- Each migration is a TypeScript file in this folder named
  `YYYYMMDDHHMMSS-short-description.ts`. The leading 14-digit timestamp is
  what determines execution order — files are applied in lexicographic
  (= chronological) order.
- Every migration must export two functions:

  ```ts
  import type Database from "better-sqlite3";

  export function up(db: Database.Database): void {
    // forward change
  }

  export function down(db: Database.Database): void {
    // reverse of up()
  }
  ```

  Both may be `async` and return a `Promise<void>`. They receive the
  shared `better-sqlite3` connection from `src/lib/db.ts`.

- Applied migrations are tracked in a `migrations` table:

  ```sql
  CREATE TABLE migrations (
    name        TEXT PRIMARY KEY,
    executed_at TEXT NOT NULL
  );
  ```

  `npm run migrate` reads this table, computes the set of pending files
  (files on disk minus rows in the table) and runs their `up()` in
  order. Each `up()` plus its bookkeeping `INSERT` runs inside a single
  `BEGIN IMMEDIATE` transaction, so a failure rolls the DB back to its
  pre-migration state.

- `npm run migrate:undo` looks up the most recent row in `migrations`
  (by `name DESC`, which thanks to the timestamp prefix matches "most
  recently applied"), runs its `down()`, and deletes the row — also
  inside a single transaction. It only ever undoes one migration; run
  it again to keep stepping back.

## Adding a new migration

1. Pick a fresh timestamp (UTC, `date -u +"%Y%m%d%H%M%S"`).
2. Create `migrations/<timestamp>-<short-kebab-description>.ts`.
3. Implement `up()` and `down()`. Make `up()` idempotent when feasible
   (e.g. guard `ADD COLUMN` with a `PRAGMA table_info` check) so it's
   safe to re-run against environments that have the change already.
4. `npm run migrate` to apply locally.
5. Commit the migration alongside any code that depends on the new
   schema.

## Relationship to `src/lib/db.ts`

`db.ts` declares the **current** schema in `SCHEMA_SQL` for fresh
databases. Migrations evolve **existing** databases toward that same
schema. After running every migration, both code paths must converge on
the identical schema — keep `SCHEMA_SQL` in sync when you add a
migration that introduces a column or table.
