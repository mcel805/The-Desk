import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const originalDataDir = process.env.JOURNAL_DATA_DIR;
const originalToken = process.env.COUNT_DESK_JOURNAL_BRIDGE_TOKEN;
const scratch = mkdtempSync(join(tmpdir(), "count-desk-integration-test-"));
process.env.JOURNAL_DATA_DIR = scratch;
process.env.COUNT_DESK_JOURNAL_BRIDGE_TOKEN = "test-token";
const { db, accounts, executions, externalEventReceipts } = await import("../src/db");
const { POST } = await import("../src/app/api/integrations/count-desk/route");

const post = (body: Record<string, unknown>) => POST(new Request("http://localhost/api/integrations/count-desk", {
  method: "POST",
  headers: { authorization: "Bearer test-token", "content-type": "application/json" },
  body: JSON.stringify(body),
}));

beforeEach(() => {
  db.delete(executions).run();
  db.delete(externalEventReceipts).run();
  db.delete(accounts).run();
});

afterAll(() => {
  db.$client.close();
  if (originalDataDir === undefined) delete process.env.JOURNAL_DATA_DIR;
  else process.env.JOURNAL_DATA_DIR = originalDataDir;
  if (originalToken === undefined) delete process.env.COUNT_DESK_JOURNAL_BRIDGE_TOKEN;
  else process.env.COUNT_DESK_JOURNAL_BRIDGE_TOKEN = originalToken;
  rmSync(scratch, { recursive: true, force: true });
});

describe("Count Desk reset deduplication", () => {
  it("rejects a pre-reset execution replay after clearing executions", async () => {
    const account = { id: "paper-account", name: "QA", currency: "USD", initialBalance: 1000 };
    expect((await post({ eventId: "account-1", eventType: "account", account })).status).toBe(200);
    const execution = {
      eventId: "execution-before-reset", eventType: "execution", account,
      execution: { id: "fill-1", symbol: "BTC", side: "buy", quantity: 1, price: 100, fee: 0,
        executedAt: "2026-10-01T00:00:00Z", multiplier: 1 },
    };
    expect((await post(execution)).status).toBe(200);
    expect(db.select().from(executions).all()).toHaveLength(1);
    expect((await post({ eventId: "reset-1", eventType: "reset", account })).status).toBe(200);
    expect(db.select().from(executions).all()).toHaveLength(0);
    const replay = await post(execution);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ accepted: true, duplicate: true });
    expect(db.select().from(executions).all()).toHaveLength(0);
    expect(db.select().from(externalEventReceipts).all()).toHaveLength(3);
  });
});
