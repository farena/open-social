import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_BUSINESS_CONTEXT } from "@/types/business-context";

let tempDbPath: string;

beforeEach(() => {
  tempDbPath = path.join(
    os.tmpdir(),
    `kmpus-biz-ctx-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
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

describe("getBusinessContext", () => {
  it("returns DEFAULT_BUSINESS_CONTEXT when the DB is empty", async () => {
    const { getBusinessContext } = await import("@/lib/business-context");
    const result = await getBusinessContext();
    expect(result).toEqual(DEFAULT_BUSINESS_CONTEXT);
  });

  it("does not insert a row when returning the default", async () => {
    const { getBusinessContext } = await import("@/lib/business-context");
    const { getDb } = await import("@/lib/db");
    await getBusinessContext();
    const db = getDb();
    const row = db
      .prepare("SELECT COUNT(*) as cnt FROM kv_config")
      .get() as { cnt: number };
    expect(row.cnt).toBe(0);
  });
});

describe("updateBusinessContext", () => {
  it("persists changes; subsequent getBusinessContext() reflects them", async () => {
    const { getBusinessContext, updateBusinessContext } = await import(
      "@/lib/business-context"
    );
    await updateBusinessContext({ summary: "We help language schools." });
    const result = await getBusinessContext();
    expect(result.summary).toBe("We help language schools.");
  });

  it("createdAt is set on first updateBusinessContext call", async () => {
    const { updateBusinessContext } = await import("@/lib/business-context");
    const result = await updateBusinessContext({ summary: "Hello" });
    expect(result.createdAt).toBeTruthy();
    expect(result.createdAt.length).toBeGreaterThan(0);
  });

  it("updatedAt advances on every call", async () => {
    const { updateBusinessContext } = await import("@/lib/business-context");
    const first = await updateBusinessContext({ summary: "First" });
    await new Promise((r) => setTimeout(r, 5));
    const second = await updateBusinessContext({ summary: "Second" });
    expect(second.updatedAt > first.updatedAt).toBe(true);
  });

  it("createdAt does not change on subsequent updates", async () => {
    const { updateBusinessContext } = await import("@/lib/business-context");
    const first = await updateBusinessContext({ summary: "First" });
    await new Promise((r) => setTimeout(r, 5));
    const second = await updateBusinessContext({ summary: "Second" });
    expect(second.createdAt).toBe(first.createdAt);
  });

  describe("array-field replace semantics (keyMessages, differentiators)", () => {
    it("keyMessages: explicit update replaces the array", async () => {
      const { getBusinessContext, updateBusinessContext } = await import(
        "@/lib/business-context"
      );
      await updateBusinessContext({
        keyMessages: ["old message"],
      });
      await updateBusinessContext({
        keyMessages: ["new message A", "new message B"],
      });
      const result = await getBusinessContext();
      expect(result.keyMessages).toEqual(["new message A", "new message B"]);
    });

    it("keyMessages: omitting the field preserves existing value", async () => {
      const { getBusinessContext, updateBusinessContext } = await import(
        "@/lib/business-context"
      );
      await updateBusinessContext({ keyMessages: ["preserved"] });
      // Update something else, keyMessages not passed → should preserve
      await updateBusinessContext({ summary: "updated summary" });
      const result = await getBusinessContext();
      expect(result.keyMessages).toEqual(["preserved"]);
    });

    it("differentiators: explicit update replaces the array", async () => {
      const { getBusinessContext, updateBusinessContext } = await import(
        "@/lib/business-context"
      );
      await updateBusinessContext({
        differentiators: ["old diff"],
      });
      await updateBusinessContext({
        differentiators: ["new diff A", "new diff B"],
      });
      const result = await getBusinessContext();
      expect(result.differentiators).toEqual(["new diff A", "new diff B"]);
    });

    it("differentiators: omitting the field preserves existing value", async () => {
      const { getBusinessContext, updateBusinessContext } = await import(
        "@/lib/business-context"
      );
      await updateBusinessContext({ differentiators: ["keep me"] });
      await updateBusinessContext({ summary: "another update" });
      const result = await getBusinessContext();
      expect(result.differentiators).toEqual(["keep me"]);
    });
  });
});
