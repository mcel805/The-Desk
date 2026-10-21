# Agentic - Liquidity · Premium

Open The Desk at http://127.0.0.1:18880/, then **Indicators → Agentic - Liquidity (Premium) → Compile & test → Add to chart**. Search works even with a full saved Pine library. The existing compact blue glass Premium badge is used in the catalog, saved library and on-chart manager, matching Agentic - Elliot Waves.

The supplied 773-line Pine v6 attachment is archived byte-for-byte in `web/pine-examples/agentic-liquidity-original.pine` (SHA-256 `40139ef8dd660366e8471413bcc7a584acc826d5d68caa4f9f493c61a2af91bf`). The name-only port is retained as `agentic-liquidity-reference.pine`. The installed `agentic-liquidity.pine` adds the requested Clean presentation and enables 15M sources alongside 60M/30M by default. Attribution and MPL 2.0 notices remain intact. Source fingerprints are recorded in `source-manifest.json`.

The original controls remain alongside the Clean display and fixed-5M controls: enabled Daily/4H/1H/30M/15M/5M/1M sources; internal/external confirmed pivots; retained-history limits; equal-level tolerance; wick/close consumption; ranked bridge scope; 1M structure warning scope and close/wick confirmation; level colors, opacity, styles and width; percentage/tick bands; white consumed history; optional tags and dots; weighted convergence pockets; chart-timeframe small pools; and the descriptive unswept-pool concentration score. The Original view retains the original geometry, strips, dotted borders, fills, retired lines and forward extension for the same source selections. The exact supplied defaults are preserved in the reference file; choose Original and disable 15M to reproduce them in the updated study. The original unusual `60 AND 240` small-pool threshold branch is intentionally preserved.

The six ranked bridge plots, reached-pool events, twelve live-strength/count outputs and structure feeds remain available in the chart data window and output CSV. The original data-window live-strength fields retain their count-only formula; Clean badges show the separate combined convergence/buildup score. Both original structure `alertcondition` declarations are retained and evaluated by the Pine runtime. These do not create a durable server alert, dispatch an agent or place an order. The companion ABC indicator is separate; this study does not paint ABC-owned campaigns or add Elliott features.

The same compatible worker used by Agentic Elliott Waves resolves the canonical minute ledger and its nested higher-timeframe requests. Drawings retain the candle price scale without forcing candle autoscale to include distant history. The source already bounds ledgers and caches pool packets and convergence clusters; no faster-than-TradingView benchmark is claimed. Standard time candles of at least one minute and at least one enabled source are required, as in the original.

## Clean presentation

The default Clean view draws every displayed untouched main level at its exact source price as a solid 2-pixel line, without a long shaded band. Lines stop before the separate text column. Equal-price duplicates share a line from the earliest contributing source pivot; nearby distinct prices are never averaged or shifted. The nearest 12 groups are shown by default, with one compact badge for every displayed group and no separate badge-count limit. The Desk stacks crowded badges at the current zoom with short connectors; source prices remain fixed. Tags shared by multiple source pools have a purple outline, and every represented main line ends in a purple micro `1×` dot. Coincident timeframe sources also count as shared. Hover a badge for exact source-price bounds, pool counts and the score breakdown. Consumed wick-sweep history remains faint, white and dotted. Close-through (`BRK`) levels retain their support/resistance color at 2 pixels and use a dashed line; all labels and source dots are removed from broken levels. Clean history shows up to 24 recent broken/swept levels. Structure warnings remain separately labeled `1m structure`.

Same-side levels share a convergence pocket only when their entire span fits within `max(clusterTicks × tick, lowest price × cleanMergePercent / 100)`. The default percentage is 0.03%. This is a bounded span, not neighbor chaining. Each distinct enabled source frame counts once; repeated pivots on a frame increase buildup without inventing another timeframe. Badges identify combinations such as `60+30+15`, `60+30` and `30+15`.

Each unswept chart-timeframe small pool is assigned to only its nearest eligible same-side main group. Association uses the larger of the existing small-pool distance and the clean convergence distance; an unmatched small pool cannot bridge distant main groups. Assigned near-line pools contribute to the shared analytical pocket; their individual strips and the long main-line shading are suppressed in Clean view. The nearest 14 remaining unswept small zones get subtle borderless strips. Swept small pools contribute zero and are hidden in Clean view. Shared shading begins at the latest contributing source confirmation, while source-pivot line anchors remain retrospective.

Strength is descriptive chart evidence, not measured resting orders or a reversal probability:

