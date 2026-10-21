# Agents — product requirements and implementation plan

## Outcome

A dashboard robot button opens **Agents**, the venue-independent home for agent
profiles, modular rules, account assignments, line signals, runs, performance,
positions, orders and audit history. Robinhood remains an account connection;
the global Agents workspace replaces its Agent Studio entry point.

## Requirements and acceptance

1. Visual profile cards: identity/avatar, description, version, state, mode,
   account/venue, signal/entry/exit/risk modules, last activity, actual attributed
   simulated P&L, fees, wins/losses, positions/orders, runs and blocked reasons.
   No invented performance, scores or win rates before closed trades exist.
2. Durable local versioned configurations, clone/archive, explicit arm/pause,
   global stop, immutable run snapshots and full JSON export. Saves and server
   restarts pause agents. Concurrent stale edits are rejected.
3. Modules: cyan horizontal/manual line and verified Liquidity indicator level
   sources; observed price touches; fixed/approach side; market-on-touch or
   limit-at-level entries; fixed-bps stop and reward/risk targets; order expiry,
   maximum holding time; fixed units; per-order notional/risk, daily loss,
   total exposure, spread/quote age, concurrent trades, daily trades/cooldown.
4. Universal account-adapter contract: simulation, Robinhood, Hyperliquid,
   Coinbase, Binance and IBKR share account identity, execution instrument,
   capabilities, preview, submit, cancel and reconciliation boundaries. Data
   source and execution account are independent and never silently remapped.
   Only the existing verified paper engine may execute unattended in this build.
   Existing Robinhood previews and wallet-signed Hyperliquid actions retain
   their separate authorization. Unimplemented live adapters remain unavailable.
5. Create **Test Agent**, with a dedicated zero-history $10,000 simulation
   account, liquidity/cyan touch signal, fixed units, protective exit module,
   conservative configurable limits and paused state. No seed trades or P&L.
6. Chart bridge publishes exact active-chart identity/timeframe and permitted
   level IDs/prices/source timestamps. Manual cyan hlines are accepted; diagonal,
   hidden/deleted, other-symbol, replay and unknown-color drawings are excluded.
   Liquidity levels come from the actual installed indicator output, with
   source instance identity. No generic colored study line is inferred liquidity.
7. A local worker monitors only armed paper agents. Fresh server quotes and
   fresh chart heartbeat are mandatory. No history/replay retroactive touches;
   touching at arm is not an entry. Each captured line fires at most once per
   arm session, with cooldowns and durable deduplication. A moved line establishes
   a new baseline rather than triggering from the move.
8. Paper orders use existing engine matching/commissions/protections. Runs and
   order creation commit atomically in the same database. A crash cannot create
   an untracked duplicate. Only agent-owned orders/positions can be stopped or
   closed through Agents controls. Pause stops new entries; protections remain.
   Stop & cancel cancels working agent orders; flatten is a separate explicit
   simulation action. Existing account activity is not assigned to an agent.
9. Run detail retains immutable configuration/revision, level provenance,
   chart identity, quote timestamps, sizing/risk decision and actual order/fill
   links. Performance is derived from attributed engine fills, with realized,
   unrealized, fees and open risk separated. No live performance claims.
10. Account/venue matrix, searchable cards, filter/state tabs, modular editor,
    activity timeline, runs table/detail, levels, execution ledger, performance,
    adapter status, responsive desktop/mobile, accessible labels and empty states.

## Build sequence

1. Adapter/module contracts, SQLite agent/revision/run/event/level tables.
2. Deterministic touch policy and paper order worker with risk/deduplication.
3. Robot launcher, profile cards and detailed agent workspace/editor.
4. Active-chart drawing/Liquidity bridge and line creation controls.
5. Isolated automated checks and synthetic browser smoke; user acceptance next.

## Delivery boundary

The application is a local single-user Desk. Requests require loopback and
same-origin mutation checks. No external credentials are added or logged.
The runtime is deterministic, not an LLM deciding trades. An LLM strategist can
be plugged into the signal/proposal contract later without bypassing risk or
adapter capabilities. Live venue acceptance requires each venue's account,
credentials, permissions, instrument contract and execution/recovery evidence.

## Independent agent workspaces — subsequent implementation

- `/agents.html` is a dedicated chart layout; Trader remains `/`. A permanent
  chart ID belongs to exactly one agent. Layout visibility never controls runtime.
- New simulation creation atomically provisions chart configuration, a dedicated
  engine account, journal identity, first published version, and queued external
  account event. Stable creation keys deduplicate retries. No copied performance.
- Dedicated agent accounts are excluded from manual account selection and reject
  manual engine commands, destructive account resets and deletion. Keep at least
  one manual account. Legacy shared accounts require explicit clone/migration.
- Signals come from published per-agent manual levels and a trusted installed
  Liquidity source computed by bounded server Node jobs. The source hash and
  settings are pinned. Browser heartbeat/replay/symbol changes cannot redirect it.
- Draft saves are optimistic and leave published execution untouched. Publish
  requires flat owned execution and no working entries, creates an immutable
  version, and pauses. Account/journal identity and historical versions remain.
- Journal fill payloads carry agent, published version, run and chart IDs for
  immediate entries, delayed entries, protective/manual-owned exits. Local journal
  health and external queued/retrying/synced delivery are separate.
- Fleet limits gate armed count, total agent exposure and daily realized + open
  loss. Per-agent limits and venue capabilities still apply.
- Charts display server history and published signal/owned-execution overlays.
  Panning/zooming is visual only. Cyan drawing or line entry creates a draft.
  Published symbol/timeframe changes go through draft publication.
