import { generateId } from "./utils";
import type {
  BackgroundElement,
  ContainerElement,
  ImageElement,
  SlideElement,
} from "@/types/slide-model";
import type { Slide, AspectRatio } from "@/types/carousel";
import { DIMENSIONS } from "@/types/carousel";

/**
 * Factories for creating valid elements with sensible defaults. Used by:
 *   - editor: when the user clicks "+ Add element" in the properties panel
 *   - migrator: as fallback when parsing fails partially
 *   - tests: as fixtures
 *
 * All sizes/positions are in canvas pixels (top-left origin).
 */

export function createDefaultBackground(): BackgroundElement {
  return { kind: "solid", color: "#ffffff" };
}

interface CreateContainerOptions {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  htmlContent?: string;
  scssStyles?: string;
}

export function createContainerElement(
  opts: CreateContainerOptions = {},
): ContainerElement {
  return {
    id: generateId(),
    kind: "container",
    position: { x: opts.x ?? 100, y: opts.y ?? 100 },
    size: { w: opts.w ?? 600, h: opts.h ?? 200 },
    htmlContent:
      opts.htmlContent ?? `<div class="content">Tu contenido</div>`,
    scssStyles:
      opts.scssStyles ??
      `display: flex; align-items: center; justify-content: flex-start;\n& .content { font-family: 'Inter', sans-serif; font-size: 48px; font-weight: 700; color: #111; }`,
  };
}

interface CreateImageOptions {
  src: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  scssStyles?: string;
}

export function createImageElement(opts: CreateImageOptions): ImageElement {
  return {
    id: generateId(),
    kind: "image",
    position: { x: opts.x ?? 100, y: opts.y ?? 100 },
    size: { w: opts.w ?? 400, h: opts.h ?? 400 },
    src: opts.src,
    scssStyles: opts.scssStyles ?? `& img { object-fit: cover; }`,
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
    nextVersions: [],
  };
}

/**
 * Builds a duplicate of an element with a fresh id and a small offset.
 */
export function duplicateElement(el: SlideElement, offset = 20): SlideElement {
  return {
    ...el,
    id: generateId(),
    position: { x: el.position.x + offset, y: el.position.y + offset },
  } as SlideElement;
}

export function canvasFor(aspectRatio: AspectRatio): { w: number; h: number } {
  const { width, height } = DIMENSIONS[aspectRatio];
  return { w: width, h: height };
}
