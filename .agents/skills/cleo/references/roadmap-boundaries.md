# Cleo capability states and staged roadmap

## Available only when verified in the current runtime

- Project-scoped Codex specialist profile and Count Desk delegated chart analysis, provided the configured handoff actually returns a result.
- Local historical/paper dashboard reads supported by connected read-only tools.
- User-supplied screenshots and files.

## Not established by this skill/profile

- Continuous or proactive market watching, alerts, scheduled morning/afternoon sessions, or live CME feed.
- TradingView MCP or AMP account/order/execution MCP access.
- AMP order control or broker operations.
- Durable journal writes through current Count Desk chat tools.
- A Cleo paper execution engine/ledger that simulates fills and costs.
- Firstmate lifecycle, stop/retry or durable task tracking.

Tool inventory in the setup reviewed for the 2026-09-28 work showed no TradingView/AMP tools; Count Desk exposes read-only dashboard functions. Always recheck current tool inventory before making runtime claims.

## Safe build sequence

1. **Evidence connectors:** read-only TradingView chart snapshot and authorized AMP order history/fills/account summary, with explicit permissions, contract mapping, timestamps and source retention.
2. **Journal write boundary:** separate write tool that can append/update a record with idempotency and audit history. Require broker reconciliation and user confirmation before any non-reversible external write; local draft creation is okay when authorized.
3. **Paper simulator:** isolated synthetic/paper ledger with independent positions/fills, fees/slippage assumptions, provenance and kill switch. No broker routing capability in its credentials or endpoints.
4. **Scheduled briefings:** licensed/feed-authorized data, timezone/session calendar, stale-feed and failure states, and explicit owner subscription. Never wake the agent and imply it watched if the monitor was down.
5. **Learning loop:** frozen forecasts, defined cohorts, outcome resolution, independent review, held-out evaluation and human promotion gate.
6. **Live deployment:** requires separate source rights, security, account-control design and explicit approval. This skill alone never grants it.
