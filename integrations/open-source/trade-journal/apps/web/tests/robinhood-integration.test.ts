import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const originalDataDir = process.env.JOURNAL_DATA_DIR;
const originalToken = process.env.ROBINHOOD_JOURNAL_BRIDGE_TOKEN;
const scratch = mkdtempSync(join(tmpdir(), "robinhood-integration-test-"));
process.env.JOURNAL_DATA_DIR = scratch;
process.env.ROBINHOOD_JOURNAL_BRIDGE_TOKEN = "test-token";
const { db, accounts, executions, externalEventReceipts, trades } = await import("../src/db");
const { POST } = await import("../src/app/api/integrations/robinhood/route");

const post = (body: Record<string, unknown>) =>
  POST(new Request("http://localhost/api/integrations/robinhood", {
    method: "POST",
    headers: { authorization: "Bearer test-token", "content-type": "application/json" },
    body: JSON.stringify(body),
  }));

beforeEach(() => {
  db.delete(executions).run();
  db.delete(trades).run();
  db.delete(externalEventReceipts).run();
  db.delete(accounts).run();
});

afterAll(() => {
  db.$client.close();
  if (originalDataDir === undefined) delete process.env.JOURNAL_DATA_DIR;
  else process.env.JOURNAL_DATA_DIR = originalDataDir;
  if (originalToken === undefined) delete process.env.ROBINHOOD_JOURNAL_BRIDGE_TOKEN;
  else process.env.ROBINHOOD_JOURNAL_BRIDGE_TOKEN = originalToken;
  rmSync(scratch, { recursive: true, force: true });
});

describe("Robinhood MCP journal bridge", () => {
  const account = { id: "rh-0123456789abcdef0123456789abcdef", name: "Robinhood ••••1834", currency: "USD" };

  it("creates a distinct broker account and imports completed fills idempotently", async () => {
    const linked = await post({ eventType: "account", eventId: "rh-account-0123456789abcdef0123456789abcdef", account });
    expect(linked.status).toBe(200);
    const fill = { id: "order-eth-1", brokerOrderId: "order-eth-1", symbol: "ETH-USD", side: "buy", quantity: 0.02, price: 2500, fee: 0.05, executedAt: "2026-10-22T12:00:00Z" };
    const event = { eventType: "execution", eventId: "rh-order-order-eth-1", account, execution: fill };
    expect((await post(event)).status).toBe(200);
    expect(await (await post(event)).json()).toMatchObject({ accepted: true, duplicate: true });
    expect(db.select().from(accounts).all()).toHaveLength(1);
    const journalAccount = db.select().from(accounts).get();
    expect(journalAccount).toMatchObject({ broker: "Robinhood", sourceType: "broker", externalAccountId: account.id });
    expect(db.select().from(executions).all()).toHaveLength(1);
    expect(db.select().from(executions).get()).toMatchObject({ symbol: "ETH-USD", quantity: 0.02, price: 2500, assetClass: "crypto", source: "sync" });
  });

  it("rejects incomplete order states as executions", async () => {
    const response = await post({ eventType: "execution", eventId: "rh-order-pending-1", account, execution: { id: "pending", symbol: "ETH-USD", side: "buy", quantity: 0, price: 0, executedAt: "2026-10-22T12:00:00Z" } });
    expect(response.status).toBe(400);
    expect(db.select().from(executions).all()).toHaveLength(0);
  });
});
