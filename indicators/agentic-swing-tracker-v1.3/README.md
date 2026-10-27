# Agentic Swing Tracker 1.3 — warning evidence

New standalone Pine v6 delivery for Mark's one-minute swing research. The prior v1.2 file is unchanged. This is an indicator: it places no orders and adds no automatic entry/stop permission. The warning score is not a reversal probability.

## Install

1. Open `Agentic_Swing_Tracker_v1_3.pine` in a new TradingView Pine indicator. Save privately and select Add to chart on standard MYM one-minute candles. Keep v1.2 saved; hide its instance to avoid duplicate panels after confirming the new script works.
2. Group **09 · Swing warning evidence** contains the new settings. Automatic delivery follows a working one-minute direction; the original selected parent timeframe and trade permission remain separate.
3. All eight warning calculations are present. Momentum is on; volume is optional and off by default. Enable volume only with trustworthy futures volume. Its full-minute comparison is deliberately unavailable on forming bars.
4. A location warning needs a declared upper/lower price and declaration time, or explicitly selected Liquidity sources and the linked-level option. Unavailable levels are shown as unavailable. A manual declaration time is a user assertion. Linked producer original known-at history cannot be verified from a scalar plot.
5. Warnings are advisory. `SW` entries, original stops, targets, budgets and shadow management remain in the separately gated original tracker engine.

## What is calculated

| Tag | Closed-bar calculation | Initial threshold |
|---|---|---|
| SLOW | Signed close progress/minute over the latest window divided by the preceding equal window. Negative progress is a direction-change observation, not same-direction deceleration. | Ratio below 0.70; denominator must exceed a tick/window floor. |
| CHOP | Absolute net close change / sum of absolute close changes, plus mean intersection/minimum-range overlap of adjacent candles. | Efficiency below 0.45 and overlap at least 0.55. |
| REJECT | Opposing wick/range plus weak close, with the current wick near the recent extreme. | Wick at least 0.45, close in adverse half, wick within 0.5 mean true range of recent extreme. |
| EXTENDED | Directional distance from the observed campaign's rolling base, divided by arithmetic mean true range. | At least 3.0; context only. |
| LEVEL | Run/contact of a reference known before the bar, followed by a close back on the rejection side. | Up to 3 bars retention; acceptance clears the warning. No unseen orders are asserted. |
| DIVERGENCE | A new price extreme beyond a previously confirmed same-side pivot, without corresponding rolling momentum balance. | Difference at least 5 balance points. |
| EFFORT | Current full-minute volume / mean of preceding full-minute volumes, with little candle-body progress near an extreme. | At least 1.5 relative volume, body/range below 0.35. Absorption is not proven. |
| STRUCTURE | Close through prior three-bar micro boundary; then a recognized protected pivot; then failed reclaim OR sustained departure in the opposite direction. | Tick-aware close thresholds; default sustained period is 2 bars after protected break. |

Default windows: delivery 5 bars, range normalization 14, warning pivots 2 bars each side, momentum 14, prior-volume baseline 20. All thresholds are exposed research settings, not optimized parameters. Momentum balance is `100 * sum(positive close changes) / sum(abs(close changes))`, with 50 for no movement; it is not Wilder RSI. Normalization uses an arithmetic true-range average rather than Wilder ATR smoothing.

Automatic warning delivery starts from the signed five-bar move after warmup. It does not claim that a completed structural swing was already known at the historical extreme. Protected-level failure is a separate state. After a confirmed local turn, the next completed bar starts a new opposite-direction warning campaign. Parent context remains in the original panel. Track UP / Track DOWN freeze the observed research direction for studying one delivery leg; these are not trade permissions.

## Warning lifecycle and chart

Each feature has a single active episode. START, severity UPDATE, CLEARED and UNAVAILABLE records retain episode ID, campaign, origin, known time, values, baseline and threshold. Intrabar observations have separate live IDs and first-observed times; confirmation is stamped later. Repaired evidence clears rather than accumulating forever. Old cleared tags become gray; the history filter can hide them. Chart labels are bounded, and show the recognition event at its actual bar, not offset onto a prior pivot.

The bottom-left panel shows closed warning pressure, available/active families, delivery support, provisional warnings, protected level and source-clock freshness. The default maximum is 40 visible history labels (configurable to 90); recent event history retains 180 records. A live provisional label describes the latest sampled forming bar. It can disappear before close. Reloading changes/reconstructs the in-memory history; durable records require externally saving alert messages.

Warnings are grouped into six families. SLOW, CHOP and DIVERGENCE share **one capped delivery/momentum contribution**. Rejection, extension, location, volume and structure each contribute separately. Default family weights are 2, 2, 1, 2, 1, 3 and are editable. Feature severity is capped at 2 for pressure even when structure reaches stage 3. The denominator uses only available families. Coverage is therefore always displayed. Changing inputs or availability changes score comparability; exported feature configuration prevents combining incompatible observations in a probability model. Zero total weight gives unavailable pressure, not zero reversal risk.

Delivery support separately measures efficient forward movement, a strong directional body/close, protected-level respect and repair of a broken boundary. The word delivery is intentional: support for a DOWN swing is bearish support, not bullish support.

## Live sampling and alert records

