/**
 * Unit tests for content-item-level snapshot lifecycle.
 *
 * Each test uses a fresh temp DB via KMPUS_DB_PATH.
 * Imports are dynamic so that the module re-initialises for every test
 * against the new DB path.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { NewContentItemInput, SlideInput } from "@/lib/content-items";

// ---------------------------------------------------------------------------
// DB lifecycle
// ---------------------------------------------------------------------------

let tempDbPath: string;

beforeEach(() => {
  tempDbPath = path.join(
    os.tmpdir(),
    `kmpus-snap-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
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
// Push & list
// ---------------------------------------------------------------------------

describe("pushItemSnapshot + listItemSnapshots", () => {
  it("inserts one row and returns it via listItemSnapshots (no payload in list)", async () => {
    const { createContentItem } = await import("@/lib/content-items");
    const { pushItemSnapshot, listItemSnapshots } = await import(
      "@/lib/content-item-snapshots"
    );

    const item = await createContentItem(makeInput());
    const snap = await pushItemSnapshot(item.id, "generate");

    expect(snap).not.toBeNull();
    expect(snap!.trigger).toBe("generate");
    expect(snap!.id).toBeTruthy();
    expect(snap!.createdAt).toBeTruthy();
    expect(snap!.label).toBeUndefined();

    const list = await listItemSnapshots(item.id);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(snap!.id);
    expect(list[0].trigger).toBe("generate");
    expect(list[0].createdAt).toBe(snap!.createdAt);
    // payload must NOT appear in list items
    expect("payload" in list[0]).toBe(false);
  });

  it("persists the label and returns it via listItemSnapshots", async () => {
    const { createContentItem } = await import("@/lib/content-items");
    const { pushItemSnapshot, listItemSnapshots } = await import(
      "@/lib/content-item-snapshots"
    );

    const item = await createContentItem(makeInput());
    await pushItemSnapshot(item.id, "chat", "hello world");

    const list = await listItemSnapshots(item.id);
    expect(list).toHaveLength(1);
    expect(list[0].label).toBe("hello world");
  });
});

// ---------------------------------------------------------------------------
// FIFO = 5
// ---------------------------------------------------------------------------

describe("FIFO retention", () => {
  it("after 6 pushes, only 5 rows remain and the oldest is gone", async () => {
    const { createContentItem } = await import("@/lib/content-items");
    const { pushItemSnapshot, listItemSnapshots, MAX_ITEM_SNAPSHOTS } =
      await import("@/lib/content-item-snapshots");
    const { getDb } = await import("@/lib/db");

    const item = await createContentItem(makeInput());

    // Push 6 snapshots with slightly different labels to make them distinguishable
    const snaps = [];
    for (let i = 0; i < 6; i++) {
      // Ensure unique created_at by bumping time
      await new Promise((r) => setTimeout(r, 2));
      const s = await pushItemSnapshot(item.id, "generate", `snap-${i}`);
      snaps.push(s!);
    }

    // COUNT via raw DB
    const db = getDb();
    const row = db
      .prepare(
        "SELECT COUNT(*) as cnt FROM content_item_snapshots WHERE content_item_id = ?",
      )
      .get(item.id) as { cnt: number };
    expect(row.cnt).toBe(MAX_ITEM_SNAPSHOTS);

    // listItemSnapshots returns newest-first
    const list = await listItemSnapshots(item.id);
    expect(list).toHaveLength(MAX_ITEM_SNAPSHOTS);

    // The oldest (snap-0) must be gone
    const labels = list.map((s) => s.label);
    expect(labels).not.toContain("snap-0");
    // The newest (snap-5) must be present
    expect(labels).toContain("snap-5");
  });
});

// ---------------------------------------------------------------------------
// Unknown item
// ---------------------------------------------------------------------------

describe("pushItemSnapshot for unknown item", () => {
  it("returns null and inserts nothing", async () => {
    const { pushItemSnapshot } = await import("@/lib/content-item-snapshots");
    const { getDb } = await import("@/lib/db");

    const result = await pushItemSnapshot("does-not-exist", "chat");
    expect(result).toBeNull();

    const db = getDb();
    const row = db
      .prepare("SELECT COUNT(*) as cnt FROM content_item_snapshots")
      .get() as { cnt: number };
    expect(row.cnt).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Restore happy path
// ---------------------------------------------------------------------------

describe("restoreItemSnapshot", () => {
  it("restores the item and slides to the snapshot state", async () => {
    const { createContentItem, appendSlide, updateContentItem } = await import(
      "@/lib/content-items"
    );
    const {
      pushItemSnapshot,
      restoreItemSnapshot,
      listItemSnapshots,
    } = await import("@/lib/content-item-snapshots");
    const { getDb } = await import("@/lib/db");

    // Create item with 2 slides
    const item = await createContentItem(makeInput());
    await appendSlide(item.id, makeSlideInput({ notes: "slide-1" }));
    await appendSlide(item.id, makeSlideInput({ notes: "slide-2" }));

    // Push snapshot (original state)
    const snap = await pushItemSnapshot(item.id, "generate");
    expect(snap).not.toBeNull();
    const snapId = snap!.id;

    // Mutate: change hook and add a 3rd slide
    await updateContentItem(item.id, { hook: "new hook after mutation" });
    await appendSlide(item.id, makeSlideInput({ notes: "slide-3" }));

    // Restore
    const restored = await restoreItemSnapshot(item.id, snapId);
    expect(restored).not.toBeNull();

    // Hook should be original, not "new hook after mutation"
    expect(restored!.hook).toBe(item.hook);
    // Slides should match the original 2 slides (not 3)
    expect(restored!.slides).toHaveLength(2);
    expect(restored!.slides[0].notes).toBe("slide-1");
    expect(restored!.slides[1].notes).toBe("slide-2");

    // After restore, snapshot count should be 2:
    // original ("generate") + defensive ("pre-restore")
    const db = getDb();
    const cntRow = db
      .prepare(
        "SELECT COUNT(*) as cnt FROM content_item_snapshots WHERE content_item_id = ?",
      )
      .get(item.id) as { cnt: number };
    expect(cntRow.cnt).toBe(2);

    // The defensive snapshot should have trigger "pre-restore"
    const list = await listItemSnapshots(item.id);
    const preRestoreSnap = list.find((s) => s.trigger === "pre-restore");
    expect(preRestoreSnap).toBeDefined();
  });

  it("the pre-restore snapshot payload holds the mutated (pre-restore) state", async () => {
    const { createContentItem, appendSlide, updateContentItem } = await import(
      "@/lib/content-items"
    );
    const { pushItemSnapshot, restoreItemSnapshot } = await import(
      "@/lib/content-item-snapshots"
    );
    const { getDb } = await import("@/lib/db");

    const item = await createContentItem(makeInput());
    await appendSlide(item.id, makeSlideInput({ notes: "original-slide" }));

    const snap = await pushItemSnapshot(item.id, "generate");

    // Mutate
    await updateContentItem(item.id, { hook: "mutated hook" });

    await restoreItemSnapshot(item.id, snap!.id);

    // Get the pre-restore snapshot from DB (it should be the newest one)
    const db = getDb();
    const preRestoreRow = db
      .prepare(
        `SELECT payload FROM content_item_snapshots WHERE content_item_id = ? AND trigger = 'pre-restore'`,
      )
      .get(item.id) as { payload: string } | undefined;

    expect(preRestoreRow).toBeDefined();
    const payload = JSON.parse(preRestoreRow!.payload) as {
      itemRow: { hook: string };
      slideRows: unknown[];
    };
    // The pre-restore payload is the mutated state
    expect(payload.itemRow.hook).toBe("mutated hook");
  });

  it("FIFO interaction: pushing 5 then restoring keeps total <= 5", async () => {
    const { createContentItem, appendSlide, updateContentItem } = await import(
      "@/lib/content-items"
    );
    const { pushItemSnapshot, restoreItemSnapshot, MAX_ITEM_SNAPSHOTS } =
      await import("@/lib/content-item-snapshots");
    const { getDb } = await import("@/lib/db");

    const item = await createContentItem(makeInput());
    await appendSlide(item.id, makeSlideInput());

    // Push 5 snapshots
    const snaps = [];
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 2));
      const s = await pushItemSnapshot(item.id, "generate", `snap-${i}`);
      snaps.push(s!);
    }

    // Mutate
    await updateContentItem(item.id, { hook: "hook after 5 snaps" });

    // Restore the second-oldest (snaps[1])
    await restoreItemSnapshot(item.id, snaps[1].id);

    const db = getDb();
    const cntRow = db
      .prepare(
        "SELECT COUNT(*) as cnt FROM content_item_snapshots WHERE content_item_id = ?",
      )
      .get(item.id) as { cnt: number };
    expect(cntRow.cnt).toBeLessThanOrEqual(MAX_ITEM_SNAPSHOTS);
  });

  it("returns null for unknown item", async () => {
    const { restoreItemSnapshot } = await import(
      "@/lib/content-item-snapshots"
    );
    const result = await restoreItemSnapshot("nope", "any-snap-id");
    expect(result).toBeNull();
  });

  it("returns null for unknown snapshot on known item", async () => {
    const { createContentItem } = await import("@/lib/content-items");
    const { restoreItemSnapshot } = await import(
      "@/lib/content-item-snapshots"
    );

    const item = await createContentItem(makeInput());
    const result = await restoreItemSnapshot(item.id, "nope-snap-id");
    expect(result).toBeNull();
  });

  it("makes no mutations when item or snapshot is missing", async () => {
    const { createContentItem } = await import("@/lib/content-items");
    const { restoreItemSnapshot } = await import(
      "@/lib/content-item-snapshots"
    );
    const { getDb } = await import("@/lib/db");

    const item = await createContentItem(makeInput());
    await restoreItemSnapshot(item.id, "nope-snap-id");

    const db = getDb();
    const cntRow = db
      .prepare(
        "SELECT COUNT(*) as cnt FROM content_item_snapshots WHERE content_item_id = ?",
      )
      .get(item.id) as { cnt: number };
    // No defensive snapshot was written (nothing happened)
    expect(cntRow.cnt).toBe(0);
  });
});
