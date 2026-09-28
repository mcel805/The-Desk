# Trade journal workflow

## Start with records, not screenshots alone

When Mark says “journal this trade,” first query connected, read-only sources for executions, orders, account summary and existing journal entry. TradingView chart access and AMP access are not assumed. The AMP screenshots Mark supplied in prior sessions showed an order view, account summary, notification history and positions; that does not establish that an AMP MCP/API is installed. If unavailable, be clear and use only what Mark supplied. A screenshot may establish visible order state/account fields at a cutoff, but cannot by itself establish authoritative realized P&L.

## Deduplicate

Group entry, bracket, stop, target changes, partial exits and repeated screenshots into a single position/trade lifecycle unless the broker history proves distinct entries. Preserve each revision with event time/source. Keep pending orders separate from fills. Match by instrument/contract, side, quantity, time, order IDs where visible, and price. Do not merge uncertain records.

## Required entry fields

- Identity: trader, account classification (user-reported), exact contract or continuous ticker, side, quantity, date/session/timezone.
- Provenance: each source name, timeframe, capture time/cutoff, file or API record, and whether authoritative, user-reported, inferred or unknown.
- Before: supplied 1m chart before entry; HTF chart/context if available; hypothesis, selected level/timeframe, trigger, planned entry, stop/invalidation, target(s), risk and intended duration.
- Execution: order status, fills/partials, average entry/exit, timestamps, stop/target changes, fees and slippage only from authoritative records. Include before/after 1m charts unchanged when supplied.
- Account context: starting balance and end balance/equity with provenance. Keep buying power, margin, OTE, balance and equity distinct. Reconcile deposits/withdrawals/other activity before computing an account change.
- Review: setup quality, execution/rule adherence and outcome scored separately; MAE/MFE and R only if the required trade path, contract multiplier, costs and units are available; user’s own reflection kept verbatim or clearly paraphrased.
- Status: reconciled, partially reconciled, provisional, or draft. List unresolved conflicts and evidence needed.

The September 28, 2026 MYM day used in the learning record has a reported $500 starting balance and subsequent AMP account-summary screenshot with account balance/NLV $816.43 and PnL $10 at its displayed cutoff. These figures conflict with Mark’s report that the balance was after a loss and likely include other history/activity; do not reconcile the day from this screenshot. Mark’s $500 is user-reported; the screenshot visibly reports account summary fields for the whole account at capture, not trade-attributable equity.

## Artifact and writes

Save an entry at `count-dashboard/output/trading-journal/YYYY-MM-DD-<instrument>-<trade-id>/entry.html` only when a workspace write is authorized. Preserve uploaded screenshots under the entry without alteration when permitted. Add an annotated view as a separate overlay. Link the saved page in the response. If the runtime is read-only or has no journal write tool, return the complete draft and explicitly say it has not been saved; do not claim automation succeeded.

## Sources

- AMP order/execution/account records are the preferred evidence when accessible through an authorized connector. No connector is assumed.
- Current project boundary: `AGENTS.md` requires provenance, no invented execution details, and paper/shadow behavior only.
