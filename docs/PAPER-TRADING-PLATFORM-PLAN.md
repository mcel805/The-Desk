# Internal paper trading platform plan

Checked 2026-09-30 against the local Count Desk, Vela, and pinned LuxAlgo Trade Journal source. This is a paper/shadow feature. A chart bar is a market-data observation, not an exchange fill.

## Current architecture and first build slice

- Vela (`integrations/vela/`) is a chart renderer and workspace. Its source and public package describe charting, providers, drawings, replay, and extension seams; there is no order simulator, account ledger, or journal service in the checked Vela source. The platform must own those services outside Vela.
- Count Desk already had `chart_sim_orders` and `chart_sim_positions` in `count-dashboard/server.py`. They used the next confirmed stored bar for market entries, one stop and target, manual close, and local gross P&L. They had no account identity or automatic LuxAlgo journal delivery.
- The chosen execution journal is the pinned self-hosted LuxAlgo Trade Journal. `GET/POST /api/accounts` and `POST /api/executions` exist, but account kinds are `sync`, `import`, or `manual`; none identifies paper versus real versus agentic activity. An independent working-tree cutover retires Count Desk's execution journal routes with HTTP 410; that cutover is outside this commit. The two SQLite stores are separate.
- This slice adds user-named local simulation accounts with starting virtual USD, account-scoped chart orders and positions, market/limit/stop/stop-limit entries, and a chart right-click shortcut to the paper ticket. Matching still uses confirmed stored bars. Existing accountless simulation rows remain legacy rows with null `account_id`; they are not silently assigned to a new account.
- A durable SQLite outbox now sends newly created simulation accounts and simulated entry/exit fills to the LuxAlgo journal intake using stable event IDs. The journal maps each simulation account to a `paper_user` account, stores source-bar and dataset provenance with fills, deduplicates retries, and rebuilds its fill-derived trade projection. The Count Desk journal icon polls for delivery state and shows a badge for delivered trades awaiting review plus a distinct pending-delivery count.
- A background Count Desk worker retries pending events while the server is running, including after the chart tab closes. The shared `COUNT_DESK_JOURNAL_BRIDGE_TOKEN` belongs in the ignored `count-dashboard/.env` and `integrations/open-source/trade-journal/apps/web/.env.local` files; both local services must use the same value.
- The bridge is paper-only and local-service oriented. Its isolated account/fill delivery and duplicate receipt were exercised against a temporary journal database, but there is no committed end-to-end trade for the user's journal. Broker and agentic accounts are not yet connected through this adapter; do not treat this slice as the unified account registry or as real-time market access.

## Baseline comparison

TradingView's current help describes the following paper baseline. “Built” below means this repository's local first slice, not production parity.

| Capability | TradingView reference | Current local state | Planned acceptance |
| --- | --- | --- | --- |
| Multiple virtual accounts | Account switch, balances, currency and settings | Named USD accounts with opening virtual amount and account-scoped records | Owner identity, currency, funding events, account state and journal ID; no destructive reset of history |
| Entry ticket | Market, limit, stop, stop-limit, quantity, optional risk exits | Four order types for supported micro futures; one price stop and target | Preview/confirm, modify, cancel, expiry, tick validation, presets and risk sizing |
| Chart action | Context menu and interactive order lines | Right-click opens a preselected paper ticket | Projection, drag/edit/confirm, cross-chart synchronization |
| Position exits | TP/SL and multiple partial levels | One stop and target; stop first when both hit in one bar | Up to four paired partial exit levels with explicit same-bar policy |
| Account manager | Orders, positions, history, balance, equity, margin and export | Account-specific queued/open/closed cards; gross result only | Full account ledger, fees, cash, margin, export and reconciliation |
| Data coverage | Many asset classes and market sessions | Stored micro-futures bars only | Instrument registry and licensed data by asset, session, tick and contract |
| Journal | Order and trade history | Paper account and entry/exit fill outbox plus ID-aware LuxAlgo intake | Runtime delivery proof, broker/agent account adapters and unified account identity |
| Unread cue | Requested Count Desk behavior | Left icon reports delivered trades awaiting review and pending paper deliveries | Browser proof across service restart, multi-tab acknowledgement, and journal document updates |

