import type { AspectRatio, Slide } from "@/types/carousel";
import { DIMENSIONS } from "@/types/carousel";

export type SerializableSlide = Pick<
  Slide,
  "background" | "elements" | "legacyHtml"
>;
import type {
  BackgroundElement,
  ContainerElement,
  ImageElement,
  SlideElement,
} from "@/types/slide-model";

/**
 * Convert a structured slide to body-only HTML. The output goes through
 * `wrapSlideHtml()` (slide-html.ts), which adds DOCTYPE, viewport, font
 * loading, and the global reset CSS. The same output is used for both:
 *
 *   - preview iframe (live editor)
 *   - Puppeteer screenshot (PNG export)
 *
 * Element ordering in `slide.elements` defines z-index (later = on top).
 *
 * `scssStyles` is treated as native CSS with nesting (`&` selectors). It is
 * scoped via an injected `<style>[data-element-id="ID"] { ... }</style>` block
 * inside the element wrapper.
 *
 * If `slide.legacyHtml` is present, it's returned as-is — escape hatch for
 * slides whose original HTML couldn't be parsed by the migrator.
 */
export function serializeSlideToHtml(
  slide: SerializableSlide,
  aspectRatio: AspectRatio,
): string {
  if (slide.legacyHtml) {
    return slide.legacyHtml;
  }

  const { width, height } = DIMENSIONS[aspectRatio];
  const bgStyles = backgroundCss(slide.background);
  const elementsHtml = slide.elements
    .filter((el) => !el.hidden)
    .map(renderElement)
    .join("\n");

  return `<div data-slide-root style="position: relative; width: ${width}px; height: ${height}px; overflow: hidden; ${bgStyles}">
${elementsHtml}
</div>`;
}

function renderElement(el: SlideElement): string {
  switch (el.kind) {
    case "container":
      return renderContainer(el);
    case "image":
      return renderImage(el);
  }
}

function renderContainer(el: ContainerElement): string {
  const id = escapeAttr(el.id);
  const wrapperStyle = baseWrapperStyle(el);
  const scoped = scopedStyleBlock(el.id, el.scssStyles);
  return `<div data-element-id="${id}" data-element-kind="container" style="${wrapperStyle}">${scoped}${el.htmlContent ?? ""}</div>`;
}

function renderImage(el: ImageElement): string {
  const id = escapeAttr(el.id);
  const wrapperStyle = baseWrapperStyle(el);
  const scoped = scopedStyleBlock(el.id, el.scssStyles);
  return `<div data-element-id="${id}" data-element-kind="image" style="${wrapperStyle}">${scoped}<img src="${escapeAttr(el.src)}" alt="" style="display: block; width: 100%; height: 100%;" /></div>`;
}

function baseWrapperStyle(el: SlideElement): string {
  return [
    "position: absolute",
    `left: ${el.position.x}px`,
    `top: ${el.position.y}px`,
    `width: ${el.size.w}px`,
    `height: ${el.size.h}px`,
    el.rotation ? `transform: rotate(${el.rotation}deg)` : "",
    el.opacity != null ? `opacity: ${el.opacity}` : "",
    "box-sizing: border-box",
  ]
    .filter(Boolean)
    .join("; ");
}

/**
 * Wraps user CSS in an attribute-selector scope so nested selectors target
 * descendants of this element only. We strip `</style` to prevent escaping
 * the style block (the iframe sandbox already blocks `<script>`).
 */
function scopedStyleBlock(id: string, css: string | undefined): string {
  if (!css || !css.trim()) return "";
  const safe = css.replace(/<\/style/gi, "");
  const selector = `[data-element-id="${escapeAttr(id)}"]`;
  return `<style>${selector} { ${safe} }</style>`;
}

function backgroundCss(bg: BackgroundElement): string {
  switch (bg.kind) {
    case "solid":
      return `background: ${bg.color}`;
    case "gradient":
      return `background: ${gradientToCss(bg.angle, bg.stops)}`;
    case "image":
      return `background-image: url('${cssUrl(bg.src)}'); background-size: ${bg.fit}; background-position: center; background-repeat: no-repeat`;
  }
}

function gradientToCss(
  angle: number,
  stops: { offset: number; color: string }[],
): string {
  const stopStr = stops
    .map((s) => `${s.color} ${Math.round(s.offset * 100)}%`)
    .join(", ");
  return `linear-gradient(${angle}deg, ${stopStr})`;
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function cssUrl(value: string): string {
  return value.replace(/'/g, "");
}
