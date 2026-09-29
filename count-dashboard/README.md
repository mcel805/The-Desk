# Batty Count Dashboard

This is the first database-backed slice of the Batty multi-timeframe count system.

It provides:

- a durable local SQLite bar store;
- import of the repository's existing BTCUSD Daily, two-year MYM1 Daily, and MYM1 1H validation fixtures;
- deterministic MYM 4H aggregation from the seeded 1H source;
- first-class 1m, 2m, 3m, 5m, 15m, 30m, 1h, 4h, and Daily chart intervals, with larger
  intraday bars rebuilt from the smallest authorized native feed interval;
- cutoff-safe, cached count runs;
- a small API and chart dashboard; and
- run IDs, source snapshot hashes and algorithm versions for replay/audit.

The chart uses a locally vendored copy of TradingView Lightweight Charts 5.2.1.
It supports candlestick zoom and pan, Batty count markers, trend lines,
horizontal levels, rectangles, text notes, selection, deletion, undo and
per-symbol/per-timeframe SQLite drawing persistence. The chart also has
independent visibility toggles for price, count paths, confirmed swings,
volume profile, Fibonacci levels, convergence zones, projections and drawings,
plus an eraser tool for deleting a drawing directly from the chart.

### Chart paper terminal prototype

Count Desk keeps the chart and Cleo workspace clear. Open the **Paper Trading ·
SIM** tab to use the paper ticket; **Back to chart** returns to the primary
workspace. It is a local single-user simulator for the five listed micro
futures. It uses the current
stored chart bar, symbol, timeframe, and data source; the existing Count Desk
count, liquidity, Premium / Discount, Fibonacci, and drawing tools remain on
the chart.

To simulate, choose Long or Short and 1–100 micro contracts, optionally enter
paper stop and target prices, then queue the order. **Practice from 30 bars back**
moves the historical cutoff to create a replay window. A paper entry fills at
the **next stored bar's open only after a following bar confirms that bar is
complete**. The same rule applies to a queued exit. "Check next bar" and
"Check exit" re-evaluate stored data; newly ingested bars also advance queued
orders. The position records the fill bar, dataset, source, and gross P&L.
For an open position with a paper stop or target, **Check bracket** evaluates
one confirmed stored bar at a time. A stop and target touched in the same bar
resolve at the stop; a gap through either level fills at that bar's open. The
exit reason and source are recorded. Bracket checks are manual during historical
practice; they are **not live broker orders or an unattended execution service**.
Displayed P&L is gross and excludes fees and slippage. Historical or delayed
bars do not imply live prices or executable fills. Simulation records live in
the local SQLite store, separate from broker imports and the Trading Journal.
The Market data panel shows the configured Massive historical adapter and an
explicit AMP/CQG API-access-required state. No CQG session, account connection,
or live order route is present.

### Vela renderer preview

The **Vela Preview** tab is the first isolated integration checkpoint for the
forked `@luxalgo/vela` renderer. It loads the selected Count Desk bars from the
local store, converts Count Desk epoch-second timestamps to Vela epoch
milliseconds, and passes them as an offline dataset. The preview keeps Vela's
required attribution visible and labels the source, interval, bar count, and
range. It does not replace the production Count Desk renderer yet; the existing
Lightweight Charts surface remains the rollback path while the Vela indicator
registry and settings surface are built. Count overlays and drawings remain
optional follow-on work.

The chart also offers a separate, optional MTF Premium / Discount layer. Toggle
it beside Liquidity zones on the chart toolbar, choose a stored timeframe and swing length, and
adjust Premium, Equilibrium, Discount, highlight colors, and fill opacity. The
overlay uses only bars available by the chart cutoff; swings must be confirmed
by the selected right-side swing window before the active range is drawn. Its
settings and visibility choice are saved in this browser.

The Cleo briefing includes an **Ask Cleo in Count Desk** handoff. It carries the
selected Vela symbol and timeframe into the existing Batty chat context and
prefills a provisional structural-read request; it does not submit a trade or
claim live market access.

