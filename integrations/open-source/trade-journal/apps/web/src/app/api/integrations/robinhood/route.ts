import { and, eq } from "drizzle-orm";
import { accounts, db, executions, externalEventReceipts } from "@/db";
import { bad, handler, ok, requireValue } from "@/server/api";
import { executionHash, newId, nowIso } from "@/server/ids";
import { rebuildAccount } from "@/server/rebuild";

type FillEvent = {
  eventType?: "account" | "execution";
  eventId?: string;
  account?: { id?: string; name?: string; currency?: string };
  execution?: {
    id?: string;
    brokerOrderId?: string;
    symbol?: string;
    side?: "buy" | "sell";
    quantity?: number;
    price?: number;
    fee?: number;
    executedAt?: string;
  };
};

/** Imports only completed Robinhood crypto fills; pending order states stay in The Desk. */
export const POST = handler(async (request: Request) => {
  const expected = (process.env.ROBINHOOD_JOURNAL_BRIDGE_TOKEN ?? process.env.COUNT_DESK_JOURNAL_BRIDGE_TOKEN)?.trim();
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!expected) return bad("Robinhood journal bridge is not configured.", 503);
  if (supplied !== expected) return bad("Unauthorized", 401);
  const payload = (await request.json()) as FillEvent;
  const externalId = payload.account?.id?.trim() ?? "";
  const eventId = payload.eventId?.trim() ?? "";
  const fill = payload.execution;
  const eventType = payload.eventType ?? "execution";
  requireValue(/^rh-[a-f0-9]{32}$/.test(externalId), "A hashed Robinhood account identity is required.");
  requireValue(eventType === "account" || eventType === "execution", "Unsupported Robinhood journal event.");
  requireValue(eventType === "account" ? /^rh-account-[a-f0-9]{32}$/.test(eventId) : /^rh-order-[A-Za-z0-9-]{1,180}$/.test(eventId), "A stable Robinhood event ID is required.");
  if (eventType === "execution") {
    requireValue(Boolean(fill?.id && fill.symbol && fill.executedAt), "Fill identity, symbol and timestamp are required.");
    requireValue(["buy", "sell"].includes(fill?.side ?? ""), "Fill side must be buy or sell.");
    requireValue(Number.isFinite(fill?.quantity) && (fill?.quantity ?? 0) > 0, "Filled quantity must be positive.");
    requireValue(Number.isFinite(fill?.price) && (fill?.price ?? 0) > 0, "Average fill price must be positive.");
    requireValue(Number.isFinite(Date.parse(fill?.executedAt ?? "")), "Fill timestamp is invalid.");
    requireValue(Number.isFinite(fill?.fee ?? 0) && (fill?.fee ?? 0) >= 0, "Fee must be non-negative.");
  }
  const prior = db.select({ accountId: externalEventReceipts.accountId })
    .from(externalEventReceipts)
    .where(and(eq(externalEventReceipts.source, "robinhood_mcp"), eq(externalEventReceipts.eventId, eventId)))
    .get();
  if (prior) {
    if (eventType === "execution") rebuildAccount(prior.accountId);
    return ok({ accepted: true, duplicate: true, accountId: prior.accountId });
  }
  let accountId = "";
  db.transaction((tx) => {
    let account = tx.select().from(accounts).where(eq(accounts.externalAccountId, externalId)).get();
    if (!account) {
      accountId = newId();
      tx.insert(accounts).values({
        id: accountId,
        name: (payload.account?.name?.trim() || "Robinhood").slice(0, 120),
        broker: "Robinhood",
        kind: "manual",
        sourceType: "broker",
        externalAccountId: externalId,
        currency: payload.account?.currency || "USD",
        initialBalance: 0,
        profitCalcMethod: "fifo",
        autoSync: false,
        createdAt: nowIso(),
      }).run();
      account = tx.select().from(accounts).where(eq(accounts.id, accountId)).get();
    }
    requireValue(Boolean(account), "Robinhood journal account could not be created.");
    accountId = account!.id;
    const duplicate = tx.select({ eventId: externalEventReceipts.eventId }).from(externalEventReceipts)
      .where(and(eq(externalEventReceipts.source, "robinhood_mcp"), eq(externalEventReceipts.eventId, eventId))).get();
    if (duplicate) return;
    if (eventType === "execution") {
      const symbol = fill!.symbol!.trim().toUpperCase();
      const metadata = { id: fill!.id!, brokerOrderId: fill!.brokerOrderId, source: "robinhood_mcp", simulation: false };
      const contentHash = executionHash({ symbol, side: fill!.side!, quantity: fill!.quantity!, price: fill!.price!, executedAt: fill!.executedAt!, importMetadata: { id: metadata.id, group: `robinhood:${externalId}` } });
      tx.insert(executions).values({
        id: newId(), accountId, symbol, side: fill!.side!, quantity: fill!.quantity!, price: fill!.price!, fee: fill!.fee ?? 0,
        executedAt: fill!.executedAt!, assetClass: "crypto", source: "sync", importMetadataJson: JSON.stringify(metadata),
        externalEventId: eventId, contentHash, createdAt: nowIso(),
      }).run();
    }
    tx.insert(externalEventReceipts).values({ source: "robinhood_mcp", eventId, accountId, createdAt: nowIso() }).run();
  });
  if (eventType === "execution") rebuildAccount(accountId);
  return ok({ accepted: true, duplicate: false, accountId });
}, { public: true });
