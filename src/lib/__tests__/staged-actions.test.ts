import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let tempDbPath: string;

beforeEach(() => {
  tempDbPath = path.join(
    os.tmpdir(),
    `kmpus-staged-actions-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
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

describe("listStagedActions", () => {
  it("returns an empty array when there are no actions", async () => {
    const { listStagedActions } = await import("@/lib/staged-actions");
    const result = await listStagedActions();
    expect(result).toEqual([]);
  });
});

describe("createStagedAction + listStagedActions + getStagedAction", () => {
  it("creates a pending action and retrieves it via list", async () => {
    const { createStagedAction, listStagedActions } = await import(
      "@/lib/staged-actions"
    );
    const action = await createStagedAction({
      type: "export_png",
      fileName: "slide-1.png",
      content: "<div>hello</div>",
      description: "Export slide 1",
      carouselId: "carousel-abc",
      autoExecute: false,
    });
    const list = await listStagedActions();
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual(action);
  });

  it("round-trips ALL fields including autoExecute (boolean) and resolvedAt (null)", async () => {
    const { createStagedAction, getStagedAction } = await import(
      "@/lib/staged-actions"
    );
    const action = await createStagedAction({
      type: "export_png",
      fileName: "test.png",
      content: "content-data",
      description: "A test action",
      carouselId: "carousel-123",
      autoExecute: true,
    });

    const fetched = await getStagedAction(action.id);
    expect(fetched).not.toBeNull();
    expect(fetched!.id).toBe(action.id);
    expect(fetched!.type).toBe("export_png");
    expect(fetched!.fileName).toBe("test.png");
    expect(fetched!.content).toBe("content-data");
    expect(fetched!.description).toBe("A test action");
    expect(fetched!.carouselId).toBe("carousel-123");
    // boolean round-trip
    expect(fetched!.autoExecute).toBe(true);
    expect(typeof fetched!.autoExecute).toBe("boolean");
    expect(fetched!.status).toBe("pending");
    expect(fetched!.createdAt).toBe(action.createdAt);
    // null round-trip (not the string "null")
    expect(fetched!.resolvedAt).toBeNull();
  });

  it("autoExecute defaults to false when not provided", async () => {
    const { createStagedAction, getStagedAction } = await import(
      "@/lib/staged-actions"
    );
    const action = await createStagedAction({
      type: "export_png",
      fileName: "test.png",
      content: "data",
      description: "desc",
      carouselId: "c-1",
    });
    const fetched = await getStagedAction(action.id);
    expect(fetched!.autoExecute).toBe(false);
    expect(typeof fetched!.autoExecute).toBe("boolean");
  });

  it("getStagedAction returns null for a missing id", async () => {
    const { getStagedAction } = await import("@/lib/staged-actions");
    const result = await getStagedAction("does-not-exist");
    expect(result).toBeNull();
  });
});

describe("updateStagedAction", () => {
  it("updates status and resolvedAt fields", async () => {
    const { createStagedAction, updateStagedAction, getStagedAction } =
      await import("@/lib/staged-actions");
    const action = await createStagedAction({
      type: "export_png",
      fileName: "f.png",
      content: "c",
      description: "d",
      carouselId: "car-1",
    });

    const resolvedAt = "2026-05-01T12:00:00.000Z";
    await updateStagedAction(action.id, {
      status: "approved",
      resolvedAt,
    });

    const fetched = await getStagedAction(action.id);
    expect(fetched!.status).toBe("approved");
    expect(fetched!.resolvedAt).toBe(resolvedAt);
  });

  it("returns null for a missing id", async () => {
    const { updateStagedAction } = await import("@/lib/staged-actions");
    const result = await updateStagedAction("no-such-id", {
      status: "approved",
    });
    expect(result).toBeNull();
  });

  it("returns the updated action", async () => {
    const { createStagedAction, updateStagedAction } = await import(
      "@/lib/staged-actions"
    );
    const action = await createStagedAction({
      type: "export_png",
      fileName: "f.png",
      content: "c",
      description: "d",
      carouselId: "car-1",
    });
    const updated = await updateStagedAction(action.id, { status: "rejected" });
    expect(updated).not.toBeNull();
    expect(updated!.status).toBe("rejected");
  });
});

describe("updateStagedActionStatus", () => {
  it("sets resolvedAt to a fresh ISO timestamp when moving to a terminal state", async () => {
    const { createStagedAction, updateStagedActionStatus, getStagedAction } =
      await import("@/lib/staged-actions");
    const action = await createStagedAction({
      type: "export_png",
      fileName: "f.png",
      content: "c",
      description: "d",
      carouselId: "car-1",
    });

    await updateStagedActionStatus(action.id, "approved");

    const fetched = await getStagedAction(action.id);
    expect(fetched!.status).toBe("approved");
    // resolvedAt should be truthy and a valid ISO string
    expect(fetched!.resolvedAt).toBeTruthy();
    expect(() => new Date(fetched!.resolvedAt!).toISOString()).not.toThrow();
  });

  it("sets resolvedAt back to null when moving back to pending", async () => {
    const { createStagedAction, updateStagedActionStatus, getStagedAction } =
      await import("@/lib/staged-actions");
    const action = await createStagedAction({
      type: "export_png",
      fileName: "f.png",
      content: "c",
      description: "d",
      carouselId: "car-1",
    });

    // First move to a terminal state
    await updateStagedActionStatus(action.id, "approved");
    // Then back to pending
    await updateStagedActionStatus(action.id, "pending");

    const fetched = await getStagedAction(action.id);
    expect(fetched!.status).toBe("pending");
    expect(fetched!.resolvedAt).toBeNull();
  });

  it("works for executed status", async () => {
    const { createStagedAction, updateStagedActionStatus, getStagedAction } =
      await import("@/lib/staged-actions");
    const action = await createStagedAction({
      type: "export_png",
      fileName: "f.png",
      content: "c",
      description: "d",
      carouselId: "car-1",
    });
    await updateStagedActionStatus(action.id, "executed");
    const fetched = await getStagedAction(action.id);
    expect(fetched!.status).toBe("executed");
    expect(fetched!.resolvedAt).toBeTruthy();
  });
});

describe("insertion order", () => {
  it("listStagedActions returns actions in creation order (oldest first)", async () => {
    const { createStagedAction, listStagedActions } = await import(
      "@/lib/staged-actions"
    );

    const makeAction = (label: string) =>
      createStagedAction({
        type: "export_png",
        fileName: `${label}.png`,
        content: label,
        description: label,
        carouselId: "car-order",
      });

    const a = await makeAction("A");
    // Small delay to ensure distinct created_at timestamps
    await new Promise((r) => setTimeout(r, 5));
    const b = await makeAction("B");
    await new Promise((r) => setTimeout(r, 5));
    const c = await makeAction("C");

    const list = await listStagedActions();
    expect(list).toHaveLength(3);
    expect(list[0].id).toBe(a.id);
    expect(list[1].id).toBe(b.id);
    expect(list[2].id).toBe(c.id);
  });
});
