# Tool Belt indicator framework

The dashboard entry is `count-dashboard/web/tool-belt.html`. Its cards catalog existing Count Desk chart layers and in-app indicators. Card `v0.1.0` labels the Tool Belt listing where no implemented engine version exists. Price and drawing controls are not listed as indicators; related count and projection layers are grouped under Elliott Wave.

`volume-profile.indicator.mjs` identifies the first implemented indicator. `count-dashboard/volume_profile_lab.py` calculates a cutoff-safe OHLCV range-allocated profile with versioned settings, input hash, missing-volume status, contiguous 70% value area, and causal replay quality checks. Count Desk uses it for the existing `profile` layer; the Tool Belt's **Inspect calculation** panel exposes the local read-only report. This is an approximation from bar volume, not trade-at-price volume. Its directional outcome, independent reference, and source-specific data rights are still undefined, so it remains descriptive and unscored.

`count-dashboard/structure_zones_engine.py` implements the independent Structure Zones study (`structure-zones-engine-v1.0.0`). It emits close-confirmed structure breaks, displacement-qualified opposing-body zones with lifecycle states, and pools built from nearby confirmed pivots. The workbench excludes the latest stored bar, retains source rows and a settings-bound input hash, and leaves probability unscored. See [`structure-zones.md`](structure-zones.md) and the Count Desk guide for exact rules. It does not identify participants, infer order-book depth, or reuse the LuxAlgo Pine implementation.

The Tool Belt's premium **Bias** and **Structure Zones** cards open the selected stored symbol and timeframe in the Chart Workspace with that study active. Bias draws its confirmed swing references and optional break labels from `bias_engine.py`; Structure Zones draws confirmed origin zones, swing pools, and optional break labels from `structure_zones_engine.py`. The chart excludes its newest stored bar, or the current provider bar, before reporting a closed cutoff. A public chart provider sends bounded closed candles to a local, read-only calculation endpoint; those bars and reports are not saved. Each report identifies source, timeframe, cutoff, settings-bound hash, and unscored status. Chart settings and active studies persist in this browser.

## Proposed measurement and evolution contract

1. Freeze an indicator version, its inputs, instrument, timeframe, signal direction, decision time, and resolved outcome definition before collecting a trial.
2. Record source identity, data rights, bar cutoff, indicator version, fees if applicable, and uncertainty for each paper or shadow observation. Do not infer missing values.
3. Keep training, candidate selection, and a forward held out evaluation separate. Count only resolved observations under the frozen method. Report sample size, base rate, confidence interval, and calibration by score bucket.
4. Generate candidate rule changes as new immutable versions. Compare each candidate with the current version on the same held out set; preserve rejected candidates and failure reasons.
5. Require independent review before promoting any version or showing a calibrated probability. The displayed score can change in five point steps only after that review. A visual tier changes with the displayed score; it does not certify performance by itself.
6. Keep all trials paper or shadow only. No self modification of production chart code or live order routing is enabled by this scaffold.

The current 50% / 50% badge is a **display placeholder**, not a forecast or measured win rate. Its coin icon is the starting tier. The UI has defined visual tiers for later reviewed scores, but no process currently supplies those scores. The profile excludes the newest stored bar; the prior bar is confirmed by the presence of a successor. Missing volume is never replaced with synthetic volume.
