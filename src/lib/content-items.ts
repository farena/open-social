import { readDataSafe, writeData } from "./data";
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

export const CONTENT_ITEMS_FILE = "content-items.json";

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

interface ContentItemsData {
  contentItems: ContentItem[];
}

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

async function load(): Promise<ContentItemsData> {
  const data = await readDataSafe<ContentItemsData>(CONTENT_ITEMS_FILE, {
    contentItems: [],
  });
  // Migrate slides persisted before nextVersions existed.
  for (const item of data.contentItems) {
    for (const slide of item.slides) {
      if (!Array.isArray(slide.nextVersions)) slide.nextVersions = [];
    }
  }
  return data;
}

async function save(data: ContentItemsData): Promise<void> {
  await writeData(CONTENT_ITEMS_FILE, data);
}

export async function listContentItems(): Promise<ContentItem[]> {
  const data = await load();
  return data.contentItems;
}

export async function getContentItem(id: string): Promise<ContentItem | null> {
  const data = await load();
  return data.contentItems.find((c) => c.id === id) ?? null;
}

export async function createContentItem(input: NewContentItemInput): Promise<ContentItem> {
  const parsed = newContentItemInputSchema.parse(input);
  const data = await load();

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

  data.contentItems.push(item);
  await save(data);
  return item;
}

export async function updateContentItem(
  id: string,
  patch: ContentItemPatch
): Promise<ContentItem | null> {
  const parsed = contentItemPatchSchema.parse(patch);
  const data = await load();
  const idx = data.contentItems.findIndex((c) => c.id === id);
  if (idx === -1) return null;

  const item = data.contentItems[idx];
  const stateTransitionToGenerated =
    parsed.state === "generated" && item.state !== "generated" && !item.generatedAt;

  Object.assign(item, parsed, { updatedAt: now() });

  if (stateTransitionToGenerated) {
    item.generatedAt = now();
  }

  await save(data);
  return item;
}

export async function deleteContentItem(id: string): Promise<boolean> {
  const data = await load();
  const idx = data.contentItems.findIndex((c) => c.id === id);
  if (idx === -1) return false;
  data.contentItems.splice(idx, 1);
  await save(data);
  return true;
}

// --- Slide operations ---

export async function appendSlide(
  itemId: string,
  input: SlideInput
): Promise<ContentItem | null> {
  const data = await load();
  const item = data.contentItems.find((c) => c.id === itemId);
  if (!item) return null;
  if (item.slides.length >= MAX_SLIDES) return null;

  const slide: Slide = {
    id: generateId(),
    order: item.slides.length,
    notes: input.notes ?? "",
    background: input.background,
    elements: input.elements,
    legacyHtml: input.legacyHtml,
    previousVersions: [],
    nextVersions: [],
  };
  item.slides.push(slide);
  item.updatedAt = now();
  await save(data);
  return item;
}

export async function updateSlide(
  itemId: string,
  slideId: string,
  patch: SlidePatch
): Promise<ContentItem | null> {
  const data = await load();
  const item = data.contentItems.find((c) => c.id === itemId);
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

  item.updatedAt = now();
  await save(data);
  return item;
}

export async function deleteSlide(
  itemId: string,
  slideId: string
): Promise<ContentItem | null> {
  const data = await load();
  const item = data.contentItems.find((c) => c.id === itemId);
  if (!item) return null;
  const idx = item.slides.findIndex((s) => s.id === slideId);
  if (idx === -1) return null;

  item.slides.splice(idx, 1);
  item.slides.forEach((s, i) => {
    s.order = i;
  });
  item.updatedAt = now();
  await save(data);
  return item;
}

export async function reorderSlides(
  itemId: string,
  slideIds: string[]
): Promise<ContentItem | null> {
  const data = await load();
  const item = data.contentItems.find((c) => c.id === itemId);
  if (!item) return null;

  const slideMap = new Map(item.slides.map((s) => [s.id, s]));
  const reordered: Slide[] = [];
  for (const id of slideIds) {
    const slide = slideMap.get(id);
    if (!slide) return null;
    slide.order = reordered.length;
    reordered.push(slide);
  }
  item.slides = reordered;
  item.updatedAt = now();
  await save(data);
  return item;
}

export async function undoSlide(
  itemId: string,
  slideId: string
): Promise<ContentItem | null> {
  const data = await load();
  const item = data.contentItems.find((c) => c.id === itemId);
  if (!item) return null;
  const slide = item.slides.find((s) => s.id === slideId);
  if (!slide || slide.previousVersions.length === 0) return null;

  pushBounded(slide.nextVersions, snapshotOf(slide));
  applySnapshot(slide, slide.previousVersions.pop()!);
  item.updatedAt = now();
  await save(data);
  return item;
}

