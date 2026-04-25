"use client";

import {
  useMemo,
  useRef,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { wrapSlideHtml } from "@/lib/slide-html";
import { serializeSlideToHtml } from "@/lib/slide-serializer";
import type { AspectRatio, Slide } from "@/types/carousel";
import { DIMENSIONS } from "@/types/carousel";

interface SlideCanvasProps {
  slide: Slide;
  aspectRatio: AspectRatio;
  className?: string;
  style?: React.CSSProperties;
  /**
   * Optional render prop that receives the canvas scale and slide bounds, so
   * the editor overlay can position handles in screen-space using the same
   * coordinate system as the iframe. The overlay is rendered above the
   * iframe inside the same scaled wrapper.
   */
  overlay?: (ctx: { scale: number; canvas: { w: number; h: number } }) => ReactNode;
}

/**
 * Interactive canvas: iframe (read-only pixel renderer) + overlay layer (in
 * the parent, pointer-events enabled). Both derive from the same slide JSON,
 * so handles never need to read the iframe's DOM.
 *
 * The iframe is `sandbox=""` (no JS, no plugins, fully isolated). All editor
 * interactivity happens in the overlay, which is a sibling element scaled
 * with the same factor as the iframe.
 */
export function SlideCanvas({
  slide,
  aspectRatio,
  className,
  style,
  overlay,
}: SlideCanvasProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const { width: slideW, height: slideH } = DIMENSIONS[aspectRatio];

  const srcDoc = useMemo(
    () => wrapSlideHtml(serializeSlideToHtml(slide, aspectRatio), aspectRatio),
    [slide, aspectRatio],
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

  const scale = dims ? Math.min(dims.w / slideW, dims.h / slideH) : 0;
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
            boxShadow:
              "0 4px 24px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08)",
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
          {overlay && (
            <div
              data-slide-overlay
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: slideW * scale,
                height: slideH * scale,
                pointerEvents: "auto",
              }}
            >
              {overlay({ scale, canvas: { w: slideW, h: slideH } })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
