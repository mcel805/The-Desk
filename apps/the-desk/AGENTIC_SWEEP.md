# Agentic Sweep · Desk Premium

Port: supplied Agentic Sweep Entry v1.5.1 → `web/pine-examples/agentic-sweep.pine`.
Original retained verbatim apart from newline normalization in `agentic-sweep-original.pine`.
Original normalized SHA-256: `ea80721fc8455126ba7e5a13208173eb17c7ae8f4b3744a11172ac4d750d31d9`.

## Installation and behavior

Indicators → search Sweep → Agentic - Sweep → Add. Premium opens the editable source.
Use standard intraday candles, at least 1 minute, and parent timeframes at or above the chart interval. Defaults are intended for a 1m chart with 5m ABC parent and 5m/15m bias context. No paid observation run in Swing Lab is required.

Preserved: strict micro pivots; tick/ATR size filter; distinct alternating HH/LL setups; frozen secondary pools; two directional sweep paths; pre-existing sweep-origin block qualification; optional reclaim or contact mode; expiry and cancellation; historical green/red strokes and dashed broken pools; bias tags; embedded ABC, warnings and geometry; optional context drawings; input settings; observation alert conditions.

Removed: Entry callouts, Target and Stop levels, buffered stop inputs, post-signal target/stop outcomes, target/stop data plots, and trade recommendation alerts. A qualified sweep reclaim is an observation labeled Reclaim. Directional draw availability and minimum clearance remain internal qualification context from the supplied source. A draw consumed before observation cancels the attempt. This retains the original observation timing without publishing a trade plan.

After reclaim/contact observation, the attempt is archived immediately. Future stop/target touches no longer create any lines, markers or outcome states. Earlier setups retain their frozen anchors.

Desk compatibility: parent-pivot expression and its input declarations are placed before the first higher-timeframe request; calculations are unchanged. The named Sweep source uses the existing compatible worker. The supplied original is a provenance reference, not a catalog entry.

## Research and efficiency

This is a source-informed, mechanical OHLC model. Strict pivots, minimum excursions, reclaimed origin blocks, pool selection, expiry and reclaim windows are explicit research choices. A swept price level does not authenticate resting stops or liquidity. Bias is context; both directions remain detectable. ABC and geometry are context rather than requirements for every visible pattern.

References:
- Supplied source cites Inter Equity videos V028 https://www.youtube.com/watch?v=60yOXkGhdW8, V044 https://www.youtube.com/watch?v=GIYrW7FC06M, V046 https://www.youtube.com/watch?v=yIYY_jYy3sE. These videos were not independently revalidated in this port; no claim of complete strategy equivalence is made.
- TradingView confirmed HTF samples and retrospective pivot behavior: https://www.tradingview.com/pine-script-docs/concepts/repainting/
- TradingView optimization guidance: https://www.tradingview.com/pine-script-docs/writing/profiling-and-optimization/

Implemented efficiency changes: removed risk drawing construction and the entire post-observation outcome loop; no additional polling or AI service was introduced. Existing bounded setup/drawing retention remains.

Suggested next improvements (not applied to recognition rules):
1. Benchmark full-history recalculation at 1,000/3,000/5,000 bars before optimizing. Record elapsed time, peak drawing counts, feed, symbol, timeframe, cutoff and history length.
2. Share completed 5m/15m series across installed indicators, while keeping each indicator's calculation state independent. Do not reuse a snapshot across different feed/contract/session/cutoff.
3. Profile repeated geometry and origin-history scans; replace with incremental envelopes only after prefix replay proves identical historical events.
4. Consider symbol/session-specific tick/ATR presets only after out-of-sample replay. These would change filtering, not establish profitability.

Validation: `node --test tests/test_sweep_port.mjs`. Synthetic baseline comparison of setup/sweep/bias/ABC/geometry series, prefix causality, mirrored directions, a qualified reclaim fixture, removed risk outputs, and worker selection. This is local Desk runtime evidence. Direct TradingView candle-by-candle parity and market-performance validation remain pending.

## Coinbase / Hyperliquid comparison correction · 2026-10-31

The reference screenshot is BTCUSD Coinbase spot, 1m; the original Desk screenshot is Hyperliquid BTC perpetual, 1m. The comparison chart was changed to Coinbase BTC-USD, 1m, and Liquidity was hidden to isolate Sweep. No micro threshold was lowered.

Frozen provider snapshots: 999 completed one-minute bars from 2026-10-31 04:03–20:41 UTC. Coinbase produced 72 setup events and 36 sweep events; Hyperliquid produced 25 and 9. In the visible comparison interval, 14:30 inclusive to 20:40 exclusive UTC (07:30–13:40 Pacific), 370 bars produced Coinbase 19 setups / 10 sweeps versus Hyperliquid 5 / 2. Event counts include observations that may not all survive the ten-per-direction display retention.

Coinbase visible-range high 77645.12 and low 77222.31 exactly match the TradingView screenshot labels. Hyperliquid's same-window range is 77338–77750. More equal adjacent highs on Hyperliquid reduce strict fractal candidates. A smaller mintick alone does not turn one venue's candles into another's.

An independent JavaScript reference (no Pine/PineTS imports) reproduced every default strict high/low pivot and setup direction on both snapshots, including tick/ATR excursion, plateau exclusion, alternating pivots, extensions, pool consumption, sequence and expiry. This addresses the weakness in the earlier tests that compared two sources under the same runtime.

Reproduce: `node tests/sweep-parity-audit.mjs <snapshot.json> <instrument-tick> [audit-output.json]`. Snapshot must include instrument, timeframe=1m, as_of, and OHLCV bars. The audit excludes the forming candle and fails on any independent pivot/setup mismatch.

The screenshots do not expose TradingView input settings or export its event series. Complete native event-by-event TradingView parity remains unverified. Do not treat counts from different feeds or different history starts as a parity test.
