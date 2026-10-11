# Robinhood Legend Liquidity Map v1

**Status:** workspace method/report v1.0.0 drafted; Legend copy not installed and parity not yet verified  
**Target:** Robinhood Legend custom indicator/Cortex builder  
**Initial chart observed:** `/MYMZ26`, 5-minute candles  
**Purpose:** descriptive map of confirmed swing liquidity references; not an entry signal or a measure of resting orders.

## Shared learning design

The user's direction is one workspace-owned indicator with a Robinhood Legend adapter, connected to the workspace's versioned learning loop. The intended canonical behavior is the visible Count Desk chart study `Liquidity v001`: confirmed external/internal swing levels, close-through lifecycle, and optional 30m/1h convergence. Robinhood is not a second independent strategy. Reserve `liquidity-map-v1` as the shared method ID, but do not stamp it on either implementation until parity is established.

There is an implementation alignment gate in the workspace itself. The chart overlay `Liquidity v001` draws confirmed swing-price lines and HTF convergence groups. `count-dashboard/liquidity_engine.py` (`liquidity-engine-v1.1.0`) instead models external OHLC zones, touch counts, and breaks, with different pivot tie handling. They are not equivalent and remain separately labeled. A new `count-dashboard/liquidity_map.py` contract and `/api/tool-belt/liquidity` report now represent strict confirmed swing-price events as `liquidity-map-v1` v1.0.0; the Liquidity workbench can copy a source/cutoff/input-hash study reference into the Indicator Agent workflow. The existing engine remains available as `/api/tool-belt/liquidity-zones`. Implementation exists, but runtime parity and learning outcomes remain unverified; do not treat the method label as validation.

The canonical event record retains: method ID/version, settings, symbol, timeframe, sources and rights status, input hash, closed-bar cutoff, pivot side/type, pivot time/price, confirmation time, mean true range(14)/tolerance, active/broken state, and first close-through time. The workbench's **Copy study reference** action carries provenance into a manually frozen Indicator Agent protocol. Each eventual observation must point back to that frozen event snapshot and an outcome computed from eligible source-tagged closed bars strictly after its cutoff. Rights currently remain unverified; the copied reference is marked ineligible and the app does not create a score automatically. No lookahead; no edge claim from a Legend overlay or one chart example.

Robinhood can display a manually created/saved custom indicator, but this repository has no verified channel to install workspace source into Legend or read its calculated series back. Until Robinhood exposes that capability, the practical connection is a parity-tested Legend copy plus a reviewed import of source-qualified workspace observations; do not call it an automatic sync. Record the Legend custom-indicator ID, source/prompt revision, inputs, and parity result alongside the workspace method version. If the account's builder cannot implement an exact rule, label that Legend copy as an unverified adapter and exclude its output from scored learning data.

Robinhood MCP can inspect/apply a saved custom Legend indicator, but it does not expose custom-indicator source code or a create-custom-indicator operation. Therefore the Legend copy cannot silently update itself from workspace code, and its calculated series cannot be assumed to flow back into the workspace. Record the applied Legend indicator ID/settings and run parity checks against the same approved bar samples; ingest broker data/outcomes only through the workspace’s existing approved, provenance-preserving path.

## Ready-to-paste build prompt

