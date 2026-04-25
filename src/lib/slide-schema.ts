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

export const fontWeightSchema = z.union([
  z.literal(300),
  z.literal(400),
  z.literal(500),
  z.literal(600),
  z.literal(700),
  z.literal(800),
  z.literal(900),
]);

export const spanSchema = z.object({
  content: z.string(),
  fontFamily: z.string().min(1),
  fontSize: z.number().positive(),
  fontWeight: fontWeightSchema,
  color: hexColor,
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
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

export const elementFillSchema = z.discriminatedUnion("kind", [
  solidFillSchema,
  gradientFillSchema,
]);

export const backgroundSchema = z.discriminatedUnion("kind", [
  solidFillSchema,
  gradientFillSchema,
  imageBackgroundSchema,
]);

const elementBase = {
  id: z.string().min(1),
  position: positionSchema,
  rotation: z.number().optional(),
  opacity: z.number().min(0).max(1).optional(),
};

export const textSizeSchema = z.object({
  w: z.number().positive(),
  h: z.union([z.number().positive(), z.literal("auto")]),
});

export const textElementSchema = z.object({
  ...elementBase,
  kind: z.literal("text"),
  size: textSizeSchema,
  alignment: z.enum(["left", "center", "right"]),
  lineHeight: z.number().positive(),
  letterSpacing: z.number().optional(),
  spans: z.array(spanSchema).min(1),
});

export const imageElementSchema = z.object({
  ...elementBase,
  kind: z.literal("image"),
  size: sizeSchema,
  src: z.string().min(1),
  fit: z.enum(["cover", "contain"]),
  borderRadius: z.number().optional(),
});

export const shapeBorderSchema = z.object({
  width: z.number().min(0),
  color: hexColor,
});

export const shapeElementSchema = z.object({
  ...elementBase,
  kind: z.literal("shape"),
  size: sizeSchema,
  shape: z.enum(["rect", "circle"]),
  fill: elementFillSchema,
  border: shapeBorderSchema.optional(),
  borderRadius: z.number().optional(),
});

export const slideElementSchema = z.discriminatedUnion("kind", [
  textElementSchema,
  imageElementSchema,
  shapeElementSchema,
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
});

/**
 * Patch schemas — used by PATCH endpoints and the editor reducer to send
 * partial updates without requiring a full element re-validation.
 */

const textPatch = z
  .object({
    position: positionSchema,
    size: textSizeSchema,
    alignment: z.enum(["left", "center", "right"]),
    lineHeight: z.number().positive(),
    letterSpacing: z.number(),
    rotation: z.number(),
    opacity: z.number().min(0).max(1),
    spans: z.array(spanSchema).min(1),
  })
  .partial();

const imagePatch = z
  .object({
    position: positionSchema,
    size: sizeSchema,
    src: z.string().min(1),
    fit: z.enum(["cover", "contain"]),
    borderRadius: z.number(),
    rotation: z.number(),
    opacity: z.number().min(0).max(1),
  })
  .partial();

const shapePatch = z
  .object({
    position: positionSchema,
    size: sizeSchema,
    shape: z.enum(["rect", "circle"]),
    fill: elementFillSchema,
    border: shapeBorderSchema,
    borderRadius: z.number(),
    rotation: z.number(),
    opacity: z.number().min(0).max(1),
  })
  .partial();

/**
 * elementPatchSchema is the union of partial patches. We don't discriminate by
 * kind here because PATCH endpoints look up the element first, and the
 * server-side updater ensures the patch makes sense for that element's kind.
 * Empty objects are valid (no-op).
 */
export const elementPatchSchema = z.union([textPatch, imagePatch, shapePatch]);

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
