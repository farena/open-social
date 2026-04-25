import { parse, type HTMLElement, type Node } from "node-html-parser";
import type { AspectRatio } from "@/types/carousel";
import { DIMENSIONS } from "@/types/carousel";
import type {
  BackgroundElement,
  FontWeight,
  ImageElement,
  ShapeElement,
  SlideElement,
  Span,
  TextElement,
} from "@/types/slide-model";
import { generateId } from "./utils";

/**
 * One-shot HTML → structured slide parser. Best-effort: handles the patterns
 * the previous IA generated (single root with background + position-absolute
 * children) and degrades to `legacyHtml` for anything it can't parse cleanly.
 *
 * Output guarantees:
 *  - Always returns a valid shape: `{ background, elements, legacyHtml? }`
 *  - Never throws (garbage in → solid white bg + legacyHtml = original input)
 *  - Round-trips position-absolute text/image divs with explicit top/left/w/h
 */
export interface ParsedSlide {
  background: BackgroundElement;
  elements: SlideElement[];
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

  let root: HTMLElement;
  try {
    root = parse(html.trim());
  } catch {
    return { background: DEFAULT_BACKGROUND, elements: [], legacyHtml: html };
  }

  // Find the slide root: first element child. If none, fall back.
  const rootEl = firstElementChild(root);
  if (!rootEl) {
    return { background: DEFAULT_BACKGROUND, elements: [], legacyHtml: html };
  }

  const styles = parseStyle(rootEl.getAttribute("style") ?? "");
  const background = extractBackground(styles);
  const canvas = DIMENSIONS[aspectRatio];

  const elements: SlideElement[] = [];
  let parsedAll = true;

  for (const child of childElements(rootEl)) {
    const result = tryParseElement(child, canvas);
    if (result) {
      elements.push(result);
    } else {
      parsedAll = false;
      break;
    }
  }

  // Strict policy: all-or-nothing. If any child fails to parse, we preserve
  // the original HTML so the slide renders identically to before. Partial
  // parsing risks silently dropping content the user expected to see.
  if (!parsedAll) {
    return { background, elements: [], legacyHtml: html };
  }

  return { background, elements };
}

// ---------- background extraction ----------

function extractBackground(styles: Record<string, string>): BackgroundElement {
  const bg = styles.background ?? styles["background-color"];
  const bgImage = styles["background-image"];

  // background-image with linear-gradient
  const gradientSource = bgImage ?? bg;
  if (gradientSource && gradientSource.includes("linear-gradient")) {
    const parsed = parseGradient(gradientSource);
    if (parsed) return parsed;
  }

  // background-image with url()
  if (gradientSource && gradientSource.includes("url(")) {
    const match = gradientSource.match(/url\(['"]?([^'")]+)['"]?\)/);
    if (match) {
      const fit = (styles["background-size"] ?? "cover").includes("contain")
        ? "contain"
        : "cover";
      return { kind: "image", src: match[1], fit };
    }
  }

  // Solid color
  if (bg) {
    const color = extractColor(bg);
    if (color) return { kind: "solid", color };
  }
  if (styles["background-color"]) {
    const color = extractColor(styles["background-color"]);
    if (color) return { kind: "solid", color };
  }

  return DEFAULT_BACKGROUND;
}

function parseGradient(value: string): BackgroundElement | null {
  // linear-gradient(135deg, #2fd9b0 0%, #00c4ee 100%)
  const match = value.match(/linear-gradient\(([^)]+(?:\([^)]*\)[^)]*)*)\)/);
  if (!match) return null;
  const inside = match[1];
  // Split by top-level commas (commas inside rgb(...) shouldn't split)
  const parts = splitTopLevelCommas(inside);
  if (parts.length < 2) return null;

  let angle = 0;
  let stopParts = parts;
  if (/^-?[\d.]+\s*deg$/i.test(parts[0].trim())) {
    angle = parseFloat(parts[0]);
    stopParts = parts.slice(1);
  } else if (/^to\s+/i.test(parts[0].trim())) {
    angle = directionToAngle(parts[0].trim());
    stopParts = parts.slice(1);
  }

  const stops: { offset: number; color: string }[] = [];
  stopParts.forEach((sp, i) => {
    const trimmed = sp.trim();
    const offsetMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*%\s*$/);
    let offset: number;
    if (offsetMatch) {
      offset = parseFloat(offsetMatch[1]) / 100;
    } else {
      offset = stopParts.length === 1 ? 0 : i / (stopParts.length - 1);
    }
    const color = extractColor(trimmed);
    if (color) stops.push({ offset, color });
  });

  if (stops.length < 2) return null;
  return { kind: "gradient", angle, stops };
}

