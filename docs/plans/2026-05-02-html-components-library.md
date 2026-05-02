# HTML Components Library — Implementation Plan

> **For agentic workers:** REQUIRED SKILL: `write-plan` for planning and `implementator`/`reviewer` for execution and validation.

**Goal:** Add a reusable library of parametric HTML components (buttons, cards, phone/Safari mockups) that can be saved from existing containers, listed in a dedicated page, and inserted into slides as snapshot copies — with `{{key}}` interpolation in `htmlContent` and `scssStyles`.

**Architecture:** New SQLite table `components` holds `htmlContent` + `scssStyles` + `parametersSchema` + dimensions + thumbnail. The existing `ContainerElement` gains an optional `parameters: Record<string,string>` map. `slide-serializer.renderContainer()` interpolates `{{key}}` against that map (regex `\{\{\s*[a-zA-Z_][a-zA-Z0-9_]*\s*\}\}`). Insert = client/chat does `GET /api/components/[id]` then `POST .../elements` with `kind=container` and parameters resolved to defaults — no custom insert endpoint. Thumbnails generated async via Puppeteer at create/update.

**Tech Stack:** Next.js 16, React 19, TypeScript, better-sqlite3, Zod, Puppeteer, Vitest, Tailwind v4.

---

## Conventions

- Components ≤ 300 lines per file. `PropertiesPanel.tsx` is already 576 lines — extract new UI to sub-components, do **not** inline.
- Types in `src/types/`, libs in `src/lib/`, components in `src/components/`.
- All data mutations go through `src/lib/components.ts` (never direct fs).
- Migration files: `migrations/YYYYMMDDHHMMSS-description.ts` exporting `up(db)` / `down(db)` (better-sqlite3).
- Keep `SCHEMA_SQL` in `src/lib/db.ts` and the migration both in sync (one is for fresh bootstrap, the other for upgrades).
- Use `npm run migrate:test` while iterating (touches `data/test.db`, not dev DB).
- TDD where possible: write the failing Vitest first, then the implementation.

---

## File Map

### Create
- `migrations/20260502130000-add-components-table.ts` — schema migration
- `src/types/component.ts` — `Component`, `ComponentParameter`, `ParameterType`
- `src/lib/component-schema.ts` — Zod schemas (component, parameter, create/patch)
- `src/lib/component-interpolation.ts` — `interpolate(text, params)` + `extractParameterKeys(html, css)`
- `src/lib/components.ts` — CRUD + `saveFromElement` + `inferParameters` (mirrors `templates.ts` pattern)
- `src/lib/component-thumbnail.ts` — Puppeteer screenshot helper
- `src/app/api/components/route.ts` — GET list, POST create
- `src/app/api/components/[id]/route.ts` — GET, PATCH, DELETE
- `src/app/api/components/from-element/route.ts` — POST save-from-element
- `src/app/components/page.tsx` — `/components` page (grid)
- `src/components/library/ComponentsGrid.tsx` — thumbnails + search + tag filter
- `src/components/library/ComponentEditor.tsx` — edit master (HTML/SCSS/parameters)
- `src/components/library/ComponentInsertModal.tsx` — modal triggered from slide editor
- `src/components/library/ComponentSaveAsModal.tsx` — modal from "save as component"
- `src/components/library/ParametersMetadataEditor.tsx` — metadata editor (per-key type/label/default)
- `src/components/editor/ContainerParametersPanel.tsx` — sub-panel for `PropertiesPanel` (per-type inputs)
- `src/lib/__tests__/component-interpolation.test.ts`
- `src/lib/__tests__/components.test.ts`
- `src/lib/__tests__/component-schema.test.ts`

### Modify
- `src/lib/db.ts` — add `components` block to `SCHEMA_SQL`
- `src/types/slide-model.ts` — `ContainerElement.parameters?: Record<string,string>`
- `src/lib/slide-schema.ts` — add `parameters` to `containerElementSchema` + `elementPatchSchema`
- `src/lib/slide-serializer.ts` — interpolate inside `renderContainer`
- `src/lib/chat-system-prompt.ts` — append "Components library" section + curl rules
- `src/components/editor/PropertiesPanel.tsx` — render `<ContainerParametersPanel/>` if `element.parameters` exists
- `src/components/editor/Toolbar.tsx` (or equivalent) — add "Insert component" button
- `src/components/editor/SlideOverlay.tsx` (or context-menu host) — "Save as component" entry

