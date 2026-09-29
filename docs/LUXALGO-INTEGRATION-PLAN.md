# LuxAlgo open-source integration boundary

Count Desk will use the LuxAlgo repositories as isolated, reviewable building
blocks. Forks were created under the authenticated `mcel805` GitHub account on
2026-09-28. The forks remain separate repositories so upstream updates,
license notices, and security fixes can be tracked without copying code into
the Python dashboard blindly.

## Fork inventory

| Fork | Upstream role | License boundary | Count Desk treatment |
| --- | --- | --- | --- |
| [Vela](https://github.com/mcel805/Vela) | Browser chart engine | Apache-2.0; preserve `NOTICE` and visible attribution required by the upstream notice | Replace the current chart renderer after a standalone Vela smoke test |
| [Vela-pinets](https://github.com/mcel805/Vela-pinets) | PineTS-to-Vela bridge | AGPL-3.0 | Optional isolated chart plugin; do not link into the core app until copyleft distribution obligations are accepted |
| [PineTS](https://github.com/mcel805/PineTS) | Pine Script-compatible runtime | AGPL-3.0 | Separate worker or user-run package; no server-side indicator execution in the first Count Desk release |
| [pinets-cli](https://github.com/mcel805/pinets-cli) | CLI wrapper for PineTS | AGPL-3.0 | Developer tool only until the PineTS boundary is decided |
| [luxalgo-mcp-server](https://github.com/mcel805/luxalgo-mcp-server) | Library, journal, broker, edge, tracker, and simulator MCP tools | MIT; local broker tools keep user keys local | Run as a local MCP sidecar and expose only read-only tools to Cleo/Batty |
| [broker-sdk](https://github.com/mcel805/broker-sdk) | Normalized broker account, position, and trade history | MIT; read-only root surface | Add a local broker adapter; no order placement or account control |
| [trade-journal](https://github.com/mcel805/trade-journal) | SQLite journal, round trips, P&L, notes, Edge Score | MIT; self-hosted | Run as a local service or import its core package behind a Count Desk journal adapter |
| [edge-stats](https://github.com/mcel805/edge-stats) | Historical conditional-frequency engine | MIT code; bundled data is CC BY 4.0 | Run against authorized bars and paper trades; preserve N, Wilson 95% CI, sample guards, and provenance |
| [prop-firm-sim](https://github.com/mcel805/prop-firm-sim) | Deterministic challenge simulation | MIT | Optional read-only research module; never present simulation as a live account or forecast |
| [market-trackers](https://github.com/mcel805/market-trackers) | Public-record ingestion and tracker MCP | MIT; source records retain primary links | Optional research sidecar; do not mix public records with market-data authority |
| [market-trackers-data](https://github.com/mcel805/market-trackers-data) | Daily tracker data dumps | CC0 data, with source attribution and provenance | Consume selectively; do not vendor the full dump into Count Desk |
| [whale-options](https://github.com/mcel805/whale-options) | Options-flow engine | MIT; requires an authorized options feed | Quarantine until a source, rights, and paper replay fixture exist |
| [trade-relay](https://github.com/mcel805/trade-relay) | Alert-to-broker execution relay | MIT, but execution-capable | Fork retained for research only; disabled from Count Desk until a separate live-trading authorization and risk review |

The `LuxAlgo/cla-signatures` repository was not forked because it has no clear
open-source license in its repository metadata. It is not a runtime dependency.

## Integration order

### Current checkpoint

The Vela fork is cloned under `integrations/vela/`, builds successfully, and
passes its upstream test suite. Count Desk now exposes a **Vela Preview** tab
that feeds its stored bars into Vela offline with timestamp conversion and
visible attribution. This is an isolated renderer checkpoint; the existing
Lightweight Charts renderer remains active until Count Desk overlays, Cleo
context, drawings, and paper-state interactions have a renderer-neutral
mapping.

1. **Chart boundary:** run the forked Vela demo independently, then port the
   Count Desk `DataProvider` contract and the existing delayed Tickstream quote
   provenance into a Vela adapter. Keep the current chart available as a
   rollback path until the Vela screen passes visual and data checks.
2. **Local MCP boundary:** run the forked MCP server through stdio. Add a
   narrow Cleo tool allowlist for library lookups, journal reads, Edge Stats
   reads, and public tracker reads. Do not enable broker writes or execution
   relay tools.
3. **Journal boundary:** choose the journal core/service integration after a
   schema mapping from Count Desk's existing `paper_trades`, `trade_journal`,
   and account tables. Import/export must retain source, account, fill, and
   paper/shadow status.
4. **Statistics boundary:** feed Edge Stats only bars and paper/shadow fills
   whose source and rights are recorded. Reports must retain sample size,
   confidence interval, stability, and small-sample warnings.
5. **Broker boundary:** install `@luxalgo/broker-sdk` in the local adapter
   workspace, configure credentials only through the local environment, and
   expose read-only account and trade imports. Do not connect it to order
   routing.
6. **Optional research modules:** add Prop Firm Sim, Market Trackers, and
   Whale Options behind separate routes with explicit `SYNTHETIC`, `PUBLIC
   RECORD`, or `PAPER` labels. Trade Relay stays disabled.
7. **Base boundary:** use Base wallet identity and later payment/provenance
   contracts around the application. Base does not grant market-data or broker
   rights, so those remain independent gates.

## Build rules

- Keep each fork pinned to an upstream commit in an integration manifest before
  changing the source.
- Preserve Apache `NOTICE`, MIT notices, AGPL source-offer obligations where
  applicable, and all trademark restrictions. Fork code may be renamed; LuxAlgo
  and Vela marks must remain factual attribution, never Count Desk branding.
- Never pass broker credentials through the browser, Cleo prompt, hosted MCP,
  or Base. Keep them in the local adapter process.
- No component may create, modify, or cancel live orders in the Count Desk
  application. All early work is historical, delayed, paper, or shadow-only.
- Do not claim an Edge Stats result is predictive. Every result must carry its
  source, time window, sample size, uncertainty, and freshness.
