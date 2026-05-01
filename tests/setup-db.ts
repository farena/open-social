// Global vitest setup. Forces a unique KMPUS_DB_PATH per worker process so
// no test can ever touch the real data/sales.db, even if a test file
// forgets its own beforeEach. Test files are still free to override
// KMPUS_DB_PATH in their own beforeEach for finer-grained isolation —
// this only kicks in if nothing else set it first.

import { afterAll, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const fallbackDbPath = path.join(
  os.tmpdir(),
  `kmpus-vitest-${process.pid}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.db`,
);

// Re-apply the fallback before every test. Test files that set their own
// KMPUS_DB_PATH in beforeEach run after this and override it. Test files
// that don't manage the env var stay safely on the fallback.
beforeEach(() => {
  if (!process.env.KMPUS_DB_PATH) {
    process.env.KMPUS_DB_PATH = fallbackDbPath;
  }
});

afterAll(() => {
  for (const candidate of [fallbackDbPath]) {
    for (const ext of ["", "-wal", "-shm"]) {
      const f = candidate + ext;
      if (fs.existsSync(f)) {
        try {
          fs.unlinkSync(f);
        } catch {
          // best-effort
        }
      }
    }
  }
});
