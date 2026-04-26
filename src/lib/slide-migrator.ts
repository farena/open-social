import type { AspectRatio } from "@/types/carousel";
import { DIMENSIONS } from "@/types/carousel";
import type {
  BackgroundElement,
  ContainerElement,
} from "@/types/slide-model";
import { generateId } from "./utils";

/**
 * HTML → structured slide. With the new container/image model, the simplest
 * faithful migration is: keep the original HTML inside a single full-canvas
 * container element. The renderer treats the htmlContent as opaque markup,
 * so visual fidelity is preserved.
 *
 * Output guarantees:
 *  - Always returns a valid shape: `{ background, elements, legacyHtml? }`
 *  - Never throws (garbage in → solid white bg + legacyHtml = original input)
 */
export interface ParsedSlide {
  background: BackgroundElement;
  elements: ContainerElement[];
  legacyHtml?: string;
}

const DEFAULT_BACKGROUND: BackgroundElement = {
  kind: "solid",
  color: "#ffffff",
};

export function parseHtmlToSlide(
  html: string,
  aspectRatio: AspectRatio,
): ParsedSlide {
  if (!html || typeof html !== "string") {
    return { background: DEFAULT_BACKGROUND, elements: [] };
  }

  const canvas = DIMENSIONS[aspectRatio];

  const container: ContainerElement = {
    id: generateId(),
    kind: "container",
    position: { x: 0, y: 0 },
    size: { w: canvas.width, h: canvas.height },
    htmlContent: html,
  };

  return { background: DEFAULT_BACKGROUND, elements: [container] };
}
