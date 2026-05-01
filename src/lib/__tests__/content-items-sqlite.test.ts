/**
 * Parity tests for the SQLite-backed content-items CRUD.
 *
 * Each test uses a fresh temp DB via TEST_DB_PATH.
 * Imports are dynamic so that the module re-initialises for every test
 * against the new DB path.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MAX_SLIDES } from "@/types/content-item";
import { MAX_VERSIONS } from "@/types/carousel";
import type { SlideInput, NewContentItemInput } from "@/lib/content-items";

// ---------------------------------------------------------------------------
// DB lifecycle
// ---------------------------------------------------------------------------

let tempDbPath: string;

beforeEach(() => {
  tempDbPath = path.join(
    os.tmpdir(),
    `kmpus-ci-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
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

function makeInput(overrides: Partial<NewContentItemInput> = {}): NewContentItemInput {
  return {
    type: "carousel",
    hook: "Test hook",
    bodyIdea: "Test body",
    caption: "Test caption",
    hashtags: ["#test"],
    ...overrides,
  };
}

function makeSlideInput(overrides: Partial<SlideInput> = {}): SlideInput {
  return {
    background: { kind: "solid", color: "#ffffff" },
    elements: [],
    notes: "slide note",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createContentItem
// ---------------------------------------------------------------------------

describe("createContentItem", () => {
  it("assigns an id and populates defaults", async () => {
    const { createContentItem } = await import("@/lib/content-items");
    const item = await createContentItem(makeInput());

    expect(item.id).toBeTruthy();
    expect(item.state).toBe("idea");
    expect(item.slides).toEqual([]);
    expect(item.createdAt).toBeTruthy();
    expect(item.updatedAt).toBeTruthy();
  });

  it("persists the item so getContentItem returns it", async () => {
    const { createContentItem, getContentItem } = await import("@/lib/content-items");
    const created = await createContentItem(makeInput({ hook: "persisted hook" }));
    const fetched = await getContentItem(created.id);

    expect(fetched).not.toBeNull();
    expect(fetched!.hook).toBe("persisted hook");
  });

  it("sets aspectRatio to the default for the type", async () => {
    const { createContentItem } = await import("@/lib/content-items");
    const carousel = await createContentItem(makeInput({ type: "carousel" }));
    expect(carousel.aspectRatio).toBe("4:5");

    const story = await createContentItem(makeInput({ type: "story" }));
    expect(story.aspectRatio).toBe("9:16");
  });
});

// ---------------------------------------------------------------------------
// getContentItem
// ---------------------------------------------------------------------------

describe("getContentItem", () => {
  it("returns null for a missing id", async () => {
    const { getContentItem } = await import("@/lib/content-items");
    const result = await getContentItem("does-not-exist");
    expect(result).toBeNull();
  });

  it("returns the full item including slides", async () => {
    const { createContentItem, appendSlide, getContentItem } = await import(
      "@/lib/content-items"
    );
    const item = await createContentItem(makeInput());
    await appendSlide(item.id, makeSlideInput());
    const fetched = await getContentItem(item.id);

    expect(fetched).not.toBeNull();
    expect(fetched!.slides).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// listContentItems
// ---------------------------------------------------------------------------

describe("listContentItems", () => {
  it("returns an empty array when there are no items", async () => {
    const { listContentItems } = await import("@/lib/content-items");
    const items = await listContentItems();
    expect(items).toEqual([]);
  });

  it("returns all created items", async () => {
    const { createContentItem, listContentItems } = await import("@/lib/content-items");
    await createContentItem(makeInput({ hook: "A" }));
    await createContentItem(makeInput({ hook: "B" }));
    const items = await listContentItems();
    expect(items).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// updateContentItem
// ---------------------------------------------------------------------------

describe("updateContentItem", () => {
  it("returns null for a missing id", async () => {
    const { updateContentItem } = await import("@/lib/content-items");
    const result = await updateContentItem("ghost", { hook: "x" });
    expect(result).toBeNull();
  });

  it("stamps updatedAt", async () => {
    const { createContentItem, updateContentItem } = await import("@/lib/content-items");
    const item = await createContentItem(makeInput());
    const before = item.updatedAt;

    // Ensure at least 1 ms passes
    await new Promise((r) => setTimeout(r, 2));
    const updated = await updateContentItem(item.id, { hook: "new hook" });

    expect(updated!.updatedAt).not.toBe(before);
    expect(updated!.hook).toBe("new hook");
  });

  it("stamps generatedAt on first transition to generated", async () => {
    const { createContentItem, updateContentItem } = await import("@/lib/content-items");
    const item = await createContentItem(makeInput());
    expect(item.generatedAt).toBeUndefined();

    const updated = await updateContentItem(item.id, { state: "generated" });
    expect(updated!.state).toBe("generated");
    expect(updated!.generatedAt).toBeTruthy();
  });

  it("does NOT overwrite generatedAt on subsequent generated transitions", async () => {
    const { createContentItem, updateContentItem } = await import("@/lib/content-items");
    const item = await createContentItem(makeInput());
    const first = await updateContentItem(item.id, { state: "generated" });
    const firstGeneratedAt = first!.generatedAt;

    await new Promise((r) => setTimeout(r, 2));
    const second = await updateContentItem(item.id, { state: "generated" });
    expect(second!.generatedAt).toBe(firstGeneratedAt);
  });
});

// ---------------------------------------------------------------------------
// deleteContentItem
// ---------------------------------------------------------------------------

describe("deleteContentItem", () => {
  it("returns false for a missing id", async () => {
    const { deleteContentItem } = await import("@/lib/content-items");
    expect(await deleteContentItem("ghost")).toBe(false);
  });

  it("removes the item so getContentItem returns null", async () => {
    const { createContentItem, deleteContentItem, getContentItem } = await import(
      "@/lib/content-items"
    );
    const item = await createContentItem(makeInput());
    expect(await deleteContentItem(item.id)).toBe(true);
    expect(await getContentItem(item.id)).toBeNull();
  });

  it("cascades slides (no orphan rows)", async () => {
    const { createContentItem, appendSlide, deleteContentItem } = await import(
      "@/lib/content-items"
    );
    const { getDb } = await import("@/lib/db");
    const item = await createContentItem(makeInput());
    await appendSlide(item.id, makeSlideInput());

    await deleteContentItem(item.id);

    const db = getDb();
    const rows = db
      .prepare("SELECT id FROM slides WHERE content_item_id = ?")
      .all(item.id);
    expect(rows).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// appendSlide
// ---------------------------------------------------------------------------

describe("appendSlide", () => {
  it("appends a slide with the correct order", async () => {
    const { createContentItem, appendSlide } = await import("@/lib/content-items");
    const item = await createContentItem(makeInput());
    const result = await appendSlide(item.id, makeSlideInput());

    expect(result).not.toBeNull();
    expect(result!.slides).toHaveLength(1);
    expect(result!.slides[0].order).toBe(0);
  });

  it("appends multiple slides with consecutive orders", async () => {
    const { createContentItem, appendSlide } = await import("@/lib/content-items");
    const item = await createContentItem(makeInput());
    await appendSlide(item.id, makeSlideInput());
    const result = await appendSlide(item.id, makeSlideInput({ notes: "slide 2" }));

    expect(result!.slides).toHaveLength(2);
    expect(result!.slides[1].order).toBe(1);
  });

  it("returns null when MAX_SLIDES is reached", async () => {
    const { createContentItem, appendSlide } = await import("@/lib/content-items");
    const item = await createContentItem(makeInput());
    for (let i = 0; i < MAX_SLIDES; i++) {
      await appendSlide(item.id, makeSlideInput());
    }
    const overflow = await appendSlide(item.id, makeSlideInput());
    expect(overflow).toBeNull();
  });

  it("does NOT push a snapshot on creation", async () => {
    const { createContentItem, appendSlide } = await import("@/lib/content-items");
    const item = await createContentItem(makeInput());
    const result = await appendSlide(item.id, makeSlideInput());
    expect(result!.slides[0].previousVersions).toHaveLength(0);
  });

  it("returns null for a missing itemId", async () => {
    const { appendSlide } = await import("@/lib/content-items");
    expect(await appendSlide("ghost", makeSlideInput())).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// updateSlide
// ---------------------------------------------------------------------------

describe("updateSlide", () => {
  it("returns null when item is missing", async () => {
    const { updateSlide } = await import("@/lib/content-items");
    expect(await updateSlide("ghost", "ghost-slide", { notes: "x" })).toBeNull();
  });

  it("returns null when slide is missing", async () => {
    const { createContentItem, updateSlide } = await import("@/lib/content-items");
    const item = await createContentItem(makeInput());
    expect(await updateSlide(item.id, "ghost-slide", { notes: "x" })).toBeNull();
  });

  it("pushes a snapshot when background changes", async () => {
    const { createContentItem, appendSlide, updateSlide } = await import(
      "@/lib/content-items"
    );
    const item = await createContentItem(makeInput());
    const withSlide = await appendSlide(item.id, makeSlideInput());
    const slideId = withSlide!.slides[0].id;

    const updated = await updateSlide(item.id, slideId, {
      background: { kind: "solid", color: "#000000" },
    });

    expect(updated!.slides[0].previousVersions).toHaveLength(1);
  });

  it("pushes a snapshot when elements change", async () => {
    const { createContentItem, appendSlide, updateSlide } = await import(
      "@/lib/content-items"
    );
    const item = await createContentItem(makeInput());
    const withSlide = await appendSlide(item.id, makeSlideInput());
    const slideId = withSlide!.slides[0].id;

    const updated = await updateSlide(item.id, slideId, {
      elements: [
        {
          id: "el-1",
          kind: "container",
          htmlContent: "<p>hi</p>",
          position: { x: 0, y: 0 },
          size: { w: 100, h: 50 },
        },
      ],
    });

    expect(updated!.slides[0].previousVersions).toHaveLength(1);
  });

  it("does NOT push a snapshot when only notes change", async () => {
    const { createContentItem, appendSlide, updateSlide } = await import(
      "@/lib/content-items"
    );
    const item = await createContentItem(makeInput());
    const withSlide = await appendSlide(item.id, makeSlideInput());
    const slideId = withSlide!.slides[0].id;

    const updated = await updateSlide(item.id, slideId, { notes: "just notes" });
    expect(updated!.slides[0].previousVersions).toHaveLength(0);
  });

  it("clears nextVersions on every visual edit", async () => {
    const { createContentItem, appendSlide, updateSlide, undoSlide } = await import(
      "@/lib/content-items"
    );
    const item = await createContentItem(makeInput());
    const withSlide = await appendSlide(item.id, makeSlideInput());
    const slideId = withSlide!.slides[0].id;

    // Make a visual edit to build up history
    await updateSlide(item.id, slideId, {
      background: { kind: "solid", color: "#111111" },
    });
    // Undo → nextVersions should have one entry
    const afterUndo = await undoSlide(item.id, slideId);
    expect(afterUndo!.slides[0].nextVersions).toHaveLength(1);

    // Make another visual edit → nextVersions must be cleared
    const afterEdit = await updateSlide(item.id, slideId, {
      background: { kind: "solid", color: "#222222" },
    });
    expect(afterEdit!.slides[0].nextVersions).toHaveLength(0);
  });

  it("FIFO cap: 26 visual edits leave previousVersions.length === MAX_VERSIONS", async () => {
    const { createContentItem, appendSlide, updateSlide } = await import(
      "@/lib/content-items"
    );
    const item = await createContentItem(makeInput());
    const withSlide = await appendSlide(item.id, makeSlideInput());
    const slideId = withSlide!.slides[0].id;

    for (let i = 0; i <= 25; i++) {
      await updateSlide(item.id, slideId, {
        background: { kind: "solid", color: `#${String(i).padStart(6, "0")}` },
      });
    }

    const final = await updateSlide(item.id, slideId, { notes: "noop" }); // no snapshot
    expect(final!.slides[0].previousVersions.length).toBe(MAX_VERSIONS);
  });
});

// ---------------------------------------------------------------------------
// deleteSlide
// ---------------------------------------------------------------------------

describe("deleteSlide", () => {
  it("returns null for missing item", async () => {
    const { deleteSlide } = await import("@/lib/content-items");
    expect(await deleteSlide("ghost", "ghost-slide")).toBeNull();
  });

  it("returns null for missing slide", async () => {
    const { createContentItem, deleteSlide } = await import("@/lib/content-items");
    const item = await createContentItem(makeInput());
    expect(await deleteSlide(item.id, "ghost-slide")).toBeNull();
  });

  it("removes the slide and recomputes order", async () => {
    const { createContentItem, appendSlide, deleteSlide } = await import(
      "@/lib/content-items"
    );
    const item = await createContentItem(makeInput());
    const r1 = await appendSlide(item.id, makeSlideInput({ notes: "a" }));
    await appendSlide(item.id, makeSlideInput({ notes: "b" }));
    await appendSlide(item.id, makeSlideInput({ notes: "c" }));
    const slide0Id = r1!.slides[0].id;

    const result = await deleteSlide(item.id, slide0Id);
    expect(result!.slides).toHaveLength(2);
    expect(result!.slides[0].order).toBe(0);
    expect(result!.slides[1].order).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// reorderSlides
// ---------------------------------------------------------------------------

describe("reorderSlides", () => {
  it("returns null for missing item", async () => {
    const { reorderSlides } = await import("@/lib/content-items");
    expect(await reorderSlides("ghost", [])).toBeNull();
  });

  it("reorders slides to match the input array", async () => {
    const { createContentItem, appendSlide, reorderSlides } = await import(
      "@/lib/content-items"
    );
    const item = await createContentItem(makeInput());
    const r1 = await appendSlide(item.id, makeSlideInput({ notes: "first" }));
    const r2 = await appendSlide(item.id, makeSlideInput({ notes: "second" }));
    const id0 = r1!.slides[0].id;
    const id1 = r2!.slides[1].id;

    const result = await reorderSlides(item.id, [id1, id0]);
    expect(result!.slides[0].notes).toBe("second");
    expect(result!.slides[0].order).toBe(0);
    expect(result!.slides[1].notes).toBe("first");
    expect(result!.slides[1].order).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// undoSlide
// ---------------------------------------------------------------------------

describe("undoSlide", () => {
  it("returns null when there is no history to undo", async () => {
    const { createContentItem, appendSlide, undoSlide } = await import(
      "@/lib/content-items"
    );
    const item = await createContentItem(makeInput());
    const withSlide = await appendSlide(item.id, makeSlideInput());
    const slideId = withSlide!.slides[0].id;

    expect(await undoSlide(item.id, slideId)).toBeNull();
  });

  it("pops previousVersions and pushes current state to nextVersions", async () => {
    const { createContentItem, appendSlide, updateSlide, undoSlide } = await import(
      "@/lib/content-items"
    );
    const item = await createContentItem(makeInput());
    const withSlide = await appendSlide(
      item.id,
      makeSlideInput({ background: { kind: "solid", color: "#ffffff" } }),
    );
    const slideId = withSlide!.slides[0].id;

    await updateSlide(item.id, slideId, {
      background: { kind: "solid", color: "#000000" },
    });

    const afterUndo = await undoSlide(item.id, slideId);
    expect(afterUndo).not.toBeNull();
    // Background should revert to the original white
    expect(afterUndo!.slides[0].background).toEqual({ kind: "solid", color: "#ffffff" });
    // nextVersions should now hold the black state
    expect(afterUndo!.slides[0].nextVersions).toHaveLength(1);
    // previousVersions should be empty again
    expect(afterUndo!.slides[0].previousVersions).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// redoSlide
// ---------------------------------------------------------------------------

describe("redoSlide", () => {
  it("returns null when there is nothing to redo", async () => {
    const { createContentItem, appendSlide, redoSlide } = await import(
      "@/lib/content-items"
    );
    const item = await createContentItem(makeInput());
    const withSlide = await appendSlide(item.id, makeSlideInput());
    const slideId = withSlide!.slides[0].id;

    expect(await redoSlide(item.id, slideId)).toBeNull();
  });

  it("pops nextVersions and pushes current state to previousVersions", async () => {
    const { createContentItem, appendSlide, updateSlide, undoSlide, redoSlide } =
      await import("@/lib/content-items");
    const item = await createContentItem(makeInput());
    const withSlide = await appendSlide(
      item.id,
      makeSlideInput({ background: { kind: "solid", color: "#ffffff" } }),
    );
    const slideId = withSlide!.slides[0].id;

    await updateSlide(item.id, slideId, {
      background: { kind: "solid", color: "#000000" },
    });
    await undoSlide(item.id, slideId);

    const afterRedo = await redoSlide(item.id, slideId);
    expect(afterRedo).not.toBeNull();
    // Should be back to black
    expect(afterRedo!.slides[0].background).toEqual({ kind: "solid", color: "#000000" });
    // nextVersions emptied again
    expect(afterRedo!.slides[0].nextVersions).toHaveLength(0);
    // previousVersions has the white state
    expect(afterRedo!.slides[0].previousVersions).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// addSlideElement
// ---------------------------------------------------------------------------

describe("addSlideElement", () => {
  it("returns null for missing item", async () => {
    const { addSlideElement } = await import("@/lib/content-items");
    expect(
      await addSlideElement("ghost", "ghost-slide", {
        id: "e1",
        kind: "container",
        htmlContent: "<p>hi</p>",
        position: { x: 0, y: 0 },
        size: { w: 10, h: 10 },
      }),
    ).toBeNull();
  });

  it("appends the element and pushes a snapshot", async () => {
    const { createContentItem, appendSlide, addSlideElement } = await import(
      "@/lib/content-items"
    );
    const item = await createContentItem(makeInput());
    const withSlide = await appendSlide(item.id, makeSlideInput());
    const slideId = withSlide!.slides[0].id;

    const element = {
      id: "el-new",
      kind: "container" as const,
      htmlContent: "<p>hello</p>",
      position: { x: 0, y: 0 },
      size: { w: 100, h: 50 },
    };

    const result = await addSlideElement(item.id, slideId, element);
    expect(result).not.toBeNull();
    expect(result!.item.slides[0].elements).toHaveLength(1);
    // snapshot was pushed
    expect(result!.item.slides[0].previousVersions).toHaveLength(1);
    expect(result!.element).toEqual(element);
  });
});

// ---------------------------------------------------------------------------
// updateSlideElement
// ---------------------------------------------------------------------------

describe("updateSlideElement", () => {
  it("returns null when element is missing", async () => {
    const { createContentItem, appendSlide, updateSlideElement } = await import(
      "@/lib/content-items"
    );
    const item = await createContentItem(makeInput());
    const withSlide = await appendSlide(item.id, makeSlideInput());
    const slideId = withSlide!.slides[0].id;

    expect(
      await updateSlideElement(item.id, slideId, "ghost-el", { opacity: 0.5 }),
    ).toBeNull();
  });

  it("updates the element and pushes a snapshot", async () => {
    const { createContentItem, appendSlide, addSlideElement, updateSlideElement } =
      await import("@/lib/content-items");
    const item = await createContentItem(makeInput());
    const withSlide = await appendSlide(item.id, makeSlideInput());
    const slideId = withSlide!.slides[0].id;

    const element = {
      id: "el-upd",
      kind: "container" as const,
      htmlContent: "<p>hi</p>",
      position: { x: 0, y: 0 },
      size: { w: 100, h: 50 },
    };
    await addSlideElement(item.id, slideId, element);

    const result = await updateSlideElement(item.id, slideId, "el-upd", {
      opacity: 0.5,
    });
    expect(result).not.toBeNull();
    expect(result!.element.opacity).toBe(0.5);
    // At least 2 snapshots: one from addSlideElement, one from updateSlideElement
    expect(result!.item.slides[0].previousVersions.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// removeSlideElement
// ---------------------------------------------------------------------------

describe("removeSlideElement", () => {
  it("returns null when element is missing", async () => {
    const { createContentItem, appendSlide, removeSlideElement } = await import(
      "@/lib/content-items"
    );
    const item = await createContentItem(makeInput());
    const withSlide = await appendSlide(item.id, makeSlideInput());
    const slideId = withSlide!.slides[0].id;

    expect(await removeSlideElement(item.id, slideId, "ghost-el")).toBeNull();
  });

  it("removes the element and pushes a snapshot", async () => {
    const { createContentItem, appendSlide, addSlideElement, removeSlideElement } =
      await import("@/lib/content-items");
    const item = await createContentItem(makeInput());
    const withSlide = await appendSlide(item.id, makeSlideInput());
    const slideId = withSlide!.slides[0].id;

    const element = {
      id: "el-rem",
      kind: "container" as const,
      htmlContent: "<p>remove me</p>",
      position: { x: 0, y: 0 },
      size: { w: 100, h: 50 },
    };
    await addSlideElement(item.id, slideId, element);

    const result = await removeSlideElement(item.id, slideId, "el-rem");
    expect(result).not.toBeNull();
    expect(result!.slides[0].elements).toHaveLength(0);
    // 2 snapshots: addSlideElement + removeSlideElement
    expect(result!.slides[0].previousVersions.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// updateSlideBackground
// ---------------------------------------------------------------------------

describe("updateSlideBackground", () => {
  it("returns null for missing item", async () => {
    const { updateSlideBackground } = await import("@/lib/content-items");
    expect(
      await updateSlideBackground("ghost", "ghost-slide", {
        kind: "solid",
        color: "#000",
      }),
    ).toBeNull();
  });

  it("updates the background and pushes a snapshot", async () => {
    const { createContentItem, appendSlide, updateSlideBackground } = await import(
      "@/lib/content-items"
    );
    const item = await createContentItem(makeInput());
    const withSlide = await appendSlide(
      item.id,
      makeSlideInput({ background: { kind: "solid", color: "#ffffff" } }),
    );
    const slideId = withSlide!.slides[0].id;

    const result = await updateSlideBackground(item.id, slideId, {
      kind: "solid",
      color: "#ff0000",
    });
    expect(result).not.toBeNull();
    expect((result!.slides[0].background as { color: string }).color).toBe("#ff0000");
    expect(result!.slides[0].previousVersions).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// addContentItemAsset — NOT a visual edit, no slide snapshot
// ---------------------------------------------------------------------------

describe("addContentItemAsset", () => {
  it("returns null for missing item", async () => {
    const { addContentItemAsset } = await import("@/lib/content-items");
    expect(
      await addContentItemAsset("ghost", {
        id: "a1",
        url: "/uploads/a.png",
        name: "test",
        addedAt: new Date().toISOString(),
      }),
    ).toBeNull();
  });

  it("prepends the asset and does NOT push a slide snapshot", async () => {
    const { createContentItem, appendSlide, addContentItemAsset } = await import(
      "@/lib/content-items"
    );
    const item = await createContentItem(makeInput());
    const withSlide = await appendSlide(item.id, makeSlideInput());
    const slideId = withSlide!.slides[0].id;

    const result = await addContentItemAsset(item.id, {
      id: "a1",
      url: "/uploads/a.png",
      name: "My asset",
      addedAt: new Date().toISOString(),
    });
    expect(result).not.toBeNull();
    expect(result!.assets).toHaveLength(1);
    // No slide snapshot pushed
    const slide = result!.slides.find((s) => s.id === slideId);
    expect(slide!.previousVersions).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// updateContentItemAsset
// ---------------------------------------------------------------------------

describe("updateContentItemAsset", () => {
  it("returns null for missing item", async () => {
    const { updateContentItemAsset } = await import("@/lib/content-items");
    expect(await updateContentItemAsset("ghost", "a1", { name: "x" })).toBeNull();
  });

  it("updates asset name and description", async () => {
    const { createContentItem, addContentItemAsset, updateContentItemAsset } =
      await import("@/lib/content-items");
    const item = await createContentItem(makeInput());
    await addContentItemAsset(item.id, {
      id: "a1",
      url: "/uploads/a.png",
      name: "original",
      addedAt: new Date().toISOString(),
    });

    const updated = await updateContentItemAsset(item.id, "a1", {
      name: "updated name",
      description: "a desc",
    });
    expect(updated).not.toBeNull();
    expect(updated!.name).toBe("updated name");
    expect(updated!.description).toBe("a desc");
  });
});

// ---------------------------------------------------------------------------
// removeContentItemAsset
// ---------------------------------------------------------------------------

describe("removeContentItemAsset", () => {
  it("returns false for missing item", async () => {
    const { removeContentItemAsset } = await import("@/lib/content-items");
    expect(await removeContentItemAsset("ghost", "a1")).toBe(false);
  });

  it("removes the asset", async () => {
    const { createContentItem, addContentItemAsset, removeContentItemAsset, getContentItem } =
      await import("@/lib/content-items");
    const item = await createContentItem(makeInput());
    await addContentItemAsset(item.id, {
      id: "a1",
      url: "/uploads/a.png",
      name: "to delete",
      addedAt: new Date().toISOString(),
    });

    const removed = await removeContentItemAsset(item.id, "a1");
    expect(removed).toBe(true);

    const fetched = await getContentItem(item.id);
    expect(fetched!.assets ?? []).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// addReferenceImage — NOT a visual edit
// ---------------------------------------------------------------------------

describe("addReferenceImage", () => {
  it("returns null for missing item", async () => {
    const { addReferenceImage } = await import("@/lib/content-items");
    expect(
      await addReferenceImage("ghost", {
        id: "r1",
        url: "/uploads/r.png",
        absPath: "/abs/r.png",
        name: "ref",
        addedAt: new Date().toISOString(),
      }),
    ).toBeNull();
  });

  it("appends the reference image and does NOT push a slide snapshot", async () => {
    const { createContentItem, appendSlide, addReferenceImage } = await import(
      "@/lib/content-items"
    );
    const item = await createContentItem(makeInput());
    const withSlide = await appendSlide(item.id, makeSlideInput());
    const slideId = withSlide!.slides[0].id;

    const result = await addReferenceImage(item.id, {
      id: "r1",
      url: "/uploads/r.png",
      absPath: "/abs/r.png",
      name: "ref",
      addedAt: new Date().toISOString(),
    });
    expect(result).not.toBeNull();
    expect(result!.referenceImages).toHaveLength(1);
    // No slide snapshot
    const slide = result!.slides.find((s) => s.id === slideId);
    expect(slide!.previousVersions).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// removeReferenceImage
// ---------------------------------------------------------------------------

describe("removeReferenceImage", () => {
  it("returns false for missing item", async () => {
    const { removeReferenceImage } = await import("@/lib/content-items");
    expect(await removeReferenceImage("ghost", "r1")).toBe(false);
  });

  it("removes the reference image", async () => {
    const { createContentItem, addReferenceImage, removeReferenceImage, getContentItem } =
      await import("@/lib/content-items");
    const item = await createContentItem(makeInput());
    await addReferenceImage(item.id, {
      id: "r1",
      url: "/uploads/r.png",
      absPath: "/abs/r.png",
      name: "ref",
      addedAt: new Date().toISOString(),
    });

    const removed = await removeReferenceImage(item.id, "r1");
    expect(removed).toBe(true);

    const fetched = await getContentItem(item.id);
    expect(fetched!.referenceImages ?? []).toHaveLength(0);
  });
});
