# Chart trading

Paper trading defaults to one-click mode. Existing explicit `instant: false`
preferences remain in review mode; change **Trading settings → One-click PAPER
trading** to enable direct actions.

- Chart context-menu limits use the current ticket size and optional protection.
  They submit directly without adding an unsolicited bracket.
- Chart X, manager Cancel and DOM X use the same cancellation path. Removal
  appears after the server acknowledges cancellation; failures retain the order
  and show the error.
- Dragging a working entry, stop or target amends directly. Removing protection
  preserves the other prices and quantity.
- Close exits the full position directly. **Partial** opens the quantity editor.
  SL / TP and Modify open editors for exact values. Reverse, DOM batch cancels
  and Flatten also honor the one-click setting.
- Disabling one-click restores placement/cancellation/action review dialogs.
  Replay, account ownership, revisions, precision, quote freshness, buying power
  and spot inventory checks still apply.
- Robinhood keeps its account-bound native preview and final live-order review.
  These changes do not introduce Hyperliquid wallet execution.

Commands finish on ledger acknowledgement rather than waiting for unrelated
state or IBKR requests. Acknowledged orders, cancellations, bracket changes and
partial/full exits update local trading state immediately. A generation check
rejects polls started before a completed mutation. Duplicate pending actions
share one request; uncertain responses retain an idempotency key for retry.

Chart rendering caches control references, avoids replacing unchanged text and
limits idle overlay work to about 30 updates per second (60 while dragging).
Hidden tabs skip overlay work.

## Validation

Run focused executable checks from this directory:

```sh
node --test tests/test_trading_actions.mjs tests/test_trading_model.mjs tests/test_chart_account_ui.mjs tests/test_chart_menu_actions.mjs tests/test_chart_brackets.mjs tests/test_dom.mjs
python3 -m unittest discover -s tests -p 'test_engine.py'
python3 -m unittest discover -s tests -p 'test_extended_engine.py'
python3 -m unittest discover -s tests -p 'test_dom_trader.py'
DESK_CHART_QA=1 node --test tests/test_chart_trading_browser.mjs
```

The browser check requires Playwright/Chromium. `DESK_PLAYWRIGHT_MODULE` can point
to its installed module and `DESK_CHROME_BIN` to a Chrome executable. The test
starts a random-port fixture with the full UI, real Engine/SettingsStore,
invented candles/quotes and a temporary private SQLite ledger. Requests outside
the fixture origin are blocked. It never uses a real account or live provider.
Optional `DESK_CHART_REPORT` and `DESK_CHART_SCREENSHOT` paths save evidence.

Browser coverage includes limit, market, stop and stop-limit orders, cash/
balance/risk sizing, timeframe persistence, drag amendments, protection removal,
manager/chart cancellation, partial/full close, reversal, DOM flatten, duplicate
clicks, rejected cancellation and retry, delayed state polls, optional review,
settings persistence, replay and stable-label DOM mutation checks. Engine tests
also cover all six paper instruments, long/short fills, gaps, brackets, time in
force/expiry, stale quotes, cross-account revisions, buying power, spot inventory,
batch atomicity and idempotency.

Local latency measurements describe the synthetic loopback fixture, not broker
or exchange latency. Live execution acceptance requires separate verification.
