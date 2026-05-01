---
title: Slide editor (canvas + overlay)
type: entity
code_refs: [src/components/editor/SlideCanvas.tsx, src/components/editor/SlideOverlay.tsx, src/components/editor/PropertiesPanel.tsx, src/components/editor/LayersPanel.tsx, src/components/editor/Toolbar.tsx, src/components/editor/useSlideEditor.ts, src/components/editor/useEditorShortcuts.ts, src/components/editor/EditorBody.tsx, src/components/editor/SlideRenderer.tsx, src/components/editor/SlideFilmstrip.tsx]
sources: [raw/decisions/structured-slide-model-2026-04-25.md]
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

## Recent changes

- 2026-04-25 (`b8c1354`) — Canvas scaffold with overlay slot.
- 2026-04-25 (`74d644e`) — Selection, drag, resize.
- 2026-04-25 (`72f8597`) — Properties panel + keyboard shortcuts.
- 2026-04-25 (`0e840cd`) — Lexical inline text editing.
- 2026-04-25 (`17f2637`) — Component split + structure refactor.
- 2026-04-26 (`b34fc19`) — Operates on `ContentItem` instead of `Carousel`.
- 2026-05-01 (`c552e67`) — `useSlideEditor` absorbs server echoes of in-flight persists by JSON content signature, so keystrokes typed during the PUT round-trip are no longer clobbered by the response.
- 2026-05-01 (`f99b603`) — Toolbar gained Undo / Redo buttons in the top-right action cluster; `useEditorShortcuts` added `Cmd/Ctrl+Shift+Z` for redo. Both wire through to the new `/redo` route alongside the existing `/undo`. The buttons are disabled when the active slide's respective stack is empty.
