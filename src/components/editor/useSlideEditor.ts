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
  // upstream. We compare by identity of background/elements/legacyHtml refs:
  // SET_SLIDE creates a new object, mutations create new arrays. Upstream
  // arrives via the externalSlide effect.
  const lastPersistedRef = useRef<Slide>(externalSlide);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset local state when upstream slide identity changes (different slide
  // navigated to, or chat IA refetched the carousel).
  useEffect(() => {
    if (
      externalSlide.id !== state.slide.id ||
      externalSlide !== lastPersistedRef.current
    ) {
      // Only sync if upstream is a different slide OR the upstream value is
      // not what we just persisted (i.e. someone else changed it).
      const isOurOwnEcho =
        externalSlide.id === state.slide.id &&
        externalSlide === lastPersistedRef.current;
      if (!isOurOwnEcho) {
        dispatch({ type: "SET_SLIDE", slide: externalSlide });
        lastPersistedRef.current = externalSlide;
      }
    }
  }, [externalSlide, state.slide.id]);

  // Debounced persist whenever the editable parts of the slide change.
  useEffect(() => {
    if (state.slide === lastPersistedRef.current) return;

    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(async () => {
      const snapshot = state.slide;
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
