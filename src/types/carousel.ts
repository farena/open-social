import type {
  BackgroundElement,
  SlideElement,
  SlideSnapshot,
} from "./slide-model";

export type AspectRatio = "1:1" | "4:5" | "9:16";

/**
 * Structured slide. `background` + `elements` are the editable model;
 * `legacyHtml` is an escape hatch for slides whose HTML couldn't be parsed
 * during the one-shot migration — they render as-is and aren't editable
 * visually until re-created.
 */
export interface Slide {
  id: string;
  order: number;
  notes: string;
  background: BackgroundElement;
  elements: SlideElement[];
  legacyHtml?: string;
  previousVersions: SlideSnapshot[];
  nextVersions: SlideSnapshot[];
}

export interface ReferenceImage {
  id: string;
  url: string;       // e.g. "/uploads/abc.png"
  absPath: string;    // absolute path for Claude to Read
  name: string;       // original filename or description
  addedAt: string;
}

export const DIMENSIONS: Record<AspectRatio, { width: number; height: number }> = {
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
  "9:16": { width: 1080, height: 1920 },
};

export const MAX_SLIDES = 20;
export const MAX_VERSIONS = 5;
