# Agentic - Elliot Waves · Premium

In The Desk, open **Indicators → Agentic - Elliot Waves → Compile & test → Add to chart**. It remains searchable in the featured catalog regardless of the saved-library contents.

The user-supplied Wave Court Nested Waves 4.1 source is archived byte-for-byte at `web/pine-examples/agentic-elliot-waves-original.pine` (SHA-256 `0772f65205220e8fbc758894c241750301e5487ad45c7cf14c4588cfb154f65f`). The installed source retains that entire body, changing only the two indicator names. An optional companion panel is appended, with two additional settings. Turn **Daily to 1m Elliott summary** off for the original overlay alone.

The original 45 inputs, pivot confirmation, weighted reconstruction, impulses, parsed extensions, corrective combinations, flats, triangles, diagonals, developing counts, invalidations, provisional markers, colors, placement, path fading, alternate and primary projections remain intact. Parent labels use light neutral ink, middle labels blue, and child labels red. Numeric text sizes now reach the canvas without rounding to named sizes. Indicators stay on the candle price scale without flattening candles to include distant drawing values.

## Top-down companion

The panel descends Daily → 4H → 1H → 30m → 15m → 5m → 1m and uses the original structural parser with the **Chart count pivot bars each side** setting at each source. It shows Elliott bias, current wave endpoint, conditional primary/alternate projection prices, and source-candidate invalidation. Bias follows the eligible next projected wave; it does not use the script's compatibility EMA export. The Desk renders it as a floating chart card: drag its title bar to move it and use plus/minus to collapse or expand it. Position and collapsed state persist locally per study. The settings corner sets its initial position.

The overlay retains the original automatic three-tier ladder and manual source controls. A Daily chart additionally requests the original weekly parent. Counts in the panel link to the preceding higher frame through the original time-and-price containment screen; tooltips retain cutoffs and conflict/ambiguous/unlinked status. This is not full recursive Elliott certification. An unresolved or invalidated tail withholds numeric projections. A completed pattern's origin remains its source-candidate invalidation reference, not a stop for the next corrective leg. Source packets are confirmed and delayed as in the supplied Pine; historical interpretations can revise. Quality scores are not probabilities. All projection paths are research geometry.

## Host compatibility and performance

The compatible worker preserves `na` in generic arrays; zeroes previously became false count objects. It also recognizes the last confirmed history bar when Vela's raw candles omit `closeTime` and a realtime bar is forming. Build adapters preserve numeric label sizes through Pine and Vela. The original Pine calculations are unchanged by these host fixes.

Secondary candle fetches within a study coalesce duplicate requests and reuse results during viewport changes. A new source interval, requested range, or study execution invalidates that cache; failed requests are retried. Missing data remains an error, never invented candles. The optional panel requests all seven sources and therefore has an additional cost. The original **Bars calculated per source** default remains 3,000; the supported 500-bar setting was used in browser checks to reduce provider rate limits. No measured claim of being faster than TradingView is made.

## Validation and evidence boundary

Run from `apps/the-desk`:

```sh
node --test tests/test_agentic_elliot.mjs tests/test_agentic_host.mjs tests/test_pine.mjs tests/test_pine_serial.mjs tests/test_pine_editor.mjs
node --test tests/test_cleos_liquidity.mjs
```

The focused suite executes the original parser, hard-rule fixtures, wick invalidation, generic-array regression, completed-history regression, all seven chart timeframes, manual-ladder rejection, display toggles, exact same-engine original-versus-port drawing/audit output with the companion off, saved-input restoration, request coalescing, built-adapter numeric label sizing, and the existing Taper-only startup seeding regression. Fixtures are synthetic MYM-like OHLC and do not validate actual MYM data. Browser review uses real Coinbase BTC-USD candles and the actual indicator manager; Hyperliquid returned HTTP 429 during review.

Matching TradingView MYM continuous-contract OHLC, history, source cutoffs and exported reference outputs were not supplied. Exact cross-platform numeric and pixel parity on the attached MYM chart remains unverified. The source-preserving comparison and real-browser rendering are distinct evidence. The in-editor comparison CSV workflow remains available for matching datasets.

Potential later Elliott-only additions: confirmed count-transition/invalidation alerts; a parent-slot conflict filter; and a replay comparison report. These are proposals, not silent changes to the supplied count rules.
