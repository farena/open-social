---
title: Slide edits lost on slide switch (onItemPersisted treated ContentItem as Slide)
type: incident
date: 2026-05-27
related_code:
  - src/app/content/[id]/page.tsx
  - src/components/editor/EditorBody.tsx
  - src/components/editor/useSlideEditor.ts
  - src/app/api/content/[id]/slides/[slideId]/route.ts
  - src/lib/content-items.ts
status: resolved (changes uncommitted at ingest time)
---

# Incident: edits revert when switching slides

## Symptom (user report)

"Modifico un elemento del slide, pero al cambiar de slide el cambio se pierde."
And: "Pasa el guardado (aparece 'Guardado') pero el guardado no envía la data nueva."

## Investigation

Reproduced end-to-end with the Playwright CLI (headed) against a real content
item: select `heading` on slide 1 → edit `htmlContent` → wait for the "Guardado"
badge → go to slide 2 → back to slide 1. Result: the editor showed the **old**
content (`preserved: false`), even though the SQLite DB had the **new** value.

Key observations that narrowed it down:

- The "Guardado" badge *did* appear and the **DB was correctly updated** — so the
  PUT fired and persisted the new content. Not a save-path failure.
- The GET `/api/content/[id]` was **not** cached — it returned the new value.
- A `window.focus` → `fetchItem()` refetch (page.tsx) was suspected but ruled
  out: aborting GETs in the test still reproduced the revert.

## Root cause

`PUT /api/content/[id]/slides/[slideId]` returns the **full updated
`ContentItem`** (see `updateSlide` in `src/lib/content-items.ts`, return type
`Promise<ContentItem | null>`), not the slide.

The client treated the response as a *slide*. In `page.tsx`, `onSlidePersisted`
did:

```js
slides: prev.slides.map((s) => s.id === updated.id ? updated : s)
```

`updated.id` is the **content-item id**, which matches no slide id, so the map
returned every slide unchanged. `item.slides` was therefore **never updated**
after a save. The in-editor reducer (`useSlideEditor`) held the new content, but
the parent's `item.slides` kept the stale value. On slide switch the editor
re-seeds from `item.slides` (`SET_SLIDE`), reverting the visible content. The DB
stayed correct the whole time — the loss was purely in client memory.

The `onSlidePersisted` prop was also mistyped as `(slide: Slide) => void` while
actually receiving a `ContentItem`; `res.json()` is `any`, so TypeScript never
caught the mismatch.

## Fix

- `EditorBody`: renamed the callback to `onItemPersisted` with the correct type
  `(item: ContentItem) => void`; documented that the slide PUT returns the whole
  item.
- `page.tsx`: `onItemPersisted={(updatedItem) => setItem(updatedItem)}` — replace
  the whole item so `slides` reflects what was persisted. This also feeds the
  serial echo-absorption in `useSlideEditor` (the new `externalSlide` matches
  `lastSentContentRef`, so it's absorbed without clobbering in-flight keystrokes).

E2E after the fix: `preserved: true` — content survives the slide round-trip and
the DB stays consistent.

## Related fix landed in the same effort

- `useSlideEditor`: flush the **outgoing** slide's pending debounced persist when
  navigating to a different slide, before the persist effect's cleanup
  `clearTimeout`s it. Without this, switching slides within the 5 s debounce
  window dropped the un-persisted edit entirely. The reset effect stays keyed on
  `state.slide.id` (not `state.slide`) so it does not run per-edit; the outgoing
  slide and persist fn are read from refs to stay current. A first attempt that
  widened the deps to `state.slide` reintroduced a clobber and was reverted.
- Tooling: `vitest.config.ts` → `vitest.config.mts` (committed, `1e81a55`) to fix
  `ERR_REQUIRE_ESM` from vitest 4 / vite 8 pulling ESM-only `std-env` under a
  CommonJS package. Swapped `__dirname` for `import.meta.dirname`.

## Lessons

- The slide mutation endpoints return the **whole ContentItem**, not the slide.
  Any client consuming the response must merge at the item level.
- `res.json()` being `any` hides client/server contract drift — prefer a typed
  parse at the fetch boundary.
