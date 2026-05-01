import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let tempDbPath: string;

beforeEach(() => {
  tempDbPath = path.join(
    os.tmpdir(),
    `kmpus-kv-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
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

describe("getKvConfig", () => {
  it("returns the default value when the key is missing", async () => {
    const { getKvConfig } = await import("@/lib/kv-config");
    const result = await getKvConfig("missing", { foo: 1 });
    expect(result).toEqual({ foo: 1 });
  });

  it("does not insert a row when returning the default", async () => {
    const { getKvConfig } = await import("@/lib/kv-config");
    const { getDb } = await import("@/lib/db");
    await getKvConfig("missing", { foo: 1 });
    const db = getDb();
    const row = db.prepare("SELECT COUNT(*) as cnt FROM kv_config").get() as { cnt: number };
    expect(row.cnt).toBe(0);
  });

  it("returns the persisted value after setKvConfig", async () => {
    const { getKvConfig, setKvConfig } = await import("@/lib/kv-config");
    const payload = { name: "brand", primary: "#ff0000" };
    await setKvConfig("brand", payload);
    const result = await getKvConfig("brand", { name: "default" });
    expect(result).toEqual(payload);
  });
});

describe("setKvConfig", () => {
  it("inserts a row on first call", async () => {
    const { setKvConfig } = await import("@/lib/kv-config");
    const { getDb } = await import("@/lib/db");
    await setKvConfig("brand", { name: "x" });
    const db = getDb();
    const row = db.prepare("SELECT COUNT(*) as cnt FROM kv_config").get() as { cnt: number };
    expect(row.cnt).toBe(1);
  });

  it("upserts: calling twice replaces the row, not duplicates", async () => {
    const { setKvConfig } = await import("@/lib/kv-config");
    const { getDb } = await import("@/lib/db");
    await setKvConfig("brand", { name: "first" });
    await setKvConfig("brand", { name: "second" });
    const db = getDb();
    const row = db.prepare("SELECT COUNT(*) as cnt FROM kv_config").get() as { cnt: number };
    expect(row.cnt).toBe(1);
  });

  it("upserts: second call replaces the value", async () => {
    const { getKvConfig, setKvConfig } = await import("@/lib/kv-config");
    await setKvConfig("brand", { name: "first" });
    await setKvConfig("brand", { name: "second" });
    const result = await getKvConfig("brand", { name: "default" });
    expect(result).toEqual({ name: "second" });
  });

  it("upserts: updated_at advances on second call", async () => {
    const { setKvConfig } = await import("@/lib/kv-config");
    const { getDb } = await import("@/lib/db");
    await setKvConfig("brand", { name: "first" });
    const db = getDb();
    const before = (db.prepare("SELECT updated_at FROM kv_config WHERE key = ?").get("brand") as { updated_at: string }).updated_at;

    await new Promise((r) => setTimeout(r, 5));
    await setKvConfig("brand", { name: "second" });
    const after = (db.prepare("SELECT updated_at FROM kv_config WHERE key = ?").get("brand") as { updated_at: string }).updated_at;

    expect(after > before).toBe(true);
  });

  it("different keys produce separate rows", async () => {
    const { setKvConfig } = await import("@/lib/kv-config");
    const { getDb } = await import("@/lib/db");
    await setKvConfig("brand", { a: 1 });
    await setKvConfig("business-context", { b: 2 });
    const db = getDb();
    const row = db.prepare("SELECT COUNT(*) as cnt FROM kv_config").get() as { cnt: number };
    expect(row.cnt).toBe(2);
  });
});

describe("JSON round-trip", () => {
  it("preserves nested objects", async () => {
    const { getKvConfig, setKvConfig } = await import("@/lib/kv-config");
    const payload = { colors: { primary: "#ff0000", secondary: "#00ff00" }, fonts: { heading: "Inter" } };
    await setKvConfig("brand", payload);
    expect(await getKvConfig("brand", {})).toEqual(payload);
  });

  it("preserves arrays", async () => {
    const { getKvConfig, setKvConfig } = await import("@/lib/kv-config");
    const payload = { tags: ["a", "b", "c"], nested: [{ id: 1 }, { id: 2 }] };
    await setKvConfig("ctx", payload);
    expect(await getKvConfig("ctx", {})).toEqual(payload);
  });

  it("preserves null values", async () => {
    const { getKvConfig, setKvConfig } = await import("@/lib/kv-config");
    const payload = { resolvedAt: null, name: "test" };
    await setKvConfig("ctx", payload);
    expect(await getKvConfig("ctx", {})).toEqual(payload);
  });
});