### Validate
- `npm run migrate:test` and `npm run migrate:test:undo` (clean round-trip)
- `npm test` (all Vitest suites green)
- Manual: `npm run dev`, browse `/components`, exercise the 10 acceptance criteria

---

## Task Sequence

Tasks are numbered in execution order. Tasks marked **[parallel-safe]** can run concurrently with the previous task (no shared file).

---

### Task 1: Schema migration + bootstrap parity

**Files:**
- Create: `migrations/20260502130000-add-components-table.ts`
- Modify: `src/lib/db.ts`
- Test: `src/lib/__tests__/db.test.ts` (add a case asserting `components` table exists with expected columns)

- [ ] **Step 1:** Add a Vitest case in `db.test.ts` that opens a fresh test DB, queries `PRAGMA table_info(components)`, and asserts the 11 columns (`id`, `name`, `description`, `html_content`, `scss_styles`, `parameters_schema`, `width`, `height`, `thumbnail_url`, `tags`, `created_at`, `updated_at`).
- [ ] **Step 2:** Run `npm test -- db.test` → fail.
- [ ] **Step 3:** Implement migration `up(db)` with idempotent guard (`SELECT name FROM sqlite_master WHERE type='table' AND name='components'`) and matching `down(db)` that drops the table. Mirror the same `CREATE TABLE` statement in `SCHEMA_SQL` of `src/lib/db.ts`.
- [ ] **Step 4:** `npm run migrate:test` → ok. Run failing test again → pass.
- [ ] **Step 5:** `npm run migrate:test:undo` (must succeed). Re-apply with `npm run migrate:test`. Commit.

**Risk note:** Don't run on `data/sales.db` until tests pass; `migrate:test` operates on `data/test.db` only.

---

### Task 2: Component types + Zod schema

**Files:**
- Create: `src/types/component.ts`, `src/lib/component-schema.ts`
- Test: `src/lib/__tests__/component-schema.test.ts`

- [ ] **Step 1:** Write tests for: valid component round-trip, rejected invalid `type` (only `text`|`color`|`image-url`), rejected invalid key (must match `[a-zA-Z_][a-zA-Z0-9_]*`), patch schema accepts partial fields.
- [ ] **Step 2:** `npm test -- component-schema` → fail.
- [ ] **Step 3:** Define `Component`, `ComponentParameter`, `ParameterType` in `src/types/component.ts`. Define `componentSchema`, `componentParameterSchema`, `componentCreateSchema`, `componentPatchSchema` in `src/lib/component-schema.ts`.
- [ ] **Step 4:** Run tests → pass.
- [ ] **Step 5:** Commit.

---

### Task 3: Interpolation utility

**Files:**
- Create: `src/lib/component-interpolation.ts`
- Test: `src/lib/__tests__/component-interpolation.test.ts`

- [ ] **Step 1:** Write tests:
  - `interpolate("Hello {{name}}!", {name:"World"})` → `"Hello World!"`
  - tolerate whitespace: `{{ name }}` matches
  - missing key stays literal: `interpolate("{{foo}}", {})` → `"{{foo}}"`
  - invalid pattern not interpolated: `{ {foo}}`, `{{ }}`, `{{1foo}}` left alone
  - works on multiline / CSS strings
  - `extractParameterKeys("a {{x}} b", ".c{color:{{y}}}")` → `["x","y"]` (deduped, order preserved)
- [ ] **Step 2:** Tests fail.
- [ ] **Step 3:** Implement with strict regex `/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g`. Two exports: `interpolate(text, params)` and `extractParameterKeys(...sources)`.
- [ ] **Step 4:** Tests pass.
- [ ] **Step 5:** Commit.

**This task is the heart of the feature — extra care here prevents downstream regressions.**

---

### Task 4: ContainerElement gets `parameters`

