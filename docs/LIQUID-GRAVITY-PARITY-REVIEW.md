# Liquid Gravity rebuild

## Reference and license

Reference: [Market Gravity by YinYangAlgorithms](https://www.tradingview.com/script/BYdeirvp-Market-Gravity-YinYangAlgorithms/), Pine Script v6, updated September 27, 2026. Its source carries the Mozilla Public License 2.0 notice. The JavaScript port retains author attribution and the license reference in `count-dashboard/web/liquid-gravity.mjs`.

## Rebuild

Replaced the earlier hand-tuned approximation with a causal, completed-bar JavaScript port of the published calculation model. The port uses the published defaults for swing confirmation, equal-high/low and rejection classification, major swings, prior completed day/week levels, ATR-normalized pool clustering, weighted centroids, pool width, structural Liquidity Strength, freshness decay, nonlinear accessibility, timeframe-scaled trend influence, DMI/ADX regime, target ranking, rank-weighted pressure/Net Gravity, and Forming/Active/Approaching/Sweeping/Rejected/Accepted/Retired lifecycle handling.

Quant Lab asks the selected provider for up to 3,000 bars for the active symbol and timeframe, then applies the chart snapshot cutoff and confirmed-bar filter before calculating. This covers the source's 1,500-bar default maximum level age and 500-bar default display history when the provider supplies that much history. The chart itself stays on its current 500-bar view.

## Parity limits

The calculations use the published Pine defaults. A formula-level code translation does not establish output parity by itself. The TradingView screenshot previously supplied is BTCUSD on 5 minutes; the Quant Lab screenshot is Hyperliquid BTC on 1 hour. They have different feeds, intervals, histories, and cutoffs, so their level prices and scores cannot be compared as an exact-output fixture.

Quant Lab's browser chart adapter renders the levels, scores, labels, information panel, and Gravity paths with its own drawing primitives; it is not TradingView's Pine rendering engine. Previous day/week pools are grouped on UTC boundaries in this port. Exact day/week parity for exchange-session instruments requires provider session boundaries to be available to the indicator. Vela providers can also return fewer bars than requested.

Next parity gate: compare TradingView and Quant Lab with the same instrument/feed, interval, history, session boundary, settings, and cutoff; record all six ranks, prices, scores, states, Pressure, and Net Gravity. Treat the visual renderer comparison separately from calculation comparison. No predictive performance or trading edge has been measured.
