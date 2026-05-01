import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_BRAND } from "@/types/brand";

let tempDbPath: string;

beforeEach(() => {
  tempDbPath = path.join(
    os.tmpdir(),
    `kmpus-brand-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
  process.env.TEST_DB_PATH = tempDbPath;
});

afterEach(async () => {
  const { closeDb } = await import("@/lib/db");
  closeDb();
  for (const ext of ["", "-wal", "-shm"]) {
    const f = tempDbPath + ext;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  delete process.env.TEST_DB_PATH;
});

describe("getBrand", () => {
  it("returns DEFAULT_BRAND when the DB is empty", async () => {
    const { getBrand } = await import("@/lib/brand");
    const result = await getBrand();
    expect(result).toEqual(DEFAULT_BRAND);
  });

  it("does not insert a row when returning the default", async () => {
    const { getBrand } = await import("@/lib/brand");
    const { getDb } = await import("@/lib/db");
    await getBrand();
    const db = getDb();
    const row = db
      .prepare("SELECT COUNT(*) as cnt FROM kv_config")
      .get() as { cnt: number };
    expect(row.cnt).toBe(0);
  });
});

describe("updateBrand", () => {
  it("persists changes; subsequent getBrand() reflects them", async () => {
    const { getBrand, updateBrand } = await import("@/lib/brand");
    await updateBrand({ name: "Kmpus" });
    const result = await getBrand();
    expect(result.name).toBe("Kmpus");
  });

  it("partial color update preserves untouched colors", async () => {
    const { getBrand, updateBrand } = await import("@/lib/brand");
    await updateBrand({ colors: { primary: "#ff0000" } as never });
    const result = await getBrand();
    // The non-updated colors should still be the defaults
    expect(result.colors.primary).toBe("#ff0000");
    expect(result.colors.secondary).toBe(DEFAULT_BRAND.colors.secondary);
    expect(result.colors.accent).toBe(DEFAULT_BRAND.colors.accent);
    expect(result.colors.background).toBe(DEFAULT_BRAND.colors.background);
    expect(result.colors.surface).toBe(DEFAULT_BRAND.colors.surface);
  });

  it("partial font update preserves untouched fonts", async () => {
    const { getBrand, updateBrand } = await import("@/lib/brand");
    await updateBrand({ fonts: { heading: "Roboto" } as never });
    const result = await getBrand();
    expect(result.fonts.heading).toBe("Roboto");
    expect(result.fonts.body).toBe(DEFAULT_BRAND.fonts.body);
  });

  it("createdAt is set on first updateBrand call", async () => {
    const { updateBrand } = await import("@/lib/brand");
    const result = await updateBrand({ name: "First" });
    expect(result.createdAt).toBeTruthy();
    expect(result.createdAt.length).toBeGreaterThan(0);
  });

  it("updatedAt advances on every call", async () => {
    const { updateBrand } = await import("@/lib/brand");
    const first = await updateBrand({ name: "First" });
    await new Promise((r) => setTimeout(r, 5));
    const second = await updateBrand({ name: "Second" });
    expect(second.updatedAt > first.updatedAt).toBe(true);
  });

  it("createdAt does not change on subsequent updates", async () => {
    const { updateBrand } = await import("@/lib/brand");
    const first = await updateBrand({ name: "First" });
    await new Promise((r) => setTimeout(r, 5));
    const second = await updateBrand({ name: "Second" });
    expect(second.createdAt).toBe(first.createdAt);
  });
});

describe("isBrandConfigured", () => {
  it("returns false for DEFAULT_BRAND (empty name)", async () => {
    const { isBrandConfigured } = await import("@/lib/brand");
    expect(isBrandConfigured(DEFAULT_BRAND)).toBe(false);
  });

  it("returns true when name is non-empty", async () => {
    const { isBrandConfigured } = await import("@/lib/brand");
    expect(isBrandConfigured({ ...DEFAULT_BRAND, name: "Kmpus" })).toBe(true);
  });
});
