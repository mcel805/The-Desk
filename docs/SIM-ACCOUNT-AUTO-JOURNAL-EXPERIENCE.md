# Chart-first trading, paper ledger, and automatic journal experience

**Revised scope:** 2026-10-02. This revision replaces the earlier separate Paper Trading workspace as the target interaction. Trading controls live in the chart interface. Simulation and live accounts share a familiar chart-trading workflow, while execution, account authority, and fills remain isolated behind separate adapters. The initial delivery is simulation only. Live routing remains gated on a verified, explicitly approved broker integration; a visible Live choice must never fall back to simulation or vice versa.

The paper ledger is durable backend state and the journal is populated from recorded fills. A backtest, a historical replay, a forward paper run, and a live broker execution are four distinct records with explicit source and mode. Quant Lab currently loads finite public-bar snapshots; a forward run must show its actual feed state and stop claiming it is active when the feed is stale or disconnected. Market-data retention remains subject to verified source rights.

**Pre-implementation UI inventory:** Vela Preview contained compact Buy/Sell shortcuts, a Sim-account shortcut, chart right-click planning, and a collapsible paper planner rail alongside a separate Paper Trading tab/workspace. The implementation consolidates those controls into one chart-native Sim flow.

**Implementation status (2026-10-02):** The Quant Lab chart is the target interface. It now has a persisted active SIM-account selector, compact Buy/Sell actions, a chart right-click menu, and a Chart Trader side dock with account-scoped orders and positions plus local SIM-account creation. Quant Lab's present Binance, Coinbase, and Hyperliquid instruments are public crypto snapshots, while the server simulator accepts stored micro-futures bars only; the order ticket therefore stays disabled for these charts and explains the boundary. No broker order route is present. The existing stored-bar simulator and durable journal bridge remain available for supported micro-futures workflows elsewhere. The current simulator remains historical with manual next-bar checks; it does not qualify as an unattended forward test. A compatible Quant Lab data-to-simulator path, broader account/equity ledger, history/account views, partial fills, cost model, frozen strategy runner, and verified Live adapter remain later phases.

## Revised chart-first product requirements

1. **Active account in chart chrome.** Keep a compact selector at the chart's upper right. It shows the selected account name, `SIM` or `LIVE`, and connection/readiness state. Switching account updates every ticket, order, position, balance, and journal filter. Persist the selected account. Distinguish executable accounts from local account-context labels.
2. **Small chart Buy and Sell controls.** Keep compact Buy/Sell actions at the chart's upper right, beside the persistent active-account pill. Replace fixed shortcut behavior such as a hidden default tick offset with an explicit configured order preset or a draft in Chart Trader. By default, each opens the order preview. An optional one-click preference can be added only after account/mode is unmistakable and should remain off by default, matching TradingView's safer preview-first behavior.
3. **Chart-price context menu.** Right-click at a chart price offers Buy/Sell actions for market, limit, and stop orders. A price-based action carries the clicked price into the ticket as a draft; it does not queue or submit until the user reviews and confirms it. Existing right-click planning and chart-drawn entry/stop/target lines should feed the same ticket state.
4. **Collapsible Chart Trader.** Remove the top-level Paper Trading tab and its separate trading workspace/chart. Put its useful controls in one collapsible Chart Trader dock on the existing chart. The dock contains the ticket plus Orders, Positions, History, and Account views. It opens only when requested or when an order/position needs attention, and collapsing it returns space to the chart. Keep the active account visible when collapsed.
5. **Consistent order lifecycle.** Support market, limit, stop, and stop-limit order drafts; quantity; time-in-force; optional stop-loss/take-profit brackets; cancel/modify; full or partial close; and reverse as an explicit action. Show order status separately from fill status. Show quantity, estimated value, planned risk/reward, cost model, and current data timestamp in the review. Instrument-specific tick/lot, multiplier, contract, margin, funding, and settlement rules must be defined before enabling that instrument.
6. **Simulation and live adapters.** The chart sends a typed order intent to an execution adapter. The Sim adapter writes to the local simulation ledger and can never call broker endpoints. A Live adapter is a later, separately approved integration with its own credential storage, permissions, connection checks, explicit order confirmation, and broker-authoritative order/fill reconciliation. The same UI vocabulary does not imply identical simulated and live fill certainty.
7. **Automatic journal from fills.** Persist order/fill/position events first, then enqueue idempotent journal updates using stable account, order, fill, and trade IDs. Pending orders do not appear as completed trades. Entry fills create or update a journal draft; partial fills/exits append to it; final close records exit, known costs, gross/net P&L, source, and timestamps. Show pending, delivered, retrying, or failed journal status. Never invent strategy rationale or unknown costs.
8. **Forward-test run.** A run binds a frozen strategy version/hash, selected Sim account, market, timeframe, data source, fill/cost model, risk limits, and start cutoff. Process only eligible data received after the cutoff. Record all eligible signals, skipped entries, no-fills, cancellations, fills, exits, gaps, ambiguous outcomes, and unresolved events. Pause the run when data freshness or continuity fails. Backtest metrics must not be blended with forward results.
9. **Account and risk ledger.** Track virtual cash, realized and unrealized P&L, equity, open orders/positions, reserved buying power, fees/slippage/funding when configured, and account/daily risk limits as append-only events plus reconciled projections. Block orders exceeding frozen limits. Keep paper balances and live balances in different account namespaces.
10. **Provenance and audit.** Record account mode, actor, instrument/contract, provider, market-data event and receive times, bar/tick sequence, order intent, fill rule/version, cost model/version, strategy hash when applicable, journal delivery ID, and corrections. Duplicate retries must not create duplicate fills or journal trades.

