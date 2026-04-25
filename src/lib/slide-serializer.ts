import type { AspectRatio, Slide } from "@/types/carousel";
import { DIMENSIONS } from "@/types/carousel";

export type SerializableSlide = Pick<
  Slide,
  "background" | "elements" | "legacyHtml"
>;
import type {
  BackgroundElement,
  ElementFill,
  ImageElement,
  ShapeElement,
  Span,
  TextElement,
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
 * That guarantees pixel-perfect parity between what the user sees and what
 * gets exported.
 *
 * Element ordering in `slide.elements` defines z-index (later = on top).
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
  const elementsHtml = slide.elements.map(renderElement).join("\n");

  return `<div data-slide-root style="position: relative; width: ${width}px; height: ${height}px; overflow: hidden; ${bgStyles}">
${elementsHtml}
</div>`;
}

function renderElement(el: SlideElement): string {
  switch (el.kind) {
    case "text":
      return renderText(el);
    case "image":
      return renderImage(el);
    case "shape":
      return renderShape(el);
  }
}

function renderText(el: TextElement): string {
  const wrapperStyles = [
    "position: absolute",
    `left: ${el.position.x}px`,
    `top: ${el.position.y}px`,
    `width: ${el.size.w}px`,
    el.size.h === "auto" ? "" : `height: ${el.size.h}px`,
    "display: flex",
    "flex-direction: column",
    `justify-content: ${alignmentToFlex(el.alignment, "vertical")}`,
    `text-align: ${el.alignment}`,
    `line-height: ${el.lineHeight}`,
    el.letterSpacing != null ? `letter-spacing: ${el.letterSpacing}px` : "",
    el.rotation ? `transform: rotate(${el.rotation}deg)` : "",
    el.opacity != null ? `opacity: ${el.opacity}` : "",
  ]
    .filter(Boolean)
    .join("; ");

  const inner = el.spans.map(renderSpan).join("");

  return `<div data-element-id="${escapeAttr(el.id)}" data-element-kind="text" style="${wrapperStyles}"><div>${inner}</div></div>`;
}

function renderSpan(span: Span): string {
  const styles = [
    `font-family: '${cssString(span.fontFamily)}'`,
    `font-size: ${span.fontSize}px`,
    `font-weight: ${span.fontWeight}`,
    `color: ${span.color}`,
    span.italic ? "font-style: italic" : "",
    span.underline ? "text-decoration: underline" : "",
  ]
    .filter(Boolean)
    .join("; ");
  return `<span style="${styles}">${escapeText(span.content)}</span>`;
}

function renderImage(el: ImageElement): string {
  const wrapperStyles = baseElementStyles(el);
  const imgStyles = [
    "width: 100%",
    "height: 100%",
    `object-fit: ${el.fit}`,
    "display: block",
    el.borderRadius != null ? `border-radius: ${el.borderRadius}px` : "",
  ]
    .filter(Boolean)
    .join("; ");

  return `<div data-element-id="${escapeAttr(el.id)}" data-element-kind="image" style="${wrapperStyles}; ${
    el.borderRadius != null ? `border-radius: ${el.borderRadius}px; overflow: hidden;` : ""
  }"><img src="${escapeAttr(el.src)}" alt="" style="${imgStyles}" /></div>`;
}

function renderShape(el: ShapeElement): string {
  const radiusValue =
    el.shape === "circle"
      ? "50%"
      : el.borderRadius != null
        ? `${el.borderRadius}px`
        : "0";

  const styles = [
    baseElementStyles(el),
    `background: ${fillToCss(el.fill)}`,
    `border-radius: ${radiusValue}`,
    el.border ? `border: ${el.border.width}px solid ${el.border.color}` : "",
  ]
    .filter(Boolean)
    .join("; ");

  return `<div data-element-id="${escapeAttr(el.id)}" data-element-kind="shape" style="${styles}"></div>`;
}

function baseElementStyles(
  el: ImageElement | ShapeElement,
): string {
  return [
    "position: absolute",
    `left: ${el.position.x}px`,
    `top: ${el.position.y}px`,
    `width: ${el.size.w}px`,
    `height: ${el.size.h}px`,
    el.rotation ? `transform: rotate(${el.rotation}deg)` : "",
    el.opacity != null ? `opacity: ${el.opacity}` : "",
  ]
    .filter(Boolean)
    .join("; ");
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

function fillToCss(fill: ElementFill): string {
  if (fill.kind === "solid") return fill.color;
  return gradientToCss(fill.angle, fill.stops);
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

function alignmentToFlex(
  alignment: "left" | "center" | "right",
  axis: "vertical",
): string {
  // Vertical centering of inner block by default. If callers need other
  // vertical alignment in V2, expand here.
  if (axis === "vertical") return "center";
  if (alignment === "left") return "flex-start";
  if (alignment === "right") return "flex-end";
  return "center";
}

function escapeText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function cssString(value: string): string {
  // Strip single quotes — we wrap font names in single quotes.
  return value.replace(/'/g, "");
}

function cssUrl(value: string): string {
  return value.replace(/'/g, "");
}
