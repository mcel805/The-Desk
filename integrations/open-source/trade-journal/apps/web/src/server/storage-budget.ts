import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, readdirSync, statSync, statfsSync } from "node:fs";
import { join } from "node:path";

export const JOURNAL_WRITE_RESERVE_BYTES = 64 * 1024 * 1024;
export const JOURNAL_WAL_LIMIT_BYTES = 64 * 1024 * 1024;
const JOURNAL_TOTAL_RESERVE_BYTES = JOURNAL_WRITE_RESERVE_BYTES + JOURNAL_WAL_LIMIT_BYTES;
const MIN_FREE_BYTES = 512 * 1024 * 1024;

type StoragePolicy = { volume: string; external_root: string; limit_bytes: number; control?: string };
type StorageState = { external_root: string; limit_bytes: number; used_bytes: number; reserved_bytes?: number };

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

const reservationPath = (): string | null => {
  if (process.env.DESK_STORAGE_RESERVATIONS) return process.env.DESK_STORAGE_RESERVATIONS;
  if (process.env.DESK_STORAGE_STATE) return `${process.env.DESK_STORAGE_STATE}.sqlite3`;
  return null;
};

const processAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
};

const openLedger = (path: string): Database.Database => {
  mkdirSync(join(path, ".."), { recursive: true });
  const db = new Database(path);
  db.pragma("busy_timeout = 15000");
  db.exec(`CREATE TABLE IF NOT EXISTS budget_meta (
    id INTEGER PRIMARY KEY CHECK(id = 1), external_root TEXT NOT NULL,
    limit_bytes INTEGER NOT NULL, base_used INTEGER NOT NULL, committed_bytes INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS budget_reservations (
    token TEXT PRIMARY KEY, owner_pid INTEGER NOT NULL, bytes INTEGER NOT NULL, created_at INTEGER NOT NULL
  );`);
  return db;
};

const stateValue = (configured: StoragePolicy): number | null => {
  const path = process.env.DESK_STORAGE_STATE;
  if (!path) return null;
  try {
    const state = JSON.parse(readFileSync(path, "utf8")) as StorageState;
    if (state.external_root !== configured.external_root || state.limit_bytes !== configured.limit_bytes) return null;
    return Number.isSafeInteger(state.used_bytes) && state.used_bytes >= 0 ? state.used_bytes : null;
  } catch {
    return null;
  }
};

const ensureLedger = (db: Database.Database, configured: StoragePolicy, initial: number): void => {
  const row = db.prepare("SELECT external_root, limit_bytes FROM budget_meta WHERE id = 1").get() as
    | { external_root: string; limit_bytes: number }
    | undefined;
  if (!row || row.external_root !== configured.external_root || row.limit_bytes !== configured.limit_bytes) {
    db.prepare("DELETE FROM budget_reservations").run();
    db.prepare("INSERT OR REPLACE INTO budget_meta VALUES(1, ?, ?, ?, 0)").run(
      configured.external_root,
      configured.limit_bytes,
      Math.max(0, initial),
    );
  }
};

const cleanLedger = (db: Database.Database): void => {
  const rows = db.prepare("SELECT token, owner_pid FROM budget_reservations").all() as { token: string; owner_pid: number }[];
  const remove = db.prepare("DELETE FROM budget_reservations WHERE token = ?");
  for (const row of rows) if (!processAlive(row.owner_pid)) remove.run(row.token);
};

const ledgerSnapshot = (configured: StoragePolicy): { used: number; reserved: number } | null => {
  const path = reservationPath();
  if (!path) return null;
  let initial = stateValue(configured);
  if (initial === null) {
    try {
      initial = bytesIn(configured.external_root);
    } catch {
      return null;
    }
  }
  const db = openLedger(path);
  try {
    const transaction = db.transaction(() => {
      ensureLedger(db, configured, initial!);
      cleanLedger(db);
      const meta = db.prepare("SELECT base_used, committed_bytes FROM budget_meta WHERE id = 1").get() as {
        base_used: number;
        committed_bytes: number;
      };
      const reserved = db.prepare("SELECT COALESCE(SUM(bytes), 0) AS bytes FROM budget_reservations").get() as { bytes: number };
      return { used: Math.max(0, meta.base_used + meta.committed_bytes), reserved: Math.max(0, reserved.bytes) };
    });
    return transaction();
  } finally {
    db.close();
  }
};

