#!/usr/bin/env node
/**
 * One-shot migration: data/*.json resources → data/sales.db
 *
 * Migrates six JSON-backed resources into the existing SQLite database:
 *   brand.json            → kv_config (key = "brand")
 *   business-context.json → kv_config (key = "business-context")
 *   templates.json        → templates table
 *   style-presets.json    → style_presets table
 *   assets.json           → assets table
 *   staged-actions.json   → staged_actions table
 *
 * This script intentionally duplicates the serialization logic from the
 * TS lib layer. Duplication is acceptable because:
 *  1. This is a one-shot migration script, not production code.
 *  2. It must be runnable without TypeScript compilation (ESM .mjs, node directly).
 *  3. The canonical helpers live in the TS layer; this script must not depend on them.
 *
 * Args:
 *   --dry-run   Parse + report without writing. Exit 0.
 *   --force     Wipe existing rows per resource and re-insert.
 *
 * Usage:
 *   node scripts/migrate-json-resources-to-sqlite.mjs --dry-run
 *   node scripts/migrate-json-resources-to-sqlite.mjs
 *   node scripts/migrate-json-resources-to-sqlite.mjs --force
 */

import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// ANSI colours
// ---------------------------------------------------------------------------

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
};

const ok = (s) => `${C.green}${s}${C.reset}`;
const warn = (s) => `${C.yellow}${s}${C.reset}`;
const err = (s) => `${C.red}${s}${C.reset}`;
const info = (s) => `${C.cyan}${s}${C.reset}`;
const dim = (s) => `${C.dim}${s}${C.reset}`;
const bold = (s) => `${C.bold}${s}${C.reset}`;

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const ROOT = new URL("../", import.meta.url).pathname;
const DATA_DIR = path.join(ROOT, "data");
const DB_PATH = process.env.DB_PATH ?? path.join(DATA_DIR, "sales.db");

const JSON_FILES = {
  brand: path.join(DATA_DIR, "brand.json"),
  "business-context": path.join(DATA_DIR, "business-context.json"),
  templates: path.join(DATA_DIR, "templates.json"),
  "style-presets": path.join(DATA_DIR, "style-presets.json"),
  assets: path.join(DATA_DIR, "assets.json"),
  "staged-actions": path.join(DATA_DIR, "staged-actions.json"),
};

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const FORCE = args.includes("--force");

// ---------------------------------------------------------------------------
// Structural validation helpers
// ---------------------------------------------------------------------------

/**
 * Validate brand / business-context singleton shape.
 * Must be a non-null object.
 */
function validateSingleton(parsed, key) {
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return [`${key}: expected a non-null object`];
  }
  return [];
}

/**
 * Validate a collection item — must have a non-empty id string.
 */
function validateCollectionItem(item, index, collectionName) {
  if (typeof item.id !== "string" || item.id.length === 0) {
    return [`${collectionName}[${index}]: missing or empty id`];
  }
  return [];
}

/**
 * Validate a collection array.
 */
