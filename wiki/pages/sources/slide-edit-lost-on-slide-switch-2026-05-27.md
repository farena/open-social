---
title: Slide edits lost on slide switch (2026-05-27)
type: source
code_refs: ["src/app/content/[id]/page.tsx", src/components/editor/EditorBody.tsx, src/components/editor/useSlideEditor.ts, "src/app/api/content/[id]/slides/[slideId]/route.ts", src/lib/content-items.ts]
sources: [raw/incidents/slide-edit-lost-on-slide-switch-2026-05-27.md]
related: [pages/entities/slide-editor.md, pages/entities/content-routes.md, pages/concepts/version-history.md]
created: 2026-05-27
updated: 2026-05-27
confidence: high
---

# Slide edits lost on slide switch

User-reported bug: editing a slide element, then switching slides, reverted the
content — though the save badge showed and the DB held the new value.

## Root cause

`PUT /api/content/[id]/slides/[slideId]` returns the **full `ContentItem`**
(`updateSlide` → `Promise<ContentItem | null>` in `src/lib/content-items.ts`),
but the client treated the response as a `Slide`. `onSlidePersisted` in
`page.tsx` matched `s.id === updated.id` against `prev.slides`, where
`updated.id` is the *item* id — matching no slide — so `item.slides` was never
updated after a save. The editor reducer held the new content, but on slide
switch it re-seeds from the stale `item.slides` and reverts. Loss was purely in
client memory; the DB was always correct.

## Fix

- `EditorBody`: callback renamed `onItemPersisted`, typed `(item: ContentItem) => void`.
- `page.tsx`: `onItemPersisted={(updatedItem) => setItem(updatedItem)}` — merge at
  the item level. Verified E2E (`preserved: true`).

## Same-effort companion fix

`useSlideEditor` now flushes the outgoing slide's pending debounced persist on
slide switch (before the persist-effect cleanup clears the timer), so a switch
within the 5 s debounce window no longer drops the edit. The reset effect stays
keyed on `state.slide.id`; outgoing slide + persist fn come from refs. See
[[entities/slide-editor]] and [[concepts/version-history]].

## Takeaways

- Slide mutation endpoints return the whole `ContentItem`; consumers must merge
  at item level, never as a slide. See [[entities/content-routes]].
- `res.json()` is `any` — contract drift between client and server went
  uncaught by TypeScript.

Source: [[../../raw/incidents/slide-edit-lost-on-slide-switch-2026-05-27]]
