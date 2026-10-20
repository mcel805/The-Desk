# Cleo's Liquidity

## Use

Open **Indicators → Cleo's Liquidity → Open & test → Compile & test**.
Then **Add to chart**; **Save indicator** adds the source to the local library.
Open the study's **Settings** to configure the original 199 inputs.
Settings, visibility, source, and manual price/date anchors persist with the chart.

The supplied Wave Court v1.14 Pine v6 source is executed directly, with its
original calculations and 199 inputs retained. The declaration is named
`Cleo's Liquidity`. The display defaults select liquidity at the chart timeframe
and higher, show the nearest active pools plus a bounded set of recently broken
levels, and omit timeframe tags from broken levels. The original
`1H + 30M + 15M`, `Core`, `HTF + core`, and `All seven` scope choices and the
`All retained` line mode remain available. Original timeframe colors, labels,
micro structure, wick channels, Fibonacci lifecycle, candidate projections,
panels, convergence, manual anchors, completed 1M master and alert rules remain
in the source. The internal panel heading and alert names retain their original
Wave Court wording.

The supplied Fib/projection/pocket settings remain disabled by default. A
screenshot may show custom settings or other studies; those are not silently
substituted for the source's defaults. Price candles and chart chrome belong to
the chart's own settings.

Cleo's drawings share the candle price coordinates but do not expand the automatic
price scale. Distant higher-timeframe levels remain in the model and appear when
you pan or zoom the price axis to them. This also applies to previously saved Cleo
sources and `All retained` mode; no source replacement or settings reset is needed.

## Source and data contract

- `web/pine-examples/cleos-liquidity-original.pine`: supplied source, byte exact.
- `web/pine-examples/cleos-liquidity.pine`: named port with the display changes above.
- Provider, symbol, timeframe and cutoff come from the active chart; requests use
  that provider. Required missing secondary data fails visibly.
- The paper engine's supported markets remain Coinbase/Hyperliquid crypto. The
  optional IBKR provider adds one explicitly dated MYM futures chart with
  read-only candles and quotes; its account-free mode is labeled **DEMO DATA**
  and uses invented OHLCV. IBKR data never enters paper orders, P&L, the engine
  or the journal. See [IBKR-DATA.md](IBKR-DATA.md) for its setup, limits and
  verification boundary.
- Screenshot similarity does not establish TradingView numerical parity. Exact
  cross-runtime parity needs matching completed OHLC, history, input values and
  a TradingView CSV/reference. The editor exports comparison artifacts for this.
- Source history limits (400 per source / 1200 master by default) are preserved.
  Drawings and decisions can depend on how much history the provider returns.
- Alerts remain browser indicator events; the indicator cannot submit orders.
  Source conditional levels do not represent fills or measured performance.

## Runtime compatibility

Pinned `@luxalgo/vela-pinets 0.2.15` / `pinets 0.11.0` are unchanged. The original
nested security transport needs a scoped worker extension. Named Cleo sources
with the original master and market functions, including edited saved copies, select
`pine-compatible-worker.js`; other Pine indicators keep the existing worker.

`web/pine-compat/` applies host fixes to generated JavaScript, without rewriting
Pine calculations: lazy requested expressions; shared independent requested
contexts; exact pinned HTF/LTF samplers; awaited function scope lifetime; UDT
parameter rename repair; and same-timeframe tuple normalization. Secondary
contexts inherit inputs and viewport and bound their data to the chart cutoff.
Safe immutable request slices reduce work; stateful expressions use the full
capture path. This adapter is scoped to the supplied source, not a promise of
universal Pine compatibility. Worker stop/cancel and host execution deadlines
prevent failed studies from holding the UI.

The compatibility worker serializes static recalculations and acknowledges
deferred startup. Viewport changes and forming-bar updates cannot overlap
full-history runs; consecutive updates are coalesced with all input edits retained.

Cleo runs in its own worker with a 120-second execution limit to accommodate the
canonical 1M master on slower or higher-timeframe charts. The 4H fixture check
uses the app's 600-bar chart history and confirms the study draws without
timing out.

The copied sampling helpers and extension carry AGPL-3.0-only notices. Original
runtime licenses and source links remain in `web/vendor/`. Rebuild from the
pinned lockfile with `npm ci` then `node build-pine.mjs`.

## Acceptance checks

```sh
node --test tests/test_cleos_liquidity.mjs tests/test_cleo_live.mjs
node --test tests/test_pine.mjs tests/test_sma.mjs
python3 -m unittest discover -s tests -v
```

For browser acceptance, start an isolated Desk server and a dedicated Chrome
debugging session, then run:

```sh
node tests/verify_cleo_browser.mjs http://127.0.0.1:18882/ http://127.0.0.1:9226 /private/tmp/cleo-browser-report.json
```

This check uses real Hyperliquid BTC bars on 1M and 4H, installs `All retained`
mode, measures the rendered candle scale, saves and reloads all 199 inputs, and
captures both charts. Use an isolated data directory: the check edits that test
workspace. It fails when distant liquidity drawings stretch the price scale.

The Cleo fixture suite compares original and renamed executions: all inputs,
nine numeric outputs, lines, labels, boxes, linefills, tables and their geometry
and style. It independently checks nested completed HTF/LTF sampling, manual
anchors/layer toggles, 1M transport, UDT parameters, live tick/new-bar updates,
input restarts and viewport updates. Browser acceptance additionally exercises
source compilation, native drawing rendering, library saving, settings, chart
persistence, visibility and timeframe changes. Full TradingView parity remains
a separate reference-evidence check.
