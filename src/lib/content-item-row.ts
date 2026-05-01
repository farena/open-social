/**
 * Row (de)serialization helpers between SQLite rows and ContentItem/Slide types.
 *
 * - `contentItemToRow` / `slideToRow`: TS → SQL row (JSON.stringify for array/object columns)
 * - `rowToContentItem` / `rowToSlide`: SQL row → TS (JSON.parse, omit null columns)
 * - `serializeContentItem` / `deserializeContentItem`: convenience wrappers
 *
 * Column names follow the SQL schema exactly (snake_case strings as TS keys).
 * Zod validation on deserialization is gated on `process.env.NODE_ENV !== "production"`.
 */

import type { ContentItem } from "@/types/content-item";
import type { Slide } from "@/types/carousel";
import { contentItemSchema } from "@/lib/content-item-schema";

// ---------------------------------------------------------------------------
// Row types — mirror SQL column names exactly (snake_case)
// ---------------------------------------------------------------------------

export interface ContentItemRow {
  id: string;
  type: string;
  state: string;
  aspect_ratio: string;
  hook: string;
  body_idea: string;
  caption: string;
  hashtags: string; // JSON array
  notes: string | null;
  chat_session_id: string | null;
  reference_images: string | null; // JSON array
  assets: string | null; // JSON array
  tags: string | null; // JSON array
  created_at: string;
  updated_at: string;
  generated_at: string | null;
}

export interface SlideRow {
  id: string;
  content_item_id: string;
  slide_order: number;
  notes: string;
  background: string; // JSON object
  elements: string; // JSON array
  legacy_html: string | null;
  previous_versions: string; // JSON array
  next_versions: string; // JSON array
}

// ---------------------------------------------------------------------------
// Serialization: ContentItem → rows
// ---------------------------------------------------------------------------

export function contentItemToRow(item: ContentItem): ContentItemRow {
  return {
    id: item.id,
    type: item.type,
    state: item.state,
    aspect_ratio: item.aspectRatio,
    hook: item.hook,
    body_idea: item.bodyIdea,
    caption: item.caption,
    hashtags: JSON.stringify(item.hashtags),
    notes: item.notes ?? null,
    chat_session_id: item.chatSessionId ?? null,
    reference_images:
      item.referenceImages !== undefined
        ? JSON.stringify(item.referenceImages)
        : null,
    assets:
      item.assets !== undefined ? JSON.stringify(item.assets) : null,
    tags: item.tags !== undefined ? JSON.stringify(item.tags) : null,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
    generated_at: item.generatedAt ?? null,
  };
}

export function slideToRow(
  slide: Slide,
  contentItemId: string,
  order: number,
): SlideRow {
  return {
    id: slide.id,
    content_item_id: contentItemId,
    slide_order: order,
    notes: slide.notes,
    background: JSON.stringify(slide.background),
    elements: JSON.stringify(slide.elements),
    legacy_html: slide.legacyHtml ?? null,
    previous_versions: JSON.stringify(slide.previousVersions),
    next_versions: JSON.stringify(slide.nextVersions),
  };
}

// ---------------------------------------------------------------------------
// Deserialization: rows → ContentItem
// ---------------------------------------------------------------------------

export function rowToSlide(row: SlideRow): Slide {
  const slide: Slide = {
    id: row.id,
    order: row.slide_order,
    notes: row.notes,
    background: JSON.parse(row.background),
    elements: JSON.parse(row.elements),
    previousVersions: JSON.parse(row.previous_versions),
    nextVersions: JSON.parse(row.next_versions),
  };

  // Omit legacyHtml entirely when null — do not set key to null
  if (row.legacy_html !== null) {
    slide.legacyHtml = row.legacy_html;
  }

  return slide;
}

export function rowToContentItem(
  row: ContentItemRow,
  slideRows: SlideRow[],
): ContentItem {
  const slides = slideRows
    .slice()
    .sort((a, b) => a.slide_order - b.slide_order)
    .map(rowToSlide);

  // Build the object without optional fields; add them only when non-null
  const item: ContentItem = {
    id: row.id,
    type: row.type as ContentItem["type"],
    state: row.state as ContentItem["state"],
    hook: row.hook,
    bodyIdea: row.body_idea,
    caption: row.caption,
    hashtags: JSON.parse(row.hashtags),
    aspectRatio: row.aspect_ratio as ContentItem["aspectRatio"],
    slides,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  if (row.notes !== null) item.notes = row.notes;
  if (row.chat_session_id !== null) item.chatSessionId = row.chat_session_id;
  if (row.reference_images !== null)
    item.referenceImages = JSON.parse(row.reference_images);
  if (row.assets !== null) item.assets = JSON.parse(row.assets);
  if (row.tags !== null) item.tags = JSON.parse(row.tags);
  if (row.generated_at !== null) item.generatedAt = row.generated_at;

  return item;
}

// ---------------------------------------------------------------------------
// Convenience wrappers
// ---------------------------------------------------------------------------

export interface SerializedContentItem {
  itemRow: ContentItemRow;
  slideRows: SlideRow[];
}

export function serializeContentItem(
  item: ContentItem,
): SerializedContentItem {
  const itemRow = contentItemToRow(item);
  const slideRows = item.slides.map((slide, index) =>
    slideToRow(slide, item.id, index),
  );
  return { itemRow, slideRows };
}

export function deserializeContentItem(
  row: ContentItemRow,
  slideRows: SlideRow[],
): ContentItem {
  const item = rowToContentItem(row, slideRows);

  // Validate in dev and test environments (not in production)
  if (process.env.NODE_ENV !== "production") {
    contentItemSchema.parse(item);
  }

  return item;
}
