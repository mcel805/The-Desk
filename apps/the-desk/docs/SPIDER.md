# Spider in The Desk

Press the spider icon in Trader’s header. It opens the resizable left assistant,
loads the selected source market in a nine-chart grid (Daily, 4H, 1H, 30m, 15m,
5m, 3m, 2m, 1m), and starts the selected **manual** report. Opening, Midday and
Closing are labels selected by the trader; there is no scheduler or automatic
order submission. A weekend “opening” request retains the actual date/session,
rather than pretending the cash market is open.

The first stage uses Codex live web search to inspect a bounded selection of
credible publishers and primary releases. Rates, bonds, equities/AI,
infrastructure/capex, index futures, crypto, macro/geopolitics and the calendar
must all be addressed, including explicit missing evidence. Completion requires
observed search events and 3–8 cited sources across at least three publishers.
It does not claim to inspect every financial website or bypass paywalls. News
informs the liquidity thesis; it does not create an entry signal.

After research, the server freezes up to 100 **completed** candles on every
frame with one requested cutoff, provider-specific actual cutoffs, receipt times,
source/contract/timezone, coverage, gaps and SHA256 hashes. Missing frames remain
unavailable. Current/forming candles continue updating on the charts but are
excluded from the captured analysis. The pinned Spider v0.4 skill and full
rulebook accompany the model context; their combined hash is retained.

The analysis draws native Vela horizontal levels, LB zones and conditional
paths. Every drawing needs its own frame’s real candle time and price anchor,
completed-bar evidence and rationale. A schema and numerical validation reject
missing frames, invented coordinates, unbounded forecasts and unsupported
ready-paper states. A single correction pass can repair invalid output; otherwise
the report fails visibly. Plans do not imply fills or measured probabilities.

Blue denotes candidate pools/objectives; light zones denote blocks; amber trap
hypotheses; red invalidation; purple/dashed conditional paths. The timeframe
buttons focus/unfocus each chart. **Hide markup** removes only Spider drawings;
**Restore layout** restores the layout captured before the review. Manual
charts/drawings and the account/order ticket retain their own authority. Spider
annotations are excluded from reusable layout persistence to prevent symbol
leakage; the immutable report retains all their coordinates. A new report replaces
the displayed overlays. Saved reports also offer **Load map** for the same source
instrument; an archived map shows its original timestamp and requires a manual
report to refresh. Published overlays remain an as-of map, not an always-on
invalidation/entry detector.

**One-page report** opens a print view with market sentiment, the nine-frame map,
conditional primary and competing paths, risk, next event and source links. Use
Print / Save PDF. Expand the evidence below the page for full research, per-frame
sequences, cutoffs, drawing rationales and downloadable OHLCV JSON. Failed runs
and partial research are retained in Saved reports, rather than fabricated into
successful reads. Report JSON is local under `DATA_DIR/spider/`, outside static
web content; it is not committed to Git.

## Codex assistant and sign-in

The left panel is a terminal-style conversational client of the installed
**Codex app-server**, not a shell emulator or an embedded desktop GUI. This
supported interface provides persistent Codex threads, streamed responses,
interrupts and native login. It avoids exposing arbitrary terminal commands to a
web page. The currently verified CLI is 0.159.2. Install the CLI if absent and
use **Sign in** for the OpenAI device-code flow, or run `codex login` in Terminal.
The browser never receives access/refresh tokens. Existing CLI sign-in is reused.
**Reconnect** restarts an idle transport; **Stop** interrupts an active turn.

The application supplies only data and built-in web research. Shell, apps,
plugins, computer/browser control, MCP servers, hooks, memories and multi-agent
execution are disabled for the analyst process. Unsupported host tool/permission
requests are rejected. User auth remains in Codex; The Desk does not collect a
password, store an API key or copy auth files. Every Spider HTTP mutation requires the
Desk loopback origin. There is no generic RPC, shell, broker or tool proxy route.

