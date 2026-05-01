import { getDb } from "./db";
import { generateId, now } from "./utils";
import type {
  StagedAction,
  StagedActionType,
  StagedActionStatus,
} from "@/types/staged-action";

// ---------------------------------------------------------------------------
// Row shape (snake_case columns as stored in SQLite)
// ---------------------------------------------------------------------------

interface StagedActionRow {
  id: string;
  type: string;
  file_name: string;
  content: string;
  description: string;
  carousel_id: string;
  auto_execute: number; // SQLite INTEGER: 0 or 1
  status: string;
  created_at: string;
  resolved_at: string | null;
}

// ---------------------------------------------------------------------------
// (De)serialization helpers
// ---------------------------------------------------------------------------

function rowToStagedAction(row: StagedActionRow): StagedAction {
  return {
    id: row.id,
    type: row.type as StagedActionType,
    fileName: row.file_name,
    content: row.content,
    description: row.description,
    carouselId: row.carousel_id,
    autoExecute: row.auto_execute !== 0,
    status: row.status as StagedActionStatus,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at ?? null,
  };
}

function stagedActionToRow(
  action: StagedAction,
): StagedActionRow {
  return {
    id: action.id,
    type: action.type,
    file_name: action.fileName,
    content: action.content,
    description: action.description,
    carousel_id: action.carouselId,
    auto_execute: action.autoExecute ? 1 : 0,
    status: action.status,
    created_at: action.createdAt,
    resolved_at: action.resolvedAt ?? null,
  };
}

// ---------------------------------------------------------------------------
// Public API (signatures unchanged)
// ---------------------------------------------------------------------------

export async function listStagedActions(): Promise<StagedAction[]> {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM staged_actions ORDER BY created_at ASC")
    .all() as StagedActionRow[];
  return rows.map(rowToStagedAction);
}

export async function getStagedAction(
  id: string,
): Promise<StagedAction | null> {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM staged_actions WHERE id = ?")
    .get(id) as StagedActionRow | undefined;
  return row ? rowToStagedAction(row) : null;
}

export async function createStagedAction(params: {
  type: StagedActionType;
  fileName: string;
  content: string;
  description: string;
  carouselId: string;
  autoExecute?: boolean;
}): Promise<StagedAction> {
  const action: StagedAction = {
    id: generateId(),
    type: params.type,
    fileName: params.fileName,
    content: params.content,
    description: params.description,
    carouselId: params.carouselId,
    autoExecute: params.autoExecute ?? false,
    status: "pending",
    createdAt: now(),
    resolvedAt: null,
  };

  const db = getDb();
  const row = stagedActionToRow(action);
  db.prepare(
    `INSERT INTO staged_actions
       (id, type, file_name, content, description, carousel_id,
        auto_execute, status, created_at, resolved_at)
     VALUES
       (@id, @type, @file_name, @content, @description, @carousel_id,
        @auto_execute, @status, @created_at, @resolved_at)`,
  ).run(row);

  return action;
}

export async function updateStagedAction(
  id: string,
  updates: Partial<Pick<StagedAction, "status" | "resolvedAt">>,
): Promise<StagedAction | null> {
  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM staged_actions WHERE id = ?")
    .get(id) as StagedActionRow | undefined;
  if (!existing) return null;

  const merged: StagedActionRow = {
    ...existing,
    ...(updates.status !== undefined ? { status: updates.status } : {}),
    // Explicit null check: pass NULL when resolvedAt is null (not the string "null")
    ...(Object.prototype.hasOwnProperty.call(updates, "resolvedAt")
      ? { resolved_at: updates.resolvedAt ?? null }
      : {}),
  };

  db.prepare(
    `UPDATE staged_actions
     SET status = @status, resolved_at = @resolved_at
     WHERE id = @id`,
  ).run({
    id: merged.id,
    status: merged.status,
    resolved_at: merged.resolved_at,
  });

  return rowToStagedAction(merged);
}

export async function updateStagedActionStatus(
  id: string,
  status: StagedActionStatus,
): Promise<StagedAction | null> {
  return updateStagedAction(id, {
    status,
    resolvedAt: status !== "pending" ? now() : null,
  });
}