const reserveLedger = (configured: StoragePolicy, bytes: number): string => {
  const path = reservationPath();
  if (!path) throw new JournalStorageBudgetError();
  const initial = stateValue(configured) ?? bytesIn(configured.external_root);
  const db = openLedger(path);
  const token = randomUUID();
  try {
    const transaction = db.transaction(() => {
      ensureLedger(db, configured, initial);
      cleanLedger(db);
      const meta = db.prepare("SELECT base_used, committed_bytes FROM budget_meta WHERE id = 1").get() as {
        base_used: number;
        committed_bytes: number;
      };
      const reserved = db.prepare("SELECT COALESCE(SUM(bytes), 0) AS bytes FROM budget_reservations").get() as { bytes: number };
      if (meta.base_used + meta.committed_bytes + reserved.bytes + bytes > configured.limit_bytes)
        throw new JournalStorageBudgetError();
      db.prepare("INSERT INTO budget_reservations VALUES(?, ?, ?, ?)").run(token, process.pid, bytes, Date.now());
    });
    transaction();
    return token;
  } finally {
    db.close();
  }
};

const finishLedger = (configured: StoragePolicy, token: string, delta: number): void => {
  const path = reservationPath();
  if (!path) return;
  const db = openLedger(path);
  try {
    const transaction = db.transaction(() => {
      if (db.prepare("SELECT 1 FROM budget_reservations WHERE token = ?").get(token)) {
        db.prepare("DELETE FROM budget_reservations WHERE token = ?").run(token);
        db.prepare("UPDATE budget_meta SET committed_bytes = MAX(0, committed_bytes + ?) WHERE id = 1").run(delta);
      }
    });
    transaction();
  } finally {
    db.close();
  }
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
  private activeToken: string | null = null;
  private activeDepth = 0;

  constructor(dbPath: string) {
    this.configured = policy();
    this.dbPath = dbPath;
    this.refresh();
  }

  private refresh(): boolean {
    if (process.env.DESK_STORAGE_MODE !== "EXTERNAL") return true;
    if (!this.configured) return false;
    return ledgerSnapshot(this.configured) !== null;
  }

  private tracked(): { used: number; reserved: number } | null {
    return this.configured ? ledgerSnapshot(this.configured) : null;
  }

  private reservationBytes(additional: number): number {
    let dbBytes = 0;
    try {
      dbBytes = statSync(this.dbPath).size;
    } catch {
      /* New database. */
    }
    return Math.max(JOURNAL_TOTAL_RESERVE_BYTES + dbBytes, 2 * additional + dbBytes + JOURNAL_WAL_LIMIT_BYTES);
  }

  withReservation<T>(operation: () => T): T {
    if (process.env.DESK_STORAGE_MODE !== "EXTERNAL") return operation();
    if (!this.configured) throw new JournalStorageBudgetError();
    if (this.activeToken) {
      this.activeDepth += 1;
      try {
        return operation();
      } finally {
        this.activeDepth -= 1;
      }
    }
    const token = reserveLedger(this.configured, this.reservationBytes(0));
    const before = sidecarBytes(this.dbPath);
    this.activeToken = token;
    this.activeDepth = 1;
    try {
      return operation();
    } finally {
      finishLedger(this.configured, token, sidecarBytes(this.dbPath) - before);
      this.activeToken = null;
      this.activeDepth = 0;
    }
  }

  available(additional = 0): boolean {
    if (additional < 0 || !Number.isSafeInteger(additional)) return false;
    if (process.env.DESK_STORAGE_MODE !== "EXTERNAL") return true;
    if (!this.refresh() || !this.configured) return false;
    if (this.activeToken) return true;
    try {
      const stats = statfsSync(this.configured.volume);
      const free = Number(stats.bavail) * Number(stats.bsize);
      const tracked = this.tracked();
      if (!tracked) return false;
      const required = this.reservationBytes(additional);
      return (
        tracked.used + tracked.reserved + required <= this.configured.limit_bytes &&
        free > Math.max(MIN_FREE_BYTES, required)
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
    const tracked = this.tracked();
    if (!tracked) throw new JournalStorageBudgetError();
    const pageSize = Number(sqlite.pragma("page_size", { simple: true }));
    const currentPages = Number(sqlite.pragma("page_count", { simple: true }));
    const remaining = this.configured.limit_bytes - tracked.used - tracked.reserved - this.reservationBytes(0);
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
