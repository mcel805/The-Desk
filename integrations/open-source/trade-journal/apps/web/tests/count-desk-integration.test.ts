import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const originalDataDir = process.env.JOURNAL_DATA_DIR;
const originalToken = process.env.COUNT_DESK_JOURNAL_BRIDGE_TOKEN;
const scratch = mkdtempSync(join(tmpdir(), "count-desk-integration-test-"));
process.env.JOURNAL_DATA_DIR = scratch;
process.env.COUNT_DESK_JOURNAL_BRIDGE_TOKEN = "test-token";
const { db, accounts, executions, externalEventReceipts, externalEventWatermarks, trades } =
  await import("../src/db");
const { POST } = await import("../src/app/api/integrations/count-desk/route");

const post = (body: Record<string, unknown>) =>
  POST(
    new Request("http://localhost/api/integrations/count-desk", {
      method: "POST",
      headers: { authorization: "Bearer test-token", "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  db.delete(executions).run();
  db.delete(trades).run();
  db.delete(externalEventReceipts).run();
  db.delete(externalEventWatermarks).run();
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
  it("anchors a legacy generation without deleting executions or projections", async () => {
    const account = {
      id: "legacy-account",
      name: "Legacy",
      currency: "USD",
      initialBalance: 1000,
      resetGeneration: 0,
    };
    expect(
      (await post({ eventId: "legacy-account-1", eventType: "account", account })).status,
    ).toBe(200);
    const existing = await post({
      eventId: "legacy-fill",
      eventType: "execution",
      account,
      execution: {
        id: "legacy-fill",
        symbol: "LEGACY",
        side: "buy",
        quantity: 1,
        price: 100,
        fee: 0,
        executedAt: "2026-10-01T00:00:00Z",
        multiplier: 1,
      },
    });
    expect(existing.status).toBe(200);
    const before = db.select().from(executions).all().length;
    const tradesBefore = db.select().from(trades).all().length;
    db.delete(externalEventWatermarks).run();
    const anchor = await post({
      eventId: "legacy-watermark-1",
      eventType: "watermark",
      account: { ...account, resetGeneration: 1 },
    });
    expect(await anchor.json()).toMatchObject({ accepted: true });
    expect(db.select().from(executions).all()).toHaveLength(before);
    expect(db.select().from(trades).all()).toHaveLength(tradesBefore);

    const next = await post({
      eventId: "legacy-fill-after-upgrade",
      eventType: "execution",
      account: { ...account, resetGeneration: 1 },
      execution: {
        id: "legacy-fill-after-upgrade",
        symbol: "LEGACY",
        side: "sell",
        quantity: 1,
        price: 110,
        fee: 0,
        executedAt: "2026-10-01T00:01:00Z",
        multiplier: 1,
      },
    });
    expect(next.status).toBe(200);
    const delayed = await post({
      eventId: "legacy-delayed-fill",
      eventType: "execution",
      account,
      execution: {
        id: "legacy-delayed-fill",
        symbol: "DELAYED",
        side: "buy",
        quantity: 1,
        price: 90,
        fee: 0,
        executedAt: "2026-10-01T00:00:30Z",
        multiplier: 7,
      },
    });
    expect(await delayed.json()).toMatchObject({ accepted: true, stale: true });
    expect(db.select().from(executions).all()).toHaveLength(before + 1);
  });

  it("does not register a multiplier until a new generation marker is accepted", async () => {
    const account = {
      id: "ahead-account",
      name: "Ahead",
      currency: "USD",
      initialBalance: 1000,
      resetGeneration: 0,
    };
    expect((await post({ eventId: "ahead-account-1", eventType: "account", account })).status).toBe(
      200,
    );
    const ahead = await post({
      eventId: "ahead-fill",
      eventType: "execution",
      account: { ...account, resetGeneration: 1 },
      execution: {
        id: "ahead-fill",
        symbol: "AHEAD",
        side: "buy",
        quantity: 1,
        price: 100,
        fee: 0,
        executedAt: "2026-10-01T00:00:00Z",
        multiplier: 7,
      },
    });
    expect(ahead.status).toBe(400);
    const anchor = await post({
      eventId: "ahead-watermark-1",
      eventType: "watermark",
      account: { ...account, resetGeneration: 1 },
    });
    expect(anchor.status).toBe(200);
    const accepted = await post({
      eventId: "ahead-fill-after-marker",
      eventType: "execution",
      account: { ...account, resetGeneration: 1 },
      execution: {
        id: "ahead-fill-after-marker",
        symbol: "AHEAD",
        side: "buy",
        quantity: 1,
        price: 100,
        fee: 0,
        executedAt: "2026-10-01T00:00:00Z",
        multiplier: 1,
      },
    });
    expect(accepted.status).toBe(200);
  });

  it("rebuilds away stale trades when a committed reset is retried", async () => {
    const account = {
      id: "paper-account",
      name: "QA",
      currency: "USD",
      initialBalance: 1000,
      resetGeneration: 0,
    };
    expect((await post({ eventId: "account-1", eventType: "account", account })).status).toBe(200);
    expect(
      (
        await post({
          eventId: "reset-1",
          eventType: "reset",
          account: { ...account, resetGeneration: 1 },
        })
      ).status,
    ).toBe(200);
    const journalAccount = db.select().from(accounts).get();
    expect(journalAccount).toBeTruthy();
    db.insert(trades)
      .values({
        key: "stale-trade",
        accountId: journalAccount!.id,
        symbol: "BTC",
        assetClass: "crypto",
        direction: "long",
        status: "win",
        openedAt: "2026-10-01T00:00:00Z",
        closedAt: "2026-10-01T00:01:00Z",
        quantity: 1,
        openQuantity: 0,
        avgEntry: 100,
        avgExit: 110,
        grossPnl: 10,
        fees: 0,
        netPnl: 10,
        executionCount: 2,
        executionIdsJson: "[]",
        exitsJson: "[]",
        durationMs: 60000,
      })
      .run();
    expect(db.select().from(trades).all()).toHaveLength(1);

    const retry = await post({
      eventId: "reset-1",
      eventType: "reset",
      account: { ...account, resetGeneration: 1 },
    });
    expect(await retry.json()).toMatchObject({ accepted: true, duplicate: true });
    expect(db.select().from(trades).all()).toHaveLength(0);
  });

  it("drops an unseen pre-reset execution but accepts the next generation", async () => {
    const account = {
      id: "paper-account",
      name: "QA",
      currency: "USD",
      initialBalance: 1000,
      resetGeneration: 0,
    };
    expect((await post({ eventId: "account-1", eventType: "account", account })).status).toBe(200);
    expect(
      (
        await post({
          eventId: "reset-1",
          eventType: "reset",
          account: { ...account, resetGeneration: 1 },
        })
      ).status,
    ).toBe(200);

    const oldExecution = {
      eventId: "execution-before-reset",
      eventType: "execution",
      account,
      execution: {
        id: "fill-old",
        symbol: "STALE",
        side: "buy",
        quantity: 1,
        price: 100,
        fee: 0,
        executedAt: "2026-10-01T00:00:00Z",
        multiplier: 7,
      },
    };
    const stale = await post(oldExecution);
    expect(stale.status).toBe(200);
    expect(await stale.json()).toMatchObject({ accepted: true, stale: true });
    expect(db.select().from(executions).all()).toHaveLength(0);
    const retry = await post(oldExecution);
    expect(await retry.json()).toMatchObject({ accepted: true, duplicate: true });
    expect(db.select().from(executions).all()).toHaveLength(0);

    const next = await post({
      ...oldExecution,
      eventId: "execution-after-reset",
      account: { ...account, resetGeneration: 1 },
      execution: { ...oldExecution.execution, id: "fill-new", multiplier: 1 },
    });
    expect(next.status).toBe(200);
    expect(await next.json()).toMatchObject({ accepted: true, stale: false });
    expect(db.select().from(executions).all()).toHaveLength(1);
  });

  it("rejects a pre-reset execution replay after clearing executions", async () => {
    const account = { id: "paper-account", name: "QA", currency: "USD", initialBalance: 1000 };
    expect((await post({ eventId: "account-1", eventType: "account", account })).status).toBe(200);
    const execution = {
      eventId: "execution-before-reset",
      eventType: "execution",
      account,
      execution: {
        id: "fill-1",
        symbol: "BTC",
        side: "buy",
        quantity: 1,
        price: 100,
        fee: 0,
        executedAt: "2026-10-01T00:00:00Z",
        multiplier: 1,
      },
    };
    expect((await post(execution)).status).toBe(200);
    expect(db.select().from(executions).all()).toHaveLength(1);
    expect(
      (
        await post({
          eventId: "reset-1",
          eventType: "reset",
          account: { ...account, resetGeneration: 1 },
        })
      ).status,
    ).toBe(200);
    expect(db.select().from(executions).all()).toHaveLength(0);
    const replay = await post(execution);
    expect(replay.status).toBe(200);
    expect(await replay.json()).toMatchObject({ accepted: true, duplicate: true });
    expect(db.select().from(executions).all()).toHaveLength(0);
    expect(db.select().from(externalEventReceipts).all()).toHaveLength(3);
  });

  it("keeps reset generations isolated between paper accounts", async () => {
    const first = {
      id: "paper-first",
      name: "First",
      currency: "USD",
      initialBalance: 1000,
      resetGeneration: 0,
    };
    const second = {
      id: "paper-second",
      name: "Second",
      currency: "USD",
      initialBalance: 1000,
      resetGeneration: 0,
    };
    expect(
      (await post({ eventId: "first-account", eventType: "account", account: first })).status,
    ).toBe(200);
    expect(
      (await post({ eventId: "second-account", eventType: "account", account: second })).status,
    ).toBe(200);
    expect(
      (
        await post({
          eventId: "first-reset",
          eventType: "reset",
          account: { ...first, resetGeneration: 1 },
        })
      ).status,
    ).toBe(200);
    const secondExecution = await post({
      eventId: "second-fill",
      eventType: "execution",
      account: second,
      execution: {
        id: "second-fill",
        symbol: "ETH",
        side: "buy",
        quantity: 1,
        price: 10,
        fee: 0,
        executedAt: "2026-10-01T00:00:00Z",
        multiplier: 1,
      },
    });
    expect(secondExecution.status).toBe(200);
    expect(db.select().from(executions).all()).toHaveLength(1);
  });
});
