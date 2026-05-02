import type { Asset } from "./asset";
import type { Slide, AspectRatio, ReferenceImage } from "./carousel";

export type { Slide, AspectRatio, ReferenceImage };
export type { Asset as CarouselAsset };

export { DIMENSIONS, MAX_SLIDES } from "./carousel";

export type ContentItemType = "post" | "story" | "carousel";
export type ContentItemState = "idea" | "generating" | "generated";
export type ContentItemAspectRatio = "1:1" | "9:16" | "4:5";

export interface ContentItem {
  id: string;
  type: ContentItemType;
  state: ContentItemState;

  hook: string;
  bodyIdea: string;
  caption: string;
  hashtags: string[];
  notes?: string;

  aspectRatio: ContentItemAspectRatio;
  slides: Slide[];

  chatSessionId?: string | null;
  referenceImages?: ReferenceImage[];
  assets?: Asset[];
  tags?: string[];

  createdAt: string;
  updatedAt: string;
  generatedAt?: string;
  downloaded: boolean;
}

export const DEFAULT_ASPECT_RATIO_FOR_TYPE: Record<
  ContentItemType,
  ContentItemAspectRatio
> = {
  post: "1:1",
  story: "9:16",
  carousel: "4:5",
};
