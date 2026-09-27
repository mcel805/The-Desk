# Phase 5.2: full retained geometry display

Release: `v0.4.6-all-geometry`.

The 4H screenshot showed `5/12 legs` but no visible count. The evidence-only path had unresolved gaps and the renderer could fall through to no local labels. This release adds an explicit `geometryOnly` mode to the history cover function. When the local evidence run is absent, the chart requests a second path with evidence filtering disabled, then renders it as provisional context.

This mode uses the retained closed-bar pivot history, not just the visible viewport. It remains bounded by the Pine history available to the script (`max_bars_back`, loaded chart data and the retained pivot capacity). It cannot pull exchange history that TradingView has not loaded into the script.

Geometry-only labels are not promoted to forecasts or locked scenarios. Forecast extraction still checks `supportedNodes`; the evidence gate is unchanged. Gray/question-mark styling makes the distinction visible. Users can turn off `Show unresolved parent geometry` to return to an evidence-only view.

Acceptance: compile on MYM 4H with the same cutoff and confirm that the previously blank chart now contains gray provisional parent/sub-count geometry. Then compile on 1H and ensure supported local counts retain their degree colors while unresolved candidates remain gray.
