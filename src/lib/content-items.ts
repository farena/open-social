import { getDb } from "./db";
import {
  contentItemToRow,
  slideToRow,
  rowToContentItem,
  type ContentItemRow,
  type SlideRow,
} from "./content-item-row";
import { generateId, now } from "./utils";
import type { ContentItem } from "@/types/content-item";
import { DEFAULT_ASPECT_RATIO_FOR_TYPE, MAX_SLIDES } from "@/types/content-item";
import type { Slide, ReferenceImage } from "@/types/carousel";
import { MAX_VERSIONS } from "@/types/carousel";
import type { Asset } from "@/types/asset";
import type {
  BackgroundElement,
  Position,
  Size,
  SlideElement,
  SlideSnapshot,
} from "@/types/slide-model";
import {
  newContentItemInputSchema,
  contentItemPatchSchema,
} from "./content-item-schema";
import type { z } from "zod";

export type NewContentItemInput = z.infer<typeof newContentItemInputSchema>;
export type ContentItemPatch = z.infer<typeof contentItemPatchSchema>;

export interface SlideInput {
  background: BackgroundElement;
  elements: SlideElement[];
  legacyHtml?: string;
  notes?: string;
}

export type SlidePatch = Partial<{
  background: BackgroundElement;
  elements: SlideElement[];
  legacyHtml: string | null;
  notes: string;
}>;

// ---------------------------------------------------------------------------
// Private helpers — ported verbatim from the JSON-backed implementation.
// These operate purely in-memory; callers are responsible for persisting
// the mutated slide row back to SQLite.
// ---------------------------------------------------------------------------

function snapshotOf(slide: Slide): SlideSnapshot {
  return {
    background: structuredClone(slide.background),
    elements: structuredClone(slide.elements),
    legacyHtml: slide.legacyHtml,
  };
}

function applySnapshot(slide: Slide, snapshot: SlideSnapshot): void {
  slide.background = snapshot.background;
  slide.elements = snapshot.elements;
  if (snapshot.legacyHtml !== undefined) {
    slide.legacyHtml = snapshot.legacyHtml;
  } else {
    delete slide.legacyHtml;
  }
}

function pushBounded(stack: SlideSnapshot[], snapshot: SlideSnapshot): void {
  stack.push(snapshot);
  if (stack.length > MAX_VERSIONS) stack.shift();
}

// Snapshot the current visual state into history. A user-driven edit also
// invalidates any forward (redo) history — we're branching off.
function pushSnapshot(slide: Slide): void {
  pushBounded(slide.previousVersions, snapshotOf(slide));
  slide.nextVersions = [];
}

// ---------------------------------------------------------------------------
// Internal DB helpers
// ---------------------------------------------------------------------------

function fetchItemRow(id: string): ContentItemRow | undefined {
  const db = getDb();
  return db
    .prepare("SELECT * FROM content_items WHERE id = ?")
    .get(id) as ContentItemRow | undefined;
}

function fetchSlideRows(contentItemId: string): SlideRow[] {
  const db = getDb();
  return db
    .prepare(
      "SELECT * FROM slides WHERE content_item_id = ? ORDER BY slide_order ASC",
    )
    .all(contentItemId) as SlideRow[];
}

function fetchContentItem(id: string): ContentItem | null {
  const row = fetchItemRow(id);
  if (!row) return null;
  const slideRows = fetchSlideRows(id);
  return rowToContentItem(row, slideRows);
}

function upsertSlideRow(slide: Slide, contentItemId: string, order: number): void {
  const db = getDb();
  const row = slideToRow(slide, contentItemId, order);
  db.prepare(`
    INSERT OR REPLACE INTO slides
      (id, content_item_id, slide_order, notes, background, elements, legacy_html, previous_versions, next_versions)
    VALUES
      (@id, @content_item_id, @slide_order, @notes, @background, @elements, @legacy_html, @previous_versions, @next_versions)
  `).run(row);
}

function updateItemTimestamp(id: string, timestamp: string): void {
  const db = getDb();
  db.prepare("UPDATE content_items SET updated_at = ? WHERE id = ?").run(timestamp, id);
}

