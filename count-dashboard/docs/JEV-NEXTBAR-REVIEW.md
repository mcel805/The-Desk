# Jev next-candle chart review

Open `/nextbar-test.html`, or **Jev chart test** in Day Desk. This is a separate numerical chart experiment. It does not start a hunt, call Rider, read account/strategy histories, or route orders. The supplied screenshots are visual references; their orange baseline and unwired cyan Jev row are not evidence of model accuracy. The supplied scope document informs Test 1 only; setup filtering and futures execution remain outside this experiment.

## Real-data replay sessions

The page defaults to public Hyperliquid BTC historical replay and loads six hours of completed 1-minute candles. The first 60 candles seed the forecast; the remaining five hours can be replayed. Choose any loaded minute as the start, or import a contiguous real 1-minute CSV. Forming candles are excluded; unavailable or invalid public data is reported without a synthetic substitute.

A large session board shows chart time remaining, the chart clock, elapsed chart time, active viewing time, the last completed close, and the price change since session start. Presets: 5, 15, 30, 60 and 120 chart minutes. Speeds: 1×, 10×, 30× and 60×. At 60× each recorded minute takes one viewing second, plus request processing. Start, Pause, Resume, Step and Reset preserve a pending forecast and prevent automatic requests after session completion. Long sessions require enough loaded history. Jev stays limited to 30 reads per run; choose at most 30 minutes with Jev enabled, or disable it for longer price/ATR replay.

Replay prices advance at actual completed candle closes. There is no invented open-high-low-close tick path: one-minute OHLCV cannot establish the order or timing of intrabar trades. Forecasts are frozen before the target candle is revealed. API processing pauses playback; the countdown follows chart time, not wall time. CSV export downloads the loaded candle history, including the future replay candles; exported raw data is not forecast input. Receipt exports contain only recorded prior input and revealed outcomes.

Forward sessions use elapsed target-market time from the first forecast, stop starting new forecasts at the selected deadline, and allow the final pending outcome to resolve after closure. Replay results restored by run URL are view-only; Reset and Load chart starts a fresh replay.

## Contract

- Source modes: seeded synthetic demo; public Hyperliquid BTC historical replay; Hyperliquid BTC forward; user CSV replay (MES/MNQ etc require real source CSV and explicit analysis tick).
- Each request contains only the preceding 60 contiguous completed 1m OHLCV bars, source/cutoff, ATR(14 simple mean true range), and compact price/volume features. No future bar, account data, hunt, private strategy, or images enter the model state.
- Jev `jev-1.13.0` answers two independent Choice questions over candidate prices from −4 to +4 ATR around last close. Code maps selected values to upper/lower prices, rounds outward to the analysis tick unit, and rejects crossed/nonpositive bounds. `UNAVAILABLE` is an explicit choice. This is bounded candidate selection, not unconstrained numeric generation or a calibrated coverage interval.
- Original typed answers, probabilities, usage, latency, cost, completed input, settings, state hash and actual next candle stay in a separate SQLite receipt ledger: `data/jev-nextbar-review.sqlite3`. CSV filenames/text are not transmitted. Server credentials never enter frontend code.
- Existing strict distribution checks stay intact; malformed probabilities are not normalized or replaced with an ATR result. One request, no hidden retry. A run has at most 30 Jev requests.
- Forward mode fetches and verifies canonical public completed bars server-side. It begins within 15 seconds of target-bar open, records actual return time and lead time, and rejects scoring as eligible if returned after target close. Forming candle data is excluded.
- HTTP/model/timeouts and invalid/abstained responses preserve the ATR baseline and measurable failed-call costs. Unknown usage stays unknown. Duplicate calls return the frozen receipt; settings/source cannot change within a run. Crash-left pending receipts stay pending (export/reset; do not re-bill).
- Replay freezes before revealing the target bar. This establishes no future leakage in the request, not a forward trading edge. The model may have prior knowledge of historical markets; use forward data for stronger evidence.

## Measurement

All resolved baseline versus all valid resolved Jev rows are shown, alongside request coverage and failed/abstained/slow/late counts. The paired comparison restricts both methods to the same valid timely resolved candles. Per-candle metrics: containment, high/low inside, band width in user tick units, absolute high/low error in ticks. Latency average/max measures total server prediction processing, including public verification, and includes failed returned calls. API-only timing is also retained. >=30s is slow and excluded from the paired screen. A 100-candle minimum is a rough exploratory screen, not proof of statistical or financial value. Results, costs and forecasts are exportable as JSON.

Reset creates a new run without deleting old server receipts. This page owns a bounded visible-browser loop only; closing it stops new calls. This is not an unattended session worker.

## Sources checked October 10, 2026

- https://docs.typesafe.ai/api — endpoint and typed Choice contract.
- https://docs.typesafe.ai/primitives/choice — criteria and parallel independent questions.
- https://docs.typesafe.ai/models — pinned Jev version, text-only state, input pricing $0.042/M tokens.
- https://docs.typesafe.ai/cookbooks/pre_parsed_value_extraction_cookbook — candidate selection rather than arbitrary numeric generation.
- https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint — public 1m candleSnapshot fields.

## Focused checks

`python3 -m unittest discover -s count-dashboard -p test_jev_nextbar_review.py -v`

`node --test count-dashboard/web/test-nextbar-core.mjs`

Manual acceptance: load real public replay, enable Jev, freeze/reveal three steps, inspect cyan/orange lines and receipt totals; test seeded baseline steps and CSV validation; confirm live forward receipt is pending before target close and resolves only afterward. See the delivered evidence for which checks ran and their results.

## Acceptance evidence, October 10, 2026

- 17 Python cases and 4 JavaScript cases: causal inputs, source identity/canonical tape, malformed distributions, abstention/crossed prices, immutable outcomes, duplicate/settings guards, 30-read cap, forming candle exclusion, slow/late handling, exact forward closure, CSV and paired denominators.
- Actual public replay `public-replay-de3437d632384fca8384a15a64025b81`: 3 calls, 2 valid, 1 rejected sum=0.99; model API latency 417–930ms; 22,917 tokens, estimated $0.00091967. Same two timely valid candles: Jev 50% contained at 22 analysis ticks average width, baseline 100% at 65. Too small to establish an edge.
- Actual forward browser run `185716f5-daa4-490f-b458-b942f987899b`: one valid forecast, received server-side 56.744 seconds before target close. Forecast saved with no actual candle, then resolved only after completion. Target 2026-10-10 09:56 PDT. Jev 10-tick band and ATR 26-tick band both missed the next low. Cost $0.00031051.
- Browser layout verified with saved public receipts, synthetic bounded Run, Pacific timezone, orange/cyan segments and failure counters. A shared absolute canvas-position rule was corrected. Saved runs reopen with `?run=RUN_ID`.
- No trading sessions, accounts or orders were started. Service health and isolated routes checked on 8770.
- Receipt snapshots and screenshots preserved locally in `/private/tmp/jev-nextbar-*-test.json` and `/private/tmp/jev-nextbar-*-result.jpg`; runtime database remains outside Git.
