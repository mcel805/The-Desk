import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import * as schema from "./schema";
import { BOOTSTRAP_SQL } from "./bootstrap";
import { JOURNAL_WAL_LIMIT_BYTES, journalBudgetAvailable } from "../server/storage-budget";

export const dataDir = (): string => process.env.JOURNAL_DATA_DIR ?? join(process.cwd(), "data");

const globalForDb = globalThis as unknown as { __journalDb?: ReturnType<typeof createDb> };

const createDb = () => {
  const dir = dataDir();
  mkdirSync(dir, { recursive: true });
  const sqlite = new Database(join(dir, "journal.db"));
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("wal_autocheckpoint = 1000");
  sqlite.pragma(`journal_size_limit = ${JOURNAL_WAL_LIMIT_BYTES}`);
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(BOOTSTRAP_SQL);
  sqlite
    .transaction(() => {
      const columns = sqlite.pragma("table_info(accounts)") as { name: string }[];
      if (!columns.some((column) => column.name === "ibkr_sync_time_zone")) {
        sqlite.exec("ALTER TABLE accounts ADD COLUMN ibkr_sync_time_zone TEXT");
      }
      if (!columns.some((column) => column.name === "source_type"))
        sqlite.exec("ALTER TABLE accounts ADD COLUMN source_type TEXT NOT NULL DEFAULT 'broker'");
      if (!columns.some((column) => column.name === "external_account_id"))
        sqlite.exec("ALTER TABLE accounts ADD COLUMN external_account_id TEXT");
      sqlite.exec("CREATE UNIQUE INDEX IF NOT EXISTS accounts_external_account ON accounts (external_account_id)");
    })
    .immediate();
  // Additive upgrade: existing executions retain their fields and dedup hashes.
  const executionColumns = sqlite.pragma("table_info(executions)") as { name: string }[];
  if (!executionColumns.some((column) => column.name === "import_metadata_json")) {
    sqlite.exec("ALTER TABLE executions ADD COLUMN import_metadata_json TEXT");
  }
  if (!executionColumns.some((column) => column.name === "external_event_id"))
    sqlite.exec("ALTER TABLE executions ADD COLUMN external_event_id TEXT");
  sqlite.exec("CREATE UNIQUE INDEX IF NOT EXISTS executions_external_event ON executions (external_event_id)");
  // Materialize CSV bounds once so connection and range lookups never scan candle JSON.
  const csvColumns = sqlite.pragma("table_info(market_csv_datasets)") as { name: string }[];
  sqlite.transaction(() => {
    for (const name of ["bar_count", "first_time", "last_time"]) {
      if (!csvColumns.some((column) => column.name === name))
        sqlite.exec(
          `ALTER TABLE market_csv_datasets ADD COLUMN ${name} INTEGER NOT NULL DEFAULT 0`,
        );
    }
    sqlite.exec(`UPDATE market_csv_datasets SET
      bar_count = json_array_length(bars_json),
      first_time = json_extract(bars_json, '$[0].time'),
      last_time = json_extract(bars_json, '$[#-1].time') WHERE bar_count = 0`);
  })();
  sqlite.function("journal_storage_budget_available", () => (journalBudgetAvailable() ? 1 : 0));
  const tables = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all() as { name: string }[];
  for (const { name } of tables) {
    const table = name.replaceAll('"', '""');
    const trigger = name.replace(/[^a-zA-Z0-9_]/g, "_");
    sqlite.exec(`CREATE TRIGGER IF NOT EXISTS "journal_budget_${trigger}_insert"
      BEFORE INSERT ON "${table}"
      BEGIN SELECT CASE WHEN journal_storage_budget_available() = 0
        THEN RAISE(ABORT, 'Journal storage budget reached') END; END`);
    sqlite.exec(`CREATE TRIGGER IF NOT EXISTS "journal_budget_${trigger}_update"
      BEFORE UPDATE ON "${table}"
      BEGIN SELECT CASE WHEN journal_storage_budget_available() = 0
        THEN RAISE(ABORT, 'Journal storage budget reached') END; END`);
  }
  return drizzle(sqlite, { schema });
};

/** Singleton across Next dev hot reloads. */
export const db = globalForDb.__journalDb ?? (globalForDb.__journalDb = createDb());

export * from "./schema";
