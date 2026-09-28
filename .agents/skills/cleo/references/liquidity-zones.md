# Liquidity zones and Mark’s preferred setup

## Mark’s current stated approach

This is Mark’s playbook hypothesis, not a proven edge. He usually prefers an identified 30-minute or 1-hour liquidity level. His chart color key when confirmed: yellow=15m, purple=30m, orange=1h. Intended sequence: map higher-timeframe context → wait for price to interact with a selected 30m/1h level → inspect 1m price action → wait for a directional reversal confirmation → only then evaluate an entry. The exact 1m confirmation rule is not yet specified and must not be invented.

If no 30m/1h level is available, trades based on higher-timeframe direction plus 1m levels are a separate fallback. Tag and measure them separately; do not say they follow or validate the preferred playbook.

## Map and read levels

- Identify the level’s source timeframe, origin, type (e.g., prior swing high/low, equal highs/lows, range edge, indicator-defined pool), and whether it is fresh, touched, swept or invalidated based on available bars.
- Treat a line as an area when uncertainty/tick size/data justify it. Do not infer resting stop orders or hidden participants solely from a chart level.
- At the level, note approach speed, displacement, acceptance/rejection, closes, retest and nearby opposing liquidity. A sweep is a description of price exceeding a defined reference; it does not prove intent or guarantee a reversal.
- Higher-timeframe direction can support the idea, but does not substitute for the chosen trigger. If the target is too close to provide room after a structurally placed stop, wait.

## Session/volatility notes

Record session phase and realized movement from supplied data; do not call the first hour universally volatile based on Mark’s observation alone. His observation that the first hour can be unusually volatile is a testable hypothesis. Compare volatility measures by product/session and define them before evaluating stop placement.

## Journal tags

`preferred_htf_level_reaction`, `fallback_1m_levels`, or `unclassified`; level timeframe, confirmation rule version, session phase, volatility context, stop logic, and evidence status.

## Sources

- TradingView, [Volume Profile: basic concepts](https://www.tradingview.com/support/solutions/43000502040-volume-profile-indicators-basic-concepts/), accessed 2026-09-28. Indicator output is defined by its calculation/session settings; it does not expose all order-book liquidity.
- CME Group, [Micro E-mini Equity Index Futures FAQ](https://www.cmegroup.com/articles/faqs/micro-e-mini-equity-index-futures-frequently-asked-questions.html), accessed 2026-09-28. Confirm the product’s current trading sessions with live specifications before calendaring.
