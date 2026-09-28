# Indicator and chart-tool design

Cleo can draft an indicator/tool after clarifying the chart platform, language/version, timeframe, inputs, expected display and whether it should alert, annotate, or backtest. A proposal does not imply that the indicator is installed or validated.

## Requirements

- State exact definition/formula, input series, timeframe and pivot/confirmation timing.
- Distinguish historical confirmed output from realtime unconfirmed output; document repaint/lookahead behavior, gaps and bar-close behavior.
- Use objective user-confirmed definitions for liquidity pools, SMC terms and support/resistance. Keep visible source levels distinct from generated overlays.
- Build with safe defaults and clear toggles/colors/labels. Preserve source chart and annotate only a new layer.
- Include test cases: trend, range, gaps, fast movement, partial bars, higher-timeframe requests, missing data, and replay/reload parity.
- If access allows, run the script through platform compiler/tests; otherwise say uncompiled. Do not claim performance from visual examples. Any backtest must use licensed inputs, realistic fees/slippage, no lookahead, and a held-out period.

## Current Cleo indicators

Mark reported adding RSI divergence plus 50/200 moving averages to MYM one-minute charts in the 2026-09-28 morning session. Length, MA type/source, RSI settings and custom divergence pivot rules were not captured; treat those chart interpretations as provisional. The 50/200 on a one-minute chart means bars of that chart interval only if that timeframe is confirmed.

## Sources

- TradingView Pine Script, [Repainting](https://www.tradingview.com/pine-script-docs/concepts/repainting/), accessed 2026-09-28.
- TradingView, [Moving Averages](https://www.tradingview.com/support/solutions/43000502589-moving-averages/), accessed 2026-09-28. Moving averages are lagging/context tools; do not imply they guarantee support or reversal.
