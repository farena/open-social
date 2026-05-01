#!/usr/bin/env node
/**
 * One-shot migration: data/content-items.json → data/sales.db
 *
 * This script intentionally shadows the TS helpers from
 * src/lib/content-item-row.ts (contentItemToRow / slideToRow / rowToContentItem / rowToSlide)
 * and the schema from src/lib/db.ts. Duplication is acceptable here because:
 *  1. This is a one-shot migration script, not production code.
 *  2. It must be runnable without TypeScript compilation (ESM .mjs, node directly).
 *  3. The canonical helpers live in the TS layer; this script must not depend on them.
 *
 * Args:
 *   --dry-run   No writes; print summary only. Exit 0.
 *   --force     Allow proceeding when data/sales.db already exists.
 *
 * Usage:
 *   node scripts/migrate-content-items-to-sqlite.mjs --dry-run
 *   node scripts/migrate-content-items-to-sqlite.mjs --force
 */

import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const ROOT = new URL("../", import.meta.url).pathname;
const DATA_DIR = path.join(ROOT, "data");
const JSON_PATH = path.join(DATA_DIR, "content-items.json");
const DB_PATH = path.join(DATA_DIR, "sales.db");

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const FORCE = args.includes("--force");

// ---------------------------------------------------------------------------
// SQL schema — mirrors src/lib/db.ts exactly
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Inline serialization helpers (mirrors src/lib/content-item-row.ts)
// ---------------------------------------------------------------------------

/**
 * ContentItem → SQL row object (mirrors contentItemToRow in TS source).
 * @param {object} item
 * @returns {object}
 */
function contentItemToRow(item) {
  return {
    id: item.id,
    type: item.type,
    state: item.state,
    aspect_ratio: item.aspectRatio,
    hook: item.hook,
    body_idea: item.bodyIdea,
    caption: item.caption,
    hashtags: JSON.stringify(item.hashtags),
    notes: item.notes ?? null,
    chat_session_id: item.chatSessionId ?? null,
    reference_images:
      item.referenceImages !== undefined
        ? JSON.stringify(item.referenceImages)
        : null,
    assets: item.assets !== undefined ? JSON.stringify(item.assets) : null,
    tags: item.tags !== undefined ? JSON.stringify(item.tags) : null,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
    generated_at: item.generatedAt ?? null,
  };
}

/**
 * Slide → SQL row object (mirrors slideToRow in TS source).
 * Explicitly defaults nextVersions to [] when missing (legacy on-disk shape).
 * @param {object} slide
 * @param {string} contentItemId
 * @param {number} order
 * @returns {object}
 */
function slideToRow(slide, contentItemId, order) {
  return {
    id: slide.id,
    content_item_id: contentItemId,
    slide_order: order,
    notes: slide.notes ?? "",
    background: JSON.stringify(slide.background),
    elements: JSON.stringify(slide.elements),
    legacy_html: slide.legacyHtml ?? null,
    previous_versions: JSON.stringify(slide.previousVersions ?? []),
    // Explicit default: [] if missing (lazy migration — mirrors load() in content-items.ts)
    next_versions: JSON.stringify(slide.nextVersions ?? []),
  };
}

/**
 * SQL row → ContentItem (mirrors rowToContentItem in TS source).
 * @param {object} row
 * @param {object[]} slideRows
 * @returns {object}
 */
