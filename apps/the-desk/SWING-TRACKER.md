# Swing Tracker / Jev Decision Lab

The liquidity trading studies, tracker measurement update, Jev `swing-observer.3`
and separate RIDER/Spider advisors are documented in [SWING-LIQUIDITY-STUDY.md](SWING-LIQUIDITY-STUDY.md).
The v1 audit below remains a separate reference.

New, independent ETH/BTC implementation in The Desk. This code does not import
`abc-reversal-bridge.mjs`, the older ABC Pine script, or the existing ABC panels.
It receives public market data only; it has no order-engine or broker handle.

## Use

For this development checkout, run `python3 server.py --port 18884 --no-workers`
from the app directory. The default `data/` directory is persistent and excluded
from Git. An explicit `--data-dir` should also point to a persistent location;
the previous temporary review directory disappeared and only the saved export
could be recovered. Keys saved through Swing Lab now persist in macOS Keychain.

1. Start The Desk normally, then open **Swing Lab** from its header or the small chart status badge. Select **Hyperliquid BTC** or **Hyperliquid ETH**.
2. Set swing timeframe (1, 2, 3, 5, 15 or 30 minutes), fractional research quantity,
   budgets and target source. Defaults use a 5m swing with closed 1m validation.
3. Click **Enable Jev & start** for model evaluations, or **Start tracker only**
   for deterministic observations. Starting applies the visible settings. Saving settings ends a run and never rewrites
   its recorded configuration. Restart is paused; a run ends after 24 hours.
4. Click **Open BTC/ETH 1m chart** to open the selected market with the overlay
   enabled. The Lab is a controls/results page; dots are on the workspace chart. On a 1m chart, each fresh Jev
   evaluation adds a timestamped dot. Green long leans stack below the candle;
   red short and gray neutral leans stack above it. The ordinal slot increases
   away from the candle: at the default 15s cadence there are four slots.
   Hover/focus a dot for its timestamp, probabilities and service status.
5. Pause, inspect the decision table and export observations. Completed and
   pending records remain in `data/swing-research.sqlite3` (excluded from Git).

The default cadence is **4 evaluations/minute**. Settings support 1, 2, 4 or 6.
Sampling targets wall-clock slots; slow providers, sleep or an outage can miss a
slot. Missing evaluations are never backfilled. Repeated calls in one slot are
deduplicated. Dot votes never change after a result is recorded. Their placement
may move as the host candle completes, to remain outside its high/low.

**Neutral** is Jev's current directional-thesis judgment, not a service failure
and not a prediction that the next candle must be flat. Hollow dots mean no valid
Jev evaluation (disabled, unavailable or stale). Colored dots are model context,
not confirmed entry signals. Live dots are hidden during chart replay and on
non-1m frames; all tracker graphics are withheld on higher frames. Only one eligible 1m chart owns the dots and compact status badge; the large chart summary and structural drawings are removed.

## One observer, one chart display

The server permits **one active market observation run**, always fed by 1m
Hyperliquid bars. Repeated Start requests for that market return the same run;
starting another market is rejected until the current run is paused. One serial
worker samples the active run. Multiple charts, browser tabs, status reads and
Swing Lab pages do not invoke Jev. A request already sent before Pause may still
finish and be metered; its response cannot become a fresh active judgment.

The workspace header's **1m chart** selector defaults to **Auto · one chart**.
Auto chooses one BTC/ETH 1m chart, keeps that choice stable as you activate other
charts, and matches the running observation market. You can pin a specific
eligible 1m chart. A missing or mismatched pinned chart shows no overlay; it does
not silently switch to another chart or change the observed market. If there is
no matching 1m chart, add one; research can continue with its chart closed.
Changing a chart's market/timeframe removes its overlay when it is no longer
eligible. Replay suppresses the overlay.

The Swing Tracker button controls display visibility only. **Pause in Swing Lab**
stops collection. Settings, costs, history and detailed results stay in Swing
Lab. Dots are 30% smaller and have 17px edge clearance (previously 8.5px) from
the candle high/low, with ordinal stacking beyond that first gap.

