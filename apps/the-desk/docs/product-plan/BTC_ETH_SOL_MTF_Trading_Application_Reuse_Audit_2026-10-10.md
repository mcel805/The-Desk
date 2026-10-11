# Reuse audit: The Trader → new Vela terminal

October 10, 2026 · Source inspection only; no runtime or private-account acceptance claims.

## Verified checkout and versions

- Application repository: `/Users/markceleste/Documents/ChatGPT/The Trader - a trading company`; inspected HEAD `e75d1af`.
- Existing app: `count-dashboard`; the planning workspace is a separate chart/evidence folder and has no Git repository.
- Vela checkout: `integrations/vela`; package declares `@luxalgo/vela` version `0.8.0`, Apache-2.0; inspected Git revision `eb8c8f9552b836825c6fd56b3305a5b58eeda09d`.
- Existing vendored chart bundle SHA-256: `57c1e3195c34111905cd20903b5472f24d09e1e9f2d876dbf986e74656a3654d`. Its correspondence to the source build has not been established; record source/build provenance before replacement.
- Existing unrelated untracked runtime/config files were observed. This planning run did not modify that checkout, databases, credentials, routes or running services.

Paths below are relative to the application repository. Exact filenames and behaviors were inspected during this draft. “Reuse” means extract behind a defined adapter and verify; it does not mean copy without integration work.

| Component / source | Inspected behavior | Recommendation | Outstanding proof or change |
|---|---|---|---|
| `integrations/vela/package.json`, `docs/user/workspace.md` | Workspace export and provider/plugin/UI exports; source docs available | Prefer pinned package and workspace shell | Build/type/API compatibility with existing vendor bundle; host panel extension seams |
| `src/data/providers/coinbase/CoinbaseProvider.ts` in Vela | Exchange public candle/trade-derived streaming path, REST history and product metadata | Preserve adapter behavior behind canonical feed contract | Runtime symbol/history/reconnect checks, sequence/gap behavior, backend feed ownership |
| `src/data/providers/hyperliquid/HyperliquidProvider.ts` in Vela | Info endpoint, candle WebSocket, spot/perpetual mapping and recent history | Preserve adapter with explicit market identity | Runtime precision/history/stream checks; separate private account path |
| `count-dashboard/web/quant-lab.js` | Vela chart instances, providerSpecs, chart grids, replay controls, indicator selection and connection disclosure | Extract useful chart/provider/overlay bridges | Large workflow-coupled file; uses manual slot lifecycle and snapshot loading; replace orchestration with shared adapters |
| `count-dashboard/web/quant-lab.html`, `.css` | Chart toolbar, buy/sell/Chart Trader, layouts, reference charts and panels | Reuse semantic controls selectively | New default TradingView-style shell; research/game content optional |
| `count-dashboard/web/account-selector.js`, `.css` | Browser storage, established manual/agentic groups and explicit context-only labels | Reuse presentation and migration inputs | Account selection currently emits local context; bind to durable AccountService and verified connector capabilities |
| `count-dashboard/web/chart-trading-controls.js`, `.css` | Paper order dialog, limit/stop-limit handling, chart bracket drags, revision-based amendments | Reuse ticket/drag concepts and arithmetic fixtures | Extract session/risk coupling; complete unified draft, stop-market, conversions, multi-exit and keyboard interactions |
| `count-dashboard/web/trading-terminal.js` | Existing stored chart simulation actions and paper position marks | Reference behavior and reusable view helpers | Uses another simulation API path; reconcile with quant-lab route behavior before reuse |
| `count-dashboard/server.py` | chart_sim_accounts/orders/positions and quant-lab simulation tables/routes | Extract verified rules/tests and migrate data deliberately | Single canonical instrument/account/ledger model; lifecycle, costs, buying power and concurrency acceptance |
| `count-dashboard/paper_journal_bridge.py` | SQLite outbox, stable event IDs, retry queue, account/execution events | Reuse durable delivery pattern | Canonical fill/order identifiers, partial-fill and amendment events, schema/backfill and new-app integration |
| `integrations/open-source/trade-journal` | Existing journal destination referenced by bridge | Preserve journal interface where compatible | Current destination schema and service health need a dedicated audit; prior isolated delivery is not migration proof |
| `count-dashboard/web/trading-chart-settings.js`, candle helper modules | Confirmed candle defaults, draft/cancel/apply behavior and persisted preferences | Preserve saved appearance via migration | Full settings surface; verify confirmed selections after reload and new chart instance |
| `count-dashboard/web/quant-backtest.mjs` | Close-confirmed long-only SMA, next-open fills, per-side fee input | Reuse numerical fixtures only | No general Pine Strategy Tester, funding, slippage, broad order model or portfolio engine |
| `count-dashboard/web/coinbase-footprint-feed.mjs` | Executed-trade overlay support and coverage/reconciliation checks | Preserve validated execution-data path | Do not use as L2 book; runtime coverage and data retention permissions per deployment |
| `quant-premium-overlays.mjs`, `quant-wave-court.mjs`, `wave-court-port.mjs`, `taper-volume.mjs`, `volume-analyst.mjs` | Custom research/plugin imports in active chart workflow | Reuse as optional study plugins | Individual source rights, settings persistence, source/cutoff binding and exact algorithm parity |
| Existing automated tests | Simulation, footprint, settings and custom-engine tests are present | Extract meaningful behavioral fixtures | Full test inventory and current pass status not run for this planning request |

## Recommended reuse boundaries

Keep the new app in a separate package with its own route, state namespace, test fixtures and isolated paper database during development. Proposed path: `apps/trader-terminal/` in the actual application repository. Confirm parent and nested AGENTS.md rules before implementation. Read-only source audit does not authorize overwriting the running desk.

Create `ChartAdapter`, `MarketDataAdapter`, `ExecutionAdapter`, `JournalAdapter` and migration interfaces. Use shared feature modules where ownership and tests are clear. Keep Python simulation initially behind an API if extracting it is safer than rewriting. Preserve existing runtime and imports until the new app passes acceptance.

Treat the original completed-bar simulation and the new quote/trade simulator as different execution models. Version and retain their historical results. Do not retroactively recompute old fills under new assumptions.

Copy neither secrets nor mutable runtime databases into the source package. Carry forward encrypted connector references and migrations through the intended runtime. Keep paper, replay, imported and broker-confirmed identities separate.

## Evidence quality

Current source supports the reuse recommendations; it does not establish working live streams, paper parity, authenticated exchange accounts or successful journal delivery today. Existing comments/screens may contain older claims. Each component must pass its new app acceptance tests before promotion.

Prior account/journal work identified gaps in buying-power, fees, partial exits, multiple brackets and time-in-force. Some current quant-lab code has evolved beyond that snapshot; the new backlog requests the complete behavior and requires fresh verification rather than treating every old gap as still absent.

## Upstream references

- [Vela source](https://github.com/LuxAlgo/Vela): upstream architecture and licensing reference; local source/build versions above are the reproducible audit anchors.
- [Workspace](https://docs.luxalgo.com/vela/user/workspace): candidate shell, state and synchronization surface.
- [Data providers](https://docs.luxalgo.com/vela/user/data-providers): provider contracts and separate venue behavior.
- [Scripting engines](https://docs.luxalgo.com/vela/user/scripting-engines): addon/worker integration and engine-specific license boundary.

These online references were checked during the draft. APIs still require validation against the pinned package, not an unpinned upstream main branch.