function directionToAngle(dir: string): number {
  const d = dir.toLowerCase();
  if (d.includes("top")) return d.includes("right") ? 45 : d.includes("left") ? 315 : 0;
  if (d.includes("bottom")) return d.includes("right") ? 135 : d.includes("left") ? 225 : 180;
  if (d.includes("right")) return 90;
  if (d.includes("left")) return 270;
  return 180;
}

// ---------- element parsing ----------

function tryParseElement(
  el: HTMLElement,
  canvas: { width: number; height: number },
): SlideElement | null {
  const styles = parseStyle(el.getAttribute("style") ?? "");
  if (styles.position !== "absolute") return null;

  const tag = el.rawTagName?.toLowerCase();

  if (tag === "img") {
    return parseImage(el, styles);
  }

  // If this absolutely-positioned div has a single text-only child div
  // (no further nesting beyond inline tags), promote the parent's box and
  // the child's typography.
  const promoted = promoteSingleTextChild(el);
  const sourceEl = promoted ?? el;
  const sourceStyles = promoted
    ? mergeTypography(styles, parseStyle(promoted.getAttribute("style") ?? ""))
    : styles;

  const innerText = extractText(sourceEl);
  if (innerText.trim().length > 0) {
    return parseText(el, sourceStyles, innerText, canvas);
  }

  // Empty positioned div — maybe a shape if it has bg color and a size
  if (styles.background || styles["background-color"]) {
    return parseShape(el, styles, canvas);
  }

  return null;
}

/**
 * If `el` contains exactly one element child and that child is a text-bearing
 * div without absolute positioning, return the child. The parent contributes
 * the box; the child contributes typography.
 */
function promoteSingleTextChild(el: HTMLElement): HTMLElement | null {
  const children = childElements(el);
  if (children.length !== 1) return null;
  const child = children[0];
  const childTag = child.rawTagName?.toLowerCase();
  if (childTag !== "div" && childTag !== "span" && childTag !== "p") return null;
  const childStyles = parseStyle(child.getAttribute("style") ?? "");
  if (childStyles.position === "absolute") return null;
  // Child must have its own typography (otherwise it's just a wrapper)
  if (
    !childStyles["font-size"] &&
    !childStyles["font-weight"] &&
    !childStyles["color"] &&
    !childStyles["font-family"]
  ) {
    return null;
  }
  return child;
}

/**
 * Combine parent's box-relevant styles with child's typography styles.
 * The child wins on font/color; the parent wins on position/size.
 */
function mergeTypography(
  parent: Record<string, string>,
  child: Record<string, string>,
): Record<string, string> {
  const out = { ...parent };
  for (const key of [
    "font-size",
    "font-weight",
    "font-family",
    "font-style",
    "color",
    "text-align",
    "line-height",
    "letter-spacing",
    "text-decoration",
    "text-transform",
  ]) {
    if (child[key] !== undefined) out[key] = child[key];
  }
  return out;
}

