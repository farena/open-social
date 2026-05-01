/**
 * Content-item-level versioning library.
 *
 * Provides 5-FIFO snapshot retention for full ContentItem state
 * (item row + all slide rows). Triggered before agent turns (/generate,
 * /chat). Restore is transactional and itself creates a defensive
 * "pre-restore" snapshot of the current (pre-restore) state.
 *
 * Snapshot payload shape: { itemRow: ContentItemRow, slideRows: SlideRow[] }
 *
 * All functions are async for API consistency with content-items.ts,
 * even though better-sqlite3 is synchronous.
 */

import { getDb } from "./db";
import {
  rowToContentItem,
  type ContentItemRow,
  type SlideRow,
} from "./content-item-row";
import type { ContentItem } from "@/types/content-item";

// ---------------------------------------------------------------------------
// Constants & types
// ---------------------------------------------------------------------------

export const MAX_ITEM_SNAPSHOTS = 5;

export type ItemSnapshotTrigger = "generate" | "chat" | "pre-restore";

export interface ItemSnapshotSummary {
  id: string;
  createdAt: string;
  trigger: ItemSnapshotTrigger;
  label?: string;
}

// Shape of the payload JSON stored in content_item_snapshots.payload
interface SnapshotPayload {
  itemRow: ContentItemRow;
  slideRows: SlideRow[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function fetchItemRowRaw(id: string): ContentItemRow | undefined {
  const db = getDb();
  return db
    .prepare("SELECT * FROM content_items WHERE id = ?")
    .get(id) as ContentItemRow | undefined;
}

function fetchSlideRowsRaw(contentItemId: string): SlideRow[] {
  const db = getDb();
  return db
    .prepare(
      "SELECT * FROM slides WHERE content_item_id = ? ORDER BY slide_order ASC",
    )
    .all(contentItemId) as SlideRow[];
}

/**
 * Insert a snapshot row and trim to MAX_ITEM_SNAPSHOTS FIFO.
 * Must be called inside a transaction (or standalone — both work with
 * better-sqlite3's sync API).
 *
 * Returns the inserted summary, or null if the item doesn't exist.
 * This is inlined in restoreItemSnapshot as well.
 */
function insertSnapshot(
  contentItemId: string,
  trigger: ItemSnapshotTrigger,
  payload: SnapshotPayload,
  label?: string,
): ItemSnapshotSummary {
  const db = getDb();
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const payloadJson = JSON.stringify(payload);

  db.prepare(
    `INSERT INTO content_item_snapshots (id, content_item_id, created_at, trigger, label, payload)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, contentItemId, createdAt, trigger, label ?? null, payloadJson);

  // FIFO trim: delete snapshots beyond MAX_ITEM_SNAPSHOTS for this item
  db.prepare(
    `DELETE FROM content_item_snapshots
     WHERE content_item_id = ?
       AND id NOT IN (
         SELECT id FROM content_item_snapshots
         WHERE content_item_id = ?
         ORDER BY created_at DESC
         LIMIT ?
       )`,
  ).run(contentItemId, contentItemId, MAX_ITEM_SNAPSHOTS);

  const summary: ItemSnapshotSummary = { id, createdAt, trigger };
  if (label !== undefined) summary.label = label;
  return summary;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Capture a snapshot of the current content item (item row + all slide rows).
 *
 * Returns the snapshot summary (no payload), or null if the item doesn't exist.
 */
export async function pushItemSnapshot(
  itemId: string,
  trigger: ItemSnapshotTrigger,
  label?: string,
): Promise<ItemSnapshotSummary | null> {
  const db = getDb();

  return db.transaction(() => {
    const itemRow = fetchItemRowRaw(itemId);
    if (!itemRow) return null;

    const slideRows = fetchSlideRowsRaw(itemId);
    const payload: SnapshotPayload = { itemRow, slideRows };

    return insertSnapshot(itemId, trigger, payload, label);
  })();
}

/**
 * List up to MAX_ITEM_SNAPSHOTS snapshots for an item, newest-first.
 * Does not include the payload column.
 */
export async function listItemSnapshots(
  itemId: string,
): Promise<ItemSnapshotSummary[]> {
  const db = getDb();

  const rows = db
    .prepare(
      `SELECT id, created_at, trigger, label
       FROM content_item_snapshots
       WHERE content_item_id = ?
       ORDER BY created_at DESC
       LIMIT ?`,
    )
    .all(itemId, MAX_ITEM_SNAPSHOTS) as Array<{
    id: string;
    created_at: string;
    trigger: string;
    label: string | null;
  }>;

  return rows.map((row) => {
    const summary: ItemSnapshotSummary = {
      id: row.id,
      createdAt: row.created_at,
      trigger: row.trigger as ItemSnapshotTrigger,
    };
    if (row.label !== null) summary.label = row.label;
    return summary;
  });
}

/**
 * Restore a content item to a previous snapshot.
 *
 * In one transaction:
 *  1. Load the snapshot payload. If missing → return null.
 *  2. Load the current item state. If missing → return null.
 *  3. Push a defensive "pre-restore" snapshot of the *current* state.
 *  4. Replace the item row and slide rows from the snapshot payload.
 *  5. Apply FIFO trim (already done inside insertSnapshot).
 *  6. Return the restored ContentItem.
 */
export async function restoreItemSnapshot(
  itemId: string,
  snapshotId: string,
): Promise<ContentItem | null> {
  const db = getDb();

  return db.transaction(() => {
    // 1. Load the snapshot
    const snapRow = db
      .prepare(
        "SELECT payload FROM content_item_snapshots WHERE id = ? AND content_item_id = ?",
      )
      .get(snapshotId, itemId) as { payload: string } | undefined;

    if (!snapRow) return null;

    // 2. Load the current item (needed for defensive snapshot)
    const currentItemRow = fetchItemRowRaw(itemId);
    if (!currentItemRow) return null;

    // 3. Push a defensive "pre-restore" snapshot of the current state
    const currentSlideRows = fetchSlideRowsRaw(itemId);
    const defensivePayload: SnapshotPayload = {
      itemRow: currentItemRow,
      slideRows: currentSlideRows,
    };
    insertSnapshot(itemId, "pre-restore", defensivePayload);

    // 4. Parse the target snapshot payload
    const payload = JSON.parse(snapRow.payload) as SnapshotPayload;
    const { itemRow: targetItemRow, slideRows: targetSlideRows } = payload;

    // Replace the content_items row
    db.prepare(
      `UPDATE content_items SET
         type             = @type,
         state            = @state,
         aspect_ratio     = @aspect_ratio,
         hook             = @hook,
         body_idea        = @body_idea,
         caption          = @caption,
         hashtags         = @hashtags,
         notes            = @notes,
         chat_session_id  = @chat_session_id,
         reference_images = @reference_images,
         assets           = @assets,
         tags             = @tags,
         updated_at       = @updated_at,
         generated_at     = @generated_at
       WHERE id = @id`,
    ).run(targetItemRow);

    // Replace slide rows: delete current slides, insert snapshot slides
    db.prepare("DELETE FROM slides WHERE content_item_id = ?").run(itemId);

    const insertSlide = db.prepare(
      `INSERT INTO slides
         (id, content_item_id, slide_order, notes, background, elements, legacy_html, previous_versions, next_versions)
       VALUES
         (@id, @content_item_id, @slide_order, @notes, @background, @elements, @legacy_html, @previous_versions, @next_versions)`,
    );

    // Ensure slide rows reference the correct item id (payload should already have it)
    for (const slideRow of targetSlideRows) {
      insertSlide.run({ ...slideRow, content_item_id: itemId });
    }

    // 5. Read back and return the restored ContentItem
    const restoredItemRow = fetchItemRowRaw(itemId);
    const restoredSlideRows = fetchSlideRowsRaw(itemId);
    return rowToContentItem(restoredItemRow!, restoredSlideRows);
  })() as ContentItem | null;
}
