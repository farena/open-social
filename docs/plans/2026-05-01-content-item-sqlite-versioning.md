# ContentItem SQLite + Versioning Implementation Plan

> **For agentic workers:** REQUIRED SKILL: `write-plan` for planning and `implementator`/`reviewer` for execution and validation.

**Goal:** Migrate `data/content-items.json` to SQLite (better-sqlite3), add content-item-level versioning (5-snapshot FIFO) triggered before agent turns with restore endpoint, raise slide-level undo/redo cap to 25, and bump the editor persist debounce to 10 s.

**Architecture:** Three SQLite tables — `content_items` (one row per item, scalar fields), `slides` (one row per slide, FK to content_items, with both `previous_versions` and `next_versions` JSON stacks for slide-level undo/redo), `content_item_snapshots` (≤5 rows per item, full ContentItem JSON payload). Snapshots are written before `/api/content/[id]/generate` and `/api/chat` (when a content item is in context). Restore is transactional and itself snapshots the prior state. Slide-level undo/redo (added in commit `f99b6034`) is preserved end-to-end. Other JSON files (`brand.json`, `templates.json`, etc.) stay on disk.

**Tech Stack:** `better-sqlite3` (sync, WAL mode), raw SQL, prepared statements, vitest. No ORM. Refactor preserves the existing `src/lib/content-items.ts` exported function signatures.

## Constants

| Name | Value | Where |
|---|---|---|
| `MAX_VERSIONS` (slide-level undo + redo stacks) | **25** (was 5) | `src/types/carousel.ts` |
| `MAX_ITEM_SNAPSHOTS` (content-item-level snapshots) | **5** | `src/lib/content-item-snapshots.ts` |
| Editor persist debounce | **10000 ms** (was 400 ms) | `src/components/editor/useSlideEditor.ts` |

## Invariants to preserve (do not regress)

- Slide-level **undo** (`POST /api/content/[id]/slides/[slideId]/undo`) and **redo** (`POST .../redo`) work as before, just with a larger cap (25 each).
- `undoSlide` pushes the current state to `nextVersions` before applying the popped `previousVersions` snapshot. `redoSlide` mirrors this.
- **Any user/agent edit clears `nextVersions`** — branching the history. This already lives in `pushSnapshot` (`src/lib/content-items.ts`) as `slide.nextVersions = []` and must be preserved verbatim in the SQLite refactor.
- Manual `PATCH /api/content/[id]` does NOT create a content-item-level snapshot. Only `/generate` and `/chat` (with `contentItemId`) do.
- Append-only agent contract during `state: "generating"` stays intact.

---

## Scope check

- One subsystem: ContentItem persistence + content-item-level snapshots.
- Out of scope: migrating other JSON files, snapshot UI, snapshot diff, manual snapshot trigger, deduplication, slide-level undo changes.

## File map

**Create:**
- `src/lib/db.ts` — better-sqlite3 singleton + idempotent schema init + WAL pragma.
- `src/lib/content-item-snapshots.ts` — `pushItemSnapshot`, `listItemSnapshots`, `restoreItemSnapshot`, `MAX_ITEM_SNAPSHOTS=5`.
- `src/lib/content-item-row.ts` — row ↔ `ContentItem` (de)serialization helpers (JSON columns, slides hydration).
- `src/app/api/content/[id]/versions/route.ts` — `GET` lists snapshots (no payload).
- `src/app/api/content/[id]/versions/[versionId]/restore/route.ts` — `POST` restores.
- `scripts/migrate-content-items-to-sqlite.mjs` — one-shot migration with backup + dry-run flag.
- `src/lib/__tests__/content-item-snapshots.test.ts` — unit tests for snapshot lifecycle.
- `src/lib/__tests__/content-items-sqlite.test.ts` — parity tests against the refactored CRUD.
- `src/lib/__tests__/db.test.ts` — schema init smoke test.