The chart controls sit in a collapsible **Tool bar**, closed by default to give
the chart more room. Its animated right-edge tab opens and closes the controls;
the tab defaults to yellow and its color is customizable. Configure which rows
close with the toolbar: all rows close by default, and unchecking a row keeps
that row visible while the rest are closed. The open state, row choices, and
tab color are saved in this browser.

The toolbar can save up to five named startup templates for chart layer and
Smart Hover visibility. Selecting a template applies it immediately and makes
it the startup choice for this browser. Manual visibility changes are marked
unsaved until the selected template is updated or the current setup is saved as
a new template. Saved templates can be updated or deleted; template settings
are stored in browser local storage.

Wave-label hover also includes Smart Support/Resistance and Smart Fibs. Both
are enabled by default and always anchor to the confirmed swing range selected
in Premium / Discount settings, even when the Premium / Discount fill is hidden.
Hovering a wave supplies direction; the preview shows the 50–61.8% and
61.8–78.6% retracement areas, colored 61.8% and 78.6% lines, and a cyan swing
support or resistance price. A nearby Fibonacci and support/resistance level
share a purple breathing highlight. Only those colored Fibonacci levels are
drawn; the 61.8% color and line width remain user-adjustable. These hover
previews remain structural research aids rather than predictions or validated
Elliott recommendations.

The right-hand inspector is tabbed to keep the chart readable while exposing
the Count Ledger, Next Subwaves, Wave Ratios, Auto Counts, Alternate Counts
and Wave Guide panels. These Insight panels are derived from the same
cutoff-scoped run as the chart and expose reward/risk, target, status, term
forecast, ratio-fit and degree-leadership diagnostics.

The wave-count engine is `structure-prototype-v0.3`. It detects confirmed swing
pivots at three scales and adds cutoff-safe structural analytics: a volume
profile (POC/value area), Fibonacci levels from the latest confirmed swing pair,
scored confluences, preferred/alternate provisional paths, and WaveBasis-inspired
Insight widgets. These overlays are research aids; Elliott family validation
and a production Daily-first parent-child count tree are still future engine
work.

## Intellect Elliott Wave team

The Count Desk has a compact Intellect ribbon for the Firstmate workflow seats:
Batty, CFO, Chief Scientist, Analyst, Cleo, Independent Reviewer,
Paper Trader, and Outcome / Method Review. Selecting a pixel portrait opens
the role responsibilities, handoff, and skill text. Role drafts live under
`../agents/intellect/`; the Cleo prompt lives at
`../agents/cleo/SYSTEM-PROMPT.md`. `web/agent-skills/` contains the
static browser copies shown by the local dashboard and should be refreshed when
those source files change.

The ribbon is a role and interface overview; selecting a portrait does not
dispatch an agent or create a Firstmate task. Batty's chat can delegate chart
interpretation to the project-scoped Codex Cleo. That local handoff
does not provide durable Firstmate lifecycle tracking. The supplied workflow's
pre-collection gate, per-market lab isolation, independent disposition,
paper-only simulation, and measured outcome review remain the intended loop.
No data should be collected for a lab before its written rights, human approval,
cost, and retention scope are recorded.

## Run

```sh
./count-dashboard/Open\ Batty\ Count\ Desk.command
```

Open <http://127.0.0.1:8770>.

### Trading Desk landing page and Base wallet sign-in

Open <http://127.0.0.1:8770/trading-landing.html> for the product landing page and links to Count Desk, Trading Journal, Liquidity Lab, and Resources. Workspace headers link back to this overview and expose a local logout control that clears the wallet session before returning home.

The landing page supports EIP-4361 Sign-In with Ethereum scoped to Base Mainnet (chain ID 8453). Wallet sign-in requests one short-lived nonce and verifies the wallet's message signature locally; it creates an eight-hour, HttpOnly local session cookie. Signing is off-chain: it sends no transaction, costs no gas, and never asks for a seed phrase or private key. Only externally owned accounts are supported by this preview; smart-contract wallet verification is not implemented.

