import { lstatSync, readFileSync, readdirSync, statSync, statfsSync } from "node:fs";
import { join } from "node:path";

export const JOURNAL_WRITE_RESERVE_BYTES = 64 * 1024 * 1024;
export const JOURNAL_WAL_LIMIT_BYTES = 64 * 1024 * 1024;
const JOURNAL_TOTAL_RESERVE_BYTES = JOURNAL_WRITE_RESERVE_BYTES + JOURNAL_WAL_LIMIT_BYTES;
const MIN_FREE_BYTES = 512 * 1024 * 1024;
const REFRESH_INTERVAL_MS = 1000;

type StoragePolicy = { volume: string; external_root: string; limit_bytes: number };

const bytesIn = (root: string): number => {
  let total = 0;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) total += bytesIn(path);
    else if (entry.isFile()) total += lstatSync(path).size;
  }
  return total;
};

const policy = (): StoragePolicy | null => {
  if (process.env.DESK_STORAGE_MODE !== "EXTERNAL") return null;
  const path = process.env.DESK_STORAGE_POLICY;
  if (!path) return null;
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as StoragePolicy;
    if (!value.volume || !value.external_root || !Number.isSafeInteger(value.limit_bytes))
      return null;
    return value;
  } catch {
    return null;
  }
};

const sidecarBytes = (dbPath: string): number => {
  let total = 0;
  for (const path of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
    try {
      total += statSync(path).size;
    } catch {
      continue;
    }
  }
  return total;
};

export class JournalStorageBudgetError extends Error {
  constructor() {
    super("Journal storage budget reached. Connect SAMSUNG USB or choose temporary local storage.");
    this.name = "JournalStorageBudgetError";
  }
}

export class JournalBudget {
  private readonly configured: StoragePolicy | null;
  private readonly dbPath: string;
  private nonDatabaseBytes = 0;
  private refreshedAt = 0;

  constructor(dbPath: string) {
    this.configured = policy();
    this.dbPath = dbPath;
    this.refresh(true);
  }

  private refresh(force = false): boolean {
    if (process.env.DESK_STORAGE_MODE !== "EXTERNAL") return true;
    if (!this.configured) return false;
    const now = Date.now();
    if (!force && now - this.refreshedAt < REFRESH_INTERVAL_MS) return true;
    try {
      this.nonDatabaseBytes = Math.max(
        0,
        bytesIn(this.configured.external_root) - sidecarBytes(this.dbPath),
      );
      this.refreshedAt = now;
      return true;
    } catch {
      return false;
    }
  }

  available(additional = 0): boolean {
    if (additional < 0 || !Number.isSafeInteger(additional)) return false;
    if (process.env.DESK_STORAGE_MODE !== "EXTERNAL") return true;
    if (!this.refresh() || !this.configured) return false;
    try {
      const stats = statfsSync(this.configured.volume);
      const free = Number(stats.bavail) * Number(stats.bsize);
      const used = this.nonDatabaseBytes + sidecarBytes(this.dbPath);
      // Managed connections use a rollback journal. Reserve a full database copy
      // so even one large transaction cannot exhaust the shared budget.
      let rollbackReserve = 0;
      try {
        rollbackReserve = statSync(this.dbPath).size;
      } catch {
        /* New database. */
      }
      return (
        used + 2 * additional + rollbackReserve + JOURNAL_TOTAL_RESERVE_BYTES <=
          this.configured.limit_bytes &&
        free >
          Math.max(MIN_FREE_BYTES, 2 * additional + rollbackReserve + JOURNAL_TOTAL_RESERVE_BYTES)
      );
    } catch {
      return false;
    }
  }

  assert(additional = 0): void {
    if (!this.available(additional)) throw new JournalStorageBudgetError();
  }

  configureSqlite(sqlite: {
    pragma: (statement: string, options?: { simple: boolean }) => unknown;
  }): void {
    this.assert();
    if (process.env.DESK_STORAGE_MODE !== "EXTERNAL" || !this.configured) return;
    const pageSize = Number(sqlite.pragma("page_size", { simple: true }));
    const currentPages = Number(sqlite.pragma("page_count", { simple: true }));
    const remaining =
      this.configured.limit_bytes - this.nonDatabaseBytes - JOURNAL_TOTAL_RESERVE_BYTES;
    const maxPages = Math.max(currentPages, Math.floor(remaining / (2 * pageSize)));
    sqlite.pragma(`max_page_count = ${maxPages}`);
  }
}

let activeBudget: JournalBudget | undefined;

export const createJournalBudget = (dbPath: string): JournalBudget => {
  activeBudget = new JournalBudget(dbPath);
  return activeBudget;
};

export const journalBudgetAvailable = (additional = 0): boolean => {
  if (activeBudget) return activeBudget.available(additional);
  return process.env.DESK_STORAGE_MODE !== "EXTERNAL";
};

export const assertJournalBudget = (additional = 0): void => {
  if (activeBudget) activeBudget.assert(additional);
  else if (!journalBudgetAvailable(additional)) throw new JournalStorageBudgetError();
};