**Modify:**
- `src/lib/content-items.ts` — replace JSON load/save with SQLite prepared statements. Keep all exported function signatures and return shapes identical.
- `src/app/api/content/[id]/generate/route.ts` — add `pushItemSnapshot(id, "generate")` call before `updateContentItem({ state: "generating" })`.
- `src/app/api/chat/route.ts` — when `contentItemId` is present, call `pushItemSnapshot(contentItemId, "chat", labelFromMessage)` before spawning the subprocess.
- `src/types/carousel.ts` — `MAX_VERSIONS` 5 → 25.
- `src/components/editor/useSlideEditor.ts` — default `debounceMs` 400 → 10000; flush pending persist on unmount.
- `src/components/editor/EditorBody.tsx` — pass `debounceMs: 10000` explicitly and add `beforeunload`/route-change flush.
- `package.json` — add `better-sqlite3` and `@types/better-sqlite3`.
- `.gitignore` — add `*.db`, `*.db-wal`, `*.db-shm` patterns under `/data/` (already gitignored as a directory, but explicit for clarity).
- `wiki/pages/concepts/version-history.md` — document the new content-item-level layer; update slide-level section to reflect undo/redo + cap=25 + 10 s debounce.
- `wiki/pages/entities/content-item-model.md` — update persistence section (SQLite, not JSON).

**Untouched (explicit non-goals):**
- `src/lib/data.ts` — still serves the other JSON files.
- `src/lib/content-item-schema.ts` — zod schemas remain authoritative.
- `src/lib/slide-schema.ts` — `slideSchema` already includes `nextVersions` (commit `f99b6034`).
- Slide-level undo/redo route handlers: `src/app/api/content/[id]/slides/[slideId]/undo/route.ts` and `.../redo/route.ts` (logic unchanged; only the cap constant changes).
- Editor toolbar Undo/Redo buttons and `useEditorShortcuts.ts` (already shipped).

---

## Schema (canonical reference)

```sql
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;

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
CREATE INDEX IF NOT EXISTS idx_slides_item ON slides(content_item_id, slide_order);

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

DB path: `data/sales.db`. Resolved via `path.resolve(process.cwd(), "data", "sales.db")`. In tests, override via env var `TEST_DB_PATH`.

---

## Tasks

### Task 1: Add `better-sqlite3` dependency

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`

- [x] **Step 1:** Add `better-sqlite3` (latest 11.x) and `@types/better-sqlite3` to dependencies.
- [x] **Step 2:** Run `npm install` and confirm native build succeeds on this Linux/WSL machine.
- [x] **Step 3:** Append explicit DB ignore lines to `.gitignore`: `*.db`, `*.db-wal`, `*.db-shm` (defense in depth — `/data/` is already ignored).
- [x] **Step 4:** Commit: `chore(deps): add better-sqlite3 for content-item storage`.

**Validation:** `node -e "require('better-sqlite3')(':memory:').exec('CREATE TABLE t(x INTEGER)')"` exits 0.

---

### Task 2: `src/lib/db.ts` — connection singleton + schema init

**Files:**
- Create: `src/lib/db.ts`
- Create: `src/lib/__tests__/db.test.ts`

- [x] **Step 1: Write failing test** — `db.test.ts` opens the DB via `getDb()` (with a temp `TEST_DB_PATH`), asserts the three tables exist (`SELECT name FROM sqlite_master WHERE type='table'`), asserts `journal_mode` is `wal`, asserts `foreign_keys` is on.
- [x] **Step 2: Run test, confirm fail** (`npm test -- db.test`).
- [x] **Step 3: Implement `db.ts`:**
  - Export `getDb(): Database.Database` — singleton, lazy. Honor `process.env.TEST_DB_PATH` if set.
  - On first call: ensure `data/` exists, open the DB, set `journal_mode=WAL`, `synchronous=NORMAL`, `foreign_keys=ON`, run the `CREATE TABLE IF NOT EXISTS ...` block from the schema reference above.
  - Export `closeDb()` for tests (resets the singleton).
- [x] **Step 4: Run test, confirm pass.**
- [x] **Step 5: Commit:** `feat(db): add better-sqlite3 connection and schema init`.

**Edge cases:** Concurrent first-call invocations — JS is single-threaded inside the module, so a simple `let db: Database | null` guard is sufficient.

---

### Task 3: Row (de)serialization helpers

**Files:**
- Create: `src/lib/content-item-row.ts`
- Create: `src/lib/__tests__/content-item-row.test.ts`

- [x] **Step 1: Write failing test** — round-trip a fully-populated `ContentItem` (with slides containing both `previousVersions` and `nextVersions`, hashtags, assets, referenceImages, tags, notes, chatSessionId, generatedAt) through `serializeContentItem`/`deserializeContentItem` and assert deep equality. Add a test for an item with empty optional arrays/null fields. Add a test for a slide with non-empty `nextVersions` to confirm redo state survives the round-trip.
- [x] **Step 2: Run test, confirm fail.**
- [x] **Step 3: Implement helpers:**
  - `contentItemToRow(item)` returns scalar columns for `content_items`.
  - `rowToContentItem(row, slideRows)` reconstructs `ContentItem`. JSON-parse `hashtags`, `reference_images`, `assets`, `tags`. Drop optional fields when null. Convert `slide_order → order`, `legacy_html → legacyHtml`, `previous_versions → previousVersions`, `next_versions → nextVersions`.
  - `slideToRow(slide, contentItemId)` and `rowToSlide(row)` for slides — both stacks must round-trip.
  - Use the zod schema (`contentItemSchema`) to validate the deserialized item in DEV/test only (gate on `process.env.NODE_ENV !== "production"`).
