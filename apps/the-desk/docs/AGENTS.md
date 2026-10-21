# Agents

Open the robot **Agents** button in Trader to enter `/agents.html`. Trader keeps
its independent chart/account setup at `/`. Profiles, configuration, execution,
journal, performance and immutable versions remain available in the Agents dialog.

## Agent charts and independent runtime

Each agent has a stable, unique chart ID. The grid offers one/two/three columns,
filters and focus; each tile shows exactly one agent, published version, exact
source market/timeframe, runtime health and simulation results. Selecting a chart
opens its monitor. Hiding, filtering, leaving the page or switching Trader symbols
never changes the server's signal subscriptions or assigned account.

Candle histories come from server provider snapshots, not browser-origin candles.
Native Vela charts receive refreshed snapshots and all missed tail candles. Signal
levels, owned entries, stops, targets and working orders appear as overlays. These
are execution/analysis evidence; they are not broker-native market data.

The runner remains local: the computer and server must stay running, awake and
connected. Server restart pauses armed agents and retains protections/history;
review and arm explicitly. There is no always-on cloud deployment in this build.

## Create an agent

1. Click **Create agent**. Name/avatar/notes describe the strategy; notes do not
   execute as an LLM prompt.
2. Choose the exact supported chart/execution instrument (BTC/ETH/SOL on
   Hyperliquid or Coinbase reference feeds), strategy modules and risk limits.
   Simulation requires the exact chart instrument; no perp-to-spot conversion.
3. Enter virtual capital, commission and leverage. A new dedicated simulation
   account is created. Cloning provisions a new account/chart/journal, with no
   copied fills or performance.
4. Configure the owned chart timeframe/history and cyan signal levels. Optionally
   enable independent **Agentic - Liquidity** evaluation and its bounded settings.
5. Creation stores the chart, account, local journal identity and published v1 in
   one SQLite transaction, paused. The existing durable journal bridge queues its
   external account link separately. Once acknowledged, Journal offers a direct
   account-scoped link to Lux Journal. Stable creation IDs deduplicate retries.
6. Arm simulation explicitly. A line must establish an away-price baseline before
   a new observed touch. Arming or moving a line onto price never invents entry.

New dedicated accounts reject manual trading/reset/delete commands and are hidden
from Trader's manual-account selector. Agent cancel/flatten controls act only on
owned execution. The last manual account cannot be deleted. Existing shared
profiles retain their history and show **setup-required**; clone into a new
account rather than silently moving funds or reassigning positions.

## Drafts, publication and versions

Configure saves an unpublished draft. The running published version is unchanged,
even if armed. Concurrent stale draft or published-version edits are rejected.
**Versions → Validate & publish paused** requires no open owned positions or
working entries, creates the next immutable version and pauses it. Account,
chart and journal identities remain stable. Copying an old version creates a
new draft for review; it never rewrites or reassigns historical outcomes.

Pan, zoom and chart styling are visual. Changing published levels, instrument,
signal timeframe or modules requires a draft. **Cyan level** on a tile, or drawing
a horizontal line, opens a draft-level form; publication is separate. Generated
Liquidity pools change as recorded runtime observations from pinned code/inputs,
not as a new strategy version each tick.

## Signal/data service

Manual cyan levels are persisted in published configuration. They require fresh
server bid/ask; no browser heartbeat is required. The one-second strategy worker
uses observed quote midpoints and executable bid/ask, not historical replay.
Gaps across a level are not counted as a touch. One attempt per source per arm
session includes blocked decisions. Pause/rearm creates a new session.

Independent Liquidity uses the installed `agentic-liquidity.pine` with its hash
and default enabled source frames pinned, Clean view, and explicit pivot/history
settings. A bounded Node subprocess uses the same compatibility/Pine engine as
the chart, with supplied server histories only. It has no network/tool interface
or user-script execution. Jobs share provider history caches, not indicator state.
A fresh verified instrument tick is required; default tick sizes are never inferred.
Provider contract metadata expires after five minutes and is re-fetched; fresh
quotes cannot renew the age of cached contract details.
Freshness uses the oldest input snapshot timestamp; missing/stale/failed inputs
block entries. Source hash changes require reviewed publication.

The scheduler runs up to three input jobs concurrently, refreshing due agents at
least 15 seconds apart; large fleets and slow provider requests increase latency.
Liquidity input snapshots expire after 45 seconds. This is sampled local
simulation, not an exchange tick-complete detector; brief touches can be missed.
Public provider depth/history/rate limits apply. Each chart shows coverage/errors
rather than fabricating candles or treating unavailable data as zero.

## Controls, journal and results

Pause stops new entries; working orders and owned-position supervision remain.
**Stop & cancel owned orders** additionally cancels entries. **Flatten owned
simulation** also closes owned positions with fresh executable quotes. Fleet
limits cap armed count, total agent exposure, and daily realized plus negative
open P&L; per-agent limits also apply. Lowering limits never silently liquidates.

Runs retain exact configuration/version, level, independent chart identity,
source timestamps/hash, per-timeframe input cutoffs and calculation request
coverage, verified tick metadata, quote, preview and order. Execution shows actual simulated
fills. Journal payloads retain agent/version/run/chart/journal provenance for
immediate and resting-limit entries and exits. Local decisions remain available
when external Lux delivery is pending/retrying. The UI never labels queued
external linking as connected. Real external journal acceptance is a separate
integration check; it was not exercised by synthetic fixture tests.

Performance is derived from owned fills and configured fees; no seed results.
Versions support attributed performance inspection. Realized drawdown measures
cumulative net realized fill outcomes, not intratrade/equity drawdown. Sequential
version returns are not a controlled comparison: capital/time/exposure differ.
Full JSON exports include all runs/events; interactive history shows latest 200.

## Venue boundary

All six venue identities retain the common profile/capability contract. Simulation
is the only verified autonomous adapter. External Robinhood/Hyperliquid/Coinbase/
Binance/IBKR execution is unavailable. Existing manual Robinhood previews and
wallet/IBKR workspaces keep their own grants. This build does not create physical
broker accounts, hold private keys or infer execution authority from wallet login.

## Focused verification

```sh
python3 -B -m unittest discover -s tests -p 'test_agent*.py'
python3 -B -m unittest discover -s tests -p test_engine.py
python3 -B -m unittest discover -s tests -p test_robinhood_workspace.py
node --test tests/test_agent_workbench_model.mjs tests/test_agents_model.mjs \
  tests/test_agents_chart.mjs tests/test_agents_liquidity_bridge.mjs \
  tests/test_agentic_host.mjs tests/test_pine_refresh.mjs \
  tests/test_trading_model.mjs tests/test_account_context.mjs \
  tests/test_chart_menu_actions.mjs
```

`test_agent_signals.py` executes the exact installed Pine source with bounded
synthetic multi-frame candles and no network. Fixture browser acceptance refuses
origins except port 18891 and requires the explicit synthetic health marker:

```sh
python3 -B tests/launch_agent_workbench_fixture.py --port 18891 \
  --data-dir /tmp/agents-workbench-fixture
```

Open `/agents.html`, pass `verify_agent_workbench_browser.js` to browser eval,
then `verify_agent_workbench_background.js` after it switches to Trader. This
checks actual creation forms, two native charts, isolated draft/publication,
owned accounts, background entry/exit, provenance and measured performance.
The prior browser-heartbeat fixture has been replaced by this workspace fixture.
The legacy chart-context endpoint is retained for compatibility, but Trader no
longer publishes execution inputs and it cannot redirect independent agents.
