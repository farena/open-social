import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let tempDbPath: string;

beforeEach(() => {
  tempDbPath = path.join(os.tmpdir(), `kmpus-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
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

describe("getDb()", () => {
  it("opens the database and enables WAL mode", async () => {
    const { getDb } = await import("@/lib/db");
    const db = getDb();
    const mode = db.pragma("journal_mode", { simple: true });
    expect(mode).toBe("wal");
  });

  it("enables foreign keys", async () => {
    const { getDb } = await import("@/lib/db");
    const db = getDb();
    const fk = db.pragma("foreign_keys", { simple: true });
    expect(fk).toBe(1);
  });

  it("creates the content_items table", async () => {
    const { getDb } = await import("@/lib/db");
    const db = getDb();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r: unknown) => (r as { name: string }).name);
    expect(tables).toContain("content_items");
  });

  it("creates the slides table", async () => {
    const { getDb } = await import("@/lib/db");
    const db = getDb();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r: unknown) => (r as { name: string }).name);
    expect(tables).toContain("slides");
  });

  it("creates the content_item_snapshots table", async () => {
    const { getDb } = await import("@/lib/db");
    const db = getDb();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r: unknown) => (r as { name: string }).name);
    expect(tables).toContain("content_item_snapshots");
  });

  it("creates the kv_config table", async () => {
    const { getDb } = await import("@/lib/db");
    const db = getDb();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r: unknown) => (r as { name: string }).name);
    expect(tables).toContain("kv_config");
  });

  it("creates the templates table", async () => {
    const { getDb } = await import("@/lib/db");
    const db = getDb();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r: unknown) => (r as { name: string }).name);
    expect(tables).toContain("templates");
  });

  it("creates the style_presets table", async () => {
    const { getDb } = await import("@/lib/db");
    const db = getDb();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r: unknown) => (r as { name: string }).name);
    expect(tables).toContain("style_presets");
  });

  it("creates the assets table", async () => {
    const { getDb } = await import("@/lib/db");
    const db = getDb();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r: unknown) => (r as { name: string }).name);
    expect(tables).toContain("assets");
  });

  it("creates the staged_actions table", async () => {
    const { getDb } = await import("@/lib/db");
    const db = getDb();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all()
      .map((r: unknown) => (r as { name: string }).name);
    expect(tables).toContain("staged_actions");
  });

  it("creates the idx_assets_added_at index", async () => {
    const { getDb } = await import("@/lib/db");
    const db = getDb();
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index'")
      .all()
      .map((r: unknown) => (r as { name: string }).name);
    expect(indexes).toContain("idx_assets_added_at");
  });

  it("creates the idx_staged_actions_status index", async () => {
    const { getDb } = await import("@/lib/db");
    const db = getDb();
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index'")
      .all()
      .map((r: unknown) => (r as { name: string }).name);
    expect(indexes).toContain("idx_staged_actions_status");
  });

  it("returns the same instance on repeated calls (singleton)", async () => {
    const { getDb } = await import("@/lib/db");
    const db1 = getDb();
    const db2 = getDb();
    expect(db1).toBe(db2);
  });

  it("schema init is idempotent (calling getDb twice does not throw)", async () => {
    const { getDb, closeDb } = await import("@/lib/db");
    getDb();
    closeDb();
    // Re-open against the same file — schema already exists, CREATE TABLE IF NOT EXISTS must not throw
    expect(() => getDb()).not.toThrow();
  });
});
