import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ContentItem } from "@/types/content-item";

let tempDbPath: string;

// Minimal stub ContentItem for use in tests
function makeContentItem(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    id: "item-001",
    type: "carousel",
    state: "generated",
    hook: "Test Hook",
    bodyIdea: "Body idea",
    caption: "Caption",
    hashtags: [],
    notes: undefined,
    aspectRatio: "4:5",
    slides: [
      {
        id: "slide-001",
        order: 0,
        notes: "slide note",
        background: { kind: "color", color: "#ffffff" } as never,
        elements: [],
        legacyHtml: undefined,
        previousVersions: [{ background: { kind: "color", color: "#000" } as never, elements: [] }],
        nextVersions: [{ background: { kind: "color", color: "#111" } as never, elements: [] }],
      },
    ],
    tags: ["tag-a", "tag-b"],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    downloaded: false,
    ...overrides,
  };
}

beforeEach(() => {
  tempDbPath = path.join(
    os.tmpdir(),
    `kmpus-templates-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
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

describe("listTemplates", () => {
  it("returns [] when the table is empty", async () => {
    const { listTemplates } = await import("@/lib/templates");
    const result = await listTemplates();
    expect(result).toEqual([]);
  });
});

describe("saveAsTemplate", () => {
  it("returns a Template with id and createdAt populated", async () => {
    const { saveAsTemplate } = await import("@/lib/templates");
    const item = makeContentItem();
    const template = await saveAsTemplate(item);
    expect(template.id).toBeTruthy();
    expect(template.createdAt).toBeTruthy();
  });

  it("slide projection omits previousVersions and nextVersions", async () => {
    const { saveAsTemplate } = await import("@/lib/templates");
    const item = makeContentItem();
    const template = await saveAsTemplate(item);
    expect(template.slides).toHaveLength(1);
    const slide = template.slides[0];
    expect(slide).toHaveProperty("id");
    expect(slide).toHaveProperty("order");
    expect(slide).toHaveProperty("notes");
    expect(slide).toHaveProperty("background");
    expect(slide).toHaveProperty("elements");
    // legacyHtml may be present or absent (undefined is stripped) — just no history fields
    expect(slide).not.toHaveProperty("previousVersions");
    expect(slide).not.toHaveProperty("nextVersions");
  });

  it("slide projection preserves the correct field values", async () => {
    const { saveAsTemplate } = await import("@/lib/templates");
    const item = makeContentItem();
    const template = await saveAsTemplate(item);
    const slide = template.slides[0];
    expect(slide.id).toBe("slide-001");
    expect(slide.order).toBe(0);
    expect(slide.notes).toBe("slide note");
  });

  it("reading back via getTemplate is deep-equal to the returned value", async () => {
    const { saveAsTemplate, getTemplate } = await import("@/lib/templates");
    const item = makeContentItem();
    const template = await saveAsTemplate(item);
    const fetched = await getTemplate(template.id);
    expect(fetched).toEqual(template);
  });

  it("defaults name to item.hook when no name is provided", async () => {
    const { saveAsTemplate } = await import("@/lib/templates");
    const item = makeContentItem({ hook: "My Hook" });
    const template = await saveAsTemplate(item);
    expect(template.name).toBe("My Hook");
  });

  it("defaults name to item.id when hook is empty", async () => {
    const { saveAsTemplate } = await import("@/lib/templates");
    const item = makeContentItem({ id: "item-xyz", hook: "" });
    const template = await saveAsTemplate(item);
    expect(template.name).toBe("item-xyz");
  });

  it("honors explicit name and description arguments", async () => {
    const { saveAsTemplate } = await import("@/lib/templates");
    const item = makeContentItem();
    const template = await saveAsTemplate(item, "My Template", "A description");
    expect(template.name).toBe("My Template");
    expect(template.description).toBe("A description");
  });
});

describe("tags round-trip", () => {
  it("persists empty tags array", async () => {
    const { saveAsTemplate, getTemplate } = await import("@/lib/templates");
    const item = makeContentItem({ tags: [] });
    const template = await saveAsTemplate(item);
    const fetched = await getTemplate(template.id);
    expect(fetched?.tags).toEqual([]);
  });

  it("persists single tag", async () => {
    const { saveAsTemplate, getTemplate } = await import("@/lib/templates");
    const item = makeContentItem({ tags: ["only-tag"] });
    const template = await saveAsTemplate(item);
    const fetched = await getTemplate(template.id);
    expect(fetched?.tags).toEqual(["only-tag"]);
  });

  it("persists multiple tags", async () => {
    const { saveAsTemplate, getTemplate } = await import("@/lib/templates");
    const item = makeContentItem({ tags: ["alpha", "beta", "gamma"] });
    const template = await saveAsTemplate(item);
    const fetched = await getTemplate(template.id);
    expect(fetched?.tags).toEqual(["alpha", "beta", "gamma"]);
  });
});

describe("deleteTemplate", () => {
  it("returns false for a missing id", async () => {
    const { deleteTemplate } = await import("@/lib/templates");
    const result = await deleteTemplate("non-existent-id");
    expect(result).toBe(false);
  });

  it("returns true when the template exists", async () => {
    const { saveAsTemplate, deleteTemplate } = await import("@/lib/templates");
    const item = makeContentItem();
    const template = await saveAsTemplate(item);
    const result = await deleteTemplate(template.id);
    expect(result).toBe(true);
  });

  it("getTemplate returns null after deletion", async () => {
    const { saveAsTemplate, deleteTemplate, getTemplate } = await import("@/lib/templates");
    const item = makeContentItem();
    const template = await saveAsTemplate(item);
    await deleteTemplate(template.id);
    const fetched = await getTemplate(template.id);
    expect(fetched).toBeNull();
  });
});

describe("listTemplates ordering", () => {
  it("returns templates in insertion order (created_at ASC)", async () => {
    const { saveAsTemplate, listTemplates } = await import("@/lib/templates");
    const item1 = makeContentItem({ id: "item-001", hook: "First" });
    const item2 = makeContentItem({ id: "item-002", hook: "Second" });

    const t1 = await saveAsTemplate(item1, "Template A");
    // Small delay to ensure distinct timestamps
    await new Promise((r) => setTimeout(r, 5));
    const t2 = await saveAsTemplate(item2, "Template B");

    const list = await listTemplates();
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe(t1.id);
    expect(list[1].id).toBe(t2.id);
  });
});
