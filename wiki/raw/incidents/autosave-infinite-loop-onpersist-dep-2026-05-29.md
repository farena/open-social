---
title: Infinite 5s auto-save loop in slide editor (useSlideEditor persist effect)
type: incident
date: 2026-05-29
related_code:
  - src/components/editor/useSlideEditor.ts
  - src/components/editor/EditorBody.tsx
  - src/app/content/[id]/page.tsx
status: resolved (changes uncommitted at ingest time)
---

# Incident: editor auto-saves forever, one slide PUT every 5 seconds

## Symptom

In the content/slide editor, after the user modified anything, the editor kept
issuing a slide `PUT` every 5 seconds **forever** — it never stopped. The only
way to break the loop was a full page refresh, which held until the next edit
re-armed it.

## Root cause

The debounced persist `useEffect` in `src/components/editor/useSlideEditor.ts`
(~lines 264-290) listed `onPersist` in its dependency array:
`[state.slide, onPersist, debounceMs]`.

`onPersist` is **unstable** — it is a new function reference on essentially every
render:

- It comes from `persist` in `src/components/editor/EditorBody.tsx` (~lines
  60-97), whose `useCallback` deps include `onItemPersisted`.
- `onItemPersisted` is an **inline arrow function** defined in
  `src/app/content/[id]/page.tsx` (~lines 486-491), so it is a brand-new
  reference on every parent render.

The loop:

1. A successful save calls `setItem(updatedItem)` (the slide PUT returns the full
   `ContentItem`), which re-renders the page.
2. Re-render produces a new `onItemPersisted` → new `persist` → new `onPersist`.
3. The persist effect's deps changed, so it re-registers and reschedules a PUT.

Meanwhile the editor's "echo-absorption" reset effect repoints
`lastPersistedRef.current` at the **server-returned** slide object — same content,
but a **different reference** than the local `state.slide`. So the persist
effect's early-return guard

```js
if (state.slide === lastPersistedRef.current) return;
```

compares two content-equal but reference-unequal objects, the guard **fails**,
and the effect schedules yet another PUT on the next debounce tick (5 s),
indefinitely. A page refresh reset the references and broke the cycle until the
next edit re-armed it.

## Fix

Make the persist effect read the always-current `onPersistRef.current(snapshot)`
— a ref the file already maintains and syncs for exactly this purpose — and
**remove `onPersist` from the dependency array**, leaving `[state.slide,
debounceMs]`.

This aligns the persist effect with the file's already-established pattern: the
reset effect and the unmount/flush effect already use `onPersistRef.current` with
narrow deps. With the unstable callback out of the deps, the effect only re-runs
on a real `state.slide` change, so the slide is persisted **exactly once per
edit** and the server echo no longer relaunches the timer.

## Verification

- ESLint clean (no `react-hooks/exhaustive-deps` warning on the narrowed deps).
- The editor's debounce test passes 5/5
  (`src/components/editor/__tests__/useSlideEditor.test.ts`).
- The changed file type-checks. Pre-existing project-wide `tsc` errors in
  unrelated test fixtures (`style-presets`, `content-items-sqlite`) are **not**
  related to this change.

## Lessons

- Effects that schedule debounced network writes must depend **only on the data
  that changed** (here `state.slide`), never on caller-supplied callbacks that may
  be unstable. Read those callbacks from a synced ref (`onPersistRef.current`).
- Reference-identity guards (`a === b`) are fragile when a separate "echo" effect
  repoints the ref to a server copy of the same content — content equality and
  reference equality diverge, and the guard silently stops guarding.