- [x] **Step 4: Run test, confirm pass.**
- [x] **Step 5: Commit:** `feat(content-items): add row (de)serialization helpers`.

---

### Task 4: Refactor `content-items.ts` CRUD to SQLite

**Files:**
- Modify: `src/lib/content-items.ts`
- Create: `src/lib/__tests__/content-items-sqlite.test.ts`

- [x] **Step 1: Write failing tests** for the existing exported API surface (one test per function): `createContentItem`, `getContentItem`, `listContentItems`, `updateContentItem` (including auto-stamping `generatedAt` on first transition to `generated`), `deleteContentItem`, `appendSlide` (incl. `MAX_SLIDES` cap), `updateSlide` (incl. snapshot push only on visual fields, notes-only no snapshot, **`nextVersions` cleared on edit**), `deleteSlide` (incl. order recompute), `reorderSlides`, `undoSlide` (pops `previousVersions`, pushes current to `nextVersions`), **`redoSlide`** (pops `nextVersions`, pushes current to `previousVersions`), `addSlideElement`, `updateSlideElement`, `removeSlideElement`, `updateSlideBackground`, `addContentItemAsset`, `updateContentItemAsset`, `removeContentItemAsset`, `addReferenceImage`, `removeReferenceImage`. Add an explicit cap test: 26 visual edits leave `previousVersions.length === 25` (oldest dropped FIFO). All tests use a temp DB via `TEST_DB_PATH`.
- [x] **Step 2: Run test, confirm fail** — most fail because the JSON-backed implementation can't see the temp DB.
- [x] **Step 3: Implement** — rewrite each function to use prepared statements wrapped in `db.transaction(...)` for multi-statement ops. Patterns:
  - Reads: `SELECT` from `content_items` + `SELECT` slides ordered by `slide_order`.
  - Writes: same logic as before (snapshot rules, order recompute, MAX_SLIDES check, generatedAt stamping) but expressed as SQL. Slide `previousVersions`/`nextVersions` stay slide-level — push/pop snapshots in JS, write the updated stack JSON back to the slide row.
  - Keep `pushSnapshot`, `snapshotOf`, `applySnapshot`, `pushBounded` helpers local to this file (port from current commit `f99b6034`). Preserve `pushSnapshot`'s `slide.nextVersions = []` line — that is the "edit branches the history" invariant.
  - Do **not** use `content-item-snapshots.ts` here.
  - Update `MAX_VERSIONS` import to point at the new value (25). The bound applies to **both** stacks via `pushBounded`.
  - Public function signatures and return types **must not change**.
  - `redoSlide` is exported and matches the implementation in `content-items.ts:280` of commit `f99b6034`.
- [x] **Step 4: Run tests, confirm pass.**
- [x] **Step 5: Commit:** `refactor(content-items): back CRUD with SQLite, preserve API`.

**Risk:** Any caller relying on identity (`===`) of the returned object across calls will break. The current code already returns fresh objects after `load()`/`save()`, so this is a non-issue, but call sites should be spot-checked.

---

### Task 5: Migration script

**Files:**
- Create: `scripts/migrate-content-items-to-sqlite.mjs`

- [x] **Step 1: Write the script.** Behavior:
  - Args: `--dry-run` (no writes, prints summary), `--force` (skip existing-DB check).
  - Resolve `data/content-items.json` path. If missing, log + exit 0 (nothing to migrate).
  - Backup: copy JSON to `data/content-items.json.bak.<ISO timestamp>`. If `data/sales.db` exists and not `--force`, abort with instructions.
  - Read JSON, validate top-level shape `{ contentItems: [...] }`. Validate each item with the zod schema; collect errors and abort if any (no partial migration).
  - Open DB via `getDb()`. Inside one transaction: insert each item + its slides. No `content_item_snapshots` rows.
  - Verify: `SELECT COUNT(*) FROM content_items` equals input length. Spot-check 3 random items: parse back via helpers, deep-equal against input.
  - When inserting slides: if the source JSON slide is missing `nextVersions` (legacy on-disk shape), default to `[]` explicitly in the INSERT — match the lazy migration in current `load()`. Do **not** rely solely on the column DEFAULT, to keep the migration self-explanatory.
  - Print report: counts, sample IDs, backup path, db path. Exit 0.
