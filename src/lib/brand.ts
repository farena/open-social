import { getKvConfig, setKvConfig } from "./kv-config";
import { now } from "./utils";
import type { BrandConfig } from "@/types/brand";
import { DEFAULT_BRAND } from "@/types/brand";

const KV_KEY = "brand";

export async function getBrand(): Promise<BrandConfig> {
  return getKvConfig<BrandConfig>(KV_KEY, DEFAULT_BRAND);
}

export async function updateBrand(
  updates: Partial<Omit<BrandConfig, "createdAt" | "updatedAt">>
): Promise<BrandConfig> {
  const current = await getBrand();
  const updated: BrandConfig = {
    ...current,
    ...updates,
    colors: { ...current.colors, ...updates.colors },
    fonts: { ...current.fonts, ...updates.fonts },
    updatedAt: now(),
    createdAt: current.createdAt || now(),
  };
  await setKvConfig(KV_KEY, updated);
  return updated;
}

export function isBrandConfigured(brand: BrandConfig): boolean {
  return brand.name.trim().length > 0;
}
