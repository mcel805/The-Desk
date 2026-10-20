# Agentic - Market Synth A and Agentic Market Synth B

Agentic - Market Synth A and Agentic Market Synth B are two independent Premium catalog entries, under Indicators → Built-in library. Search `cipher` or `cypher`, then Add each separately. A overlays price; B has its own pane. Settings, visibility, removal, source editing and saved-layout persistence use the existing Pine manager. Premium is The Desk's catalog treatment; these are independent implementations, with no affiliation or original proprietary source.

## Fidelity and research provenance

This is a visual/concept reconstruction, **not an exact port**. No original Market Cipher source was supplied or recovered. Signal timing, calculations, defaults and pixel parity with the commercial TradingView product are unverified. Do not interpret successful Desk execution as TradingView compilation or commercial-product equivalence.

Sources reviewed on October 19, 2026:

- [Official learning hub](https://marketciphertrading.com/learn/), [product overview](https://marketciphertrading.com/), and [tutorial library](https://marketciphertrading.com/tutorial-videos/). These describe A's chart symbols and B's composite oscillator; they do not publish executable formulas.
- [Official RSI explanation](https://marketciphertrading.com/what-is-rsi-and-how-do-traders-use-it-with-market-cipher/) and [money flow explanation](https://marketciphertrading.com/what-is-money-flow-and-why-does-it-matter/). These identify RSI, flow, momentum and broader context as complementary inputs, rather than automatic reversal signals.
- User video [Extreme overbought/oversold conditions w/ MarketCipher B](https://www.youtube.com/watch?v=KKHCyMxrgVw), 6:58; [Market Cipher A & B Tools](https://www.youtube.com/watch?v=f6xC0WtRD7E), 5:48; [Intro to Market Cipher: Everything You Need to Know](https://www.youtube.com/watch?v=bxkm4Kjubqs), 42:48. Public metadata was retrieved for all three. Playback returned an error in the review browser; caption URLs returned empty bodies and the transcript panel did not supply transcript text. Full audiovisual review was therefore **not completed**. No calculations are attributed to a video we could not review.
- Three user screenshots: BTCUSD perpetual, 1D, BYBIT (B layout); RNDRUSD, 1D, COINBASE, Heikin Ashi (A+B); XBTUSD perpetual inverse, 3m, BITMEX, Heikin Ashi (A+B). Screenshot history dates and venues differ; images provide appearance evidence, not matching numerical input/output fixtures.

## A: implemented independent rules

Eight configurable close EMAs, default periods 5/11/15/18/21/24/28/34. EMA1 ≥ EMA8 uses blue/white lines and blue shading; the alternative uses gray. Lengths, source, palette, compression and symbol switches are editable. These defaults and rules are reconstruction choices, not recovered proprietary settings.

| Symbol | Exact Desk rule |
| --- | --- |
| Green circle | RSI crosses above 50 and close is above EMA8 |
| Blue triangle | EMA2 crosses above EMA8 |
| Yellow diamond | EMA1 crosses above EMA2 while EMA1 ≥ EMA8 |
| Red diamond | EMA1 crosses below EMA2, unless blood-diamond rule also holds |
| Blood diamond | EMA1 crosses below EMA2, prior RSI > exhaustion threshold, close < EMA4 |
| Red X | EMA2 crosses below EMA8 |
| Yellow X | RSI crosses below exhaustion threshold, abs(EMA1−EMA8) < ATR14 × compression, upper wick > body × wick ratio |

RSI defaults to 14, exhaustion 70, compression 0.35 ATR, wick/body 1.5. Body has a mintick floor. Yellow X is a candle/ribbon warning heuristic; it does **not** detect or establish whale manipulation. Blood diamonds do not predict a crash. Every symbol family can be hidden separately. No candle-style conversion is performed: matching Heikin Ashi reference bars requires the same bar inputs.

## B: implemented independent rules

- WaveTrend-style momentum: ESA=EMA(HLC3,9); deviation=EMA(abs(HLC3−ESA),9); CI=(HLC3−ESA)/(0.015×deviation), or zero if deviation is zero; main=EMA(CI,12); signal=SMA(main,3). Blue and light-blue filled areas follow these two series.
- Yellow fast wave = main−signal. This is a momentum difference, **not session or volume-weighted VWAP**.
- Green/red flow = SMA(150×(close−open)/(high−low),60)−2.5, with zero candle pressure on zero-range bars. This OHLC pressure proxy does not measure actual capital transfers, bid/ask flow, or the proprietary money-flow calculation. Green above zero, red below zero.
- Red RSI14; purple stochastic RSI K with lookback40 / SMA3 and green SMA3 D. Independently configurable.
- Small green/red dots mark upward/downward momentum crosses. Large strip dots require a cross in the oversold/overbought region (default −60/+60). These are independent crossover rules, not recovered proprietary confluence logic.
- Configurable overbought/oversold and extreme (±80) references, zero, ±100 range and green/red bottom strip.
- Yellow/pink regular divergence dots compare successive confirmed oscillator pivots and their price lows/highs. Default two bars on each side; dots appear at the **confirmation candle**, without negative offsets or backdated claims. Hidden divergence is not implemented.

All layers, signal confirmation, lengths, thresholds and principal colors are configurable. Signals default to completed candles. Oscillator/ribbon values on a forming bar may change. Alert conditions are declared in the Pine sources; delivery through The Desk's alert system has not been validated. Research/paper display only; there is no order-routing behavior.

## Validation and remaining reference work

Focused tests cover independent EMA arithmetic, OHLC-flow arithmetic, fast-wave arithmetic, display/input changes, append-only historical causality, and flat/zero-range bars. Browser acceptance evidence is recorded separately. Synthetic tests do not prove reference parity.

For exact comparison, obtain authorized original Pine source or original indicator output CSVs with matching venue/symbol, timeframe, candle type, settings, history start and completed-bar cutoff. Compare those outputs and screenshots against this implementation. Public demonstrations alone do not identify the private signal formulas uniquely.

## Local acceptance record

- `node --test tests/test_market_cipher.mjs tests/test_pine_editor.mjs tests/test_pine.mjs`: 26 passed.
- `node --check web/pine-editor.mjs` and `node --check tests/verify_market_cipher_browser.mjs`: passed.
- `CHROME_DEVTOOLS_AXI_SESSION=market-cipher node tests/verify_market_cipher_browser.mjs http://127.0.0.1:18893/ <evidence-directory>`: seven browser checks passed. Two searchable Premium entries, distinct pane placement, settings, hide/show, saved reload, B editor compilation/execution, and independent removal.
- B's editor run used `coinbase:BTC-USD`, 60-minute candles, 599 completed bars, cutoff `2026-10-20T02:00:00.000Z`. Current source hashes are recorded in `web/pine-examples/market-cipher-manifest.json`; the acceptance screenshots predate the subsequent title rename.
- Screenshots and browser report: the chart workspace's `outputs/market-cipher/browser/` folder. Final visual inspection confirmed filled blue waves above and below zero, yellow fast waves and green/red flow. Explicit `fill()` pairs anchor all oscillator areas to a hidden zero series because native area-series rendering fills to the pane bottom.
- The main app at `http://127.0.0.1:18880/` serves both new catalog entries. Its health check reported paper mode, market streaming and journal available; IBKR off. The isolated test instance at port 18893 deliberately uses `--no-workers`; its quote stream and journal are unavailable. No orders were submitted.

Browser acceptance on Coinbase BTC is not matching-data validation against the supplied BYBIT/BITMEX/RNDR charts, a futures-feed check, or proof of Market Cipher signal parity.
