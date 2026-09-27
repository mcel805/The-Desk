# Batty - Elliot Wave

**Version 0.1.0 — experimental, independently implemented Pine Script v6 indicator.**

The indicator automatically labels coarse impulse and zigzag candidates, with up to four ranked interpretations and clean one-pixel drawings. It is the first usable source build of the larger scope, not the completed WaveBasis-equivalent product.

## Install in TradingView

1. Open a standard candlestick chart, initially MYM Daily or 4H.
2. Open Pine Editor and create a **new indicator** so existing Batty code is preserved.
3. Replace the new template with the entire contents of `Batty-Elliot-Wave.pine`.
4. Save as **Batty - Elliot Wave** and choose **Add to chart**.
5. Use the indicator settings to choose a count rank, pivot sensitivity and optional alternate.

No paid service, external library, API key or live companion service is required. This script does not place orders. Start with the same contract, session and adjustment settings used in your research; changing them can change the count.

## What this version provides

- Three pivot sensitivities: L, 2L and 4L, with L=5 by default. These are relative swing scales, not three automatically requested timeframes.
- Impulse candidates after waves 2, 3, 4 or 5; zigzag candidates after B or C. Search ends at the latest canonical pivot in each scale.
- Strict coarse checks: wave 2 remains inside the origin; wave 3 exceeds wave 1; wave 4 does not overlap wave 1; completed wave 3 is not the shortest; no truncated fifths in this release.
- Primary and up to three alternative slots, selected by **Displayed count rank**. One alternate may be overlaid.
- Plain degree-styled labels, one-pixel connectors, optional channels, Fibonacci target levels and scenario invalidation. No zone fills or candle recoloring.
- Optional child pivot dots and coarse motive-leg evidence. Dots are NOT asserted Elliott subwave labels.
- Confirmed-bar updates, analysis start and frozen cutoff, pivot-known markers, scenario retirement after invalidation, and an experimental frozen-outcome ledger.
- Primary-change and forecast outcome alerts. No numerical win probabilities.

## Recommended starting settings

Use **Neutral** search, **rank 1**, local pivot length **5**, and leave alternate comparison, child evidence dots and audit markers off initially. The same script can be opened separately on Daily and 4H. It does not synchronize independently calculated counts between charts. Increasing L gives fewer/larger swings and a longer confirmation delay; it is not guaranteed to improve accuracy.

**Require lower-scale motive evidence** is optional and may leave no candidate. It checks for an exact six-pivot impulse-shaped child segment in a completed motive leg. It does not certify all corrective children or recursive subdivisions. The smallest scale has no smaller evidence scale.

## Reading the chart

A pivot is confirmed only after L, 2L or 4L completed bars. The label is drawn back at the turn; audit markers show when it became knowable. A stronger same-side pivot can replace a canonical endpoint as new data arrives. Earlier forecast records retain their original numbers.

All displayed Elliott patterns are **geometric candidates**. The final label has a question mark; tooltips and the panel explicitly identify unresolved subdivisions. A high ranking score means better fit to this limited heuristic, not a probability or independently verified forecast accuracy. The three sensitivity streams are not a proven parent-child Elliott tree.

T1 and T2 are formula levels. INV invalidates the next-wave scenario or the assumed completion of its last pivot; it is not always the full larger-degree count invalidation and is not an execution stop. Completed C candidates have an unresolved next move and deliberately receive no invented recovery target. Forward-path horizontal spacing is schematic, not a timing prediction.

A scenario whose invalidation has already been touched after its endpoint is excluded. A target already behind the current close is not issued as a new forecast. Historical target drawings can still help inspect an existing candidate; they are not fresh entry signals.

## Forecast ledger and alerts

The primary rank drives observations regardless of which rank is displayed. A unique candidate can issue one forecast when T1 and INV bracket the issue close in the expected direction. No issue-bar outcome is scored. Beginning on the next bar, T1 first, invalidation first, both touched in one bar (ambiguous), and expiry are separate outcomes. The expiry default is 20 chart bars, and a touch on that bar takes precedence over expiry.

The table's **Overlapping T / I / ? / E** numbers are overlapping historical observations from the loaded data, not trades, independent samples or a calibrated win rate. The ledger ignores brokerage fees/slippage because it does not simulate entries and fills. Reloading reconstructs it from the available feed/history. It is not durable storage or an out-of-sample benchmark.

To receive messages, create a TradingView alert using one of the named alert conditions. For detailed `alert()` events, enable **Enable alert() events** and create an **Any alert() function call** alert. Messages are plain text and include primary candidate identity for relevant events. They are not the future scope's full JSON event schema. Recreate saved alerts after changing script/settings so their saved configuration is current.

## Validation status

- TradingView server compiler: **0 errors, 0 warnings** on final source.
- Static analyzer: **0 reported issues**.
- Python reference suite: **21 passing test methods**, including mirrored/scaled bull/bear fixtures, strict boundaries, fifth-wave target caps, pivot timing, prefix replay, tied/ambiguous extrema and first-touch outcomes.
- Tests validate an independent oracle, not execution of Pine in a live chart. Server compilation does not prove runtime behavior or speed.
- Desktop chart connection was unavailable; chart appearance, live runtime, Pine Bar Replay and Daily/4H performance checks remain pending. The app was not forcibly restarted.
- No market-data holdout, expert count agreement or trading edge has been established.

## Scope still ahead

Recursive corrective-subwave validation; a unified nested candidate graph; richer alternate-start search; flats, triangles, diagonals and combinations; manual anchors; confirmed multi-timeframe integration; structured external audit events; persistent comparison results; expert/holdout evaluation; and liquidity-state integration remain later milestones. The existing Batty liquidity indicator is separate and unchanged.

Nonstandard charts are intentionally disabled. Extremely old frozen cutoffs can exceed Pine's bar-index drawing range; the panel remains available but out-of-range drawings are suppressed. The search retains 120 canonical pivots per scale and the top four candidates; it is not an exhaustive history search.

## Files

- `Batty-Elliot-Wave.pine`: importable indicator source.
- `tests/reference.py`: independent geometric/temporal oracle.
- `tests/test_reference.py`: deterministic tests.
- `validation/`: compiler/static results and integrity manifest.

Run local tests from the workspace root:

```sh
python3 -m unittest discover -s indicators/batty-elliot-wave/tests -v
```

References: [Pine objects](https://www.tradingview.com/pine-script-docs/language/objects/), [arrays](https://www.tradingview.com/pine-script-docs/language/arrays/), [repainting](https://www.tradingview.com/pine-script-docs/concepts/repainting/), [EWI impulse](https://www.elliottwave.com/waveopedia/impulse/), [EWI zigzags](https://www.elliottwave.com/waveopedia/zigzags/). The earlier scope and its full source bibliography remain in `docs/elliott-indicator/`.
