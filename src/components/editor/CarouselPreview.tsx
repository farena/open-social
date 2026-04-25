"use client";

import { useEffect, useRef, useCallback, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SlideCanvas } from "./SlideCanvas";
import { SlideOverlay } from "./SlideOverlay";
import { SafeZoneOverlay } from "./SafeZoneOverlay";
import { useSlideEditor } from "./useSlideEditor";
import type { Slide, AspectRatio } from "@/types/carousel";

interface CarouselPreviewProps {
  carouselId: string;
  slides: Slide[];
  aspectRatio: AspectRatio;
  activeIndex: number;
  onActiveChange: (index: number) => void;
  showSafeZones?: boolean;
  /**
   * Called after the editor's debounced persist so the page can update its
   * carousel state with the server response.
   */
  onSlidePersisted?: (slide: Slide) => void;
}

export function CarouselPreview({
  carouselId,
  slides,
  aspectRatio,
  activeIndex,
  onActiveChange,
  showSafeZones = false,
  onSlidePersisted,
}: CarouselPreviewProps) {
  const slide = slides[activeIndex];
  const prevIndexRef = useRef(activeIndex);
  const direction = activeIndex >= prevIndexRef.current ? 12 : -12;
  useEffect(() => {
    prevIndexRef.current = activeIndex;
  }, [activeIndex]);

  if (!slide) {
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

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-[#f0f0f0]">
      <div className="flex-1 relative min-h-0 p-8 px-14">
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
          <EditableSlide
            carouselId={carouselId}
            slide={slide}
            aspectRatio={aspectRatio}
            onSlidePersisted={onSlidePersisted}
          />
          <SafeZoneOverlay aspectRatio={aspectRatio} visible={showSafeZones} />
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
  );
}

interface EditableSlideProps {
  carouselId: string;
  slide: Slide;
  aspectRatio: AspectRatio;
  onSlidePersisted?: (slide: Slide) => void;
}

function EditableSlide({
  carouselId,
  slide: externalSlide,
  aspectRatio,
  onSlidePersisted,
}: EditableSlideProps) {
  const persist = useCallback(
    async (slide: Slide) => {
      const res = await fetch(
        `/api/carousels/${carouselId}/slides/${slide.id}`,
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
    [carouselId, onSlidePersisted],
  );

  const { slide, selection, dispatch } = useSlideEditor(externalSlide, {
    onPersist: persist,
  });

  return (
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
  );
}
