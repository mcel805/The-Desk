# Cleo's Liquidity

## Use

Open **Indicators → Cleo's Liquidity → Open & test → Compile & test**.
Then **Add to chart**; **Save indicator** adds the source to the local library.
Open the study's **Settings** to configure the original 199 inputs.
Settings, visibility, source, and manual price/date anchors persist with the chart.

The supplied Wave Court v1.14 Pine v6 source is executed directly. The only
source change is its declaration title and short title: `Cleo's Liquidity`.
Original timeframe colors, labels, merged tiny timeframe numbers, micro
structure, wick channels, Fibonacci lifecycle, candidate projections, panels,
liquidity/convergence, manual anchors, completed 1M master and alert rules remain
in the source. The internal panel heading and alert names retain their original
Wave Court wording to preserve the requested source behavior.

Defaults are the supplied defaults, including Fib/projections/pockets disabled.
A screenshot may show custom settings or other studies; those are not silently
substituted for the source's defaults. Price candles and chart chrome belong to
the chart's own settings.

## Source and data contract

- `web/pine-examples/cleos-liquidity-original.pine`: supplied source, byte exact.
- `web/pine-examples/cleos-liquidity.pine`: name-only port.
- Provider, symbol, timeframe and cutoff come from the active chart; requests use
  that provider. Required missing secondary data fails visibly.
- Supported Desk markets are Coinbase/Hyperliquid crypto. This app has no MYM
  futures feed. MYM fixture tests use explicitly synthetic OHLC, never live MYM.
- Screenshot similarity does not establish TradingView numerical parity. Exact
  cross-runtime parity needs matching completed OHLC, history, input values and
  a TradingView CSV/reference. The editor exports comparison artifacts for this.
- Source history limits (400 per source / 1200 master by default) are preserved.
  Drawings and decisions can depend on how much history the provider returns.
- Alerts remain browser indicator events; the indicator cannot submit orders.
  Source conditional levels do not represent fills or measured performance.

## Runtime compatibility

Pinned `@luxalgo/vela-pinets 0.2.15` / `pinets 0.11.0` are unchanged. The original
nested security transport needs a scoped worker extension. Only the exact named
Cleo source with its normalized source signature selects
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

The copied sampling helpers and extension carry AGPL-3.0-only notices. Original
runtime licenses and source links remain in `web/vendor/`. Rebuild from the
pinned lockfile with `npm ci` then `node build-pine.mjs`.

## Acceptance checks

```sh
node --test tests/test_cleos_liquidity.mjs tests/test_cleo_live.mjs
node --test tests/test_pine.mjs tests/test_sma.mjs
python3 -m unittest discover -s tests -v
```

The Cleo fixture suite compares original and renamed executions: all inputs,
nine numeric outputs, lines, labels, boxes, linefills, tables and their geometry
and style. It independently checks nested completed HTF/LTF sampling, manual
anchors/layer toggles, 1M transport, UDT parameters, live tick/new-bar updates,
input restarts and viewport updates. Browser acceptance additionally exercises
source compilation, native drawing rendering, library saving, settings, chart
persistence, visibility and timeframe changes. Full TradingView parity remains
a separate reference-evidence check.