function parseText(
  el: HTMLElement,
  styles: Record<string, string>,
  text: string,
  canvas: { width: number; height: number },
): TextElement | null {
  const box = computeBox(styles, canvas);
  if (!box) return null;

  const fontSize = parsePx(styles["font-size"]) ?? 32;
  const fontWeight = (parseInt(styles["font-weight"] ?? "", 10) || 400) as number;
  const color = extractColor(styles.color ?? "#000000") ?? "#000000";
  const fontFamily = parseFontFamily(styles["font-family"]) ?? "Inter";
  const alignment = parseAlignment(styles["text-align"]);
  const lineHeight = parseLineHeight(styles["line-height"]) ?? 1.2;

  const span: Span = {
    content: text,
    fontFamily,
    fontSize,
    fontWeight: clampFontWeight(fontWeight),
    color,
  };
  if (styles["font-style"] === "italic") span.italic = true;
  if (styles["text-decoration"]?.includes("underline")) span.underline = true;

  return {
    id: generateId(),
    kind: "text",
    position: { x: box.x, y: box.y },
    size: { w: box.w, h: box.h },
    alignment,
    lineHeight,
    spans: [span],
  };
}

function parseImage(
  el: HTMLElement,
  styles: Record<string, string>,
): ImageElement | null {
  const src = el.getAttribute("src");
  if (!src) return null;

  const w = parsePx(styles.width) ?? 100;
  const h = parsePx(styles.height) ?? 100;
  const x = parsePx(styles.left) ?? 0;
  const y = parsePx(styles.top) ?? 0;

  const fit = (styles["object-fit"] ?? "cover").includes("contain")
    ? "contain"
    : "cover";
  const borderRadius = parsePx(styles["border-radius"]);

  return {
    id: generateId(),
    kind: "image",
    position: { x, y },
    size: { w, h },
    src,
    fit,
    borderRadius,
  };
}

function parseShape(
  el: HTMLElement,
  styles: Record<string, string>,
  canvas: { width: number; height: number },
): ShapeElement | null {
  const box = computeBox(styles, canvas);
  if (!box) return null;

  const bgValue = styles.background ?? styles["background-color"] ?? "#000";
  const gradient = bgValue.includes("linear-gradient")
    ? parseGradient(bgValue)
    : null;

  const fill =
    gradient && gradient.kind === "gradient"
      ? gradient
      : { kind: "solid" as const, color: extractColor(bgValue) ?? "#000000" };

  const radiusPx = parsePx(styles["border-radius"]);
  const isCircle =
    styles["border-radius"]?.includes("50%") ||
    (radiusPx != null && radiusPx >= Math.min(box.w, box.h) / 2);

  return {
    id: generateId(),
    kind: "shape",
    position: { x: box.x, y: box.y },
    size: { w: box.w, h: box.h },
    shape: isCircle ? "circle" : "rect",
    fill,
    borderRadius: radiusPx,
  };
}

// ---------- style + layout helpers ----------

function computeBox(
  styles: Record<string, string>,
  canvas: { width: number; height: number },
): { x: number; y: number; w: number; h: number } | null {
  const top = parsePx(styles.top);
  const left = parsePx(styles.left);
  const right = parsePx(styles.right);
  const bottom = parsePx(styles.bottom);
  const width = parsePx(styles.width);
  const height = parsePx(styles.height);

  let x: number | undefined;
  let y: number | undefined;
  let w = width;
  let h = height;

  // Horizontal: prefer left, then derive from right.
  if (left != null) {
    x = left;
    if (w == null && right != null) w = canvas.width - left - right;
  } else if (right != null) {
    if (w != null) {
      x = canvas.width - right - w;
    } else {
      // right-only without width — text can wrap to the natural max width.
      // We anchor x at right margin; size will fall through to defaults.
      x = Math.max(0, right);
      w = canvas.width - x - right;
    }
  }

  // Vertical: prefer top, then derive from bottom.
  if (top != null) {
    y = top;
    if (h == null && bottom != null) h = canvas.height - top - bottom;
  } else if (bottom != null) {
    if (h != null) {
      y = canvas.height - bottom - h;
    } else {
      y = Math.max(0, bottom);
      h = canvas.height - y - bottom;
    }
  }

  if (x == null || y == null) return null;

  // Final fallbacks
  if (w == null || w <= 0) w = Math.max(canvas.width - x - 40, 100);
  if (h == null || h <= 0) h = 100;

  return { x, y, w, h };
}

