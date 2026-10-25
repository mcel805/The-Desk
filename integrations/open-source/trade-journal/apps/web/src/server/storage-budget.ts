import { lstatSync, readFileSync, readdirSync, statfsSync } from "node:fs";
import { join } from "node:path";

export const JOURNAL_WRITE_RESERVE_BYTES = 64 * 1024 * 1024;
export const JOURNAL_WAL_LIMIT_BYTES = 64 * 1024 * 1024;
const MIN_FREE_BYTES = 512 * 1024 * 1024;

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
    return JSON.parse(readFileSync(path, "utf8")) as StoragePolicy;
  } catch {
    return null;
  }
};

export const journalBudgetAvailable = (additional = 0): boolean => {
  if (additional < 0 || !Number.isSafeInteger(additional)) return false;
  if (process.env.DESK_STORAGE_MODE !== "EXTERNAL") return true;
  const configured = policy();
  if (!configured) return false;
  try {
    const stats = statfsSync(configured.volume);
    const free = Number(stats.bavail) * Number(stats.bsize);
    const used = bytesIn(configured.external_root);
    return used + additional + JOURNAL_WRITE_RESERVE_BYTES <= configured.limit_bytes &&
      free > Math.max(MIN_FREE_BYTES, additional + JOURNAL_WRITE_RESERVE_BYTES);
  } catch {
    return false;
  }
};

export class JournalStorageBudgetError extends Error {
  constructor() {
    super("Journal storage budget reached. Connect SAMSUNG USB or choose temporary local storage.");
    this.name = "JournalStorageBudgetError";
  }
}

export const assertJournalBudget = (additional = 0): void => {
  if (!journalBudgetAvailable(additional)) throw new JournalStorageBudgetError();
};
