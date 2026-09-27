# Scope traceability — v0.2.0

The original scope was staged. v0.1 did not satisfy the history/range requirement and was delivered without the chart acceptance evidence needed to detect that failure. v0.2 corrects the central architecture in source. **It is not yet a validated Pine release or completion of the entire scope.**

| Requirement | v0.2 source | Evidence / remaining gate |
|---|---|---|
| ENG-01 all loaded OHLC, cutoff | Closed-bar ingestion, context metadata, standard candles | Local fixtures; live feed/history behavior pending |
| ENG-02 causal pivots | Confirmed fractals, known-at, equal endpoint policy, ambiguous outside bars skipped | Temporal tests retained; exact TradingView tie behavior still requires runtime fixtures |
| ENG-03 history-wide nodes | All contiguous supported spans at up to eight reduced scales; exact child IDs; four-path connected graph | 400-leg coverage test; 2,811-bar BTC reference fixture; Pine performance pending |
| ENG-04 alternatives/ranking | Four distinct bounded history paths; versioned coverage/fib/evidence weights | Exhaustive small-history comparison and alternate-path checks; no probability calibration |
| ENG-05 identities | Symbol/TF/version, measurement, endpoint and internal pivot timestamps/prices | Deterministic local reload checks; durable revision storage not implemented |
| ENG-06 explainability | Rule/evidence tooltips, unresolved gaps, source cutoff, cap status | Reference renders; actual Pine visual audit pending |
| RULE-01/02 strict core | Origin, progress, non-overlap, W3-shortest, hidden extrema guard | Rule fixtures; recursive certainty never asserted |
| RULE-03 R1 zigzag | Strict A-B-C endpoints with 5-3-5 child-family expectation | Supported direct child evidence; unsupported corrective families UNKNOWN |
| RULE-03 R2 families | Not implemented | Flats, triangles, diagonals, combinations remain separate milestones |
| TIME-01/02 pivot versus count | Confirmed pivot / provisional count distinguished | Tests + source review; chart marker verification pending |
| TIME-03 replay equivalence | No future-bar input to closed cutoff; realtime observations separate | Pine Bar Replay and reload-event parity NOT passed |
| TIME-04/05 MTF | Not implemented | Runs on chart timeframe only |
| TIME-07 frozen cutoff | Cutoff excludes later bars; historical price buffer for invalidation checks | Local design check; old-cutoff Pine runtime pending |
| VIS-01 thin overlays | One-pixel lines, transparent labels, no fills | Source/static checks; live charts pending |
| VIS-02/04 nesting and density | Up to eight displayed layers where present; parent-first drawing budget | Reference render; layout/overlap and dynamic budget checks pending |
| VIS-05 history selection | Rank, root layer, range and display filters | Source + viewport dependency test |
| VIS-06 liquidity states | Not implemented | Existing liquidity indicator left separate |
| FORE-01/02 targets/log | Linear/log formulas; fifth-length cap; nonpositive crypto target guard | Additional formula fixtures needed; no calibrated forecasts |
| FORE-03/04 invalidation/paths | Scenario invalidation; conditional future labels and schematic path | Reference images only; live rendering pending |
| FORE-05 assessment | Three next-wave rows, coverage/gaps, measurement, cutoff | Needs live chart acceptance |
| CTRL manual anchors | Not implemented | R2 |
| ALERT-01/02 | Realtime-only frozen observations; JSON alert events | Not backfilled from retrospective graph; actual alert/replay checks pending |
| Evaluation / superiority | Not established | Expert agreement, holdout, costs and robust forecast comparison still required |

## Acceptance images requested

1. BTC Daily entire loaded history, primary and supported descendants.
2. Same history at finest scale / expanded detail.
3. Recent viewport showing unchanged underlying history and conditional future labels.
4. Optional primary/alternate comparison.

Current images in `validation/reference-images/` are **reference-engine renders**, visibly labeled. They are NOT substitutes for the requested TradingView runtime proof. The pending permission is specifically to transmit the complete source to TradingView, compile and privately load it, and capture actual charts. Public publication and orders remain outside scope.
