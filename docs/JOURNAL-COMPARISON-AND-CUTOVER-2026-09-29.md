# Trading Journal comparison and LuxAlgo cutover

**Decision:** use the pinned, self-hosted LuxAlgo Trade Journal as the execution journal. Count Desk's old execution journal is archived, not deleted. This decision follows direct code inspection, 532 passing LuxAlgo source tests, a successful production build, and a live local dashboard/API check on 2026-09-29.

| Need | Count Desk former journal | LuxAlgo open-source Trade Journal |
| --- | --- | --- |
| Vela in trade views | No; Count Desk has a separate Vela chart preview. | Yes: `@luxalgo/vela` renders recorded-fill trade charts and optional historical candle replay. The default trade chart is a line through fill prices, not broker market candles. |
| Execution ledger | CSV fills, FIFO reconstruction, basic reviews; separate Robinhood MCP reported summaries and paper log. | Fill-first SQLite ledger, dedupe and corrections, broker sync, statement import, manual fills, FIFO/LIFO/weighted-average round trips, notes and reviews. |
| Analytics and review | Basic closed/open counts, win rate and P&L when multiplier is known. | Dashboard, calendar, reports, Edge Score, trade detail, daily journal, replay and estimated MAE/MFE when eligible market data is selected. |
| Account model | Teams, traders, broker accounts; useful attribution but no member authentication. | One journal account per broker/platform source; no built-in Count Desk team/member mapping. |
| Current connection | Two Robinhood MCP account links and three reported summaries; zero imported fills or reconstructed trades at audit. | Running locally with zero accounts; no broker credentials or migrated fills configured. |
| Automation | On-demand CSV and Robinhood MCP snapshot import; no scheduler. | Manual broker sync endpoint and `autoSync` account flag exist in source, but no verified background scheduler or three daily reconciliations. |
| Gaps for Mark's pilot | Cannot certify fills/fees from current Robinhood summaries. | No verified AMP/CQG connector or complete approved account source; Clipper and Count Desk read bridge still need implementation. |

## Cutover state

- `http://127.0.0.1:3000/` is the chosen local journal. `Open Batty Count Desk.command` starts it, installing/building the pinned source on first launch if needed.
- `http://127.0.0.1:8770/trade-journal.html` redirects to LuxAlgo. Old Count Desk journal writes and its former read endpoint return HTTP 410; `GET /api/legacy-trade-journal` is local-only and read-only for migration review.
- The pre-cutover Count Desk SQLite database was backed up privately as `count-dashboard/data/batty-counts-pre-lux-journal-cutover-20260929.sqlite3`. The original database and archived UI source remain on disk. No broker summaries were reclassified as execution fills.
- Count Desk's chart plans and chart paper simulator are research records outside the LuxAlgo broker execution ledger. LuxAlgo's journal currently has no Count Desk agent read bridge and no Clipper schedule.

## Next integration work

1. Enroll one approved account with a complete read-only execution/statement source, including fill IDs, times, quantities, fees, positions, cash activity and contract specs.
2. Map archived Count Desk account labels and any future agent paper ledgers to LuxAlgo account IDs without double counting. Preserve raw evidence and source hashes.
3. Build Clipper's three-pass scheduler, reconciliation receipts and exception view against the canonical LuxAlgo ledger. A green state requires complete source coverage at a declared cutoff.

**Evidence:** `integrations/open-source/trade-journal/apps/web/package.json`; `src/components/trade-chart.tsx`; `src/components/trade-market-data.tsx`; `src/server/sync.ts`; `count-dashboard/server.py`; `count-dashboard/README.md`.
