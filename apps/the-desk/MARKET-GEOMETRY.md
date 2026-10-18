# Agentic - Market Geometry

Open **Indicators → Agentic - Market Geometry · Premium → Compile & test → Add to chart**. The catalog entry uses the existing blue Premium badge. It is dropdown-only; startup does not seed My Pine indicators.

The user-supplied Wave Court Market Geometry 1.0 source is archived byte-for-byte in `web/pine-examples/agentic-market-geometry-original.pine`. The named source changes only the title and short title. All twelve inputs, defaults, bounds, pivot confirmation, chart-timeframe timestamp interpolation, intervening wick audit, opposite-rail offset, touch counting, retained history, eight-pivot/48-channel ledgers, active-first quotas, historical wick-break endpoints, colors, widths, dashes and optional three-label limit are preserved. Standard time-based candles of at least one minute are required. Forming candles cannot mutate completed channel state. No forward rail extension, fill, wave engine or trade signal is added.

The existing compatible worker supplies the completed-history boundary while a candle is forming. The Desk adapter preserves candle autoscaling by excluding channel drawings from price-range calculation. Generic Pine source, input, visibility and workspace persistence apply unchanged.

## Validation

Run from `apps/the-desk`:

```sh
node --test tests/test_agentic_market_geometry.mjs tests/test_pine.mjs tests/test_pine_serial.mjs tests/test_pine_editor.mjs
```

All 43 focused checks passed (including eighteen feature tests). The feature tests execute the original and named Pine using the installed runtime and independently calculate the channel ledger. Coverage includes 1m/1h, timestamp gaps, equal-wick pivots, tick tolerance, retained history, active/broken quotas, labels, colors, input off/on updates, saved hidden-state restoration, completed wick breaks, forming-bar exclusion, and the sub-minute rejection.

These are executable local runtime tests, not a TradingView compiler test or cross-platform certification. The supplied screenshots identify MYM1! / CBOT on 1h and 1m, with visible Oct 16 data. Exact matching-data numeric or pixel parity needs identical continuous-contract OHLC, history, tick size, session settings, all inputs, viewport and completed-bar cutoff. Browser review uses identified Coinbase BTC-USD data; it cannot establish MYM screenshot parity.

The broader Elliott regression includes a pre-existing journal bridge SHA mismatch in `source-manifest.json`; this feature does not alter that journal manifest entry.

Browser acceptance passed at `http://127.0.0.1:18884/` using real Coinbase BTC-USD data: 1h defaults produced 16 rails; 1m with pivot=3, displayed=5 and labels enabled produced 10 rails and 3 labels. Both chart models exactly matched the archived original executed in the same compatible worker on identical 600-candle snapshots (drawing IDs/pane routing excluded). Premium catalog, UI compilation, input changes, hide/show, all-twelve-input reload restoration, and removal passed. Evidence is retained in the user chart workspace under `Agentic Market Geometry Evidence/`. The isolated server disabled quote workers and had no Lux Journal companion.

The broader 60-check run passed 59 checks; its sole failure is the baseline journal bridge fingerprint mismatch mentioned above. No-mistakes could not start with `--base-branch codex/desk-wallet-funding` because that unpublished baseline branch does not exist on origin. No pipeline pass, remote CI, push or PR is claimed.