function validateCollection(items, collectionName) {
  if (!Array.isArray(items)) {
    return [`${collectionName}: expected an array`];
  }
  const errors = [];
  for (let i = 0; i < items.length; i++) {
    errors.push(...validateCollectionItem(items[i], i, collectionName));
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Row serialisers (mirrors the TS lib layer — local copies for portability)
// ---------------------------------------------------------------------------

/**
 * Template JSON record → SQL row.
 * JSON key: aspectRatio (camelCase), SQL column: aspect_ratio.
 */
function templateToRow(t) {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    aspect_ratio: t.aspectRatio,
    slides: JSON.stringify(t.slides ?? []),
    tags: JSON.stringify(t.tags ?? []),
    created_at: t.createdAt,
  };
}

/**
 * StylePreset JSON record → SQL row.
 * The payload column holds everything except id, name, description, createdAt.
 */
function stylePresetToRow(p) {
  const { id, name, description, createdAt, ...rest } = p;
  return {
    id,
    name,
    description: description ?? null,
    payload: JSON.stringify(rest),
    created_at: createdAt,
  };
}

/**
 * SQL row → StylePreset (for spot-check round-trip).
 */
function rowToStylePreset(row) {
  const payload = JSON.parse(row.payload);
  return {
    id: row.id,
    name: row.name,
    ...(row.description !== null ? { description: row.description } : {}),
    ...payload,
    createdAt: row.created_at,
  };
}

/**
 * Asset JSON record → SQL row.
 * JSON key: addedAt (camelCase), SQL column: added_at.
 */
function assetToRow(a) {
  return {
    id: a.id,
    url: a.url,
    name: a.name,
    description: a.description ?? null,
    added_at: a.addedAt,
  };
}

/**
 * StagedAction JSON record → SQL row.
 * JSON uses camelCase; SQL uses snake_case.
 * autoExecute: boolean → 0/1.
 * resolvedAt: null → NULL.
 */
function stagedActionToRow(a) {
  return {
    id: a.id,
    type: a.type,
    file_name: a.fileName,
    content: a.content,
    description: a.description,
    carousel_id: a.carouselId,
    auto_execute: a.autoExecute ? 1 : 0,
    status: a.status,
    created_at: a.createdAt,
    resolved_at: a.resolvedAt ?? null,
  };
}

// ---------------------------------------------------------------------------
// Read + parse a JSON file; returns null if absent
// ---------------------------------------------------------------------------

async function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const raw = await fsPromises.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

// ---------------------------------------------------------------------------
// Backup helper
// ---------------------------------------------------------------------------

async function backupFile(filePath) {
  const ts = new Date().toISOString().replace(/:/g, "-");
  const bakPath = `${filePath}.bak.${ts}`;
  await fsPromises.copyFile(filePath, bakPath);
  return bakPath;
}

// ---------------------------------------------------------------------------
// Deep equality helper (for spot-check verification)
// ---------------------------------------------------------------------------

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (typeof a === "object") {
    const keysA = Object.keys(a).sort();
    const keysB = Object.keys(b).sort();
    if (!deepEqual(keysA, keysB)) return false;
    for (const k of keysA) {
      if (!deepEqual(a[k], b[k])) return false;
    }
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Summary tracking
// ---------------------------------------------------------------------------

const summary = []; // { resource, status, count, note }

function recordResult(resource, status, count, note = "") {
  summary.push({ resource, status, count, note });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(bold("\n=== migrate-json-resources-to-sqlite ==="));
  console.log(dim(`  DB path:  ${DB_PATH}`));
  console.log(dim(`  Dry run:  ${DRY_RUN}`));
  console.log(dim(`  Force:    ${FORCE}`));
  console.log();

  // --------------------------------------------------------------------------
  // Step 1: Parse all JSON files (regardless of dry-run)
  // --------------------------------------------------------------------------

  // Each resource: { key, filePath, parsed, items, errors }
  const resources = [];

  // --- Singletons ---
  for (const key of ["brand", "business-context"]) {
    const filePath = JSON_FILES[key];
    const basename = path.basename(filePath);
    let parsed = null;
    let errors = [];
    let present = false;

    try {
      parsed = await readJson(filePath);
    } catch (e) {
      errors.push(`Failed to parse ${basename}: ${e.message}`);
    }

    if (parsed === null && errors.length === 0) {
      console.log(warn(`  [skip] ${basename} — file not found`));
      recordResult(key, "skipped", 0, "file not found");
      continue;
    }

    if (errors.length === 0) {
      present = true;
      errors = validateSingleton(parsed, key);
    }

    if (errors.length > 0) {
      console.log(err(`  [error] ${basename}:`));
      for (const e of errors) console.log(err(`    • ${e}`));
      process.exit(1);
    }

    resources.push({ key, filePath, parsed, items: null, isSingleton: true });
    console.log(ok(`  [ok] ${basename} — valid singleton`));
  }

  // --- Collections ---
  const collections = [
    { key: "templates", filePath: JSON_FILES["templates"], arrayKey: "templates" },
    { key: "style-presets", filePath: JSON_FILES["style-presets"], arrayKey: "presets" },
    { key: "assets", filePath: JSON_FILES["assets"], arrayKey: "assets" },
    { key: "staged-actions", filePath: JSON_FILES["staged-actions"], arrayKey: "actions" },
  ];

  for (const { key, filePath, arrayKey } of collections) {
    const basename = path.basename(filePath);
    let parsed = null;
    let errors = [];

    try {
      parsed = await readJson(filePath);
    } catch (e) {
      errors.push(`Failed to parse ${basename}: ${e.message}`);
    }

    if (parsed === null && errors.length === 0) {
      console.log(warn(`  [skip] ${basename} — file not found`));
      recordResult(key, "skipped", 0, "file not found");
      continue;
    }

    if (errors.length > 0) {
      console.log(err(`  [error] ${basename}: ${errors[0]}`));
      process.exit(1);
    }

    const items = parsed[arrayKey];
    if (!Array.isArray(items)) {
      console.log(err(`  [error] ${basename}: expected { ${arrayKey}: [...] }`));
      process.exit(1);
    }

    errors = validateCollection(items, key);
    if (errors.length > 0) {
      console.log(err(`  [error] ${basename}:`));
      for (const e of errors) console.log(err(`    • ${e}`));
      process.exit(1);
    }

    resources.push({ key, filePath, parsed, items, isSingleton: false });
    console.log(ok(`  [ok] ${basename} — ${items.length} item(s) valid`));
  }

  console.log();

  // --------------------------------------------------------------------------
  // Step 2: Dry-run report
  // --------------------------------------------------------------------------

  if (DRY_RUN) {
    console.log(bold("--- Dry-run report ---"));
    for (const r of resources) {
      if (r.isSingleton) {
        console.log(`  ${info(r.key.padEnd(20))} singleton  → kv_config row`);
      } else {
        console.log(`  ${info(r.key.padEnd(20))} ${String(r.items.length).padStart(4)} row(s) → ${tableNameFor(r.key)}`);
      }
    }
    if (fs.existsSync(DB_PATH)) {
      console.log();
      console.log(warn(`  NOTE: ${DB_PATH} already exists.`));
      console.log(warn(`        Use --force to wipe and re-insert existing rows.`));
    } else {
      console.log();
      console.log(dim(`  NOTE: ${DB_PATH} does not exist yet (will be created on real run).`));
    }
    console.log();
    console.log(dim("Dry-run complete. No files were written."));
    process.exit(0);
  }

  // --------------------------------------------------------------------------
  // Step 3: Backup JSON files before any writes
  // --------------------------------------------------------------------------

  console.log(bold("--- Backing up JSON files ---"));
  for (const r of resources) {
    if (!fs.existsSync(r.filePath)) continue;
    const bakPath = await backupFile(r.filePath);
    console.log(`  ${path.basename(r.filePath)} → ${dim(path.basename(bakPath))}`);
  }
  console.log();

  // --------------------------------------------------------------------------
  // Step 4: Open DB
  // --------------------------------------------------------------------------

  const Database = require("better-sqlite3");
  const db = new Database(DB_PATH);

  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");

  // --------------------------------------------------------------------------
  // Step 5: Check idempotency + decide what to insert
  // --------------------------------------------------------------------------

  console.log(bold("--- Idempotency checks ---"));

  // Build per-resource insert decisions
  // Each decision: { resource, skip: bool, wipe: bool }
  const decisions = [];

  for (const r of resources) {
    const tableName = tableNameFor(r.key);

    if (r.isSingleton) {
      // Check if kv_config already has this key
      const existing = db
        .prepare("SELECT COUNT(*) as cnt FROM kv_config WHERE key = ?")
        .get(r.key);
      if (existing.cnt > 0) {
        if (FORCE) {
          console.log(warn(`  [force]  kv_config[${r.key}] — existing row will be replaced`));
          decisions.push({ resource: r, skip: false, wipe: true });
        } else {
          console.log(warn(`  [skip]   kv_config[${r.key}] — already populated (use --force to overwrite)`));
          recordResult(r.key, "already-populated", 1, "use --force to overwrite");
          decisions.push({ resource: r, skip: true, wipe: false });
        }
      } else {
        console.log(ok(`  [insert] kv_config[${r.key}] — no existing row`));
        decisions.push({ resource: r, skip: false, wipe: false });
      }
    } else {
      const existing = db
        .prepare(`SELECT COUNT(*) as cnt FROM ${tableName}`)
        .get();
      if (existing.cnt > 0) {
        if (FORCE) {
          console.log(warn(`  [force]  ${tableName} — ${existing.cnt} existing row(s) will be wiped and re-inserted`));
          decisions.push({ resource: r, skip: false, wipe: true });
        } else {
          console.log(warn(`  [skip]   ${tableName} — already has ${existing.cnt} row(s) (use --force to overwrite)`));
          recordResult(r.key, "already-populated", existing.cnt, "use --force to overwrite");
          decisions.push({ resource: r, skip: true, wipe: false });
        }
      } else {
        console.log(ok(`  [insert] ${tableName} — empty, ready for import`));
        decisions.push({ resource: r, skip: false, wipe: false });
      }
    }
  }

  console.log();

  const toInsert = decisions.filter((d) => !d.skip);
  if (toInsert.length === 0) {
    console.log(warn("All resources already populated. Nothing to insert. Use --force to overwrite."));
    printSummary();
    process.exit(0);
  }

  // --------------------------------------------------------------------------
  // Step 6: Prepare statements
  // --------------------------------------------------------------------------

  const upsertKvConfig = db.prepare(`
    INSERT INTO kv_config (key, value, updated_at)
    VALUES (@key, @value, @updated_at)
    ON CONFLICT (key) DO UPDATE SET
      value      = excluded.value,
      updated_at = excluded.updated_at
  `);

  const insertTemplate = db.prepare(`
    INSERT INTO templates (id, name, description, aspect_ratio, slides, tags, created_at)
    VALUES (@id, @name, @description, @aspect_ratio, @slides, @tags, @created_at)
  `);

  const insertStylePreset = db.prepare(`
    INSERT INTO style_presets (id, name, description, payload, created_at)
    VALUES (@id, @name, @description, @payload, @created_at)
  `);

  const insertAsset = db.prepare(`
    INSERT INTO assets (id, url, name, description, added_at)
    VALUES (@id, @url, @name, @description, @added_at)
  `);

  const insertStagedAction = db.prepare(`
    INSERT INTO staged_actions (id, type, file_name, content, description, carousel_id, auto_execute, status, created_at, resolved_at)
    VALUES (@id, @type, @file_name, @content, @description, @carousel_id, @auto_execute, @status, @created_at, @resolved_at)
  `);

  // --------------------------------------------------------------------------
  // Step 7: Insert in one transaction
  // --------------------------------------------------------------------------

  console.log(bold("--- Inserting ---"));

  const runMigration = db.transaction(() => {
    for (const { resource: r, wipe } of toInsert) {
      const tableName = tableNameFor(r.key);

      // Wipe before re-insert if forced
      if (wipe) {
        if (r.isSingleton) {
          db.prepare("DELETE FROM kv_config WHERE key = ?").run(r.key);
        } else {
          db.prepare(`DELETE FROM ${tableName}`).run();
        }
      }

      if (r.isSingleton) {
        upsertKvConfig.run({
          key: r.key,
          value: JSON.stringify(r.parsed),
          updated_at: new Date().toISOString(),
        });
        console.log(`  kv_config[${r.key}] — 1 row inserted`);
      } else {
        let count = 0;
        for (const item of r.items) {
          if (r.key === "templates") {
            insertTemplate.run(templateToRow(item));
          } else if (r.key === "style-presets") {
            insertStylePreset.run(stylePresetToRow(item));
          } else if (r.key === "assets") {
            insertAsset.run(assetToRow(item));
          } else if (r.key === "staged-actions") {
            insertStagedAction.run(stagedActionToRow(item));
          }
          count++;
        }
        console.log(`  ${tableName.padEnd(20)} — ${count} row(s) inserted`);
      }
    }
  });

  runMigration();
  console.log();

  // --------------------------------------------------------------------------
  // Step 8: Verify counts
  // --------------------------------------------------------------------------

  console.log(bold("--- Verification ---"));
  let allOk = true;

  for (const { resource: r, skip } of decisions) {
    if (skip) continue;

    const tableName = tableNameFor(r.key);

    if (r.isSingleton) {
      const row = db
        .prepare("SELECT value FROM kv_config WHERE key = ?")
        .get(r.key);
      if (!row) {
        console.log(err(`  kv_config[${r.key}]: MISSING after insert!`));
        allOk = false;
        recordResult(r.key, "error", 0, "row missing after insert");
      } else {
        let roundTripped;
        try {
          roundTripped = JSON.parse(row.value);
        } catch (e) {
          console.log(err(`  kv_config[${r.key}]: JSON parse error: ${e.message}`));
          allOk = false;
          recordResult(r.key, "error", 1, "JSON parse error");
          continue;
        }
        if (deepEqual(r.parsed, roundTripped)) {
          console.log(ok(`  kv_config[${r.key}]: 1 row — round-trip OK`));
          recordResult(r.key, "inserted", 1);
        } else {
          console.log(err(`  kv_config[${r.key}]: round-trip MISMATCH`));
          allOk = false;
          recordResult(r.key, "error", 1, "round-trip mismatch");
        }
      }
    } else {
      const { cnt } = db
        .prepare(`SELECT COUNT(*) as cnt FROM ${tableName}`)
        .get();

      if (cnt !== r.items.length) {
        console.log(
          err(`  ${tableName}: expected ${r.items.length} rows, got ${cnt}`)
        );
        allOk = false;
        recordResult(r.key, "error", cnt, `count mismatch (expected ${r.items.length})`);
        continue;
      }

      console.log(ok(`  ${tableName.padEnd(20)}: COUNT(*) = ${cnt} ✓`));

      // Spot-check: pick 1 random row and verify key fields
      if (r.items.length > 0) {
        const idx = Math.floor(Math.random() * r.items.length);
        const inputItem = r.items[idx];
        const spotOk = spotCheck(db, r.key, inputItem);
        if (spotOk) {
          console.log(ok(`    spot-check item[${idx}] id=${inputItem.id}: OK`));
        } else {
          console.log(err(`    spot-check item[${idx}] id=${inputItem.id}: MISMATCH`));
          allOk = false;
          recordResult(r.key, "error", cnt, `spot-check failed for id=${inputItem.id}`);
          continue;
        }
      }

      recordResult(r.key, "inserted", cnt);
    }
  }

  console.log();

  db.close();

  // --------------------------------------------------------------------------
  // Step 9: Print summary
  // --------------------------------------------------------------------------

  printSummary();

  if (!allOk) {
    console.log(err("Migration completed with errors. Review output above."));
    process.exit(1);
  }

  console.log(ok("Migration complete. All verifications passed."));
  console.log(dim(`DB: ${DB_PATH}`));
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Spot-check helpers per resource type
// ---------------------------------------------------------------------------

function spotCheck(db, key, inputItem) {
  if (key === "templates") {
    const row = db
      .prepare("SELECT * FROM templates WHERE id = ?")
      .get(inputItem.id);
    if (!row) return false;
    return (
      row.id === inputItem.id &&
      row.name === inputItem.name &&
      row.description === inputItem.description &&
      row.aspect_ratio === inputItem.aspectRatio &&
      deepEqual(JSON.parse(row.tags), inputItem.tags ?? [])
    );
  }

  if (key === "style-presets") {
    const row = db
      .prepare("SELECT * FROM style_presets WHERE id = ?")
      .get(inputItem.id);
    if (!row) return false;
    // Reconstruct and compare key fields
    const readBack = rowToStylePreset(row);
    return (
      readBack.id === inputItem.id &&
      readBack.name === inputItem.name &&
      readBack.createdAt === inputItem.createdAt
    );
  }

  if (key === "assets") {
    const row = db
      .prepare("SELECT * FROM assets WHERE id = ?")
      .get(inputItem.id);
    if (!row) return false;
    return (
      row.id === inputItem.id &&
      row.url === inputItem.url &&
      row.name === inputItem.name &&
      row.added_at === inputItem.addedAt &&
      (row.description ?? undefined) === inputItem.description
    );
  }

  if (key === "staged-actions") {
    const row = db
      .prepare("SELECT * FROM staged_actions WHERE id = ?")
      .get(inputItem.id);
    if (!row) return false;
    return (
      row.id === inputItem.id &&
      row.type === inputItem.type &&
      row.file_name === inputItem.fileName &&
      row.status === inputItem.status &&
      row.carousel_id === inputItem.carouselId &&
      row.auto_execute === (inputItem.autoExecute ? 1 : 0)
    );
  }

  return true;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tableNameFor(key) {
  switch (key) {
    case "brand":
    case "business-context":
      return "kv_config";
    case "templates":
      return "templates";
    case "style-presets":
      return "style_presets";
    case "assets":
      return "assets";
    case "staged-actions":
      return "staged_actions";
    default:
      return key;
  }
}

function printSummary() {
  console.log(bold("--- Summary ---"));

  // All six resource keys
  const allKeys = ["brand", "business-context", "templates", "style-presets", "assets", "staged-actions"];

  // Fill in any not yet in summary as "not attempted"
  for (const k of allKeys) {
    if (!summary.find((s) => s.resource === k)) {
      // Was in toInsert list but no recordResult called — shouldn't happen normally
    }
  }

  // Print table
  const header = `  ${"Resource".padEnd(22)} ${"Status".padEnd(18)} ${"Count".padStart(6)}  Note`;
  console.log(dim(header));
  console.log(dim("  " + "-".repeat(65)));

  for (const s of summary) {
    const statusColored =
      s.status === "inserted"
        ? ok(s.status.padEnd(18))
        : s.status === "skipped"
        ? dim(s.status.padEnd(18))
        : s.status === "already-populated"
        ? warn(s.status.padEnd(18))
        : err(s.status.padEnd(18));
    const noteStr = s.note ? dim(s.note) : "";
    console.log(
      `  ${s.resource.padEnd(22)} ${statusColored} ${String(s.count).padStart(6)}  ${noteStr}`
    );
  }
  console.log();
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

main().catch((e) => {
  console.error(err("Fatal error:"), e);
  process.exit(1);
});
