import { getDb } from "./db";
import { generateId, now } from "./utils";
import type { StylePreset } from "@/types/style-preset";

// ---------------------------------------------------------------------------
// Row shape
// ---------------------------------------------------------------------------

interface StylePresetRow {
  id: string;
  name: string;
  description: string | null;
  payload: string; // JSON of Omit<StylePreset, "id" | "name" | "description" | "createdAt">
  created_at: string;
}

// ---------------------------------------------------------------------------
// (De)serialization helpers
// ---------------------------------------------------------------------------

function presetToRow(preset: StylePreset): StylePresetRow {
  const { id, name, description, createdAt, ...rest } = preset;
  return {
    id,
    name,
    description: description ?? null,
    payload: JSON.stringify(rest),
    created_at: createdAt,
  };
}

function rowToPreset(row: StylePresetRow): StylePreset {
  const payload = JSON.parse(row.payload) as Omit<
    StylePreset,
    "id" | "name" | "description" | "createdAt"
  >;
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    createdAt: row.created_at,
    ...payload,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function listPresets(): Promise<StylePreset[]> {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM style_presets ORDER BY created_at ASC")
    .all() as StylePresetRow[];
  return rows.map(rowToPreset);
}

export async function getPreset(id: string): Promise<StylePreset | null> {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM style_presets WHERE id = ?")
    .get(id) as StylePresetRow | undefined;
  return row ? rowToPreset(row) : null;
}

export async function createPreset(
  params: Omit<StylePreset, "id" | "createdAt">
): Promise<StylePreset> {
  const db = getDb();
  const preset: StylePreset = {
    ...params,
    id: generateId(),
    createdAt: now(),
  };
  const row = presetToRow(preset);
  db.prepare(`
    INSERT INTO style_presets (id, name, description, payload, created_at)
    VALUES (@id, @name, @description, @payload, @created_at)
  `).run(row);
  return preset;
}

export async function deletePreset(id: string): Promise<boolean> {
  const db = getDb();
  const result = db
    .prepare("DELETE FROM style_presets WHERE id = ?")
    .run(id);
  return result.changes > 0;
}
