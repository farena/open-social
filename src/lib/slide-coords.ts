import type { Position, Size } from "@/types/slide-model";

/**
 * Coordinate helpers for the editor overlay.
 *
 * All editor math derives from the JSON model: the iframe DOM is never read.
 * The overlay positions handles by computing canvas-space → screen-space via
 * a single uniform scale factor (the same one applied to the iframe via
 * CSS transform).
 */

export interface Canvas {
  w: number;
  h: number;
}

/**
 * Snap a value to the nearest multiple of `step` (default 4px). Use during
 * drag/resize to keep elements on a soft grid.
 */
export function snapToGrid(value: number, step = 4): number {
  return Math.round(value / step) * step;
}

/**
 * Clamp an element's position so it stays at least partially inside the
 * canvas. We allow elements to extend beyond the right/bottom edge so users
 * can intentionally place things off-frame, but we don't allow them to be
 * fully off-screen.
 */
export function clampToCanvas(
  position: Position,
  size: { w: number; h: number | "auto" },
  canvas: Canvas,
  margin = 40,
): Position {
  const h = size.h === "auto" ? margin : size.h;
  return {
    x: Math.max(-size.w + margin, Math.min(canvas.w - margin, position.x)),
    y: Math.max(-h + margin, Math.min(canvas.h - margin, position.y)),
  };
}

/**
 * Convert a screen-space point (e.g. pointer event coords relative to the
 * canvas container) to canvas-space pixels.
 */
export function screenToCanvas(
  screenPoint: Position,
  scale: number,
  origin: Position = { x: 0, y: 0 },
): Position {
  return {
    x: (screenPoint.x - origin.x) / scale,
    y: (screenPoint.y - origin.y) / scale,
  };
}

/**
 * Convert canvas-space coordinates to screen-space (where the overlay's
 * absolute-positioned divs live).
 */
export function canvasToScreen(
  canvasPoint: Position,
  scale: number,
  origin: Position = { x: 0, y: 0 },
): Position {
  return {
    x: canvasPoint.x * scale + origin.x,
    y: canvasPoint.y * scale + origin.y,
  };
}

/**
 * Apply a delta in screen-space to an element's canvas-space position.
 * Returns a new position; does not mutate.
 */
export function translatePosition(
  position: Position,
  deltaScreen: Position,
  scale: number,
): Position {
  return {
    x: position.x + deltaScreen.x / scale,
    y: position.y + deltaScreen.y / scale,
  };
}

export type ResizeAnchor =
  | "nw"
  | "n"
  | "ne"
  | "e"
  | "se"
  | "s"
  | "sw"
  | "w";

interface ResizeResult {
  position: Position;
  size: Size;
}

/**
 * Compute the new position+size for a resize from a given anchor handle.
 * `delta` is in canvas-space pixels (caller has already divided by scale).
 *
 * If `preserveRatio` is true (Shift held), the smaller dimension scales to
 * match the larger one.
 */
export function resizeFromAnchor(
  position: Position,
  size: Size,
  anchor: ResizeAnchor,
  delta: Position,
  preserveRatio = false,
  minSize = 8,
): ResizeResult {
  let { x, y } = position;
  let { w, h } = size;

  switch (anchor) {
    case "nw":
      x += delta.x;
      y += delta.y;
      w -= delta.x;
      h -= delta.y;
      break;
    case "n":
      y += delta.y;
      h -= delta.y;
      break;
    case "ne":
      y += delta.y;
      w += delta.x;
      h -= delta.y;
      break;
    case "e":
      w += delta.x;
      break;
    case "se":
      w += delta.x;
      h += delta.y;
      break;
    case "s":
      h += delta.y;
      break;
    case "sw":
      x += delta.x;
      w -= delta.x;
      h += delta.y;
      break;
    case "w":
      x += delta.x;
      w -= delta.x;
      break;
  }

  if (preserveRatio) {
    const ratio = size.w / size.h;
    // Preserve aspect ratio based on which delta was larger.
    if (Math.abs(delta.x) >= Math.abs(delta.y)) {
      const newH = w / ratio;
      // adjust y if anchor is on the top edge
      if (anchor === "nw" || anchor === "ne" || anchor === "n") {
        y = position.y + (size.h - newH);
      }
      h = newH;
    } else {
      const newW = h * ratio;
      if (anchor === "nw" || anchor === "sw" || anchor === "w") {
        x = position.x + (size.w - newW);
      }
      w = newW;
    }
  }

  if (w < minSize) w = minSize;
  if (h < minSize) h = minSize;

  return { position: { x, y }, size: { w, h } };
}
