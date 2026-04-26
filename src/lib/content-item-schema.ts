import { z } from "zod";
import { slideSchema } from "./slide-schema";
import type { ContentItem } from "@/types/content-item";

export const contentItemTypeSchema = z.enum(["post", "story", "carousel"]);
export const contentItemStateSchema = z.enum(["idea", "generating", "generated"]);
export const contentItemAspectRatioSchema = z.enum(["1:1", "9:16", "4:5"]);

const referenceImageSchema = z.object({
  id: z.string().min(1),
  url: z.string().min(1),
  absPath: z.string().min(1),
  name: z.string(),
  addedAt: z.string(),
});

const assetSchema = z.object({
  id: z.string().min(1),
  url: z.string().min(1),
  name: z.string(),
  description: z.string().optional(),
  addedAt: z.string(),
});

export const contentItemSchema = z.object({
  id: z.string().min(1),
  type: contentItemTypeSchema,
  state: contentItemStateSchema,

  hook: z.string(),
  bodyIdea: z.string(),
  caption: z.string(),
  hashtags: z.array(z.string()),
  notes: z.string().optional(),

  aspectRatio: contentItemAspectRatioSchema,
  slides: z.array(slideSchema),

  chatSessionId: z.string().nullable().optional(),
  referenceImages: z.array(referenceImageSchema).optional(),
  assets: z.array(assetSchema).optional(),
  tags: z.array(z.string()).optional(),

  createdAt: z.string(),
  updatedAt: z.string(),
  generatedAt: z.string().optional(),
});

export const contentItemPatchSchema = z.object({
  state: contentItemStateSchema,
  type: contentItemTypeSchema,
  hook: z.string(),
  bodyIdea: z.string(),
  caption: z.string(),
  hashtags: z.array(z.string()),
  notes: z.string(),
  aspectRatio: contentItemAspectRatioSchema,
  chatSessionId: z.string().nullable(),
  referenceImages: z.array(referenceImageSchema),
  assets: z.array(assetSchema),
  tags: z.array(z.string()),
  generatedAt: z.string(),
}).partial();

export const newContentItemInputSchema = z.object({
  type: contentItemTypeSchema,
  hook: z.string().min(1),
  bodyIdea: z.string().optional().default(""),
  caption: z.string().optional().default(""),
  hashtags: z.array(z.string()).optional().default([]),
  notes: z.string().optional(),
});

// Bidirectional compile-time check so schema and type can't drift either way.
const _schemaToType: ContentItem = {} as z.infer<typeof contentItemSchema>;
const _typeToSchema: z.infer<typeof contentItemSchema> = {} as ContentItem;
void _schemaToType;
void _typeToSchema;
