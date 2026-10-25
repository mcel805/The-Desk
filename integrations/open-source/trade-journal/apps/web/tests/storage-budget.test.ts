import { afterAll, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const previous = {
  dataDir: process.env.JOURNAL_DATA_DIR,
  mode: process.env.DESK_STORAGE_MODE,
  policy: process.env.DESK_STORAGE_POLICY,
};
const scratch = mkdtempSync(join(tmpdir(), "journal-budget-test-"));
const policyPath = join(scratch, "policy.json");
const externalRoot = join(scratch, "external");
mkdirSync(externalRoot);
writeFileSync(
  policyPath,
  JSON.stringify({ volume: scratch, external_root: externalRoot, limit_bytes: 129 * 1024 * 1024 }),
);
process.env.JOURNAL_DATA_DIR = join(scratch, "database");
process.env.DESK_STORAGE_MODE = "LOCAL_TEMPORARY";
process.env.DESK_STORAGE_POLICY = policyPath;

const { db, settings } = await import("../src/db");
writeFileSync(join(externalRoot, "pressure.bin"), Buffer.alloc(2 * 1024 * 1024));
process.env.DESK_STORAGE_MODE = "EXTERNAL";
const { createJournalBudget } = await import("../src/server/storage-budget");
createJournalBudget(join(scratch, "database/journal.db"));

afterAll(() => {
  db.$client.close();
  if (previous.dataDir === undefined) delete process.env.JOURNAL_DATA_DIR;
  else process.env.JOURNAL_DATA_DIR = previous.dataDir;
  if (previous.mode === undefined) delete process.env.DESK_STORAGE_MODE;
  else process.env.DESK_STORAGE_MODE = previous.mode;
  if (previous.policy === undefined) delete process.env.DESK_STORAGE_POLICY;
  else process.env.DESK_STORAGE_POLICY = previous.policy;
  rmSync(scratch, { recursive: true, force: true });
});

describe("managed Journal storage budget", () => {
  it("rejects database writes after the shared budget is reached", () => {
    expect(() => db.insert(settings).values({ key: "blocked", value: "1" }).run()).toThrow(
      "Journal storage budget reached",
    );
  });

  it("guards updates and deletes at the same SQLite boundary", () => {
    process.env.DESK_STORAGE_MODE = "LOCAL_TEMPORARY";
    db.insert(settings).values({ key: "existing", value: "1" }).run();
    process.env.DESK_STORAGE_MODE = "EXTERNAL";
    expect(() => db.update(settings).set({ value: "2" }).run()).toThrow(
      "Journal storage budget reached",
    );
    expect(() => db.delete(settings).run()).toThrow("Journal storage budget reached");
  });
});
