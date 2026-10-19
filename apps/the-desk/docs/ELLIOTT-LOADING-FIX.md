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
