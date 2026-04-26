import { readDataSafe, writeData } from "./data";
import { generateId, now } from "./utils";
import type { Template, TemplatesData } from "@/types/template";
import type { ContentItem } from "@/types/content-item";

const FILE = "templates.json";

async function load(): Promise<TemplatesData> {
  return readDataSafe<TemplatesData>(FILE, { templates: [] });
}

async function save(data: TemplatesData): Promise<void> {
  await writeData(FILE, data);
}

export async function listTemplates(): Promise<Template[]> {
  const data = await load();
  return data.templates;
}

export async function getTemplate(id: string): Promise<Template | null> {
  const data = await load();
  return data.templates.find((t) => t.id === id) ?? null;
}

export async function saveAsTemplate(
  item: ContentItem,
  name?: string,
  description?: string
): Promise<Template> {
  const data = await load();
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
  data.templates.push(template);
  await save(data);
  return template;
}

export async function deleteTemplate(id: string): Promise<boolean> {
  const data = await load();
  const idx = data.templates.findIndex((t) => t.id === id);
  if (idx === -1) return false;
  data.templates.splice(idx, 1);
  await save(data);
  return true;
}
