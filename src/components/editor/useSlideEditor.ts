"use client";

import { useEffect, useReducer, useRef, useCallback } from "react";
import type {
  BackgroundElement,
  SlideElement,
} from "@/types/slide-model";
import type { Slide } from "@/types/carousel";

/**
 * Editor state held locally in the canvas. The full slide is mirrored here
 * so the overlay can react instantly to drag/resize without round-tripping
 * to the server. Mutations dispatch through this reducer; a debounced
 * effect persists the new slide to the API.
 *
 * When the upstream `slide` prop changes (e.g. chat IA writes new content),
 * the hook resets local state to the new server value — last-write-wins.
 */

export type Selection = string | null;

export interface SlideEditorState {
  slide: Slide;
  selection: Selection;
}

export type SlideEditorAction =
  | { type: "SELECT"; elementId: string | null }
  | { type: "MOVE_ELEMENT"; elementId: string; position: { x: number; y: number } }
  | {
      type: "RESIZE_ELEMENT";
      elementId: string;
      position: { x: number; y: number };
      size: { w: number; h: number };
    }
  | { type: "PATCH_ELEMENT"; elementId: string; patch: Partial<SlideElement> }
  | { type: "ADD_ELEMENT"; element: SlideElement }
  | { type: "DELETE_ELEMENT"; elementId: string }
  | { type: "DUPLICATE_ELEMENT"; elementId: string; newElement: SlideElement }
  | { type: "REORDER_Z"; elementId: string; direction: "up" | "down" | "top" | "bottom" }
  | { type: "MOVE_TO_INDEX"; elementId: string; toIndex: number }
  | { type: "TOGGLE_VISIBILITY"; elementId: string }
  | { type: "SET_BACKGROUND"; background: BackgroundElement }
  | { type: "SET_SLIDE"; slide: Slide };

function reducer(
  state: SlideEditorState,
  action: SlideEditorAction,
): SlideEditorState {
  switch (action.type) {
    case "SELECT":
      return { ...state, selection: action.elementId };
    case "SET_SLIDE":
      return { slide: action.slide, selection: state.selection };
    case "SET_BACKGROUND":
      return {
        ...state,
        slide: { ...state.slide, background: action.background },
      };
    case "MOVE_ELEMENT":
      return {
        ...state,
        slide: {
          ...state.slide,
          elements: state.slide.elements.map((el) =>
            el.id === action.elementId
              ? ({ ...el, position: action.position } as SlideElement)
              : el,
          ),
        },
      };
    case "RESIZE_ELEMENT":
      return {
        ...state,
        slide: {
          ...state.slide,
          elements: state.slide.elements.map((el) =>
            el.id === action.elementId
              ? ({ ...el, position: action.position, size: action.size } as SlideElement)
              : el,
          ),
        },
      };
    case "PATCH_ELEMENT":
      return {
        ...state,
        slide: {
          ...state.slide,
          elements: state.slide.elements.map((el) =>
            el.id === action.elementId
              ? ({ ...el, ...action.patch, id: el.id, kind: el.kind } as SlideElement)
              : el,
          ),
        },
      };
    case "ADD_ELEMENT":
      return {
        ...state,
        slide: {
          ...state.slide,
          elements: [...state.slide.elements, action.element],
        },
        selection: action.element.id,
      };
    case "DELETE_ELEMENT":
      return {
        ...state,
        slide: {
          ...state.slide,
          elements: state.slide.elements.filter((el) => el.id !== action.elementId),
        },
        selection: state.selection === action.elementId ? null : state.selection,
      };
    case "DUPLICATE_ELEMENT": {
      const idx = state.slide.elements.findIndex(
        (el) => el.id === action.elementId,
      );
      if (idx === -1) return state;
      const next = [...state.slide.elements];
      next.splice(idx + 1, 0, action.newElement);
      return {
        ...state,
        slide: { ...state.slide, elements: next },
        selection: action.newElement.id,
      };
    }
    case "REORDER_Z": {
      const els = [...state.slide.elements];
      const idx = els.findIndex((el) => el.id === action.elementId);
      if (idx === -1) return state;
      const [el] = els.splice(idx, 1);
      const target = (() => {
        switch (action.direction) {
          case "up":
            return Math.min(els.length, idx + 1);
          case "down":
            return Math.max(0, idx - 1);
          case "top":
            return els.length;
          case "bottom":
            return 0;
        }
      })();
      els.splice(target, 0, el);
      return { ...state, slide: { ...state.slide, elements: els } };
    }
    case "MOVE_TO_INDEX": {
      const els = [...state.slide.elements];
      const idx = els.findIndex((el) => el.id === action.elementId);
      if (idx === -1) return state;
      const clamped = Math.max(0, Math.min(els.length - 1, action.toIndex));
      if (clamped === idx) return state;
      const [el] = els.splice(idx, 1);
      els.splice(clamped, 0, el);
      return { ...state, slide: { ...state.slide, elements: els } };
    }
    case "TOGGLE_VISIBILITY": {
      return {
        ...state,
        slide: {
          ...state.slide,
          elements: state.slide.elements.map((el) =>
            el.id === action.elementId
              ? ({ ...el, hidden: !el.hidden } as SlideElement)
              : el,
          ),
        },
      };
    }
  }
}

