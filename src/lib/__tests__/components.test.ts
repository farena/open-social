import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// ---------------------------------------------------------------------------
// DB lifecycle — same pattern as templates.test.ts
// ---------------------------------------------------------------------------

let tempDbPath: string;

beforeEach(() => {
  tempDbPath = path.join(
    os.tmpdir(),
    `kmpus-components-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeCreateInput(overrides: Record<string, unknown> = {}) {
  return {
    name: "Test Component",
    description: "A test component",
    htmlContent: "<p>Hello</p>",
    scssStyles: ".root { color: red; }",
    parametersSchema: [],
    width: 400,
    height: 300,
    tags: ["ui", "card"],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createComponent / getComponent / listComponents — CRUD basics
// ---------------------------------------------------------------------------

describe("createComponent", () => {
  it("persists a row; getComponent returns it; listComponents includes it", async () => {
    const { createComponent, getComponent, listComponents } = await import(
      "@/lib/components"
    );

    const created = await createComponent(makeCreateInput());

    expect(created.id).toBeTruthy();
    expect(created.name).toBe("Test Component");
    expect(created.createdAt).toBeTruthy();
    expect(created.updatedAt).toBeTruthy();

    // getComponent round-trip
    const fetched = await getComponent(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched).toEqual(created);

    // listComponents includes it
    const list = await listComponents();
    expect(list.some((c) => c.id === created.id)).toBe(true);
  });

  it("JSON columns (parametersSchema, tags) round-trip correctly", async () => {
    const { createComponent, getComponent } = await import("@/lib/components");

    const schema = [
      { key: "color", type: "color" as const, defaultValue: "#ff0000" },
      { key: "text", type: "text" as const },
    ];
    const tags = ["button", "cta", "branded"];

    const created = await createComponent(
      makeCreateInput({ parametersSchema: schema, tags }),
    );
    const fetched = await getComponent(created.id);

    expect(fetched?.parametersSchema).toEqual(schema);
    expect(fetched?.tags).toEqual(tags);
  });
});

// ---------------------------------------------------------------------------
// updateComponent
// ---------------------------------------------------------------------------

describe("updateComponent", () => {
  it("patches name only; other fields unchanged; updatedAt advances", async () => {
    const { createComponent, updateComponent, getComponent } = await import(
      "@/lib/components"
    );

    const created = await createComponent(makeCreateInput());
    // Small delay to ensure distinct timestamps
    await new Promise((r) => setTimeout(r, 5));

    const updated = await updateComponent(created.id, { name: "Renamed" });

    expect(updated).not.toBeNull();
    expect(updated!.name).toBe("Renamed");
    // Other fields unchanged
    expect(updated!.htmlContent).toBe(created.htmlContent);
    expect(updated!.scssStyles).toBe(created.scssStyles);
    expect(updated!.width).toBe(created.width);
    expect(updated!.height).toBe(created.height);
    expect(updated!.tags).toEqual(created.tags);
    // updatedAt must have advanced (or at least be different)
    expect(updated!.updatedAt >= created.updatedAt).toBe(true);

    // Also verify via getComponent
    const fetched = await getComponent(created.id);
    expect(fetched!.name).toBe("Renamed");
  });

  it("patches htmlContent and scssStyles; round-trip OK", async () => {
    const { createComponent, updateComponent, getComponent } = await import(
      "@/lib/components"
    );

    const created = await createComponent(makeCreateInput());
    const updated = await updateComponent(created.id, {
      htmlContent: "<div>New HTML</div>",
      scssStyles: ".new { background: blue; }",
    });

    expect(updated!.htmlContent).toBe("<div>New HTML</div>");
    expect(updated!.scssStyles).toBe(".new { background: blue; }");

    const fetched = await getComponent(created.id);
    expect(fetched!.htmlContent).toBe("<div>New HTML</div>");
    expect(fetched!.scssStyles).toBe(".new { background: blue; }");
  });
});

// ---------------------------------------------------------------------------
// deleteComponent
// ---------------------------------------------------------------------------

describe("deleteComponent", () => {
  it("returns true; subsequent getComponent returns null", async () => {
    const { createComponent, deleteComponent, getComponent } = await import(
      "@/lib/components"
    );

    const created = await createComponent(makeCreateInput());
    const result = await deleteComponent(created.id);

    expect(result).toBe(true);

    const fetched = await getComponent(created.id);
    expect(fetched).toBeNull();
  });

  it('returns false for a non-existent id', async () => {
    const { deleteComponent } = await import("@/lib/components");

    const result = await deleteComponent("nonexistent-id");
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// inferParameters
// ---------------------------------------------------------------------------

describe("inferParameters", () => {
  it("merges explicit metadata with inferred keys; explicit wins; gaps default to text", async () => {
    const { inferParameters } = await import("@/lib/components");

    const html = "<p>{{a}}</p>";
    const scss = ".x{color:{{b}};background:{{c}}}";
    const explicit = [{ key: "b", type: "color" as const, defaultValue: "#fff" }];

    const result = inferParameters(html, scss, explicit);

    // Correct count and order: a, b, c
    expect(result).toHaveLength(3);
    expect(result[0].key).toBe("a");
    expect(result[1].key).toBe("b");
    expect(result[2].key).toBe("c");

    // a: default (no explicit entry)
    expect(result[0]).toEqual({ key: "a", type: "text" });

    // b: explicit entry wins
    expect(result[1]).toEqual({ key: "b", type: "color", defaultValue: "#fff" });

    // c: default
    expect(result[2]).toEqual({ key: "c", type: "text" });
  });

  it("silently drops explicit entries whose key is not referenced in HTML/CSS", async () => {
    const { inferParameters } = await import("@/lib/components");

    const html = "<p>{{x}}</p>";
    const scss = "";
    // "orphan" key is explicit but not in html/scss
    const explicit = [
      { key: "x", type: "color" as const },
      { key: "orphan", type: "text" as const },
    ];

    const result = inferParameters(html, scss, explicit);

    expect(result).toHaveLength(1);
    expect(result[0].key).toBe("x");
    expect(result.find((p) => p.key === "orphan")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// saveFromElement
// ---------------------------------------------------------------------------

describe("saveFromElement", () => {
  it("happy path: reads container element and persists as Component", async () => {
    const { createContentItem, appendSlide, addSlideElement } = await import(
      "@/lib/content-items"
    );
    const { saveFromElement } = await import("@/lib/components");

    // Create a content item
    const item = await createContentItem({
      type: "carousel",
      hook: "Test",
      bodyIdea: "Body",
      caption: "Caption",
      hashtags: [],
    });

    // Append a slide
    const withSlide = await appendSlide(item.id, {
      background: { kind: "solid", color: "#ffffff" },
      elements: [],
    });
    const slideId = withSlide!.slides[0].id;

    // Add a container element
    const element = {
      id: "el-container-1",
      kind: "container" as const,
      htmlContent: "<p>{{name}}</p>",
      scssStyles: ".x { color: {{c}} }",
      position: { x: 10, y: 20 },
      size: { w: 500, h: 250 },
    };
    await addSlideElement(item.id, slideId, element);

    // Save as component
    const component = await saveFromElement({
      contentItemId: item.id,
      slideId,
      elementId: "el-container-1",
      name: "My Card",
    });

    expect(component.id).toBeTruthy();
    expect(component.name).toBe("My Card");
    expect(component.htmlContent).toBe("<p>{{name}}</p>");
    expect(component.scssStyles).toBe(".x { color: {{c}} }");
    expect(component.width).toBe(500);
    expect(component.height).toBe(250);
    expect(component.parametersSchema).toEqual([
      { key: "name", type: "text" },
      { key: "c", type: "text" },
    ]);
    expect(component.thumbnailUrl).toBeNull();
    expect(component.tags).toEqual([]);
  });

  it("throws 'slide not found' for a non-existent slide", async () => {
    const { createContentItem } = await import("@/lib/content-items");
    const { saveFromElement } = await import("@/lib/components");

    const item = await createContentItem({
      type: "carousel",
      hook: "Test",
      bodyIdea: "Body",
      caption: "Caption",
      hashtags: [],
    });

    await expect(
      saveFromElement({
        contentItemId: item.id,
        slideId: "nonexistent-slide",
        elementId: "el-1",
        name: "X",
      }),
    ).rejects.toThrow("slide not found");
  });

  it("throws 'element not found' for a non-existent element", async () => {
    const { createContentItem, appendSlide } = await import("@/lib/content-items");
    const { saveFromElement } = await import("@/lib/components");

    const item = await createContentItem({
      type: "carousel",
      hook: "Test",
      bodyIdea: "Body",
      caption: "Caption",
      hashtags: [],
    });
    const withSlide = await appendSlide(item.id, {
      background: { kind: "solid", color: "#ffffff" },
      elements: [],
    });
    const slideId = withSlide!.slides[0].id;

    await expect(
      saveFromElement({
        contentItemId: item.id,
        slideId,
        elementId: "nonexistent-element",
        name: "X",
      }),
    ).rejects.toThrow("element not found");
  });

  it("throws 'element is not a container' for an image element", async () => {
    const { createContentItem, appendSlide, addSlideElement } = await import(
      "@/lib/content-items"
    );
    const { saveFromElement } = await import("@/lib/components");

    const item = await createContentItem({
      type: "carousel",
      hook: "Test",
      bodyIdea: "Body",
      caption: "Caption",
      hashtags: [],
    });
    const withSlide = await appendSlide(item.id, {
      background: { kind: "solid", color: "#ffffff" },
      elements: [],
    });
    const slideId = withSlide!.slides[0].id;

    // Add an image element (not a container)
    const imageElement = {
      id: "el-image-1",
      kind: "image" as const,
      src: "/uploads/test.png",
      position: { x: 0, y: 0 },
      size: { w: 200, h: 200 },
    };
    await addSlideElement(item.id, slideId, imageElement);

    await expect(
      saveFromElement({
        contentItemId: item.id,
        slideId,
        elementId: "el-image-1",
        name: "X",
      }),
    ).rejects.toThrow("element is not a container");
  });
});
