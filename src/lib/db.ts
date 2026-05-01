import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS content_items (
  id               TEXT PRIMARY KEY,
  type             TEXT NOT NULL,
  state            TEXT NOT NULL,
  aspect_ratio     TEXT NOT NULL,
  hook             TEXT NOT NULL,
  body_idea        TEXT NOT NULL,
  caption          TEXT NOT NULL,
  hashtags         TEXT NOT NULL DEFAULT '[]',
  notes            TEXT,
  chat_session_id  TEXT,
  reference_images TEXT,
  assets           TEXT,
  tags             TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  generated_at     TEXT
);

CREATE TABLE IF NOT EXISTS slides (
  id                TEXT PRIMARY KEY,
  content_item_id   TEXT NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  slide_order       INTEGER NOT NULL,
  notes             TEXT NOT NULL DEFAULT '',
  background        TEXT NOT NULL,
  elements          TEXT NOT NULL,
  legacy_html       TEXT,
  previous_versions TEXT NOT NULL DEFAULT '[]',
  next_versions     TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_slides_item ON slides(content_item_id, slide_order);

CREATE TABLE IF NOT EXISTS content_item_snapshots (
  id              TEXT PRIMARY KEY,
  content_item_id TEXT NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
  created_at      TEXT NOT NULL,
  trigger         TEXT NOT NULL,
  label           TEXT,
  payload         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_snapshots_item ON content_item_snapshots(content_item_id, created_at DESC);
`;

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;

  const dbPath =
    process.env.KMPUS_DB_PATH ??
    path.resolve(process.cwd(), "data", "sales.db");

  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  db = new Database(dbPath);

  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");

  db.exec(SCHEMA_SQL);

  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