**Files:**
- Modify: `src/types/slide-model.ts`, `src/lib/slide-schema.ts`
- Test: extend existing slide-schema tests if any; otherwise add to `component-schema.test.ts` a "container with parameters round-trips through Zod" case.

- [ ] **Step 1:** Add failing test: a container with `parameters: {primary:"#ff0000"}` validates; one with `parameters: {1bad:"x"}` fails.
- [ ] **Step 2:** Test fails (field missing).
- [ ] **Step 3:** Add `parameters?: Record<string,string>` to `ContainerElement` interface (line 76-84). Extend `containerElementSchema` and `elementPatchSchema` with `z.record(z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/), z.string()).optional()`.
- [ ] **Step 4:** Test passes. Existing slide tests still pass.
- [ ] **Step 5:** Commit.

---

### Task 5: Wire interpolation into renderer

**Files:**
- Modify: `src/lib/slide-serializer.ts` (line 61 area)
- Test: add to `src/lib/__tests__/` a `slide-serializer.test.ts` (create if absent) covering interpolation in render.

- [ ] **Step 1:** Write tests:
  - container with `htmlContent="<p>{{name}}</p>"`, `parameters={name:"X"}` → output contains `<p>X</p>` and not `{{name}}`
  - container with `scssStyles=".x{color:{{c}}}"`, `parameters={c:"red"}` → output `<style>` contains `color:red`
  - container without `parameters` → htmlContent rendered verbatim (no regression)
  - missing key → `{{missing}}` literal in output
- [ ] **Step 2:** Tests fail.
- [ ] **Step 3:** In `renderContainer`, before computing `scoped` and embedding `htmlContent`, run both through `interpolate(text, el.parameters ?? {})`.
- [ ] **Step 4:** Tests pass. Run full suite — no regression in `templates.test.ts`, `content-items-sqlite.test.ts`.
- [ ] **Step 5:** Commit.

**At this point, the data model + render are complete. Acceptance criteria #3 (interpolation) and #9 (literal on missing) are exercisable end-to-end with hand-crafted JSON.**

---

### Task 6: `components` lib (CRUD + inference)

**Files:**
- Create: `src/lib/components.ts`
- Test: `src/lib/__tests__/components.test.ts`

- [ ] **Step 1:** Write tests:
  - `createComponent` persists row; `listComponents` returns it; `getComponent(id)` round-trips
  - `inferParameters("<p>{{a}}</p>", ".x{color:{{b}}}", explicit)` → merges explicit metadata with inferred keys; explicit wins on type/label, inferred fills gaps with `type:"text"`
  - `saveFromElement(contentItemId, slideId, elementId, name)` reads container, copies `htmlContent`/`scssStyles`/`size`, infers parameters_schema, persists; returns Component
  - `updateComponent` patches; `deleteComponent` removes
  - rowToComponent / componentToRow handle JSON columns
- [ ] **Step 2:** Tests fail.
- [ ] **Step 3:** Implement following `src/lib/templates.ts` pattern: `TemplateRow`-like `ComponentRow`, helpers, public API. Use `generateId()` and `now()` from `./utils`. `saveFromElement` reuses `getContentItem` from `content-items.ts`.
- [ ] **Step 4:** Tests pass.
- [ ] **Step 5:** Commit.

---

### Task 7: Thumbnail helper [parallel-safe with Task 8]

**Files:**
- Create: `src/lib/component-thumbnail.ts`
- Modify: `src/lib/components.ts` (call thumbnail trigger from create/update — fire-and-forget)

- [ ] **Step 1:** Write a small test that calls `generateComponentThumbnail({id, htmlContent, scssStyles, parametersSchema, width, height})`, mocking Puppeteer. Assert: returns a `/uploads/component-thumbs/{id}.png` path; resolves params with `defaultValue` when present, else empty string.
- [ ] **Step 2:** Test fails.
- [ ] **Step 3:** Implement `generateComponentThumbnail` reusing the Puppeteer infrastructure of `src/lib/export-slides.ts`. Use `wrapSlideHtml`-style wrapping but at component dimensions. Write to `public/uploads/component-thumbs/`. Update `components.ts` to call it (no `await` — kick off and write `thumbnail_url` when done via a `PATCH`-like internal update).
- [ ] **Step 4:** Test passes.
- [ ] **Step 5:** Commit.

