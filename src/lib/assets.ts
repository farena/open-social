import { readDataSafe, writeData } from "./data";
import { generateId, now } from "./utils";
import type { Asset, AssetsData } from "@/types/asset";

const FILE = "assets.json";

async function load(): Promise<AssetsData> {
  return readDataSafe<AssetsData>(FILE, { assets: [] });
}

async function save(data: AssetsData): Promise<void> {
  await writeData(FILE, data);
}

export async function listAssets(): Promise<Asset[]> {
  const data = await load();
  return data.assets;
}

export async function addAsset(input: {
  url: string;
  name: string;
  description?: string;
}): Promise<Asset> {
  const data = await load();
  const asset: Asset = {
    id: generateId(),
    url: input.url,
    name: input.name,
    description: input.description?.trim() || undefined,
    addedAt: now(),
  };
  data.assets.unshift(asset);
  await save(data);
  return asset;
}

export async function updateAsset(
  id: string,
  updates: Partial<Pick<Asset, "name" | "description">>
): Promise<Asset | null> {
  const data = await load();
  const asset = data.assets.find((a) => a.id === id);
  if (!asset) return null;
  if (updates.name !== undefined) asset.name = updates.name.trim() || asset.name;
  if (updates.description !== undefined) {
    const trimmed = updates.description.trim();
    asset.description = trimmed.length > 0 ? trimmed : undefined;
  }
  await save(data);
  return asset;
}

export async function removeAsset(id: string): Promise<boolean> {
  const data = await load();
  const idx = data.assets.findIndex((a) => a.id === id);
  if (idx === -1) return false;
  data.assets.splice(idx, 1);
  await save(data);
  return true;
}