// ---------------------------------------------------------------------------
// Public API — listContentItems
// ---------------------------------------------------------------------------

export async function listContentItems(): Promise<ContentItem[]> {
  const db = getDb();
  // N+1 per item is acceptable for current scale (<= hundreds of items).
  // A future optimisation can join slides and group them in a single query.
  const itemRows = db
    .prepare("SELECT * FROM content_items ORDER BY created_at DESC")
    .all() as ContentItemRow[];

  return itemRows.map((row) => {
    const slideRows = fetchSlideRows(row.id);
    return rowToContentItem(row, slideRows);
  });
}

// ---------------------------------------------------------------------------
// getContentItem
// ---------------------------------------------------------------------------

export async function getContentItem(id: string): Promise<ContentItem | null> {
  return fetchContentItem(id);
}

// ---------------------------------------------------------------------------
// createContentItem
// ---------------------------------------------------------------------------

export async function createContentItem(
  input: NewContentItemInput,
): Promise<ContentItem> {
  const parsed = newContentItemInputSchema.parse(input);
  const db = getDb();

  const item: ContentItem = {
    id: generateId(),
    type: parsed.type,
    state: "idea",
    hook: parsed.hook,
    bodyIdea: parsed.bodyIdea,
    caption: parsed.caption,
    hashtags: parsed.hashtags,
    notes: parsed.notes,
    aspectRatio: DEFAULT_ASPECT_RATIO_FOR_TYPE[parsed.type],
    slides: [],
    createdAt: now(),
    updatedAt: now(),
  };

  const row = contentItemToRow(item);
  db.prepare(`
    INSERT INTO content_items
      (id, type, state, aspect_ratio, hook, body_idea, caption, hashtags,
       notes, chat_session_id, reference_images, assets, tags, created_at, updated_at, generated_at)
    VALUES
      (@id, @type, @state, @aspect_ratio, @hook, @body_idea, @caption, @hashtags,
       @notes, @chat_session_id, @reference_images, @assets, @tags, @created_at, @updated_at, @generated_at)
  `).run(row);

  return item;
}

// ---------------------------------------------------------------------------
// updateContentItem
// ---------------------------------------------------------------------------

export async function updateContentItem(
  id: string,
  patch: ContentItemPatch,
): Promise<ContentItem | null> {
  const parsed = contentItemPatchSchema.parse(patch);
  const db = getDb();

  const existing = fetchContentItem(id);
  if (!existing) return null;

  const stateTransitionToGenerated =
    parsed.state === "generated" && existing.state !== "generated" && !existing.generatedAt;

  const timestamp = now();
  const updated: ContentItem = Object.assign({}, existing, parsed, {
    updatedAt: timestamp,
  });

  if (stateTransitionToGenerated) {
    updated.generatedAt = timestamp;
  }

  const row = contentItemToRow(updated);

  db.prepare(`
    UPDATE content_items SET
      type             = @type,
      state            = @state,
      aspect_ratio     = @aspect_ratio,
      hook             = @hook,
      body_idea        = @body_idea,
      caption          = @caption,
      hashtags         = @hashtags,
      notes            = @notes,
      chat_session_id  = @chat_session_id,
      reference_images = @reference_images,
      assets           = @assets,
      tags             = @tags,
      updated_at       = @updated_at,
      generated_at     = @generated_at
    WHERE id = @id
  `).run(row);

  return updated;
}

// ---------------------------------------------------------------------------
// deleteContentItem
// ---------------------------------------------------------------------------

export async function deleteContentItem(id: string): Promise<boolean> {
  const db = getDb();
  const result = db
    .prepare("DELETE FROM content_items WHERE id = ?")
    .run(id);
  // CASCADE handles the slides rows
  return result.changes > 0;
}

// ---------------------------------------------------------------------------
// appendSlide
// ---------------------------------------------------------------------------