**Risk:** Puppeteer launch is slow. Keep generation off the request path (background promise after response).

---

### Task 8: API routes — list + create + detail [parallel-safe with Task 7]

**Files:**
- Create: `src/app/api/components/route.ts`, `src/app/api/components/[id]/route.ts`
- Test: optional integration test in `src/lib/__tests__/components.test.ts` exercising via fetch is overkill — rely on lib tests + manual.

- [ ] **Step 1:** No new test (lib already covered). Add a minimal route smoke if desired.
- [ ] **Step 2:** N/A.
- [ ] **Step 3:** Implement:
  - `GET /api/components` → `listComponents()`
  - `POST /api/components` → validate body with `componentCreateSchema`, call `createComponent`
  - `GET /api/components/[id]` → 404 on null
  - `PATCH /api/components/[id]` → validate with `componentPatchSchema`, call `updateComponent`; if HTML/CSS or parameters_schema changed, trigger thumbnail regen
  - `DELETE /api/components/[id]` → 204 on success
- [ ] **Step 4:** Manual smoke: `curl -s localhost:3000/api/components`, then `curl -X POST` with a small payload, verify in DB.
- [ ] **Step 5:** Commit.

---

### Task 9: API route — save-from-element

**Files:**
- Create: `src/app/api/components/from-element/route.ts`

