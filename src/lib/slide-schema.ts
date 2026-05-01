import { z } from "zod";

/**
 * zod schemas mirroring `src/types/slide-model.ts`. Used to validate inputs at
 * API boundaries (chat-driven endpoints, manual editor saves) and during
 * migration. Keep this file in sync with the TS types — `z.infer<typeof X>`
 * should match the manual interfaces.
 */

const hexColor = z.string().min(1);

export const positionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const sizeSchema = z.object({
  w: z.number().positive(),
  h: z.number().positive(),
});

export const solidFillSchema = z.object({
  kind: z.literal("solid"),
  color: hexColor,
});

export const gradientStopSchema = z.object({
  offset: z.number().min(0).max(1),
  color: hexColor,
});

export const gradientFillSchema = z.object({
  kind: z.literal("gradient"),
  angle: z.number(),
  stops: z.array(gradientStopSchema).min(2),
});

export const imageBackgroundSchema = z.object({
  kind: z.literal("image"),
  src: z.string().min(1),
  fit: z.enum(["cover", "contain"]),
});

export const backgroundSchema = z.discriminatedUnion("kind", [
  solidFillSchema,
  gradientFillSchema,
  imageBackgroundSchema,
]);

const elementBase = {
  id: z.string().min(1),
  position: positionSchema,
  size: sizeSchema,
  rotation: z.number().optional(),
  opacity: z.number().min(0).max(1).optional(),
  hidden: z.boolean().optional(),
  scssStyles: z.string().optional(),
};

export const containerElementSchema = z.object({
  ...elementBase,
  kind: z.literal("container"),
  htmlContent: z.string(),
});

export const imageElementSchema = z.object({
  ...elementBase,
  kind: z.literal("image"),
  src: z.string().min(1),
});

export const slideElementSchema = z.discriminatedUnion("kind", [
  containerElementSchema,
  imageElementSchema,
]);

export const slideSnapshotSchema = z.object({
  background: backgroundSchema,
  elements: z.array(slideElementSchema),
  legacyHtml: z.string().optional(),
});

export const slideSchema = z.object({
  id: z.string().min(1),
  order: z.number().int().min(0),
  notes: z.string(),
  background: backgroundSchema,
  elements: z.array(slideElementSchema),
  legacyHtml: z.string().optional(),
  previousVersions: z.array(slideSnapshotSchema),
  nextVersions: z.array(slideSnapshotSchema),
});

/**
 * Patch schema — partial of any element. Server validates the kind and
 * routes the patch through the appropriate updater.
 */
const elementCommonPatch = z
  .object({
    position: positionSchema,
    size: sizeSchema,
    rotation: z.number(),
    opacity: z.number().min(0).max(1),
    hidden: z.boolean(),
    scssStyles: z.string(),
    htmlContent: z.string(),
    src: z.string().min(1),
  })
  .partial();

export const elementPatchSchema = elementCommonPatch;

/**
 * Shape used by POST /slides — clients send the editable model only; server
 * fills in id, order, and previousVersions.
 */
export const newSlideInputSchema = z.object({
  background: backgroundSchema,
  elements: z.array(slideElementSchema),
  legacyHtml: z.string().optional(),
  notes: z.string().optional(),
});

export const slideUpdateSchema = z
  .object({
    background: backgroundSchema,
    elements: z.array(slideElementSchema),
    legacyHtml: z.string().nullable(),
    notes: z.string(),
  })
  .partial();
