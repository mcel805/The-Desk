# Swing Lab · Market Synth A/B and volume integration

Research and implementation plan · October 25, 2026 · paper/shadow only.

## Decision

Include both as contextual features. Add genuine candle volume separately. Source inspection establishes that neither current Desk Pine script reads `volume`. Their colored waves and symbols cannot supply actual per-bar participation by themselves. Volume can accompany a shift, exhaustion, absorption, or continued displacement; its timing and usefulness on 1m remain hypotheses requiring forward observation.

The supplied screenshot identifies the desired presentation: Hyperliquid BTC, standard 1m chart, A ribbon and B oscillator, alongside the Swing Lab observer. It does not establish source calculations, signal accuracy or a future reversal. No chart price from that image is used as a research fixture.

## What the local scripts actually measure

Sources: `web/pine-examples/market-cipher-a.pine`, `market-cipher-b.pine` and the prior `MARKET-CIPHER.md` provenance record. These are independent Desk reconstructions; original commercial formulas were never supplied. This integration retains their definitions and names.

| Layer | Actual calculation at study defaults | Useful observation | Limitation |
| --- | --- | --- | --- |
| A ribbon | Close EMAs 5/11/15/18/21/24/28/34; bull when EMA5 >= EMA34 | Trend alignment, ribbon compression, reclaim and continuation context | Smoothed price; lagging and correlated with momentum |
| A green circle | RSI14 crosses above 50 and close > EMA34 | Recovery in slow-ribbon context | No volume or liquidity condition |
| A triangle / yellow diamond | EMA11 crosses EMA34 / EMA5 crosses EMA11 in a bull ribbon | Local trend transition or reacceleration | Crosses can whipsaw on 1m |
| A red / blood diamonds, X | Fast bearish crosses; RSI, close/EMA18, compression and upper wick qualifiers | Weakening upside delivery | Heuristics, not proof of manipulation, a crash or reversal |
| B blue waves | EMA9 of HLC3 and absolute deviation -> normalized CI -> EMA12; SMA3 signal | Momentum deceleration, crosses and oscillator pivots | Price-derived, not buying/selling volume |
| B yellow fast wave | Main minus signal | Momentum acceleration or turning ahead of the slower wave | Not VWAP; not volume weighted |
| B green/red flow | SMA60(150 × (close-open)/(high-low)) - 2.5 | Persistence of directional candle bodies | No volume input; not MFI, capital flow or bid/ask delta |
| B RSI / Stochastic RSI | RSI14; stochastic lookback40, K3/D3 | Relative momentum and saturation | Correlated price evidence; not independent votes |
| B dots / divergence | Main-signal crosses, extremes ±60, regular divergence between oscillator pivots with two bars each side | Candidate timing, price-momentum disagreement | Extreme conditions may persist; divergence is available only after confirmation |

On a 1m source, flow60 averages an hour of candle pressure. It is useful context but deliberately slow relative to one candle. A green dot is not a measured volume surge. A confirmed two-right-bar divergence is recognized at pivot-open + 3 minutes (the confirming bar close), never at its pivot origin.

## Added actual-volume evidence

Hyperliquid's gateway already maps `candleSnapshot.v` into each OHLCV bar. Keep provider units explicit as venue-local units; do not combine these values with another venue or treat them as global BTC/ETH volume. The current endpoint documentation exposes `v` but does not define aggressor splits. No conversion to dollar notional is asserted.

- Raw completed-candle volume and a 24-bar display; candle color follows body direction only.
- Relative volume = current completed volume / mean of the previous 20 completed bars. Excludes the evaluated bar from its own baseline.
- CMF20 = sum(volume × (2C-H-L)/(H-L)) / sum(volume). Zero-range multiplier is zero. This is volume-weighted close location, not measured aggressive buying/selling.
- MFI14 = 100 × positive typical-price-volume / (positive + negative typical-price-volume), using the direction of HLC3 vs the previous bar. Equal typical prices add neither side. No directional flow or all-zero volume produces unavailable, not a fabricated neutral reading.
- Signed-close-volume proxy = +volume/-volume based on close vs previous close, explicitly labeled proxy. It is not trade delta.
- Candidate A→B and developing B→latest volume totals and mean relative volume. Both endpoints are included, so overlapping leg totals must not be summed as disjoint volume. Missing anchor coverage is explicit and suppresses totals.

## Frozen pattern hypotheses · v1

1. High-volume lower/upper rejection: relative volume >=1.8, the relevant wick >=50% of range, and the close is in the opposite outer quartile. This is a candidate failed auction, not verified absorption.
2. High-volume expansion: relative volume >=1.8, absolute body/range >=0.6, and range >= the prior20 mean range. Up and down are symmetric.
3. Low-volume high/low extension: a fresh five-bar price extreme with relative volume <0.7. This can warn of weak participation but can also occur in a continuing quiet trend.
4. Jev participation choice: up/down swing exhaustion, up/down participation, or no_match. It considers the measured volume and proxies, A/B momentum, candidate leg context and already-known structure. Exhaustion requires context; a tag alone is insufficient.

