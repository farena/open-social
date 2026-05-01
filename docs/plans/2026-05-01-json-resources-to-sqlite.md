# JSON Resources → SQLite Migration Plan

> **For agentic workers:** REQUIRED SKILL: `write-plan` for planning and `implementator`/`reviewer` for execution and validation.

**Goal:** Migrate the six remaining JSON-backed resources (`brand`, `business-context`, `templates`, `style-presets`, `assets`, `staged-actions`) from `data/*.json` into the existing `data/sales.db` SQLite database. After this plan, `src/lib/data.ts` (the JSON IO + async-mutex helper) has zero callers and can be deleted.

**Architecture:**
- Two patterns:
  - **Singletons** (`brand`, `business-context`): single configuration document. Stored in a generic `kv_config` table keyed by `key TEXT PRIMARY KEY` with a `value TEXT` JSON blob and an `updated_at TEXT` timestamp. One row per resource; lazy initialization to a default value on first read.
  - **Collections** (`templates`, `style-presets`, `assets`, `staged-actions`): list of records with stable IDs. One table per resource with the existing scalar fields as columns and JSON columns for nested arrays/objects. Same pattern as `content_items` from the previous migration.
- All writes go through `better-sqlite3` prepared statements wrapped in `db.transaction(...)` where multi-row.
- Public function signatures of the existing libs (`brand.ts`, `templates.ts`, etc.) **must not change** — only their backing storage flips.

**Tech Stack:** `better-sqlite3` (already installed), raw SQL, prepared statements, vitest. No new deps.

## Constants

| Name | Value | Where |
|---|---|---|
| `kv_config` rows | 2 (`brand`, `business-context`) | `src/lib/db.ts` schema |
| Collection tables | 4 (`templates`, `style_presets`, `assets`, `staged_actions`) | `src/lib/db.ts` schema |

## Invariants to preserve (do not regress)