- [x] **Step 2: Run with `--dry-run` against the real `data/content-items.json`.** Expect a clean report.
- [ ] **Step 3: Run for real.** Expect `data/sales.db` created and verification passing.
- [ ] **Step 4:** Smoke check: `npm run dev`, open the dashboard, confirm content items render. Open one item, confirm slides render.
- [ ] **Step 5: Commit:** `feat(migration): one-shot content-items.json → sqlite`.

**Rollback:** Stop the dev server, `rm data/sales.db`, restore the JSON from `data/content-items.json.bak.<timestamp>` (it was never overwritten, but the order is: keep both until confidence is high). The application keeps reading from SQLite, so a real rollback would require reverting Task 4 — call out in commit message.

---

### Task 6: `content-item-snapshots.ts`

**Files:**
- Create: `src/lib/content-item-snapshots.ts`
- Create: `src/lib/__tests__/content-item-snapshots.test.ts`

- [x] **Step 1: Write failing tests:**
  - `pushItemSnapshot(itemId, trigger, label?)` inserts a row with the full serialized item as `payload`.
  - After 6 pushes for the same item, `SELECT COUNT(*)` returns 5 and the oldest is gone (FIFO by `created_at`).
  - `pushItemSnapshot` for a non-existent item returns `null` (does not throw, does not insert).
  - `listItemSnapshots(itemId)` returns up to 5 rows, newest first, **without** `payload`.
  - `restoreItemSnapshot(itemId, snapshotId)` inside one transaction:
    - Pushes a defensive snapshot with `trigger="pre-restore"` of the *current* state.
    - Replaces the item row + slides from the snapshot payload.
    - Returns the restored `ContentItem`.
    - FIFO trim still applies after the defensive push.
  - `restoreItemSnapshot` returns `null` if either the item or the snapshot is missing.
- [x] **Step 2: Run tests, confirm fail.**
- [x] **Step 3: Implement.** Use a single `db.transaction()` for restore. `payload` stores the full `ContentItem` (with slides and their `previousVersions` arrays) as JSON. Use the helpers from Task 3 to serialize/deserialize. Constant: `export const MAX_ITEM_SNAPSHOTS = 5` (alongside `MAX_VERSIONS` from `carousel.ts` — different concept).
- [x] **Step 4: Run tests, confirm pass.**
- [x] **Step 5: Commit:** `feat(snapshots): add content-item-level versioning library`.

---

### Task 7: `GET /api/content/[id]/versions`

**Files:**
- Create: `src/app/api/content/[id]/versions/route.ts`

- [x] **Step 1:** Implement `GET` handler. Resolve `id` from params. If `getContentItem(id)` returns `null`, respond `404`. Otherwise return `NextResponse.json({ versions: await listItemSnapshots(id) })` — list shape `[{id, createdAt, trigger, label}]`.
- [x] **Step 2:** Manual smoke test: `curl -s localhost:3000/api/content/<known-id>/versions | jq` returns `{"versions": []}` for an item with no snapshots.
- [x] **Step 3: Commit:** `feat(api): GET /api/content/[id]/versions`.

---

### Task 8: `POST /api/content/[id]/versions/[versionId]/restore`

**Files:**
- Create: `src/app/api/content/[id]/versions/[versionId]/restore/route.ts`

- [x] **Step 1:** Implement `POST` handler. Reject if `item.state === "generating"` with `409` (a restore mid-generation would race the agent). Call `restoreItemSnapshot(id, versionId)`. If `null`, return `404`. Otherwise `200` with the restored `ContentItem`.
- [x] **Step 2:** Manual smoke: take a snapshot manually via `pushItemSnapshot` from a Node REPL or a temporary debug script, mutate the item via `PATCH`, restore, verify revert.
- [x] **Step 3: Commit:** `feat(api): POST /api/content/[id]/versions/[versionId]/restore`.

---

### Task 9: Snapshot trigger in `/api/content/[id]/generate`

**Files:**
- Modify: `src/app/api/content/[id]/generate/route.ts`

