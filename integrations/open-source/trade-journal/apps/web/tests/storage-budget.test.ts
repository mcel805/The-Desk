import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { eq } from "drizzle-orm";

const previous = {
  dataDir: process.env.JOURNAL_DATA_DIR,
  mode: process.env.DESK_STORAGE_MODE,
  policy: process.env.DESK_STORAGE_POLICY,
  state: process.env.DESK_STORAGE_STATE,
};
const scratch = mkdtempSync(join(tmpdir(), "journal-budget-test-"));
const policyPath = join(scratch, "policy.json");
const statePath = join(scratch, "state.json");
const externalRoot = join(scratch, "external");
mkdirSync(externalRoot);
writeFileSync(
  policyPath,
  JSON.stringify({ volume: scratch, external_root: externalRoot, limit_bytes: 129 * 1024 * 1024 }),
);
process.env.JOURNAL_DATA_DIR = join(scratch, "database");
process.env.DESK_STORAGE_MODE = "LOCAL_TEMPORARY";
process.env.DESK_STORAGE_POLICY = policyPath;
process.env.DESK_STORAGE_STATE = statePath;

const { db, settings } = await import("../src/db");
writeFileSync(join(externalRoot, "pressure.bin"), Buffer.alloc(2 * 1024 * 1024));
process.env.DESK_STORAGE_MODE = "EXTERNAL";
writeFileSync(
  statePath,
  JSON.stringify({
    external_root: externalRoot,
    limit_bytes: 129 * 1024 * 1024,
    used_bytes: 2 * 1024 * 1024,
  }),
);
const { createJournalBudget, JournalBudget } = await import("../src/server/storage-budget");
createJournalBudget(join(scratch, "database/journal.db"));

afterAll(() => {
  db.$client.close();
  if (previous.dataDir === undefined) delete process.env.JOURNAL_DATA_DIR;
  else process.env.JOURNAL_DATA_DIR = previous.dataDir;
  if (previous.mode === undefined) delete process.env.DESK_STORAGE_MODE;
  else process.env.DESK_STORAGE_MODE = previous.mode;
  if (previous.policy === undefined) delete process.env.DESK_STORAGE_POLICY;
  else process.env.DESK_STORAGE_POLICY = previous.policy;
  if (previous.state === undefined) delete process.env.DESK_STORAGE_STATE;
  else process.env.DESK_STORAGE_STATE = previous.state;
  rmSync(scratch, { recursive: true, force: true });
});

describe("managed Journal storage budget", () => {
  it("rejects database writes after the shared budget is reached", () => {
    expect(() => db.insert(settings).values({ key: "blocked", value: "1" }).run()).toThrow(
      "Journal storage budget reached",
    );
  });

  it("guards updates while allowing deletes to reclaim space", () => {
    process.env.DESK_STORAGE_MODE = "LOCAL_TEMPORARY";
    db.insert(settings).values({ key: "existing", value: "1" }).run();
    db.insert(settings).values({ key: "direct", value: "1" }).run();
    db.insert(settings).values({ key: "exec", value: "1" }).run();
    process.env.DESK_STORAGE_MODE = "EXTERNAL";
    expect(() => db.update(settings).set({ value: "2" }).run()).toThrow(
      "Journal storage budget reached",
    );
    expect(() => db.delete(settings).where(eq(settings.key, "existing")).run()).not.toThrow();
    expect(() =>
      db.$client.prepare("DELETE FROM settings WHERE key = ?").run("direct"),
    ).not.toThrow();
    expect(() => db.$client.exec("DELETE FROM settings WHERE key = 'exec'")).not.toThrow();
    expect(db.select().from(settings).where(eq(settings.key, "existing")).get()).toBeUndefined();
    expect(db.select().from(settings).where(eq(settings.key, "direct")).get()).toBeUndefined();
    expect(db.select().from(settings).where(eq(settings.key, "exec")).get()).toBeUndefined();
  });

  it("uses updated supervisor usage without walking the external root", () => {
    process.env.DESK_STORAGE_MODE = "LOCAL_TEMPORARY";
    db.insert(settings).values({ key: "state-backed", value: "1" }).run();
    process.env.DESK_STORAGE_MODE = "EXTERNAL";
    writeFileSync(
      statePath,
      JSON.stringify({
        external_root: externalRoot,
        limit_bytes: 129 * 1024 * 1024,
        used_bytes: 128 * 1024 * 1024,
      }),
    );
    expect(() => db.update(settings).set({ value: "2" }).run()).toThrow(
      "Journal storage budget reached",
    );
  });

  it("counts a concurrent writer reservation against stale supervisor usage", () => {
    process.env.DESK_STORAGE_MODE = "EXTERNAL";
    writeFileSync(
      policyPath,
      JSON.stringify({
        volume: scratch,
        external_root: externalRoot,
        limit_bytes: 256 * 1024 * 1024,
      }),
    );
    writeFileSync(
      statePath,
      JSON.stringify({
        external_root: externalRoot,
        limit_bytes: 256 * 1024 * 1024,
        used_bytes: 0,
      }),
    );
    const writer = new JournalBudget(join(scratch, "database/journal.db"));
    const contender = new JournalBudget(join(scratch, "database/journal.db"));
    writer.withReservation(() => {
      expect(contender.available()).toBe(false);
    });
    expect(contender.available()).toBe(true);
  });

  it("keeps the active reservation available for the SQLite page limit", () => {
    const pageLimitRoot = join(scratch, "page-limit-root");
    mkdirSync(pageLimitRoot);
    writeFileSync(
      policyPath,
      JSON.stringify({
        volume: scratch,
        external_root: pageLimitRoot,
        limit_bytes: 256 * 1024 * 1024,
      }),
    );
    writeFileSync(
      statePath,
      JSON.stringify({
        external_root: pageLimitRoot,
        limit_bytes: 256 * 1024 * 1024,
        used_bytes: 0,
      }),
    );
    const budget = new JournalBudget(join(scratch, "database/journal.db"));
    const pragmas: string[] = [];
    budget.withReservation(() => {
      budget.configureSqlite({
        pragma(statement) {
          if (statement === "page_size") return 4096;
          if (statement === "page_count") return 1;
          pragmas.push(statement);
          return undefined;
        },
      });
    });
    expect(pragmas).toEqual(["max_page_count = 32768"]);
  });
});
