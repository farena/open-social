import { getDb } from "./db";
import { generateId, now } from "./utils";
import type { Template } from "@/types/template";
import type { ContentItem } from "@/types/content-item";

// ---------------------------------------------------------------------------
// Row shape — mirrors the `templates` table columns
// ---------------------------------------------------------------------------

interface TemplateRow {
  id: string;
  name: string;
  description: string;
  aspect_ratio: string;
  slides: string; // JSON
  tags: string;   // JSON
  created_at: string;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function rowToTemplate(row: TemplateRow): Template {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    aspectRatio: row.aspect_ratio as Template["aspectRatio"],
    slides: JSON.parse(row.slides),
    tags: JSON.parse(row.tags),
    createdAt: row.created_at,
  };
}

function templateToRow(template: Template): TemplateRow {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    aspect_ratio: template.aspectRatio,
    slides: JSON.stringify(template.slides),
    tags: JSON.stringify(template.tags),
    created_at: template.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function listTemplates(): Promise<Template[]> {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM templates ORDER BY created_at ASC")
    .all() as TemplateRow[];
  return rows.map(rowToTemplate);
}

export async function getTemplate(id: string): Promise<Template | null> {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM templates WHERE id = ?")
    .get(id) as TemplateRow | undefined;
  return row ? rowToTemplate(row) : null;
}

export async function saveAsTemplate(
  item: ContentItem,
  name?: string,
  description?: string
): Promise<Template> {
  const db = getDb();
  const template: Template = {
    id: generateId(),
    name: name || item.hook || item.id,
    description: description || `Template from ${item.hook || item.id}`,
    aspectRatio: item.aspectRatio,
    slides: item.slides.map(({ id, order, notes, background, elements, legacyHtml }) => ({
      id,
      order,
      notes,
      background,
      elements,
      legacyHtml,
    })),
    tags: item.tags ?? [],
    createdAt: now(),
  };

  const row = templateToRow(template);
  db.prepare(`
    INSERT INTO templates (id, name, description, aspect_ratio, slides, tags, created_at)
    VALUES (@id, @name, @description, @aspect_ratio, @slides, @tags, @created_at)
  `).run(row);

  return template;
}

export async function deleteTemplate(id: string): Promise<boolean> {
  const db = getDb();
  const result = db
    .prepare("DELETE FROM templates WHERE id = ?")
    .run(id);
  return result.changes > 0;
}
