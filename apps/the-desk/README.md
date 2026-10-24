# The Desk

Local Vela trading workspace with Coinbase and Hyperliquid public market data, durable paper accounts, chart trading, and the **existing LuxAlgo Trade Journal**. This is the implemented MVP of the Supercharts-first product plan. The complete TradingView parity backlog remains in `docs/product-plan/`; completion of this MVP does not mean every TradingView feature is identical.

## Open

Double-click **Open The Desk.command**, or run from this directory:

```sh
python3 launch.py --detach
```

- The Desk: http://127.0.0.1:18880/
- Existing Lux Journal: http://127.0.0.1:3000/
- Health: http://127.0.0.1:18880/api/health
- Stop only services owned by this launcher: `python3 launch.py --stop`

Python 3.9+ and Node 22 are available on this machine. The checked-in Vela browser bundle needs no installation. The launcher uses the repository's already installed and built journal at `integrations/open-source/trade-journal/apps/web`; it does not create a replacement journal or move its historical database. `TRADER_REPO`, `LUX_JOURNAL_DIR`, and `NODE_BIN` can override paths. Run `launch.py --help` for ports and isolated QA mode.

## MVP workflows

| Area | Delivered behavior |
|---|---|
| Chart workspace | Vela native canvas chart, interval/style menus, crosshair/zoom, drawings and object tree, indicator catalog/settings, screenshot download, multi-chart grid and synchronization controls |
| Workspace state | Local SQLite persistence for chart/layout/indicator/drawing state, complete named templates, light/dark theme; browser remembers the chosen account |
| Markets | BTC, ETH and SOL on Coinbase spot and Hyperliquid perpetuals; qualified source identity, server quote age and visible stale/unavailable states |
| Watchlist and DOM | Six market rows, streaming price/size/cumulative-total book, red/green depth bars and change highlights, source switching, click-to-stage limits, adjacent paper ticket |
| Ticket | Buy/sell, market/limit/stop market/stop limit, units/USD notional/percentage/risk sizing, commission/risk/reward estimates, optional SL/TP, GTC or timed expiry |
| Chart trader | Draft/working/position/protection lines aligned with the native price pane; context menu staging, drag amendment review, keyboard Enter editing |
| Account manager | Separate virtual balances and ledgers; orders, open positions, executions, event history, partial close, reversal, SL/TP amendment and cancellation |
| Paper backend | Server-owned matching/timers, quote freshness and precision checks, spot inventory, virtual buying power, fees/realized cash, atomic receipts/outbox, idempotent commands and revision checks |
| Alerts | Durable one-shot above/below alerts evaluated by the server; visible event/toast when this account workspace is open |
| Replay | Vela historical chart start/step/play/pause/exit; current submission and position editing controls disabled while replay is active |
| Strategy study | Reused completed-bar SMA crossover tester, next-bar-open fills, configurable fees, realized P&L/drawdown, source/interval/cutoff and trade table |
| Lux Journal | Original UI embedded and linked with the selected durable account; original executions, trade reconstruction, calendar, notes, playbooks and reports; authenticated retry queue and duplicate receipts |
| Export | Complete account-scoped orders, positions, fills, cash ledger and events as JSON, including simulation/cost/UTC metadata |

Use the main **+ Alert** button for server alerts. Vela's native chart alert panel belongs to its own chart runtime. Chart interval controls change bar aggregation; they are not an automated trading decision cadence.

## Execution and data contract

Every order is **PAPER / SIMULATED**. Public Coinbase and Hyperliquid data connections are active; no venue credentials, wallets or private order endpoints are used by this application. Coinbase spot selling requires owned paper inventory. Hyperliquid permits virtual long/short exposure and a configured 1–20x paper margin allowance.

