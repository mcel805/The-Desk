# Chart analysis and conditional trade review

## Purpose

Translate supplied charts/data into a source-bounded structure read and a decision process. This is market research and coaching, not a guarantee or an order instruction.

## Workflow

1. Record instrument, exact contract/continuous series, exchange/data source, timeframe, timezone, capture/cutoff, last complete bar and freshness. Note roll/adjustment and session if known.
2. Read higher timeframe before execution timeframe. Mark the selected 30m/1h level, whether price has reached it, and the lower-timeframe structure. Distinguish swing context from one-minute noise.
3. Record observations first; then interpretation; then the conditional scenario. State evidence against the preferred case.
4. For Mark's preferred HTF reversal, use `htf-to-1m-reversal.md`: a newly printed, confirmed 1M long liquidity level is required and supplies the hypothetical limit-entry reference. Keep the proposed trend-change test and unresolved zone class/boundary explicit. A wick/touch is not an automatic reversal.
5. Identify structural invalidation from the chart. Compare its distance to the user’s verified risk constraint. Show when there is insufficient room to the next opposing reference. Do not optimize a stop to preserve an attractive reward/risk ratio.
6. Offer the strongest alternate scenario and the price condition that distinguishes it. If neither has a clean condition, recommend waiting.
7. Save the source and output separately. Label all screenshot measurements approximate; retain capture provenance and chart contents byte-for-byte.

## Default market-structure read

When Mark asks Cleo to read a chart without naming a different method, use a technician's market-structure read. This is a read of the supplied chart and timeframe, not an implied trade setup:

1. **State:** classify the visible condition as trend, range, or transition; name the chart timeframe and data cutoff.
2. **Structure and location:** identify the confirmed swing sequence and where price sits relative to the visible range and nearest relevant level.
3. **Price behavior:** describe the latest impulse or pullback and any visible acceptance/rejection. Mention volume or momentum only if that data/study is supplied.
4. **Read and countercase:** say what structure currently favors, what argues against it, and one price condition that would change the read.
5. **Chart marks:** use the smallest set of native lines that makes the structure easy to see: key swing/level, nearest opposing reference, and a confirmed trendline when the pivot sequence supports it. Do not invent a higher-timeframe view from a single pane.

Keep the first readout to a headline, one short sentence, the strongest countercase, and one condition to watch. Explain only the evidence needed to support those conclusions; do not narrate internal workflow or expose private chain-of-thought. Keep trade plans, entries, stops, targets, and strategy labels out unless Mark asks for them.

## Visual review layout

Follow `chart-markup.md`. When the active chart interface and native drawing renderer are available, place Cleo’s sourced marks directly over that chart in its own independently hideable layer; preserve the source candles and user drawings. Show source, market/contract, timeframe, cutoff, and provisional/review status in the chart interface. Keep the read short beside the chart and mark explanation/provenance inspectable. A separate annotated page is a fallback for conversations that only provide an image or do not expose a chart renderer; label that limitation and keep screenshot-derived prices approximate.

For read-only requests, do not draw plan-only entry, trigger, stop, target, or order marks. Add those only for an explicitly requested paper plan and only when evidence anchors and the plan contract support them. Keep the strongest alternate case distinct and conditional.

For Mark’s color convention, use yellow=15m, purple=30m, orange=1h only when he has supplied/confirmed the key. Lines can be platform orders rather than indicator levels; verify before classifying them.

## Evaluation

Grade separately: evidence quality, setup logic, plan completeness, risk fit, execution, and outcome. Never grade a decision from only the final P&L. A later reversal after a stop is a review question; it is not sufficient evidence that the stop was “too close.”

## Sources

- TradingView, [How to read chart patterns](https://www.tradingview.com/support/solutions/43000759289-how-to-read-chart-patterns/), accessed 2026-09-28. Describes patterns as possible reversal/continuation/uncertainty, not certain outcomes.
- CFTC, [Futures Market Basics](https://www.cftc.gov/LearnAndProtect/EducationCenter/FuturesMarketBasics/index2.htm), accessed 2026-09-28. Futures are complex, volatile and risky; this is context for clear risk communication, not a strategy rule.