export async function redoSlide(
  itemId: string,
  slideId: string
): Promise<ContentItem | null> {
  const data = await load();
  const item = data.contentItems.find((c) => c.id === itemId);
  if (!item) return null;
  const slide = item.slides.find((s) => s.id === slideId);
  if (!slide || slide.nextVersions.length === 0) return null;

  pushBounded(slide.previousVersions, snapshotOf(slide));
  applySnapshot(slide, slide.nextVersions.pop()!);
  item.updatedAt = now();
  await save(data);
  return item;
}

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
  element: SlideElement
): Promise<{ item: ContentItem; element: SlideElement } | null> {
  const data = await load();
  const item = data.contentItems.find((c) => c.id === itemId);
  if (!item) return null;
  const slide = item.slides.find((s) => s.id === slideId);
  if (!slide) return null;

  pushSnapshot(slide);
  slide.elements.push(element);
  item.updatedAt = now();
  await save(data);
  return { item, element };
}

export async function updateSlideElement(
  itemId: string,
  slideId: string,
  elementId: string,
  patch: SlideElementPatch
): Promise<{ item: ContentItem; element: SlideElement } | null> {
  const data = await load();
  const item = data.contentItems.find((c) => c.id === itemId);
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

  item.updatedAt = now();
  await save(data);
  return { item, element };
}

export async function removeSlideElement(
  itemId: string,
  slideId: string,
  elementId: string
): Promise<ContentItem | null> {
  const data = await load();
  const item = data.contentItems.find((c) => c.id === itemId);
  if (!item) return null;
  const slide = item.slides.find((s) => s.id === slideId);
  if (!slide) return null;
  const idx = slide.elements.findIndex((e) => e.id === elementId);
  if (idx === -1) return null;

  pushSnapshot(slide);
  slide.elements.splice(idx, 1);
  item.updatedAt = now();
  await save(data);
  return item;
}

export async function updateSlideBackground(
  itemId: string,
  slideId: string,
  background: BackgroundElement
): Promise<ContentItem | null> {
  const data = await load();
  const item = data.contentItems.find((c) => c.id === itemId);
  if (!item) return null;
  const slide = item.slides.find((s) => s.id === slideId);
  if (!slide) return null;

  pushSnapshot(slide);
  slide.background = background;
  item.updatedAt = now();
  await save(data);
  return item;
}

// --- Asset operations ---

export async function addContentItemAsset(
  itemId: string,
  asset: Asset
): Promise<ContentItem | null> {
  const data = await load();
  const item = data.contentItems.find((c) => c.id === itemId);
  if (!item) return null;

  if (!item.assets) item.assets = [];
  item.assets.unshift(asset);
  item.updatedAt = now();
  await save(data);
  return item;
}

export async function updateContentItemAsset(
  itemId: string,
  assetId: string,
  updates: Partial<Pick<Asset, "name" | "description">>
): Promise<Asset | null> {
  const data = await load();
  const item = data.contentItems.find((c) => c.id === itemId);
  if (!item || !item.assets) return null;
  const asset = item.assets.find((a) => a.id === assetId);
  if (!asset) return null;

  if (updates.name !== undefined) asset.name = updates.name.trim() || asset.name;
  if (updates.description !== undefined) {
    const trimmed = updates.description.trim();
    asset.description = trimmed.length > 0 ? trimmed : undefined;
  }
  item.updatedAt = now();
  await save(data);
  return asset;
}

export async function removeContentItemAsset(
  itemId: string,
  assetId: string
): Promise<boolean> {
  const data = await load();
  const item = data.contentItems.find((c) => c.id === itemId);
  if (!item || !item.assets) return false;

  const idx = item.assets.findIndex((a) => a.id === assetId);
  if (idx === -1) return false;

  item.assets.splice(idx, 1);
  item.updatedAt = now();
  await save(data);
  return true;
}

// --- Reference image operations ---

export async function addReferenceImage(
  itemId: string,
  image: ReferenceImage
): Promise<ContentItem | null> {
  const data = await load();
  const item = data.contentItems.find((c) => c.id === itemId);
  if (!item) return null;

  if (!item.referenceImages) item.referenceImages = [];
  item.referenceImages.push(image);
  item.updatedAt = now();
  await save(data);
  return item;
}

export async function removeReferenceImage(
  itemId: string,
  imageId: string
): Promise<boolean> {
  const data = await load();
  const item = data.contentItems.find((c) => c.id === itemId);
  if (!item || !item.referenceImages) return false;

  const idx = item.referenceImages.findIndex((img) => img.id === imageId);
  if (idx === -1) return false;

  item.referenceImages.splice(idx, 1);
  item.updatedAt = now();
  await save(data);
  return true;
}
