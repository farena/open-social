"use client";

import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import { wrapSlideHtml } from "@/lib/slide-html";
import { serializeSlideToHtml } from "@/lib/slide-serializer";
import type { AspectRatio, Slide } from "@/types/carousel";
import { DIMENSIONS } from "@/types/carousel";

/**
 * The renderer only needs the visual fields. Accepting a Pick lets us reuse
 * it for templates (Omit<Slide, "previousVersions">) and any other reduced
 * slide shape.
 */
type RenderableSlide = Pick<Slide, "background" | "elements" | "legacyHtml">;

interface SlideRendererProps {
  slide: RenderableSlide;
  aspectRatio: AspectRatio;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Read-only renderer: serializes the structured slide to HTML and shows it
 * inside a sandboxed iframe scaled to fit the container. Used for thumbnails
 * (filmstrip), cards (home page), and previews. The interactive editor is
 * SlideCanvas, which composes this renderer with an overlay layer.
 */
export function SlideRenderer({
  slide,
  aspectRatio,
  className,
  style,
}: SlideRendererProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const { width: slideW, height: slideH } = DIMENSIONS[aspectRatio];

  const srcDoc = useMemo(
    () => wrapSlideHtml(serializeSlideToHtml(slide, aspectRatio), aspectRatio),
    [slide, aspectRatio]
  );

  const measure = useCallback(() => {
    const el = outerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setDims({ w: rect.width, h: rect.height });
    }
  }, []);

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => measure());
    obs.observe(el);
    measure();
    return () => obs.disconnect();
  }, [measure]);

  // Calculate scale to fit the slide into the container
  const scale = dims
    ? Math.min(dims.w / slideW, dims.h / slideH)
    : 0;

  const scaledW = Math.floor(slideW * scale);
  const scaledH = Math.floor(slideH * scale);

  return (
    <div
      ref={outerRef}
      className={className}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        ...style,
      }}
    >
      {scale > 0 && (
        <div
          style={{
            width: scaledW,
            height: scaledH,
            overflow: "hidden",
            borderRadius: 8,
            position: "relative",
            boxShadow: "0 4px 24px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08)",
            border: "1px solid rgba(0,0,0,0.06)",
          }}
        >
          <iframe
            sandbox=""
            srcDoc={srcDoc}
            title="Slide preview"
            style={{
              width: slideW,
              height: slideH,
              border: "none",
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              position: "absolute",
              top: 0,
              left: 0,
              pointerEvents: "none",
            }}
          />
        </div>
      )}
    </div>
  );
}
