---
title: Slide editor (canvas + overlay)
type: entity
code_refs: [src/components/editor/SlideCanvas.tsx, src/components/editor/SlideOverlay.tsx, src/components/editor/PropertiesPanel.tsx, src/components/editor/LayersPanel.tsx, src/components/editor/Toolbar.tsx, src/components/editor/useSlideEditor.ts, src/components/editor/useEditorShortcuts.ts, src/components/editor/EditorBody.tsx, src/components/editor/SlideRenderer.tsx, src/components/editor/SlideFilmstrip.tsx]
sources: [raw/decisions/structured-slide-model-2026-04-25.md, raw/decisions/keepalive-put-vs-sendbeacon-2026-05-01.md]
related: [pages/entities/structured-slide-pipeline.md, pages/concepts/structured-slide-model.md, pages/concepts/version-history.md]
created: 2026-04-29
updated: 2026-05-01
confidence: high
---

# Slide editor

Visual editor over the [[entities/structured-slide-pipeline]] JSON model. Lives entirely in the parent frame — never reads the iframe DOM.

## Surface

- **`EditorBody`** — top-level layout: filmstrip on the left, canvas center, properties panel right, toolbar across the top.
- **`SlideCanvas`** — wraps the iframe (which renders `wrapSlideHtml(serialize(slide))`) and an absolutely-positioned overlay. Manages canvas scale and dispatches reducer actions.
- **`SlideOverlay`** — transparent layer that owns hit-testing, selection, drag, and resize. Computes everything from the JSON model and `slide-coords` math helpers.
- **`PropertiesPanel`** — sidebar that switches its controls based on the selected element's `kind` (or shows background / "+ add element" controls when nothing is selected).
- **`LayersPanel`** — z-order list with show/hide.
- **`Toolbar`** — top strip with the aspect-ratio selector on the left and an action cluster on the right: **Undo / Redo** buttons (active slide's `previousVersions` / `nextVersions`, disabled at the boundaries), fullscreen, safe zones, save-as-template, delete, details, chat toggle, export. The Undo/Redo affordance is per-active-slide — buttons reflect the count for `slides[activeIndex]`, and the click hits `/undo` or `/redo` for that slide.
- **`useSlideEditor`** — hook exposing the slide reducer, selection state, and mutation helpers. The single source of state for the editor.
- **`useEditorShortcuts`** — keyboard bindings: delete, arrow-key nudge, escape to clear selection, `Cmd/Ctrl+Z` (undo), `Cmd/Ctrl+Shift+Z` (redo), `Cmd/Ctrl+D` duplicate, `Cmd/Ctrl+]` / `[` z-order. Both undo and redo are server round-trips — they call back into the page's `handleUndoSlide` / `handleRedoSlide`, which hit `/api/content/[id]/slides/[slideId]/undo` (or `/redo`) and refetch the item. See [[concepts/version-history]].

## Inline rich text

Text editing inside a `container` element uses Lexical (`@lexical/react`), mounted on demand over the selected element when the user double-clicks. The Lexical state is serialized back into the element's `htmlContent` on blur. See `0e840cd`.

## Drag / resize

Snap to a 4 px grid and to canvas centers (`src/lib/slide-coords.ts`). Out of scope V1: snap to other elements, multi-select, rotation.

## Coordinate transform

Canvas units (e.g. 0..1080) → screen units via `canvasToScreen(point, scale)` and back via `screenToCanvas`. The overlay is rendered at the same scale as the iframe so coordinates align.

## Live-slide bubbling (unsaved edits outside the canvas)

The editor's in-flight `slide` (live reducer state, ahead of the persisted row) is bubbled up via `EditorBody`'s `onLiveSlideChange` callback. The page splices it into `item.slides` to produce a `liveSlides` array that's fed to `FullscreenPreview` and `SlideFilmstrip`, so those surfaces reflect unsaved edits immediately instead of waiting for the persist debounce. The toolbar's active-slide reference also reads from `liveSlides`. This is the only contract by which non-editor consumers see in-flight state — they never read the reducer directly.

## Persist + tab-close flush

`useSlideEditor` debounces persistence (see [[concepts/version-history]] for the current window). On `beforeunload`, `EditorBody` does a final `fetch(..., { method: "PUT", keepalive: true })` against the slide route — `sendBeacon` was tried first but always issues `POST` and silently 405s against the PUT-only handler. The flush also short-circuits when `lastSentContentRef` matches the current signature, so a debounce that fired immediately before unload doesn't double-send. See [[raw/decisions/keepalive-put-vs-sendbeacon-2026-05-01]].

## Recent changes

- 2026-04-26 (`b34fc19`) — Operates on `ContentItem` instead of `Carousel`.
- 2026-05-01 (`c552e67`) — `useSlideEditor` absorbs server echoes of in-flight persists by JSON content signature, so keystrokes typed during the PUT round-trip are no longer clobbered by the response.
- 2026-05-01 (`f99b603`) — Toolbar gained Undo / Redo buttons in the top-right action cluster; `useEditorShortcuts` added `Cmd/Ctrl+Shift+Z` for redo. Both wire through to the new `/redo` route alongside the existing `/undo`. The buttons are disabled when the active slide's respective stack is empty.
- 2026-05-01 (`707c67e`) — Tab-close flush switched from `sendBeacon` to `fetch` with `keepalive: true` because the slide endpoint is PUT-only; gated on `lastSentContentRef` to suppress duplicate sends.
- 2026-05-01 (`4c5459f`) — `EditorBody` exposes `onLiveSlideChange`; the page splices the live slide into `item.slides` so `FullscreenPreview` and `SlideFilmstrip` show unsaved edits before the debounce fires.
