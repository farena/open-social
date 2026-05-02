import type Database from "better-sqlite3";

export function up(db: Database.Database): void {
  const exists = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='components'",
    )
    .get();
  if (!exists) {
    db.exec(`
CREATE TABLE IF NOT EXISTS components (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  description       TEXT,
  html_content      TEXT NOT NULL,
  scss_styles       TEXT NOT NULL DEFAULT '',
  parameters_schema TEXT NOT NULL DEFAULT '[]',
  width             INTEGER NOT NULL,
  height            INTEGER NOT NULL,
  thumbnail_url     TEXT,
  tags              TEXT NOT NULL DEFAULT '[]',
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
)
    `);
  }
}

export function down(db: Database.Database): void {
  db.exec("DROP TABLE IF EXISTS components");
}