This is local wallet identity, not access control: it does not gate dashboard APIs or associate an address with a Trading Journal member/account. The app remains bound to loopback, and its in-memory wallet sessions are cleared when the local server restarts. Remote/public use needs a TLS deployment, persistent/rotatable session storage, production domain configuration, and an explicit authorization model. The launcher creates `count-dashboard/.venv` and installs the pinned verifier dependency from `count-dashboard/requirements.txt` when needed.

### Batty chat with your ChatGPT subscription

The Batty composer uses the local Codex CLI signed in with ChatGPT. Sign in with
your ChatGPT account in Codex (`codex login` in Terminal if needed), then restart
the Count Desk. No API key is required: the local Count Desk invokes Codex, and
Codex sends the prompt to OpenAI under your signed-in ChatGPT account. Codex
uses your ChatGPT plan's access and limits; API key requests are billed
separately. Each reply runs in an ephemeral, read-only session rooted in this
project so its project-scoped custom agents can load. It does not load your
personal Codex configuration. The composer defaults to GPT-6 Luna at Medium
reasoning effort and also offers GPT-6 Sol and GPT-6 Astra. The model and effort
choice are saved in this browser.

Count Desk requests attach an initial read-only snapshot from the selected
chart. During a reply, Batty can also call bounded, read-only dashboard tools to
retrieve additional stored bars, drawings, level plans, Trading Journal records,
and Liquidity Lab research. Chart history is paged in windows so an entire
database is not copied into every prompt. Current-information requests can use
Codex's live web search and should include source links. This browser-to-chat
connection accepts requests only from loopback pages. Open the **Resources**
tab for the feature overview and a downloadable [Batty user guide](USER-GUIDE.md).

Dashboard reads and web search results are sent to the selected model through
the signed-in ChatGPT session when needed. Technical chart interpretation is
delegated to the project-scoped `cleo` Codex subagent. Batty handles
the question and context, waits for the specialist result, then relays it with
clear Cleo attribution. Batty must not substitute its own chart
count if that handoff fails. Chat tools are read-only: they cannot edit
dashboard records, control a broker, route orders, or change chart settings.

The chat header has **Recent** and **New** controls. It keeps the most recent
conversations and message timestamps in this browser's local storage; entries
show in the device's local timezone and do not sync between devices. Older chat
turns that predate timestamps are preserved with their dates marked unknown.

This local Codex subagent handoff is not a durable Firstmate crew task: it does
not create a Firstmate task ID, support follow-up/stop operations, or record a
Firstmate lifecycle status. Role cards remain definitions unless the chat
actually invokes the matching project-scoped agent. Live web search and local
read-only dashboard access are available to the chat; market-data feeds remain
separate from general web search and must still satisfy their own source-rights
and freshness requirements.

The Count Desk header includes a Liquidity Lab tab. The launcher starts both
local services: Count Desk on port `8770` and the paper/shadow Liquidity Lab
on port `8041`. If the Lab service is stopped while Count Desk is open, selecting
the tab starts the local Lab server before navigating; the launcher reports a
startup failure instead of opening a dead service URL.

