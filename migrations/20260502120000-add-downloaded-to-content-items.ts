import type Database from "better-sqlite3";

export function up(db: Database.Database): void {
  const cols = db
    .prepare("PRAGMA table_info(content_items)")
    .all() as { name: string }[];
  if (!cols.some((c) => c.name === "downloaded")) {
    db.exec(
      "ALTER TABLE content_items ADD COLUMN downloaded INTEGER NOT NULL DEFAULT 0",
    );
  }
}

export function down(db: Database.Database): void {
  db.exec("ALTER TABLE content_items DROP COLUMN downloaded");
}
