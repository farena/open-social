import { getDb } from "./db";
import { generateId, now } from "./utils";
import type { Asset } from "@/types/asset";

// ---------------------------------------------------------------------------
// Row shape (as stored in SQLite)
// ---------------------------------------------------------------------------

interface AssetRow {
  id: string;
  url: string;
  name: string;
  description: string | null;
  added_at: string;
}

// ---------------------------------------------------------------------------
// Serialisation helpers
// ---------------------------------------------------------------------------

function rowToAsset(row: AssetRow): Asset {
  return {
    id: row.id,
    url: row.url,
    name: row.name,
    description: row.description ?? undefined,
    addedAt: row.added_at,
  };
}

function assetToRow(asset: Asset): AssetRow {
  return {
    id: asset.id,
    url: asset.url,
    name: asset.name,
    description: asset.description ?? null,
    added_at: asset.addedAt,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function listAssets(): Promise<Asset[]> {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM assets ORDER BY added_at DESC")
    .all() as AssetRow[];
  return rows.map(rowToAsset);
}

export async function addAsset(input: {
  url: string;
  name: string;
  description?: string;
}): Promise<Asset> {
  const db = getDb();
  const asset: Asset = {
    id: generateId(),
    url: input.url,
    name: input.name,
    description: input.description?.trim() || undefined,
    addedAt: now(),
  };
  const row = assetToRow(asset);
  db.prepare(
    `INSERT INTO assets (id, url, name, description, added_at)
     VALUES (@id, @url, @name, @description, @added_at)`,
  ).run(row);
  return asset;
}

export async function updateAsset(
  id: string,
  updates: Partial<Pick<Asset, "name" | "description">>
): Promise<Asset | null> {
  const db = getDb();

  const existing = db
    .prepare("SELECT * FROM assets WHERE id = ?")
    .get(id) as AssetRow | undefined;
  if (!existing) return null;

  const newName =
    updates.name !== undefined
      ? updates.name.trim() || existing.name
      : existing.name;

  let newDescription = existing.description;
  if (updates.description !== undefined) {
    const trimmed = updates.description.trim();
    newDescription = trimmed.length > 0 ? trimmed : null;
  }

  db.prepare(
    "UPDATE assets SET name = ?, description = ? WHERE id = ?",
  ).run(newName, newDescription, id);

  return rowToAsset({ ...existing, name: newName, description: newDescription });
}

export async function removeAsset(id: string): Promise<boolean> {
  const db = getDb();
  const result = db.prepare("DELETE FROM assets WHERE id = ?").run(id);
  return result.changes > 0;
}
