# MYM Liquidity Zone Forward Lab

**Protocol draft:** v0.1  
**Date:** 2026-09-26  
**Status:** planning only; paper/shadow testing; no live execution authorization  
**Instrument:** Micro E-mini Dow futures (MYM), one-contract economics  
**Chart timeframes:** 60m, 30m, 15m, 5m, 1m

## Recommendation

Build this as a prospective forecasting laboratory, not as a TradingView strategy report. Every zone must be registered when it first becomes knowable, with the indicator version, displayed probability, strength score, variables, target, and invalidation frozen before the outcome. Resolve the outcome later from a lower-resolution market-data path and keep broker fills as the authority for any actual execution claims.

The lab should answer two different questions:

1. **Attraction:** after a zone becomes active, is price drawn to/touches that zone before the zone expires?
2. **Reaction (the primary definition of “strength”):** after first touch, does a reversal trade hit the frozen opposite-side target before a fixed 30-tick stop?

These must not be collapsed into one probability. The supplied indicator's probability labels currently describe different target events on different timeframes.

## Why the current indicator cannot yet be treated as a unified probability model

Source reviewed: `Batty Clean Zone View v1.9.6 - Bias Draw Lines Default Off` from the supplied 2,504-line Pine v5 attachment, SHA-256 `c6995242c85143af4dc11973e8e4efd0a7e4d5c7723de8d207793a72393c8688`.

| Finding | Evidence in supplied script | Lab consequence |
|---|---|---|
| Probabilities are embedded lookup values | `prob_profile_probability()` hard-codes percentages and sample counts | Capture the displayed value as a candidate forecast; do not call it newly learned evidence |
| The event definition changes by timeframe | Comments define 1m as “opposing target hit” and HTF as “liquidity sweep”; 5m MYM class buckets are derived from 1m resolver rows | Score attraction and reaction separately; do not pool the current percentages into one calibration curve |
| 15m has no profile branch | `prob_tf_key()` recognizes 15m only as an unhandled string; no 15m measured bucket exists | Collect 15m zones, but label its v1.9.6 probability as fallback/unvalidated until a 15m model is registered |
| Pivot zones are confirmed late and drawn back on the pivot bar | The script uses `ta.pivothigh(length, length)` / `ta.pivotlow(length, length)` and historical pivot coordinates | The forecast timestamp is the detection-bar close, never the plotted pivot timestamp |
| Some multi-timeframe values can change intrabar | Strong-zone MTF calls use `request.security(... lookahead_off)` without a one-bar HTF offset | Only register completed source-timeframe bars, or first revise the export logic to emit confirmed HTF snapshots |
| One optional request can future-leak in historical analysis | Premium/discount request uses `lookahead_on` without offsetting its expression | Keep that feature off for the benchmark until corrected and replay-tested |
| Structural score and measured probability are different constructs | Strength score uses overlap count, volume, zone width/ATR, and crossed state; probability profile is a lookup | Preserve both fields. Test each independently and their incremental value together |

TradingView's documentation warns that unconfirmed higher-timeframe `request.security()` values can repaint and that a historical pivot plotted in the past becomes knowable only after the right-side bars have elapsed. The lab therefore stores both `pivot_time` and `forecast_available_time`.

## Frozen primary protocol

This is the recommended default protocol to approve before collection starts.

### Unit of observation

One immutable **zone forecast** per unique zone ID, source contract, and source timeframe. Repeated screenshots, labels, or alerts for the same zone update its lifecycle but do not create new samples.

### Zone registration

- Register at the close of the first completed source-timeframe bar on which the zone is available.
- Freeze: zone boundaries, side, class, source timeframe, structural score, tier, displayed probability, probability source/sample count, indicator hash/version/settings, bias, nearest opposite zone, and all candidate covariates.
- Exclude from the primary cohort if the zone is already touched, crossed, or retrospectively discovered when first logged.
- Never rewrite the original forecast row. Corrections are append-only amendments.

### Attraction outcome

- `1` if the market first touches the registered zone before expiry.
- `0` if it expires first.
- Primary attraction expiry is 20 completed source-timeframe bars after registration.
- Report time-to-touch and competing removal/cancellation reasons.

### Reaction/trade outcome

- A BSL first touch opens a **short** reversal trial; an SSL first touch opens a **long** reversal trial.
- Entry is the first executable price at or through the near boundary after activation, plus the pre-registered slippage rule.
- Stop is exactly **30 MYM ticks from actual entry**. CME specifies MYM's minimum price fluctuation as 1 index point worth $0.50 per contract, so the initial gross stop risk is 30 points / $15 for one contract, before commissions and stop slippage.
- Target is the nearest active opposite-side level on the **same source timeframe** that existed on entry and lies in the trade direction. Freeze its zone ID and price on entry; later indicator movement cannot change it.
- If no valid opposite target exists at entry, the zone remains in attraction/strength research but is `trade_ineligible_no_target`.
- Primary expiry is 20 source-timeframe bars after entry, or the contract's final/roll boundary, whichever comes first. Timeout is neither a win nor a stop; it is a separate outcome and an economic exit at the first executable price.
- When target and stop are crossed in the same aggregate bar, resolve with tick/one-second data. If the path is unavailable, mark `ambiguous`; exclude it from the primary target-before-stop proportion and count it as stop-first in the conservative P&L sensitivity.

