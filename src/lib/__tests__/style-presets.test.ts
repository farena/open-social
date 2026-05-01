import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let tempDbPath: string;

beforeEach(() => {
  tempDbPath = path.join(
    os.tmpdir(),
    `kmpus-style-presets-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
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

describe("listPresets", () => {
  it("returns an empty array when the DB is empty", async () => {
    const { listPresets } = await import("@/lib/style-presets");
    const result = await listPresets();
    expect(result).toEqual([]);
  });
});

describe("createPreset / getPreset round-trip", () => {
  it("round-trips a preset with full equality", async () => {
    const { createPreset, getPreset } = await import("@/lib/style-presets");
    const params = {
      name: "Bold & Colorful",
      description: "High contrast preset",
      brand: {
        name: "Kmpus",
        tagline: "Test tagline",
        colors: { primary: "#ff0000", secondary: "#00ff00", accent: "#0000ff", background: "#ffffff", text: "#000000" },
        fonts: { heading: "Inter", body: "Roboto" },
        logoUrl: "",
        configured: true,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      },
      designRules: "Use bold typography with high-contrast colors",
      exampleSlideHtml: "<div style='background:#ff0000; color:#fff;'><h1>Hello</h1></div>",
      aspectRatio: "4:5" as const,
      tags: ["bold", "colorful", "high-contrast"],
    };

    const created = await createPreset(params);
    expect(created.id).toBeTruthy();
    expect(created.createdAt).toBeTruthy();
    expect(created.name).toBe(params.name);
    expect(created.description).toBe(params.description);

    const fetched = await getPreset(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched).toEqual(created);
  });

  it("getPreset returns null for a missing id", async () => {
    const { getPreset } = await import("@/lib/style-presets");
    const result = await getPreset("nonexistent-id");
    expect(result).toBeNull();
  });
});

describe("listPresets ordering", () => {
  it("returns presets in insertion order (ORDER BY created_at ASC)", async () => {
    const { createPreset, listPresets } = await import("@/lib/style-presets");

    const baseParams = {
      brand: {
        name: "Brand",
        tagline: "",
        colors: { primary: "#000", secondary: "#111", accent: "#222", background: "#fff", text: "#333" },
        fonts: { heading: "Inter", body: "Inter" },
        logoUrl: "",
        configured: false,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      },
      designRules: "rules",
      exampleSlideHtml: "<div></div>",
      aspectRatio: "1:1" as const,
      tags: [],
    };

    const first = await createPreset({ ...baseParams, name: "First", description: "desc 1" });
    await new Promise((r) => setTimeout(r, 5));
    const second = await createPreset({ ...baseParams, name: "Second", description: "desc 2" });
    await new Promise((r) => setTimeout(r, 5));
    const third = await createPreset({ ...baseParams, name: "Third", description: "desc 3" });

    const list = await listPresets();
    expect(list).toHaveLength(3);
    expect(list[0].id).toBe(first.id);
    expect(list[1].id).toBe(second.id);
    expect(list[2].id).toBe(third.id);
  });
});

describe("deletePreset", () => {
  it("returns false for a missing id", async () => {
    const { deletePreset } = await import("@/lib/style-presets");
    const result = await deletePreset("nonexistent-id");
    expect(result).toBe(false);
  });

  it("returns true for a present id and subsequent getPreset returns null", async () => {
    const { createPreset, deletePreset, getPreset } = await import("@/lib/style-presets");
    const preset = await createPreset({
      name: "To Delete",
      description: "Will be deleted",
      brand: {
        name: "Brand",
        tagline: "",
        colors: { primary: "#000", secondary: "#111", accent: "#222", background: "#fff", text: "#333" },
        fonts: { heading: "Inter", body: "Inter" },
        logoUrl: "",
        configured: false,
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      },
      designRules: "rules",
      exampleSlideHtml: "<div></div>",
      aspectRatio: "1:1" as const,
      tags: [],
    });

    const deleted = await deletePreset(preset.id);
    expect(deleted).toBe(true);

    const fetched = await getPreset(preset.id);
    expect(fetched).toBeNull();
  });
});

describe("payload JSON column carries all fields beyond id/name/description/createdAt", () => {
  it("round-trips non-trivial nested payload data faithfully", async () => {
    const { createPreset, getPreset } = await import("@/lib/style-presets");

    const nestedBrand = {
      name: "Kmpus Edu",
      tagline: "Managing schools with ease",
      colors: {
        primary: "#1a73e8",
        secondary: "#34a853",
        accent: "#fbbc04",
        background: "#f8f9fa",
        text: "#202124",
      },
      fonts: { heading: "Playfair Display", body: "Open Sans" },
      logoUrl: "/uploads/logo.png",
      configured: true,
      createdAt: "2024-03-15T10:00:00.000Z",
      updatedAt: "2024-04-01T12:00:00.000Z",
    };

    const params = {
      name: "Complex Preset",
      description: "Has deeply nested brand + multiple tags",
      brand: nestedBrand,
      designRules:
        "Rule 1: Use primary color for headings.\nRule 2: Body text in Open Sans 16px.\nRule 3: Accent for CTAs only.",
      exampleSlideHtml:
        "<div style='background:#1a73e8'><h1 style='font-family:Playfair Display'>Title</h1><p>Body</p></div>",
      aspectRatio: "9:16" as const,
      tags: ["education", "corporate", "blue", "multi-font"],
    };

    const created = await createPreset(params);
    const fetched = await getPreset(created.id);

    expect(fetched).not.toBeNull();
    // Verify payload fields survive the SQLite round-trip
    expect(fetched!.brand).toEqual(nestedBrand);
    expect(fetched!.designRules).toBe(params.designRules);
    expect(fetched!.exampleSlideHtml).toBe(params.exampleSlideHtml);
    expect(fetched!.aspectRatio).toBe(params.aspectRatio);
    expect(fetched!.tags).toEqual(params.tags);
  });
});