- `getBrand()` / `getBusinessContext()` still return the **default config** when the row is missing (current behavior via `readDataSafe`'s fallback). Don't insert default rows on first read — return the in-memory default and let `update*` create the row.
- `addAsset` still uses `unshift` semantics (newest first). Reads order by `added_at DESC` to mirror it.
- `templates.json` slide field projection (`{id, order, notes, background, elements, legacyHtml}`) is unchanged: `saveAsTemplate` continues to **omit** `previousVersions` / `nextVersions` from the snapshot.
- `staged-actions.json` `resolvedAt` defaults to `null` for new pending actions — preserve as `NULL` column with explicit handling in (de)serialization.
- `updateAsset` only mutates `name` / `description`. The `addedAt` timestamp is immutable. Same for `staged_actions.created_at`.
- `BrandConfig.fonts` and `BrandConfig.colors` are partial-merged on update (current code: `colors: { ...current.colors, ...updates.colors }`). The new code reads-then-writes the full row, so the merge logic stays in the lib layer; no SQL difference.

---

## Scope check

- One subsystem migration: the JSON ↔ SQLite seam under `src/lib/`.
- Out of scope: deleting `src/lib/data.ts` itself (deferred to a final task; ensures nothing slips back in mid-migration).
- Out of scope: schema changes to existing types (`Template`, `Asset`, etc.). The migration is shape-preserving.
- Out of scope: the dev-time JSON viewer / editor (no such tool exists today; if added later, point it at SQLite).
- Out of scope: realtime/SSE for these resources. They stay request-response.

## File map

**Modify:**
- `src/lib/db.ts` — append the new tables to `SCHEMA_SQL` (still idempotent via `IF NOT EXISTS`).
- `src/lib/brand.ts` — replace `readData`/`writeData` with `kv_config` ops.
- `src/lib/business-context.ts` — same pattern as `brand.ts`.
- `src/lib/templates.ts` — replace JSON load/save with `templates` table ops.
- `src/lib/style-presets.ts` — replace with `style_presets` table ops.
- `src/lib/assets.ts` — replace with `assets` table ops.
- `src/lib/staged-actions.ts` — replace with `staged_actions` table ops.
- `wiki/pages/concepts/storage-architecture.md` *(if present; otherwise add it)* — document the SQLite-first stance and the role of the kept-but-empty `src/lib/data.ts` (if not deleted).

**Create:**
- `src/lib/kv-config.ts` — generic `getKvConfig<T>(key, default)` / `setKvConfig<T>(key, value)` helpers. Both return / accept fully-typed JSON. Used by `brand.ts` and `business-context.ts`.
- `scripts/migrate-json-resources-to-sqlite.mjs` — one-shot migration with `--dry-run` and `--force` flags. Behavior mirrors `migrate-content-items-to-sqlite.mjs`: backup each JSON, validate shape, insert in one transaction, count-check, spot-check.
- `src/lib/__tests__/kv-config.test.ts`
- `src/lib/__tests__/brand.test.ts` — round-trip + default-on-missing.
- `src/lib/__tests__/business-context.test.ts` — same.
- `src/lib/__tests__/templates.test.ts` — list / get / create / delete.
- `src/lib/__tests__/style-presets.test.ts` — same.
- `src/lib/__tests__/assets.test.ts` — list / add (unshift order) / update / remove.
- `src/lib/__tests__/staged-actions.test.ts` — list / get / create / update / status helper.

**Delete (in the final task only):**
- `src/lib/data.ts` — deleted once nothing imports it.
- `data/brand.json`, `data/business-context.json`, `data/templates.json`, `data/style-presets.json`, `data/assets.json`, `data/staged-actions.json` — kept as `.bak.<timestamp>` backups during the migration; deleted by the user after smoke confirmation.

**Untouched (explicit non-goals):**
- `src/lib/content-items.ts` and `src/lib/content-item-snapshots.ts` — already SQLite.
- `src/lib/db.ts` connection singleton + `getDb()` / `closeDb()` API.
- API route handlers — they import the libs above; the lib refactor is transparent to them.
- `src/types/*` — type definitions stay shape-preserving.

---

## Schema (canonical reference)

Append to the existing `SCHEMA_SQL` in `src/lib/db.ts`. Keep `IF NOT EXISTS` so re-runs are idempotent.

```sql
-- Singleton config rows: brand, business-context.
CREATE TABLE IF NOT EXISTS kv_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,            -- JSON-encoded full document
  updated_at TEXT NOT NULL
);

-- Reusable carousel templates.
CREATE TABLE IF NOT EXISTS templates (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL,
  aspect_ratio  TEXT NOT NULL,
  slides        TEXT NOT NULL,          -- JSON array of trimmed slides
  tags          TEXT NOT NULL DEFAULT '[]',
  created_at    TEXT NOT NULL
);

-- Visual style presets pulled into chat.
CREATE TABLE IF NOT EXISTS style_presets (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  payload     TEXT NOT NULL,            -- JSON of the rest of the preset
  created_at  TEXT NOT NULL
);

-- Reusable visual assets surfaced to the agent.
CREATE TABLE IF NOT EXISTS assets (
  id          TEXT PRIMARY KEY,
  url         TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  added_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assets_added_at ON assets(added_at DESC);

-- Pending file-write actions queued by the agent for user approval.
CREATE TABLE IF NOT EXISTS staged_actions (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL,
  file_name    TEXT NOT NULL,
  content      TEXT NOT NULL,
  description  TEXT NOT NULL,
  carousel_id  TEXT NOT NULL,
  auto_execute INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  resolved_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_staged_actions_status ON staged_actions(status);
```

**Notes on shape:**
- `kv_config.value` stores the full JSON document; merge logic lives in the lib (same as today). This is simpler than fanning out columns and keeps the lib code untouched.
- `style_presets.payload` is a JSON blob of all preset fields *except* `id`, `name`, `description`, `created_at` (the indexable / displayable bits stay top-level). The payload shape mirrors `Omit<StylePreset, "id" | "name" | "description" | "createdAt">`.
- `staged_actions.auto_execute` is INTEGER for SQLite boolean idiom.
- `templates.slides` stores the trimmed slide projection from `saveAsTemplate` verbatim — no further normalization in SQL.

---

## Tasks

### Task 1: Extend `db.ts` schema

**Files:**
- Modify: `src/lib/db.ts`
- Modify: `src/lib/__tests__/db.test.ts` (extend the existing schema test)

- [ ] **Step 1: Update the schema test** — add assertions that all five new tables exist (`kv_config`, `templates`, `style_presets`, `assets`, `staged_actions`) and that the two indexes (`idx_assets_added_at`, `idx_staged_actions_status`) exist.
- [ ] **Step 2: Run test, confirm fail.**
- [ ] **Step 3: Append the new SQL** to `SCHEMA_SQL` in `src/lib/db.ts`.
- [ ] **Step 4: Run test, confirm pass.**
- [ ] **Step 5: Commit:** `feat(db): add kv_config, templates, style_presets, assets, staged_actions tables`.

**Validation:** existing 12 test files still green; the schema test now covers 8 tables + 4 indexes.

---

### Task 2: `kv-config.ts` helper

**Files:**
- Create: `src/lib/kv-config.ts`
- Create: `src/lib/__tests__/kv-config.test.ts`

- [ ] **Step 1: Write failing tests:**
  - `getKvConfig("missing", { foo: 1 })` returns `{ foo: 1 }` and **does not insert** a row (assert `SELECT COUNT(*) FROM kv_config = 0`).
  - `setKvConfig("brand", payload)` inserts a row; `getKvConfig("brand", default)` returns the persisted payload (deep equal).
  - `setKvConfig` is upsert: calling it twice replaces the row; `updated_at` advances; only one row per key.
  - JSON round-trip preserves nested shapes (objects, arrays, nulls).
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** with two prepared statements (`SELECT` + `INSERT ... ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`). Both functions are async to match the surrounding code style; internally `better-sqlite3` is sync.
- [ ] **Step 4: Run, confirm pass.**
- [ ] **Step 5: Commit:** `feat(kv-config): add singleton config helper`.

---

### Task 3: Refactor `brand.ts` and `business-context.ts`

**Files:**
- Modify: `src/lib/brand.ts`
- Modify: `src/lib/business-context.ts`
- Create: `src/lib/__tests__/brand.test.ts`
- Create: `src/lib/__tests__/business-context.test.ts`

- [ ] **Step 1: Write failing tests for `brand.ts`:**
  - `getBrand()` on an empty DB returns `DEFAULT_BRAND`.
  - `updateBrand({ name: "X" })` persists; subsequent `getBrand()` reflects the change.
  - Partial color update preserves untouched colors (the merge invariant).
  - `createdAt` is set on first `updateBrand`; `updatedAt` advances on every call.
  - `isBrandConfigured` is unchanged (pure function — included as a sanity test).
- [ ] **Step 2: Write failing tests for `business-context.ts`:** mirror of brand: default on empty, persistence, array-field replace semantics (`keyMessages` and `differentiators` use `??` not merge — preserve).
- [ ] **Step 3: Run, confirm fail.**
- [ ] **Step 4: Implement** both libs by replacing `readDataSafe(FILE, default)` with `getKvConfig("brand"|"business-context", default)` and `writeData(FILE, ...)` with `setKvConfig(...)`. Drop the `import { readDataSafe, writeData } from "./data"` line.
- [ ] **Step 5: Run, confirm pass.**
- [ ] **Step 6: Commit:** `refactor(config): back brand and business-context with sqlite kv_config`.

---

### Task 4: Refactor `templates.ts`

**Files:**
- Modify: `src/lib/templates.ts`
- Create: `src/lib/__tests__/templates.test.ts`

- [ ] **Step 1: Write failing tests:**
  - `listTemplates()` empty → `[]`.
  - `saveAsTemplate(item)` returns a `Template` with `id`, `createdAt` populated and the slide projection containing only `{id, order, notes, background, elements, legacyHtml}` (no `previousVersions`, no `nextVersions`). Reading back via `getTemplate(id)` is deep-equal.
  - `saveAsTemplate(item, name, description)` honors the optional name/description args; otherwise defaults to `item.hook || item.id`.
  - `tags` round-trip (empty array, single tag, multiple tags).
  - `deleteTemplate("missing")` → `false`. `deleteTemplate(id)` → `true`; subsequent `getTemplate(id)` → `null`.
  - Inserting two templates and listing them returns both — order does not matter for templates (current JSON code preserves insertion order; the SQLite version should too, ordered by `created_at ASC`).
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement:**
  - Helpers `templateToRow` / `rowToTemplate` (keep them local to the file unless they grow).
  - Prepared statements: `SELECT * FROM templates ORDER BY created_at ASC`, `SELECT * FROM templates WHERE id = ?`, `INSERT INTO templates (...) VALUES (...)`, `DELETE FROM templates WHERE id = ?`.
  - The `slides` column stores `JSON.stringify(template.slides)` after the trim projection (logic stays in `saveAsTemplate`).
- [ ] **Step 4: Run, confirm pass.**
- [ ] **Step 5: Commit:** `refactor(templates): back with sqlite, preserve API`.

---

### Task 5: Refactor `style-presets.ts`

**Files:**
- Modify: `src/lib/style-presets.ts`
- Create: `src/lib/__tests__/style-presets.test.ts`

- [ ] **Step 1: Write failing tests:** list empty, create / get round-trip, list returns insertion order, delete missing → false, delete present → true. Round-trip also confirms the `payload` JSON column carries all fields beyond `id/name/description/createdAt`.
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** — same pattern as Task 4.
- [ ] **Step 4: Run, confirm pass.**
- [ ] **Step 5: Commit:** `refactor(style-presets): back with sqlite, preserve API`.

---

### Task 6: Refactor `assets.ts`

**Files:**
- Modify: `src/lib/assets.ts`
- Create: `src/lib/__tests__/assets.test.ts`

- [ ] **Step 1: Write failing tests:**
  - List empty → `[]`.
  - `addAsset` returns the inserted asset with `id` and `addedAt`. Reading back: list returns it.
  - **Order test**: add A then B then C; `listAssets()` returns `[C, B, A]` (newest first, mirroring `unshift`).
  - `updateAsset(id, { name: "x" })` mutates only the name. `description` only updates when the input has it. Empty trimmed string clears `description` to `undefined`.
  - `removeAsset("missing")` → false. `removeAsset(id)` → true.
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement:**
  - `SELECT * FROM assets ORDER BY added_at DESC` for listing.
  - `addedAt` set in the lib (not in SQL) so the `now()` source remains the same.
  - `description` column nullable; `null` ↔ `undefined` mapping mirrors the existing JSON behavior.
- [ ] **Step 4: Run, confirm pass.**
- [ ] **Step 5: Commit:** `refactor(assets): back with sqlite, preserve API`.

---

### Task 7: Refactor `staged-actions.ts`

**Files:**
- Modify: `src/lib/staged-actions.ts`
- Create: `src/lib/__tests__/staged-actions.test.ts`

- [ ] **Step 1: Write failing tests:**
  - Create a pending action; `listStagedActions()` returns it. `getStagedAction(id)` round-trips all fields including `autoExecute`, `resolvedAt: null`.
  - `updateStagedAction(id, { status: "approved", resolvedAt: "..." })` updates both fields.
  - `updateStagedActionStatus(id, "approved")` sets `resolvedAt` to a fresh `now()` value (assert truthy + ISO format).
  - `updateStagedActionStatus(id, "pending")` sets `resolvedAt` back to `null`.
  - Insertion order preserved by `listStagedActions()` (currently `push`; mirror with `ORDER BY created_at ASC`).
- [ ] **Step 2: Run, confirm fail.**
- [ ] **Step 3: Implement** — `auto_execute` INTEGER ↔ boolean; `resolved_at` nullable; the rest mirrors prior tasks.
- [ ] **Step 4: Run, confirm pass.**
- [ ] **Step 5: Commit:** `refactor(staged-actions): back with sqlite, preserve API`.

---

### Task 8: Migration script

**Files:**
- Create: `scripts/migrate-json-resources-to-sqlite.mjs`

- [ ] **Step 1: Write the script.** Behavior mirrors `migrate-content-items-to-sqlite.mjs`:
  - Args: `--dry-run`, `--force`.
  - For each of the six JSON files: if absent, log + skip; else read + structurally validate.
  - Backup each file to `data/<file>.bak.<ISO timestamp>` before writes.
  - One transaction inserts everything: 1 `kv_config` row per singleton, N rows per collection.
  - Skip insert if the table already has rows for that resource AND not `--force` (don't double-import). Report this clearly.
  - Verify: `SELECT COUNT(*)` per table matches input. Spot-check 1 random row per non-empty collection.
  - Print a per-resource report and a single summary line at the end.
- [ ] **Step 2: Run with `--dry-run`** against the real `data/*.json` files. Report counts.
- [ ] **Step 3: Run for real.** Confirm `data/sales.db` now has the five new tables populated.
- [ ] **Step 4: Smoke check via the running app:**
  - Open Brand settings page → values render.
  - Open Business Context page → values render.
  - List assets in the chat sidebar → all assets appear in newest-first order.
  - (Templates / style-presets / staged-actions can be empty — confirm the UI renders empty states cleanly.)
- [ ] **Step 5: Commit:** `feat(migration): one-shot json resources → sqlite`.

**Rollback:** Stop the app, run `DELETE FROM kv_config; DELETE FROM templates; DELETE FROM style_presets; DELETE FROM assets; DELETE FROM staged_actions;`, restore from `.bak.<timestamp>` files, revert Tasks 3–7. Documented in the commit message.

---

### Task 9: Remove `data.ts` and the JSON files

**Files:**
- Delete: `src/lib/data.ts`
- Delete: `data/brand.json`, `data/business-context.json`, `data/templates.json`, `data/style-presets.json`, `data/assets.json`, `data/staged-actions.json` *(only after the user confirms the smoke check)*.
- Delete: any orphaned tests referencing `data.ts` if found.

- [ ] **Step 1: Final grep:** `grep -rln "from \"@/lib/data\"\|from \"./data\"\|from \"../lib/data\"" src/ scripts/ tests/` must return **zero hits**. If any hit remains, STOP and route to the appropriate task.
- [ ] **Step 2: Delete `src/lib/data.ts`.**
- [ ] **Step 3: Run the full test suite + lint.** Both must pass.
- [ ] **Step 4:** Ask the user before deleting the `data/*.json` source files (the `.bak.*` backups stay regardless). Don't auto-delete user data.
- [ ] **Step 5: Commit:** `chore(data): remove json data layer in favor of sqlite`.

---

### Task 10: Wiki updates

**Files:**
- Modify: `wiki/pages/entities/content-item-model.md` *(update the "other JSON files still served by data.ts" sentence — no longer true)*.
- Modify: `wiki/pages/concepts/storage-architecture.md` *(create if missing)*. Document:
  - Single SQLite DB at `data/sales.db`, WAL mode.
  - Eight tables: `content_items`, `slides`, `content_item_snapshots`, `kv_config`, `templates`, `style_presets`, `assets`, `staged_actions`.
  - JSON-blob columns (`hashtags`, `elements`, `payload`, etc.) for nested or schema-flexible data.
  - Singleton vs. collection table pattern.
  - The deleted `src/lib/data.ts` and the migration history.

- [ ] **Step 1: Edit pages.**
- [ ] **Step 2: Run** `npx wiki-query "json sqlite migration"` to spot-check ranking.
- [ ] **Step 3: Commit:** `docs(wiki): document unified sqlite storage`.

---

## Acceptance criteria → task mapping

| # | Criterion | Task |
|---|---|---|
| 1 | New tables exist in `data/sales.db` (`kv_config`, `templates`, `style_presets`, `assets`, `staged_actions`) | Task 1 |
| 2 | `getBrand()` / `getBusinessContext()` round-trip and return defaults on empty DB | Tasks 2, 3 |
| 3 | Partial-merge semantics for `brand.colors` / `brand.fonts` preserved | Task 3 |
| 4 | `templates`: insertion order, slide projection trim preserved, full round-trip | Task 4 |
| 5 | `style_presets`: full round-trip, payload column carries arbitrary JSON | Task 5 |
| 6 | `assets`: newest-first ordering, partial update semantics | Task 6 |
| 7 | `staged_actions`: status helper sets `resolvedAt` correctly, `auto_execute` boolean round-trip | Task 7 |
| 8 | Migration: count match per resource, spot-check, JSON backups created | Task 8 |
| 9 | After migration, app renders correctly across brand / context / assets pages | Task 8 |
| 10 | `src/lib/data.ts` has zero importers and is deleted | Task 9 |
| 11 | Wiki documents the unified storage | Task 10 |

---

## Execution order & parallelism

```
Task 1 (schema)
  └─> Task 2 (kv-config) ─┐
                            ├─> Task 3 (brand + business-context) ─┐
                                                                     │
Task 1 ──┐                                                          │
         ├─> Task 4 (templates)     ────────────────────────────────┤
         ├─> Task 5 (style-presets) ────────────────────────────────┤
         ├─> Task 6 (assets)        ────────────────────────────────┤
         └─> Task 7 (staged-actions) ───────────────────────────────┤
                                                                     │
                                                                     ├─> Task 8 (migration script)
                                                                     │
                                                                     └─> Task 9 (delete data.ts)
                                                                          └─> Task 10 (wiki)
```

- **Sequential:** 1 → {2 + 3 in series} and 1 → {4, 5, 6, 7 in parallel}.
- After Tasks 3, 4, 5, 6, 7 complete: Task 8 (migration) runs.
- Task 9 must wait for **all** prior refactor tasks (otherwise some lib still imports `data.ts`).
- Task 10 (wiki) can run in parallel with Task 9.

**Recommended grouping for `/run-plan`:**
- Group 1: Task 1.
- Group 2: Task 2.
- Group 3: Tasks 3, 4, 5, 6, 7 in parallel (each refactors a different lib + writes its own tests; no shared files).
- Group 4: Task 8.
- Group 5: Task 9 (sequential — confirms no callers of `data.ts` first).
- Group 6: Task 10.

---

## Critical risks

1. **Default-on-empty regression.** The current JSON layer returns `DEFAULT_BRAND` / `DEFAULT_BUSINESS_CONTEXT` when the file is missing. The new code must do the same when the kv_config row is missing — without inserting a default. Test coverage in Task 3 enforces this.

2. **`updateAsset` description-clearing semantics.** Existing code: `description = trimmed.length > 0 ? trimmed : undefined`. Make sure the SQL update sends `NULL` (not the literal string `"undefined"`) when clearing. Test in Task 6 catches this.

3. **Migration idempotency.** Running the migration twice should not duplicate rows. The script must check for existing rows per resource before inserting; the `--force` flag wipes and re-inserts atomically. Documented in Task 8.

4. **Stage-actions ordering.** `staged_actions.json` uses `push` (oldest first). The current handlers iterate the list in that order. The SQLite version must use `ORDER BY created_at ASC` to mirror it. Test in Task 7.

5. **JSON ↔ undefined ↔ null fields.** Three of the six resources have nullable optional fields (`assets.description`, `staged_actions.resolved_at`, `style_presets.description`). Each refactor task must round-trip both the present and absent cases — covered in the per-task tests.

6. **Concurrent reads/writes during migration.** If the dev server is running while the migration script writes, `better-sqlite3` WAL mode tolerates concurrent reads but a race could write to JSON via the still-old code path before the lib refactor is deployed. **Mitigation:** Tasks 3–7 (lib refactor) commit *before* Task 8 (migration script run). The lib refactor reads from SQLite immediately, but `getKvConfig` returns defaults when the row is missing — the app gracefully runs on defaults during the gap. Once migration runs, real data appears. No data loss possible.

7. **Inverse: lib refactor lands without migration.** Same mitigation: defaults gracefully cover the gap. Worst case is the user briefly sees default brand colors / no assets until they run the migration. Document this on each refactor commit message.

## Recommended execution mode

**Option 1 (recommended): subagent-driven task execution via `/run-plan`.** Tasks 4–7 parallelize cleanly; the lib code is small enough that one implementator per task is appropriate.

**Option 2: inline execution.** Viable; ~2 hours total. The lib refactors are mechanical once the kv-config helper exists.