- [x] **Step 1:** After the `getContentItem(id)` null-check and the `state === "generating"` guard, before the `updateContentItem(id, { state: "generating", aspectRatio })` call, insert: `await pushItemSnapshot(id, "generate");`. Wrap in try/catch: log on failure but **do not abort** generation — versioning is best-effort.
- [x] **Step 2:** Manual smoke: trigger `POST /api/content/<id>/generate` from the UI; confirm a row appears in `content_item_snapshots` with `trigger='generate'`.
- [x] **Step 3: Commit:** `feat(generate): snapshot content-item before agent run`.

---

### Task 10: Snapshot trigger in `/api/chat`

**Files:**
- Modify: `src/app/api/chat/route.ts`

- [x] **Step 1:** After `contentItemId` is read from the body and the corresponding item is fetched (around `route.ts:75`/`route.ts:97`), if the item exists, call `await pushItemSnapshot(contentItemId, "chat", message.slice(0, 80))`. Same try/catch pattern as Task 9.
- [x] **Step 2:** Manual smoke: send a chat with `contentItemId`; confirm a row appears with `trigger='chat'` and a label.
- [x] **Step 3: Commit:** `feat(chat): snapshot content-item before agent turn`.

**Edge:** If chat is in `mode: "content-idea"` but the item is genuinely new (just created), the snapshot will capture the empty starting state — that is fine and useful (lets the user revert to "blank").

---

### Task 11: Wiki updates

**Files:**
- Modify: `wiki/pages/concepts/version-history.md`
- Modify: `wiki/pages/entities/content-item-model.md`

- [x] **Step 1:** In `version-history.md`:
  - Update the slide-level section to describe **undo + redo** (not just undo), the `nextVersions` stack, the "edit clears nextVersions" branch invariant, and the new cap of **25** for both stacks.
  - Mention the editor persist debounce of 10 s — each "save point" produces at most one snapshot, so 25 caps ≈ 4 minutes of editing history.
  - Add a new section "Content-item-level snapshots" describing: trigger points (generate, chat), 5-FIFO retention, defensive snapshot on restore, distinction from slide-level undo/redo. Update the page intro to clarify there are now two layers.
- [x] **Step 2:** In `content-item-model.md`, update "Persistence" — file is now `data/sales.db`; concurrency via SQLite WAL transactions, no per-file mutex; legacy `content-items.json` kept as backup post-migration. Add `code_refs` for `src/lib/db.ts` and `src/lib/content-item-snapshots.ts`.
- [x] **Step 3:** Run `npx wiki-query "content item versioning"` to spot-check the index reflects the changes.
- [x] **Step 4: Commit:** `docs(wiki): document content-item-level versioning + sqlite persistence`.

**Note:** Do not run a full `/ingest` here — defer to the user after merge (per CLAUDE.md "offer to ingest" guidance).

---

### Task 12: Raise slide-level cap to 25 + bump editor debounce to 10 s

**Files:**
- Modify: `src/types/carousel.ts`
- Modify: `src/components/editor/useSlideEditor.ts`
- Modify: `src/components/editor/EditorBody.tsx`
- Create: `src/components/editor/__tests__/useSlideEditor.test.tsx` (if not present; otherwise extend)

