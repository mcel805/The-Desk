# Jev next-candle chart review

Open `/nextbar-test.html`, or **Jev chart test** in Day Desk. This is a separate numerical chart experiment. It does not start a hunt, call Rider, read account/strategy histories, or route orders. The supplied screenshots are visual references; their orange baseline and unwired cyan Jev row are not evidence of model accuracy. The supplied scope document informs Test 1 only; setup filtering and futures execution remain outside this experiment.

## Real-data replay sessions

The page defaults to public Hyperliquid BTC historical replay and loads six hours of completed 1-minute candles. The first 60 candles seed the forecast; the remaining five hours can be replayed. Choose any loaded minute as the start, or import a contiguous real 1-minute CSV. Forming candles are excluded; unavailable or invalid public data is reported without a synthetic substitute.

A large session board shows chart time remaining, the chart clock, elapsed chart time, active viewing time, the last completed close, and the price change since session start. Presets: 5, 15, 30, 60 and 120 chart minutes. Speeds: 1×, 10×, 30× and 60×. At 60× each recorded minute takes one viewing second, plus request processing. Start, Pause, Resume, Step and Reset preserve a pending forecast and prevent automatic requests after session completion. Long sessions require enough loaded history. Jev supports up to 120 reads per run; choose up to two hours with Jev enabled, or disable it for longer price/ATR replay.

Replay prices advance at actual completed candle closes. There is no invented open-high-low-close tick path: one-minute OHLCV cannot establish the order or timing of intrabar trades. Forecasts are frozen before the target candle is revealed. API processing pauses playback; the countdown follows chart time, not wall time. CSV export downloads the loaded candle history, including the future replay candles; exported raw data is not forecast input. Receipt exports contain only recorded prior input and revealed outcomes.

Forward sessions use elapsed target-market time from the first forecast, stop starting new forecasts at the selected deadline, and allow the final pending outcome to resolve after closure. Replay results restored by run URL are view-only; Reset and Load chart starts a fresh replay.

## Jev predictive-channel paper algo

Enable **Jev channel algo** with Jev for a real Hyperliquid BTC replay. Defaults: $10,000 hypothetical USD capital, $500 maximum position notional, selectable Conservative (0.25%), Balanced (0.5%) or Aggressive (1%) risk profile, an explicit dollar maximum per trade, assumed 5 bps fee and 1 bp slippage per fill. Sizing uses the lower of profile risk on current paper equity and the dollar cap, then includes modeled stop costs and notional limits. Costs are configurable assumptions, not exchange fee quotes. This is an isolated USD linear BTC simulator, without broker/account/order calls. CSV, synthetic and forward modes are excluded from this algo because their contract or intrabar arrival-time evidence differs. Forecast-only modes remain available.

For each timely valid forecast, the chart connects Jev's predicted high and low into the raw one-candle-ahead channel. The last completed-bar Parabolic SAR state sets the only allowed direction: dots below price permit longs; dots above price permit shorts. New longs enter near the lower calibrated Jev band and new shorts near the upper band, following the last completed Parabolic SAR direction. Each band side expands to the 90th percentile of that side's positive misses in the preceding ten timely, resolved Jev forecasts, after at least two misses; each expansion is capped at the smaller of 2× ATR and 2× raw Jev width. Entry and the protective stop beyond the expanded band are frozen before target OHLC is revealed. A band narrower than four analysis ticks is skipped. Risk sizing accounts for the full stop distance and assumed costs.

Dynamic stop buffer = expanded band width × (0.25 + 0.5 × (1 − prior containment score)). Prior score = (prior contained + 1)/(prior eligible samples + 2), over at most the preceding ten resolved Jev candles. This is a provisional channel-calibration input, not a trade-win probability. Stops sit beyond the expanded band; for open positions each new valid Jev band may tighten the stop but cannot widen it. Risk sizing accounts for the original stop distance, assumed fees/slippage, notional and available paper equity; there is no leverage.