### One contract versus simultaneous research signals

Maintain two ledgers:

1. **Scientific shadow ledger:** every eligible zone gets a virtual one-contract trial. This measures each timeframe without selectively dropping collisions.
2. **Executable policy ledger:** only one MYM contract may be open. Earliest eligible trigger wins; new triggers while a position is open are logged as blocked, not silently discarded. A fixed timeframe priority may replace first-in only in a later pre-registered protocol version.

Never add returns from simultaneous shadow trials and present the sum as a tradable one-contract equity curve.

## Variables: operational definitions

Store continuous/raw values whenever possible and create reporting buckets later from a frozen analysis plan.

| Variable | v0.1 definition at forecast time | Role |
|---|---|---|
| Indicator forecast | displayed probability, evidence code, tier, structural score, side and zone class | Primary candidate predictor |
| Timeframe | one of 60m, 30m, 15m, 5m, 1m | Primary stratum; never pool without a timeframe term |
| Bias | exact indicator state `bullish`, `bearish`, or `wait`; plus `aligned`, `opposed`, `neutral` relative to the reversal direction | Pre-specified interaction |
| Session | mutually exclusive New York-time session bucket at creation, touch, and entry | Context, not a trade filter in v0.1 |
| Scheduled news | official event ID/source and time distance; primary buckets `inside ±15m`, `15–60m`, `>60m/none` | Context; use BLS, BEA, and Federal Reserve calendars, not retrospective headlines |
| Fibonacci position | normalized location within a pre-entry, already-confirmed swing range; store ratio continuously and tag 38.2/50/61.8/78.6 bands | Secondary predictor |
| Divergence | **not yet operationally defined** | Withhold from confirmatory analysis until the comparison market/indicator, pivot rule, direction, and valid window are frozen |
| Zone geometry | width in ticks, age, distance from price, distance to target, target/stop ratio, touch count | Control/diagnostic variables |
| Volatility/liquidity | ATR, realized range, spread if available, and volume at forecast and entry | Control/diagnostic variables |

Recommended divergence v0.2 candidate: intermarket swing divergence between MYM and MES on the same source timeframe, using only confirmed pivots and a fixed three-bar matching window. Do not add RSI divergence and intermarket divergence under one field.

## Data model

Minimum append-only tables/streams:

- `model_registry`: model ID, indicator hash, settings hash, probability semantics, training snapshot lineage, activation/deactivation times.
- `zones`: immutable zone identity, source contract/timeframe, boundaries, pivot time, available time, side/class, parent/child IDs.
- `forecasts`: zone ID, forecast time, attraction probability, reaction probability if supplied, score/tier, full feature snapshot.
- `zone_events`: created, touched, entered, target hit, stop hit, expired, invalidated, cancelled; each with exchange time, receive time, source, and raw payload hash.
- `trials`: eligibility, entry rule, entry price, frozen stop/target, quantity, collision/portfolio status.
- `outcomes`: competing outcome, resolution source, MAE, MFE, time to event, gross ticks, fees, slippage, net dollars, R multiple.
- `calendar_events`: official event source/ID, scheduled and actual release time, category, revision metadata.
- `evidence`: Pine source, screenshot/chart snapshot, alert JSON, market-data slice, broker record, hashes, and retention rights.
- `amendments`: who/what changed, reason, old/new values, and timestamp; never destructive overwrites.

Required IDs include the actual quarterly contract (for example, not only `MYM1!`), TradingView ticker ID, zone ID, parent zone ID, trial ID, experiment version, model version, and data-source version.

## Statistical analysis plan

### Primary endpoints

1. **Forecast quality:** Brier score for the pre-registered binary event, Brier skill score versus a simple trailing base-rate forecast, log loss, calibration intercept/slope, and a reliability diagram.
2. **Ranking:** monotonic relationship between score/tier and observed outcome; AUROC is secondary because it measures ranking, not probability calibration.
3. **Trading utility:** net expectancy in R and dollars, target-before-stop rate, profit factor, median trade, maximum drawdown, MAE/MFE, time to resolution, and the share of ambiguous/blocked/ineligible events.

### Uncertainty and dependence

- Report Wilson intervals for simple proportions.
- Use a day/week block bootstrap for forecast scores and P&L because overlapping zones and adjacent trades are dependent; do not use an ordinary independent-row bootstrap.
- Report each timeframe separately. A pooled model must include timeframe and day/week clustering or a pre-specified hierarchical structure.
- Limit confirmatory subgroup tests to the registered list. Treat extra slicing as exploratory and adjust families of tests (for example, Holm) rather than selecting the best-looking result.

### Sample and review gates

