# Liquidity Force — Quant Lab Premium Indicator

**Status:** First implementation is in the Quant Lab Premium Indicators catalog. The separate Pine candidate is not the primary build and remains uncompiled.  
**Primary platform:** Count Desk Quant Lab  
**Purpose:** show confirmed active liquidity levels, rank their relative structural strength and accessibility using the existing Liquid Gravity model, and optionally display the supplied rolling-window volume profile on a selectable timeframe.

Liquidity Force is a descriptive research overlay. It does not identify actual resting orders, predict a trade outcome, or create an entry signal. The initial release has no probability output.

## User requirements captured

- Combine the existing Liquidity levels and Liquid Gravity measurement model.
- Liquidity display has two modes: **Raw Levels** (default) and **Convergence**.
- Liquid Gravity scoring applies only to levels that are active in Liquidity; keep the existing Gravity measurements and show ranked levels as Primary, Secondary, and Tertiary.
- Include a chart-toggleable volume profile with the profile timeframe defaulting to **1H** and user-selectable.
- Port the supplied Pine v6 Clusters Volume Profile with its clustering logic, inputs, histogram, POC, colors, dots, and labels unchanged.
- Preserve the source indicators' calculation rules and visual language wherever code and license permit.

## Source and authority boundaries

- Liquidity source behavior: `count-dashboard/liquidity_engine.py` (`liquidity-engine-v1.1.0`) and `count-dashboard/liquidity_map.py` (`liquidity-map-v1`). These are separate methods. The build must select the exact one used by the source indicator and must not mix their pivot/touch semantics.
- Convergence grouping: `count-dashboard/web/liquidity-convergence.js` and `indicators/tool-belt/liquidity-convergence.md`. It groups same-side confirmed, unbroken levels; the full group must fit the anchor ATR tolerance and it prevents single-link chains. A convergence group is presentation/structural agreement, not independent evidence or a score.
- Gravity calculation: `count-dashboard/web/liquid-gravity.mjs`, with its source/license documented in `docs/LIQUID-GRAVITY-PARITY-REVIEW.md`. Keep its component weights, lifecycle states, filters, and ranking formula unchanged when assigning Gravity to eligible Liquidity levels. Any modified MPL-covered file must retain required notices and comply with MPL-2.0 distribution terms.
- The attached Clusters Volume Profile source identifies itself as LuxAlgo code under CC BY-NC-SA 4.0. An exact port is adapted material subject to attribution, noncommercial, and ShareAlike terms. It cannot be bundled into a paid/commercial premium product without separate permission from the rights holder. If separate commercial permission is unavailable, use a clean implementation based on the repository's range-overlap OHLCV profile method; that implementation will not preserve the supplied algorithm and graphics exactly.
- Use only confirmed bars for confirmed outputs. Preserve symbol/feed, timeframe, cutoff, settings, and missing-data status in the indicator's status/readout. Chart-derived levels remain hypotheses.

## Behavior

### 1. Liquidity layer

Add a **Liquidity View** selector:

| Setting | Behavior |
|---|---|
| Raw Levels (default) | Draw each active Liquidity level with the source indicator's existing level and zone appearance. Do not cluster, move, or replace source prices. |
| Convergence | Apply the existing confirmed-level convergence rule and render each group using the existing convergence presentation. Preserve original member prices in hover/details. Keep opposing BSL/SSL groups separate; mark nearby opposing groups as contested. |

Unconfirmed and broken levels are not eligible for active ranking. Their existing historical rendering behavior may remain if supported by the source indicator, but they must not be presented as active targets.

### 2. Gravity-ranked active levels

Run the existing Liquid Gravity calculation and component scoring without retuning it. The candidate set for Liquidity Force is restricted to Gravity pools that correspond to an active Liquidity level on the same side. Associate a pool with a Liquidity level only when its zone overlaps the level's zone or its price falls within the existing ATR-based pool/level tolerance; retain the matched IDs and match distance for audit. Do not create a Gravity-only candidate when no active Liquidity level matches.