Touch fills are paper assumptions. Marketable opening entries receive no favorable gap improvement. Opening beyond the protective stop cancels the entry. Only one position may be open. For new v4 paper sessions, a long profit target is the frozen opposite Jev-band high; a short target is the frozen opposite Jev-band low. Existing v3 runs keep their prior favorable-close exit behavior. A target fills when the candle touches it. The protective stop takes precedence if both stop and target are touched in one candle. If entry and target are both reached intrabar on the entry candle, the target is not credited because OHLC cannot establish their order. The last session candle closes any remaining position. Exact tick times, queue/liquidity evidence and intrabar drawdown remain unavailable.

Each receipt stores its paper settings, frozen plan and settled outcome; the model receives only its existing public candle state, never simulated capital/risk settings. Resolve is idempotent, settings cannot change mid-run, each prior paper candle must resolve before the next consecutive forecast, and finalized sessions accept no new predictions. A separate local finalization marker persists the end statement. No historical baseline-only runs are retroactively labelled as Jev trades.

The session report shows gross price P&L, fees, slippage, net trading P&L, ending capital, API estimate separately, net after known API cost, return, long/short counts, net win rate, expectancy, profit factor, closed-trade drawdown, ambiguous fills, skipped candles and failed forecasts. The equity chart and ledger update after candle reveal. Download readable HTML statement, JSON audit and trades CSV; saved run URLs restore the final statement. A failed/unknown API cost is never silently treated as measured zero. Statements remain provisional until all configured candles resolve and the end marker is saved.

## Contract

- Source modes: seeded synthetic demo; public Hyperliquid BTC historical replay; Hyperliquid BTC forward; user CSV replay (MES/MNQ etc require real source CSV and explicit analysis tick).
- Each request contains only the preceding 60 contiguous completed 1m OHLCV bars, source/cutoff, ATR(14 simple mean true range), and compact price/volume features. No future bar, account data, hunt, private strategy, or images enter the model state.
- Jev `jev-1.13.0` answers two independent Choice questions over candidate prices from −4 to +4 ATR around last close and one Noul close-direction question. Code maps selected values to upper/lower prices, rounds outward to the analysis tick unit, and rejects crossed/nonpositive bounds. `UNAVAILABLE` is an explicit choice. This is bounded candidate selection, not unconstrained numeric generation or a calibrated coverage interval.
- Original typed answers, probabilities, usage, latency, cost, completed input, settings, state hash and actual next candle stay in a separate SQLite receipt ledger: `data/jev-nextbar-review.sqlite3`. CSV filenames/text are not transmitted. Server credentials never enter frontend code.
- Existing strict distribution checks stay intact; malformed probabilities are not normalized or replaced with an ATR result. One request, no hidden retry. A run has at most 120 Jev requests.
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

- 17 Python cases and 4 JavaScript cases: causal inputs, source identity/canonical tape, malformed distributions, abstention/crossed prices, immutable outcomes, duplicate/settings guards, 120-read cap, forming candle exclusion, slow/late handling, exact forward closure, CSV and paired denominators.
- Actual public replay `public-replay-de3437d632384fca8384a15a64025b81`: 3 calls, 2 valid, 1 rejected sum=0.99; model API latency 417–930ms; 22,917 tokens, estimated $0.00091967. Same two timely valid candles: Jev 50% contained at 22 analysis ticks average width, baseline 100% at 65. Too small to establish an edge.
- Actual forward browser run `185716f5-daa4-490f-b458-b942f987899b`: one valid forecast, received server-side 56.744 seconds before target close. Forecast saved with no actual candle, then resolved only after completion. Target 2026-10-10 09:56 PDT. Jev 10-tick band and ATR 26-tick band both missed the next low. Cost $0.00031051.
- Browser layout verified with saved public receipts, synthetic bounded Run, Pacific timezone, orange/cyan segments and failure counters. A shared absolute canvas-position rule was corrected. Saved runs reopen with `?run=RUN_ID`.
- No trading sessions, accounts or orders were started. Service health and isolated routes checked on 8770.
- Receipt snapshots and screenshots preserved locally in `/private/tmp/jev-nextbar-*-test.json` and `/private/tmp/jev-nextbar-*-result.jpg`; runtime database remains outside Git.

## First paper acceptance replay · 10 October 2026

