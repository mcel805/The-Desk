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
| Watchlist and DOM | Six market rows, source switching, 10 displayed bid and ask levels, spread, click-to-stage limit order |
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

Matching uses public server bid/ask snapshots, refreshed approximately every three seconds. It blocks new orders on quotes older than 15 seconds. Working orders first match on a later eligible quote. Limits can improve; stops fill at the observed price after the trigger and may gap. Netting uses FIFO lots; a reversal records closing and opening execution legs. SL/TP exits only the remaining position quantity and one sibling exit wins. Timed expiry does not require a functioning market feed.

This MVP assumes full quantity fills at the observed quote. It does not model exchange queue priority, partial liquidity fills, slippage beyond observed spread, funding, margin liquidation or venue-specific fee tiers. Virtual fee settings are user-configurable assumptions. It is not suitable for predicting actual venue execution. Stale position valuation can reflect the last received quote; inspect the quote-age indicator.

Replay is **chart study only**. Previously accepted server paper orders remain active on current quotes while the chart replays. It does not create a second historical trading ledger. The SMA study is long-only with one unit, realized closed-trade drawdown, and no funding/slippage; an open study position is excluded from realized P&L. Missing bars cause the study to stop rather than invent data.

Both native chart providers can expose additional search results, but the MVP paper engine intentionally accepts only the six listed instruments. Other instrument tickets remain unavailable without a server quote. History is provider-bounded, not a guaranteed complete historical archive.

## Existing journal integration

The launcher shares `COUNT_DESK_JOURNAL_BRIDGE_TOKEN` with the existing journal process. It reads only that token and the journal URL from existing private environment files; otherwise it generates a local token in ignored `data/bridge-token` with mode 0600. Tokens are never printed or included in Git. The original journal database gets a one-time SQLite backup before this launcher starts its process. Existing journal login behavior and historical records are preserved.

Desk account IDs are durable `desk-paper-*` identities. Journal records are labeled `The Desk PAPER` with `source_type=paper_user`; symbols are source-qualified, for example `HYPERLIQUID:BTC-PERP`. Actual fees, quantities, UTC execution timestamps and simulation provenance enter the existing `/api/integrations/count-desk` bridge. That bridge reconstructs the original journal's trades and deduplicates by external event ID.

Execution and its delivery record commit together. Journal downtime does not undo a simulated fill. Retries back off to 60 seconds and resume after restart. The footer separates journal availability and queued/delivered events. Open the journal panel to view the selected account; **Refresh journal** reloads its latest projections without automatically interrupting notes you may be editing. **Retry pending delivery** expedites pending events. A reused, already running journal must have the same bridge token; HTTP 401/503 delivery errors remain queued until configuration is reconciled.

Desk SQLite, process IDs, backups, tokens and logs live under ignored `data/`. Test state lives under ignored `qa-data/`. No migration or backfill of old Count Desk accounts is performed. Their existing databases and journal history remain intact.

## Verification

```sh
python3 -m unittest discover -s tests -p test_engine.py -v
python3 -m unittest discover -s tests -p test_market_data.py -v
node --check web/app.js
python3 launch.py --qa --port 18881 --journal-port 3101 --detach
python3 -m unittest discover -s tests -p test_journal_integration.py -v
python3 launch.py --qa --stop
```

Two market-data fixtures verify incomplete Coinbase aggregation and the request-time completed-bar cutoff. Engine tests cover order matching, costs, partial exits, bracket quantity, account isolation, reversal, spot inventory, stale quotes, precision, buying power, revision conflicts, restart recovery, one-shot alerts, feed-independent expiry, full export and transaction rollback. The opt-in journal test uses an isolated journal database, verifies seven executions/three closed trades, reconciles fees and balance, simulates delivery failure and lost acknowledgments, and checks origin/content-type/token rejection.

See [MVP-ACCEPTANCE.md](MVP-ACCEPTANCE.md) for browser checks and the explicit full-platform boundary. Local workers continue with browser tabs closed while the Python process and awake machine are running; the launcher is not an operating-system service manager.

## Reused source

- Vela 0.8.0 at `eb8c8f9552b836825c6fd56b3305a5b58eeda09d`: Apache-2.0; license and NOTICE in `web/vendor/`.
- Existing LuxAlgo Trade Journal in this repository: MIT; its source remains at its original path. The Desk uses its existing Count Desk bridge rather than duplicating the journal.
- SMA study from `count-dashboard/web/quant-backtest.mjs`, copied to `web/sma-backtest.mjs`.
- To rebuild the Vela bundle from installed source: `node build-vendor.mjs`. Tree shaking is disabled because native registries depend on module side effects.

TradingView is the functional and interaction comparison baseline. The Desk uses its own branding and licensed Vela source. TradingView's proprietary code/assets, Pine runtime and protected or paid indicators are not copied.
