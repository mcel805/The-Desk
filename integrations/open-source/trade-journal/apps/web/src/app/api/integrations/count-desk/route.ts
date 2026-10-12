import { and, eq } from "drizzle-orm";
import { accounts, db, executions, externalEventReceipts, externalEventWatermarks, notes } from "@/db";
import { bad, handler, ok, requireValue } from "@/server/api";
import { executionHash, newId, nowIso } from "@/server/ids";
import { rebuildAccount } from "@/server/rebuild";
import { getMultipliers, setSetting } from "@/server/settings";

type EventBody = {
  eventId?: string;
  eventType?: "account" | "execution" | "session" | "reset";
  session?: { id?: string; title?: string; content?: string; startedAt?: string };
  account?: { id?: string; name?: string; currency?: string; initialBalance?: number; resetGeneration?: number };
  execution?: {
    id?: string; symbol?: string; side?: "buy" | "sell"; quantity?: number;
    price?: number; fee?: number; executedAt?: string; multiplier?: number;
    assetClass?: "futures";
  };
  provenance?: { positionId?: string; source?: string; timeframe?: string;
    entryDatasetId?: string; exitDatasetId?: string; simulation?: boolean };
};

/** Local Count Desk paper events. Each event ID is recorded before success is returned,
 * so the sender can retry after a lost HTTP response without duplicating a fill. */
