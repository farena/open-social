---
title: Effect dependency stability (debounced writes + synced refs)
type: concept
code_refs: [src/components/editor/useSlideEditor.ts]
sources: [raw/incidents/autosave-infinite-loop-onpersist-dep-2026-05-29.md, raw/incidents/slide-edit-lost-on-slide-switch-2026-05-27.md]
related: [pages/entities/slide-editor.md, pages/concepts/version-history.md]
created: 2026-05-29
updated: 2026-05-29
confidence: high
---

# Effect dependency stability

A pattern the editor follows to keep `useEffect`-driven, debounced network writes
correct in the face of unstable callbacks and server "echoes".

## The problem

Two failure modes converge in `useSlideEditor`:

1. **Unstable callbacks in deps.** Caller-supplied callbacks (e.g. `onPersist`,
   which traces back to an inline arrow `onItemPersisted` in
   `src/app/content/[id]/page.tsx`) get a new reference on every parent render.
   If such a callback is in an effect's dependency array, the effect re-runs on
   every render — and an effect that schedules a debounced write reschedules the
   write each time.
2. **Echo repointing of identity guards.** The editor absorbs server echoes of
   in-flight persists; the reset effect repoints `lastPersistedRef.current` at the
   server-returned slide object — content-equal but a different reference. An
   early-return guard like `if (state.slide === lastPersistedRef.current) return;`
   then compares two reference-unequal objects and stops guarding.

When (1) and (2) combine, the persist effect re-registers on every save-induced
re-render and the `===` guard can't suppress the redundant write — yielding an
infinite debounce loop (one PUT per tick, forever). See
[[sources/autosave-infinite-loop-onpersist-dep-2026-05-29]].

## The rule

- Effects that schedule debounced network writes depend **only on the data that
  changed** (here `state.slide`, plus tuning constants like `debounceMs`), never
  on caller-supplied callbacks.
- Read those callbacks from a **synced ref** (`onPersistRef.current`) so the
  effect always calls the latest function without taking a dependency on its
  identity. `useSlideEditor` maintains `onPersistRef` for exactly this; the reset
  and unmount/flush effects already read it with narrow deps.
- Treat reference-identity guards as fragile whenever an "echo" effect may repoint
  the compared ref to a server copy of the same content. Prefer content
  signatures (the editor's `lastSentContentRef` JSON-signature absorption,
  `c552e67`) over object-identity `===` for that case.

## Related

- The slide editor's persist/flush lifecycle: [[entities/slide-editor]].
- A sibling bug in the same hook where widening the *reset* effect's deps to
  `state.slide` reintroduced a clobber and was reverted:
  [[sources/slide-edit-lost-on-slide-switch-2026-05-27]].
