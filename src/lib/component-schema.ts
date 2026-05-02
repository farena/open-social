import { z } from "zod";
import type { Component } from "@/types/component";

/**
 * Zod schemas mirroring `src/types/component.ts`. Used to validate inputs at
 * API boundaries. Keep in sync with the TS types — `z.infer<typeof X>` should
 * match the manual interfaces.
 */

export const parameterTypeSchema = z.enum(["text", "color", "image-url"]);

export const componentParameterSchema = z.object({
  key: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, {
    message: "Parameter key must start with a letter or underscore and contain only letters, digits, and underscores",
  }),
  type: parameterTypeSchema,
  defaultValue: z.string().optional(),
});

export const componentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable(),
  htmlContent: z.string(),
  scssStyles: z.string(),
  parametersSchema: z.array(componentParameterSchema),
  width: z.number().positive(),
  height: z.number().positive(),
  thumbnailUrl: z.string().nullable(),
  tags: z.array(z.string()),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

/**
 * Payload for POST /api/components — id and timestamps are server-generated.
 */
export const componentCreateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  htmlContent: z.string(),
  scssStyles: z.string().optional(),
  parametersSchema: z.array(componentParameterSchema).optional(),
  width: z.number().positive(),
  height: z.number().positive(),
  tags: z.array(z.string()).optional(),
});

/**
 * Payload for PATCH /api/components/[id] — all fields are optional.
 */
export const componentPatchSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().nullable(),
    htmlContent: z.string(),
    scssStyles: z.string(),
    parametersSchema: z.array(componentParameterSchema),
    width: z.number().positive(),
    height: z.number().positive(),
    tags: z.array(z.string()),
    thumbnailUrl: z.string().nullable(),
  })
  .partial();

// ---------------------------------------------------------------------------
// Bidirectional compile-time check so schema and type can't drift either way.
// ---------------------------------------------------------------------------
const _schemaToType: Component = {} as z.infer<typeof componentSchema>;
const _typeToSchema: z.infer<typeof componentSchema> = {} as Component;
void _schemaToType;
void _typeToSchema;
