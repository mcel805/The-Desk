# Agentic - Liquidity · Premium

Open The Desk at http://127.0.0.1:18880/, then **Indicators → Agentic - Liquidity (Premium) → Compile & test → Add to chart**. Search works even with a full saved Pine library. The existing compact blue glass Premium badge is used in the catalog, saved library and on-chart manager, matching Agentic - Elliot Waves.

The supplied 773-line Pine v6 attachment is archived byte-for-byte in `web/pine-examples/agentic-liquidity-original.pine` (SHA-256 `40139ef8dd660366e8471413bcc7a584acc826d5d68caa4f9f493c61a2af91bf`). The installed `agentic-liquidity.pine` changes only the indicator title and short title to **Agentic - Liquidity**. Attribution and MPL 2.0 notices remain intact. Source fingerprints are recorded in `source-manifest.json`.

All 72 inputs in the original four groups remain: enabled Daily/4H/1H/30M/15M/5M/1M sources; internal/external confirmed pivots; retained-history limits; equal-level tolerance; wick/close consumption; ranked bridge scope; 1M structure warning scope and close/wick confirmation; level colors, opacity, styles and width; percentage/tick bands; white consumed history; optional tags and dots; weighted convergence pockets; chart-timeframe small pools; and the descriptive unswept-pool concentration score. Defaults, geometry, short historical red/green strips, dotted borders, fills, white retired lines, band placement and forward extension come directly from the supplied code. The original unusual `60 AND 240` small-pool threshold branch is intentionally preserved.

The six ranked bridge plots, reached-pool events, twelve live-strength/count outputs and structure feeds remain available in the chart data window and output CSV. Both original structure `alertcondition` declarations are retained and evaluated by the Pine runtime. These do not create a durable server alert, dispatch an agent or place an order. The companion ABC indicator is separate; this study does not paint ABC-owned campaigns or add Elliott features.

The same compatible worker used by Agentic Elliott Waves resolves the canonical minute ledger and its nested higher-timeframe requests. Drawings retain the candle price scale without forcing candle autoscale to include distant history. The source already bounds ledgers and caches pool packets and convergence clusters; no faster-than-TradingView benchmark is claimed. Standard time candles of at least one minute and at least one enabled source are required, as in the original.

## Validation

From `apps/the-desk`:

```sh
node --test tests/test_agentic_liquidity.mjs
node --test tests/test_agentic_host.mjs tests/test_pine.mjs tests/test_pine_serial.mjs tests/test_pine_editor.mjs
```

Focused tests compare the original and renamed scripts on identical synthetic MYM-like OHLC, every input definition, all 28 data-window feeds and drawing objects. They cover 1/2/3/5/15/30-minute, 1-hour, 4-hour and Daily chart execution; all enabled sources; display and consumption options; small-strip geometry and swept-history removal; source validation; and restoring all settings, visibility and geometry. Equivalent hex color case is normalized in drawing comparisons.

The screenshot identifies TradingView CBOT MYM1! on 1 hour. Matching MYM OHLC, continuous-contract roll history, exact screenshot inputs and TradingView reference outputs were not attached. Source preservation and same-engine equality do not establish cross-platform numeric or pixel parity. Browser acceptance uses separately identified public BTC candles; actual matching-data MYM parity remains pending.

Browser acceptance passed against an isolated instance of the same Desk source on real Coinbase BTC-USD 1h and 1m candles: Premium catalog search, UI compile/add, 72 inputs, settings changes and saved-reload restoration. The 1h model rendered 220 lines, 85 small-pool fills, and preserved candle scaling. The installed service at port 18880 serves the exact source hash and reports healthy with Lux Journal connected. Isolated QA deliberately ran without market workers or a journal. The focused Liquidity suite passed 15 tests; the Pine/host/editor/serialization regression suite passed 28 tests.

## Live-update repair

PineTS 0.11.0 initially infers `closeTime` for candles that omit it. Its replacement and append paths did not repeat that fallback. The next live tick therefore removed the minute packet used to redraw the main pools, while the fixed historical small strips remained. A stream fixture reproduced 49 main lines on initial load and zero on the next update. The earlier static and immediate-render acceptance did not cover that second model.

A second defect was reproduced in pretranspiled secondary contexts: absent tail snapshots made each update remove one extra minute of candle history. The worker now creates the same pre-last-bar snapshot used by the native complete and stream runners, preventing history drift.

The compatible worker now applies the initial-load fallback to both candle update paths, including nested security contexts. Explicit provider/session close times are preserved, and provider-owned candles are not mutated. The supplied Pine source and user settings are unchanged. Tests execute real live streams, repeated ticks, a new chart candle, absent and supplied session close times, and the complete Liquidity source. The dedicated browser regression checks incoming worker models rather than the renderer's reused model object.

Run `node --test tests/test_pine_live.mjs tests/test_pine_serial.mjs tests/test_agentic_host.mjs tests/test_agentic_liquidity.mjs`. Run `tests/verify_agentic_liquidity_live_browser.mjs` with an isolated Desk URL and dedicated Chrome debug URL for the live-browser check.

Post-fix validation passed 26 focused tests. Hyperliquid BTC 1h browser acceptance observed 31 distinct incoming models over 75 seconds with 49–50 main levels retained, followed by settings restoration after reload and 1m rendering. The isolated QA server deliberately used no account market workers or journal; the installed Desk remains the normal service on port 18880. Refresh The Desk once to replace an already-running worker.

## Main-level display audit

The supplied original chart image has repeated one-pixel dashed strokes of five lit pixels followed by six background pixels (two independent horizontal segments), and dotted strokes of one pixel followed by two background pixels. The renderer's generic width-one dashed pattern was shorter. Liquidity models now carry the measured width-one pattern through an indicator-scoped display field; the canvas build adapter consumes it. Other studies and unmeasured wider dashed strokes retain their existing renderer patterns. Pine coordinates, prices, colors, opacity and source styles remain unchanged. The shared numeric-font adapter preserves the original 11px origin dots, 10px contact dots and 8px optional tags.

The display suite executes the Pine source and independently checks every main pivot anchor, active/retired endpoint, fixed/live-strength width and opacity, high/low band bounds and fills, absent band borders, and small-strip lengths. Band arithmetic allows only sub-tick floating-point serialization error. A canvas-consumer test checks the resulting stroke/fill commands. Browser interception of the actual deployed canvas on Hyperliquid BTC 1h verified all 48 visible main lines and 27 visible active bands, including their coordinates, colors, width and dash arrays. Display, live-update and Pine-runtime suites passed 30 tests.

Run `node --test tests/test_agentic_liquidity_display.mjs tests/test_pine_live.mjs tests/test_pine.mjs`. Run `tests/verify_agentic_liquidity_display_browser.mjs` with an isolated Desk URL, a dedicated Chrome debug URL, and an output JSON path for the deployed canvas audit.

This audit uses the supplied Pine defaults. Literal cross-platform pixel equality on the original MYM1! chart still requires matching source candles, input settings, viewport/scale, theme and pixel ratio. The reference image establishes its measured width-one stroke pattern; it does not establish unshown custom-width patterns or a matching MYM dataset.