## Enable Jev

Open **Swing Lab → Jev connection**, paste your TypeSafe API key once into the
password field, and click **Save to macOS Keychain**. The backend stores it as a
non-synchronizing generic password in this macOS user's login Keychain under
service `com.the-desk.typesafe.jev`, account `api-key`. It loads the saved key on
startup, across research runs and Desk restarts on this Mac. The browser clears
the input immediately; neither status nor exports return the key. No plaintext
file, database, browser storage, command argument, or Git copy is made.

Click **Enable Jev & start** separately to begin paid observations. Saving a key
never auto-starts research. Presence is not verification; the first successful
Jev response verifies provider access. The initial upgrade of a memory-only
server requires an approved restart ending the current research run, then one final entry because the old server has no secure key-export
route. After that, no repeated key entry is needed.

**Remember current key** securely persists a memory/environment key already
loaded by the upgraded server, without ending collection. Replacing the key or
choosing **Remove saved key** pauses both markets and invalidates ownership of
in-flight responses. Remove deletes the Keychain item and disables Jev in this
process. With an environment key, that environment key can return after restart;
remove `TYPESAFE_API_KEY` from the launcher as well if you want it absent entirely.

Startup reads never trigger a modal prompt. If Keychain is locked or denies
access, the UI reports that state; unlock the login Keychain and choose **Load
saved key** to retry with macOS's access prompt permitted. An interactive save or
remove can also produce a macOS permission prompt. Failed storage operations
preserve the current credential and running research; there is no plaintext
fallback. The native adapter uses Security/CoreFoundation directly, avoiding
secrets in subprocess arguments or stdout. Other platforms can use server-side
`TYPESAFE_API_KEY`; persistent UI storage requires macOS. Stored keys take
precedence over the environment; a legacy session override takes precedence over
both. `DESK_JEV_KEYCHAIN=disabled` isolates tests from the user's real Keychain.

Research still starts paused after a restart. A retained key does not authorize
extra calls or orders. Do not put a key in Pine, a query string, Git, chat or a
screenshot.
No key is required to run the deterministic tracker and record snapshots.
Enabling Jev sends only bounded public-market state to TypeSafe. It does not send
accounts, balances, order tickets or credentials in the model state.

## Completed-swing and setup-outcome audit

The **Completed swings & setup outcomes** card implements `swing-outcomes.1`.
It reads the existing durable SQLite records through the public research export
and history endpoints. The browser derives versioned records; it does not write
to the collector, alter prompts, place orders, or make additional Jev requests.
The collector continues with the Lab closed. Reopening rebuilds the audit.

- A→B is finalized only when a later opposite pivot C is confirmed and observed.
  Same-side extensions before C can change the developing endpoint. After
  finalization, a conflicting endpoint is flagged and excluded from progress.
- The first live snapshot seeds historical context. Only legs whose A origin is
  at/after that snapshot's completed-bar cutoff count as fully forward swings.
  Historical warmup and legs crossing the observation boundary remain visible
  but do not advance the 50/200 checkpoints. Four dots do not equal four swings.
- Cohorts bind symbol, the complete frozen tracker configuration, collector code
  hash, model and prompt revision. Matching runs are combined and duplicate
  A/B legs are counted once. Other configurations and markets stay separate.
  Missing provenance and export truncation are displayed; neither permits a
  milestone to be declared reached. These are review checkpoints, not edge tests.
- Every observed candidate remains an attempt, including blocked, invalid,
  missed, untriggered and unresolved states. Reparented child attempts are
  diagnostic records, not automatically independent opportunities.
- Only a recorded tracker `READY` plan can enter the outcome study. Freeze the
  original target, initial stop, gap/risk/room rules and `plan_bars` horizon.
  Use its eligible full-minute open after actual observation. Do not inherit a
  pre-observation open or infer an entry from a later profitable path.
- This benchmark holds a **fixed bracket**, independently of the tracker's
  break-even amendments. Both barriers touched within one candle is ambiguous
  unless the open settles the ordering. Adverse stop gaps use the open; target
  gaps receive only the target. The time exit uses the horizon candle close.
  Missing/revised bars and run endings without an observed exit are unresolved.