```text
Create a custom Robinhood Legend overlay indicator named “Liquidity Map — HTF Confluence v1”. It must draw on the price chart and must never submit, stage, or recommend an order.

Purpose and limits
- Map confirmed swing-high and swing-low reference prices that traders sometimes call buy-side liquidity (BSL) and sell-side liquidity (SSL).
- These are OHLC-derived reference levels only. Do not claim they reveal actual resting orders, stops, participant intent, or a probability of a reaction.
- Do not add buy/sell arrows, trade entries, targets, stop placement, scores, win rates, or predictive labels.

Inputs and calculation
- External pivot length: 14 bars on each side (default).
- Internal pivot length: 5 bars on each side (default).
- Convergence tolerance: 0.10 × the simple mean true range of the latest 14 closed bars on the level’s own timeframe (default; matches the workspace overlay calculation).
- Toggles: show external levels, show internal levels, show broken history, show 30-minute levels, show 1-hour levels, show convergence groups.
- A swing high at bar i is valid only when its high is strictly higher than the highs of all L bars before and all L bars after i. A swing low is valid only when its low is strictly lower than the lows of all L bars before and all L bars after i. Equal extrema do not create duplicate pivots.
- A pivot is confirmed only after all L right-side bars have closed. Never use unfinished bars to confirm a pivot or a higher-timeframe level. Do not plot a level before its confirmation time. Start the line at the confirmation bar and extend it forward; do not backpaint it from the original pivot bar.
- Build levels for the chart timeframe plus closed 30-minute and 1-hour bars when Robinhood’s custom-indicator runtime supports reliable higher-timeframe data. Keep the timeframe in every level label. If the runtime cannot access those timeframes without lookahead, stop and report the limitation; do not substitute the chart timeframe and call it HTF.
- For each timeframe, classify the 14-bar pivots as EXT and 5-bar pivots as INT. A swing high is BSL; a swing low is SSL.
- Keep at most the latest 3 unbroken EXT levels per side and the latest 2 close-broken EXT levels per side, per timeframe. Keep only the latest INT level per side and timeframe. Do not silently discard a nearer active level to keep an older one.

Lifecycle and convergence
- An active BSL line ends on the first later closed bar whose close is above the level. An active SSL line ends on the first later closed bar whose close is below the level. Wicks alone do not break a level. The confirmation bar itself cannot break its new level.
- When “show broken history” is enabled, retain the line only through the first close-through bar and change it to gray dashed. Otherwise hide it after that bar.
- Group active levels on the same side when their entire price span is no wider than 0.10 × ATR(14) of the selected anchor level’s timeframe. Require at least two distinct confirmed levels. Do not use single-link chaining to merge a cluster whose full span exceeds the tolerance.
- Prefer the 1-hour level as cluster anchor, then 30-minute, then chart timeframe. A group becomes visible only once every member is confirmed. Mark a group contested with “!” if an opposite-side active level is within the same tolerance. Number groups C1, C2, … in ascending price order; the numbers are identifiers, not strength ranks.

Visuals
- EXT BSL: solid red line (#F23645); EXT SSL: solid green line (#089981).
- INT BSL: dotted orange line (#FF9800); INT SSL: dotted cyan line (#00D5E8).
- 30-minute and 1-hour levels use a thicker line than chart-timeframe levels.
- Broken history: gray dashed line, ending at the break bar.
- Convergence group: a violet line and compact C-number label; append “!” when contested. Avoid covering candles or price labels.
- Add a small legend that explains BSL, SSL, EXT, INT, active, broken, and C-number semantics. Display current timeframe and pivot confirmation delay. Use no “signal”, “strong”, “safe”, or probability language.

Non-repainting and acceptance checks
- State the exact inputs and whether any part of the chart platform recalculates on an unfinished bar.
- Verify that a pivot first appears only after its right-side confirmation bars close, and that reload/replay gives the same confirmed levels.
- Verify a wick through a level leaves it active, while a later close beyond it ends the line on that bar.
- Check rising trend, falling trend, range with equal highs/lows, a fast gap, overlapping internal/external pivots, a multi-timeframe cluster, an opposite-side contested cluster, missing higher-timeframe history, and the live partial bar.
- If any check cannot be implemented or verified in Robinhood’s runtime, state that limitation in the indicator description. Do not claim the method has a measured trading edge.
```

## Method provenance

This specification starts from Count Desk Liquidity v001: external/internal confirmed pivots use 14/5 bars, active lines end on a close through, and same-side levels can form ATR-tolerance convergence groups. Both renderers must begin a level at its confirmation time in any version designated `liquidity-map-v1`; otherwise the chart implies the level was known before it was confirmed. The current implementations and the Legend copy still need parity checks before sharing that version label or entering the same learning study.

## Robinhood integration boundary

Robinhood’s Legend MCP exposes chart inspection and applying/updating indicators, including a custom indicator already in the user’s library. It does not expose a custom-indicator creation call. Use this prompt in Robinhood’s own custom-indicator/Cortex flow, then inspect the generated settings and behavior before treating it as installed or validated. If that workflow is unavailable on this account, this document remains a build spec only.