Saved run `00686cef-086a-42fb-8f68-e5ec98130db1` replayed five real Hyperliquid BTC minutes, 05:37–05:42 Pacific, at 60×. Five timely valid Jev forecasts; three contained both extremes; no failed forecasts. One LONG closed at minute close; four entries were not reached. Starting $10,000; gross price P&L $0.01207296; assumed fees $0.99940566; assumed slippage $0.19988113; net trading P&L −$1.18721384; ending balance $9,998.81278616. Separate API estimate $0.00155118. This tiny historical sample provides no evidence of a trading edge.

The browser completed the run, restored the finalized ledger after a server restart and downloaded the readable HTML P&L statement. No automated test suite was run for this change. Final chart evidence, statement and notes are under the MYM chart workspace's `Charts/Analysis/1M/`.


## $500 account and maximum-risk profile replay · 10 October 2026

Saved run `5a13c428-a8be-46ce-8185-1bd6da3df76f` used $500 start equity, **Balanced (0.5%)**, a hard **$2.50 maximum risk per trade**, $500 maximum notional, 5 bps assumed fees and 1 bp slippage per fill. Five-minute real Hyperliquid BTC 1m replay, 06:09–06:14 Pacific, at 60×. All five forecasts were valid; Jev and ATR each contained all five bars in this short sample. The system selected LONG setups, but every entry level was missed, so it opened zero positions. Trading P&L $0.00; ending balance $500.00; max closed-trade drawdown $0.00; separate Jev API estimate $0.00155030. No failed forecasts.

Risk sizing takes the lower of current equity × selected profile percentage and the dollar ceiling, then sizes for the modeled stop distance plus assumed stop costs, position notional and equity. This run's frozen planned stop risks were below the $2.50 ceiling because notional sizing also constrained quantity. The new UI shows that planned amount against the ceiling for every setup. The result demonstrates control behavior, not profitability; five bars are insufficient evidence.


## Price-action paper strategy (v6, 2026-10-10)

Choose **Jev price-action swings** in Paper risk settings. The original v5 band-limit strategy remains selectable and frozen saved runs retain their original versions. API clients omitting `strategy` retain v5. `strategy: "price-action"` selects v6. No new model questions or external requests are added by this strategy overlay.

The design uses Jev's fast refreshed range to qualify and invalidate a passive order rather than placing a trade on every forecast. The close-up judgment remains recorded for review, as requested.

1. Require a timely valid Jev forecast. Use only forecast outcomes resolved before this decision to expand raw bands with the existing capped miss calibration.
2. SAR must agree on the last two completed candles. The last candle must close favorably versus its predecessor and finish in the favorable 45% of its range, with either a rejection beyond the prior extreme or a favorable candle body.
3. Rest LONG at the lower calibrated band, SHORT at the upper; the limit must be passive relative to the last completed close. Target the opposite calibrated band.
4. Before entry, gross room must be at least twice modeled round-trip fees and exit slippage. Net target reward must be at least 1.25 times full modeled stop risk. These are research defaults, not expected-value estimates or win probabilities. Never manufacture a wider target to pass this filter.
5. Stop beyond both the band plus 0.75 ATR and the recent three-bar extreme plus one analysis tick. Size quantity from this full distance and costs under the selected risk/notional caps.
6. Freeze entry, target, stop and quantity for up to two candles. Cancel for stale/unavailable Jev, SAR reversal, expiry, or a new band supporting less than half the original target distance. Re-evaluate on a subsequent candle; do not chase an amendment.
7. While open, tighten the band/structure stop only after a favorable completed close, never widen it. Exit at the next open after SAR reversal, a five-minute holding limit, or two consecutive unavailable forecasts. Adverse stop gaps use the opening price. Opposite-band touch remains the target; stop wins ambiguous OHLC collisions. Session end closes residual positions.
8. Stop new entries after 2% realized session loss. This is a new-entry threshold, not a guaranteed maximum loss: gaps and an existing position can exceed it.

The scoreboard displays the actual skip/cancel reason, such as insufficient room after costs. Open P&L now uses the actual paper entry fill and exit costs, correcting the previous extra entry-slippage subtraction. One-minute historical OHLC does not support actual intrabar tick trading or queue-aware fills.

### Evaluation of saved run ffd300da-25c1-4a86-a65c-b30169eca06c