Hyperliquid matching uses a server-owned public WebSocket book and trade stream. Resting limits also fill at their unchanged limit when a fresh post-acceptance public trade touches it, provided the server book is fresh. Pre-order, pre-amendment and stale events cannot fill orders. Coinbase and degraded Hyperliquid connections use independent REST workers approximately every three seconds; brief touches may be missed in REST fallback. Install the public-stream dependency with the launcher-selected Python: `python -m pip install -r requirements-market.txt`. The health endpoint reports `market_stream`. It blocks new orders on quotes older than 15 seconds. Working orders first match on a later eligible quote. Limits can improve; stops fill at the observed price after the trigger and may gap. Netting uses FIFO lots; a reversal records closing and opening execution legs. SL/TP exits only the remaining position quantity and one sibling exit wins. Timed expiry does not require a functioning market feed.

This MVP assumes full quantity fills at the observed quote or, for public trade touches, at the resting limit. It does not model exchange queue priority, partial liquidity fills, slippage beyond observed spread, funding, margin liquidation or venue-specific fee tiers. Virtual fee settings are user-configurable assumptions. It is not suitable for predicting actual venue execution. Stale position valuation can reflect the last received quote; inspect the quote-age indicator.

Working orders and positions follow the selected paper account and exchange-qualified instrument across chart timeframes. When a level is outside the visible price scale, an arrow badge keeps its exact price and edit/cancel controls accessible. The badge explicitly says **off scale**; it does not draw a false horizontal price line at the chart edge. Levels return to their actual price coordinates when the visible scale includes them.

Replay is **chart study only**. Previously accepted server paper orders remain active on current quotes while the chart replays. It does not create a second historical trading ledger. The SMA study is long-only with one unit, realized closed-trade drawdown, and no funding/slippage; an open study position is excluded from realized P&L. Missing bars cause the study to stop rather than invent data.

Both native chart providers can expose additional search results, but the MVP paper engine intentionally accepts only the six listed instruments. Other instrument tickets remain unavailable without a server quote. History is provider-bounded, not a guaranteed complete historical archive.

## IBKR futures data (read-only)

An optional IBKR provider supports a single dated MYM contract, recent intraday
candles and quotes, separately from the crypto paper engine. Try it without an
account using the explicit **DEMO DATA** mode. See [setup, limits and account-free
tests](IBKR-DATA.md). The default is off. This release does not enable futures
orders, depth or actual IBKR account access.

## Existing journal integration

The launcher shares `COUNT_DESK_JOURNAL_BRIDGE_TOKEN` with the existing journal process. It reads only that token and the journal URL from existing private environment files; otherwise it generates a local token in ignored `data/bridge-token` with mode 0600. Tokens are never printed or included in Git. The original journal database gets a one-time SQLite backup before this launcher starts its process. Existing journal login behavior and historical records are preserved.

Desk account IDs are durable `desk-paper-*` identities. Journal records are labeled `The Desk PAPER` with `source_type=paper_user`; symbols are source-qualified, for example `HYPERLIQUID:BTC-PERP`. Actual fees, quantities, UTC execution timestamps and simulation provenance enter the existing `/api/integrations/count-desk` bridge. That bridge reconstructs the original journal's trades and deduplicates by external event ID.

Execution and its delivery record commit together. Journal downtime does not undo a simulated fill. Retries back off to 60 seconds and resume after restart. The footer separates journal availability and queued/delivered events. Open the journal panel to view the selected account; **Refresh journal** reloads its latest projections without automatically interrupting notes you may be editing. **Retry pending delivery** expedites pending events. A reused, already running journal must have the same bridge token; HTTP 401/503 delivery errors remain queued until configuration is reconciled.

Desk SQLite, process IDs, backups, tokens and logs live under ignored `data/`. Test state lives under ignored `qa-data/`. QA refuses an occupied journal port so it cannot silently reuse another journal database. Process startup fingerprints prevent stale PID metadata from stopping a reused process; owned Next processes remain stoppable after their process title changes. No migration or backfill of old Count Desk accounts is performed. Their existing databases and journal history remain intact.

## Pine Script indicators

