import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const previous = {
  dataDir: process.env.JOURNAL_DATA_DIR,
  mode: process.env.DESK_STORAGE_MODE,
  policy: process.env.DESK_STORAGE_POLICY,
};
const scratch = mkdtempSync(join(tmpdir(), "journal-budget-test-"));
const policyPath = join(scratch, "policy.json");
writeFileSync(
  policyPath,
  JSON.stringify({ volume: scratch, external_root: scratch, limit_bytes: 1 }),
);
process.env.JOURNAL_DATA_DIR = scratch;
process.env.DESK_STORAGE_MODE = "EXTERNAL";
process.env.DESK_STORAGE_POLICY = policyPath;

const { db, settings } = await import("../src/db");

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
});
