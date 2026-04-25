"use client";

import { useCallback, useState, type PointerEvent as RPointerEvent } from "react";
import type { Slide } from "@/types/carousel";
import type { SlideElement } from "@/types/slide-model";
import {
  clampToCanvas,
  resizeFromAnchor,
  snapToGrid,
  type ResizeAnchor,
} from "@/lib/slide-coords";
import type { Selection, SlideEditorAction } from "./useSlideEditor";

interface SlideOverlayProps {
  slide: Slide;
  selection: Selection;
  scale: number;
  canvas: { w: number; h: number };
  dispatch: (action: SlideEditorAction) => void;
}

/**
 * Editor overlay layer that lives above the iframe inside SlideCanvas.
 * Renders one transparent <div> per element for hit-testing and drag, plus
 * a SelectionFrame around the selected element with 8 resize handles.
 *
 * All math is done in canvas-space (1080×1350 etc.) and scaled to screen-
 * space at render time. Pointer deltas come in screen-space and are
 * divided by `scale` before mutating the JSON.
 */
export function SlideOverlay({
  slide,
  selection,
  scale,
  canvas,
  dispatch,
}: SlideOverlayProps) {
  const handlePointerDownEmpty = useCallback(
    (e: RPointerEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        dispatch({ type: "SELECT", elementId: null });
      }
    },
    [dispatch],
  );

  return (
    <div
      onPointerDown={handlePointerDownEmpty}
      style={{
        position: "absolute",
        inset: 0,
        cursor: "default",
      }}
    >
      {slide.elements.map((el) => (
        <ElementHitArea
          key={el.id}
          element={el}
          scale={scale}
          canvas={canvas}
          isSelected={selection === el.id}
          dispatch={dispatch}
        />
      ))}
      {selection &&
        (() => {
          const sel = slide.elements.find((el) => el.id === selection);
          if (!sel) return null;
          return (
            <SelectionFrame
              element={sel}
              scale={scale}
              canvas={canvas}
              dispatch={dispatch}
            />
          );
        })()}
    </div>
  );
}

// ---------- Hit area (one per element) ----------

interface ElementHitAreaProps {
  element: SlideElement;
  scale: number;
  canvas: { w: number; h: number };
  isSelected: boolean;
  dispatch: (action: SlideEditorAction) => void;
}

function ElementHitArea({
  element,
  scale,
  canvas,
  isSelected,
  dispatch,
}: ElementHitAreaProps) {
  const [dragging, setDragging] = useState(false);
  const startRef = useState<{
    pointerX: number;
    pointerY: number;
    origPos: { x: number; y: number };
  } | null>(null)[0];

  const sizeH =
    element.kind === "text" && element.size.h === "auto" ? 80 : (element.size.h as number);

  const handlePointerDown = useCallback(
    (e: RPointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      if (!isSelected) {
        dispatch({ type: "SELECT", elementId: element.id });
        return;
      }
      // Already selected — start drag
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(true);

      const startPointerX = e.clientX;
      const startPointerY = e.clientY;
      const origPos = { ...element.position };

      const onMove = (ev: PointerEvent) => {
        const dx = (ev.clientX - startPointerX) / scale;
        const dy = (ev.clientY - startPointerY) / scale;
        const next = clampToCanvas(
          { x: snapToGrid(origPos.x + dx), y: snapToGrid(origPos.y + dy) },
          element.size,
          canvas,
        );
        dispatch({
          type: "MOVE_ELEMENT",
          elementId: element.id,
          position: next,
        });
      };

      const onUp = () => {
        setDragging(false);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [isSelected, dispatch, element.id, element.position, element.size, scale, canvas],
  );

  return (
    <div
      data-element-id={element.id}
      onPointerDown={handlePointerDown}
      style={{
        position: "absolute",
        left: element.position.x * scale,
        top: element.position.y * scale,
        width: element.size.w * scale,
        height: sizeH * scale,
        cursor: isSelected ? (dragging ? "grabbing" : "grab") : "pointer",
        // Slight visual hint on hover when not selected
        outline: isSelected ? "none" : undefined,
      }}
    />
  );
}

// ---------- Selection frame with 8 resize handles ----------

const ANCHORS: { anchor: ResizeAnchor; cursor: string; x: number; y: number }[] = [
  { anchor: "nw", cursor: "nwse-resize", x: 0, y: 0 },
  { anchor: "n", cursor: "ns-resize", x: 0.5, y: 0 },
  { anchor: "ne", cursor: "nesw-resize", x: 1, y: 0 },
  { anchor: "e", cursor: "ew-resize", x: 1, y: 0.5 },
  { anchor: "se", cursor: "nwse-resize", x: 1, y: 1 },
  { anchor: "s", cursor: "ns-resize", x: 0.5, y: 1 },
  { anchor: "sw", cursor: "nesw-resize", x: 0, y: 1 },
  { anchor: "w", cursor: "ew-resize", x: 0, y: 0.5 },
];

const HANDLE_PX = 10;

interface SelectionFrameProps {
  element: SlideElement;
  scale: number;
  canvas: { w: number; h: number };
  dispatch: (action: SlideEditorAction) => void;
}

function SelectionFrame({ element, scale, canvas, dispatch }: SelectionFrameProps) {
  const sizeH =
    element.kind === "text" && element.size.h === "auto" ? 80 : (element.size.h as number);

  const left = element.position.x * scale;
  const top = element.position.y * scale;
  const width = element.size.w * scale;
  const height = sizeH * scale;

  const startResize = (e: RPointerEvent<HTMLDivElement>, anchor: ResizeAnchor) => {
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);

    const startPointerX = e.clientX;
    const startPointerY = e.clientY;
    const origPos = { ...element.position };
    const origSize = { w: element.size.w, h: sizeH };

    const onMove = (ev: PointerEvent) => {
      const dx = (ev.clientX - startPointerX) / scale;
      const dy = (ev.clientY - startPointerY) / scale;
      const result = resizeFromAnchor(
        origPos,
        origSize,
        anchor,
        { x: dx, y: dy },
        ev.shiftKey,
      );
      const clamped = clampToCanvas(result.position, result.size, canvas);
      dispatch({
        type: "RESIZE_ELEMENT",
        elementId: element.id,
        position: clamped,
        size: result.size,
      });
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width,
        height,
        outline: "2px solid #3b82f6",
        outlineOffset: -1,
        pointerEvents: "none",
      }}
    >
      {ANCHORS.map(({ anchor, cursor, x, y }) => (
        <div
          key={anchor}
          onPointerDown={(e) => startResize(e, anchor)}
          style={{
            position: "absolute",
            left: x * width - HANDLE_PX / 2,
            top: y * height - HANDLE_PX / 2,
            width: HANDLE_PX,
            height: HANDLE_PX,
            background: "#ffffff",
            border: "1.5px solid #3b82f6",
            borderRadius: 2,
            cursor,
            pointerEvents: "auto",
          }}
        />
      ))}
    </div>
  );
}
