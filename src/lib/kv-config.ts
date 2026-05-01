import { getDb } from "./db";
import { now } from "./utils";

export async function getKvConfig<T>(key: string, defaultValue: T): Promise<T> {
  const db = getDb();
  const row = db
    .prepare<[string], { value: string }>("SELECT value FROM kv_config WHERE key = ?")
    .get(key);
  if (!row) return defaultValue;
  return JSON.parse(row.value) as T;
}

export async function setKvConfig<T>(key: string, value: T): Promise<void> {
  const db = getDb();
  db.prepare(
    `INSERT INTO kv_config (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(key, JSON.stringify(value), now());
}
