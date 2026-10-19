# Elliott Waves loading repair

The compatible worker dropped the venue prefix from secondary requests, turning
`hyperliquid:ETH` into `ETH`. Bare-symbol routing depends on the provider's symbol
index; unavailable or rate-limited enumeration could strand the request and end
in the 120-second Pine execution watchdog. Preserve the explicit venue throughout
nested security contexts, including same-ticker requests to different venues.

The worker also needed to acknowledge viewport/input changes received during
backfill. PineEngine stores those changes without running or emitting `onDone`;
treating them as active runs could block the complete-history command.

Elliott's static viewport engine now coalesces incoming quotes within the same
minute. Completed-source packets down to 1m refresh on minute changes, new chart
bars and complete-history notifications. Viewport and input changes remain
immediate. Other scripts keep their existing tick cadence. A persistent indicator
error notice offers reload/retry and explicit dismissal; temporary editor tests
retain their own feedback. Failed Elliott summaries are hidden instead of looking
current. Original Pine source and inputs are unchanged.

A related expression-slice guard avoids redeclaring parameter wrappers already
present in the captured prefix.

## Verification

- 43 tests passed across Pine runtime/editor, Cleo nested requests and overlays,
  source identity, deferred execution and Elliott refresh regression tests.
- 14 installed-checkout tests passed, including the existing ABC-panel runtime
  check, confirming unrelated runtime integration remains intact.
- The full Elliott suite passed 16 of 17 tests: every drawing, timeframe, settings,
  persistence and completed-history check passed. Its existing source-manifest
  assertion fails on the unrelated journal bridge fingerprint (test line 35),
  which this change does not modify.
- Live browser run: Hyperliquid ETH 1h, 600 chart bars and 3,000 bars per source;
  155 lines and 39 labels across four models over more than three minutes, with
  no script errors. All secondary requests retained `hyperliquid:ETH`.
- An injected diagnostic error remained visible until explicitly dismissed;
  temporary editor-test errors did not create a global error notice.
- `git diff --check` and module syntax checks passed.

Browser evidence is saved in the user's `Agentic Elliot Waves Evidence` folder as
`elliot-loading-fix-browser.json` and `elliot-loading-fixed-live-eth-1h.png`.
The browser harness used an isolated chart without changing saved user layouts.
Public provider availability can still fail independently; the error now remains
readable and can be retried by reloading the chart. TradingView parity is outside
this loading repair.

## Full-workspace history loading follow-up

The isolated-chart fix did not cover simultaneous startup of all four installed
studies. Their secondary-history requests could exhaust the shared REST budget,
and PineTS initialization could keep waiting after a rejected history promise.

The Desk now loads public history through Hyperliquid's documented WebSocket
`info` posts and multiplexes candle subscriptions on the same socket. Secondary
history is shared by coin/timeframe, updated from actual candle messages, bounded
to 5,000 candles per entry, evicts unused entries beyond 64, and refreshes when
stale. Unsupported or unavailable sockets fall back to weighted, bounded REST
retries and a paced 15-second candle poll. Data is not fabricated or substituted.
The selected 3,000-bar source setting and the original Pine source stay intact.
Elliott's independent selected timeframe reads start concurrently and are reused
by the worker, rather than serially fetching each timeframe during calculation.

Failed secondary requests now report the owning worker session immediately.
Missing primary history cannot start a Pine stream on an empty chart; the custom
ABC status worker remains available to show its guidance without candles.

Measured saved-workspace cold load with all four studies and real Hyperliquid BTC
1h data: Elliott first model 5,425 ms (163 lines/28 labels), all four first models
by 6,777 ms, no script errors and no REST history requests. The previous combined
workspace run needed 30,170 ms for Elliott while recovering from REST throttling;
the original reported failure ran into the 120-second watchdog. These are local
observations, not a universal latency guarantee.

Reference: Hyperliquid API documentation, [WebSocket post requests](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/websocket/post-requests)
and [rate limits](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/rate-limits-and-user-limits).

The ETH 1h market-switch check with all four studies loaded Elliott in 6,412 ms
(155 lines/39 labels), with every first model present by 8,438 ms, zero script
errors and zero REST history requests. The focused runtime suite passed 50/50
tests; installed-checkout compatibility checks also passed.