- Convergence remains `C = min(100, 25 × distinct positive-weight frames + 25 × source weight / (source weight + 1H weight))`, with a zero guard.
- Price buildup is dominant: default `score = 70% B + 30% C`. The percentage is configurable.
- A newer confirmed lower high builds eligible outer resistance; a newer higher low builds eligible outer support. The fixed price corridor defaults to 0.5% of the outer level. Each distinct inner main pocket contributes three evidence units to each eligible outer target, once per target. Multiple source timeframes marking that same child pocket do not multiply it. Child scores and child ladder totals are never recursively propagated. Each contributing pivot must have formed after the outer line's earliest confirmation and be fully confirmed by the evaluation cutoff. A pending or older contributor on another frame cannot suppress qualifying confirmed evidence.
- Distinct unswept chart-timeframe swings contribute one unit, with source-origin/price duplicates excluded. Each small pool belongs to its nearest eligible same-side group; near-line pools fold into the existing shared band, while farther approach swings keep their separate strips. Extra source pivots beyond one per frame contribute one unit each.
- `B = 100 × evidence / (evidence + cleanBuildHalf)`, with default `cleanBuildHalf = 1`. There is no age or elapsed-time bonus. One confirmed inner main swing gives B=75; with default 30+15 convergence, that produces approximately 71/100 rather than the old empty-buildup 39/100.
- Main lines stay at exact source prices, solid 2 pixels. Badges report the revised score; the line-only display does not merge separate source lines or fill the approach corridor.

The defaults are configurable in Clean display: price-buildup corridor, evidence for B=50, and price-buildup percentage. The old persistence-hours setting is removed. Small-pool evidence uses the chart timeframe, so buildup can differ between chart timeframes. The displayed score describes the current retained pocket, not a historical score series. The canonical minute consumption ledger, original bridge/data-window plots and alert rules do not consume the Clean rendering outputs.

## Validation

From `apps/the-desk`:

```sh
node --test tests/test_agentic_liquidity.mjs tests/test_agentic_liquidity_clean.mjs tests/test_agentic_liquidity_display.mjs tests/test_pine_live.mjs
node --test tests/test_agentic_host.mjs tests/test_pine.mjs tests/test_pine_serial.mjs tests/test_pine_editor.mjs
```

Reference tests compare the original and name-only reference scripts on identical synthetic MYM-like OHLC, every input definition, all 28 data-window feeds and drawing objects. They cover 1/2/3/5/15/30-minute, 1-hour, 4-hour and Daily chart execution; all enabled sources; display and consumption options; small-strip geometry and swept-history removal; source validation; and restoring all settings, visibility and geometry. Equivalent hex color case is normalized in drawing comparisons.

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

## Browser bundle refresh

The renderer source at Vela commit `9cc5e2f` supports `drawingAutoscale: false`. Rebuild Vela (`npm run build` in `integrations/vela`) before running `node build-vendor.mjs`; bundling stale ignored `dist` files silently loses that support. The Desk manifest records the actual source commit and browser-bundle hash.

## Clean-view acceptance (2026-10-18)

Thirty-eight distinct focused checks passed across the reference, clean, canvas and live suites. After the last persistence change, all 17 clean/live checks were rerun and passed. The installed Hyperliquid BTC 1h study was compiled through the Premium catalog, added once, and restored after saved reload with Clean mode, 15M enabled and consumed history disabled. Desktop (1600×1000) and narrow (543×900) views were inspected; the temporary viewport override was reset. Badges use actual canvas pixel spacing on every render, so a zoom can reveal a previously crowded badge without changing its price. The original source/reference tests and Original-view geometry remain covered. These checks do not certify native TradingView compilation or measured load-time gains.


## Right-hand details column

Clean-view details and scores align in one fixed column 12 CSS pixels inside the plot's right edge. Active lines and their shared pool bands finish at that same column. Source prices, pivot origins and retired endpoints remain unchanged. The existing badge collision rule still suppresses crowded text at its true price rather than shifting labels vertically.

When the indicator first loads, the latest candle receives 230 CSS pixels of future space, capped at 42% of the plot width on narrow charts. That pixel margin follows an anchored zoom and resize, and is reapplied after a chart reset, timeframe replacement or return to latest. Manual panning remains free; historical views are not pulled back to realtime. This is an application build adapter; the upstream Vela source and Pine calculations are unchanged.

The nine display tests pass, including real canvas commands for column alignment, offscreen source timestamps, common line/band endpoints and unchanged price coordinates. Layout checks cover candle spacing, narrow resize, timeframe reset and historical panning. The deployed Hyperliquid BTC chart was visually checked on 1h, 30m and 1m, including a 30m zoom. Browser previews are saved in `outputs/agentic-liquidity/right-column/` in the chart evidence workspace.


## Reset view correction

The cell context-menu reset previously selected `ALL`, bypassing the native renderer reset and fitting the newest candle against the right edge. The Desk build adapter now routes cell reset through the native reset action. With Clean Liquidity badges present, keyboard `0` and the context-menu reset share the same recent-candle framing: up to 160 candles, at least 5 CSS pixels of pitch where enough history is available, and the existing 230-pixel gutter capped at 42% of narrow plot widths. Reset clears manual price scales and in-flight panning. Date-range buttons, including `ALL`, retain their separate purpose.

Fourteen reset/display/menu tests passed. The reset integration tests bundle the actual adapted ChartCell, RendererControl and NativeRenderer, then execute the Desk menu action at 320/600/1200/1800-pixel plot widths, after panning and repeated reset, plus short-history and unsupported-renderer checks. The actual right-click reset was also exercised on the deployed Hyperliquid BTC 30m chart at compact and desktop browser widths.


## Price-driven buildup correction