- [ ] **Step 1:** No new test (lib's `saveFromElement` already covered).
- [ ] **Step 2:** N/A.
- [ ] **Step 3:** `POST` body: `{contentItemId, slideId, elementId, name, description?, tags?}`. Call `saveFromElement`, return component JSON. Return 404 if element not found, 400 if element is not a container.
- [ ] **Step 4:** Manual: `curl -X POST .../from-element` against a known container in dev DB.
- [ ] **Step 5:** Commit.

---

### Task 10: `/components` page + grid

**Files:**
- Create: `src/app/components/page.tsx`, `src/components/library/ComponentsGrid.tsx`

- [ ] **Step 1:** No unit test — UI work, exercised manually.
- [ ] **Step 2:** N/A.
- [ ] **Step 3:**
  - Page is a server component that fetches `listComponents()` and passes to client grid.
  - Grid: thumbnails + name + tags. Search box (substring on name/description). Tag filter (chips). Click → opens editor (Task 11). Each card has Edit/Delete/Duplicate menu.
  - Use `cn()` from `src/lib/utils.ts`. Tailwind classes only. Keep file ≤ 300 lines (split a `ComponentCard` sub if needed).
- [ ] **Step 4:** Manual: visit `/components`, see grid, search/filter behave.
- [ ] **Step 5:** Commit.

---

### Task 11: Component editor (master)

**Files:**
- Create: `src/components/library/ComponentEditor.tsx`, `src/components/library/ParametersMetadataEditor.tsx`

- [ ] **Step 1:** N/A (UI).
- [ ] **Step 2:** N/A.
- [ ] **Step 3:**
  - `ComponentEditor` opens as modal or panel from the grid: name, description, tags, width/height, HTML editor (textarea or `<CodeEditor/>` if one exists), SCSS editor.
  - Live preview: render an in-memory container using the same iframe sandbox approach as the slide editor (use `wrapSlideHtml` + interpolation with current parameter defaults).
  - `ParametersMetadataEditor`: list of inferred keys (from `extractParameterKeys`); each row shows key, type dropdown (text/color/image-url), label input, default value input (color picker if type=color, image picker if type=image-url, plain input for text), description input.
  - Save → `PATCH /api/components/[id]` (or POST for new). On save, regen thumbnail server-side.
  - Cancel discards.
- [ ] **Step 4:** Manual: edit an existing component, verify parameters re-inferred when HTML changes; save persists; thumbnail updates within ~5s.
- [ ] **Step 5:** Commit.

---

### Task 12: "Save as component" modal + slide-editor wiring

**Files:**
- Create: `src/components/library/ComponentSaveAsModal.tsx`
- Modify: `src/components/editor/SlideOverlay.tsx` (or wherever container context menu/actions live)

- [ ] **Step 1:** N/A (UI).
- [ ] **Step 2:** N/A.
- [ ] **Step 3:**
  - Add "Save as component" action in container's context menu (or as a button in `PropertiesPanel`).
  - Opens `ComponentSaveAsModal` with name/description/tags inputs, calls `POST /api/components/from-element` with current `{contentItemId, slideId, elementId}` from editor state.
  - Show success toast with link to `/components`.
- [ ] **Step 4:** Manual: in any slide, save a container as component, confirm it shows in `/components`.
- [ ] **Step 5:** Commit.

---

### Task 13: "Insert component" modal + toolbar button

**Files:**
- Create: `src/components/library/ComponentInsertModal.tsx`
- Modify: `src/components/editor/Toolbar.tsx` (or the closest parent of slide-editor toolbar)

- [ ] **Step 1:** N/A (UI).
- [ ] **Step 2:** N/A.
- [ ] **Step 3:**
  - Toolbar button "Insert component" opens modal.
  - Modal lists components with thumbnail + name (reuses `ComponentsGrid` in selection mode). Search/filter same as page.
  - Click "Insert" → fetch `GET /api/components/[id]`, then `POST /api/content/[id]/slides/[slideId]/elements` with body:
    ```
    { kind: "container",
      htmlContent, scssStyles,
      position: { x: centered },
      size: { width, height },
      parameters: defaultsFromSchema }
    ```
  - Editor refreshes slide and selects the new element.
- [ ] **Step 4:** Manual: insert a component into a slide, verify preview interpolates and the element responds to manual edits.
- [ ] **Step 5:** Commit.

---

### Task 14: PropertiesPanel — Parameters sub-panel

**Files:**
- Create: `src/components/editor/ContainerParametersPanel.tsx`
- Modify: `src/components/editor/PropertiesPanel.tsx` (only add a render of the sub-panel — no inline logic; PropertiesPanel is already 576 lines)

- [ ] **Step 1:** N/A (UI).
- [ ] **Step 2:** N/A.
- [ ] **Step 3:**
  - `ContainerParametersPanel` renders only when `element.parameters` is defined.
  - For each key in `parameters`, render input based on the source component's `parameters_schema` (fetched via `/api/components/[id]` if the container has a hidden `componentId` — **OR** simpler: store a minimal type hint on the container itself when inserting; revisit if needed). For MVP: best-effort — if no type info, default to text input. Keep this simple; don't over-couple to component master.
  - Onchange → `PATCH .../elements/[elementId]` with new `parameters` map.
  - Decision: do **not** persist `componentId` on the container (snapshot model). Type info stays per-element. If we want richer inputs later, store `parameterTypes` (Record<string, ParameterType>) alongside `parameters` on the container.
- [ ] **Step 4:** Manual: change a parameter, see preview update via existing slide save+re-render flow.
- [ ] **Step 5:** Commit.

> **Decision point during implementation:** if richer inputs (color picker, image picker) are required at MVP, add a sibling `parameterTypes?: Record<string, ParameterType>` field on `ContainerElement` (mirror Task 4) and copy it from the source schema at insert time. Otherwise default to text inputs and revisit. Acceptance criterion #7 requires the richer inputs — so include the field.

**Adjustment:** include `parameterTypes?: Record<string, ParameterType>` in Task 4's schema work (same migration-free Zod-only change). Insert in Task 13 populates it from the component's `parameters_schema`. Editor in Task 11 maintains it. Re-validate Task 5 tests still pass — `parameterTypes` doesn't affect render.

---

### Task 15: Chat system prompt — Components section

**Files:**
- Modify: `src/lib/chat-system-prompt.ts` (around lines 60-79, after assets section)

- [ ] **Step 1:** N/A (prompt change). Optional: add a unit test asserting the section is present when components exist.
- [ ] **Step 2:** N/A.
- [ ] **Step 3:**
  - Inject a `Components library` block listing each component as `- "{name}" (id: {id}) → {description}; parameters: [{key}:{type}, ...]`.
  - Add curl rules:
    - "To save the current container as a component: `curl -X POST http://localhost:3000/api/components/from-element -H 'Content-Type: application/json' -d '{...}'`"
    - "To insert a component: first `curl -s http://localhost:3000/api/components/{id}` to read it, then POST to `.../elements` with `kind: container`, copying `htmlContent`, `scssStyles`, `size: {width, height}`, and `parameters` resolved from `parameters_schema[].defaultValue`."
  - Mention: "Parameters not resolved appear literally as `{{key}}` in the preview — fill them all to avoid that."
- [ ] **Step 4:** Manual: ask the chat in dev to "save this container as a component called X" and verify it executes the curl correctly.
- [ ] **Step 5:** Commit.

---

### Task 16: End-to-end manual validation

**Files:** none

- [ ] Run all 10 acceptance criteria manually:
  1. Create from UI → appears in `/components`
  2. "Save as component" from slide → appears in `/components` with HTML/CSS copied + inferred params
  3. Insert from modal → preview interpolates HTML and CSS correctly
  4. Edit param value in PropertiesPanel → preview updates
  5. Edit master → thumbnails regen; existing inserted containers unchanged
  6. Delete master → existing inserted containers unchanged
  7. Color/image-url/text inputs render correctly per type
  8. Chat exercises both save and insert flows
  9. Param missing → `{{key}}` literal in preview
  10. `npm run migrate` (dev DB) and `npm run migrate:test` (test DB) both clean
- [ ] Run full suite: `npm test`. All green.
- [ ] Run `npm run lint`. Clean.

---

## Acceptance Criteria → Task Map

| AC | Tasks |
|----|-------|
| 1. UI create persists | 8, 10, 11 |
| 2. Save-as-component | 6, 9, 12 |
| 3. Insert with interpolation | 3, 5, 13 |
| 4. Param value edit reflows | 14 |
| 5. Master edit doesn't propagate | 6, 11 (snapshot model) |
| 6. Master delete doesn't break uses | 6, 8 |
| 7. Type-specific inputs | 11, 14 |
| 8. Chat flows documented | 15 |
| 9. Missing key literal | 3, 5 |
| 10. Migration round-trip | 1 |

---

## Critical Risks

1. **PropertiesPanel bloat** — file is already 576 lines. Mitigation: every change there must be a one-line render of a sub-component; do **not** add logic inline.
2. **Puppeteer thumbnail latency** — could block API response. Mitigation: fire-and-forget; component returns immediately with placeholder thumbnail URL; background process writes the actual file and updates `thumbnail_url`.
3. **Interpolation regex too greedy** — could mangle CSS that legitimately uses `{` `}`. Mitigation: regex requires `{{` (double brace) and identifier shape; tests in Task 3 cover false-positive cases.
4. **Snapshot vs. type info coupling** — to render a color picker on an inserted container, we need `parameterTypes` per-element. Captured in Task 4 adjustment + Task 13. Without it, AC #7 falls back to text-only.
5. **Schema drift** between `SCHEMA_SQL` (bootstrap) and migration. Mitigation: identical `CREATE TABLE` statement copy-pasted in both; tests in Task 1 hit a fresh DB so any drift surfaces.
6. **Chat hallucination on curl flow** — system prompt must include exact endpoint shapes and an example. Validated manually in Task 15.

---

## Execution Handoff

Total tasks: **16** (Tasks 7 and 8 parallelizable; everything else sequential due to file dependencies).

Recommended order:
1. Tasks 1–6 strictly sequential — they build the data layer and renderer.
2. Tasks 7 and 8 in parallel after 6.
3. Task 9 after 8.
4. Tasks 10–14 sequential (UI is layered).
5. Task 15 after 14.
6. Task 16 (validation) last.

Validation gates between phases:
- After Task 5: hand-craft JSON to insert a container with `parameters` and verify preview interpolates. Don't proceed to UI work until this passes.
- After Task 9: API surface is complete; can be exercised via curl alone.
- After Task 14: full editor flow works; chat is the only remaining surface.

Recommended execution mode: **subagent-driven** (each task is small enough to delegate to `implementator` with the spec above; `reviewer` validates against acceptance criteria after Task 16).
