import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ContentItem } from "@/types/content-item";
import type { Slide } from "@/types/carousel";

let tempDbPath: string;

beforeEach(() => {
  tempDbPath = path.join(
    os.tmpdir(),
    `kmpus-test-row-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
  process.env.KMPUS_DB_PATH = tempDbPath;
});

afterEach(async () => {
  const { closeDb } = await import("@/lib/db");
  closeDb();
  for (const ext of ["", "-wal", "-shm"]) {
    const f = tempDbPath + ext;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  delete process.env.KMPUS_DB_PATH;
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSlide(overrides: Partial<Slide> = {}): Slide {
  return {
    id: "slide-1",
    order: 0,
    notes: "slide notes",
    background: { kind: "solid", color: "#ffffff" },
    elements: [
      {
        id: "el-1",
        kind: "container",
        htmlContent: "<p>Hello</p>",
        position: { x: 0, y: 0 },
        size: { w: 100, h: 50 },
        rotation: 0,
        opacity: 1,
      },
      {
        id: "el-2",
        kind: "image",
        src: "/uploads/img.png",
        position: { x: 10, y: 20 },
        size: { w: 200, h: 200 },
      },
    ],
    previousVersions: [
      {
        background: { kind: "solid", color: "#000000" },
        elements: [],
      },
    ],
    nextVersions: [
      {
        background: { kind: "gradient", angle: 45, stops: [{ offset: 0, color: "#ff0000" }, { offset: 1, color: "#0000ff" }] },
        elements: [],
        legacyHtml: "<div>old</div>",
      },
    ],
    ...overrides,
  };
}

function makeFullContentItem(): ContentItem {
  return {
    id: "item-1",
    type: "carousel",
    state: "generated",
    hook: "A great hook",
    bodyIdea: "The body idea",
    caption: "The caption",
    hashtags: ["#marketing", "#growth"],
    notes: "Some notes",
    aspectRatio: "4:5",
    slides: [
      makeSlide({ id: "slide-1", order: 0 }),
      makeSlide({
        id: "slide-2",
        order: 1,
        notes: "second slide",
        background: { kind: "image", src: "/uploads/bg.png", fit: "cover" },
        previousVersions: [],
        nextVersions: [],
      }),
    ],
    chatSessionId: "session-abc",
    referenceImages: [
      {
        id: "ref-1",
        url: "/uploads/ref.png",
        absPath: "/abs/path/ref.png",
        name: "Reference",
        addedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    assets: [
      {
        id: "asset-1",
        url: "/uploads/asset.png",
        name: "Asset",
        description: "A test asset",
        addedAt: "2026-01-02T00:00:00.000Z",
      },
    ],
    tags: ["tag-a", "tag-b"],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    generatedAt: "2026-01-02T01:00:00.000Z",
  };
}

function makeMinimalContentItem(): ContentItem {
  return {
    id: "item-2",
    type: "post",
    state: "idea",
    hook: "Simple hook",
    bodyIdea: "",
    caption: "",
    hashtags: [],
    aspectRatio: "1:1",
    slides: [
      {
        id: "slide-min",
        order: 0,
        notes: "",
        background: { kind: "solid", color: "#cccccc" },
        elements: [],
        previousVersions: [],
        nextVersions: [],
      },
    ],
    createdAt: "2026-02-01T00:00:00.000Z",
    updatedAt: "2026-02-01T00:00:00.000Z",
    // notes, chatSessionId, referenceImages, assets, tags, generatedAt — all absent
  };
}

// ---------------------------------------------------------------------------
// Test A: Fully-populated ContentItem round-trip
// ---------------------------------------------------------------------------

describe("Test A — fully-populated ContentItem round-trip", () => {
  it("survives serializeContentItem → deserializeContentItem with deep equality", async () => {
    const { serializeContentItem, deserializeContentItem } = await import(
      "@/lib/content-item-row"
    );

    const original = makeFullContentItem();
    const { itemRow, slideRows } = serializeContentItem(original);
    const roundTripped = deserializeContentItem(itemRow, slideRows);

    expect(roundTripped).toEqual(original);
  });
});

// ---------------------------------------------------------------------------
// Test B: Empty/null optionals — absent fields stay absent
// ---------------------------------------------------------------------------

describe("Test B — empty/null optionals round-trip", () => {
  it("absent optional fields are not present as null in deserialized object", async () => {
    const { serializeContentItem, deserializeContentItem } = await import(
      "@/lib/content-item-row"
    );

    const original = makeMinimalContentItem();
    const { itemRow, slideRows } = serializeContentItem(original);
    const roundTripped = deserializeContentItem(itemRow, slideRows);

    expect(roundTripped).toEqual(original);

    // Explicitly verify absent optionals are not set to null
    expect(roundTripped).not.toHaveProperty("notes", null);
    expect(roundTripped).not.toHaveProperty("chatSessionId", null);
    expect(roundTripped).not.toHaveProperty("referenceImages", null);
    expect(roundTripped).not.toHaveProperty("assets", null);
    expect(roundTripped).not.toHaveProperty("tags", null);
    expect(roundTripped).not.toHaveProperty("generatedAt", null);
  });
});

// ---------------------------------------------------------------------------
// Test C: nextVersions with 3 entries survives round-trip
// ---------------------------------------------------------------------------

describe("Test C — redo state (nextVersions) survives round-trip", () => {
  it("a slide with 3 nextVersions entries round-trips faithfully", async () => {
    const { serializeContentItem, deserializeContentItem } = await import(
      "@/lib/content-item-row"
    );

    const slide = makeSlide({
      id: "slide-redo",
      order: 0,
      previousVersions: [],
      nextVersions: [
        { background: { kind: "solid", color: "#111111" }, elements: [] },
        { background: { kind: "solid", color: "#222222" }, elements: [] },
        {
          background: { kind: "solid", color: "#333333" },
          elements: [
            {
              id: "el-snap",
              kind: "container",
              htmlContent: "<b>snap</b>",
              position: { x: 5, y: 5 },
              size: { w: 10, h: 10 },
            },
          ],
          legacyHtml: undefined,
        },
      ],
    });

    const item: ContentItem = {
      ...makeMinimalContentItem(),
      id: "item-redo",
      slides: [slide],
    };

    const { itemRow, slideRows } = serializeContentItem(item);
    const roundTripped = deserializeContentItem(itemRow, slideRows);

    expect(roundTripped.slides[0].nextVersions).toHaveLength(3);
    expect(roundTripped.slides[0].nextVersions).toEqual(slide.nextVersions);
  });
});

// ---------------------------------------------------------------------------
// Test D: Zod validation — malformed row throws in non-production
// ---------------------------------------------------------------------------

describe("Test D — zod validation on malformed row", () => {
  it("throws when hashtags column contains invalid JSON", async () => {
    const { serializeContentItem, deserializeContentItem } = await import(
      "@/lib/content-item-row"
    );

    const original = makeFullContentItem();
    const { itemRow, slideRows } = serializeContentItem(original);

    // Corrupt the hashtags column
    const corruptedRow = { ...itemRow, hashtags: "not-json" };

    expect(() => deserializeContentItem(corruptedRow, slideRows)).toThrow();
  });
});
