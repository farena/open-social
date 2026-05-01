"use client";

import { useCallback, type ReactNode } from "react";
import { CarouselPreview } from "./CarouselPreview";
import { PropertiesPanel } from "./PropertiesPanel";
import { useSlideEditor } from "./useSlideEditor";
import { useEditorShortcuts } from "./useEditorShortcuts";
import type { Slide, AspectRatio } from "@/types/carousel";

interface EditorBodyProps {
  contentItemId: string;
  slides: Slide[];
  aspectRatio: AspectRatio;
  activeIndex: number;
  onActiveChange: (index: number) => void;
  showSafeZones?: boolean;
  onSlidePersisted?: (slide: Slide) => void;
  onUndoSlide?: (slideId: string) => void;
  onRedoSlide?: (slideId: string) => void;
  /** Mounted between the canvas column and the PropertiesPanel (e.g. caption). */
  belowPreview?: ReactNode;
  /** Mounted above the canvas column (toolbar). */
  toolbar?: ReactNode;
}

/**
 * Owns the editor state (selection + dispatch + debounced persist) and renders
 * BOTH the middle column (toolbar + canvas + caption slot) and the right-rail
 * PropertiesPanel. They render as sibling top-level children of the parent
 * `#main-editor-area` flex container — the chat panel sits to their left.
 *
 * Lifting the state here lets the panel react instantly to canvas drag/resize
 * and vice versa without prop-drilling through CarouselPreview.
 */
export function EditorBody({
  contentItemId,
  slides,
  aspectRatio,
  activeIndex,
  onActiveChange,
  showSafeZones = false,
  onSlidePersisted,
  onUndoSlide,
  onRedoSlide,
  belowPreview,
  toolbar,
}: EditorBodyProps) {
  const activeSlide = slides[activeIndex];

  const persist = useCallback(
    async (slide: Slide) => {
      const res = await fetch(
        `/api/content/${contentItemId}/slides/${slide.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            background: slide.background,
            elements: slide.elements,
            ...(slide.legacyHtml !== undefined
              ? { legacyHtml: slide.legacyHtml }
              : {}),
          }),
        },
      );
      if (res.ok && onSlidePersisted) {
        const updated = await res.json();
        onSlidePersisted(updated);
      }
    },
    [contentItemId, onSlidePersisted],
  );

  const { slide, selection, dispatch } = useSlideEditor(activeSlide, {
    onPersist: persist,
  });

  useEditorShortcuts({
    slide,
    selection,
    dispatch,
    onUndoRequest: onUndoSlide ? () => onUndoSlide(slide.id) : undefined,
    onRedoRequest: onRedoSlide ? () => onRedoSlide(slide.id) : undefined,
  });

  return (
    <>
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {toolbar}
        <CarouselPreview
          slides={slides}
          aspectRatio={aspectRatio}
          activeIndex={activeIndex}
          onActiveChange={onActiveChange}
          showSafeZones={showSafeZones}
          slide={slide}
          selection={selection}
          dispatch={dispatch}
        />
        {belowPreview}
      </div>
      <PropertiesPanel
        slide={slide}
        selection={selection}
        dispatch={dispatch}
      />
    </>
  );
}
