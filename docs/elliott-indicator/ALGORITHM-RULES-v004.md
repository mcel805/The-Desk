# Batty - Elliot Wave: algorithm contract v004

Implementation: releases/v0.4.3-rules-audit. Status: experimental; local checks only. This is an independently implemented, restricted Elliott grammar, not WaveBasis technology or a complete Elliott parser.

## 1. Data and causality

Use standard OHLC candles and only closed bars. Preserve symbol, timeframe, session, adjustment state when supplied, source, timestamps and SHA-256 for fixtures. Never infer exact OHLC from screenshots. Pivot labels are back-anchored but become available only after their confirmation bars. Retained history and search caps are disclosed. Display dates and number of visible generations do not change analysis. All loaded history is not unlimited exchange history.

The local MYM 60-minute fixture contains 500 retrieved bars. The last is excluded conservatively. Its timestamps extend through September 14 UTC; this is not the exact earlier screenshot dataset. No 4-hour dataset or session-aligned reconstruction is claimed. Read-only retrieval did not transmit Pine source.

## 2. Hard rules versus restricted grammar

A standard impulse uses five legs. Wave 2 cannot pass wave 1's origin; wave 3 must exceed wave 1, and cannot be shorter than both waves 1 and 5; wave 4 cannot overlap wave 1. Direction is normalized so the same checks apply up and down. Chronology and alternating anchor sides must agree. Equal-length motive waves are allowed. Price rules operate on tick prices, independently of log/linear Fibonacci projections.

This implementation additionally requires a nontruncated fifth wave and strict endpoint containment of intervening retained extrema. These are restrictions of this implementation, not universal rules covering every Elliott pattern. Violations cannot rule out a diagonal, truncated fifth, expanded correction, or a different anchor grouping.

Supported correction: zigzag, 5-3-5, with B inside A and C beyond A. Supported correction children are themselves restricted to zigzags. Flats (3-3-5), triangles (3-3-3-3-3), combinations, diagonals and truncations remain unimplemented. Do not mislabel these as zigzags or call their absence a hard Elliott failure.

Fibonacci ratios, alternation and relative duration are guidelines, never replacements for hard-rule validation. Rank is heuristic, not empirical probability.

References: [WaveBasis core rules](https://wavebasis.com/docs/frequently-asked-questions/automatic-wave-counts/what-are-the-core-elliott-wave-rules/), [Elliott Wave International extensions](https://www.elliottwave.com/waveopedia/extension/), [Elliott Wave International alternation](https://www.elliottwave.com/waveopedia/alternation/).

## 3. Hierarchy and evidence

Build candidate parent geometry, search exact-endpoint children, then promote only after evidence checks. Every child must have the correct family, lower degree, matching endpoint times AND prices, and required completed leg count. Impulse children alternate motive/corrective; zigzag children are motive/corrective/motive. Validate one or two requested child generations; deeper subdivisions are explicitly unverified. Three visible layers means three degrees, not three subwaves per impulse.

A developing parent can have a completed prefix; do not mark its future legs complete. Missing required evidence is unresolved. Disconnected local trees must not be presented as proven children of a global count. Primary forecast origins are rendered with their actual child links and disclose their independent local context in tooltips.

## 4. Bounded search

Search consecutive and alternative anchor groupings. Child searches retain mandatory parent endpoints. Allocate recent candidates by recency rank interleaved across scales. Limit work per child span (default 160 edges) as well as the global budget. Exhaustion means SEARCH_LIMIT, not RULE_FAIL. This improves opportunity distribution; it can also leave a complex span unfinished sooner. Increasing the per-span limit trades breadth for depth.

Update evidence ranking merit when missing child links are added. Re-evaluate evidence after enrichment, then select the local run. Coverage still includes unresolved gaps; it is not a measure of predictive accuracy.

## 5. Two future hypotheses

Search recent audited candidates independently of the four retained historical coverage interpretations. Evaluate at most 96 candidates ranked by latest endpoint, then geometric merit. Automatic mode chooses the degree of the first eligible scenario, then seeks a distinct second scenario at that degree. This is recency ordering, not a statistical likelihood ranking. A manually selected forecast degree restricts the search.

Require subdivision support, valid target/invalidation direction, no intervening invalidation, age within the configured limit, an unreached remaining target, and target distance within the ATR limit. De-duplicate both anchor keys and equivalent family/stage/direction/target/invalidation. Two paths may point in the same direction. Never fabricate the opposite direction or substitute breakout arrows for a missing Elliott scenario.

Orange projections are conditional and timing is schematic. One available scenario is rendered alone; zero produces an explanation. The current grammar cannot guarantee two supported paths on every chart. Optional structure-only scenarios remain explicitly separate and off by default.

## 6. Failure states and clean presentation

Use big adjustable plain wave symbols, degree colors and thin connectors. Details belong in hover text and optional Pine Logs. Report RULE_FAIL, ATTACHMENT_FAIL, SEARCH_LIMIT, DATA_DEPTH, ANCHORS_MISSING, ANCHORS_INSUFFICIENT, or GRAMMAR_OR_SEARCH_GAP. The last code deliberately does not guess which missing family occurred.

The compact forecast rows distinguish no recent candidates, unresolved subdivisions, expired/invalidated candidates, distant targets, and no distinct alternative. These are dominant observed reasons, not exhaustive rejection distributions; inspect the diagnostic counters for mixed failures.

## 7. Lock, measurement and acceptance

Freeze at an explicit closed-bar timestamp using prefix-only information. Later bars must not move the locked anchors, targets or invalidation. Track target first, invalidation first, ambiguous same-bar touches, or expiry. These outcomes do not prove complete path success or profitability. No calibrated probabilities, daily-profit guarantee, or trading edge is claimed.

Release acceptance requires native user compilation and replay on MYM Daily, 4H and 1H using fixed data and settings; inspect exact anchors, child attachment, labels, future visibility, and immutable lock behavior. Compare the same cutoff before and after, not different zooms/data ranges. Local Python tests and the BTC reference artwork cannot satisfy native acceptance.

Next grammar expansion must implement one family end to end: numerical rules, child-family mapping, endpoint exceptions, ranking, forecasts, rejection codes and adversarial fixtures. Do not add a permissive ABC fallback to achieve visual coverage.