## Revised delivery plan

1. **Chart-native Sim workflow:** Consolidate the existing account selector, quick-order rail, right-click chart planning, and collapsible paper planner into the main chart surface. Remove the separate Paper Trading tab/workspace and reuse the existing chart-sim service rather than create another paper book. Keep preview and confirmation separate.
2. **Ledger and journal completeness:** Add cash/equity projections, account-scoped order/fill/history views, costs, risk limits, idempotent journal receipts, and reconciliation. Confirm every closed Sim trade has one journal record with full provenance.
3. **Forward testing:** Add an explicit Start/Pause/Stop flow for a frozen strategy version, a verified incoming-data lifecycle, conservative fill handling, and a separate forward-results report. A page snapshot or historical replay alone cannot count as forward data.
4. **Live account mode:** Implement only after the broker, product, data rights, credential flow, order permissions, test environment, and reconciliation contract are verified and approved. Live UI stays clearly labeled and unavailable until that gate passes.

## Revised acceptance checks

- Switching the chart's active account scopes every ticket, query, order, position, history row, and journal update to that account.
- A right-click at price opens the compact ticket with that price and side prefilled; cancelling leaves no order. Confirming a Sim order creates one durable event and one visible order status.
- Buy/Sell controls, draggable order/bracket lines, partial close, cancel/modify, and the collapsed/expanded Chart Trader preserve chart usability and survive reload where appropriate.
- Replaying the same input event or retrying a journal delivery creates no duplicate fill or trade. A journal outage remains visible and retries durably.
- A forward run never reads bars past its recorded cutoff during decision-making; stale feed, gaps, ambiguous bar ordering, and unsupported contracts produce explicit statuses.
- Sim requests cannot reach live credentials or broker order routes. A live action requires its own verified adapter and explicit review/confirmation.

## TradingView interaction reference