A report creates a persistent trading session for its source instrument. Questions
in the panel receive newly captured nine-frame evidence. They can explain a
setup or reevaluate a thesis, but cannot mutate a published report or submit an
order. Run a fresh manual report to publish new chart drawings. **Copy CLI resume**
provides `codex resume THREAD_ID` for continuing in the actual Codex CLI after the
panel is idle. The embedded panel itself is the Codex trading session; desktop
GUI embedding and broker execution are not part of this integration.

## Market-source boundaries

- Hyperliquid/Coinbase reference markets use the same bounded server history
  adapter for the nine-chart review and the analysis. Two-minute Hyperliquid
  bars aggregate aligned pairs of actual one-minute candles; incomplete old
  pairs are omitted. Coinbase follows the existing aligned aggregation logic.
- Dated IBKR MYM contracts use the existing read-only transport and entitlements.
  Two-minute native TRADES and daily history are added. The daily trading-date
  maps to standard CME 17:00 prior-day / 16:00 trading-day Chicago boundaries,
  with DST. Settlement revisions and holiday/early-close boundaries are not
  independently verified. No continuous-contract/CFD substitution is made.
  DEMO DATA stays labeled as invented prices, never live evidence.
- Robinhood equity reads use the explicitly selected connected chart account’s
  existing read-only, split-adjusted regular-session historicals. The model never
  receives account identifiers or tokens. Two-minute bars use complete aligned
  minute pairs. Daily completion conservatively uses the provider timestamp plus
  24 hours; session holidays/early closes remain unverified. Crypto uses its
  selected public reference chart source. A login elsewhere is not Desk access.

The initial crypto setup separates **chart data** from **execution account**:
Hyperliquid is the default reference, Coinbase USD and Binance USDT are selectable
alternatives for BTC/ETH/SOL, and Robinhood MCP is the spot execution path. The
panel shows both identities and opens the existing Robinhood chart ticket. Each
source must supply its own candles; one is never silently substituted for another.
Binance metadata and candles use its documented public market-data-only host,
`data-api.binance.vision`, with no API key. A USDT price is not treated as a USD
conversion. Broker review explicitly reminds the trader to verify the USD limit
against Robinhood’s current quote. A Hyperliquid reference does not enable spot
shorting, leverage, perpetual execution or a funded Hyperliquid account.

Binance bars refresh through a bounded five-second REST poll; two-minute bars
aggregate complete aligned minute pairs. Metadata checks the exact source symbol
and trading status. Provider outages and region restrictions remain visible.
Chart-history access is not proof of trading-account connectivity.

The broader data/account adapter structure leaves IBKR futures/stocks, Fidelity
retirement accounts and Rabby/DeFi for separate future connection work. No current
connection or trading authority is claimed for them. The IBKR history changes
have synthetic/callback tests only; no live IBKR account acceptance was performed.

No provider account connection is created by the Spider icon. Missing entitlements,
stale snapshots, invalid prices and feed outages are reported per frame. News
and a directional thesis cannot authorize a trade. Existing manual broker
preview/confirmation and separate simulation controls are unchanged.

## Verification

```sh
python3 -B -m unittest discover -s tests -p 'test_spider*.py' -v
python3 -B -m unittest discover -s tests -p 'test_ibkr*.py' -v
python3 -B -m unittest discover -s tests -p test_market_data.py -v
python3 -B -m unittest discover -s tests -p test_robinhood_markets.py -v
node --test tests/test_spider_model.mjs tests/test_ibkr_provider.mjs \
  tests/test_account_context.mjs tests/test_trading_model.mjs
```

The browser-only fixture (`tests/launch_spider_fixture.py --port 18894 --data-dir
/tmp/spider-fixture --no-workers`) substitutes synthetic research and OHLCV.
It never claims news or trading acceptance. Live Codex search/provider/report
validation is a separate check using the signed-in CLI and real provider data.

Protocol references:
- https://developers.openai.com/codex/app-server
- https://developers.openai.com/codex/noninteractive
- https://developers.openai.com/blog/codex-as-a-platform

Binance public-data reference: https://developers.binance.com/docs/binance-spot-api-docs/faqs/market_data_only