`varip` retains a receipt per 15-second wall-clock slot. The first incoming update in each slot can generate one provisional assessment. No ticks means no new observation; Pine has no guaranteed 15-second timer. Historical one-minute OHLC does not reconstruct the four intrabar paths. The legacy engine still commits at candle close.

To record observations, enable **Emit batched warning observation JSON**, then create an **Any alert() function call** alert. No alert/webhook is configured by these files. Warning batches contain current forming/closed status, source clocks, full feature config, pressure, available coverage, live episode IDs, recent warning events and an embedded last closed observation. The nested closed observation allows later scoring even when the stream's first update in a slot is intrabar. A consumer keeps the first received closed observation for each symbol/cutoff, rather than counting it four times.

Warning stream mode replaces the legacy per-event `alert()` JSON channel while the warning layer is enabled, to avoid a per-event burst plus a four-per-minute stream. Existing LONG/SHORT/BE `alertcondition` choices remain separate. Leave warning stream off to retain the old dynamic-event channel. Alerts must be recreated after changing script/inputs because TradingView alerts preserve a script snapshot. No actual broker order or fill is inferred from any message.

## Probability research tools

`warning-engine.mjs` is a deterministic reference observer with explicit feed clocks, missing-data handling and provisional observations. It has no market/broker adapter. `reversal-study.mjs` labels frozen reversal-distance outcomes and fits empirical score buckets with chronological held-out-session validation. It does not train on the screenshots or deliver a fitted MYM model. Pine cannot read a local JSON model directly; its panel intentionally remains UNCALIBRATED. No paid Jev calls are required or made.

Default **research outcome** for an UP observation: fall 1.0 current mean true range before rising 0.5 range, within 10 future full minutes. Mirror for DOWN. These are labeling settings, not stop/target advice. Barriers are frozen from the observation price. For delayed receipts, scoring starts at the next full minute at/after receipt. Provisional intrabar outcomes remain unscorable without finer path data. Both barriers inside one candle remain ambiguous; gaps and unfinished horizons remain unavailable.

Fit gates default to 30 training sessions, 20 supported held-out sessions and 10 comparable training sessions per score bucket. Overlapping training outcomes are purged at the holdout boundary. A model must beat the training-base-rate Brier baseline on holdout and satisfy weighted bucket calibration error at most 0.10. These are transparent research gates, not evidence that those sample sizes establish a trading edge. The returned probability refers only to the frozen distance/horizon event. Forecasts within sessions remain dependent; session-separated evaluation reduces leakage but does not remove all market dependence.

```sh
node study-cli.mjs normalize saved-alerts.ndjson > observations.json
node study-cli.mjs label observations.json future-1m-bars.json > labeled.json
node study-cli.mjs fit labeled.json > research-model.json
node study-cli.mjs predict research-model.json next-observation.json
```

The library APIs accept custom frozen definitions and fit gates. The CLI uses the documented defaults. Missing samples produce an unavailable probability. A validated model can predict only observations after its validation cutoff, with the exact same instrument and feature configuration. Availability masks are part of each forecast bucket so identical scores with different missing families are not pooled. Daily level prices and declaration times are observation data, not feature-rule configuration, so changing the day's level does not prevent learning across sessions. Tests use clearly synthetic datasets to exercise success/failure; they are not MYM calibration.

## Build and test

```sh
python3 build.py
node tests/run-all.mjs
```

Node 22+ and the locally installed Vela/PineTS runtime are used. `tests/runtime.mjs` points to the existing local installation, with no dependency install or network request. The standalone Pine file itself has no local runtime dependency. The baseline copy is byte-for-byte v1.2 and is used for direct behavior comparisons.

The suite executes actual generated Pine under Vela/PineTS, compares numerical features with the reference, checks future-prefix invariance, directions, level provenance, missing volume, gaps, warning clearing and legacy permissions/risk/management. The inherited v1.1 sweep fixture explicitly uses parent sensitivity 3 because v1.2's default 4 recognizes the parent late enough to restart that child; the separate exact-v1.2 comparison retains defaults. A fresh staircase fixture supplies actual higher highs/lows for continuation tests. No source-string tests are used as evidence of behavior.

`validation-report.json` binds the results to the generated Pine SHA-256. Local Pine execution is not native TradingView compilation. The live adapter probe records any limitation in realtime bar-state behavior rather than declaring four native samples verified. Native app automation could read the chart but returned `noWindowsAvailable` for chart input, so native compile/replay and live alert delivery remain unverified. The no-mistakes pipeline could not attach because this artifact workspace is not a Git repository with an origin; no push, PR or CI is claimed.

Official semantics: [Pine execution model](https://www.tradingview.com/pine-script-docs/language/execution-model/), [varip declarations](https://www.tradingview.com/pine-script-docs/language/variable-declarations/), [alerts](https://www.tradingview.com/pine-script-docs/concepts/alerts/).

## Desk integration

The repository delivery is integrated with the independent Swing Lab collector.
See [Desk observation flow](../../apps/the-desk/SWING-WARNINGS.md). The native
TradingView alert channel remains a separate source; this does not create a MYM
feed or import native alert observations into the Desk server. The original
standalone validation receipt predates Git packaging; current repository
validation and publication evidence is recorded with the feature commit.