- **Engineering pilot:** first 100 resolved eligible reaction trials per timeframe. Use only to verify logging, duplicate control, path resolution, and missingness. Do not tune the model from this gate.
- **Interim descriptive read:** 250 per timeframe, with uncertainty and no promotion decision.
- **Confirmatory gate:** at least 400 resolved eligible trials per timeframe **and** a two-sided 95% interval for the primary success rate no wider than 10 percentage points. Dependence can increase the required raw count.
- 60m may take materially longer than 1m. Publish its uncertainty rather than borrowing certainty from lower timeframes.
- A protocol/model change starts a new version. Do not retroactively relabel old forecasts.

### Promotion rule

No model advances beyond shadow/paper status unless all are true on untouched forward data:

- Brier skill score is positive versus the registered base-rate benchmark and its block-bootstrap 95% interval excludes zero.
- Overall absolute calibration error is no more than five percentage points, with no material tier inversion.
- Net one-contract expectancy after commissions and slippage is positive and its block-bootstrap lower 95% bound is above zero.
- Result is not carried by one session, one month, one news regime, or a small number of outliers.
- Operational error rates (late/missing/duplicate alerts, ambiguous paths, target reconstruction) stay below registered limits.
- Human review approves the next risk stage. No result automatically authorizes live execution.

## Chronological workflow

1. **Protocol lock:** approve the entry/expiry rules, session buckets, divergence definition, cost model, and promotion thresholds. Hash this document.
2. **Indicator instrumenting:** add a lab-only alert/export payload with immutable zone IDs, detection time, source timeframe, side/class, boundaries, score/tier, displayed probability, evidence source/sample count, bias, and opposite target ID/price.
3. **Repaint/replay audit:** compare realtime alerts with post-refresh history for at least five completed sessions on every timeframe. Any changed/disappeared zone is a documented mismatch.
4. **Data/rights gate:** select a licensed market-data path for outcome resolution and confirm retention/derived-use rights. Use AMP/CQG records as execution truth if actual paper/live orders are placed.
5. **Dry run:** collect without scoring for two weeks; verify clock synchronization, contract mapping, duplicates, and same-bar resolution.
6. **Forward pilot:** start the immutable v0.1 cohort. Keep analysis code blind to future rows and produce automated data-quality reports.
7. **Scheduled reports:** weekly operations report; monthly descriptive report; confirmatory report only at the sample/precision gate.
8. **Model update:** train/calibrate only on closed earlier cohorts, then activate a new model version prospectively. For historical development use rolling-origin evaluation, never random train/test shuffling.

## Minimum build slices

### Slice 1 — Research recorder

- Pine alert payload and schema validation.
- Append-only local event store.
- Zone lifecycle and deduplication.
- Static protocol/model registry.
- Basic dashboard for counts, missingness, unresolved events, and evidence links.

### Slice 2 — Outcome resolver

- Licensed tick/one-second path resolver.
- Fixed 30-tick stop and frozen opposite-target engine.
- Ambiguous-path handling and conservative sensitivity.
- MAE/MFE, slippage, commissions, and one-contract shadow/executable ledgers.

### Slice 3 — Statistical report

- Reliability plot, Brier/log scores, base-rate comparison, tier monotonicity.
- Timeframe/session/news/fib tables with uncertainty.
- Block-bootstrap intervals and protocol-deviation report.
- Version-to-version comparison without rewriting prior cohorts.

## Decisions to approve before implementation

1. Confirm the recommended first-touch reversal rule: BSL short / SSL long.
2. Confirm primary expiry: 20 source-timeframe bars.
3. Choose the exact session buckets in America/New_York.
4. Define divergence; recommended default is MYM-versus-MES confirmed-pivot divergence.
5. Supply the one-contract round-turn commission/fee schedule and default slippage assumption.
6. Choose the licensed outcome feed and document allowed retention/derived use.

## Research basis

- CME Group, *Micro E-mini Futures* contract specifications: MYM contract size, tick value, hours, quarterly months, and termination.
- TradingView, *Repainting*: confirmed-bar behavior, `request.security()` repainting, future leak, and pivot plotting in the past.
- Hyndman & Athanasopoulos, *Forecasting: Principles and Practice*, time-series cross-validation: every test observation must be forecast using only prior observations; use rolling forecasting origins.
- Brier (1950), *Verification of Forecasts Expressed in Terms of Probability*: proper probability-score foundation.
- Politis & Romano (1994), *The Stationary Bootstrap*: resampling for weakly dependent time series.
- Bailey et al. (2015), *The Probability of Backtest Overfitting*: repeated strategy/model selection can manufacture apparent performance.
- Official scheduled-event sources: U.S. Bureau of Labor Statistics, U.S. Bureau of Economic Analysis, and Federal Reserve FOMC calendars.

## Scope boundary

This plan measures a forecasting/trading hypothesis. It does not establish that the supplied probabilities are calibrated, that the strategy has an edge, or that live trading is suitable. Futures are leveraged and can lose more than the amount deposited. Implementation should begin in paper/shadow mode only.
