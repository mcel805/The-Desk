# MYM Daily count audit and v0.2.2 visual update

## Verdict

**3/10 for completeness and usability of the supplied v0.2.1 output. This is an analyst's qualitative readiness grade, not an accuracy percentage or forecast probability.** I would not accept this as a complete, validated Elliott Wave interpretation. Individual patterns may be plausible, but the chart does not establish the complete parent count or its required subdivisions.

The screenshot reports MYM1! Daily, 1,852 closed bars, a retained pivot range of June 2, 2019 to August 27, 2026, a cutoff of September 11, 2026 at 16:00, four computed swing scales, and a selected root at L3. It explicitly reports **2/9 root legs interpreted and seven unresolved**. That is approximately 22% root-leg coverage, not 22% forecasting accuracy. The target/invalidation readout appears to be 50,607 / 54,885 for a candidate downward wave 3. These are read from the supplied historical screenshot, not a fresh market quote or independently recalculated target.

## Are the counts right?

There is insufficient evidence to say yes. An A-B-C label sequence is not enough to establish a zigzag. Under the traditional template, A and C need motive structure and B needs corrective structure: **5-3-5**. An impulse requires **5-3-5-3-5**, alongside its price rules: wave 2 cannot cross the origin, wave 3 must advance beyond wave 1 and cannot be the shortest actionary wave, and wave 4 must not overlap wave 1 under this strict implementation. [1,2]

The code checks coarse endpoint geometry and links exact lower-scale child patterns where found. Missing children and finer subdivisions remain unknown. It does not validate every visible label recursively. It supports only a limited impulse/zigzag grammar. These limits are the principal reason that a chart with many labels still is not a complete count.

| Region visible in the supplied snapshot | Assessment |
|---|---|
| Early 2020 decline and the major 2020 low | Root context is unresolved. The isolated C? near the left boundary has insufficient preceding structure visible here to certify its placement. |
| Advance from the 2020 low into 2021 | A-B-C candidates alone do not establish whether the larger move is corrective or part of a developing impulse. Larger-parent placement and actionary subdivisions are missing. An upward ABC is not inherently invalid; it requires the right context. |
| Late 2021 through the 2022 decline | The visible A-B-C arrangement is geometrically plausible as a correction. Its internal 5-3-5 structure and relationship to the prior completed motive count are not established by the image. |
| 2023 through the 2025 advance | Several local A-B-C sequences appear. They cannot be concatenated into proof of a single higher-degree wave. The dotted unresolved spans are material gaps, not validated connecting waves. |
| Latest 2026 pullback near the highs | A proposed 1-2 can share endpoint geometry with A-B. The selected wave-3 projection is one interpretation, not a confirmed bearish impulse. Two labeled legs cannot establish the final wave-3-length or wave-4-overlap tests. |

The broad visible history advances toward progressively higher major highs; the current bearish local scenario must be reconciled with that larger context. This does not itself invalidate a bearish interpretation, but the seven unresolved root legs mean that the indicator has not provided the reconciliation.

Exact price-rule grading for every label would require the original OHLC, pivot IDs, settings and futures adjustment/session context. This is a screenshot-plus-source audit, not a numerical re-count of the complete MYM dataset. In particular, the displayed B-ADJ continuous-futures history must not be compared to unrelated unadjusted contract prices.

## Are there three subwaves?

There are two different questions:

- **Three waves in a correction:** a zigzag has A, B and C at one degree, with 5-3-5 subdivisions. Three letters do not mean three nested degrees.
- **Three nested display layers:** the default requests the root plus two descendant layers, where those descendants exist. Four computed scales does not prove four complete Elliott degrees; setting the display to three does not guarantee three validated layers throughout the chart.

The screenshot contains different label tiers, but it does not demonstrate three validated nested layers across the history. Local counts drawn inside an unresolved parent region were not explicitly distinguished enough. v0.2.2 now prefixes those labels with **~** and states the unresolved parent context in their tooltips; this flag is inherited by their descendants. The panel also reports how many label depths were actually shown versus requested. Shown depth still is not a subdivision-validity score.

## What needs fixing next

1. **Recover a coherent parent structure.** Improve admissible-span search and pivot alternatives while preserving hard-rule rejection. Do not improve the coverage number by inventing labels.
2. **Expand corrective grammar with tests.** Flats, triangles, diagonals and combinations are currently unsupported. Implement their subdivision and position rules, rather than treating every three-swing move as a verified zigzag.
3. **Resolve direct and finer child evidence.** A parent needs both motive and corrective child support. The current evidence count is only direct-child coverage and must not be advertised as complete recursive validation.
4. **Expose genuine alternative implications.** Primary and Alt 1 having the same 2/9 coverage does not mean their patterns are identical. The actual 1-2 versus A-B distinction and resulting future-wave hypotheses matter more than similar coverage totals.
5. **Validate on Daily and 4H with exact data and replay.** Add expert-labeled cutoffs, failed/ambiguous forecasts and retained count revisions before claiming an accuracy advantage. Attractive styling is not evidence of an edge.

## Changes implemented in v0.2.2

- Independent Tiny/Small/Normal/Large/Huge controls for parent, first-child, finer-child and future labels. Defaults are Huge / Large / Normal / Large, replacing the small lower-tier labels.
- Adjustable label spacing and optional tinted badges with adjustable transparency.
- Vivid degree colors: cyan parent, gold first child and violet fine labels. Optional teal/coral direction theme and custom degree colors.
- Brighter one-pixel connectors with adjustable transparency. No filled chart zones or candle recoloring.
- Adjustable panel text and four corner positions; bottom right and compact display are the defaults.
- Explicit INCOMPLETE status where root gaps remain, direct-child evidence in scenario rows, visible/requested label-depth reporting and two-leg ambiguity in tooltips.
- The compact panel retains the selected interpretation, cutoff and any truncation warning.

These choices follow the general goal of a clean, colored analytical overlay with distinct patterns and projections; they are an independent Batty design, not LuxAlgo code or a claim of identical appearance. LuxAlgo's documentation also distinguishes developing wave labels, invalidation and Fibonacci levels. [3]

The count-selection engine and target formulas are unchanged in this visual/diagnostic patch. It **does not repair the seven unresolved root legs or establish more accurate predictions**. The current source remains provisional; this update has not been visually verified in TradingView.

## Sources

1. Elliott Wave International, [Impulse](https://www.elliottwave.com/waveopedia/impulse/).
2. Elliott Wave International, [Zigzags](https://www.elliottwave.com/waveopedia/zigzags/).
3. LuxAlgo, [Elliott Wave indicator](https://www.luxalgo.com/library/indicator/Elliott-Wave/).
4. TradingView, [Text and shapes](https://www.tradingview.com/pine-script-docs/visuals/text-and-shapes/).
