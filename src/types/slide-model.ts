/**
 * Structured slide model. The JSON shape is the single source of truth — the
 * serializer in `src/lib/slide-serializer.ts` derives the HTML body string,
 * and `wrapSlideHtml` wraps it with the same document chrome used by export.
 *
 * Coordinates are in canvas pixels (e.g. 0..1080 horizontal, 0..1350 vertical
 * for 4:5). The editor overlay never reads the iframe DOM — it computes hit
 * targets, drag deltas and resize anchors from this model.
 */

export type Hex = string;

export interface Position {
  x: number;
  y: number;
}

export interface Size {
  w: number;
  h: number;
}

export type FontWeight = 300 | 400 | 500 | 600 | 700 | 800 | 900;

export type TextAlignment = "left" | "center" | "right";

export type ImageFit = "cover" | "contain";

export type ShapeKind = "rect" | "circle";

export interface SolidFill {
  kind: "solid";
  color: Hex;
}

export interface GradientStop {
  offset: number;
  color: Hex;
}

export interface GradientFill {
  kind: "gradient";
  angle: number;
  stops: GradientStop[];
}

export type ElementFill = SolidFill | GradientFill;

export interface ImageBackground {
  kind: "image";
  src: string;
  fit: ImageFit;
}

export type BackgroundElement = SolidFill | GradientFill | ImageBackground;

export interface ElementBase {
  id: string;
  position: Position;
  rotation?: number;
  opacity?: number;
}

export interface Span {
  content: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: FontWeight;
  color: Hex;
  italic?: boolean;
  underline?: boolean;
}

export interface TextElement extends ElementBase {
  kind: "text";
  size: { w: number; h: number | "auto" };
  alignment: TextAlignment;
  lineHeight: number;
  letterSpacing?: number;
  spans: Span[];
}

export interface ImageElement extends ElementBase {
  kind: "image";
  size: Size;
  src: string;
  fit: ImageFit;
  borderRadius?: number;
}

export interface ShapeBorder {
  width: number;
  color: Hex;
}

export interface ShapeElement extends ElementBase {
  kind: "shape";
  size: Size;
  shape: ShapeKind;
  fill: ElementFill;
  border?: ShapeBorder;
  borderRadius?: number;
}

export type SlideElement = TextElement | ImageElement | ShapeElement;

export type SlideElementKind = SlideElement["kind"];

export interface SlideSnapshot {
  background: BackgroundElement;
  elements: SlideElement[];
  legacyHtml?: string;
}
