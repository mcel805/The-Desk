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
