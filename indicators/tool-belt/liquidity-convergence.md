# Liquidity v001 convergence display

The Chart + Cleo workspace groups nearby **confirmed, unbroken swing levels** for display. A C tag identifies one group; its number is a chart-local ID, not a score or member count. Hover the C line, or open the C summary button, to see every source level.

## Rule

- Map external and internal pivots from available chart, 30-minute, and 1-hour bars, plus shorter context intervals when the provider supplies them. A pivot becomes eligible after its right-side confirmation bar closes.
- Align all source series to the chart's last completed bar. Levels broken by a later close are historical lines and cannot join an active C group.
- Use the anchor timeframe's 14-bar ATR multiplied by the **Convergence range (ATR)** setting (default 0.10) as the price tolerance. Every member must be on the same side (BSL or SSL), and the full group range must fit within that tolerance. Nearby groups merge only if their combined range fits the tighter tolerance. This blocks chains of individually close levels from joining prices that are far apart.
- The drawn C line keeps the highest-timeframe anchor's actual price. Before the final member confirms, source lines retain their own historical prices. After confirmation, one C line replaces the stacked lines; the popup gives the actual minimum and maximum prices and each original line. It does not invent a new exact market price.
- Two distinct pivots on the same timeframe can converge when **Show local timeframe convergences** is on. An external and internal label for the same pivot, side, and price counts once. With that setting off, a C group needs at least two timeframes.

## Different nearby-line cases

| Case | Display |
| --- | --- |
| Two or more active BSL levels, or two or more active SSL levels, within tolerance | One C line; popup lists each price, pivot, confirmation time, timeframe, source, and cutoff. |
| Same-side levels from different timeframes | One C line with all timeframes listed. These are not assumed to be independent evidence. |
| Nearby active BSL and SSL | Keep sides separate. A nearby opposing level marks the C tag with `!` and the popup calls it contested. It does not strengthen a directional level. |
| Broken or unconfirmed level | Do not add it to an active C group. Broken history remains dashed when enabled. |
| Separate C groups that are close on screen but fail the price rule | Keep both prices and stagger their chart tags so neither cluster is silently merged. |
| Missing higher-timeframe bars | Show only groups supported by available sources; the indicator status names unavailable intervals. |

The default `50%` is an unmeasured placeholder in the indicator status. Convergence changes the chart presentation and denotes structural agreement only. It does not establish order-book liquidity, a stronger measured edge, a calibrated probability, or a trade signal. This is a paper research overlay.