function parsePx(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const match = value.trim().match(/^(-?[\d.]+)\s*px$/);
  if (match) return parseFloat(match[1]);
  // Bare number (e.g. "0")
  const bare = value.trim().match(/^(-?[\d.]+)$/);
  if (bare) return parseFloat(bare[1]);
  return undefined;
}

function parseFontFamily(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const first = value.split(",")[0].trim().replace(/['"]/g, "");
  return first || undefined;
}

function parseAlignment(value: string | undefined): "left" | "center" | "right" {
  if (value === "center") return "center";
  if (value === "right") return "right";
  return "left";
}

function parseLineHeight(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (trimmed.endsWith("px")) {
    const px = parsePx(trimmed);
    return px ? px / 16 : undefined; // approximate
  }
  const num = parseFloat(trimmed);
  return Number.isFinite(num) ? num : undefined;
}

function clampFontWeight(weight: number): FontWeight {
  const allowed: FontWeight[] = [300, 400, 500, 600, 700, 800, 900];
  return allowed.reduce((closest, current) =>
    Math.abs(current - weight) < Math.abs(closest - weight) ? current : closest,
  );
}

function extractColor(value: string): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  // Hex
  const hex = trimmed.match(/#[0-9a-fA-F]{3,8}/);
  if (hex) return hex[0];
  // rgb / rgba
  const rgb = trimmed.match(/rgba?\(([^)]+)\)/);
  if (rgb) {
    const parts = rgb[1].split(",").map((p) => parseFloat(p.trim()));
    if (parts.length >= 3) {
      const r = Math.round(parts[0]).toString(16).padStart(2, "0");
      const g = Math.round(parts[1]).toString(16).padStart(2, "0");
      const b = Math.round(parts[2]).toString(16).padStart(2, "0");
      return `#${r}${g}${b}`;
    }
  }
  // Named colors — accept a small set
  const named: Record<string, string> = {
    white: "#ffffff",
    black: "#000000",
    red: "#ff0000",
    green: "#00ff00",
    blue: "#0000ff",
    transparent: "#00000000",
  };
  return named[trimmed.toLowerCase()] ?? null;
}

function parseStyle(style: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const decl of style.split(";")) {
    const idx = decl.indexOf(":");
    if (idx === -1) continue;
    const key = decl.slice(0, idx).trim().toLowerCase();
    const value = decl.slice(idx + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

function splitTopLevelCommas(input: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      out.push(input.slice(start, i));
      start = i + 1;
    }
  }
  out.push(input.slice(start));
  return out;
}

function firstElementChild(node: Node): HTMLElement | null {
  for (const c of node.childNodes) {
    if ((c as HTMLElement).rawTagName) return c as HTMLElement;
  }
  return null;
}

function childElements(el: HTMLElement): HTMLElement[] {
  return el.childNodes.filter(
    (n) => (n as HTMLElement).rawTagName,
  ) as HTMLElement[];
}

/**
 * Extract text content with <br/> converted to newlines.
 * Only considers direct text — does not recurse into nested element children
 * with their own positioning.
 */
function extractText(el: HTMLElement): string {
  let out = "";
  walk(el);
  return out.replace(/\s+\n/g, "\n").replace(/\n\s+/g, "\n").trim();

  function walk(node: Node): void {
    for (const c of node.childNodes) {
      const tag = (c as HTMLElement).rawTagName?.toLowerCase();
      if (tag === "br") {
        out += "\n";
      } else if (tag) {
        // Recurse into spans/strong/em/etc but skip nested positioned divs
        const childStyles = parseStyle(
          (c as HTMLElement).getAttribute?.("style") ?? "",
        );
        if (childStyles.position === "absolute") continue;
        walk(c);
      } else {
        out += (c as { rawText?: string }).rawText ?? "";
      }
    }
  }
}