For matched candidates, retain the existing Gravity score and lifecycle state. Rank eligible BSL and SSL levels separately by that score; expose up to three per side as **Primary**, **Secondary**, and **Tertiary**, skipping ranks when fewer candidates qualify. Render the matched Gravity score and existing state beside the unchanged Liquidity level. Ranking is relative within the current eligible set and is not probability.

The existing Liquid Gravity score is a relative attraction measure built from structural Liquidity Strength and accessibility/freshness/trend/regime modifiers. It must not be renamed “probability,” “win chance,” or “odds.” Preserve its inputs and meaning in the tooltip/readout. Do not add a new composite Force score until a separate, frozen formula is reviewed.

### 3. Optional swing volume profile

Add a **Show Volume Profile** toggle (default on) and a **Profile Timeframe** selector defaulting to **1H**. Apply the supplied code to the selected timeframe's bars. The source is a rolling lookback K-means cluster profile, not a pivot-to-pivot swing profile; adding swing anchors would change the supplied logic, so this exact port does not add them.

Preserve the source's defaults and calculations: 200-bar lookback, five clusters, 50 K-means iterations, 20 rows per cluster, 40-bar maximum profile width, 10-bar offset, and dots enabled. Preserve the supplied palette, cluster assignments, bar-range volume allocation, POC selection, dashed guides, dots, label priorities, and total/POC labels. Add only the visibility and profile-timeframe wrapper controls. Keep profile volume out of Gravity strength and probability.

## Synergies to show without double-counting

- **Convergence + Gravity:** convergence describes agreement among confirmed Liquidity levels; Gravity ranks the eligible matched level using the existing model. Display both facts, but do not count a level's own source pivot twice as independent evidence.
- **Strength + accessibility:** retain the existing Gravity components separately in details so the user can tell a structurally strong but distant/stale level from a nearby/fresh one.
- **Swing profile + active level:** show whether an active level intersects the profile's POC or value region as a descriptive overlap tag. Do not change the Gravity score in v0.1.
- **Contested areas:** if nearby upper and lower levels compete, show both and mark the overlap contested; do not resolve the conflict into a directional call.
- **Profile concentration:** a POC near a level can indicate overlap in this estimated historical volume distribution. It does not prove resting liquidity, future support/resistance, or a higher chance of success.

## Probability and “best level” policy

Initial release may identify the **top-ranked relative Gravity level** among currently eligible active Liquidity matches. It cannot claim that level has the “best probability.” No calibration or qualifying forward study is available in the referenced project material.

Before displaying a probability, define and freeze a separate study: instrument and dated contract, authorized source and session, cutoff, eligible active levels, event/outcome horizon, what counts as a successful interaction, comparator/base rate, fees if trading outcomes are used, sample partitions, minimum resolved sample, uncertainty interval, and independent review. Preserve emitted, missed, broken, rejected, accepted, and unavailable cases. Keep indicator score calibration distinct from paper-trade expectancy.

## Initial settings proposal

| Group | Setting | Initial value |
|---|---|---|
| Liquidity | View | Raw Levels |
| Liquidity | External pivot length | Existing source default; verify exact source before coding |
| Liquidity | Internal pivot length | Existing source default; verify exact source before coding |
| Convergence | ATR tolerance and local-convergence option | Existing source defaults |
| Gravity | Component weights, lifecycle and limits | Existing Liquid Gravity defaults, unchanged |
| Ranking | Maximum rank slots per side | 3 (Primary / Secondary / Tertiary) |
| Profile | Visible | On |
| Profile | Source timeframe | 1H |
| Profile | Algorithm and visual settings | Supplied source defaults, unchanged |

Do not fill settings from memory when the selected source file differs. Read them from the exact source version that will be ported.

## Implementation gates

