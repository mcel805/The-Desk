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