120 candles; $500 start; balanced risk; $2.50 maximum per trade; $500 notional cap; assumed 5 bps fees and 1 bps exit slippage. Original v5: 13 trades, 0 net wins, 12 stops and one session-end exit; gross -$0.776572, fees $6.449002, slippage $0.644909, net -$7.870482, ending $492.129518. Jev API estimate is separately $0.037331.

114 eligible forecasts; raw containment 77/114 (67.54%), ATR baseline containment 103/114 (90.35%). This coverage comparison does not compare equal band widths and is not a profitability test. Jev close-up selected NOT_UP on all 114 forecasts: 68/114 correct, identical to an always-NOT_UP classifier. Median latency 160 ms, maximum 408 ms. Six forecasts were rejected: five distributions summed to 0.99 and one selection disagreed with its largest probability. Invalid distributions stay rejected.

Causal offline replay using those exact frozen forecasts and current costs: v6 places no orders; 110 cost rejections, four too-small channels, six unavailable forecasts. Trading net $0; ending $500; after the existing known Jev estimate, -$0.037331. No new Jev calls were made. All 120 original v5 outcomes reproduced exactly. An earlier, separate two-hour saved window (0f0dac5d-5574-4c90-acd0-a32ec3f30e62) also produces no v6 orders at the same costs. It had no saved main-paper configuration, so no original P&L comparison is claimed for that window.

This redesign prevents economically undersized entries in these samples; it has not demonstrated profitable trading. On BTC near $83,000, the saved 11 bps round-trip cost assumption implies roughly $91 price room just to break even, before adding any safety margin. Larger real swings or verified lower execution costs would be necessary. Increasing leverage or the account balance does not improve return per unit of price movement.

### Next research step

