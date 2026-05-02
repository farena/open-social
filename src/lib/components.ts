import { getDb } from "./db";
import { generateId, now } from "./utils";
import { extractParameterKeys } from "./component-interpolation";
import { getContentItem } from "./content-items";
import type { Component, ComponentParameter } from "@/types/component";
import type { ContainerElement } from "@/types/slide-model";

// ---------------------------------------------------------------------------
// Inferred types from Zod schemas
// ---------------------------------------------------------------------------

import type { z } from "zod";
import type { componentCreateSchema, componentPatchSchema } from "./component-schema";

export type ComponentCreateInput = z.infer<typeof componentCreateSchema>;
export type ComponentPatchInput = z.infer<typeof componentPatchSchema>;

// ---------------------------------------------------------------------------
// Row shape — mirrors the `components` table columns
// ---------------------------------------------------------------------------

interface ComponentRow {
  id: string;
  name: string;
  description: string | null;
  html_content: string;
  scss_styles: string;
  parameters_schema: string; // JSON
  width: number;
  height: number;
  thumbnail_url: string | null;
  tags: string; // JSON
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function rowToComponent(row: ComponentRow): Component {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    htmlContent: row.html_content,
    scssStyles: row.scss_styles,
    parametersSchema: JSON.parse(row.parameters_schema) as ComponentParameter[],
    width: row.width,
    height: row.height,
    thumbnailUrl: row.thumbnail_url,
    tags: JSON.parse(row.tags) as string[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function componentToRow(component: Component): ComponentRow {
  return {
    id: component.id,
    name: component.name,
    description: component.description,
    html_content: component.htmlContent,
    scss_styles: component.scssStyles,
    parameters_schema: JSON.stringify(component.parametersSchema),
    width: component.width,
    height: component.height,
    thumbnail_url: component.thumbnailUrl,
    tags: JSON.stringify(component.tags),
    created_at: component.createdAt,
    updated_at: component.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function listComponents(): Promise<Component[]> {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM components ORDER BY created_at ASC")
    .all() as ComponentRow[];
  return rows.map(rowToComponent);
}

export async function getComponent(id: string): Promise<Component | null> {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM components WHERE id = ?")
    .get(id) as ComponentRow | undefined;
  return row ? rowToComponent(row) : null;
}

const THUMBNAIL_TRIGGER_FIELDS = new Set([
  "htmlContent",
  "scssStyles",
  "parametersSchema",
  "width",
  "height",
]);

function triggerThumbnail(component: Component): void {
  void import("./component-thumbnail").then(({ generateComponentThumbnail }) => {
    void generateComponentThumbnail(component);
  });
}

export async function createComponent(
  input: ComponentCreateInput,
): Promise<Component> {
  const db = getDb();
  const component: Component = {
    id: generateId(),
    name: input.name,
    description: input.description ?? null,
    htmlContent: input.htmlContent,
    scssStyles: input.scssStyles ?? "",
    parametersSchema: input.parametersSchema ?? [],
    width: input.width,
    height: input.height,
    thumbnailUrl: null,
    tags: input.tags ?? [],
    createdAt: now(),
    updatedAt: now(),
  };

  const row = componentToRow(component);
  db.prepare(`
    INSERT INTO components
      (id, name, description, html_content, scss_styles, parameters_schema,
       width, height, thumbnail_url, tags, created_at, updated_at)
    VALUES
      (@id, @name, @description, @html_content, @scss_styles, @parameters_schema,
       @width, @height, @thumbnail_url, @tags, @created_at, @updated_at)
  `).run(row);

  triggerThumbnail(component);

  return component;
}

export async function updateComponent(
  id: string,
  patch: ComponentPatchInput,
): Promise<Component | null> {
  const db = getDb();

  const existing = await getComponent(id);
  if (!existing) return null;

  const updated: Component = {
    ...existing,
    ...patch,
    // description and thumbnailUrl can be explicitly set to null via patch
    description:
      "description" in patch ? (patch.description ?? null) : existing.description,
    thumbnailUrl:
      "thumbnailUrl" in patch
        ? (patch.thumbnailUrl ?? null)
        : existing.thumbnailUrl,
    updatedAt: now(),
  };

  const row = componentToRow(updated);
  db.prepare(`
    UPDATE components SET
      name              = @name,
      description       = @description,
      html_content      = @html_content,
      scss_styles       = @scss_styles,
      parameters_schema = @parameters_schema,
      width             = @width,
      height            = @height,
      thumbnail_url     = @thumbnail_url,
      tags              = @tags,
      updated_at        = @updated_at
    WHERE id = @id
  `).run(row);

  const needsRegen = Object.keys(patch).some((k) => THUMBNAIL_TRIGGER_FIELDS.has(k));
  if (needsRegen) {
    triggerThumbnail(updated);
  }

  return updated;
}

export async function deleteComponent(id: string): Promise<boolean> {
  const db = getDb();
  const result = db.prepare("DELETE FROM components WHERE id = ?").run(id);
  return result.changes > 0;
}

// ---------------------------------------------------------------------------
// inferParameters — pure helper (no I/O)
// ---------------------------------------------------------------------------

/**
 * Derives a ComponentParameter[] from the keys referenced in htmlContent and
 * scssStyles. Explicit entries whose key is NOT referenced are silently dropped
 * (the extracted keys define the schema).
 */
export function inferParameters(
  htmlContent: string,
  scssStyles: string,
  explicit: ComponentParameter[] = [],
): ComponentParameter[] {
  const keys = extractParameterKeys(htmlContent, scssStyles);

  // Build a lookup map from explicit entries
  const explicitByKey = new Map<string, ComponentParameter>(
    explicit.map((p) => [p.key, p]),
  );

  // Preserve order of first appearance; explicit wins on metadata
  return keys.map((key) => {
    const found = explicitByKey.get(key);
    if (found) return found;
    return { key, type: "text" as const };
  });
}

// ---------------------------------------------------------------------------
// saveFromElement — reads a container from a slide and persists as a Component
// ---------------------------------------------------------------------------

export async function saveFromElement(args: {
  contentItemId: string;
  slideId: string;
  elementId: string;
  name: string;
  description?: string;
  tags?: string[];
}): Promise<Component> {
  const item = await getContentItem(args.contentItemId);
  if (!item) throw new Error("content item not found");

  const slide = item.slides.find((s) => s.id === args.slideId);
  if (!slide) throw new Error("slide not found");

  const element = slide.elements.find((e) => e.id === args.elementId);
  if (!element) throw new Error("element not found");

  if (element.kind !== "container") throw new Error("element is not a container");

  const containerEl = element as ContainerElement;
  const htmlContent = containerEl.htmlContent;
  const scssStyles = containerEl.scssStyles ?? "";

  const component = await createComponent({
    name: args.name,
    description: args.description,
    htmlContent,
    scssStyles,
    parametersSchema: inferParameters(htmlContent, scssStyles, []),
    width: containerEl.size.w,
    height: containerEl.size.h,
    tags: args.tags ?? [],
  });

  return component;
}
