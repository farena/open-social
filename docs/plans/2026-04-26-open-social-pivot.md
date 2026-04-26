# Open Social Pivot — ContentItem-Driven Dashboard

> **For agentic workers:** REQUIRED SKILL: `write-plan` for planning and `implementator`/`reviewer` for execution and validation.

**Goal:** Replace the carousel-cards dashboard with a chat-driven content ideation flow. Collapse the `Carousel` entity into a unified `ContentItem` that lives through `idea → generating → generated` states, where text fields (hook/body/caption/hashtags) and visual fields (slides) coexist on a single entity.

**Architecture:** ContentItem becomes the primary persisted entity (storage moves from `data/carousels.json` to `data/content-items.json`). The dashboard splits into ideation chat + table; the existing slide editor (`EditorBody` + container/image model) is reused unchanged on the generated state of a ContentItem. Three new chat modes (`ideation`, `content-idea`, `content-generation`) replace the current single `carousel` mode. Generation is non-blocking: the user navigates immediately into the editor, slides stream in via the existing append-only Claude subprocess pattern, and concurrent slide edits are safe because the agent only appends.

**Tech Stack:** Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4. Zod for schema. async-mutex + atomic writes for JSON storage. Claude CLI subprocess streaming via SSE. Playwright headed for visual validation.

---

## Sequencing strategy