export async function appendSlide(
  itemId: string,
  input: SlideInput,
): Promise<ContentItem | null> {
  const db = getDb();

  const itemRow = fetchItemRow(itemId);
  if (!itemRow) return null;

  const slideRows = fetchSlideRows(itemId);
  if (slideRows.length >= MAX_SLIDES) return null;

  const newOrder = slideRows.length;
  const slide: Slide = {
    id: generateId(),
    order: newOrder,
    notes: input.notes ?? "",
    background: input.background,
    elements: input.elements,
    legacyHtml: input.legacyHtml,
    previousVersions: [],
    nextVersions: [],
  };

  const timestamp = now();

  db.transaction(() => {
    upsertSlideRow(slide, itemId, newOrder);
    updateItemTimestamp(itemId, timestamp);
  })();

  // Re-fetch to return complete, consistent state
  return fetchContentItem(itemId);
}

// ---------------------------------------------------------------------------
// updateSlide
// ---------------------------------------------------------------------------

export async function updateSlide(
  itemId: string,
  slideId: string,
  patch: SlidePatch,
): Promise<ContentItem | null> {
  const db = getDb();

  const item = fetchContentItem(itemId);
  if (!item) return null;
  const slide = item.slides.find((s) => s.id === slideId);
  if (!slide) return null;

  const editableChanged =
    patch.background !== undefined ||
    patch.elements !== undefined ||
    patch.legacyHtml !== undefined;

  if (editableChanged) pushSnapshot(slide);

  if (patch.background !== undefined) slide.background = patch.background;
  if (patch.elements !== undefined) slide.elements = patch.elements;
  if (patch.legacyHtml !== undefined) {
    if (patch.legacyHtml === null) {
      delete slide.legacyHtml;
    } else {
      slide.legacyHtml = patch.legacyHtml;
    }
  }
  if (patch.notes !== undefined) slide.notes = patch.notes;

  const timestamp = now();

  db.transaction(() => {
    upsertSlideRow(slide, itemId, slide.order);
    updateItemTimestamp(itemId, timestamp);
  })();

  return fetchContentItem(itemId);
}

// ---------------------------------------------------------------------------
// deleteSlide
// ---------------------------------------------------------------------------

export async function deleteSlide(
  itemId: string,
  slideId: string,
): Promise<ContentItem | null> {
  const db = getDb();

  const item = fetchContentItem(itemId);
  if (!item) return null;
  const idx = item.slides.findIndex((s) => s.id === slideId);
  if (idx === -1) return null;

  const timestamp = now();

  db.transaction(() => {
    db.prepare("DELETE FROM slides WHERE id = ?").run(slideId);

    // Recompute order for remaining slides
    item.slides.splice(idx, 1);
    item.slides.forEach((s, i) => {
      s.order = i;
      db.prepare("UPDATE slides SET slide_order = ? WHERE id = ?").run(i, s.id);
    });

    updateItemTimestamp(itemId, timestamp);
  })();

  return fetchContentItem(itemId);
}

// ---------------------------------------------------------------------------
// reorderSlides
// ---------------------------------------------------------------------------

export async function reorderSlides(
  itemId: string,
  slideIds: string[],
): Promise<ContentItem | null> {
  const db = getDb();

  const item = fetchContentItem(itemId);
  if (!item) return null;

  const slideMap = new Map(item.slides.map((s) => [s.id, s]));
  const reordered: Slide[] = [];
  for (const id of slideIds) {
    const slide = slideMap.get(id);
    if (!slide) return null;
    slide.order = reordered.length;
    reordered.push(slide);
  }

  const timestamp = now();

  db.transaction(() => {
    for (const slide of reordered) {
      db.prepare("UPDATE slides SET slide_order = ? WHERE id = ?").run(
        slide.order,
        slide.id,
      );
    }
    updateItemTimestamp(itemId, timestamp);
  })();

  return fetchContentItem(itemId);
}

// ---------------------------------------------------------------------------
// undoSlide
// ---------------------------------------------------------------------------

export async function undoSlide(
  itemId: string,
  slideId: string,
): Promise<ContentItem | null> {
  const db = getDb();

  const item = fetchContentItem(itemId);
  if (!item) return null;
  const slide = item.slides.find((s) => s.id === slideId);
  if (!slide || slide.previousVersions.length === 0) return null;

  pushBounded(slide.nextVersions, snapshotOf(slide));
  applySnapshot(slide, slide.previousVersions.pop()!);

  const timestamp = now();

  db.transaction(() => {
    upsertSlideRow(slide, itemId, slide.order);
    updateItemTimestamp(itemId, timestamp);
  })();

  return fetchContentItem(itemId);
}

