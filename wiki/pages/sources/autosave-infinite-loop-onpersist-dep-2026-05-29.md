---
title: Infinite 5s auto-save loop in slide editor (2026-05-29)
type: source
code_refs: [src/components/editor/useSlideEditor.ts, src/components/editor/EditorBody.tsx, "src/app/content/[id]/page.tsx"]
sources: [raw/incidents/autosave-infinite-loop-onpersist-dep-2026-05-29.md]
related: [pages/entities/slide-editor.md, pages/concepts/effect-dependency-stability.md, pages/concepts/version-history.md]
created: 2026-05-29
updated: 2026-05-29
confidence: high
---

# Infinite 5s auto-save loop in slide editor

After any edit, the slide editor issued a slide `PUT` every 5 s forever, only
stopping on a page refresh (until the next edit re-armed it).

## Root cause

The debounced persist `useEffect` in `src/components/editor/useSlideEditor.ts`
listed `onPersist` in its deps (`[state.slide, onPersist, debounceMs]`).
`onPersist` is unstable: it derives from `persist` in
`src/components/editor/EditorBody.tsx` (deps include `onItemPersisted`), and
`onItemPersisted` is an inline arrow defined in `src/app/content/[id]/page.tsx`
— a new reference every render. Each successful save calls `setItem(updatedItem)`,
re-rendering the page → new `onItemPersisted` → new `persist` → new `onPersist` →
the persist effect re-registers and reschedules.

The effect's early-return guard `if (state.slide === lastPersistedRef.current)
return;` could not stop it: the echo-absorption reset effect had repointed
`lastPersistedRef.current` at the **server-returned** slide object — content-equal
but a different reference than the local `state.slide` — so the `===` guard
failed and a new PUT fired each 5 s debounce tick.

## Fix

Read the always-current `onPersistRef.current(snapshot)` inside the persist
effect (a synced ref the file already maintains for this purpose) and drop
`onPersist` from the deps, leaving `[state.slide, debounceMs]`. This matches the
file's existing pattern — the reset and unmount/flush effects already read
`onPersistRef.current` with narrow deps. The effect now re-runs only on a real
`state.slide` change, so each edit persists exactly once and the server echo no
longer relaunches the timer. See [[entities/slide-editor]].

## Verification

ESLint clean (no `exhaustive-deps` warning), the debounce test passes 5/5
(`src/components/editor/__tests__/useSlideEditor.test.ts`), and the changed file
type-checks. Pre-existing project-wide `tsc` errors in unrelated test fixtures
(`style-presets`, `content-items-sqlite`) are not related to this change.

## Takeaways

- Effects scheduling debounced network writes must depend only on the data that
  changed (`state.slide`), not on caller-supplied callbacks that may be unstable;
  read those from a synced ref. See [[concepts/effect-dependency-stability]].
- Reference-identity guards (`a === b`) are fragile when a separate "echo" effect
  repoints the ref to a server copy of the same content.

Source: [[../../raw/incidents/autosave-infinite-loop-onpersist-dep-2026-05-29]]
