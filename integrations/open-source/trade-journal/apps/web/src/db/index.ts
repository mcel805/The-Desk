import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import * as schema from "./schema";
import { BOOTSTRAP_SQL } from "./bootstrap";
import {
  createJournalBudget,
  JOURNAL_WAL_LIMIT_BYTES,
  JournalStorageBudgetError,
  journalBudgetAvailable,
} from "../server/storage-budget";

export const dataDir = (): string => process.env.JOURNAL_DATA_DIR ?? join(process.cwd(), "data");

const globalForDb = globalThis as unknown as { __journalDb?: ReturnType<typeof createDb> };

const createDb = () => {
  const dir = dataDir();
  mkdirSync(dir, { recursive: true });
  const dbPath = join(dir, "journal.db");
  const sqlite = new Database(dbPath);
  const budget = createJournalBudget(dbPath);
  sqlite.function("journal_storage_budget_available", () => (journalBudgetAvailable() ? 1 : 0));
  const budgeted = <T>(operation: () => T): T => {
    return budget.withReservation(() => {
      budget.configureSqlite(sqlite);
      try {
        return operation();
      } catch (error) {
        if (!budget.available()) throw new JournalStorageBudgetError();
        throw error;
      }
    });
  };
  budgeted(() =>
    sqlite.pragma(
      process.env.DESK_STORAGE_MODE === "EXTERNAL"
        ? "journal_mode = TRUNCATE"
        : "journal_mode = WAL",
    ),
  );
  budgeted(() => sqlite.pragma("wal_autocheckpoint = 1000"));
  budgeted(() => sqlite.pragma(`journal_size_limit = ${JOURNAL_WAL_LIMIT_BYTES}`));
  sqlite.pragma("foreign_keys = ON");
  budgeted(() => sqlite.exec(BOOTSTRAP_SQL));
  budgeted(() =>
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
        sqlite.exec(
          "CREATE UNIQUE INDEX IF NOT EXISTS accounts_external_account ON accounts (external_account_id)",
        );
      })
      .immediate(),
  );
  // Additive upgrade: existing executions retain their fields and dedup hashes.
  const executionColumns = sqlite.pragma("table_info(executions)") as { name: string }[];
  if (!executionColumns.some((column) => column.name === "import_metadata_json")) {
    budgeted(() => sqlite.exec("ALTER TABLE executions ADD COLUMN import_metadata_json TEXT"));
  }
  if (!executionColumns.some((column) => column.name === "external_event_id"))
    budgeted(() => sqlite.exec("ALTER TABLE executions ADD COLUMN external_event_id TEXT"));
  budgeted(() =>
    sqlite.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS executions_external_event ON executions (external_event_id)",
    ),
  );
  // Materialize CSV bounds once so connection and range lookups never scan candle JSON.
  const csvColumns = sqlite.pragma("table_info(market_csv_datasets)") as { name: string }[];
  budgeted(() =>
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
    })(),
  );
  const tables = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all() as { name: string }[];
  budgeted(() => {
    for (const { name } of tables) {
      const table = name.replaceAll('"', '""');
      const trigger = name.replace(/[^a-zA-Z0-9_]/g, "_");
      sqlite.exec(`DROP TRIGGER IF EXISTS "journal_budget_${trigger}_delete";
      CREATE TRIGGER IF NOT EXISTS "journal_budget_${trigger}_insert"
      BEFORE INSERT ON "${table}"
      BEGIN SELECT CASE WHEN journal_storage_budget_available() = 0
        THEN RAISE(ABORT, 'Journal storage budget reached') END; END`);
      sqlite.exec(`CREATE TRIGGER IF NOT EXISTS "journal_budget_${trigger}_update"
      BEFORE UPDATE ON "${table}"
      BEGIN SELECT CASE WHEN journal_storage_budget_available() = 0
        THEN RAISE(ABORT, 'Journal storage budget reached') END; END`);
    }
  });
  // Drizzle writes (including RETURNING) and direct SQL share one preflight.
  // Row triggers also guard transactions already in progress when capacity changes.
  const prepare = sqlite.prepare.bind(sqlite);
  sqlite.prepare = ((...args: Parameters<typeof prepare>) => {
    const statement = prepare(...args);
    const cleanup = /^\s*DELETE\b/i.test(args[0]);
    if (statement.readonly) return statement;
    return new Proxy(statement, {
      get(target, property) {
        const value = Reflect.get(target, property, target);
        if (typeof value !== "function") return value;
        if (["run", "get", "all", "iterate"].includes(String(property)))
          return (...parameters: unknown[]) =>
            cleanup
              ? value.apply(target, parameters)
              : budgeted(() => value.apply(target, parameters));
        return value.bind(target);
      },
    });
  }) as typeof sqlite.prepare;
  const exec = sqlite.exec.bind(sqlite);
  sqlite.exec = ((sql: string) =>
    /^\s*DELETE\b/i.test(sql) ? exec(sql) : budgeted(() => exec(sql))) as typeof sqlite.exec;
  return drizzle(sqlite, { schema });
};

/** Singleton across Next dev hot reloads. */
export const db = globalForDb.__journalDb ?? (globalForDb.__journalDb = createDb());

export * from "./schema";