The previous age-credit formula is archived in the chart evidence workspace as `outputs/agentic-liquidity/price-buildup/before-price-buildup.pine`. The supplied original and the name-only reference remain unchanged. The price-buildup revision had 82 inputs; the supplemental 5M overlay adds five more. Price-ladder tests cover both resistance and support, bounded corridors, confirmation ordering, multiple frames marking one child swing, nonrecursive evidence, price-driven buildup outweighing empty higher-frame convergence, and unchanged evidence at later timestamps. Original-view calculations and geometry remain compared against the preserved reference.

Validation for this correction: 32 focused scoring/display/reset/live checks passed. The final confirmation-safety change was followed by a fresh successful run of all 15 scoring/timeframe/Original-view checks. The Premium catalog compiled and ran the updated source, and saved reload restored one study and all three new controls. On the deployed Hyperliquid BTC 30m chart, resistance 82,479 showed 78/100 from two confirmed inner main swings; support 80,766 showed 80/100 from one confirmed inner main swing. These are current chart observations, not reference-cutoff parity or reversal probabilities. Evidence and the chart preview are saved under `outputs/agentic-liquidity/price-buildup/` in the chart workspace.


## Line-only main display

Clean main levels now render without the long shaded bands. Short standalone swing pools remain visible. Main and structure lines stop fourteen CSS pixels before the measured left edge of the widest badge, producing a shared clear text column. Badge backgrounds, text, tooltip information and exact price alignment are retained. Original-view fills are preserved. The Desk presentation adapter makes this change without changing Pine source, price-driven scoring, source pivots, or saved inputs.

All 13 canvas/display/reset checks passed, including measured line-to-badge clearance across plot widths and zoom, removal of main bands when badges are hidden, preservation of short pools and Original-view fills, and the real adapted reset path.


## Supplemental fixed 5M yellow pockets

The separate `06 · 5M reference pockets` controls add confirmed fixed-five-minute swing pockets to 1/2/3/4/5-minute charts only. The overlay defaults on, uses four completed source bars on each side of a pivot, retains at most 120 source pools and displays the nearest 16. Pockets have a solid yellow 1-pixel outline with a faint interior and span four 5-minute bars by default. Their short horizontal geometry stays anchored at the actual source pivot and never reaches the main badge column. Width, pivot confirmation length, display count and color are configurable.

These references run independently of the main `5M pools` switch and do not enter scoring, main clustering, analytical bridge outputs, handoff or alerts. Chart-timeframe small-pool evidence remains in the score; on these entry charts the old standalone red/green small strips give way to the yellow fixed-5M references. Higher charts retain their prior behavior and make no extra 5M reference request. Original-view reference defaults can be disabled with the separate toggle.

The source uses an offset completed-5M packet with lookahead-on mapping, so a retrospective pivot mark appears only after its confirmation bar closes. A canonical-minute ledger excludes pools on a later wick touch, across all supported entry chart timeframes; the next 5M packet cannot resurrect a pool already touched by a minute wick. Supplemental rendering and its requests are gated at chart level. Current source has 86 inputs; original/reference sources are unchanged.

The reference/live run passed 13 checks; separate minute-sweep, 4-minute parity and host-display checks also passed. Independent OHLC checks cover every 1/2/3/4/5-minute chart, including the confirmed-pivot tie rule. The local settings API updated only the existing saved Liquidity source string and verified the saved workspace matched, with drawings and input overrides preserved. Browser visual acceptance remains pending because local browser control was disabled in Work settings; refresh is required to load the new saved source.

The final-source scoring, all-timeframe and Original-view regression rerun passed all 15 checks. Combined with the 13 reference/live and three targeted checks, 31 checks passed with no remaining failures.


## Saved catalog release restoration and actual-data diagnostics

A later saved workspace contained the exact pre-reference catalog script, which has no yellow-pocket overlay. The chart had saved an older embedded script over the previously updated source. The host now recognizes only exact known catalog-release SHA-256 hashes at startup and on subsequent workspace saves, replacing that release's script with the current catalog source. IDs, inputs, visibility, drawings, sibling studies and chart layout are preserved. Edited custom scripts are not upgraded. A failed startup catalog fetch preserves the existing study and lets the app start. Three migration tests passed.

Actual Hyperliquid BTC snapshots were fetched from the local provider gateway and evaluated through the production Pine runtime and display adapter on 1m and 5m. The inspected 160-candle views contained nine yellow pockets on 5m and two on 1m, with ten active source pockets retained overall. PNGs under `outputs/agentic-liquidity/reference-5m/diagnostic/` are clearly labeled diagnostic renders using the actual Desk DrawingSceneRenderer, not app screenshots. The browser tool continued to report local browser use disabled after the user's attempt to enable it, so actual app-screen acceptance is still pending. Refresh is required to reload the updated host and embedded script.

Final pre-commit validation: all 61 focused reference-source, Clean-view, fixed-5M reference, canvas display, reset, catalog upgrade and live-update tests passed in one combined run. Source/bundle hashes, the pinned Vela revision, JavaScript syntax and patch formatting were checked. Browser-screen acceptance remains subject to the availability noted above; diagnostic renders are not app screenshots.
