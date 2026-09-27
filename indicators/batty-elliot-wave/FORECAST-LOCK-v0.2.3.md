# Batty - Elliot Wave v0.2.3 — conditional forecast lock

## Controls
1. Enable **Future wave labels and conditional path** in section 03.
2. Choose Forecast degree: 0 uses the largest admissible degree found in the selected history; an explicit value selects a scale.
3. P1 is amber, P2 orange. They are distinct candidates at the same degree, drawn from the four retained history interpretations. A missing second candidate stays missing. They are not statistically ranked probabilities.
4. To freeze, select **Lock time**, then enable **LOCK paths at selected time**. The first eligible candle closing at or after that time captures the candidates using only the prefix available then. Keep Frozen cutoff = 0 for continuing analysis.
5. Keep the lock enabled while subsequent candles print. Disable it to return to updating projections. Changing the lock time starts a different experiment; it replaces the displayed experiment.

Pine exposes these controls in indicator settings, not an interactive chart button. Timestamp inputs survive normal settings persistence. A zero timestamp cannot lock. A lock before loaded history or beyond the analysis cutoff cannot be reconstructed. A lock with no valid candidate remains empty; it does not wait for a favorable later count.

## Results
Each locked candidate reports first-target reached, invalidation first, expired, or ambiguous when a candle touches both levels. Observations begin on the next bar, expire after the configured number of chart bars, and stop at the first terminal result. MFE/MAE are measured in units of the initial distance to invalidation (R); these are scenario excursions, not trade P&L. They include the whole terminal candle because intrabar order is unavailable.

The projected continuation vertices remain illustrative conditional Fibonacci paths. The report does **not** measure success of every future wave or forecast timing. Horizontal spacing is schematic. No calibrated probability, statistical edge, or daily-profit claim is supported by one locked pair. Historical locks are retrospective experiments selected by the user, not prospective evidence. Track a predeclared series of locks and out-of-sample results before estimating edge.

## Reproducibility and limitations
The snapshot is reconstructed from a historical prefix on reload. Keep symbol, timeframe, analysis inputs, code version, and dataset unchanged. A revised feed, more loaded history, or changed settings can produce different candidates. This is not an external immutable experiment archive. JSON alerts can emit lock/outcome events in realtime when enabled, but require an alert and external storage for a durable ledger. Changing to a lower timeframe recalculates that timeframe; this release does not transport the locked Daily path into another chart. Keep the Daily chart alongside execution charts.

The full-history count grammar is unchanged from v0.2.2: unresolved sections and missing subdivisions remain disclosed. This feature does not fix the seven unresolved root legs shown in the supplied Daily screenshot. Large adjustable labels and degree colors are retained. Both forecast alternatives now use orange-family colors and distinct line styles. Historic lines reserve capacity for future overlays.

## Verification
52 local Python/reference and source-contract tests pass. These cover the prior history/array repairs plus target-first, invalidation-first, ambiguity, expiry, bearish direction, and the freeze contract. They are not a Pine compiler or TradingView runtime test. External static analysis was blocked by automatic approval review; compilation and rendered proof remain pending authorization to send the source.

Acceptance checks after compilation: compare locked vertices before/after several new candles; confirm reload with unchanged settings reproduces them; toggle visibility without changing the anchor; verify empty capture remains empty; test same-bar ambiguity and expiry; verify no duplicate second candidate; test one/no candidate and labels at maximum density. Do not describe these as passed until performed in TradingView.

Reference: https://www.tradingview.com/pine-script-docs/concepts/inputs/
