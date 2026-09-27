# Batty - Elliot Wave

**Current importable Pine source:** [Batty-Elliot-Wave.pine](Batty-Elliot-Wave.pine), release **v0.6.1-mtf-audit-fix**.

This update responds to `output/pdf/BATTY_MYM_Indicator_Comparison_Audit_S07.pdf`. It improves confirmed Daily/4H structural context, gives the structural anchors stable IDs, adds traceable chart-timeframe candidate details and close triggers to forecast tooltips, marks every historical count label provisional with `?`, and uses the wave-1 endpoint to invalidate a wave-4 scenario. The existing reference degree colors and optional connector visibility remain in effect.

## Scope and validation

Daily and 4H IDs identify confirmed structural swing context. They do not yet identify completed Elliott parent counts, and the locally generated Daily, 4H, 1H, and 30M Elliott labels are not guaranteed to be the same nested wave tree. The tooltip states this limit rather than implying alignment from similar labels or matching direction.

The Pine source has not been compiled or run in TradingView. The MTF source-invariant checks pass; TradingView compilation, replay, and chart review are pending. The user will compile and test the copied source.

See [release notes](releases/v0.6.1-mtf-audit-fix/README.md) for the exact changes. Earlier v0.2.x notes and validation files are historical and do not describe the current importable source.
