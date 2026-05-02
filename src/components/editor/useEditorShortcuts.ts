"use client";

import { useEffect } from "react";
import { duplicateElement } from "@/lib/slide-defaults";
import type { Slide } from "@/types/carousel";
import type { SlideEditorAction } from "./useSlideEditor";

interface UseEditorShortcutsOptions {
  slide: Slide;
  selection: string | null;
  dispatch: (action: SlideEditorAction) => void;
  /** Called for Cmd/Ctrl+Z so the page can hit /undo. */
  onUndoRequest?: () => void;
  /** Called for Cmd/Ctrl+Shift+Z so the page can hit /redo. */
  onRedoRequest?: () => void;
  /** Whether the canvas is the active focus target (avoid hijacking inputs). */
  enabled?: boolean;
}

/**
 * Keyboard shortcuts for the editor:
 *   - Delete / Backspace: delete selected element
 *   - Esc: deselect
 *   - Cmd/Ctrl+D: duplicate selected element with offset
 *   - Cmd/Ctrl+Z: server-side undo of the last snapshot
 *   - Cmd/Ctrl+]: bring selected element forward one layer
 *   - Cmd/Ctrl+[: send selected element backward one layer
 *   - Cmd/Ctrl+Shift+]: bring selected element to front
 *   - Cmd/Ctrl+Shift+[: send selected element to back
 *   - Arrow keys: nudge selected element by 1px (Shift = 10px)
 *
 * Listeners are bound to window. They no-op when the user is typing in an
 * input/textarea/contenteditable.
 */
export function useEditorShortcuts({
  slide,
  selection,
  dispatch,
  onUndoRequest,
  onRedoRequest,
  enabled = true,
}: UseEditorShortcutsOptions) {
  useEffect(() => {
    if (!enabled) return;

    const onKey = (e: KeyboardEvent) => {
      // Skip when typing
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName?.toLowerCase();
        if (
          tag === "input" ||
          tag === "textarea" ||
          target.isContentEditable
        ) {
          return;
        }
      }

      const meta = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl+Z — server undo. Skip if there's nothing to undo (avoid
      // pointless POST + 404 from the API).
      if (meta && e.key.toLowerCase() === "z" && !e.shiftKey) {
        if (onUndoRequest && slide.previousVersions.length > 0) {
          e.preventDefault();
          onUndoRequest();
        }
        return;
      }

      // Cmd/Ctrl+Shift+Z — server redo. Same gate.
      if (meta && e.shiftKey && e.key.toLowerCase() === "z") {
        if (onRedoRequest && (slide.nextVersions?.length ?? 0) > 0) {
          e.preventDefault();
          onRedoRequest();
        }
        return;
      }

      // No selection-required shortcuts below
      if (!selection) return;

      const sel = slide.elements.find((el) => el.id === selection);
      if (!sel) return;

      // Cmd/Ctrl+] / Cmd/Ctrl+[ — z-order (Photoshop-style)
      // Shift modifier bumps to front/back; without it, one step.
      if (meta && (e.key === "]" || e.key === "[")) {
        e.preventDefault();
        const forward = e.key === "]";
        const direction = e.shiftKey
          ? forward ? "top" : "bottom"
          : forward ? "up" : "down";
        dispatch({ type: "REORDER_Z", elementId: sel.id, direction });
        return;
      }

      // Cmd/Ctrl+D — duplicate
      if (meta && e.key.toLowerCase() === "d") {
        e.preventDefault();
        dispatch({
          type: "DUPLICATE_ELEMENT",
          elementId: sel.id,
          newElement: duplicateElement(sel),
        });
        return;
      }

      // Delete / Backspace
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        dispatch({ type: "DELETE_ELEMENT", elementId: sel.id });
        return;
      }

      // Esc — deselect
      if (e.key === "Escape") {
        e.preventDefault();
        dispatch({ type: "SELECT", elementId: null });
        return;
      }

      // Arrow keys — nudge
      const step = e.shiftKey ? 10 : 1;
      let dx = 0;
      let dy = 0;
      if (e.key === "ArrowLeft") dx = -step;
      else if (e.key === "ArrowRight") dx = step;
      else if (e.key === "ArrowUp") dy = -step;
      else if (e.key === "ArrowDown") dy = step;
      if (dx !== 0 || dy !== 0) {
        e.preventDefault();
        dispatch({
          type: "MOVE_ELEMENT",
          elementId: sel.id,
          position: { x: sel.position.x + dx, y: sel.position.y + dy },
        });
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slide, selection, dispatch, onUndoRequest, onRedoRequest, enabled]);
}
