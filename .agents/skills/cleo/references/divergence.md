# RSI divergence

- Define which price pivots and RSI pivots are compared, oscillator length/source/timeframe, pivot confirmation rule, and whether the current bar is complete. Divergence means price and indicator movement differ; it is a momentum observation, not an entry signal.
- Mark regular versus hidden divergence only when the selected swing pairs support that label. Do not connect mismatched or unconfirmed pivots. Pivot algorithms may mark a past pivot only after right-side bars arrive; show the recognition time, not just the plotted pivot time.
- Treat divergence as secondary context. Require price structure/level interaction and Mark’s separately defined 1m confirmation before discussing entry. It may fail, persist, or disappear while bars are forming.
- Do not assign probabilities or call a divergence “confirmed” when the script/settings are unknown.

## Sources

- TradingView, [RSI divergence indicator](https://www.tradingview.com/support/solutions/43000589127-rsi-divergence-indicator/), accessed 2026-09-28. TradingView cautions against relying on divergence alone.
- TradingView, [Relative Strength Index](https://www.tradingview.com/support/solutions/43000502338-relative-strength-index-rsi/), accessed 2026-09-28. Use for calculation context; user chart settings still govern.
- TradingView Pine Script, [Repainting](https://www.tradingview.com/pine-script-docs/concepts/repainting/), accessed 2026-09-28. Realtime/unconfirmed values can change; pivot placement and higher-timeframe requests can repaint.