Count Desk includes an optional current-timeframe Liquidity zones chart layer,
so wave counts and indicator-inspired BSL/SSL swing levels can be viewed
together. Active levels are solid red (BSL) or teal (SSL); broken levels are
dashed light gray and stop at their break. The level history is shown from each
swing pivot (up to 180 levels, matching the indicator's line capacity), with
an adjustable, saved line width. The chart background has no grid. Levels
become forecasts only after a confirmed
14-bar pivot's first later overlap; their 0–10 strength is frozen at that event
using the Pine source's wick-extremity bands, overlap/volume logic, ATR width,
and lifecycle.
Probability labels reproduce the Pine source's timeframe priors where supplied; they are
not measured by this app. Unsupported timeframe priors use a clearly labeled
structural fallback.

The same Count Desk chart has Long/Short and Position controls. Click entry,
stop, and target prices, then save a titled chart idea with notes and context
tags. Ideas are active from save time and follow only newer bars. Each saved
bar records unrealized movement and MFE/MAE; a target, stop, or ambiguous
same-bar exit records the simulated outcome, R multiple, and gross MYM P&L.
This forward tracker is separate from broker execution records.

### Trading Journal

Open <http://127.0.0.1:8770/trade-journal.html> to create local teams, traders,
and broker accounts, then import trade executions from CSV. CSV upload is a
permanent journal workflow and can be used account-by-account even after a
broker connector is added. The import screen previews headers, suggests field
mappings, applies the account timezone to timestamps without offsets, skips
duplicate executions, retains the original source file in SQLite, and reports
rejected rows for correction. The current import limit is 20 MB and 100,000
non-empty rows per file.

Closed trades are reconstructed from executions using FIFO matching per
account and instrument. Unmatched opening executions appear as open positions.
Gross and net P&L are displayed only when the contract multiplier is known;
supported futures roots include MYM, YM, MES, ES, MNQ, NQ, M2K, RTY, MCL, CL,
MGC, and GC. Users can map an explicit multiplier for other contracts.
Currency totals remain separated rather than being added without FX conversion.
Trade reviews support tags, notes, and rule-following status.

The workspace supports local team/member/account attribution but does not yet
provide user sign-in or per-member access controls. Journal API reads and writes
are restricted to loopback clients. Robinhood can be imported on demand through
the connected Codex MCP: account links are stored locally, account references
are masked in the UI, and broker-reported P&L summaries are kept separate from
the FIFO execution ledger because they do not provide complete fill detail.
The local webpage cannot call Codex MCP tools or run a background sync by itself.
Manual CSV execution uploads remain available for fill-level history and
reconciliation. A persistent app-side broker connection needs its own authorized
connector and credential flow.

The journal also has a separate paper-trade log tied to a selected journal
account, regardless of brokerage. It supports equity, options, crypto, futures,
forex, and other instrument labels. It does not send broker orders; paper exits
are entered manually and gross simulated P&L excludes fees, spread, partial
fills, and automatic quote tracking. Multipliers are inferred for common
instruments where possible and can be set for custom contracts.

Do not open `web/index.html` directly from Finder. The dashboard depends on the
local API. If the HTML file is opened accidentally, it redirects to the correct
server-backed address while the server is running.

The SQLite database is created at `count-dashboard/data/batty-counts.sqlite3` and is intentionally ignored. Delete it to rebuild from the immutable source fixtures. The seeded MYM Daily series contains 503 daily bars from September 2024 through September 2026. It is a Yahoo Finance `YM=F` continuous-futures snapshot and should be replaced with the user's broker-authoritative CBOT feed for production analysis.

The repository does not contain native MYM 1m, 5m, 15m, or 30m OHLCV fixtures, so
those selectors are shown as `connect data` until an authorized adapter sends
bars. The app never invents smaller candles from an hourly bar. Native 1m data
automatically produces 5m, 15m, 30m, 1h, and 4h bars; native 5m and 15m data produce
the compatible larger intervals. Up to 5,000 stored bars per intraday chart are
used in a count, so a longer 1h import is no longer clipped to the former
short-history window.

Automatic journal outcomes require new MYM bars in the plan timeframe.
The historical candles already visible when a plan is saved do not count as
forward results. The user-suggested cohort is reported in the Liquidity Lab by
timeframe, side, bias, session, divergence, and retracement bucket.

## API

- `GET /api/health`
- `GET /api/symbols`
- `GET /api/counts?symbol=COINBASE%3ABTCUSD&timeframe=1D&cutoff=1789084799`
- `GET /api/bars?symbol=CBOT_MINI%3AMYM1%21&timeframe=1H&cutoff=1789084799`
- `GET /api/feed/status?symbol=CBOT_MINI%3AMYM1%21&timeframe=1D`
- `GET /api/feed/sources`
- `POST /api/feed/sync` (loopback only; requires the local authenticated MCP feed adapter)
- `POST /api/feed/ingest` (loopback + bearer token required)
- `POST /api/feed/heartbeat` (loopback + bearer token required)
- `GET /api/drawings?symbol=COINBASE%3ABTCUSD&timeframe=1D`
- `POST /api/drawings`
- `DELETE /api/drawings?id=<drawing-id>`
- `GET /api/trade-journal?team_id=<id>&member_id=<id>&account_id=<id>` (loopback only)
- `POST /api/trade-journal/teams`
- `POST /api/trade-journal/members`
- `POST /api/trade-journal/accounts`
- `POST /api/trade-journal/robinhood-mcp/import` (loopback only; on-demand Codex MCP snapshot)
- `POST /api/trade-journal/paper-trades`
- `POST /api/trade-journal/paper-trades/close`
- `POST /api/trade-journal/preview`
- `POST /api/trade-journal/import`
- `POST /api/trade-journal/reviews`

## Delayed or real-time feed bridge

The dashboard now has a provider-neutral local ingest route. It stores
native OHLCV updates, replaces a still-forming bar when the provider
corrects it, derives compatible larger intervals, reports the
provider/mode/last bar, and can follow incoming bars
by rebuilding the visible count. The dashboard itself does not contact a
market-data provider. A separately configured adapter must be licensed for
the exact display, analysis, retention, and account use before it sends data.

Enable the local bridge by setting a private bearer token in the server's
environment:

```sh
BATTY_FEED_TOKEN='a-long-random-local-token' python3 count-dashboard/server.py
```

The adapter posts JSON to `POST /api/feed/ingest` with an
`Authorization: Bearer …` header and `provider`, `symbol`, `timeframe`,
`mode` (`DELAYED` or `REALTIME`), and `bars` fields. Each bar uses Unix seconds
and numeric `open`, `high`, `low`, `close`, and optional `volume` values.
It should also post session health to `POST /api/feed/heartbeat` about every
15 seconds so a live connection is not mistaken for stale data between candle
closes.
Only run the default loopback server on `127.0.0.1`; do not expose this
development endpoint to a network. `GET /api/feed/status` reports the current
symbol/timeframe source without revealing the token.

This is the ingestion seam, not a vendor connector. TradingView and
Robinhood MCP registrations do not themselves supply Count Desk bars. TradingView
market data must not be routed into automated count processing under its current
policy. Robinhood Trading MCP includes account and order capabilities and does
not provide the MYM futures history needed here. Keep both MCPs separate from
the count-feed worker.

Before connecting a source, confirm its license covers the intended market,
delayed/live use, local retention, and Elliott/count analysis. Map the exact
instrument and session rules as well: for example, MYM continuous-contract roll
handling and the exchange session used to build Daily bars. The data provider
name returned by the adapter is recorded with each import.

## Open-source integration gates

The four open-source starting points are vendored under
`integrations/open-source/`: Trade Journal, Edge Stats, the MCP server, and the
broker SDK. Their pinned source commits and license/data notices are recorded
in `integrations/open-source/UPSTREAMS.md`. Count Desk owns the adapter contract
and can rename, test, and modify these components without requiring a LuxAlgo
account. Preserve each upstream license, Edge Stats data license, and trademark
notice when redistributing a fork.

The small runtime workspace at `integrations/luxalgo/` is the tested local
sidecar while the source snapshots are adapted component by component. Count
Desk starts the sidecar only for a local Cleo chat turn when
`BATTY_LUXALGO_MCP_ENABLED=1` is set; its allowlist includes library,
journal-read, broker-read, Edge Stats, tracker, and prop-firm research tools.
Journal writes, broker account changes, the experimental orders module, and
Trade Relay are disabled. Credentials never enter browser code or chat
prompts.

`GET /api/integrations/luxalgo` exposes a credential-free capability report,
including the vendored source presence, installed broker catalog, MCP
enablement, Count Desk journal boundary, Edge Stats requirements, and
optional-module gates. The Resources page renders that report so a disabled or
rights-gated source is visible rather than implied to be connected. Edge Stats
remains limited to authorized bars or paper/shadow fills and must retain its
time window, sample size, confidence, uncertainty, and freshness.

## MCP data sync controls

The Count Desk offers a licensed-adapter source, a manual **Sync now** button,
and last/next-sync timestamps. Its conservative starting cadence is five
minutes; the browser checks status every 15 seconds and requests data when due.
Automatic sync runs while the Count Desk page is open. The adapter must enforce
the chosen provider's actual limits; five minutes is only the desk's polling
default, not a statement about any provider's limits or data delay.

The chart header offers MES, MNQ, MCL, MGC, and MYM, plus 1m, 2m, 3m, 5m,
15m, 30m, 1h, 4h, and Daily intervals. The choices remain visible even before
bars have been stored. Selecting an empty interval clears the previous candles
and offers **Sync this interval**; a count can be built once the data is stored.

The browser calls the local Count Desk server, not a provider API or MCP
directly. Massive is called directly by the Count Desk server; OpenStock/Finnhub
and generic licensed feeds still use loopback workers. The server reads
`count-dashboard/.env` without overriding environment variables already set by
the shell. Add the Massive API key and a selected dated contract for each
micro future you plan to sync:

```sh
BATTY_MASSIVE_API_KEY='your-massive-api-key' \
BATTY_MASSIVE_MES_TICKER='MESZ6' \
BATTY_MASSIVE_MNQ_TICKER='MNQZ6' \
BATTY_MASSIVE_MCL_TICKER='MCLX6' \
BATTY_MASSIVE_MGC_TICKER='MGCZ6' \
BATTY_MASSIVE_MYM_TICKER='MYMZ6' \
BATTY_MASSIVE_STORAGE_AND_COUNT_RIGHTS_CONFIRMED=1 \
python3 count-dashboard/server.py
```

Or put those settings in the ignored `count-dashboard/.env` file, then restart
the Count Desk. The Massive key is sent only from the local Python server to
Massive over HTTPS; it is never sent to browser JavaScript. The connector maps
each chart symbol to its corresponding environment variable (`CME_MINI:MES1!`,
`CME_MINI:MNQ1!`, `NYMEX:MCL1!`, `COMEX:MGC1!`, `CBOT_MINI:MYM1!`). These are
explicit dated contracts: the desk does not silently roll contracts or build a
stitched continuous history. Set each ticker to a contract supported by your
Massive account and update it after expiry. Massive serves the selected interval
directly, including 1m, 2m, 3m, 5m, 15m, and 30m; a 1m sync can also create the
larger intraday intervals. Automatic cadence is five minutes.

### Tickstream NQ chart feed

Count Desk connects to the Tickstream `NQ` account stream through the official
`tickstream[stream]` Python SDK. It warms up from the API's recent one-hour tick
window, aggregates ticks into one-minute OHLCV candles, and sends stream updates
to Vela through its custom feed interface. The browser never receives the API
key. Candles are held in a bounded in-memory buffer and are not written to the
Count Desk database or paper ledger; execution endpoints are not used.

The account's `/v1/symbols` catalog lists NQ as subscribed and streamable, and
the NQ WebSocket handshake plus tick frames were verified. The app displays
source timestamps for freshness; it does not infer an exact delay when the
provider's tick payload omits one. To connect another local installation, add
the credential to the ignored `count-dashboard/.env` file:

```sh
BATTY_TICKSTREAM_API_KEY='your-tickstream-api-key'
```

Launch or restart Count Desk, open the Vela chart's **Connections** drawer, and
choose **NQ · Tickstream Free Feed** in the instrument menu. The NQ 1-minute
chart then loads the warm-up window and receives stream updates. `/api/tickstream/status`
reports connection and latest source time; `/api/tickstream/bars?symbol=NQ`
serves the in-memory chart bars on loopback only.

Tickstream's account API decides the subscribed symbols. NQ is enabled for
this account; MNQ is a separate symbol and is not part of this connection.
chart feed, market-data entitlement determination, or executable price.

The collapsed **Indicators · native Vela studies** registry now mounts the
fork's Volume, SMA, EMA, RSI, ATR, and visible-volume-profile studies over the
selected stored bars. The selection persists in this browser and is re-applied
when the chart reloads; these are renderer studies only and do not create
signals, alerts, or orders.

The native-study panel also lets the researcher edit the period for SMA, EMA,
RSI, and ATR (whole numbers from 2 to 5000). Periods are stored locally,
shown in the study labels, and carried into the Cleo handoff and Vela paper
ticket context, so the chart read and hypothetical setup retain the same
renderer state.

Vela also supports an offline replay cutoff. Choose a timestamp within the
stored range and reload the preview to rebuild the chart, Cleo context, and
paper mark from bars available at that cutoff. The provenance footer records
the resulting last bar; **Latest stored** returns to the newest available
bar. This is bar replay over the local historical store, not a live stream.

For other providers, configure the corresponding loopback worker and optional
token in the Count Desk server environment:

```sh
BATTY_OPENSTOCK_FEED_ADAPTER_URL=http://127.0.0.1:<other-port> \
BATTY_OPENSTOCK_FEED_ADAPTER_TOKEN='another-local-worker-token' \
python3 count-dashboard/server.py
```

### AMP / CQG WebAPI data connector

The read-only CQG connector is prepared, but AMP/CQG has not yet enabled this
Count Desk app for WebAPI or assigned its production client ID. An existing
AMP/CQG username and password may be reusable after app approval: AMP documents
that Sierra Chart's CQG WebAPI connection uses the customer's live credentials.
CQG/AMP must confirm whether that applies to Count Desk. A normal login alone
does not establish custom-app access. CQG's demo WebSocket is reachable from this
machine; this is a transport check, not an authenticated data connection.
The application request is in `docs/CQG-WEBAPI-ACCESS-REQUEST.md`.

Install the optional protocol bindings and run the transport check:

```sh
python3 -m pip install -r count-dashboard/requirements-cqg.txt
python3 count-dashboard/setup_cqg_protocol.py
python3 count-dashboard/cqg_webapi.py probe-network
```

The setup script installs generated protobuf modules from a pinned CQG sample
revision into ignored `count-dashboard/.cqg-protocol/`. No broker password is
needed for the transport check. Once CQG supplies approved **WebAPI** test
credentials, configure them in the ignored `count-dashboard/.env` or local
environment and run `probe-login`; it does not request prices or accounts.
The WebAPI logon sets `drop_concurrent_session=false`, so it never intentionally
evicts the existing platform session; a CQG concurrent-session rejection is
reported instead.

After written production API and data-use permission, configure an approved
production `wss://` endpoint and exact CQG dated MYM symbol. Set a unique local
worker token; the same token belongs in the Count Desk environment:

```sh
BATTY_CQG_WEBSOCKET_URL='wss://the-CQG-approved-production-endpoint' \
BATTY_CQG_CLIENT_APP_ID='CQG-assigned-app-id' \
BATTY_CQG_PRIVATE_LABEL='CQG-assigned-private-label' \
BATTY_CQG_USERNAME='CQG-WebAPI-user' \
BATTY_CQG_PASSWORD='CQG-WebAPI-password' \
BATTY_CQG_MYM_SYMBOL='exact-dated-CQG-MYM-symbol' \
BATTY_CQG_WEBAPI_ACCESS_APPROVED=1 \
BATTY_CQG_STORAGE_AND_COUNT_RIGHTS_CONFIRMED=1 \
BATTY_CQG_FEED_ADAPTER_TOKEN='unique-local-token-at-least-20-characters' \
python3 count-dashboard/cqg_webapi.py serve
```

Count Desk needs `BATTY_CQG_FEED_ADAPTER_URL=http://127.0.0.1:8784`, the
matching `BATTY_CQG_FEED_ADAPTER_TOKEN`, and the same access, rights, symbol,
WebAPI endpoint, and credential settings to display the source as configured.
Keep these values out of Git and do not paste passwords into chat. The worker
returns completed historical time bars with dated-contract provenance. It does
not stream quotes, route orders, control accounts, or make demo data appear as
production market data.

The user confirmed their Massive plan permits bar retention and count
computation; the ignored local `.env` records that acknowledgement. For other
providers, sync remains locked until their own rights for retention and count
computation are confirmed. Set the provider's local flag only after that:

```sh
BATTY_OPENSTOCK_STORAGE_AND_COUNT_RIGHTS_CONFIRMED=1
```

Each worker must expose `POST /sync` and return the requested symbol/timeframe
with `provider`, `bars`, `mode`, and `retrievedAt`. The Count Desk sends the
selected source ID, symbol, timeframe, requested history count, and `DELAYED`
mode. See `server.py::sync_from_adapter` for the contract. Adapter URLs must be
loopback-only; provider credentials belong in the server or worker environment,
not the dashboard database. The old generic worker remains available with
`BATTY_MCP_FEED_ADAPTER_URL` and `BATTY_MCP_FEED_ADAPTER_TOKEN`.

Provider fit and restrictions:

- **Massive Futures Basic** covers CME/CBOT/NYMEX/COMEX futures history, up to
  two years and five API calls per minute, with an eight-hour historical
  recency. It is a REST history tier, not a 10-minute delayed stream. The
  direct connector requests aggregate bars and requires an explicit dated MYM
  ticker. Contract roll/stitching is not automated.
- **OpenStock/Finnhub** refers to an adapter based on OpenStock's Finnhub stock
  data integration. OpenStock itself is a separate Next.js stock dashboard and
  uses TradingView chart widgets; it is not a feed API or a source of MYM
  futures bars. The adapter must use a server-side Finnhub key and only request
  supported equities. Its sync is also locked pending written rights for the
  Desk's storage and count-analysis use.
- **Yahoo Finance** is shown as unavailable. Yahoo's terms prohibit automated
  data collection without express prior permission; no Yahoo scraping,
  `yfinance` auto-sync, or manual CSV import is implemented.

These choices identify candidate adapters; they do not grant data rights. A
provider must authorize the exact local display, storage, and count-analysis
workflow before its adapter is configured. The dashboard marks adapters as
not connected until their local worker URLs exist.

Massive's direct connector is ready, but remains disconnected until its API key
and dated contract ticker are added to `count-dashboard/.env`. A Codex OAuth
login is not a substitute for provider credentials. Other providers still
require their own local feed adapters.
TradingView and Robinhood MCP data are not wired as market-data sources.

Every count request reads only bars at or before `cutoff`. Identical requests reuse the stored count run.

## Three-pane chart workspace

`/vela-preview.html` is the landing page's primary chart desk. On desktop it
fills one viewport: persistent collapsible navigation, the native Vela chart,
and the existing chat service mounted as the Cleo pane. The page does not
scroll; conversations and paper records scroll within their panes. Small
windows stack chart and chat while keeping the composer visible.

Instrument and available stored-data timeframes sit in the chart toolbar.
Indicators, replay, connection status, and provisional chart context open
exclusive drawers; Escape closes them. Native Vela drawing tools remain in
the chart. Paper Trading stays a separate tab. Navigation collapse persists
locally; Log out clears wallet identity and returns to the landing page.
Three colored cursive T buttons in the workspace header select small,
default, or large interface text and preserve that preference locally.
Connection details wrap in a bounded, scrollable popup above native drawing
tools, including in compact windows.

Chat sends the loaded instrument, timeframe, numeric historical cutoff,
and active study labels through the existing `/api/chat` request. Batty
coordinates the project Cleo specialist; the UI does not imply a separate
live trading agent. Delayed feeds and read-only Tickstream readiness retain
their provenance and paper-only boundaries. Timeframes require stored bars;
this layout does not add TradingView's proprietary tools or new data sources.

## Next engine increment

Replace `confirmed_pivots()` and `label_pivots()` with the v0.7 Daily candidate
pack, hard-rule audit and Daily-to-4H linker. Keep the API and ledger
identifiers stable while the solver improves.