TradingView references: [main functionality](https://www.tradingview.com/support/solutions/43000516466-paper-trading-main-functionality/), [order ticket](https://www.tradingview.com/support/solutions/43000784804-what-is-an-order-ticket/), [account manager](https://www.tradingview.com/support/solutions/43000786138-what-is-the-account-manager/), [multiple exits](https://www.tradingview.com/support/solutions/43000772334-multiple-take-profit-and-stop-loss-levels/), [chart trading](https://www.tradingview.com/support/solutions/43000766334-chart-trading-on-tradingview-key-features-and-advantages/), [account currency](https://www.tradingview.com/support/solutions/43000480903-how-to-change-the-account-currency-in-paper-trading/), [commissions](https://www.tradingview.com/support/solutions/43000755797-commission-per-contract-in-paper-trading/).

## Target design

### Chart-first planning priority (2026-09-30 update)

The chart is the primary trade surface. A compact ticket stays on the right, while chart right-click starts a draft at the cursor price. Entry, stop, and target appear as draggable chart lines; the ticket mirrors edits. The draft shows contract quantity, gross dollar risk, gross dollar reward, reward/risk, and hypothetical P&L against the latest **stored chart close**. Hovering uses a separately labeled cursor scenario; a Vela bar event uses a separately labeled provisional chart-bar price. Neither is a fill or a verified live quote. A draft control lets the trader keep stop and target fixed or move them by the same price change when entry is edited or dragged. The first implementation is in `paper-chart-planner.js`; it queues through the existing paper-only API and cannot route a live order. The old separate Paper Trading tab remains for account setup and order history.

[TradingView chart trading](https://www.tradingview.com/support/solutions/43000766334-chart-trading-on-tradingview-key-features-and-advantages/) treats projection, editing, and confirmation as in-chart actions. [SharkIndicators BlackBird Dynamic Planning](https://www.sharkindicators.com/documentation/blackbird/dynamic-planning/) documents movable entry/stop/target flags, levels that either stay at a fixed price or move with entry, market tracking, and optional contract scaling to a risk budget. These are product references, not claims that Vela includes BlackBird or that the current draft has those advanced modes.

Next chart acceptance work: price-follow mode with a visible on/off control; risk-budget sizing using authoritative tick/point value and margin metadata; edit/cancel of queued orders and position brackets on the chart; confirmed price updates from a permitted data feed; stale-feed handling; and multi-chart synchronization. A draft's changing hypothetical P&L must never be presented as actual position P&L. Once filled, open P&L must use the simulator's fill price, quantity, multiplier, and a timestamped price reference; net P&L waits for fees and slippage rules.

1. **Account registry.** One platform account ID per paper, broker, or agentic ledger. Persist `account_type` (`paper_user`, `broker_import`, `agent_paper`, `agent_shadow`), owner/team, currency, timezone, starting funds or broker source, status, journal account ID, and source authority. A simulated account uses a virtual opening cash event. A broker account uses broker-authoritative records. Agentic activity stays paper/shadow unless separately approved and verified.
2. **Simulation ledger.** Use append-only order requests, state transitions, fill events, cash events, and position lots. Stable event IDs include account and order identity. Keep source bar ID, feed, timestamp, mode, cutoff and matching rule on every fill. Do not turn a chart idea or submitted order into a fill.
3. **Matching.** Define order lifecycle (`draft → submitted → working → triggered/partially_filled → filled/cancelled/expired/rejected`). Use licensed bid/ask or tick data for a real-time paper claim. With OHLC alone, match only on completed bars; a stop-limit activated and touched within one bar waits for a later bar. Missing data leaves orders pending and visibly stale. Gap fills, same-bar stop/target ambiguity, partials, sessions, tick size, fees, slippage and margin each need versioned rules and scenario tests.
4. **Journal adapter.** The paper-specific adapter and ID-aware intake are implemented as a first vertical slice: `chart_sim_journal_outbox` persists retries in Count Desk SQLite; `/api/integrations/count-desk` requires a bearer token; the journal stores `sourceType`, `externalAccountId`, `externalEventId`, and receipts, and rebuilds from accepted executions. Entry and exit fills carry simulation and source-bar provenance. Next, generalize the account mapping and event contract to broker and agent ledgers, and record a journal receipt back in the Count Desk outbox only after an end-to-end service run proves delivery. Until then, the bridge's delivered state means the intake acknowledged the event, not that every UI view has been reviewed.
5. **One journal workflow.** Notes, tags, screenshots, strategy, documents, reviews and analytics use the same journal UI for all account types. Filters and source badges expose paper, broker, agent paper and agent shadow, while metrics only include records whose costs and contract specifications support them. Never mix paper P&L into broker performance by default.
6. **Unread notifications.** The Count Desk outbox currently serves as the local update list: one inbox item represents a reconstructed paper trade, entry/exit events share that item, and clicking the journal icon acknowledges delivered items through the latest local sequence. Pending fills remain separately counted and cannot be mistaken for journaled trades. Next, have the journal return committed trade IDs and update sequences, persist the user's acknowledgement cursor across clients, and include journal documents in the same inbox. A failed journal write does not create a delivered-trade badge.

## Delivery sequence and gates

| Phase | Deliverable | Required proof |
| --- | --- | --- |
| 1 — done in this slice | Named virtual accounts, account-scoped orders, four entry types, context shortcut | Schema migration, focused unit tests, browser account creation and queued order |
| 2 | Platform/journal account identity, virtual cash ledger, explicit paper/real/agent classifications | Migration from null legacy IDs; no duplicate accounts; broker and agent accounts remain source-labeled |
| 3 — implemented, runtime gate open | Durable outbox and journal paper-fill intake | Still required: offline/retry/restart, duplicate and two identical-price fill proof; journal row and receipt agree |
| 4 | Order/position parity | Confirm/modify/cancel, partial fills/exits, brackets, time in force, margin, fees, risk sizing, chart lines, exports; scenario matrix passes |
| 5 — paper badge slice implemented | Unread icon for paper trades | Still required: runtime clear-on-view/reconnect proof, shared multi-client cursor, and document notifications |
| 6 | Licensed live paper feed pilot | Written source rights, instrument metadata, timestamps, feed-gap behavior, end-to-end latency measurements and independent reconciliation |

The first pilot should use one explicitly approved data source and one micro-futures contract. “Real time” is an acceptance result measured from source event to journal commit and badge update; it is not inferred from an HTTP endpoint or a refreshing chart. No live broker route belongs to this simulator.

## Open product decisions

- Identify the first licensed feed and contract whose terms permit storing and processing data for the simulator.
- Choose opening virtual balance, commission/slippage schedule, margin model, and session/time-in-force defaults. Until selected, the UI shows gross results and does not claim net account equity.
- Decide whether a new journal item badge counts each fill, each reconstructed trade, each document, or a combined inbox item. Recommended: one inbox item per trade requiring review, with documents grouped under that trade.