Steps **1–4** are pure refactor — they ship the new entity + storage + API + editor wiring without changing any user-facing surface (the dashboard still renders carousel cards because the page hasn't been rewritten yet). Steps **5–8** swap the UX. Step **9** removes the deprecated carousel surface. Each step is independently runnable + visually verifiable (Playwright headed against `next dev`).

Each task targets <250 LOC and has a Playwright or curl validation step before moving on.

---

## Phase 1 — Data layer & migration (no UI change)

### Task 1.1: ContentItem types + Zod schema

**Files:**
- Create: `src/types/content-item.ts`
- Create: `src/lib/content-item-schema.ts`

- [x] **Step 1: Define types**
  - `ContentItemType = "post" | "story" | "carousel"`
  - `ContentItemState = "idea" | "generating" | "generated"`
  - `ContentItem` interface with: `id`, `type`, `state`, `hook`, `bodyIdea`, `caption`, `hashtags: string[]`, `notes?`, `aspectRatio: "1:1" | "9:16" | "4:5"`, `slides: Slide[]`, `chatSessionId?`, `referenceImages?`, `assets?`, `tags?`, `createdAt`, `updatedAt`, `generatedAt?`
  - Re-export `Slide` from `@/types/carousel` (slide model is unchanged — only the parent entity changes)
- [x] **Step 2: Build zod schema mirroring the type**
  - `contentItemSchema`: discriminate on `state` only when needed; otherwise just describe the union
  - `contentItemPatchSchema`: all fields partial except `id`
  - `newContentItemInputSchema`: hook+type required; everything else optional; defaults applied server-side
- [x] **Step 3: Compile-time check**
  - Add `z.infer<typeof contentItemSchema>` and assert it equals the manual type via a helper file or just inline in tests
- [x] **Step 4: Validate with `npx tsc --noEmit -p .`**
- [x] **Step 5: Commit** — `feat(types): add ContentItem model + schema`

---

### Task 1.2: ContentItem CRUD lib

**Files:**
- Create: `src/lib/content-items.ts`

- [x] **Step 1: Implement using existing `data.ts` (`readData`/`writeData`) + `async-mutex` pattern from `carousels.ts`**
  - `listContentItems(): Promise<ContentItem[]>`
  - `getContentItem(id): Promise<ContentItem | null>`
  - `createContentItem(input): Promise<ContentItem>` — validates, fills defaults (state="idea", aspectRatio per type, empty arrays, timestamps)
  - `updateContentItem(id, patch): Promise<ContentItem | null>` — partial merge, bumps `updatedAt`; if state transitions to "generated", sets `generatedAt`
  - `deleteContentItem(id): Promise<boolean>`
  - `appendSlide(id, slide): Promise<ContentItem | null>` — pushes to `slides[]` (append-only critical for concurrency rule)
  - `updateSlide(id, slideId, patch)`, `deleteSlide(id, slideId)`, `reorderSlides(id, slideIds[])`, `undoSlide(id, slideId)` — same shape as existing `carousels.ts`
- [x] **Step 2: File path constant — `CONTENT_ITEMS_FILE = "content-items.json"`**
- [x] **Step 3: Mirror `carousels.ts` mutex strategy** (one mutex per file, atomic write via tmp+rename)
- [x] **Step 4: Quick smoke via Node REPL**
  - `node -e "import('./src/lib/content-items.ts').then(m => m.listContentItems()).then(console.log)"`
  - Should return `[]` (file doesn't exist yet → returns default)
- [x] **Step 5: Commit** — `feat(lib): ContentItem CRUD with file storage + mutex`

---

### Task 1.3: Migration script

**Files:**
- Create: `scripts/migrate-to-content-items.mjs`

- [x] **Step 1: Read `data/carousels.json`, backup to `data/carousels.json.pre-open-social-pivot.bak`**
- [x] **Step 2: For each carousel, build ContentItem:**
  - `type: "carousel"`, `state: "generated"`
  - `hook`: extract first text from first slide's `htmlContent`. Strip tags via regex `/<[^>]+>/g`, collapse whitespace, take first 80 chars. Fallback: `""`.
  - `bodyIdea`: `notes ?? ""`
  - `caption`/`hashtags`/`aspectRatio`/`slides`/`chatSessionId`/`referenceImages`/`assets`/`tags`: heredados (or default empty)
  - `generatedAt`: `createdAt`
  - `createdAt`, `updatedAt`: heredados
- [x] **Step 3: Write to `data/content-items.json`**
- [x] **Step 4: Print summary** — `migrated N items, skipped M`
- [x] **Step 5: Run script + verify**
  - `node scripts/migrate-to-content-items.mjs`
  - `python3 -c "import json; d=json.load(open('data/content-items.json')); print(len(d['contentItems']), 'items'); print([{'name': c.get('hook')[:50], 'type': c['type'], 'state': c['state'], 'slides': len(c['slides'])} for c in d['contentItems']])"`
- [x] **Step 6: Commit** — `chore: migrate carousels to ContentItems`

---

## Phase 2 — API surface (still no UI change)

### Task 2.1: Read endpoints

**Files:**
- Create: `src/app/api/content/route.ts` (GET = list, POST = create)
- Create: `src/app/api/content/[id]/route.ts` (GET, PATCH, DELETE)

- [x] **Step 1: GET `/api/content` → `{ contentItems: ContentItem[] }`** (mirror shape of `/api/carousels`)
- [x] **Step 2: GET `/api/content/[id]` → ContentItem or 404**
- [x] **Step 3: PATCH `/api/content/[id]` → validates body via `contentItemPatchSchema`, calls `updateContentItem`**
  - Reject patches that try to remove required fields (hook → empty is OK, but type must remain valid)
  - Returns updated item or 404
- [x] **Step 4: DELETE `/api/content/[id]` → 204**
- [x] **Step 5: POST `/api/content` → validates `newContentItemInputSchema`, creates with defaults**
- [x] **Step 6: Validate with curl**
  ```
  curl -s http://localhost:3000/api/content | python3 -m json.tool | head
  curl -s -X POST http://localhost:3000/api/content -H content-type:application/json -d '{"type":"post","hook":"hello"}'
  curl -s -X DELETE http://localhost:3000/api/content/<id>
  ```
- [x] **Step 7: Commit** — `feat(api): /api/content read + write endpoints`

---

### Task 2.2: Slide endpoints (mirror existing carousel slide shape)

**Files:**
- Create: `src/app/api/content/[id]/slides/route.ts` (GET list, POST append, PUT reorder)
- Create: `src/app/api/content/[id]/slides/[slideId]/route.ts` (GET, PUT, DELETE)
- Create: `src/app/api/content/[id]/slides/[slideId]/undo/route.ts`

- [x] **Step 1: Implement endpoints by adapting `src/app/api/carousels/[id]/slides/*` files** — same body shapes, swap to `appendSlide`/`updateSlide`/etc. from `content-items.ts`
- [x] **Step 2: Validate slide payloads with existing `slideElementSchema` + `newSlideInputSchema`**
- [x] **Step 3: Validate with curl** — same shapes as today; just URL prefix changes
- [x] **Step 4: Commit** — `feat(api): slide CRUD on /api/content`

---

### Task 2.3: Generate endpoint (kicks off Claude subprocess)

**Files:**
- Create: `src/app/api/content/[id]/generate/route.ts`
- Create: `src/lib/content-generation-system-prompt.ts`

- [x] **Step 1: System prompt builder**
  - Inputs: `ContentItem` + brand + business context
  - Output: prompt that instructs Claude to design slides for THIS item's `type`/`hook`/`bodyIdea`/`caption`. Tells Claude the API base for `POST /api/content/[id]/slides`. Includes container/image model docs (copy from existing `chat-system-prompt.ts`).
- [x] **Step 2: POST `/api/content/[id]/generate`**
  - 409 if `state` already `generating`
  - Set `state="generating"`, set `aspectRatio` default per type if missing
  - Spawn Claude subprocess (mirror `/api/chat` route pattern, but with one-shot input instead of session)
  - Return SSE stream
  - When SSE `done`, server-side update `state="generated"`, set `generatedAt`
- [x] **Step 3: Validate via curl SSE**
  - Create test item in idea state with hook/bodyIdea
  - `curl -N -X POST http://localhost:3000/api/content/<id>/generate`
  - Confirm SSE tokens stream + slides appear via separate `GET /api/content/<id>` polling
- [x] **Step 4: Commit** — `feat(api): generate endpoint streams Claude design output`

---

### Task 2.4: Export endpoint

**Files:**
- Create: `src/app/api/content/[id]/export/route.ts`

- [x] **Step 1: Adapt `src/app/api/carousels/[id]/export/route.ts`** — change source from carousel → content item; rest of Puppeteer pipeline unchanged
- [x] **Step 2: Validate**
  - `curl -s -o /tmp/test.zip -X POST http://localhost:3000/api/content/<id>/export`
  - `unzip -l /tmp/test.zip` — should list slide-XX.png entries
- [x] **Step 3: Commit** — `feat(api): PNG ZIP export for ContentItems`

---

## Phase 3 — Editor reuse (refactor; no behavior change yet)

### Task 3.1: Convert `EditorBody` + `CarouselPreview` to operate on ContentItem

**Files:**
- Modify: `src/components/editor/EditorBody.tsx`
- Modify: `src/components/editor/CarouselPreview.tsx`
- Modify: `src/components/editor/SlideFilmstrip.tsx` (rename references)
- Modify: `src/components/editor/Toolbar.tsx` (rename `carouselId`/`slideCount` props if exposed)

- [x] **Step 1: In `EditorBody`, rename prop `carouselId` → `contentItemId`** and update `persist` URL from `/api/carousels/${id}/slides/...` → `/api/content/${id}/slides/...`
- [x] **Step 2: Same for filmstrip's reorder/delete/undo URLs**
- [x] **Step 3: Toolbar: rename `carouselId` → `contentItemId`** (still passed through to ExportButton; update its URL too)
- [x] **Step 4: Verify the existing `/carousel/[id]` route still works** by passing `contentItemId={carousel.id}` (the old carousel routes still exist) AND ALSO that the new `/api/content/<id>/...` endpoints work for the migrated items
- [x] **Step 5: Playwright headed** — open one of the migrated carousels via `/content/<id>` (route doesn't exist yet, but you can test by mounting EditorBody manually in a temp page or just curl the API). Skip visual test until Task 5.1 mounts the route.
- [x] **Step 6: Typecheck + commit** — `refactor(editor): operate on ContentItem instead of Carousel`

---

## Phase 4 — Rebrand to "Open Social"

### Task 4.1: Find-and-replace "Open Carrusel" → "Open Social" in user-visible strings

**Files:**
- Modify: `package.json` — `"name": "open-social"`
- Modify: `README.md` — title + prose
- Modify: `CLAUDE.md` — title
- Modify: `src/app/layout.tsx` — `metadata.title`
- Modify: `src/components/layout/TopBar.tsx` — fallback title literal
- Modify: `src/lib/chat-system-prompt.ts` — any literal references in the prompt body
- Modify: `src/lib/context-chat-system-prompt.ts` — same
- Modify: `.claude/commands/start.md`, `stop.md`, `doctor.md` — descriptions

- [x] **Step 1: `grep -rn "Open Carrusel" src/ README.md CLAUDE.md package.json .claude/`** — list every hit
- [x] **Step 2: Replace each — keep `open-carrusel` lowercase package alias OR rename to `open-social` (rename for consistency)**
- [x] **Step 3: Update `package-lock.json` if needed via `npm install` (no version bump, just lockfile sync)**
- [x] **Step 4: Visual smoke** — boot app, check tab title in browser is "Open Social"
- [x] **Step 5: Commit** — `chore: rebrand Open Carrusel → Open Social`

---

## Phase 5 — Detail view route

### Task 5.1: `/content/[id]` page — render-by-state

**Files:**
- Create: `src/app/content/[id]/page.tsx`
- Create: `src/components/content/ContentItemDetailIdea.tsx` (form view for state="idea" or "generating" pre-render)

- [ ] **Step 1: Page component**
  - Fetch ContentItem on mount via `GET /api/content/[id]`
  - 404 handling
  - If `state === "idea"` → render `<ContentItemDetailIdea />`
  - Else (`generating` | `generated`) → render the existing `EditorBody` (with toolbar, caption, etc., wrapped same as `/carousel/[id]/page.tsx`)
- [ ] **Step 2: `ContentItemDetailIdea` component**
  - Layout: split — left rail empty placeholder for now (chat will come in Task 7.2), center = form
  - Fields: hook (input), type (segmented control: post/story/carousel), bodyIdea (textarea), caption (textarea), hashtags (chips), notes (textarea)
  - Sticky footer with **"Generate Content"** button — disabled when `!hook || !bodyIdea || !type`
  - Save button (or auto-save with debounce) → PATCH
- [ ] **Step 3: Generate button handler**
  - POST `/api/content/[id]/generate` (don't await stream)
  - Optimistically set state to "generating" client-side
  - Navigate to same page → page rerenders the EditorBody (state changed)
- [ ] **Step 4: Playwright headed**
  - Create a test ContentItem in idea state via curl
  - Open `/content/<id>` → see form
  - Fill fields, click Generate → see editor mount with empty canvas
  - Verify slides stream in via polling on the same page (need polling effect — see Task 5.2)
- [ ] **Step 5: Commit** — `feat(content): /content/[id] route with idea form + editor switch`

---

### Task 5.2: Background slide polling during state="generating"

**Files:**
- Modify: `src/app/content/[id]/page.tsx`

- [x] **Step 1: When state==="generating", poll `GET /api/content/[id]` every 800ms**
- [x] **Step 2: Update local state with new slides; when state flips to "generated", stop polling**
- [x] **Step 3: Also refetch on `window.focus`** — handles "user navigated away mid-flow" edge case
- [ ] **Step 4: Playwright** — start a generation, see slides appear progressively in the canvas/filmstrip — skipped — dev server not running, code-only verification
- [x] **Step 5: Commit** — `feat(content): poll for streaming slides during generation`

---

### Task 5.3: "View details" toolbar button + modal

**Files:**
- Create: `src/components/content/ContentItemDetailModal.tsx`
- Modify: `src/components/editor/Toolbar.tsx`
- Modify: `src/app/content/[id]/page.tsx`

- [x] **Step 1: Modal component**
  - Same form fields as `ContentItemDetailIdea` but in a Radix Dialog
  - Save button → PATCH → close modal + bubble updated item back up
- [x] **Step 2: Add `onViewDetails?: () => void` prop to `Toolbar`** — render a "View details" button with `Eye` icon when prop is provided
- [x] **Step 3: Page wires modal state + passes `onViewDetails` only in generated state**
- [~] **Step 4: Playwright** — skipped (no dev server) — code-only verification
- [x] **Step 5: Commit** — `feat(content): view details modal in editor toolbar`

---

## Phase 6 — Dashboard rewrite

### Task 6.1: ContentItemsTable component

**Files:**
- Create: `src/components/dashboard/ContentItemsTable.tsx`

- [x] **Step 1: Props: `items: ContentItem[]`, `onDelete(id)`, `onCreateBlank()`**
- [x] **Step 2: Header row with `+ New idea` button + filters (type select, state select)**
- [x] **Step 3: Table body — each row clickable (`<Link href={"/content/" + id}>`):**
  - Hook (truncated, max 60 chars)
  - Type (badge: post/story/carousel)
  - Body idea (truncated, max 80)
  - Caption (truncated, 60)
  - Hashtags (count badge + first one)
  - State badge (idea/generating/generated)
  - Actions: delete (confirm dialog)
- [x] **Step 4: Empty state** — friendly CTA: "Ask the agent on the left to generate ideas, or click + New idea"
- [x] **Step 5: Commit** — `feat(dashboard): ContentItemsTable`

---

### Task 6.2: IdeationChat component (uses existing chat infra with new mode)

**Files:**
- Create: `src/components/dashboard/IdeationChat.tsx`
- Create: `src/lib/ideation-system-prompt.ts`
- Modify: `src/app/api/chat/route.ts` — add `mode: "ideation"` branch

- [x] **Step 1: System prompt**
  - Tells Claude its job is to ideate ContentItems based on brand + business context
  - Output: instructs to call `POST /api/content` for each idea with `{ type, hook, bodyIdea, caption, hashtags }` (state defaults to "idea" server-side)
  - Should batch-create on a single user prompt (e.g., "give me 5 ideas about teachers" → 5 POSTs)
- [x] **Step 2: `IdeationChat` component**
  - Adapt `BusinessContextChat` (similar shape)
  - localStorage keys: `chat-session-ideation`, `chat-messages-ideation`
  - On stream end, callback to parent → refetch content items
- [x] **Step 3: API route — `mode: "ideation"` branch**
  - Build prompt with `buildIdeationSystemPrompt(brand, context)`
  - `agentName: "ideation-chat"`
  - allowedTools: `Bash WebFetch` (for curl + research)
- [~] **Step 4: Playwright** — skipped (no dev server)
- [x] **Step 5: Commit** — `feat(dashboard): ideation chat with batch ContentItem creation`

---

### Task 6.3: New dashboard page (replace carousel cards)

**Files:**
- Modify: `src/app/page.tsx`

- [x] **Step 1: Replace the carousel-cards/templates tab UI with the split layout**
  - Left: `<IdeationChat onItemsCreated={refetch} />` (~360px wide, border-r)
  - Right: `<ContentItemsTable items={items} onDelete={...} onCreateBlank={async()=>{ POST /api/content -> navigate /content/<id> }} />`
- [x] **Step 2: Fetch ContentItems via `/api/content` on mount + after callbacks**
- [x] **Step 3: Keep TopBar + brand-empty redirect (same logic, different table)**
- [x] **Step 4: Drop the Templates tab entirely** (or hide behind a feature flag — recommend full removal for this pivot; the API stays)
- [~] **Step 5: Playwright headed** — skipped (no dev server)
- [x] **Step 6: Commit** — `feat(dashboard): chat + ContentItemsTable split layout`

---

## Phase 7 — Per-item chat modes

### Task 7.1: `mode: "content-generation"` (replaces `mode: "carousel"`)

**Files:**
- Modify: `src/app/api/chat/route.ts`
- Modify: `src/lib/chat-system-prompt.ts` (rename + adjust references)

- [x] **Step 1: Rename `mode: "carousel"` → `mode: "content-generation"` in `/api/chat`**
- [x] **Step 2: Keep `"carousel"` as a deprecated alias** that prints a console warning and routes to the new branch (so existing localStorage sessions don't break)
- [x] **Step 3: System prompt — replace all `carousel` URL prefixes with `content`** (e.g., `/api/carousels/{ID}/slides` → `/api/content/{ID}/slides`)
- [x] **Step 4: Update `ChatPanel` (used by `EditorBody`) to send `mode: "content-generation"`**
- [~] **Step 5: Playwright** — skipped (no dev server)
- [x] **Step 6: Commit** — `refactor(chat): mode "carousel" → "content-generation"`

---

### Task 7.2: `mode: "content-idea"` (per-item chat in idea state)

**Files:**
- Create: `src/lib/content-idea-system-prompt.ts`
- Create: `src/components/content/ContentIdeaChat.tsx`
- Modify: `src/app/api/chat/route.ts`
- Modify: `src/components/content/ContentItemDetailIdea.tsx` (mount the chat in left rail)

- [ ] **Step 1: System prompt** — refines text fields of ONE ContentItem. Tools: `PATCH /api/content/[id]` only. Should not touch slides.
- [ ] **Step 2: `ContentIdeaChat`** — adapt `ChatPanel` shape but with per-item session keys (`chat-session-idea-${id}`)
- [ ] **Step 3: API route — `mode: "content-idea"` branch** — pass contentItemId in body; build prompt from current ContentItem state + brand + context
- [ ] **Step 4: Mount in `ContentItemDetailIdea` left rail**
- [ ] **Step 5: Playwright** — open an idea item, chat "make the hook punchier", see hook update
- [ ] **Step 6: Commit** — `feat(content): per-item chat in idea state`

---

## Phase 8 — Generate flow concurrency hardening

### Task 8.1: Append-only contract enforced server-side

**Files:**
- Modify: `src/app/api/content/[id]/slides/[slideId]/route.ts`
- Modify: `src/lib/content-generation-system-prompt.ts`

- [ ] **Step 1: When state === "generating", reject `PUT /slides/[slideId]` and `DELETE /slides/[slideId]` calls that originate from the agent**
  - Distinguish via a header (e.g. `X-Agent-Origin: claude`) that the system prompt teaches Claude to send. User edits from the editor don't include this header → allowed.
- [ ] **Step 2: System prompt update — instruct Claude during generation: only POST new slides; never PUT/DELETE; do not re-read existing slides**
- [ ] **Step 3: Playwright concurrency test**
  - Create item, hit Generate, while streaming drag a rendered slide
  - Confirm: drag persists, agent keeps appending, no slide gets reverted
- [ ] **Step 4: Commit** — `feat(content): enforce append-only agent contract during generation`

---

### Task 8.2: Generate button debounce + 409 handling

**Files:**
- Modify: `src/components/content/ContentItemDetailIdea.tsx`

- [ ] **Step 1: Disable Generate button immediately after click + spinner state**
- [ ] **Step 2: Handle 409 from `/generate`** (already-generating) — show toast, don't navigate
- [ ] **Step 3: Playwright** — double-click Generate, only one generation kicks off
- [ ] **Step 4: Commit** — `fix(content): debounce Generate button + handle 409`

---

## Phase 9 — Cleanup: remove carousel surface

### Task 9.1: Carousel route → 301 to content route

**Files:**
- Modify: `src/app/carousel/[id]/page.tsx`

- [ ] **Step 1: Replace page body with `redirect("/content/" + id)` from `next/navigation`**
- [ ] **Step 2: Confirm old links still work in browser**
- [ ] **Step 3: Commit** — `chore: redirect /carousel/[id] → /content/[id]`

---

### Task 9.2: Remove carousel API + lib + types

**Files:**
- Delete: `src/lib/carousels.ts`
- Delete: `src/app/api/carousels/route.ts`
- Delete: `src/app/api/carousels/[id]/route.ts`
- Delete: `src/app/api/carousels/[id]/slides/*`
- Delete: `src/app/api/carousels/[id]/duplicate/route.ts`
- Delete: `src/app/api/carousels/[id]/export/route.ts`
- Delete: `src/app/api/carousels/[id]/caption/route.ts`
- Delete: `src/app/api/carousels/[id]/references/route.ts`
- Delete: `src/app/api/carousels/[id]/assets/*`
- Delete: `src/components/ui/create-carousel-dialog.tsx`
- Modify: `src/types/carousel.ts` — keep ONLY `Slide`, `AspectRatio`, `DIMENSIONS`, `MAX_SLIDES`. Drop the `Carousel` interface.
- Delete: `data/carousels.json` (after backup verified)

- [ ] **Step 1: Grep for any remaining imports of removed files** — `grep -rn "from \"@/lib/carousels\"\|from \"@/app/api/carousels\"" src/` → fix or remove
- [ ] **Step 2: Typecheck must pass**
- [ ] **Step 3: Playwright full smoke** — dashboard loads, click row, editor opens, edit, save, persist, reload survives
- [ ] **Step 4: Commit** — `chore: remove deprecated carousel surface`

---

### Task 9.3: Update CLAUDE.md + system prompts to reflect ContentItem model

**Files:**
- Modify: `CLAUDE.md` — replace "Carousel" terminology with "ContentItem"; update Key Files + API Routes sections
- Modify: `src/lib/chat-system-prompt.ts` — already covered in Task 7.1 but double-check no stale URLs
- Modify: `src/lib/context-chat-system-prompt.ts` — references to "carousels" → "content items" if any

- [ ] **Step 1: Read both files, update terminology**
- [ ] **Step 2: Commit** — `docs: update CLAUDE.md + prompts for ContentItem model`

---

## Acceptance criteria → task map

| AC | Task |
|---|---|
| 1. Dashboard chat + table | 6.3 |
| 2. Topbar shows "Open Social" | 4.1 |
| 3. Chat creates rows live | 6.2 |
| 4. + New idea creates + opens detail | 6.1, 6.3 |
| 5. Row click → /content/[id] | 6.1 |
| 6. Idea form + per-item chat | 5.1, 7.2 |
| 7. Generate disabled until fields filled | 5.1 |
| 8. Generate navigates + slides stream | 5.1, 5.2, 2.3 |
| 9. Concurrent edit safe during stream | 8.1 |
| 10. State badge updates | 5.2, 6.1 |
| 11. View details modal in editor | 5.3 |
| 12. Delete removes from disk | 6.1, 1.2 |
| 13. Existing carousels migrated + 301 | 1.3, 9.1 |
| 14. Aspect ratio per type | 1.2 (defaults), 2.3 (set on generate) |

---

## Critical risks

1. **Migration drops data** — Mitigation: automatic backup file + manual verification step before deleting `carousels.json` in Task 9.2. The migration is reversible until Task 9.2 commits.
2. **Concurrent slide writes during generation** — Mitigation: Task 8.1 enforces append-only via header convention. Claude is instructed not to PUT/DELETE; server rejects if it tries.
3. **Old localStorage sessions break after rename `mode: carousel` → `content-generation`** — Mitigation: keep "carousel" as an alias in Task 7.1 with a deprecation warning.
4. **Editor refactor (Task 3.1) breaks `/carousel/[id]` before `/content/[id]` exists** — Mitigation: Task 3.1 keeps both routes functional via prop renaming only; the new content endpoints work alongside the old carousel endpoints until Phase 9.
5. **Generation streams slides but page polling lags** — Mitigation: 800ms poll + window.focus refetch is sufficient for the slow Claude rate (1 slide every few seconds). If too laggy, swap to SSE subscription on a future task.
6. **Aspect ratio mismatch for migrated carousels** (some are 4:5, some 1:1) — Migration preserves the original `aspectRatio` field; safe.

---

## Validation checklist (run before declaring done)

- [ ] `npx tsc --noEmit -p .` clean
- [ ] `npm run build` succeeds
- [ ] Migration: `data/carousels.json.pre-open-social-pivot.bak` exists; `data/content-items.json` has all items
- [ ] Dashboard renders chat + table; row click opens editor; + New idea creates blank
- [ ] Idea form: type something → Save → reload → persists
- [ ] Generate button disabled with empty fields, enabled with full fields
- [ ] Generate flow end-to-end: click → navigate → slides stream → state="generated"
- [ ] During streaming, drag a rendered slide → drag persists, agent keeps appending
- [ ] View details modal in toolbar opens, edits, saves
- [ ] `/carousel/<oldId>` redirects to `/content/<oldId>`
- [ ] Delete a row from dashboard → confirm → gone after refresh

---

## Definition of Ready status

| Item | Status |
|---|---|
| Problem + outcome explicit | ✅ |
| Scope bounded | ✅ (Templates explicitly out) |
| Acceptance criteria testable | ✅ (14 ACs mapped to tasks) |
| Constraints documented | ✅ (Next 16, Claude CLI, JSON storage, container/image model) |
| Solution approach selected | ✅ (ContentItem absorbs Carousel) |
| Risks identified | ✅ (6 risks with mitigations) |
| Validation plan | ✅ (Playwright headed + curl + checklist) |
| Handoff implementation-ready | ✅ (file paths + sequencing + LOC budget per task) |

---

## Execution checklist (top-level)

1. [ ] Phase 1: Data layer (Tasks 1.1–1.3)
2. [ ] Phase 2: API surface (Tasks 2.1–2.4)
3. [ ] Phase 3: Editor reuse (Task 3.1)
4. [ ] Phase 4: Rebrand (Task 4.1)
5. [ ] Phase 5: Detail view (Tasks 5.1–5.3)
6. [ ] Phase 6: Dashboard (Tasks 6.1–6.3)
7. [ ] Phase 7: Chat modes (Tasks 7.1–7.2)
8. [ ] Phase 8: Concurrency (Tasks 8.1–8.2)
9. [ ] Phase 9: Cleanup (Tasks 9.1–9.3)

**Parallelizable batches** (different agents can pick these up in parallel):
- Phase 1 must complete before Phase 2.
- Phase 2 + Phase 4 can run in parallel.
- Phase 3 + Phase 4 can run in parallel.
- Phase 5 depends on Phases 2, 3.
- Phases 6, 7 depend on Phase 5.
- Phases 8, 9 depend on Phases 6, 7.
