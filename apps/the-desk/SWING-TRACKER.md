# Swing Tracker / Jev Decision Lab

New, independent ETH/BTC implementation in The Desk. This code does not import
`abc-reversal-bridge.mjs`, the older ABC Pine script, or the existing ABC panels.
It receives public market data only; it has no order-engine or broker handle.

## Use

1. Start The Desk normally, then open **Swing Lab** from its header or the chart
   summary. Select **Hyperliquid BTC** or **Hyperliquid ETH**.
2. Set swing timeframe (1, 2, 3, 5, 15 or 30 minutes), fractional research quantity,
   budgets and target source. Defaults use a 5m swing with closed 1m validation.
3. Save, then **Start observing**. Saving settings ends a run and never rewrites
   its recorded configuration. Restart is paused; a run ends after 24 hours.
4. Show **Swing Tracker 1.2** on the native chart. On a 1m chart, each fresh Jev
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
non-1m frames; the swing overlay can still display on other frames.

## Enable Jev

Set `TYPESAFE_API_KEY` in the server process environment, restart, then enable Jev
in Swing Lab. Do not put a key in Pine, a browser, a query string, Git or a screenshot.
No key is required to run the deterministic tracker and record snapshots.
Enabling Jev sends only bounded public-market state to TypeSafe. It does not send
accounts, balances, order tickets or credentials in the model state.

The adapter uses the documented System One HTTP endpoint, pins `jev-1.14.0`, and
pins question revision `swing-observer.2`. It validates answer types, all choice
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
- This release is research-all enabled profiles. Timestamped manual thesis /
  continuation declarations, linked Liquidity/Bias plots, blackout windows and
  manual stop/target amendments are not supported. They are not silently inferred.
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