// ---------------------------------------------------------------------------
// redoSlide
// ---------------------------------------------------------------------------

export async function redoSlide(
  itemId: string,
  slideId: string,
): Promise<ContentItem | null> {
  const db = getDb();

  const item = fetchContentItem(itemId);
  if (!item) return null;
  const slide = item.slides.find((s) => s.id === slideId);
  if (!slide || slide.nextVersions.length === 0) return null;

  pushBounded(slide.previousVersions, snapshotOf(slide));
  applySnapshot(slide, slide.nextVersions.pop()!);

  const timestamp = now();

  db.transaction(() => {
    upsertSlideRow(slide, itemId, slide.order);
    updateItemTimestamp(itemId, timestamp);
  })();

  return fetchContentItem(itemId);
}

// ---------------------------------------------------------------------------
// Element operations
// ---------------------------------------------------------------------------

export type SlideElementPatch = Partial<{
  position: Position;
  size: Size;
  rotation: number;
  opacity: number;
  hidden: boolean;
  scssStyles: string;
  htmlContent: string;
  src: string;
}>;

export async function addSlideElement(
  itemId: string,
  slideId: string,
  element: SlideElement,
): Promise<{ item: ContentItem; element: SlideElement } | null> {
  const db = getDb();

  const item = fetchContentItem(itemId);
  if (!item) return null;
  const slide = item.slides.find((s) => s.id === slideId);
  if (!slide) return null;

  pushSnapshot(slide);
  slide.elements.push(element);

  const timestamp = now();

  db.transaction(() => {
    upsertSlideRow(slide, itemId, slide.order);
    updateItemTimestamp(itemId, timestamp);
  })();

  const refreshed = await fetchContentItem(itemId);
  return { item: refreshed!, element };
}

export async function updateSlideElement(
  itemId: string,
  slideId: string,
  elementId: string,
  patch: SlideElementPatch,
): Promise<{ item: ContentItem; element: SlideElement } | null> {
  const db = getDb();

  const item = fetchContentItem(itemId);
  if (!item) return null;
  const slide = item.slides.find((s) => s.id === slideId);
  if (!slide) return null;
  const element = slide.elements.find((e) => e.id === elementId);
  if (!element) return null;

  pushSnapshot(slide);

  if (patch.position !== undefined) element.position = patch.position;
  if (patch.size !== undefined) element.size = patch.size;
  if (patch.rotation !== undefined) element.rotation = patch.rotation;
  if (patch.opacity !== undefined) element.opacity = patch.opacity;
  if (patch.hidden !== undefined) element.hidden = patch.hidden;
  if (patch.scssStyles !== undefined) element.scssStyles = patch.scssStyles;

  if (element.kind === "container" && patch.htmlContent !== undefined) {
    element.htmlContent = patch.htmlContent;
  }
  if (element.kind === "image" && patch.src !== undefined) {
    element.src = patch.src;
  }

  const timestamp = now();

  db.transaction(() => {
    upsertSlideRow(slide, itemId, slide.order);
    updateItemTimestamp(itemId, timestamp);
  })();

  const refreshed = await fetchContentItem(itemId);
  return { item: refreshed!, element };
}

export async function removeSlideElement(
  itemId: string,
  slideId: string,
  elementId: string,
): Promise<ContentItem | null> {
  const db = getDb();

  const item = fetchContentItem(itemId);
  if (!item) return null;
  const slide = item.slides.find((s) => s.id === slideId);
  if (!slide) return null;
  const idx = slide.elements.findIndex((e) => e.id === elementId);
  if (idx === -1) return null;

  pushSnapshot(slide);
  slide.elements.splice(idx, 1);

  const timestamp = now();

  db.transaction(() => {
    upsertSlideRow(slide, itemId, slide.order);
    updateItemTimestamp(itemId, timestamp);
  })();

  return fetchContentItem(itemId);
}