**Cleo's Liquidity** is available in **Indicators → Cleo's Liquidity → Open & test**. It keeps the supplied Wave Court v1.14 calculations and all 199 inputs, with chart-and-higher liquidity and nearest-level defaults for a readable price view. See [CLEOS-LIQUIDITY.md](CLEOS-LIQUIDITY.md) for display settings, 4H runtime validation and the TradingView reference boundary.

Open **Indicators → Create Pine Script indicator**, paste native Pine v5/v6 source or load Market Gravity, then **Compile & test**. Add tested source to the chart or save it in the local Pine library. Original settings and drawings use Vela; reports and CSV comparison keep runtime success separate from verified TradingView parity. See [PINE-INDICATORS.md](PINE-INDICATORS.md) for the workflow, compatibility boundary, tests and AGPL dependencies.

## Verification

```sh
python3 launch.py --qa --port 18881 --journal-port 3102 --detach
DESK_QA_HTTP=1 QA_JOURNAL_PORT=3102 python3 -m unittest discover -s tests -v
node --test tests/test_sma.mjs
node --check web/app.js
python3 launch.py --qa --stop
```

Two market-data fixtures verify incomplete Coinbase aggregation and the request-time completed-bar cutoff. Engine tests cover order matching, costs, partial exits, bracket quantity, account isolation, reversal, spot inventory, stale quotes, precision, buying power, revision conflicts, restart recovery, one-shot alerts, feed-independent expiry, full export and transaction rollback. The opt-in journal test uses an isolated journal database, verifies seven executions/three closed trades, reconciles fees and balance, simulates delivery failure and lost acknowledgments, and checks origin/content-type/token rejection.

See [FEATURE-QA.md](FEATURE-QA.md) for the expanded feature matrix, current validation results, inherited Vela failures, and remaining build work. Pine-specific rebuild and test commands are in [PINE-INDICATORS.md](PINE-INDICATORS.md). [MVP-ACCEPTANCE.md](MVP-ACCEPTANCE.md) records the initial delivery acceptance. Local workers continue with browser tabs closed while the Python process and awake machine are running; the launcher is not an operating-system service manager.

## Reused source

- Vela 0.8.0 at `eb8c8f9552b836825c6fd56b3305a5b58eeda09d`: Apache-2.0; license and NOTICE in `web/vendor/`.
- Existing LuxAlgo Trade Journal in this repository: MIT; its source remains at its original path. The Desk uses its existing Count Desk bridge rather than duplicating the journal.
- SMA study from `count-dashboard/web/quant-backtest.mjs`, copied to `web/sma-backtest.mjs`.
- To rebuild the Vela bundle from installed source: `node build-vendor.mjs`. Tree shaking is disabled because native registries depend on module side effects.

TradingView is the functional and interaction comparison baseline. The Desk uses its own branding and licensed Vela source. TradingView's proprietary code/assets, proprietary Pine runtime and protected or paid indicators are not copied. Self-contained user-supplied Pine executes through the independent AGPL PineTS runtime.

## Streaming DOM

Open **DOM** beside Watchlist. The three-column order book follows the supplied October 11 Hyperliquid reference: descending asks above the spread, descending bids below it, cumulative depth shading, quantity-change flashes, best-price markers and recent trade-price highlights. The paper ticket stays beside the book on desktop and mobile. Bid rows stage buys; ask rows stage sells. Market buttons stage market orders; the ticket submits them. Hover or keyboard focus pins displayed prices while quantities continue updating. **Center** recenters the rows. Feed mode and 1×/10×/100× tick grouping persist in this browser.

Hyperliquid uses public WebSocket `l2Book` and `trades`. Default **Fast** requests `fast:true`, which currently supplies at most five levels per side. **Depth** requests up to 20; the view shows the nearest 11 grouped levels per side. Coinbase uses the unauthenticated `level2_batch` channel (50 ms batches) and `ticker`; snapshot and absolute quantity deltas maintain its book. The client maintains the full Coinbase book and renders/groups the nearest 2,000 raw levels; deeper levels are not inferred. Cumulative totals are for the available displayed buckets, in base units. Rendering is batched to animation frames; incoming prices are never synthesized between provider updates.

