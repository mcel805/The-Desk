# Clipper and the automated trading journal — design checkpoint

**Checked:** 2026-09-29, local Count Desk at `127.0.0.1:8770` and self-hosted LuxAlgo Trade Journal at `127.0.0.1:3000`. This remains an automation design; Clipper is not scheduled.

## What is built

| Surface | Evidence | State |
| --- | --- | --- |
| Count Desk Trading Journal | `count-dashboard/server.py`, `web/trade-journal.html`, `README.md` | Running local SQLite journal with team/account attribution, CSV execution preview/import, FIFO reconstruction, reviews, a separate manual paper log, and on-demand Robinhood MCP summary import. |
| Current local data | Read-only `GET /api/trade-journal` at audit time | 2 linked Robinhood MCP account records, 2 snapshot links last synced 2026-09-27 03:41:59 UTC, 3 broker-reported trade summaries; 0 execution fills, 0 CSV batches, 0 reconstructed closed trades, 0 paper trades. Account identity and private records are intentionally omitted here. |
| LuxAlgo open-source Trade Journal | `integrations/open-source/UPSTREAMS.md`, vendored `trade-journal/` | Pinned MIT source snapshot. Its self-hosted app builds, passed 532 tests, and is running locally on port 3000. It includes Vela trade charts and optional candle replay. Its account ledger is currently empty; no Count Desk data bridge exists. |
| LuxAlgo MCP and broker SDK | `GET /api/integrations/luxalgo`, `server.py:LUXALGO_MCP_TOOLS` | Local MCP binary and broker catalog present; Cleo MCP disabled in this session; journal MCP tools excluded; no configured credentials reported; no live execution or account writes. Hosted journal MCP tools require LuxAlgo sign-in and are separate from the self-hosted app. |
| Clipper | `agents/intellect/clipper.md`, Count Desk workflow seat | Role contract and visible proposed seat added. No dispatcher, schedule, account connector, audit receipt store, or verified run yet. |

The Count Desk journal and the self-hosted LuxAlgo journal are **two separate SQLite systems today**. The user selected LuxAlgo as the canonical execution journal after Vela integration was verified. Count Desk's old execution UI and write API were archived; its private records remain for reviewed migration. The Count Desk Robinhood summaries are not fill-level records, so they cannot establish full trade, fee, position, or account-statistic accuracy.

## Recommended integration choice

Use the **self-hosted LuxAlgo Trade Journal as the canonical execution ledger** and keep Count Desk as the workspace entry point and future account-scoped audit view. Build one local adapter with versioned mappings between Count Desk account IDs, agent/paper ledger IDs, and LuxAlgo journal account IDs. Migrate and compare records in shadow mode first. Avoid dual writes: a single authoritative fill ledger is easier to audit.

The hosted LuxAlgo MCP journal tools are not the local bridge. The local self-hosted app's API or its core/importer packages should be used through a Count Desk-owned adapter. The adapter must pin upstream commit/version and preserve provenance, account ID, source trade/fill ID, raw payload hash, time zone, currency, fees, multiplier, and paper/shadow/live classification. The Count Desk `trade_journal` table for chart plans is a separate research ledger, not a broker execution table.

## Proposed data flow

1. **Registry:** Firstmate approves a finite set of accounts and trading-agent ledgers. Each entry names its source type, account owner, time zone, currency, retention and data rights, expected coverage, and connector state. An unlisted account is a coverage exception, not a silent omission.
2. **Read-only intake:** Native broker connector where supported; approved statement/CSV when the broker API is unavailable; existing Robinhood MCP summaries only as a limited secondary source. Keep credential handling local to the adapter. For AMP/CQG, first verify a sanctioned read-only execution/statement source; do not assume the LuxAlgo broker catalog supports it.
3. **Raw evidence:** Append source snapshots/import files, source hashes, source and received timestamps, pagination/window cursors, and rejection details to a private local store. Preserve originals; corrections are additive revisions.
4. **Normalize:** Map executions and cash events to account identity. Separate orders from fills, partials from completed positions, broker records from simulated records, and source facts from derived trades. Deduplicate on stable source IDs plus account; flag conflicting reused IDs and incomplete pagination.
5. **Canonical journal:** Write only verified normalized fills through the local adapter. Rebuild round trips with a frozen lot method and contract specs. Preserve annotations across rebuilds. Never synthesize fees, multipliers, or timestamps.
6. **Audit:** Clipper independently compares source totals and record sets with the canonical journal for the same account/window/cutoff. It checks open quantity, fees, realized P&L, cash movements, balance/equity when supplied, and supported metric inputs. It produces immutable receipts and exceptions.
7. **Presentation:** Count Desk shows coverage status per account and agent, most recent source cutoff, last three pass receipts, unresolved differences, and stats only at their supported precision. Cleo reads verified facts for review; chart hypotheses stay separate.