The intended interaction pattern is chart Buy/Sell, a right-side order ticket with preview, order/position management, and chart-level bracket interaction. TradingView documents market/limit/stop/stop-limit orders, sizing by units/currency/balance/risk, attached stop/target, and time-in-force for its Paper Trading ticket. Those are UX references; our asset-specific order rules and fill model must be implemented and validated independently. See [TradingView order ticket](https://www.tradingview.com/support/solutions/43000784804-what-is-an-order-ticket/), [placing an order](https://www.tradingview.com/support/solutions/43000786671-how-to-place-an-order-on-tradingview/), and [historical replay trading](https://www.tradingview.com/support/solutions/43000691889-learn-to-trade-on-historical-data/).

The detailed baseline and implementation notes below remain useful, but this revised interaction, mode boundary, and delivery order supersede earlier passages that describe a separate Paper Trading workspace or treat all “live” activity as simulated.

---

## Earlier detailed baseline (retained for implementation notes)

**Design checkpoint:** 2026-10-01. Current Tickstream data is delayed and memory-only, so a real-time claim needs a separately approved feed and measured freshness. The local Count Desk and LuxAlgo services did not answer on ports 8770 and 3000 during that review; the baseline below was source-inspected, not a runtime acceptance result.

## Desired user journey

1. Select **Create account → Broker: Sim**. Enter a name, virtual starting balance, currency, and preferred market. The setup commits one durable account ID, a virtual cash entry, a matching account in the canonical LuxAlgo journal, and an account-scoped chart selection. Show “Ready” only after the mapping is confirmed. Sim needs no broker credentials. Other broker choices remain separate connection flows with explicit capabilities.
2. Open an eligible chart. A persistent **Trading account: Sim · [account]** switcher sits in the chart chrome. Right clicking a candle opens Paper buy/sell market, limit, and stop actions; choosing one opens Trade Manager with the same selected account. The ticket states the source, contract, data delay, latest source timestamp, virtual buying power, quantity, order type, cost model, and simulation label. Reviewing the plan and queueing the simulated order are separate actions. Queueing creates an idempotent durable event. It never sends a broker order.
3. On each qualified market event, the simulator applies a versioned fill policy. The account shows order, position, virtual cash/equity, and risk changes. Entry creates a journal draft backed by a simulated fill and triggers the entry image capture.
4. At full close, commit the exit fill and close event first. The journal displays a complete factual entry immediately. A media worker then attaches an entry image, close image, and a **30 second chart replay highlight**. Each attachment has its own status and provenance. The trader can add personal reasoning and correct tags without changing source facts.
5. An account review screen shows every order and fill, open and closed trades, journal delivery, media readiness, source coverage, and exceptions. Exports include a machine-readable manifest and original evidence links.

## Current baseline and gap

| Part | Source-inspected baseline | Needed |
| --- | --- | --- |
| Sim account | `server.py:create_chart_sim_account` stores name and starting USD balance, queues a journal account event. `vela-preview.js` creates it. | One setup transaction and durable readiness state; owner, currency, market defaults, cash ledger, account/journal identity mapping, migration of existing account IDs. |
| Switchers and chart menu | `web/account-selector.js` combines stored sim accounts with browser-local context profiles; modes include “live” labels but are explicitly context only. Vela's actual `Paper Trading · SIM` tab and right-click Trade Manager each have a simulated account selector; a supported loaded chart exposes Paper buy/sell market, limit, and stop actions. | Put the selected executable Sim account in persistent chart chrome before the right-click action, and use its ID in every ticket/query. Keep context profiles distinct from connected brokers. |
| Trading | `server.py` matches micro-futures orders from stored OHLC bars after a later bar confirms completion; it handles queued entries, cancel, one stop/target, and manual close. | Persistent market event intake, qualified freshness, session/restart continuity, cash/margin and fee policy, order edits, partial fills/exits, deterministic race and gap handling. |
| Feed | `tickstream_adapter.py` provides delayed, memory-only bars. Vela also has public crypto providers and historical charts. | Approved market-data rights, exact contract mapping, source timestamp/sequence, gap detection, retained evidence, and a clear delayed/real-time state. A data subscription alone does not establish storage or AI/replay rights. |
| Journal | `paper_journal_bridge.py` queues account and entry/exit events with stable IDs and retries. The LuxAlgo local endpoint accepts/deduplicates them. Current payload sends `fee: 0`. | Reconcile delivery receipts, expose errors, represent unknown vs configured simulated costs, preserve full order/fill and media manifests, and verify journal completeness per account. |
| Video | `show_me.js` records a user-selected screen for up to 30 seconds; `show_me.py` retains the latest 25 clips with sampled frames. | A per-trade media pipeline and durable retention. Show Me is an opt-in support clip, not a trade recorder or archive. |

## Architecture and authority

**Sim account service** owns account identity, virtual funding/cash, permissions, and setup state. **Market-data intake** owns source packets, timestamps, gap/freshness state, and qualified persistence. **Simulation engine** alone owns order state and simulated fills. It records immutable events before projecting mutable orders, positions, and balances. **Journal bridge** delivers fill and close facts idempotently to the self-hosted LuxAlgo journal, then records the destination receipt. **Media worker** reads the frozen trade events and chart history to render images and a replay; it stores files outside Git and links a manifest to the trade. **Review screen** reads statuses from all four services and never turns an incomplete attachment into a missing trade.

Keep one stable `account_id` from onboarding through chart tickets, simulator events, journal account mapping, and media manifests. Use stable `order_id`, `fill_id`, `position_id`, and `trade_id`. Make account creation and trade close idempotent, so a retry after a lost response does not create a second account, fill, or journal trade. Existing `paper-*` IDs need a versioned migration and reconciliation before switching the header selection.

An event should carry account and actor ID, mode=`sim`, source/provider and rights version, exact contract, source timestamp and receive timestamp, timeframe or tick sequence, order/fill IDs, rule version, quantity, price, side, multiplier, cost model/version and cost status, and an input hash. Preserve raw market evidence privately. Do not convert an OHLC touch into a certain fill when its intrabar ordering is unknown; keep the current stop-first ambiguity visible until finer evidence is available.

## What “30 second highlights” means

Use a **generated chart replay**, labeled as a reconstruction from retained market data. Select a fixed 30 second output timeline containing the lead-in to entry, the entry, key changes, the lead-in to exit, and close. For a very short trade, use title and summary frames to fill the output rather than inventing market movement. Overlay account, contract, simulated fill markers, source times, feed delay, and any missing-data badge. Freeze the chart's timeframe, viewport, drawings, and active indicator versions at entry and exit. The two images use that saved render state with source timestamps and a manifest hash. Capture an actual screenshot at the moment when the chart is open if possible; if generated later, label it “reconstructed chart image.”

The worker must verify enough intratrade source coverage to make each scene. If coverage is absent, publish the factual journal with `media_incomplete` and an explanation; never fabricate candles or quietly substitute a later chart. Record media hash, codec/duration, rendering version, source range/hash, created time, and the exact trade event IDs. Keep attachments in a private local store with retention, backups, access controls, and export/delete policy; exclude them from Git.

Automatic capture of an arbitrary browser screen requires a fresh user action and screen-selection permission. For an unattended default, render the chart data the application owns into a replay canvas or server worker. `getDisplayMedia()` remains an optional, user-started actual-screen recording path. This follows the [Screen Capture specification](https://www.w3.org/TR/2026/WD-screen-capture-20260716/) and [canvas capture documentation](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream).

## Automatic journal entry

On entry, write a draft containing account, contract, source, order and fill IDs, side, size, entry time/price, setup fields explicitly supplied by the trader, and the current risk plan. On close, add exit time/price/reason, gross P&L, virtual balance effects, known simulated fees/slippage, net P&L only when those cost inputs are defined, and an event timeline. MAE/MFE and trade-duration summaries require complete intratrade coverage. The entry template has sections for setup/context, execution, management, outcome, evidence, and reflection. Populate every field whose source is known. An optional model can draft chart context and management commentary from the frozen evidence, recording its method/version and cutoff; label that text as a hypothesis. Strategy, emotion, and why the trade was taken remain trader-confirmed fields. The journal entry must be viewable before the video finishes.

The journal is the canonical completed-trade view. The simulator remains authoritative for simulated fills; the journal stores their copied facts and delivery receipt. A daily reconciliation compares account IDs, fill IDs/counts, open quantity, simulated costs, and trade close status, and marks `verified`, `partial`, `stale`, or `blocked` through an explicit cutoff. A worker failure or journal outage creates a visible pending/error state and retries from a durable queue. Do not mark journal automation complete merely because the request returned HTTP 200.

## Build sequence and acceptance

1. **Account foundation:** Add the Sim broker onboarding path, persisted selection, cash ledger, account mapping and readiness. Backfill old sim accounts without changing their IDs. Acceptance: new and migrated accounts stay selected across browser restart; each maps to exactly one journal account; no credentials or broker route are created.
2. **Sim trading service:** Version event and fill rules, persist market inputs, enforce data freshness and account risk, then add partials and multi-level exits. Acceptance: deterministic replay of the same feed creates identical fills; stale/gap states stop new simulated fills; restart resumes open orders without duplicates.
3. **Journal completeness:** Extend the existing durable bridge for every fill, costs and close, add receipts and reconciliation, and show delivery state. Acceptance: offline journal, duplicate event, reordered response, restart, no-trade day, and correction all have explicit outcomes; every closed simulated position has one matching completed journal trade.
4. **Trade media:** Implement entry/close chart-image capture and a per-trade 30 second replay job, manifest, private storage and retry. Acceptance: normal trade yields two timestamped images and a playable 30 second highlight linked to the right trade; interrupted rendering leaves the journal intact and reports its missing attachment.
5. **End-to-end UX:** Show one account setup wizard, one account-specific ticket, a close summary, and a journal review screen with delivery/media status. Acceptance: a user can create Sim, submit a paper order, close it, inspect fills, watch highlights and open the complete journal without manual copying.

**First implementation slice:** Account setup plus a single chart → simulator → journal identity, then one closed-trade image and factual journal entry. Add the highlight renderer after event history and image provenance are reliable. Test with synthetic contracts and explicitly labeled delayed data until a licensed, permitted real-time feed is available.

## Product decisions to settle

- Is the first release local single-user, or should it support multiple signed-in traders? The current Count Desk is local and does not prove per-user access control. This plan assumes local single-user first.
- What are the virtual funding, margin, fee, slippage, reset, and account deletion rules? The current bridge sends zero fees; that should become a named simulation model or an unknown-cost state.
- Which exact pilot contract and approved data source can provide retained intratrade history for replay, under permitted display, storage, research, and media rights?
- Should highlights show a reconstructed chart only, or also allow an optional user-started screen recording? This plan makes reconstructed chart replay the automatic default.

## Source pointers

- `count-dashboard/server.py`: chart sim schema, account creation, order matching/close, routes.
- `count-dashboard/web/account-selector.js`: current context-only header accounts.
- `count-dashboard/web/vela-preview.js`: chart account creation and feed status.
- `count-dashboard/paper_journal_bridge.py` and `integrations/open-source/trade-journal/apps/web/src/app/api/integrations/count-desk/route.ts`: durable fill delivery and LuxAlgo ingestion.
- `count-dashboard/web/show-me.js` and `count-dashboard/show_me.py`: opt-in 30 second screen recorder and rolling local clip store.
