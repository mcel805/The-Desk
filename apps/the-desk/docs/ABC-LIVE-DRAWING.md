# ABC and Market Geometry live presentation

The Desk draws observed ABC legs with solid teal (support/long campaigns) or red
(resistance/short campaigns) strokes, matching the supplied swing-path reference.
The current wick endpoint is labeled `A · forming`, `B · forming`, or `C · forming`.
Confirmed pivots retain plain A/B/C labels. A remains solid throughout.

Yellow dashed lines are provisional visual forecasts. Before confirmed A/B,
the display uses a 0.618 A-leg retracement for B, or a 0.382 continuation of the
observed leg / mean wick range when no measured destination is ahead. Developing
C uses the existing Pine C forecast when it is still ahead; after that destination
is exceeded the visual continues the observed range by 0.382. These visual
heuristics never feed confirmation, alerts, entry/retest/risk gates, or orders.
Faint dashed A–C parallels and B/A ratios describe the current drawing only.

Pine still owns the original completed-candle contact, pivot, C, SHIFT, retest,
handoff, expiry and risk decisions. Read-only timestamp exports anchor the display.
Intrabar ticks redraw from cached Pine models without re-executing that lifecycle.
Market Geometry keeps the original wick-safe channel ledger and break endpoints;
the host colors existing rails and appends faint dashed 20-bar extensions.

Reloading an exact shipped v1 ABC source upgrades its presentation. The known
white/default projection settings migrate once; edited Pine sources and custom
colors are preserved. Workspace saves persist the upgraded executed source, inputs,
visibility and declaration properties. Drawing autoscale remains disabled so distant
projections do not compress the price chart. These are Desk rendering checks;
matching-data TradingView parity remains unverified.

From `apps/the-desk`, run:

```sh
node --test tests/test_abc_live_drawing.mjs tests/test_agentic_abc_reversal.mjs tests/test_agentic_market_geometry.mjs tests/test_pine.mjs
node tests/verify_agentic_abc_browser.mjs http://127.0.0.1:18891/ /tmp/abc-browser
node tests/verify_abc_live_drawing_browser.mjs http://127.0.0.1:18891/ /tmp/abc-live
node tests/verify_agentic_market_geometry_browser.mjs http://127.0.0.1:18891/ /tmp/geometry-browser
```

Use an isolated server with an empty temporary data directory. The live-drawing
browser test labels its feed as synthetic, renders all three forming stages, pushes
a wick update through Vela's feed, and checks that completed audit series stay
unchanged. The real-data browser checks cover catalog/add, producer connection,
settings, visibility, reload, timeframe restrictions and removal. None place orders.

## Play lifecycle rendering

`web/abc-play-history.mjs` replays completed Pine audit rows against the same-chart Liquidity bridge. It owns the yellow active-level overlay and bounded START/END history. It retains a qualified play beyond Pine's terminal setup phase; next-level touches, confirmed adverse structure/C closes and expiry determine the visual endpoint. It never feeds those endpoints into Pine confirmations, retests, risk, alerts or account commands. Live wicks can still redraw forming ABC legs while completed play endpoints remain unchanged.

Completed paths use frozen snapshots and exclude future bars and forecast rails. Active B and C-to-HL/LH references remain visible. Exact v2 source migration enables completed history once without resetting colors, indicator IDs or unrelated settings; later history toggles remain respected.


### Shared touched-level markers

The host retains the exact touched liquidity price with a TOUCHED price tag, a dashed lead-in from its first continuous observation in the same-chart Liquidity candidate feed, and the contact START. The lead-in is an observation timestamp, not a reconstructed source-pivot origin. Active lines glow yellow; finished play levels remain faded/dashed with their frozen endpoints.

A workspace-only display registry copies these play-level lines and START/END markers to matching standard higher-timeframe ABC studies (15m, 30m, 1h, etc.). It preserves the entry-chart event timestamp and price; only the short horizontal marker length adapts to the viewing timeframe. Labels identify the source as 1m or 5m. The registry prefers one unambiguous 1m source, falls back to one 5m source, rejects mixed providers/symbols/styles and stale or future cutoffs, and clears markers when the source stops or loses its Liquidity feed. The source chart must remain open in the workspace. Duplicate same-timeframe sources are ambiguous and are not shared.

Shared drawings never become Pine transport inputs, audit contacts, confirmations or alerts. The 1m/5m entry studies continue to calculate their own original decisions; higher-timeframe studies show shared context only. Completed history honors the target study's Keep history preference. No account/order code is involved.
