# The Desk feature verification

Validation date: October 10, 2026, America/Los_Angeles (October 11 UTC). Scope: the implemented paper MVP and reused Vela/Lux Journal surfaces. Full TradingView parity is still the separate 231-requirement product backlog.

## Result

The main paper workflows passed after fixing two buying-power defects and launcher ownership/QA isolation defects. This is a qualified MVP result, not exhaustive numerical or TradingView compatibility certification. No real-money orders were submitted. All mutation tests used isolated `qa-data/` and a separate Lux Journal database; the main account/history were preserved.

| Automated checks | Result |
|---|---|
| The Desk Python suite | 42 passed: 30 engine, 2 market fixtures, 6 HTTP, 3 launcher and 1 actual journal integration |
| SMA study behavioral suite | 6 passed, including next-open timing, fees, open exposure, realized drawdown, invalid inputs and insufficient bars |
| JavaScript syntax / Git whitespace | Passed |
| Public history checks | 54 passed: 6 instruments × 9 intervals, ordered timestamps, valid OHLCV, completed-bar cutoff; no gaps in the sampled responses |
| Existing Lux Journal suite | 532 passed across 53 files |
| Existing Vela suite | 1,849 passed; 2 inherited failures in 2 files (149 files passed) |

The Vela failures are `classic-indicators.test.ts` (WaveTrend short-title fixture mapping) and `color-literals.test.ts` (WaveTrend palette hex literals). The nested source checkout was clean, and The Desk did not modify it. These remain unresolved; the chart dependency suite is not fully green.

## Browser workflow coverage

Actual browser interactions used The Desk on `http://127.0.0.1:18881/` and isolated Lux Journal on port 3102. The default user app remains on port 18880, with its journal on port 3000.

| Feature | Observed result and coverage boundary |
|---|---|
| Six supported markets | BTC/ETH/SOL on Coinbase spot and Hyperliquid perpetuals each loaded the corresponding qualified chart/ticket. Public server books showed bid/ask, source and quote age. |
| Chart types | Candles, Bars, Line, Area, Baseline and Heikin Ashi selected successfully. Numerical equivalence of transformed bars was not independently audited. |
| Intervals | All 8 configured interval controls changed the selected chart interval. The server history sampler also covered 2h, for 9 API intervals total. Provider-bounded history is not a complete archive guarantee. |
| Indicators | All 77 entries in the native picker were added and removed successfully. Volume rendered; RSI values appeared in the data window. RSI length changed from 14 to 9, confirmed, and restored after reload; Cancel discarded a proposed change to 12. This is lifecycle coverage, not a numerical audit of 77 indicators. |
| Drawings | All 76 tools in 7 native groups were created and observed in the object tree, then undone. Text required typing and leaving edit mode; the completed annotation appeared in the object tree. Geometry and numerical TradingView parity were not independently proved. |
| Data window / object tree | OHLC/time, Volume and RSI readings displayed; created objects appeared. Existing horizontal line and text restored after reload. Every object grouping, stacking, locking and styling combination was not exercised. |
| Chart settings | All 5 sections opened; 23 boolean settings toggled and restored. Every color, spacing, scale and timezone combination was not tested. |
| Layout | All 16 grid sizes from 1×1 to 4×4 yielded the correct chart count. Symbol, interval, crosshair and style synchronization controls toggled. Propagation across every cell and drawings is not exhaustively verified. Earlier MVP acceptance checked four-chart save/reload restoration. |
| Templates / theme | Named template saved and remained available after reload. Light theme saved/restored; dark theme restored. Account selection persisted across reload and server restart. |
| Account management | Separate QA account created with virtual capital and fee settings; switching to the default account showed a separate order ledger. |
| Sizing | Units, USD notional, percent balance and risk USD produced corresponding quantities/cost/risk estimates. Engine rejects invalid quantities, precision, stale quotes and insufficient funds. |
| Order entry | Market, limit, stop market and stop limit accepted through the ticket. SL/TP and timed TIF fields exercised. Deterministic engine tests prove matching, triggering, expiry and rejection paths. |
| Chart trader | Working entry/SL/TP levels aligned to the native price pane. Enter opened review; confirmed 82,000→82,100. Drag proposed 82,557 and confirmation updated the manager/line. Cancellation removed levels and released reserve. |
| Positions | Market entry, protection update, partial close, reversal and full close yielded the expected quantities and a flat final state. Executions and event history displayed. |
| Export | Downloaded account JSON contained the five execution legs and account-scoped ledger, orders and positions. Native chart PNG export could not be confirmed: browser download event timed out. |
| DOM | 10 bids/10 asks and spread displayed; clicking a level staged a limit price. Center refresh and discard worked. This is public snapshot depth, not tick-level execution. |
| Alerts | Server above-price alert triggered once and displayed in the manager. Below-price, deletion and once-only boundary checked by engine tests. Native Vela alert panel opened; advanced expressions/notifications are not built. |
| Replay | Start, step, play, pause and exit worked; paper submission controls disabled during replay and re-enabled on exit. Accepted server orders remain current-market orders; replay has no historical paper ledger. |
| Strategy Tester | Completed-bar SMA study returned source, cutoff, coverage and trade results. Deterministic tests check its timing and accounting. Generic scripts and multi-strategy engines are not built. |
| Journal integration | Embedded original journal selected the correct QA account and showed the two reconstructed closed trades, fees and net P&L. Refresh/retry worked. Integration suite reconciled 7 execution events/3 closed trades and tested outages, restart, lost acknowledgment deduplication and authorization boundaries. |
| Journal pages | Dashboard, Calendar, Daily Journal, Trades, Reports, Prop Firms, Notebook, Playbooks, Progress, Missed Trades, Import, Accounts and Settings rendered. A note and a playbook were created, saved and found after reload. Every legacy import format, attachment, private connector and report formula was not manually tested; its existing 532-test suite passed. |
| Responsive UI | Mobile 390×844 chart checked; trade rail closed and reopened with ticket visible. Temporary viewport override reset. Desktop chart/order/journal views captured. |
| Restart / service ownership | QA server and owned Next journal stopped, both ports closed, then restarted with account/chart/RSI state preserved. Fingerprints protect against PID reuse; main journal is reused and preserved. No OS-level startup/sleep/recovery service exists yet. |