export const POST = handler(async (request: Request) => {
    const expectedToken = process.env.COUNT_DESK_JOURNAL_BRIDGE_TOKEN?.trim();
    const suppliedToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
    if (!expectedToken) return bad("Count Desk journal bridge is not configured.", 503);
    if (suppliedToken !== expectedToken) return bad("Unauthorized", 401);
    const payload = (await request.json()) as EventBody;
    const externalId = payload.account?.id?.trim() ?? "";
    const eventId = payload.eventId?.trim() ?? "";
    requireValue(externalId.length > 0 && externalId.length <= 200, "A source account ID is required.");
    requireValue(eventId.length > 0 && eventId.length <= 240, "A stable event ID is required.");
    requireValue(["account", "execution", "session", "reset"].includes(payload.eventType ?? ""), "Unsupported event type.");
    const requestedGeneration = payload.account?.resetGeneration;
    requireValue(requestedGeneration == null || (Number.isInteger(requestedGeneration) && requestedGeneration >= 0),
      "Reset generation must be a non-negative integer.");
    if (payload.eventType === "session") {
      requireValue(Boolean(payload.session?.id?.match(/^hunt-[a-f0-9]{32}$/)), "Session identity is invalid.");
      requireValue(typeof payload.session?.content === "string" && payload.session.content.length <= 2000000, "Session content is too large.");
      requireValue(Number.isFinite(Date.parse(payload.session?.startedAt ?? "")), "Session start is invalid.");
    }
    const execution = payload.execution;
    if (payload.eventType === "execution") {
      requireValue(Boolean(execution?.id && execution.symbol && execution.executedAt), "Execution identity, symbol and timestamp are required.");
      requireValue(["buy", "sell"].includes(execution?.side ?? ""), "Execution side must be buy or sell.");
      requireValue(Number.isFinite(execution?.quantity) && (execution?.quantity ?? 0) > 0, "Execution quantity must be positive.");
      requireValue(Number.isFinite(execution?.price) && (execution?.price ?? 0) > 0, "Execution price must be positive.");
      requireValue(Number.isFinite(Date.parse(execution?.executedAt ?? "")), "Execution timestamp is invalid.");
      requireValue(Number.isFinite(execution?.multiplier) && (execution?.multiplier ?? 0) > 0, "Contract point value is required.");
    }
    const priorReceipt = db.select({ eventId: externalEventReceipts.eventId, accountId: externalEventReceipts.accountId }).from(externalEventReceipts)
      .where(and(eq(externalEventReceipts.source, "count_desk"), eq(externalEventReceipts.eventId, eventId))).get();
    if (priorReceipt) {
      // Also repairs the materialized trade projection if the server stopped
      // after recording the receipt but before rebuilding the account.
      if (payload.eventType === "execution" || payload.eventType === "reset") rebuildAccount(priorReceipt.accountId);
      return ok({ accepted: true, duplicate: true });
    }
    if (payload.eventType === "execution") {
      const symbol = execution!.symbol!.trim().toUpperCase();
      const multipliers = getMultipliers();
      const configured = multipliers[symbol];
      requireValue(configured == null || Math.abs(configured - execution!.multiplier!) < 1e-9,
        `Journal multiplier for ${symbol} differs from the simulator; resolve it before importing this fill.`);
      if (configured == null) {
        multipliers[symbol] = execution!.multiplier!;
        setSetting("multipliers", JSON.stringify(multipliers));
      }
    }

    let accountId = "";
    let duplicate = false;
    let stale = false;
    db.transaction((tx) => {
      let account = tx.select().from(accounts).where(eq(accounts.externalAccountId, externalId)).get();
      if (!account) {
        requireValue(payload.account?.name?.trim(), "A paper account name is required.");
        const initialBalance = Number(payload.account?.initialBalance ?? 0);
        requireValue(Number.isFinite(initialBalance) && initialBalance >= 0, "Initial virtual balance is invalid.");
        accountId = newId();
        tx.insert(accounts).values({
          id: accountId, name: payload.account!.name!.trim().slice(0, 120),
          broker: "Count Desk Paper", kind: "manual", sourceType: "paper_user",
          externalAccountId: externalId, currency: payload.account?.currency ?? "USD",
          initialBalance, profitCalcMethod: "fifo", autoSync: false, createdAt: nowIso(),
        }).run();
        account = tx.select().from(accounts).where(eq(accounts.id, accountId)).get();
      }
      requireValue(Boolean(account), "Paper journal account could not be created.");
      accountId = account!.id;
      let watermark = tx.select().from(externalEventWatermarks).where(
        and(eq(externalEventWatermarks.source, "count_desk"), eq(externalEventWatermarks.externalAccountId, externalId)),
      ).get();
      const hadWatermark = Boolean(watermark);
      if (!watermark) {
        tx.insert(externalEventWatermarks).values({
          source: "count_desk", externalAccountId: externalId, accountId, resetGeneration: 0, updatedAt: nowIso(),
        }).run();
        watermark = tx.select().from(externalEventWatermarks).where(
          and(eq(externalEventWatermarks.source, "count_desk"), eq(externalEventWatermarks.externalAccountId, externalId)),
        ).get();
      }
      const exists = tx.select({ eventId: externalEventReceipts.eventId }).from(externalEventReceipts)
        .where(and(eq(externalEventReceipts.source, "count_desk"), eq(externalEventReceipts.eventId, eventId))).get();
      if (exists) { duplicate = true; return; }
      let generation = requestedGeneration ?? 0;
      if (payload.eventType === "reset" && requestedGeneration == null && !hadWatermark) generation = 1;
      const currentGeneration = watermark!.resetGeneration;
      if (generation < currentGeneration) {
        tx.insert(externalEventReceipts).values({ source: "count_desk", eventId, accountId, createdAt: nowIso() }).run();
        stale = true;
        return;
      }
      requireValue(
        generation === currentGeneration || (payload.eventType === "reset" && generation === currentGeneration + 1),
        "The journal reset marker must be delivered before this event.",
      );
      requireValue(payload.eventType !== "reset" || generation > currentGeneration,
        "A journal reset must advance its reset generation.");
      if (payload.eventType === "account" || payload.eventType === "reset") {
        const initialBalance = Number(payload.account?.initialBalance ?? 0);
        requireValue(Number.isFinite(initialBalance) && initialBalance >= 0, "Initial virtual balance is invalid.");
        tx.update(accounts).set({
          name: payload.account?.name?.trim().slice(0, 120) || account!.name,
          currency: payload.account?.currency ?? account!.currency,
          initialBalance,
        }).where(eq(accounts.id, accountId)).run();
      }
      if (payload.eventType === "reset") {
        tx.delete(executions).where(eq(executions.accountId, accountId)).run();
      }
      if (payload.eventType === "execution") {
        const row = execution!;
        const symbol = row.symbol!.trim().toUpperCase();
        const metadata = { id: row.id!, group: `count-desk:${externalId}`,
          source: "count_desk_paper", positionId: payload.provenance?.positionId,
          dataSource: payload.provenance?.source, timeframe: payload.provenance?.timeframe,
          entryDatasetId: payload.provenance?.entryDatasetId,
          exitDatasetId: payload.provenance?.exitDatasetId, simulation: true };
        const contentHash = executionHash({
          symbol, side: row.side!, quantity: row.quantity!, price: row.price!, executedAt: row.executedAt!, importMetadata: metadata,
        });
        tx.insert(executions).values({
          id: newId(), accountId, symbol, side: row.side!, quantity: row.quantity!, price: row.price!,
          fee: row.fee ?? 0, executedAt: row.executedAt!, assetClass: row.assetClass ?? "futures",
          source: "manual", importMetadataJson: JSON.stringify(metadata), externalEventId: eventId,
          contentHash, createdAt: nowIso(),
        }).run();
      }
      if (payload.eventType === "session") {
        const session = payload.session!;
        const id = `count-desk-session:${session.id!}`;
        const values = { title: (session.title ?? "Wave Court hunt").slice(0, 120),
          content: session.content!, tagsJson: JSON.stringify(["Wave Court", "paper", "hunt-session", externalId]), updatedAt: nowIso() };
        const existing = tx.select({id: notes.id}).from(notes).where(eq(notes.id, id)).get();
        if (existing) tx.update(notes).set(values).where(eq(notes.id, id)).run();
        else tx.insert(notes).values({id, folderId: "my-notes", ...values,
          dayDate: session.startedAt!.slice(0, 10), createdAt: nowIso()}).run();
      }
      tx.update(externalEventWatermarks).set({
        resetGeneration: generation, updatedAt: nowIso(),
      }).where(and(
        eq(externalEventWatermarks.source, "count_desk"),
        eq(externalEventWatermarks.externalAccountId, externalId),
      )).run();
      tx.insert(externalEventReceipts).values({ source: "count_desk", eventId, accountId, createdAt: nowIso() }).run();
    });
    if (!stale && (payload.eventType === "execution" || payload.eventType === "reset")) rebuildAccount(accountId);
    return ok({ accepted: true, duplicate, stale, accountId });
}, { public: true });
