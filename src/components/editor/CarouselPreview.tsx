"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SlideCanvas } from "./SlideCanvas";
import { SlideOverlay } from "./SlideOverlay";
import { SafeZoneOverlay } from "./SafeZoneOverlay";
import type { Slide, AspectRatio } from "@/types/carousel";
import type { Selection, SlideEditorAction } from "./useSlideEditor";

interface CarouselPreviewProps {
  slides: Slide[];
  aspectRatio: AspectRatio;
  activeIndex: number;
  onActiveChange: (index: number) => void;
  showSafeZones?: boolean;
  /** Live editor state — owned by the page so the side panel can read it too. */
  slide: Slide;
  selection: Selection;
  dispatch: (action: SlideEditorAction) => void;
  /** Timestamp updated each time the slide is successfully persisted. */
  savedAt?: number;
}

/**
 * Pure preview surface: shows the active slide on a canvas with hit/resize
 * overlay, plus prev/next navigation. Editor state (selection, dispatch) is
 * lifted to the parent so the right-rail PropertiesPanel can be a sibling
 * inside `#main-editor-area`.
 */
export function CarouselPreview({
  slides,
  aspectRatio,
  activeIndex,
  onActiveChange,
  showSafeZones = false,
  slide,
  selection,
  dispatch,
  savedAt,
}: CarouselPreviewProps) {
  const [prevIndex, setPrevIndex] = useState(activeIndex);
  const [direction, setDirection] = useState(12);
  if (prevIndex !== activeIndex) {
    setDirection(activeIndex >= prevIndex ? 12 : -12);
    setPrevIndex(activeIndex);
  }

  const [hiddenAt, setHiddenAt] = useState(0);
  const showSaved = !!savedAt && savedAt !== hiddenAt;
  useEffect(() => {
    if (!savedAt || savedAt === hiddenAt) return;
    const t = setTimeout(() => setHiddenAt(savedAt), 1800);
    return () => clearTimeout(t);
  }, [savedAt, hiddenAt]);

  return (
    <div className="flex-1 flex min-h-0 min-w-0" id="carousel-preview">
      <div
        className="relative flex-1 flex flex-col min-h-0 min-w-0 bg-[#f0f0f0]"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            dispatch({ type: "SELECT", elementId: null });
          }
        }}
      >
        <div
          className={`pointer-events-none absolute top-3 right-3 z-20 flex items-center gap-1.5 rounded-full bg-emerald-500 text-white text-xs font-medium px-2.5 py-1 shadow-sm transition-all duration-200 ${
            showSaved
              ? "opacity-100 translate-y-0"
              : "opacity-0 -translate-y-1"
          }`}
          aria-live="polite"
        >
          <Check className="h-3.5 w-3.5" />
          <span>Guardado</span>
        </div>
        <div
          className="flex-1 relative min-h-0 p-8 px-14"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              dispatch({ type: "SELECT", elementId: null });
            }
          }}
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onActiveChange(activeIndex - 1)}
            disabled={activeIndex <= 0}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 bg-white/90 shadow-sm hover:bg-white h-9 w-9"
            aria-label="Previous slide"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div
            key={slide.id}
            className="oc-slide-in relative w-full h-full"
            style={{ "--oc-slide-from": `${direction}px` } as CSSProperties}
          >
            <SlideCanvas
              slide={slide}
              aspectRatio={aspectRatio}
              style={{ width: "100%", height: "100%" }}
              overlay={({ scale, canvas }) => (
                <SlideOverlay
                  slide={slide}
                  selection={selection}
                  scale={scale}
                  canvas={canvas}
                  dispatch={dispatch}
                />
              )}
            />
            <SafeZoneOverlay
              aspectRatio={aspectRatio}
              visible={showSafeZones}
            />
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => onActiveChange(activeIndex + 1)}
            disabled={activeIndex >= slides.length - 1}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 bg-white/90 shadow-sm hover:bg-white h-9 w-9"
            aria-label="Next slide"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {slides.length > 1 && (
          <div className="flex items-center justify-center gap-1.5 pb-3 shrink-0">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => onActiveChange(i)}
                className={`h-2 rounded-full transition-[width,background-color] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] ${
                  i === activeIndex
                    ? "w-6 bg-accent"
                    : "w-2 bg-foreground/20 hover:bg-foreground/40"
                }`}
                aria-label={`Go to slide ${i + 1}`}
              />
            ))}
            <span className="text-xs text-muted-foreground ml-2">
              {activeIndex + 1}/{slides.length}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Empty placeholder shown when the carousel has no slides yet. Kept as a
 * named export so the page can render it when `slides.length === 0`.
 */
export function CarouselPreviewEmpty() {
  return (
    <div className="flex-1 flex items-center justify-center bg-[#f0f0f0]">
      <div className="text-center text-muted-foreground p-8">
        <div className="w-16 h-20 border-2 border-dashed border-muted-foreground/30 rounded-lg mx-auto mb-4 flex items-center justify-center">
          <span className="text-2xl opacity-30">+</span>
        </div>
        <p className="text-sm font-medium">No slides yet</p>
        <p className="text-xs mt-1 max-w-[200px]">
          Use the AI assistant to create your first carousel slide
        </p>
      </div>
    </div>
  );
}