- [x] **Step 1:** Change `MAX_VERSIONS` in `src/types/carousel.ts` from `5` to `25`. No other code reads it — the helpers in `content-items.ts` import the constant. Verify with `grep -rn "MAX_VERSIONS" src/`.
- [x] **Step 2: Write failing test** — render `useSlideEditor` with a fake `onPersist`, dispatch an edit, advance fake timers by 9999 ms → `onPersist` not called; advance to 10000 ms → called once. Use `vi.useFakeTimers()`.
- [x] **Step 3: Run test, confirm fail.**
- [x] **Step 4: Implement:**
  - In `useSlideEditor.ts`, change the default `debounceMs = 400` to `debounceMs = 10000`.
  - Add a flush effect: on unmount (cleanup of the persist effect), if `persistTimerRef.current` is set, clear the timer and `await onPersist(state.slide)` synchronously-ish (kick off and let it run; do not block unmount). Track `lastSentContentRef` so we don't double-send.
  - In `EditorBody.tsx`, pass `debounceMs: 10000` explicitly to `useSlideEditor` (defense in depth so a future default change doesn't silently lengthen the window further).
  - In `EditorBody.tsx`, add a `beforeunload` listener that flushes the pending persist using `navigator.sendBeacon` *or* a synchronous `fetch` with `keepalive: true`. Goal: surviving a tab close mid-debounce. Acceptable to limit to one flush attempt — best-effort.
- [x] **Step 5: Run test, confirm pass.**
- [ ] **Step 6: Manual smoke:**
  - Edit a slide, watch the network tab — first PUT lands ≥10 s after the last keystroke, not before.
  - Edit, then close the tab within 5 s — verify the PUT arrives (sendBeacon).
  - Edit 26 times across multiple debounce windows (or a single batched commit followed by 25 individual changes) — check `previousVersions.length === 25` after the 26th distinct visual edit.
- [x] **Step 7: Commit:** `feat(editor): raise undo cap to 25 and persist debounce to 10s`.

**Risks:**
- Lost work on tab close — mitigated by `sendBeacon`/`keepalive` flush.
- Concurrent agent writes during a 10 s editor debounce window — last-write-wins is already the existing behavior (see comment at `useSlideEditor.ts:226`). No regression.

---

## Acceptance criteria → task mapping

| # | Criterion | Task |
|---|---|---|
| 1 | `generate` writes a `'generate'` snapshot | Task 9 |
| 2 | `chat` (with item context) writes a `'chat'` snapshot | Task 10 |
| 3 | After 6 item-level pushes, oldest is dropped (FIFO=5) | Task 6 |
| 4 | `GET /versions` returns ≤5 newest-first, no payload | Tasks 6, 7 |
| 5 | `POST .../restore` restores fully, with defensive snapshot | Tasks 6, 8 |
| 6 | Existing CRUD HTTP contract preserved | Task 4 |
| 7 | Slide-level undo + redo unchanged in behavior | Task 4 (explicit) |
| 8 | Manual `PATCH /api/content/[id]` does **not** snapshot | Tasks 4, 9, 10 (snapshot only at agent entry points) |
| 9 | Migration: count match + spot check | Task 5 |
| 10 | Slide-level `previousVersions` and `nextVersions` cap = 25 (FIFO) | Tasks 4, 12 |
| 11 | Any user/agent edit clears `nextVersions` | Task 4 (preserves `pushSnapshot` invariant) |
| 12 | Editor PUT request fires no sooner than 10 s after the last keystroke | Task 12 |
| 13 | Pending edits are flushed on tab close | Task 12 |

---

## Execution order & parallelism

```
Task 1 (deps)
  └─> Task 2 (db.ts)
        └─> Task 3 (row helpers)              ─┐
                                                ├─> Task 4 (refactor CRUD) ─┐
                                                                              ├─> Task 5 (migration script)
                                                                              ├─> Task 6 (snapshots lib) ─┐
                                                                                                            ├─> Task 7 (GET versions)
                                                                                                            └─> Task 8 (POST restore)
                                                                              ├─> Task 9 (generate hook)
                                                                              └─> Task 10 (chat hook)
                                                                              └─> Task 11 (wiki) [parallelizable with 9, 10]
```

- Strictly sequential: 1 → 2 → 3 → 4 → 5.
- After Task 5: Tasks 6, 9, 10, 11, 12 can run in parallel.
- Tasks 7, 8 depend on Task 6.
- Task 12 (cap 25 + debounce 10 s) is independent of the SQLite migration once Task 4 is in (the constant import path is the only coupling). It can also be split off and shipped before Task 5 in an emergency, but the recommended order keeps it after the refactor to avoid double-touching `content-items.ts` test fixtures.

## Critical risks

1. **`better-sqlite3` native build on the user's WSL2 environment.** Mitigation: Task 1 includes a smoke check; if it fails, fall back to `npm install --build-from-source` or escalate before continuing.
2. **Migration data loss.** Mitigation: dry-run first, automatic JSON backup, no JSON deletion, count + spot-check verification, rollback path documented.
3. **API contract drift in Task 4.** Mitigation: parity tests in `content-items-sqlite.test.ts` cover every exported function; the existing API routes are untouched, so any drift surfaces in the test layer.
4. **`PATCH` accidentally snapshotting.** Mitigation: Task 4 keeps `updateContentItem` snapshot-free; only Tasks 9 and 10 (agent entry routes) call `pushItemSnapshot`. The mapping is explicit and limited.

## Recommended execution mode

**Option 1 (recommended): subagent-driven task execution.** Run via `/run-plan`. The dependency graph is clear, tasks are small, and Tasks 6–12 parallelize after Task 5.

**Option 2: inline execution in current session.** Viable, sequential. Roughly 2–3 hours of work end-to-end (Task 12 adds ~30 min for the debounce + flush + tests).
