---
title: Sequelize-style migration runner with separate dev/test DB targets
type: decision
date: 2026-05-02
related_code:
  - scripts/migrate.ts
  - migrations/README.md
  - migrations/20260101000000-init.ts
  - migrations/20260502120000-add-downloaded-to-content-items.ts
  - src/lib/db.ts
  - package.json
sources:
  - https://github.com/kmpus/sales/commit/54e3db5
---

# Decision

Schema evolution of `data/sales.db` is handled by a Sequelize-style migration runner at `scripts/migrate.ts`. Migrations live under `migrations/` named `YYYYMMDDHHMMSS-<description>.ts` and export `up(db)` / `down(db)` against the shared `better-sqlite3` connection from `src/lib/db.ts`. Applied migrations are recorded in a `migrations` table; each `up()` and its bookkeeping `INSERT` run inside a single `BEGIN IMMEDIATE` transaction. Four npm scripts: `migrate`, `migrate:undo`, `migrate:test`, `migrate:test:undo`. The `:test` variants pass `--test` to the runner, which redirects `DB_PATH` to `TEST_DB_PATH` (or `data/test.db`) before opening the connection — iterating on a migration never clobbers the dev DB.

# Context

Up to this commit there was no formal migration system. Schema drift was handled by hand-written one-shot scripts (`scripts/migrate-content-items-to-sqlite.mjs`, `scripts/migrate-json-resources-to-sqlite.mjs`) and the `IF NOT EXISTS` bootstrap in `SCHEMA_SQL` (`src/lib/db.ts`). That worked while we were converting JSON resources into tables but doesn't scale to forward-only column additions: `SCHEMA_SQL` only fires on a *fresh* DB, so adding a column to an existing dev DB required manual `sqlite3` poking. The `downloaded` column on `content_items` was the first change that actually needed a forward-only migration step.

We also needed to test migrations without risking the dev DB. Running `npm run migrate` against `data/sales.db` while iterating on a `down()` was a real footgun.

# Alternatives considered

- **Drizzle / Prisma migrate.** Both work but pull in a heavier ORM surface. We use `better-sqlite3` directly today; switching ORMs is a larger decision than warranted by one column.
- **Knex migrations.** Closer to what we landed on but ships its own query builder and connection management. We already have the connection singleton.
- **Hand-rolled `if column not exists then alter table`.** Cheap for one column but degenerates fast: no record of what's been applied, no `down()`, no test isolation.
- **Keep using `IF NOT EXISTS` in `SCHEMA_SQL`.** Doesn't apply forward changes to existing DBs — only creates missing tables on bootstrap. Was already failing for additive changes.

# Consequences

- `SCHEMA_SQL` in `src/lib/db.ts` and the migration set must converge on the same schema. Every new migration that adds/removes a column or table requires a parallel edit to `SCHEMA_SQL`. This is documented in `migrations/README.md` and called out in the project `CLAUDE.md`. Drift will manifest as fresh-bootstrap DBs and migrated DBs disagreeing on column presence.
- The seed `20260101000000-init.ts` migration uses `CREATE TABLE IF NOT EXISTS` everywhere so it is a no-op on databases bootstrapped via `SCHEMA_SQL`. New environments can either run migrations or rely on `SCHEMA_SQL`; both paths converge.
- The test DB path is resolved at runner startup (`applyTestDbOverride()` mutates `process.env.DB_PATH` before `getDb()` runs). It is not the same path vitest uses (`tests/setup-db.ts` seeds `TEST_DB_PATH` per worker) — the migrate `:test` target is a developer tool, not the vitest fixture.
- `down()` is mandatory in every migration file (the runner throws otherwise). SQLite supports `ALTER TABLE DROP COLUMN` since 3.35, so column-addition migrations have a clean reverse.

# Source

- Commit `54e3db5` (2026-05-02) — `feat(content-items): add downloaded + created_at UI; introduce migration runner`.