- Model attribution uses the freshest valid judgment from that run, observed
  and received before entry, no more than 75 seconds old. It describes market
  context; it does not mean Jev approved that specific plan. Future, stale and
  unavailable answers cannot become pre-entry evidence.
- Count only the first entered plan per A/B opportunity in pattern summaries.
  Keep all alternatives visible. Groups show sample sizes, target/stop/time
  counts, ambiguity, pending/unresolved counts and mean R. They are exploratory
  and dependent; no calibrated setup win probability, significance, trained
  model, optimized threshold or automatic deployment is claimed.
- Costs are initially **unset**, so results are gross. An optional user-entered
  round-trip bps assumption on entry notional produces a labeled cost scenario.
  This is not verified exchange fees, spread, slippage or funding. The exported
  artifact includes the assumption; changing it creates a different analysis
  of the same untouched observations.

The card refreshes incrementally every 30 seconds while open. **Refresh archive**
reconstructs from the available export, and **Export swing audit** downloads the
derived swings, attempts, frozen plans, outcomes, cohort and explicit definitions.
Keep the raw export alongside it for full snapshot provenance. To rebuild locally:

```sh
node scripts/audit-swing-evidence.mjs --source /absolute/raw-export.json --out /absolute/new-audit.json
```

The output must be a new file. Optional `--run ID` selects its frozen cohort;
`--cost-bps NUMBER` declares a scenario. This command has no network or inference
dependency. Preserve this v1 reference when proposing a changed outcome rule;
give the challenger a new version and test on a later untouched block.

## Jev usage and cost accounting

The chart's Swing Tracker status panel shows estimates for the latest research
session, current/latest parent group and all stored BTC/ETH runs. Swing Lab has
a full **Jev usage & running costs** card, 1/2/4/6-check cadence comparisons,
custom session-hours projections and recent run/parent tables. It refreshes with
status every three seconds and does not make additional model requests.

`jev_costs.py` keeps a separate durable `jev_usage` table keyed by prediction ID.
Before a model call, its row is pending with a frozen published-price snapshot.
Afterward, the returned `usage.input_tokens` and `usage.output_tokens` determine
the estimate. Input tokens are already billable tokens for the whole request;
never multiply by the question count again. Cost arithmetic uses integer
nanodollars. Completed usage and its rate snapshot are immutable and survive
process restarts. A crashed pending request becomes unresolved, not free.

