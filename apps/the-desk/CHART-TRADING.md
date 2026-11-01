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
  Click the entry or use Modify for exact values; pull TP / SL from entry for chart protection. Reverse, DOM batch cancels
  and Flatten also honor the one-click setting.
- Disabling one-click keeps a new limit projection on the chart until its ✓ placement button is pressed. Chart amendments use inline Confirm / Discard; cancellation and other management actions retain their review dialogs.
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
DESK_CHART_QA=1 node --test tests/test_chart_trading_browser.mjs tests/test_chart_pull_browser.mjs
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

## Entry pull handles and chart amendments

The chart controls follow the interaction and visual references in [TradingView's chart-trading guide](https://www.tradingview.com/support/solutions/43000766334-chart-trading-on-tradingview-key-features-and-advantages/). This is a Desk-native paper implementation, not a TradingView integration or full platform parity.

Pull the teal **TP** or amber **SL** handle from an entry line, release to set the snapped price, and use the resulting line to adjust or remove protection. Both buy and sell sides are supported for projections, pending orders and positions. Click or Enter/Space adds a default leg. The default distances are editable UI spacing. Labels show gross signed quote-currency P&L, ticks and target R when risk is defined; ledger fees are excluded from this estimate.

A pending entry drag translates attached stop/target distances. Positions use the executable bid/ask to constrain new protection, so stops can trail beyond entry while remaining on the correct side of the current quote. The server is authoritative for precision, buying power, validation and revisions.

Click the quantity chip to resize a projection or working order. Quantity changes stay synchronized with the order ticket; order-type changes are made in the ticket. Position chips show quantity without resizing; use the manager's Partial action. Projection status is in the accessible title; a compact ✓ button explicitly places the projection. The entry chip contains quantity, side/type and cancel, with TP/SL handles beside it. Order type stays in the ticket.

With one-click off, chart changes accumulate in one nonmodal preview, including removal of a leg. Confirm submits one revision-bound amendment; Discard or Escape restores original values. A rejected command keeps its preview with an error. Changing account, active chart, replay state or server revision discards unsaved changes. One-click mode sends the same revision-bound command on release. Existing exact-value editors, cancellation, close and reverse still use their established paths.

`test_chart_pull_browser.mjs` exercises pointer pulls for naked buy/sell orders and positions, draft/ticket sync, quantity, confirmation/discard, rejection recovery, Escape, replay invalidation and tablet control placement. It uses the isolated real engine fixture and blocks external network requests.

The `test_chart_limit_stability_browser.mjs` regression stages a right-click sell limit on a 1-minute chart, drives changing quote/state polls, and verifies the selected entry remains fixed. It pulls SL and TP using real pointer movement and checks both price-line geometry and the final ticket values.
