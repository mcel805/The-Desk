# Quant indicator design and development

Use this workflow when turning a market observation into an indicator specification, implementation, or measured improvement. Keep a proposed indicator, working code, platform-compiled code, visually accepted output, and scientifically measured improvement as distinct states.

## Define the indicator

Start with one declared purpose for each indicator version. State whether the output is descriptive, an event detector, a numeric estimate, or a decision-support feature. Define:

- Input series, source, instrument/contract, timeframe, session, and required history.
- Formula or event rule, parameters, units, valid range, and output/drawing behavior.
- When each value becomes knowable: intrabar, bar close, or after a later confirmation window.
- Missing-data, gap, warm-up, session boundary, higher-timeframe alignment, and roll handling.
- Whether past plots can move or disappear because of pivots, lookahead, recalculation, or revised inputs.
- Intended user decision and known cases where the value should be ignored.

Prefer a small number of interpretable outputs tied to the purpose. A chart overlay is not an entry by itself. Keep user-defined liquidity/SMC terms separate from generally accepted definitions, and identify the exact source of each input.

## Build and inspect

When code is requested and the active workspace permits implementation, name the platform, language/version, files, and acceptance behavior first. Keep the accepted version recoverable; give the candidate a version or change identity. Build deterministic fixtures for ordinary conditions and relevant boundaries such as partial bars, gaps, missing values, fast movement, session changes, multi-timeframe data, and replay/reload behavior.

Check causal availability at the decision cutoff. Verify bar-close and pivot confirmation timing, avoid future leakage/lookahead, and distinguish values drawn at a historical pivot from the later time they became knowable. Preserve source charts and add a separate overlay/layer. Report exactly what was run: syntax check, unit test, platform compiler, replay, or visual review. If a required platform or data source is unavailable, label the result uncompiled or unverified.

## Keep implementation and measurement distinct

For an improvement to an existing Count Desk indicator, identify its ID, purpose, accepted version, and chart layer before proposing changes. Follow the Indicator Agent's one-indicator ownership when that workflow is available; do not silently change the purpose or accepted baseline. Cleo may frame the problem, write a falsifiable build proposal, and implement a requested candidate when the environment allows. The Chief Scientist defines the measurement target and frozen protocol; the Lab records the study; independent review and human visual validation remain separate gates.

Before a performance study, define a suitable independent reference outcome, eligible cohort, baseline and simple comparator, cutoff, partitions, primary measure, guardrails, sample/uncertainty rule, and source/use rights. Preserve emitted and non-emitted cases. If there is no defensible outcome label, describe deterministic correctness, timing, coverage, rendering, or usability; do not claim predictive accuracy or trading edge. Any resulting strategy test is a separate study with frozen entries, exits, fills, costs, and risk.

## Handoff summary

For a proposed or implemented indicator, report its purpose and version, exact rule and settings, input/source assumptions, availability and repaint behavior, files changed, tests/compiler/replay actually completed, known limitations, and next validation gate. Mark performance **not measured** unless a qualifying frozen study returned a result.
