import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let tempDbPath: string;

beforeEach(() => {
  tempDbPath = path.join(
    os.tmpdir(),
    `kmpus-assets-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
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

describe("listAssets", () => {
  it("returns empty array when no assets exist", async () => {
    const { listAssets } = await import("@/lib/assets");
    const result = await listAssets();
    expect(result).toEqual([]);
  });
});

describe("addAsset", () => {
  it("returns the inserted asset with id and addedAt populated", async () => {
    const { addAsset } = await import("@/lib/assets");
    const asset = await addAsset({ url: "/uploads/photo.png", name: "Photo" });
    expect(asset.id).toBeTruthy();
    expect(asset.addedAt).toBeTruthy();
    expect(asset.url).toBe("/uploads/photo.png");
    expect(asset.name).toBe("Photo");
    expect(asset.description).toBeUndefined();
  });

  it("reading back: listAssets returns the added asset", async () => {
    const { addAsset, listAssets } = await import("@/lib/assets");
    const asset = await addAsset({ url: "/uploads/logo.png", name: "Logo", description: "Brand logo" });
    const list = await listAssets();
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual(asset);
  });

  it("persists description when provided", async () => {
    const { addAsset, listAssets } = await import("@/lib/assets");
    await addAsset({ url: "/uploads/logo.png", name: "Logo", description: "Brand logo" });
    const list = await listAssets();
    expect(list[0].description).toBe("Brand logo");
  });

  it("stores undefined (not the string 'undefined') when description is absent", async () => {
    const { addAsset, listAssets } = await import("@/lib/assets");
    await addAsset({ url: "/uploads/photo.png", name: "Photo" });
    const list = await listAssets();
    expect(list[0].description).toBeUndefined();
    expect(list[0].description).not.toBe("undefined");
  });
});

describe("listAssets ordering (unshift semantics — newest first)", () => {
  it("returns assets in newest-first order", async () => {
    const { addAsset, listAssets } = await import("@/lib/assets");
    const a = await addAsset({ url: "/uploads/a.png", name: "Asset A" });
    // Ensure distinct added_at timestamps
    await new Promise((r) => setTimeout(r, 5));
    const b = await addAsset({ url: "/uploads/b.png", name: "Asset B" });
    await new Promise((r) => setTimeout(r, 5));
    const c = await addAsset({ url: "/uploads/c.png", name: "Asset C" });

    const list = await listAssets();
    expect(list).toHaveLength(3);
    expect(list[0].id).toBe(c.id);
    expect(list[1].id).toBe(b.id);
    expect(list[2].id).toBe(a.id);
  });
});

describe("updateAsset", () => {
  it("mutates name only, leaving description unchanged", async () => {
    const { addAsset, updateAsset } = await import("@/lib/assets");
    const asset = await addAsset({ url: "/uploads/a.png", name: "Old Name", description: "My desc" });
    const updated = await updateAsset(asset.id, { name: "New Name" });
    expect(updated).not.toBeNull();
    expect(updated!.name).toBe("New Name");
    expect(updated!.description).toBe("My desc");
    expect(updated!.addedAt).toBe(asset.addedAt);
  });

  it("does not update description when it is not provided in the input", async () => {
    const { addAsset, updateAsset, listAssets } = await import("@/lib/assets");
    const asset = await addAsset({ url: "/uploads/a.png", name: "Name", description: "Keep me" });
    await updateAsset(asset.id, { name: "Updated Name" });
    const list = await listAssets();
    expect(list[0].description).toBe("Keep me");
  });

  it("clears description to undefined when empty trimmed string is passed", async () => {
    const { addAsset, updateAsset } = await import("@/lib/assets");
    const asset = await addAsset({ url: "/uploads/a.png", name: "Name", description: "Had desc" });
    const updated = await updateAsset(asset.id, { description: "   " });
    expect(updated!.description).toBeUndefined();
  });

  it("does not store the literal string 'undefined' when description is cleared", async () => {
    const { addAsset, updateAsset, listAssets } = await import("@/lib/assets");
    const asset = await addAsset({ url: "/uploads/a.png", name: "Name", description: "Had desc" });
    await updateAsset(asset.id, { description: "" });
    const list = await listAssets();
    expect(list[0].description).not.toBe("undefined");
    expect(list[0].description).toBeUndefined();
  });

  it("returns null for a non-existent id", async () => {
    const { updateAsset } = await import("@/lib/assets");
    const result = await updateAsset("nonexistent-id", { name: "X" });
    expect(result).toBeNull();
  });

  it("addedAt is immutable — not changed by updateAsset", async () => {
    const { addAsset, updateAsset } = await import("@/lib/assets");
    const asset = await addAsset({ url: "/uploads/a.png", name: "Name" });
    const updated = await updateAsset(asset.id, { name: "New Name" });
    expect(updated!.addedAt).toBe(asset.addedAt);
  });
});

describe("removeAsset", () => {
  it("returns false for a non-existent id", async () => {
    const { removeAsset } = await import("@/lib/assets");
    const result = await removeAsset("missing-id");
    expect(result).toBe(false);
  });

  it("returns true and removes the asset when it exists", async () => {
    const { addAsset, removeAsset, listAssets } = await import("@/lib/assets");
    const asset = await addAsset({ url: "/uploads/a.png", name: "To Remove" });
    const result = await removeAsset(asset.id);
    expect(result).toBe(true);
    const list = await listAssets();
    expect(list).toHaveLength(0);
  });
});
