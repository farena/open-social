/**
 * Migration runner. Sequelize-style: each file in `migrations/` exports
 * `up(db)` / `down(db)`; executed migrations are tracked in the
 * `migrations` table. Run via the `migrate` and `migrate:undo` npm scripts.
 *
 * Usage:
 *   tsx scripts/migrate.ts up     # apply all pending migrations in order
 *   tsx scripts/migrate.ts undo   # revert the most recently applied migration
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type Database from "better-sqlite3";
import { getDb } from "../src/lib/db";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "migrations");
const MIGRATION_FILE_RE = /^\d{14}-.+\.(ts|mjs|js)$/;

interface MigrationModule {
  up?: (db: Database.Database) => void | Promise<void>;
  down?: (db: Database.Database) => void | Promise<void>;
}

function ensureMigrationsTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      name        TEXT PRIMARY KEY,
      executed_at TEXT NOT NULL
    )
  `);
}

function listMigrationFiles(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => MIGRATION_FILE_RE.test(f))
    .sort();
}

function listExecuted(db: Database.Database): Set<string> {
  const rows = db
    .prepare("SELECT name FROM migrations")
    .all() as { name: string }[];
  return new Set(rows.map((r) => r.name));
}

async function loadMigration(file: string): Promise<MigrationModule> {
  const url = pathToFileURL(path.join(MIGRATIONS_DIR, file)).href;
  return (await import(url)) as MigrationModule;
}

async function runInTx(
  db: Database.Database,
  fn: () => void | Promise<void>,
): Promise<void> {
  db.exec("BEGIN IMMEDIATE");
  try {
    await fn();
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

async function up(): Promise<void> {
  const db = getDb();
  ensureMigrationsTable(db);

  const executed = listExecuted(db);
  const pending = listMigrationFiles().filter((f) => !executed.has(f));

  if (pending.length === 0) {
    console.log("No pending migrations.");
    return;
  }

  for (const file of pending) {
    const mod = await loadMigration(file);
    if (typeof mod.up !== "function") {
      throw new Error(`Migration ${file} is missing an exported up() function`);
    }
    console.log(`→ ${file}`);
    await runInTx(db, async () => {
      await mod.up!(db);
      db.prepare(
        "INSERT INTO migrations (name, executed_at) VALUES (?, ?)",
      ).run(file, new Date().toISOString());
    });
    console.log(`✓ ${file}`);
  }

  console.log(`Applied ${pending.length} migration(s).`);
}

async function undo(): Promise<void> {
  const db = getDb();
  ensureMigrationsTable(db);

  const last = db
    .prepare("SELECT name FROM migrations ORDER BY name DESC LIMIT 1")
    .get() as { name: string } | undefined;

  if (!last) {
    console.log("No migrations to undo.");
    return;
  }

  const mod = await loadMigration(last.name);
  if (typeof mod.down !== "function") {
    throw new Error(
      `Migration ${last.name} is missing an exported down() function`,
    );
  }

  console.log(`← ${last.name}`);
  await runInTx(db, async () => {
    await mod.down!(db);
    db.prepare("DELETE FROM migrations WHERE name = ?").run(last.name);
  });
  console.log(`✓ reverted ${last.name}`);
}

function applyTestDbOverride(): void {
  // `--test` redirects the runner to a dedicated test database so that
  // iterating on migrations never touches the dev DB at data/sales.db.
  // Path resolution: TEST_DB_PATH env if set, else data/test.db.
  const testPath =
    process.env.TEST_DB_PATH ?? path.resolve(process.cwd(), "data", "test.db");
  process.env.DB_PATH = testPath;
  console.log(`[migrate] --test mode: using ${testPath}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => a !== "--test");
  if (process.argv.includes("--test")) applyTestDbOverride();

  const cmd = args[0] ?? "up";
  if (cmd === "up") {
    await up();
  } else if (cmd === "undo") {
    await undo();
  } else {
    console.error(`Unknown command: ${cmd}. Use "up" or "undo".`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
