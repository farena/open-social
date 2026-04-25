import { generateId } from "./utils";
import type {
  BackgroundElement,
  ImageElement,
  ShapeElement,
  Span,
  TextElement,
  SlideElement,
} from "@/types/slide-model";
import type { Slide, AspectRatio } from "@/types/carousel";
import { DIMENSIONS } from "@/types/carousel";

/**
 * Factories for creating valid elements with sensible defaults. Used by
 * - editor: when the user clicks "+ Add element" in the properties panel
 * - migrator: as fallback when parsing fails partially
 * - tests: as fixtures
 *
 * All sizes/positions are in canvas pixels (top-left origin). Callers are
 * responsible for clamping to canvas via `slide-coords.clampToCanvas`.
 */

export function createDefaultBackground(): BackgroundElement {
  return { kind: "solid", color: "#ffffff" };
}

export function createSpan(content: string, overrides: Partial<Span> = {}): Span {
  return {
    content,
    fontFamily: overrides.fontFamily ?? "Inter",
    fontSize: overrides.fontSize ?? 48,
    fontWeight: overrides.fontWeight ?? 600,
    color: overrides.color ?? "#111111",
    italic: overrides.italic,
    underline: overrides.underline,
  };
}

interface CreateTextOptions {
  x?: number;
  y?: number;
  w?: number;
  content?: string;
  span?: Partial<Span>;
}

export function createTextElement(opts: CreateTextOptions = {}): TextElement {
  return {
    id: generateId(),
    kind: "text",
    position: { x: opts.x ?? 100, y: opts.y ?? 100 },
    size: { w: opts.w ?? 880, h: "auto" },
    alignment: "left",
    lineHeight: 1.2,
    spans: [createSpan(opts.content ?? "Tu texto", opts.span)],
  };
}

interface CreateImageOptions {
  src: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

export function createImageElement(opts: CreateImageOptions): ImageElement {
  return {
    id: generateId(),
    kind: "image",
    position: { x: opts.x ?? 100, y: opts.y ?? 100 },
    size: { w: opts.w ?? 400, h: opts.h ?? 400 },
    src: opts.src,
    fit: "cover",
  };
}

interface CreateShapeOptions {
  shape?: "rect" | "circle";
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  color?: string;
}

export function createShapeElement(opts: CreateShapeOptions = {}): ShapeElement {
  const shape = opts.shape ?? "rect";
  const w = opts.w ?? 200;
  const h = opts.h ?? 200;
  return {
    id: generateId(),
    kind: "shape",
    position: { x: opts.x ?? 100, y: opts.y ?? 100 },
    size: { w, h },
    shape,
    fill: { kind: "solid", color: opts.color ?? "#2fd9b0" },
    borderRadius: shape === "circle" ? Math.min(w, h) / 2 : undefined,
  };
}

/**
 * Returns a fresh slide with no elements and a white background. The order
 * field is set by the caller (carousels.ts uses slides.length).
 */
export function createEmptyStructuredSlide(notes = ""): Omit<Slide, "order"> {
  return {
    id: generateId(),
    notes,
    background: createDefaultBackground(),
    elements: [],
    previousVersions: [],
  };
}

/**
 * Builds a duplicate of an element with a fresh id and a small offset. Used
 * by the editor's Cmd+D shortcut.
 */
export function duplicateElement(el: SlideElement, offset = 20): SlideElement {
  const base = {
    ...el,
    id: generateId(),
    position: { x: el.position.x + offset, y: el.position.y + offset },
  } as SlideElement;
  return base;
}

/**
 * Returns the canvas dimensions for a given aspect ratio. Convenience wrapper.
 */
export function canvasFor(aspectRatio: AspectRatio): { w: number; h: number } {
  const { width, height } = DIMENSIONS[aspectRatio];
  return { w: width, h: height };
}
