import type Database from "better-sqlite3";

/**
 * Initial schema. Mirrors the v0 layout that existed before any
 * migration was tracked. All statements use IF NOT EXISTS so that
 * running this against a database that was already bootstrapped (by
 * `SCHEMA_SQL` in src/lib/db.ts) is a no-op rather than an error.
 *
 * Subsequent migrations evolve this schema (e.g. add columns).
 */

const SCHEMA = `
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

CREATE TABLE IF NOT EXISTS kv_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS templates (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL,
  aspect_ratio  TEXT NOT NULL,
  slides        TEXT NOT NULL,
  tags          TEXT NOT NULL DEFAULT '[]',
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS style_presets (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  payload     TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assets (
  id          TEXT PRIMARY KEY,
  url         TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  added_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assets_added_at ON assets(added_at DESC);

CREATE TABLE IF NOT EXISTS staged_actions (
  id           TEXT PRIMARY KEY,
  type         TEXT NOT NULL,
  file_name    TEXT NOT NULL,
  content      TEXT NOT NULL,
  description  TEXT NOT NULL,
  carousel_id  TEXT NOT NULL,
  auto_execute INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  resolved_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_staged_actions_status ON staged_actions(status);
`;

const TABLES = [
  "staged_actions",
  "assets",
  "style_presets",
  "templates",
  "kv_config",
  "content_item_snapshots",
  "slides",
  "content_items",
];

export function up(db: Database.Database): void {
  db.exec(SCHEMA);
}

export function down(db: Database.Database): void {
  for (const table of TABLES) {
    db.exec(`DROP TABLE IF EXISTS ${table}`);
  }
}