function rowToContentItem(row, slideRows) {
  const slides = slideRows
    .slice()
    .sort((a, b) => a.slide_order - b.slide_order)
    .map(rowToSlide);

  const item = {
    id: row.id,
    type: row.type,
    state: row.state,
    hook: row.hook,
    bodyIdea: row.body_idea,
    caption: row.caption,
    hashtags: JSON.parse(row.hashtags),
    aspectRatio: row.aspect_ratio,
    slides,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  if (row.notes !== null) item.notes = row.notes;
  if (row.chat_session_id !== null) item.chatSessionId = row.chat_session_id;
  if (row.reference_images !== null)
    item.referenceImages = JSON.parse(row.reference_images);
  if (row.assets !== null) item.assets = JSON.parse(row.assets);
  if (row.tags !== null) item.tags = JSON.parse(row.tags);
  if (row.generated_at !== null) item.generatedAt = row.generated_at;

  return item;
}

/**
 * SQL row → Slide (mirrors rowToSlide in TS source).
 * @param {object} row
 * @returns {object}
 */
function rowToSlide(row) {
  const slide = {
    id: row.id,
    order: row.slide_order,
    notes: row.notes,
    background: JSON.parse(row.background),
    elements: JSON.parse(row.elements),
    previousVersions: JSON.parse(row.previous_versions),
    nextVersions: JSON.parse(row.next_versions),
  };

  if (row.legacy_html !== null) {
    slide.legacyHtml = row.legacy_html;
  }

  return slide;
}

// ---------------------------------------------------------------------------
// Structural validation (lightweight — mirrors key fields from content-item-schema.ts)
// ---------------------------------------------------------------------------

const VALID_TYPES = new Set(["post", "story", "carousel"]);
const VALID_STATES = new Set(["idea", "generating", "generated"]);
const VALID_RATIOS = new Set(["1:1", "9:16", "4:5"]);

function validateItem(item, index) {
  const errors = [];

  if (typeof item.id !== "string" || item.id.length === 0)
    errors.push("missing or empty id");
  if (!VALID_TYPES.has(item.type))
    errors.push(`invalid type: ${item.type}`);
  if (!VALID_STATES.has(item.state))
    errors.push(`invalid state: ${item.state}`);
  if (!VALID_RATIOS.has(item.aspectRatio))
    errors.push(`invalid aspectRatio: ${item.aspectRatio}`);
  if (typeof item.hook !== "string")
    errors.push("hook must be a string");
  if (typeof item.bodyIdea !== "string")
    errors.push("bodyIdea must be a string");
  if (typeof item.caption !== "string")
    errors.push("caption must be a string");
  if (!Array.isArray(item.hashtags))
    errors.push("hashtags must be an array");
  if (!Array.isArray(item.slides))
    errors.push("slides must be an array");
  if (typeof item.createdAt !== "string" || item.createdAt.length === 0)
    errors.push("missing createdAt");
  if (typeof item.updatedAt !== "string" || item.updatedAt.length === 0)
    errors.push("missing updatedAt");

  return errors;
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
// Normalise an input item for comparison: fill nextVersions defaults
// so the round-trip deep-equal works even for legacy items
// ---------------------------------------------------------------------------

function stripNulls(obj) {
  // Strip keys with null/undefined values to match rowToContentItem's behaviour:
  // optional fields that are absent in the row come back as absent keys, not as
  // null values. The source JSON sometimes stores nulls explicitly.
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    out[k] = v;
  }
  return out;
}

function normaliseForComparison(item) {
  return stripNulls({
    ...item,
    slides: (item.slides ?? []).map((slide) =>
      stripNulls({
        ...slide,
        previousVersions: slide.previousVersions ?? [],
        nextVersions: slide.nextVersions ?? [],
      }),
    ),
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // 1. Resolve JSON path
  if (!fs.existsSync(JSON_PATH)) {
    console.log("No JSON to migrate: data/content-items.json not found. Exiting.");
    process.exit(0);
  }

  // 2. Read and parse JSON
  const raw = await fsPromises.readFile(JSON_PATH, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(`Failed to parse JSON: ${err.message}`);
    process.exit(1);
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray(parsed.contentItems)
  ) {
    console.error(
      'Invalid JSON shape: expected top-level { contentItems: [...] }'
    );
    process.exit(1);
  }

  const items = parsed.contentItems;

  // Validate each item (structural checks)
  const validationErrors = [];
  for (let i = 0; i < items.length; i++) {
    const errors = validateItem(items[i], i);
    if (errors.length > 0) {
      validationErrors.push(`Item[${i}] id=${items[i]?.id ?? "??"}: ${errors.join("; ")}`);
    }
  }

  if (validationErrors.length > 0) {
    console.error(`Validation failed — ${validationErrors.length} error(s):`);
    for (const e of validationErrors) {
      console.error(`  • ${e}`);
    }
    process.exit(1);
  }

  // Compute summary stats
  const totalSlides = items.reduce(
    (sum, item) => sum + (item.slides?.length ?? 0),
    0
  );
  const avgSlides = items.length > 0 ? (totalSlides / items.length).toFixed(2) : "0";

  // Sample IDs for reporting (3 evenly-spaced)
  const sampleIndices = items.length <= 3
    ? items.map((_, i) => i)
    : [
        0,
        Math.floor(items.length / 2),
        items.length - 1,
      ];
  const sampleIds = sampleIndices.map((i) => items[i].id);

  const backupPath = `${JSON_PATH}.bak.${new Date().toISOString().replace(/:/g, "-")}`;

  // 3. Dry-run: print report and exit
  if (DRY_RUN) {
    console.log("=== Dry-run report ===");
    console.log(`  JSON path:        ${JSON_PATH}`);
    console.log(`  DB path:          ${DB_PATH}`);
    console.log(`  Backup target:    ${backupPath}`);
    console.log("");
    console.log(`  Content items:    ${items.length}`);
    console.log(`  Total slides:     ${totalSlides}`);
    console.log(`  Avg slides/item:  ${avgSlides}`);
    console.log("");
    console.log(`  Validation:       ${validationErrors.length} error(s) — OK`);
    console.log("");
    console.log("  Sample IDs:");
    for (const id of sampleIds) {
      console.log(`    - ${id}`);
    }
    console.log("");
    if (fs.existsSync(DB_PATH)) {
      console.log(
        `  NOTE: data/sales.db already exists. Real migration will require --force.`
      );
    } else {
      console.log("  NOTE: data/sales.db does not exist yet (fresh migration).");
    }
    console.log("");
    console.log("Dry-run complete. No files were written.");
    process.exit(0);
  }

  // 4. Real migration
  // 4a. Check for existing DB
  if (fs.existsSync(DB_PATH) && !FORCE) {
    console.error(
      `data/sales.db already exists. To overwrite, re-run with --force.\n` +
        `Aborting to protect existing data.`
    );
    process.exit(1);
  }

  // 4b. Backup JSON
  await fsPromises.copyFile(JSON_PATH, backupPath);
  console.log(`Backup written → ${backupPath}`);

  // 4c. Open DB with better-sqlite3
  const Database = require("better-sqlite3");
  const db = new Database(DB_PATH);

  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");

  db.exec(SCHEMA_SQL);

  // 4d. Insert in one transaction
  const insertItem = db.prepare(`
    INSERT INTO content_items (
      id, type, state, aspect_ratio, hook, body_idea, caption, hashtags,
      notes, chat_session_id, reference_images, assets, tags,
      created_at, updated_at, generated_at
    ) VALUES (
      @id, @type, @state, @aspect_ratio, @hook, @body_idea, @caption, @hashtags,
      @notes, @chat_session_id, @reference_images, @assets, @tags,
      @created_at, @updated_at, @generated_at
    )
  `);

  const insertSlide = db.prepare(`
    INSERT INTO slides (
      id, content_item_id, slide_order, notes, background, elements,
      legacy_html, previous_versions, next_versions
    ) VALUES (
      @id, @content_item_id, @slide_order, @notes, @background, @elements,
      @legacy_html, @previous_versions, @next_versions
    )
  `);

  const runMigration = db.transaction(() => {
    for (const item of items) {
      const row = contentItemToRow(item);
      insertItem.run(row);

      for (let i = 0; i < (item.slides ?? []).length; i++) {
        const slideRow = slideToRow(item.slides[i], item.id, i);
        insertSlide.run(slideRow);
      }
    }
  });

  runMigration();
  console.log(`Inserted ${items.length} content items and ${totalSlides} slides.`);

  // 4e. Verify count
  const { count } = db.prepare("SELECT COUNT(*) as count FROM content_items").get();
  if (count !== items.length) {
    console.error(
      `Verification FAILED: expected ${items.length} rows in content_items, got ${count}`
    );
    db.close();
    process.exit(1);
  }
  console.log(`Verification: COUNT(*) = ${count} ✓`);

  // 4f. Spot-check 3 random items
  let spotCheckPassed = 0;
  let spotCheckFailed = 0;

  for (const idx of sampleIndices) {
    const inputItem = normaliseForComparison(items[idx]);
    const itemId = inputItem.id;

    const itemRow = db
      .prepare("SELECT * FROM content_items WHERE id = ?")
      .get(itemId);
    const slideRows = db
      .prepare(
        "SELECT * FROM slides WHERE content_item_id = ? ORDER BY slide_order"
      )
      .all(itemId);

    const readBack = rowToContentItem(itemRow, slideRows);

    if (deepEqual(inputItem, readBack)) {
      spotCheckPassed++;
      console.log(`Spot-check item[${idx}] id=${itemId}: OK`);
    } else {
      spotCheckFailed++;
      console.error(`Spot-check item[${idx}] id=${itemId}: MISMATCH`);
      console.error("  Input:  ", JSON.stringify(inputItem).slice(0, 200));
      console.error("  Read:   ", JSON.stringify(readBack).slice(0, 200));
    }
  }

  db.close();

  if (spotCheckFailed > 0) {
    console.error(
      `Migration completed but ${spotCheckFailed} spot-check(s) failed. Investigate before using.`
    );
    process.exit(1);
  }

  console.log(
    `\nMigration complete. ${items.length} items, ${totalSlides} slides. All spot-checks passed.`
  );
  console.log(`DB: ${DB_PATH}`);
  console.log(`Backup: ${backupPath}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