## Three passes each day

Propose morning, midday, and post-session checks in `America/Los_Angeles`, with exact times configurable per account and exchange/session. A scheduler must work while the browser is closed. Each run records a unique account + scheduled-window ID, acquires a lock, resumes from a durable cursor with overlap, retries transient failures, and performs a rolling backfill for late fees or corrected fills. A failed or missed run cannot inherit yesterday's green status.

The first pass discovers overnight changes; the second checks intraday fills and open positions; the third reconciles the session and flags delayed statements for follow-up. Markets and brokers have different statement finalization times, so the third pass may remain `partial` until final data arrives. All three passes include every enrolled account and paper/shadow ledger, even when the source reports zero activity.

### Receipt and status contract

One receipt per account or agent ledger per pass: scheduled time, started/completed time, source name and authority, account mapping, timezone/session window, source cutoff, raw snapshot/hash, source and journal fill counts, duplicate/rejection counts, open quantity comparison, fee and P&L comparison by currency, supported metrics, exceptions, retry count, and software/mapping version.

- `verified`: complete authoritative source coverage through cutoff and all required comparisons pass.
- `partial`: source is available but a necessary field, finalization, or comparison is missing.
- `stale`: source or prior successful audit is past its declared freshness limit.
- `blocked`: account identity, access, rights, or source integrity prevents safe reconciliation.
- `not_configured`: no approved source or schedule for the entry.

No global "100% accurate" badge is shown unless every enrolled account and ledger is `verified` at the same declared cutoff and the registry itself has been reviewed. A zero-activity day still needs a successful source response and source coverage proof.

## Build and acceptance sequence

1. **Inventory and freeze:** Confirm account and agent ledger roster, authoritative source per account, required statement fields, time zones, costs, lot method, and schedule windows. Export and back up both local databases before migration. Preserve all private data outside Git.
2. **Local journal service and adapter:** The pinned self-hosted LuxAlgo app is running and its account API responds. Verify its execution, metrics, and export APIs on isolated synthetic fixtures, then add a Count Desk data adapter without hosted LuxAlgo sign-in.
3. **Shadow migration:** Map existing Count Desk accounts, CSV fills, Robinhood summaries, paper trades, and chart plans into distinct categories. Reconcile counts and hashes; import only fills with sufficient identity/provenance. Keep ambiguous summaries out of execution metrics.
4. **Clipper runner:** Implement registry, scheduler, idempotent intake, reconciliation engine, receipts, alerts, and a read-only status API. Prove three scheduled passes on synthetic multi-account fixtures including no-trade, partial-fill, duplicate, late-fee, missing-source, and corrected-history cases.
5. **Pilot:** Enroll one approved account with a complete authoritative export/read-only feed. Compare each pass against source statements and manual spot checks across several sessions. Expand account by account only after no unexplained differences and reliable failure escalation.

## Decisions needed before runtime work

- Which account is the first pilot, and what sanctioned read-only source supplies complete fills, fees, positions, and cash activity? The current Robinhood MCP summary is insufficient for full reconciliation.
- What local times should the three checks run, and which session boundary does each account use?

## Source pointers

- Count Desk journal: `count-dashboard/README.md` Trading Journal and API sections; `count-dashboard/server.py` tables/import/FIFO logic; `count-dashboard/web/trade-journal.html`.
- Current integration boundary: `docs/LUXALGO-INTEGRATION-PLAN.md`; `integrations/open-source/UPSTREAMS.md`; `GET /api/integrations/luxalgo`.
- Vendored journal behavior: `integrations/open-source/trade-journal/README.md`; `apps/web/src/server/sync.ts`; `apps/web/src/app/api/accounts/[id]/actions/route.ts`.
