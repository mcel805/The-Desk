# Tool Belt indicator framework

The dashboard entry is `count-dashboard/web/tool-belt.html`. Its eight cards catalog existing Count Desk chart layers. The card images are generated placeholders that can be replaced individually with Mark's final art. Card `v0.1.0` labels version the Tool Belt listing, not the underlying chart algorithm. Price and drawing controls are not listed as indicators; related count and projection layers are grouped under Elliott Wave.

`volume-profile.indicator.mjs` identifies the first implemented indicator. `count-dashboard/volume_profile_lab.py` calculates a cutoff-safe OHLCV range-allocated profile with versioned settings, input hash, missing-volume status, contiguous 70% value area, and causal replay quality checks. Count Desk uses it for the existing `profile` layer; the Tool Belt's **Inspect calculation** panel exposes the local read-only report. This is an approximation from bar volume, not trade-at-price volume. Its directional outcome, independent reference, and source-specific data rights are still undefined, so it remains descriptive and unscored.

## Proposed measurement and evolution contract

1. Freeze an indicator version, its inputs, instrument, timeframe, signal direction, decision time, and resolved outcome definition before collecting a trial.
2. Record source identity, data rights, bar cutoff, indicator version, fees if applicable, and uncertainty for each paper or shadow observation. Do not infer missing values.
3. Keep training, candidate selection, and a forward held out evaluation separate. Count only resolved observations under the frozen method. Report sample size, base rate, confidence interval, and calibration by score bucket.
4. Generate candidate rule changes as new immutable versions. Compare each candidate with the current version on the same held out set; preserve rejected candidates and failure reasons.
5. Require independent review before promoting any version or showing a calibrated probability. The displayed score can change in five point steps only after that review. A visual tier changes with the displayed score; it does not certify performance by itself.
6. Keep all trials paper or shadow only. No self modification of production chart code or live order routing is enabled by this scaffold.

The current 50% / 50% badge is a **display placeholder**, not a forecast or measured win rate. Its coin icon is the starting tier. The UI has defined visual tiers for later reviewed scores, but no process currently supplies those scores. The profile excludes the newest stored bar; the prior bar is confirmed by the presence of a successor. Missing volume is never replaced with synthetic volume.