export async function updateSlideBackground(
  itemId: string,
  slideId: string,
  background: BackgroundElement,
): Promise<ContentItem | null> {
  const db = getDb();

  const item = fetchContentItem(itemId);
  if (!item) return null;
  const slide = item.slides.find((s) => s.id === slideId);
  if (!slide) return null;

  pushSnapshot(slide);
  slide.background = background;

  const timestamp = now();

  db.transaction(() => {
    upsertSlideRow(slide, itemId, slide.order);
    updateItemTimestamp(itemId, timestamp);
  })();

  return fetchContentItem(itemId);
}

// ---------------------------------------------------------------------------
// Asset operations
// ---------------------------------------------------------------------------

export async function addContentItemAsset(
  itemId: string,
  asset: Asset,
): Promise<ContentItem | null> {
  const db = getDb();

  const item = fetchContentItem(itemId);
  if (!item) return null;

  if (!item.assets) item.assets = [];
  item.assets.unshift(asset);

  const timestamp = now();
  const row = contentItemToRow({ ...item, updatedAt: timestamp });

  db.prepare(`
    UPDATE content_items SET assets = @assets, updated_at = @updated_at WHERE id = @id
  `).run({ assets: row.assets, updated_at: row.updated_at, id: itemId });

  return fetchContentItem(itemId);
}

export async function updateContentItemAsset(
  itemId: string,
  assetId: string,
  updates: Partial<Pick<Asset, "name" | "description">>,
): Promise<Asset | null> {
  const db = getDb();

  const item = fetchContentItem(itemId);
  if (!item || !item.assets) return null;
  const asset = item.assets.find((a) => a.id === assetId);
  if (!asset) return null;

  if (updates.name !== undefined) asset.name = updates.name.trim() || asset.name;
  if (updates.description !== undefined) {
    const trimmed = updates.description.trim();
    asset.description = trimmed.length > 0 ? trimmed : undefined;
  }

  const timestamp = now();
  const assetsJson = JSON.stringify(item.assets);

  db.prepare(
    "UPDATE content_items SET assets = ?, updated_at = ? WHERE id = ?",
  ).run(assetsJson, timestamp, itemId);

  return asset;
}

export async function removeContentItemAsset(
  itemId: string,
  assetId: string,
): Promise<boolean> {
  const db = getDb();

  const item = fetchContentItem(itemId);
  if (!item || !item.assets) return false;

  const idx = item.assets.findIndex((a) => a.id === assetId);
  if (idx === -1) return false;

  item.assets.splice(idx, 1);
  const timestamp = now();
  const assetsJson = JSON.stringify(item.assets.length > 0 ? item.assets : []);

  db.prepare(
    "UPDATE content_items SET assets = ?, updated_at = ? WHERE id = ?",
  ).run(assetsJson, timestamp, itemId);

  return true;
}

// ---------------------------------------------------------------------------
// Reference image operations
// ---------------------------------------------------------------------------

export async function addReferenceImage(
  itemId: string,
  image: ReferenceImage,
): Promise<ContentItem | null> {
  const db = getDb();

  const item = fetchContentItem(itemId);
  if (!item) return null;

  if (!item.referenceImages) item.referenceImages = [];
  item.referenceImages.push(image);

  const timestamp = now();
  const refJson = JSON.stringify(item.referenceImages);

  db.prepare(
    "UPDATE content_items SET reference_images = ?, updated_at = ? WHERE id = ?",
  ).run(refJson, timestamp, itemId);

  return fetchContentItem(itemId);
}

export async function removeReferenceImage(
  itemId: string,
  imageId: string,
): Promise<boolean> {
  const db = getDb();

  const item = fetchContentItem(itemId);
  if (!item || !item.referenceImages) return false;

  const idx = item.referenceImages.findIndex((img) => img.id === imageId);
  if (idx === -1) return false;

  item.referenceImages.splice(idx, 1);
  const timestamp = now();
  const refJson = JSON.stringify(item.referenceImages);

  db.prepare(
    "UPDATE content_items SET reference_images = ?, updated_at = ? WHERE id = ?",
  ).run(refJson, timestamp, itemId);

  return true;
}