interface UseSlideEditorOptions {
  /** Called with the latest slide after a debounce window. */
  onPersist: (slide: Slide) => Promise<void> | void;
  /** Debounce delay in ms. Default: 400. */
  debounceMs?: number;
}

export function useSlideEditor(
  externalSlide: Slide,
  { onPersist, debounceMs = 400 }: UseSlideEditorOptions,
) {
  const [state, dispatch] = useReducer(reducer, {
    slide: externalSlide,
    selection: null,
  });

  // Track whether the local change is from us (pending persist) vs from
  // upstream. Identity alone is not enough: when we persist, the parent
  // re-feeds us the server response as a *new* object with the same content,
  // so we also remember the JSON of what we last sent and treat any upstream
  // value with matching content as our own echo.
  const lastPersistedRef = useRef<Slide>(externalSlide);
  const lastSentContentRef = useRef<string | null>(null);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const slideContentSignature = (s: Slide): string =>
    JSON.stringify({
      background: s.background,
      elements: s.elements,
      legacyHtml: s.legacyHtml,
    });

  // Reset local state when upstream slide changes for a real reason
  // (different slide navigated to, or chat IA wrote new content). Absorb
  // server echoes of our own persists silently so in-flight keystrokes
  // aren't clobbered when the PUT round-trip resolves.
  useEffect(() => {
    if (externalSlide === lastPersistedRef.current) return;

    if (externalSlide.id !== state.slide.id) {
      dispatch({ type: "SET_SLIDE", slide: externalSlide });
      lastPersistedRef.current = externalSlide;
      return;
    }

    const upstreamContent = slideContentSignature(externalSlide);
    if (upstreamContent === lastSentContentRef.current) {
      // Server-side echo of our last persist — absorb without resetting,
      // so any keystrokes typed during the round-trip survive.
      lastPersistedRef.current = externalSlide;
      return;
    }

    // Foreign change (e.g. chat IA rewrote the slide) — last-write-wins.
    dispatch({ type: "SET_SLIDE", slide: externalSlide });
    lastPersistedRef.current = externalSlide;
  }, [externalSlide, state.slide.id]);

  // Debounced persist whenever the editable parts of the slide change.
  useEffect(() => {
    if (state.slide === lastPersistedRef.current) return;

    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(async () => {
      const snapshot = state.slide;
      lastSentContentRef.current = slideContentSignature(snapshot);
      try {
        await onPersist(snapshot);
        lastPersistedRef.current = snapshot;
      } catch (err) {
        console.error("Failed to persist slide:", err);
      }
    }, debounceMs);

    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    };
  }, [state.slide, onPersist, debounceMs]);

  // Stable dispatch wrapper for callers that use it in deps arrays.
  const stableDispatch = useCallback(
    (action: SlideEditorAction) => dispatch(action),
    [],
  );

  return {
    slide: state.slide,
    selection: state.selection,
    dispatch: stableDispatch,
  };
}