Evaluate fresh, separate higher-volatility windows without changing these thresholds to fit them. If one-minute ranges remain below costs, design a separate multi-minute forecast experiment with explicitly scored follow-through/invalidation judgments. Jev's numerical band alone is not a sustained-trend or target-before-stop probability. TypeSafe's confidence describes concentration among question options; validate any new judgment against trading-domain outcomes before gating entries. See [TypeSafe confidence](https://docs.typesafe.ai/confidence) and [parallel questions](https://docs.typesafe.ai/patterns/fan-out).

The expanded risk-settings drawer now opens above the chart as an overlay: its previous percentage-height grid layout collapsed the controls. Browser selection between original and price-action strategies was confirmed. An offline mocked API lifecycle also confirmed predict → freeze → resolve → statement → finalize with v6, without a new model request.


## Five-minute Jev swings (v7)

The `five-minute` paper strategy is the new-session default; the previous one-minute strategies remain selectable and their receipts preserve their original rules. This is historical paper simulation, with no broker routing.

- Forecast horizon and SAR direction: five minutes, UTC aligned. Exactly 60 fully completed five-minute OHLCV bars are aggregated from preceding contiguous one-minute public Hyperliquid BTC bars. Forming buckets are excluded. The browser loads 900 minutes of public history and randomizes eligible aligned starts.
- Execution and P&L marks: completed one-minute candles. The chart stays at one minute to show fills/stops, and its SAR dots use only previously completed five-minute bars. A one-hour session makes 12 Jev requests and resolves 60 execution candles. Each forecast is immutable for its five-minute horizon; reuse incurs no extra model call or usage estimate.
- A favorable one-minute close/rejection, passive Jev-edge limit, two agreeing five-minute SAR states, cost coverage and net reward/risk qualify entries. Jev close direction is recorded for review only.
- Limits freeze entry, target, stop and quantity for five minutes; no market chasing. Target: frozen opposite calibrated band. Initial stop: beyond band and recent one-minute structure with a 0.75 five-minute ATR buffer. Stops tighten only on favorable completed action.
- Position exit: band target, protective stop, next one-minute open after five-minute SAR flip, two distinct unavailable forecast horizons, or 15-minute hold; final session candle closes any remaining position. Stop takes precedence in OHLC collisions; adverse gaps use worse opening prices.
- Calibration scores complete prior five-minute outcomes only, once per horizon. Individual one-minute containment is not presented as five-minute forecast accuracy.
- Default test account: $500, balanced 0.5% / $2.50 maximum modeled risk per trade, $500 notional cap, no leverage. New entries halt at 2% realized loss. Gaps can exceed modeled risk.
- Fees are editable assumptions: 1.5 bps for limit entry/target, 4.5 bps for stop/forced exit, 1 bp adverse slippage for non-target exits. Planning also reserves 1 bp friction for targets; actual simulated limit targets fill at their price. OHLC touch assumes a fill without queue evidence. These are published base-tier fee references, not verified personal account rates.
- Jev requests contain only public aggregated OHLCV, identity/cutoff, ATR, candidate prices and forecast horizon. Paper balance, risk settings, trades and private account data are not sent.

Validation: `python3 -m unittest discover -s count-dashboard -p 'test_jev_five_minute.py' -v`; existing review and chart-core tests remain applicable.

References: [TypeSafe Choice](https://docs.typesafe.ai/primitives/choice), [TypeSafe API](https://docs.typesafe.ai/api), [Hyperliquid fees](https://hyperliquid.gitbook.io/hyperliquid-docs/trading/fees).

### v7 one-hour acceptance, October 10, 2026

Public Hyperliquid BTC replay at 60×, 13:45–14:45 Pacific, $500 balanced / $2.50 risk cap. Initial contract v1 (`c28c2cd9-d90e-43bb-9883-586dfac06185`): 10 unavailable, 2 malformed forecasts, no trades. The broader unsupported-condition wording was replaced with the established experimental candidate forecast wording, retaining the five-minute horizon and completed-bar features. Same-hour v2 retest (`0142dde5-03fd-4e20-b257-bc06f1c5c538`): 12 model requests / 60 execution candles; 11 valid, 1 rejected sum=0.99; median latency 160ms, max 331ms. Bands $42–$66 failed the 2× modeled-cost margin of about $66.40. Zero qualifying orders/trades; net trading P&L $0.00; ending paper balance $500.00; separate API estimate $0.00390274. Jev contained 9/11 completed horizons; wider ATR baseline 11/11, close-direction 4/11. These do not establish trade profitability. No stop movements occurred in market replay; qualified fills and stop paths were checked only in fixtures.

Seven five-minute and seventeen existing review Python cases, four chart-core JavaScript cases, all 60 causal receipt cutoffs/horizons, and all 60 browser/engine SAR contexts passed. Browser completion, restore and compact P&L were verified. Full receipts, report, statement and screenshot are in the MYM chart workspace under `Charts/Analysis/5M/BTC_5M_Jev_1H_Simulation_2026-10-10*`.

## Five-minute paper exploration (v8)

New-session 5m entry preset defaults to **Paper exploration**. Configurable `costMargin` (1–5, default 1.25) and `minNetRewardRisk` (0.05–5, default 0.25) are validated and frozen in the receipt config. Passive SAR-aligned limits qualify without a favorable-rejection gate; two completed 5m SAR states still must agree. Stop is one analysis tick beyond both the calibrated Jev edge and recent three completed 1m extremes. Prior fully resolved 5m misses expand the edge; no additional width or ATR floor stacks onto it. Stops only tighten after favorable completed closes, never widen. Maker target planning reserves no adverse target slippage, matching the limit target model. Full modeled stop risk includes entry maker fee, exit taker fee and slippage; sizing respects dollar, percentage and notional caps. Limits remain fixed for 5m, positions for at most 15m, with existing stop precedence and invalidation exits. These relaxed settings are experiments. Saved v7/strict runs keep their original rules and config shapes. Jev questions and public-data-only state are unchanged.

## Completed 1m volatility stop buffer (v9)

The new-session exploration preset adds editable `stopBufferAtr`, default **0.5**. Positive values produce v9; zero or missing retains v8 rules, preserving saved sessions. ATR(14 SMA) uses only the last 15 preceding completed **one-minute** candles and includes gaps against the previous close. Padding is `max(analysis tick, stopBufferAtr * ATR1m)` beyond both the calibrated Jev edge and three-bar structure, rounded outward. Entry/target and other filters are unchanged. Limits retain their original buffer and stop for their fixed lifetime. Open stops recalculate only after favorable completed price action, must remain beyond the last observed close, and never widen. Full stop risk and costs continue to size the order; no extra risk or leverage is introduced. Jev's model state and questions are unchanged.