Published `jev-1.14.0` and `jev-1.13.0` rates verified on **2026-10-24** are
**$0.042 per million input tokens, $0 for output**:
[model pricing](https://docs.typesafe.ai/models),
[billable usage contract](https://docs.typesafe.ai/api/system-one).
Thus a request reporting 6,000 input tokens costs an estimated $0.000252;
four per minute projects $0.06048/hour or $0.48384/8 hours per such market.
These are examples, not fixed future costs: snapshot sizes change.

- Disabled tracker observations are not API requests. Stale or invalid answers
  still count when they report usage. A timeout, missing usage or unknown model
  price remains unknown; `≥` marks the known portion of an incomplete estimate.
- Historic responses are backfilled once at the verified current rate with a
  `legacy_repriced` marker. Original predictions are not rewritten. Lost records
  cannot be billed from this ledger; restored-archive coverage is shown.
- “Session” means one research run. “Parent swing” means `(run, parent_id)`,
  which may still be developing; it is not a finalized independent audit swing.
  The average parent cost denominator includes all observed priced/unpriced
  groups, and the unknown-cost counters remain visible.
- Projections use up to 20 recent usage-bearing requests for the same market
  and model, multiplied by the configured cadence. No samples means unavailable,
  rather than borrowing BTC's cost for ETH. Paused/disabled markets have zero
  active projected burn; their conditional forecasts remain available.
- Totals aggregate all retained ledger rows without the observation export cap.
  The tables show only recent sessions/parents; the total does not use those
  display limits. The model's billed tokens are not fed back into market state.
- Estimates are not account invoices: credits, tax, custom pricing and usage
  from other applications are not reconciled. This feature does not add a
  spending cap, change sampling or restart observation runs automatically.

`GET /api/swing/costs` exposes read-only aggregate estimates, pricing provenance,
unknown/pending counters, run/parent groups and projections. The scoped research
export also includes usage rows and uncapped market totals. Credentials are
never part of these outputs.

The adapter uses the documented System One HTTP endpoint, pins `jev-1.14.0`, and
pins question revision `swing-observer.3`. It validates answer types, all choice
keys, finite [0,1] probabilities, probability sums and model identity. A 2s request
timeout, a 3s elapsed budget, a crossed minute, or a changed run withholds the
judgment from active display. Service errors never fabricate an answer or relax
a setup rule. Latency is measured at runtime; no latency claim is assumed.

Questions share the same frozen snapshot and run independently:

- Current directional thesis: long / short / neutral (the chart dot).
- Current pattern: reversal / breakout / retracement / no match.
- Long reversal thesis fit and short reversal thesis fit (separate Noul judgments).
- Next **full** 1m candle: up / down / flat relative to that candle's own open,
  at least one tick. This forecast is separate from the dot's contextual lean.

The API does not remember or learn from repeated calls. The local immutable
ledger provides the training/evaluation material for future research.

## Port provenance and scope

The curated reference is `swing-reference/Agentic_Swing_Tracker_v1_2.pine`.
Its original path and SHA-256 are in `swing-reference/manifest.json`. The Python
port is source-informed; native TradingView numerical/alert parity is unverified.
No charts or futures trades in the source conversation establish a crypto edge.

Implemented mechanics:

- Completed, contiguous 1m OHLC input; aligned selected-timeframe aggregation.
- Micro/parent pivots with separate origin and recognition timestamps.
- Immutable A/B anchors, developing C, parent IDs, new child attempts and four
  separate long/short reversal/continuation research profiles.
- Prior completed-bar channel envelope, previous-candle penetration plus reclaim,
  directional body, rejection close, retracement, expiry and no-chase gates.
- Targets from a recognized unconsumed pivot or an explicitly measured AB extension.
- Frozen signal reference/stop/target, fractional base-asset sizing and gross USD
  attempt, parent and UTC-day reserved risk. Accepted risk is not refunded on miss.
- OHLC shadow observations at the next full minute open after actual observation,
  gap allowance, one active slot,
  ambiguous same-bar stop/target, expiry and BE effective on the following bar.
- Parent range premium/discount/equilibrium and a developing parent visual band.
  Visual geometry can evolve; it does not modify frozen validation geometry.

Intentional differences / not ported in this first crypto release:

- Crypto uses 24/7 UTC calendar-day boundaries, no Globex maintenance or Pacific
  futures morning window. Contract multiplier is linear USD per base-asset unit.
- Strict pivot ties remain unresolved. Native Pine tie behavior has not been matched.
- Live observations schedule shadow entry at the first full 1m open at or after
  the actual observation timestamp. They cannot inherit an open that occurred
  before the REST response arrived. Pure core replay defaults to the signal-boundary
  next open; the service supplies actual observed-at times for forward inputs.
- Selected-timeframe pivots are recognized when the complete aggregation closes;
  Pine's `request.security([1])` import may deliver on a later 1m evaluation.
- Legacy tracker-only mode retains research-all enabled profiles. The liquidity
  study extension adds timestamped manual bias/side permission and HTF references
  as described in SWING-LIQUIDITY-STUDY.md. Imported Liquidity/Bias indicator
  parity, blackout windows and manual stop/target amendments remain unsupported.
- Parent visual context uses retained closed history; it is display context, not
  an entry rule. Dot placement supports normal and inverted price scales.
- Public REST snapshots are not a full trade/order-book tape. This release cannot
  establish intrabar liquidity-touch order, queue position or executable fills.
- No imported third-party indicator is evaluated by Jev yet. A future adapter must
  provide its exact source, known-at cutoff, settings and output provenance.

## What the observations measure

Each saved prediction contains frozen market state, current forming-bar status,
quote time, closed cutoff, source minute, slot, run/configuration, model/prompt
version, implementation SHA-256, typed response and later next-full-candle OHLC label. The first sample
per minute is the primary forecast; the rest are intrabar diagnostic observations.
All slots remain visible. Four evaluations are not four independent trades.

The scorecard compares Jev direction accuracy and multiclass Brier score with a
causal last-completed-candle-direction baseline on the same primary rows. It is
scoped to the current run's latest 300 samples. Unknown, failed, stale and unresolved
outcomes are excluded from accuracy and shown in history. Samples are serially
dependent. This is neither a calibrated trading win rate nor a profitability test.

Shadow plan outcomes are gross OHLC observations; fees, spread, slippage, funding
and partial fills are not modeled. Stop gaps use the adverse open; target gaps
receive only the target price. A target and stop touched in the same bar remains
ambiguous. Warmup signals are historical structure and cannot own a forward slot,
budget or displayed forward entry marker. Warmup watches can continue forward.

Bar closure and future-label resolution use the provider snapshot cutoff, so a cached forming candle is never promoted by wall-clock time alone.

Closed-bar revisions and a long observation interruption pause the run rather
than rewriting prior inputs. A bar gap invalidates affected structure/plans.
Run end/restart makes outstanding plans unresolved. No old outcome is turned
into a live signal after a restart.

Before using a model score as an entry filter: freeze an outcome horizon and cost
model, collect independent swing attempts, split chronologically by day, compare
the deterministic baseline with and without Jev, and evaluate calibration and net
expectancy out of sample. Do not select a probability threshold from this UI's
first handful of observations.

## API and verification

All routes inherit the Desk's loopback Host / same-origin JSON checks.

- `GET /api/swing/status`: per-symbol state and recent dot history.
- `POST /api/swing/control`: `start`, `pause`, or `configure`, exact symbol/config.
- `POST /api/swing/key`: exact same-origin JSON commands `{"action":"save","api_key":"…"}`,
  `{"action":"remember"}`, `{"action":"load"}`, or `{"action":"forget"}`. Secret values
  never appear in responses. Legacy `{"api_key":"…"}` remains memory-only for older clients.
  Status exposes only credential source, availability, saved presence and sanitized errors.
- `GET /api/swing/history?symbol=hyperliquid:BTC`: run-scoped observations/metrics.
- `GET /api/swing/export?symbol=hyperliquid:BTC`: bounded local research export.

The research service runs independently of browser visibility. `--no-workers`
disables the existing execution/journal workers; an explicit research start still
starts public-data observation. The server and computer must remain awake.

Tests:

```sh
python3 -m unittest discover -s tests -p 'test_swing_tracker.py'
python3 -m unittest discover -s tests -p 'test_swing_http.py'
node --test tests/test_swing_dots.mjs
```

The backend tests cover causal pivot timing/prefix replay, mirrored sweep gates,
prior rails, frozen attempts, fractional risk, gaps, next-open handling, ambiguous
barriers, deferred BE, slot deduplication, response freshness, run boundaries,
restart behavior and server routing without account/order effects. The browser
verification uses explicitly labeled synthetic votes solely for rendering tests.
Actual Jev responses and crypto forecast accuracy require the configured key and
forward observations.

Official references, checked 2026-10-23:
[System One API](https://docs.typesafe.ai/api/system-one),
[Choice](https://docs.typesafe.ai/primitives/choice),
[Noul](https://docs.typesafe.ai/primitives/noul),
[Confidence](https://docs.typesafe.ai/confidence).

For an already active pre-upgrade collector, avoid restarting it: a session key
lives only in RAM. Run `python3 scripts/watch-jev-costs.py --data-dir DATA_DIR
--output web/data/jev-costs.json` from this app. This local companion polls only
loopback status, backfills the usage table, and publishes atomic cost summaries
without making inference requests or modifying source observations. The browser
prefers native API costs; otherwise it reads this summary. Figures older than
12 seconds are visibly stale. The companion exits automatically when native
accounting appears after a natural server restart. Generated summaries stay
Git-ignored. The native accounting requires no companion on later launches.
