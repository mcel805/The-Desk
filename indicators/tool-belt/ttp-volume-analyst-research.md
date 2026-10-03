# TTP Volume Analyst · RelativeVolume · candidate v0.3.0

## Purpose

Render the TTP RelativeVolume study as a genuine lower chart pane. It is descriptive and event-marking; it is not an entry signal or a measured strategy.

## Display

- Separate RelativeVolume histogram pane, in percent of the historical same-time average.
- Indigo 100% reference line and white dotted 20-bar SMA of RelativeVolume.
- RelativeVolume colors: higher volume dark green, lower volume dark red; strong/weak churn yellow/orange; strong/weak climax cyan/blue; combined climax-churn magenta/violet. Low-volume bars are white and off by default.
- Sparse minor X, major triangle, and extreme diamond spike marks on the price pane. Extreme highs extend a green level and extreme lows a red level to the right until the next spike on that side.
- Signal bars receive colored candle outlines. No signal text boxes or overlay histogram strips.
- Indicator settings independently toggle RelativeVolume column coloring, signal-candle outlines, event symbols, and spike symbols. With column coloring disabled, columns remain visible in neutral gray; event symbols remain available on price.
- Event symbols: strong churn diamond, weak churn circle, strong climax square, weak climax triangle, combined climax-churn diamond/square, and low-volume cross. Minor/major/extreme spikes keep their documented cross/triangle/diamond symbols.

## Calculation and availability

- Input is provider-reported OHLCV from the chart plus supplemental history requested from the chart's selected public provider. The indicator requests up to 5,000 bars when chart history does not span the configured lookback. Current chart bars are evaluated by the native indicator lifecycle; incomplete bars are excluded.
- RelativeVolume is current bar volume divided by the mean volume of earlier bars at the same UTC time-of-day, multiplied by 100. The candidate looks back up to 20 days. Actual reference depth is limited by the provider's available history and 5,000-bar cap, so one-minute comparisons will usually have only a few matching prior days.
- The plotted white dotted line is the 20-bar simple average of RelativeVolume. The 100% line is the same-time historical volume mean.
- Churn ranks RelativeVolume divided by relative range; climax ranks RelativeVolume multiplied by relative range. Strong uses a rolling 16-bar maximum; weak uses a 7-bar maximum when a strong event occurred in the preceding 16 bars. Combined colors identify simultaneous climax and churn tiers.
- Low volume is the lowest RelativeVolume reading in the last three bars, below the configurable 80% threshold and below the slow average. It is off by default.
- Spike tiers use the notes' prior-bar and standard-deviation conditions. The notes do not completely specify every equality, warm-up, and session-boundary detail; this implementation is a documented approximation.
- Bar colors and spike marks use completed bars only in the Quant Lab attachment flow. Outputs are descriptive; no forward accuracy, edge, or strategy performance has been measured.

## Source and boundaries

Implementation is based on the user-supplied `TTP_RelativeVolume-Indicator-Notes-Final.pdf` and chart screenshot. The separate Getting Started guide describes additional modes not included in this RelativeVolume pane build. The chart source remains provider-reported public data; UTC alignment does not reproduce exchange-session alignment for historical equity/futures sessions.

The user's authorization permits this build within the workspace. The study remains local research; it does not connect a broker or route orders.
