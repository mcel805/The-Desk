# Read the Market v1

## Goal

Put **Read the Market** in Cleo's Quant Lab chat. One action collects the available Daily, 4H, 2H, 1H, 30M, 15M, 5M, 3M, 2M, and 1M stored snapshots through the active chart cutoff and asks Cleo for four headed sections in the chat. Supported active-chart marks use Quant Lab's existing Cleo chart markup and visibility controls.

## Interaction

1. The user selects **Read the Market** in the Quant Lab Cleo chat.
2. Quant Lab captures the active provider, symbol, chart timeframe, and cutoff, then requests up to 300 bars for each named timeframe from that same provider and symbol. Bars later than the active cutoff are excluded. Missing intervals remain unavailable; they are not resampled or invented.
3. The chat shows snapshot collection progress and sends the multi-timeframe data as chart context to Cleo. It shows concise workflow stages, never private chain-of-thought or invented activity.
4. Cleo returns four headed sections in the chat:
   - **Market Sentiment & Market Bias** — chart-derived price/volume tone, broader context, active structure, bullish and bearish cases, and the condition that changes the read. Macro/news sentiment is not implied unless it is separately sourced.
   - **Reading the Liquidity Levels** — selected 15M/30M/1H/4H levels, buy-side and sell-side pools, likely draw, lifecycle, overlap, and possible inducement (clearly marked as inference).
   - **Elliott Wave, Trend Change & Fibonacci** — provisional count and alternate, rule checks, swing/trend-change evidence, sourced retracement/extension anchors, and invalidation.
   - **Relative Volume & Divergence** — disclose a provisional RVOL20 (bar volume divided by the mean of the prior 20 completed bars on the same timeframe, without session-of-day normalization) and Wilder RSI14 divergence using matched confirmed 3-left/3-right pivots. Report coverage and bar-completion uncertainty; otherwise “not available / not checked.” This house calculation does not claim parity with an installed indicator.
5. Sourced active-chart marks use Quant Lab's existing Cleo chart markup and visibility controls. Marks apply only to the active chart and exact source/cutoff that produced them.
6. The readout ends with a short **Final Recommendation**. It is a conditional next-step summary, not an order.

## Output and evidence contract

The chat response carries the four narrative sections and may include Quant Lab's existing `cleo.chart-markup.v1` payload. The markup identifies the active chart by provider, symbol, timeframe, and cutoff; every anchor must reference an exact loaded active-chart bar and a price within that bar's range. Quant Lab validates it before drawing. A chart mismatch or invalid anchor leaves marks unapplied while preserving the text review.

Multitimeframe sources are snapshots of stored OHLCV, not proof of current or licensed live market access. The default analysis instruments/intervals are not fabricated if missing. 2H bars are used only when they are actually stored; do not synthesize them silently. RVOL20 and Wilder RSI14 are provisional house calculations, not a claim about a user-installed study; identify the exact series, pivot pairs, recognition bar and uncertainty. Order-book liquidity and trader positioning cannot be inferred from swing labels alone.

## Build scope

Implement the Quant Lab Cleo chat action, same-provider multi-timeframe snapshot collection, request context, four headed chat sections, workflow status, and source-bound active-chart markup through Quant Lab's existing Cleo renderer. Retain existing chart/user drawings. Do not add live monitoring, order entry, background polling, broker control, or performance claims.

## Acceptance

- One button triggers a read at the active symbol and cutoff and requests the ten named intervals.
- Missing interval data is surfaced in both the chat provenance and UI.
- The four analysis sections and a concise final recommendation render in Quant Lab's Cleo chat.
- Valid markup draws only on the exact active chart and follows Quant Lab's Cleo mark visibility controls.
- Invalid or stale markup cannot draw. Existing chart and user drawings are preserved.
- Chat activity labels show only real snapshot, handoff, and render stages, not chain-of-thought.
- All results are labeled research hypotheses and use paper/shadow boundaries.