1. The user confirmed rights to use and adapt the supplied profile source. The source is preserved byte-for-byte in `Clusters-Volume-Profile-LuxAlgo-ported.pine` with its original attribution/license notice. Preserve attribution and comply with the source license for any distribution; Quant Lab's Premium catalog classification does not itself grant commercial redistribution rights.
2. The supplied indicator-picker screenshot identifies Count Desk Liquidity: confirmed swing-price levels with 30m/1h context and descriptive convergence. Preserve `count-dashboard/liquidity_map.py` and `count-dashboard/web/liquidity-convergence.js` as the calculation/presentation baseline; the Pine candidate needs a parity pass against them.
3. Keep Quant Lab as the first-class implementation and leave accepted/source indicators unchanged. Preserve the profile calculation and chart-side graphics and show three Gravity ranks per eligible side. Preserve the MPL notice and comply with MPL-2.0 terms for reused Liquid Gravity material.
4. Compare the implementation against the source indicators on identical symbol/feed, timeframe, history, session boundary, settings, and cutoff. Record level prices/states, match decisions, Gravity components/ranks, and profile cluster assignments/bin volumes/POCs separately. Visually review raw/convergence, profile on/off, selected-timeframe behavior, and reload/replay behavior.
5. Keep performance **not measured** until an independently reviewed frozen study returns results.

## Candidate review notes

- Quant Lab implementation: `count-dashboard/web/quant-liquidity-force.mjs`, registered in `count-dashboard/web/quant-premium-overlays.mjs` and controlled by `count-dashboard/web/quant-lab.js`. The chart control defaults to Raw Levels, profile visible, and a 1H profile source; profile timeframe options are 5m, 15m, 30m, 1h, 4h, and 1d. Profile on reserves 75 chart bars of right offset so the original 10-bar offset plus 40-bar histogram and volume label fit the chart. Removing it or turning the profile off restores the previous chart viewport.
- Quant Lab uses the existing JavaScript Liquidity and Liquid Gravity implementations. It matches Gravity pools to active same-side Liquidity levels, then displays up to three ranked matches on each side. This is relative ranking only; neither Gravity nor the combined indicator estimates outcome probabilities.
- Browser review confirmed the active Premium card, Raw Levels default, checked 1H profile control, and rendered cluster histogram, POC guides, and totals on a Hyperliquid BTC 1h chart. The sample used a public provider snapshot with completed cutoff 2026-10-06 04:00 UTC; provider freshness and history depth remain snapshot-dependent.

- `Liquidity-Force.pine` v0.2 now collects strict confirmed chart-timeframe, 30m, and 1h swing prices; checks breaks using the source timeframe's closed bars; defaults to raw levels; and offers a same-side convergence display with higher-timeframe anchor preference, full-span tolerance, and a contested tag for nearby opposing levels.
- The current Pine candidate applies the Gravity strength, accessibility, freshness, trend, and regime factors to singleton Liquidity levels. It does not yet recreate Liquid Gravity's independent pivot-pool generation, pool merging, repeated-rejection/equal-high-low sources, or complete lifecycle transitions. Its Gravity ranks are a provisional adaptation, not accepted-source parity. Do not interpret the scores as probabilities.
- `Clusters-Volume-Profile-LuxAlgo-ported.pine` is a byte-identical copy of the user-supplied source (SHA-256 `086d0f2cd69cf62333fa7a33a774dbdca73d7d681eaeb0712de560e9cc6771b8`). The composite carries the same K-means, bar-range allocation, POC, palette, and label geometry with a wrapper collecting completed bars at the selected timeframe. The composite has not been compiled or checked against the reference screenshot in TradingView.
- The currently open TradingView chart visibly renders the original Clusters Volume Profile with the right-side colored histograms, highlighted POCs, dashed guides, and volume totals shown in the user screenshot. This verifies the supplied source's existing rendering only; it does not verify the Liquidity Force composite.

## Acceptance criteria

- Raw mode is the default and reproduces source level locations/appearance without convergence grouping.
- Convergence mode follows the existing grouping rule and retains member detail and contested-side behavior. The v0.2 Pine candidate currently shows member count and contested status but does not yet expose the full member-price details or perform the source's second consolidation pass.
- Only active Liquidity levels with an auditable Gravity match receive Gravity scores/ranks; no eligible match means no fabricated score.
- Gravity component weights and state handling match the selected source version; Primary/Secondary/Tertiary are rank labels, not odds.
- The profile is on by default and has one chart visibility control; its source timeframe defaults to 1H and honors the selected timeframe.
- Profile cluster assignments, POC, dots, and histogram labels match the supplied Pine source when source bars/settings are identical.
- No order routing, account control, entry signal, or unvalidated probability claim is added.