The stream reconnects with bounded backoff, rejects crossed/invalid books and older snapshots, resets on instrument switches, and exposes stale/reconnecting/REST fallback states. The browser stream is display data. A separate server-owned Hyperliquid stream supplies paper book matching and fresh resting-limit trade touches; neither stream routes venue orders. Coinbase matching remains REST-based. Stale server quotes and chart replay still block submission.

Reference APIs: [Hyperliquid subscriptions](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/websocket/subscriptions), [Coinbase channels](https://docs.cdp.coinbase.com/exchange/websocket-feed/channels).

Run `node --test tests/test_dom.mjs`. DOM tests cover cumulative grouping, crossed/invalid books, provider identity, fast/depth subscriptions, Coinbase snapshot/delta/delete semantics, out-of-order rejection and disconnect/switch cleanup.

## DOM and chart trader

The DOM has a **Trading ladder** view with fixed price rows, separate buy/sell cells, visible streamed bid/ask quantities and quantity-change flashes. Click to stage a limit; Command/Control-click stages a stop. Right-click a cell for market/limit/stop/stop-limit entry. Center and tick grouping reposition the ladder; ordinary book updates leave target prices fixed. Available provider depth is shown; missing levels are marked with an em dash. The original Hyperliquid-style market book remains the default.

Working-order cards allow quantity/price/protection amendments, cancellation and dragging onto a ladder row. CXL buy/sell/limit/stop/all acts on reviewed orders for the selected account and instrument. Flatten cancels that instrument's working orders and closes its positions; Reverse cancels its orders and reverses net perpetual exposure. Both use atomic transactions, revision-checked snapshots and fresh server quotes for execution. Cancellation remains available when quotes are stale. Coinbase spot cannot reverse into a short.

Chart trader shows the actual entry price and live P&L as separate values on open position labels. Working order labels show their limit price and status. It also shows executable-quote gross P&L and stop/target levels. Historical paper execution arrows are hidden by default. Enable **Paper execution history** in **Trading settings** to review small buy/sell arrows; hover to see quantity, instrument, price, reason and timestamp. Older always-on execution settings no longer add this clutter. This display change preserves the execution ledger and journal. Drag a working order or protection label to review a price amendment; click or Enter opens editing. Position controls protect, reverse or close partially/fully; order controls cancel. Chart buy/sell buttons and the price-axis plus/context menu stage new entries. Each chart cell filters its own instrument, and account switching replaces all overlays.

**Trading settings** persist line, bracket, optional execution-history, P&L, reverse-button and quick-button visibility plus money/tick/percent P&L units. Review-before-submission is the default. Explicitly enable one-click **PAPER** placement to submit entries using current ticket quantity and protection; closing/amending/reversing still requires review. Replay hides current trading overlays and blocks new entries and management controls while server working orders remain active.

Run `python3 -m unittest discover -s tests -p 'test_*.py'` and `node --test tests/test_dom.mjs tests/test_trading_model.mjs`. The isolated HTTP suite accepts `QA_DESK_PORT` (default 18881), refuses installed port 18880, and requires `DESK_QA_HTTP=1`. Batch-command tests execute idempotency, rollback on state/revision/scope changes, stale-quote rules, quantity precision/buying power and spot inventory restrictions.

These implement the core paper interactions described in [TradingView's DOM guide](https://www.tradingview.com/support/solutions/43000516459-depth-of-market-dom-what-it-is-and-how-traders-can-use-it/). This is an independent Vela-based paper trader, not the licensed TradingView brokerage terminal. Live routing, exchange queue priority, partial liquidity fills, funding, broker-specific order types and keyboard hotkey parity are not established. Server Hyperliquid matching uses public books and fresh limit touches; Coinbase and degraded Hyperliquid matching use REST snapshots.

## Chart limit-order brackets

Right-click the chart and choose **Buy limit** or **Sell limit** to open a visible placement review with editable quantity, entry, stop-loss and take-profit. Limit entries are cyan, stops red and targets teal. Draft labels explicitly read **DRAFT · not placed**, **DRAFT · Stop Loss** and **DRAFT · Take Profit**; protection labels include only the signed tick distance from entry. Each line keeps its exact price-axis badge. Choose **Place paper buy/sell limit** to submit. **Edit on chart** retains only a draft, with a **Place** button on its entry line to reopen review. Only an accepted server order shows side, quantity and **WORKING**. This review also applies when one-click placement is enabled for other shortcuts.

Starter protection offsets come from the chart's visible price scale (with tick-aligned fallback spacing). They are editable UI defaults, not recommended trading or risk levels. Valid existing ticket protection is retained. Dragging the draft entry moves its attached stop and target by the same price difference; dragging either protection changes only that leg and keeps it on the correct side of entry. The ticket receives the final prices on release. Remove a draft protection with its × control, or discard the whole bracket with the entry ×, Discard projection or Escape.

After placement, working orders keep the complete bracket. Drag or right-click an accepted line to review an amendment; Cancel preserves server values and Confirm applies the revision-checked change. A protection × removes that leg through review instead of canceling the order. After a simulated fill, the position retains its stop and target. Existing quote-freshness, account/instrument, replay and paper-only execution rules still apply. Accepted orders and positions outside the current chart price range remain visible as arrow badges with their exact prices and edit/cancel controls; their price lines reappear when in range. Draft brackets retain chart-scale placement.

Run transient-touch/recovery checks with `python3 -m unittest discover -s tests -p 'test_market_stream.py'`. These cover an unchanged sell limit touched between unchanged book samples, duplicate/stale/pre-acceptance events, amendment causality, buy touches, cancellation/expiry, stop-limit triggering and stream subscriptions. Run model and menu checks with `node --test tests/test_chart_brackets.mjs tests/test_chart_menu_actions.mjs tests/test_trading_model.mjs`. The opt-in browser regression runs with `DESK_CHART_BROWSER_URL=http://127.0.0.1:18880/ node --test tests/test_chart_brackets_browser.mjs`. It uses Playwright (`DESK_PLAYWRIGHT_MODULE` can point to an installed module and `DESK_CHROME_BIN` to a browser executable), isolates browser layout settings and blocks all order commands while testing draft interactions.

## Wallet, funding and connected venues

The header wallet drawer defaults to Ledger direct USB (no browser extension), provides optional Rabby/MetaMask connections, and shows ETH/native USDC on Base. See [direct USB setup and acceptance](docs/BASE-HARDWARE-WALLET.md). It opens read-only Hyperliquid and Robinhood account panels. Hyperliquid account snapshots expose collateral, positions, working orders and fills as research context; venue order submission and cancellation are disabled. Base transfers and Robinhood order submission remain disabled; Robinhood account access is read-only, and native options/futures tickets are unavailable. The chart/DOM engine remains paper. See [setup, scope and acceptance](docs/WALLET-FUNDING-AND-LIVE-TRADING.md). Test with `npm run test:wallet` and the focused wallet-enabled Python suites using the server Python with `requirements-wallet.txt` installed.

## Swing Tracker / Jev research

The new **Swing Tracker 1.2** and **Swing Lab** study Hyperliquid BTC/ETH independently
of the older ABC indicator. Stacked 1m dots show each Jev long/short/neutral lean
at the selected cadence (default four per minute). Tracker observations work
without a model key; Jev activation requires server-side `TYPESAFE_API_KEY`.
No orders are routed. See [SWING-TRACKER.md](SWING-TRACKER.md) for setup, provenance,
known port differences and measurement boundaries.
