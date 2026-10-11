# The Desk MVP acceptance

Build date: October 10, 2026, America/Los_Angeles. Expanded verification and fixes are recorded in [FEATURE-QA.md](FEATURE-QA.md); its results supersede the initial test counts below. Runtime validation may display October 11 UTC. The original 231-item full-platform requirements register remains proposed; this document records the implemented MVP subset separately.

## Automated evidence

- 18 engine behavioral tests pass.
- Two market-data fixture tests pass (incomplete aggregated bucket and response spanning a bar boundary).
- JavaScript syntax check passes.
- Opt-in integration against the original built Lux Journal runtime passes: 7 executions, 3 closed trades, exact fee and net-P&L reconciliation within floating-point tolerance, outage retention, restart/retry and receipt deduplication.
- The Desk rejects cross-origin mutations, untrusted Host headers and non-JSON mutation requests. Journal bridge rejects missing bearer tokens.

## Browser evidence

Exercised in the actual running app, not inferred from source:

- Hyperliquid BTC candles/volume render; Coinbase BTC chart switch loads correctly and carries qualified identity into the ticket.
- RSI added from Vela's native library and restored after reload.
- Four-chart grid selected, saved and restored after reload. A native horizontal line restores in the object tree. Named Coinbase RSI template saves and loads after reload.
- Created a separate virtual QA account; selection and balance restore.
- Market buy filled; partial close leaves the correct remaining quantity; full close records fees and a flat position.
- Existing embedded Lux Journal opens the selected QA account and displays the resulting closed trade, fees and net P&L.
- Coinbase limit with SL/TP accepted; chart shows all three correctly aligned levels and the manager's working order.
- Enter on a chart level opens the amendment review; confirmation changes the accepted limit to 82,100. Dragging a line opens a review with a changed proposed price. Cancellation removes working levels and releases reserved funds.
- DOM shows real bid/ask snapshots and spread.
- Replay start/step changes historical candles and disables current paper submissions; exit restores controls. A server above-price alert triggers once.
- SMA study renders completed-bar results and the execution table with the selected source.
- Desktop and mobile layout checked, including opening/closing the mobile order rail.

Native menus make additional drawing tools, chart types and settings available. Their entire catalog has not received exhaustive TradingView parity tests. Availability is not proof of numerical identity or feature-by-feature parity.

## Full-platform backlog boundary

The MVP fulfills the chart/trading workspace first slice of UI, MKT, CHT, DRW, IND, STA, ACC, ORD, SIM, DOM, ALT, RPL, STR and JRN requirements. Several requirements in those groups remain partial: full drawing/indicator numerical parity, complete exchange history, legacy migration, advanced alert expressions/notifications, historical trading execution and generic strategy scripts.

Remaining full-platform work includes general Pine strategy execution and compatibility validation, protected indicator entitlements, additional asset classes and data rights, all broker order semantics, venue-specific partial-fill/funding/liquidation models, screeners, community/publishing, news/calendars, mobile product depth, cloud collaboration, subscription tiers and the complete TradingView comparison audit. The native Pine indicator editor/runtime is documented in [PINE-INDICATORS.md](PINE-INDICATORS.md); these broader items remain in `docs/product-plan/` and are not silently marked complete by the MVP.

Private account routing and real-money execution remain outside this paper MVP. This repository explicitly requires paper/shadow trading until an approved and verified live integration exists.