Thresholds are research defaults, not fitted or established market constants. Evaluate contradictory cases: high-volume selling can accelerate a decline, and oversold waves plus falling volume can precede another lower low.

## Implementation and lifecycle

`SwingVolume` processes each new completed bar exactly once, beside the existing tracker. EMA state persists across requests rather than reseeding from a sliding provider window. Gaps reset rolling evidence. It uses standard OHLC and fixed source defaults, independent of chart indicator visibility or saved input edits; custom chart settings do not silently change the study.

Every prediction freezes versioned features, source hash, settings, history start, processed bars and completed cutoff. Twelve recent feature bars go to Jev; 24 go to the live panel/checkpoint. Raw candles continue in run_bars, and predictions retain the intermediate feature history. Forming bars remain separately marked unconfirmed. Do not extrapolate partial-minute volume as a completed-bar surge.

The new liquidity-study campaigns and Jev delivery/response/alignment questions remain intact. Volume is supporting evidence and never grants campaign eligibility or manual side permission.

The volume layer adds one independent Choice question in the existing Jev request;
the current question-pack revision is maintained in [SWING-TRACKER.md](SWING-TRACKER.md).
It does not add sampling slots or a second provider call. The larger state and extra
answer may cost more; the existing usage ledger measures returned token counts.
Existing lean/next-bar questions are told not to count price-derived layers as
independent volume confirmation. Typed output is not proof of forecast correctness.

The code hash includes the engine and the two Pine sources. New runs therefore form separate audit cohorts. The original tracker entry, stop, target, risk and management rules remain fixed. The UI exposes the latest raw statistics, per-bar table, symbols, hypotheses and Jev participation label. Older runs display missing evidence as unavailable; no new historical volume labels or model answers are fabricated into the original ledger.

The audit freezes the latest fresh features observed before entry, independently of Jev availability. Model participation labels also must arrive before entry. Pattern groups use the first entered plan per A/B opportunity, preserving ambiguity and unresolved outcomes. Raw feature labels are included in audit exports. The `swing-outcomes.2` outcome rules are unchanged; the added `volume_patterns` field is additive, versioned through its own feature version and code cohort.

## Forward evaluation plan

Keep the existing 50-forward-leg data-quality checkpoint and 200-leg exploratory review. Study reversal and continuation cases separately and group by market, configuration, code and prompt. Inspect exhaustion vs continuation, false reversals, time from hypothesis to structural response, failed high-volume rejections, and price-volume disagreement. One-minute bars can be noisy; adjacent observations and multiple setups within a swing are dependent.

The new grouped outcomes are descriptive, not a controlled comparison or a causal estimate of Jev improvement. Compare forecast accuracy/Brier to the existing last-candle baseline; a later frozen, chronologically held-out study with matched market conditions is needed to compare price-only, A/B-only and A/B-plus-volume observers. Avoid tuning and evaluating on the same swings. There are no verified live forward results for this new feature yet.

## Activation

Install source after isolated checks. The existing BTC collector was active during this work, so do not hot-reload its prompt or reset its state mid-run. Activation requires ending that run cleanly, restarting the server with the same protected data directory, and explicitly starting a new observation run. Existing runs and raw inputs remain archived. The usual paused-after-restart behavior remains in force.

## Sources reviewed

- [Market Cipher product overview](https://marketciphertrading.com/) — commercial A trend / B oscillator descriptions, not executable formulas or verified performance.
- [Market Cipher money-flow explanation](https://marketciphertrading.com/what-is-money-flow-and-why-does-it-matter/) — general price/volume context; does not establish the Desk reconstruction's formula.
- [TradingView MFI calculation](https://www.tradingview.com/support/solutions/43000502348-money-flow-mfi/) — typical price × volume, positive/negative flow and bounded oscillator.
- [TradingView CMF calculation](https://www.tradingview.com/support/solutions/43000501974-chaikin-money-flow-cmf/) — close-location volume, rolling normalization, false-cross/gap limitations.
- [Hyperliquid candle snapshot](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint#candle-snapshot) — source OHLCV response and bounded history.
- [TypeSafe System One](https://docs.typesafe.ai/api/system-one), [Choice](https://docs.typesafe.ai/primitives/choice) and [feature discovery cookbook](https://docs.typesafe.ai/cookbooks/autoresearch_feature_discovery) — typed independent questions, reusable features and held-out evaluation. No automatic feature optimization or training is enabled here.

## Validation

See the accompanying acceptance record for final commands, counts and UI captures. Tests cover causal prefixes, gap resets, no-volume cases, actual-volume sensitivity, per-candidate coverage, persistence, pre-entry timing, safe rendering and numerical comparison against the actual Desk Pine runtime. These checks do not establish commercial Cipher equivalence, TradingView parity, a profitable edge or deployed behavior.