## Defects fixed

1. A market order that only reduces exposure could fail when buying power was zero because its commission was treated as required new margin. Exits now remain available and charge their fee to the execution ledger. The regression failed before the change and passed afterward.
2. A Coinbase spot order amendment could borrow the perpetual leverage setting and accept an unaffordable price increase. Amendments now use 1× spot margin and include incremental commission. The regression failed before the change and passed afterward.
3. Next changes its process title after launch, so an owned QA journal could survive `--stop`. Recorded process-start fingerprints now allow the owned process group to stop while rejecting reused PIDs.
4. QA could silently reuse an unrelated journal on an occupied port, causing the wrong database/token to be tested. QA now refuses the occupied journal port. The integration test accepts `QA_JOURNAL_PORT` instead of hardcoding a stale runtime.

## Remaining work

For a stronger paper MVP release, the next build should resolve the two inherited Vela checks, add repeatable browser regression automation, verify synchronization behavior and chart PNG export, audit indicator/drawing values and defaults, improve accessible manager expansion state, and add an OS-managed worker with restart/sleep recovery and operational visibility. Native chart alert UI also needs a single clear relationship with server alerts. Context-menu variants, quick-range controls and the full matrix of drawing/settings combinations remain additional acceptance work.

For the requested full TradingView experience, the product backlog still includes:

- Pine-compatible editor/runtime and general strategy execution, with historical paper replay accounts and order simulation.
- Advanced alert conditions and delivery channels, cloud accounts/layouts, collaboration and reliable notification workers.
- Broader assets and entitled historical/realtime data, screeners, news/economic calendars, community publishing and subscriptions.
- Exchange-specific partial fills, queue/slippage, funding, fee tiers, liquidation and all broker order semantics.
- Comprehensive TradingView visual/numerical compatibility audit, mobile product depth and protected-indicator entitlements.

Real Coinbase/Hyperliquid account routing and real-money execution require a separately approved integration. Public market connections are working; they are not private venue execution connections.

## Reproduce

```sh
python3 launch.py --qa --port 18881 --journal-port 3102 --detach
DESK_QA_HTTP=1 QA_JOURNAL_PORT=3102 python3 -m unittest discover -s tests -v
node --test tests/test_sma.mjs
node --check web/app.js
python3 launch.py --qa --stop
```

Use a free isolated journal port. Repeat browser mutation checks in QA, not the main journal. QA logs, bridge tokens, databases and generated exports are ignored and are not release artifacts. Screenshots and a duplicate report live in the MYM chart evidence workspace under `Charts/Reference/TheDesk/` and `Charts/Analysis/MTF/`.

## Final runtime and review-gate status

The tested fixes were committed locally as `9ac1e51`. The main Desk process was restarted to load them. The original journal was found stopped during the final check and restarted by the launcher. Final health checks: Desk 18880 HTTP 200, `mode=paper`, journal available; original journal 3000 HTTP 200; six market quotes present. The main paper account remains at 100,000 with zero orders, positions and fills. Isolated QA ports 18881 and 3102 were stopped and confirmed closed.

The no-mistakes local review/test/document/lint gate was attempted with rebase/push/PR/CI excluded. Both attempts failed before creating a run: the daemon execution-context classification did not reply within 30 seconds. Doctor reported a running daemon and runnable Codex, but `axi status` still showed zero runs. No automated-review approval, remote CI, push or PR is claimed. The directly executed tests and browser evidence above remain valid. This review tooling failure should be resolved before a formal release.
