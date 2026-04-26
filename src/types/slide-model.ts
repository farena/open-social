/**
 * Structured slide model. The JSON shape is the single source of truth — the
 * serializer in `src/lib/slide-serializer.ts` derives the HTML body string,
 * and `wrapSlideHtml` wraps it with the same document chrome used by export.
 *
 * Coordinates are in canvas pixels (e.g. 0..1080 horizontal, 0..1350 vertical
 * for 4:5). The editor overlay never reads the iframe DOM — it computes hit
 * targets, drag deltas and resize anchors from this model.
 *
 * Two element kinds:
 *   - container: arbitrary HTML body with scoped CSS (covers text, shapes,
 *     decorative compositions — anything that's not a raster image)
 *   - image:     a single <img>, with scoped CSS for fit/radius/filters/etc.
 *
 * `scssStyles` is treated as native CSS with nesting (`&` selectors). It is
 * scoped to the element via an injected `<style>[data-element-id="ID"] { … }</style>`
 * block, so authors can write nested rules targeting children of htmlContent.
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

export interface ImageBackground {
  kind: "image";
  src: string;
  fit: "cover" | "contain";
}

export type BackgroundElement = SolidFill | GradientFill | ImageBackground;

export interface ElementBase {
  id: string;
  position: Position;
  size: Size;
  rotation?: number;
  opacity?: number;
  hidden?: boolean;
  /**
   * Native CSS (with nesting via `&`) scoped to this element. Injected as a
   * `<style>[data-element-id="ID"] { ... }</style>` block, so nested selectors
   * target descendants of `htmlContent` (or the `<img>` for image elements).
   *
   * Example (container):
   *   color: white; background: navy;
   *   & h1 { font-size: 96px; font-weight: 900; }
   *   & .pill { display: inline-block; padding: 6px 16px; border-radius: 999px; }
   */
  scssStyles?: string;
}

export interface ContainerElement extends ElementBase {
  kind: "container";
  /**
   * Body HTML rendered inside the element wrapper. May contain any markup
   * (no `<script>` — iframe sandbox blocks JS execution). Use class names and
   * data attributes that `scssStyles` targets via nested rules.
   */
  htmlContent: string;
}

export interface ImageElement extends ElementBase {
  kind: "image";
  src: string;
}

export type SlideElement = ContainerElement | ImageElement;

export type SlideElementKind = SlideElement["kind"];

export interface SlideSnapshot {
  background: BackgroundElement;
  elements: SlideElement[];
  legacyHtml?: string;
}
