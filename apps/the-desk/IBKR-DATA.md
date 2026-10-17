# IBKR read-only futures data

The Desk now has a local IBKR provider for a single explicitly dated MYM contract.
Its default mode is **off**. No account, position, order or execution API is called,
and IBKR quotes never enter the paper engine or journal. There is no live order path.

## Try without an account

From `apps/the-desk`:

```sh
python3 server.py --port 18882 --data-dir /tmp/desk-ibkr-demo --no-workers --ibkr-mode demo
```

Open http://127.0.0.1:18882/. A new workspace starts on `ibkr:MYM-202612` at 1m.
If a saved workspace selects another market, use **IBKR data → Open MYM demo chart**.
**DEMO DATA** remains visible above the active chart and on each IBKR chart cell.
The fixture invents all prices, volume and weekend activity; its expiry and
multiplier describe the synthetic fixture, not broker-resolved metadata.

Use the native timeframe menu (1m through 4h), then **IBKR data → Pause demo feed /
Resume demo feed**. Disconnection preserves visible history, removes the quote,
and marks the series stale. Resume rebuilds the bounded window. Futures tickets,
chart shortcuts and DOM trading remain disabled, and server commands reject futures.
The DOM explicitly states that IBKR depth is not enabled.

`--no-workers` prevents crypto and journal workers from starting. Crypto chart
providers may still make browser requests if selected; the synthetic IBKR path
needs no external connection. The Lux Journal companion is not started by this command.
Stop the foreground server with Control-C. Its separate database does not touch the installed Desk.

## Real Gateway adapter (requires later acceptance)

See the built-in [setup page](web/ibkr-setup.html). Use an authenticated local TWS /
IB Gateway, the official `ibapi` package and a compatible Python version (current
IBKR docs specify Python 3.11+). No package is downloaded or credentials collected.
Gateway mode requires the exact `DESK_IBKR_CONTRACT_MONTH`, loopback host, verified
port/client ID, `DESK_IBKR_MARKET_DATA_CONFIRMED=1` and
`DESK_IBKR_LOCAL_DISPLAY_CONFIRMED=1`. These flags are user attestations, not proof
of entitlement. Actual feed mode comes from IBKR callbacks; delayed/frozen/unknown
states are preserved. Keep Read-Only API enabled in TWS/Gateway.

The worker resolves exactly one MYM FUT contract using `reqContractDetails`,
checks its conId/tick/multiplier, requests bid/ask/last with `reqMktData`, and
maintains one bounded `reqHistoricalData(... keepUpToDate=True)` subscription per
requested intraday interval. Requests share subscriptions across charts. A socket
loss reconnects with bounded backoff, clears old quotes/history and resubscribes
on the next chart request. Old callbacks from closed transports are ignored.

The browser polls the local adapter every second; this does not issue a new IBKR
historical request on every poll. Normalized bars use epoch **milliseconds**,
ascending unique open-times, with the newest row treated as forming. The returned
`last_completed` cutoff is separate. Price callbacks never assert real-time
permission by themselves. History requests time out visibly rather than inventing data.

## Scope and rights

- Single dated MYM contract; no continuous alias, automatic rolls or synthetic conId.
- Intraday 1m/3m/5m/15m/30m/1h/4h TRADES bars, up to 600 cached per interval.
- Bounded recent history; range queries outside it can return empty. No complete archive.
- Preserve native broker timestamps; no daily bars, exchange holiday calendar or session-status claim.
- No depth, tick tape, futures strategy P&L, futures paper matching or broker execution.
- Market data stays in memory. User layouts/drawings can retain chart metadata.
- Local display access does not establish rights for caching, agent/non-display
  processing, external AI, redistribution or a product for other customers.
  Confirm the signed GFIS/API/exchange terms before real collection or those uses.

## Account-free verification

```sh
python3 -m unittest discover -s tests -p 'test_ibkr*.py' -v
node --test tests/test_ibkr_provider.mjs tests/test_trading_model.mjs
# Requires the isolated synthetic server and chrome-devtools-axi:
DESK_IBKR_BROWSER_URL=http://127.0.0.1:18882/ node --test tests/test_ibkr_browser.mjs
```

The Python tests execute the actual service and isolated HTTP server. Injected
callback clients test official-method request shapes, contract identity, history,
updates, errors and cleanup **without the official wire decoder or broker server**.
Frontend tests execute provider methods, subscription recovery and cancellation.
The browser regression checks Vela loading, timeframe requests, pause/resume,
visible provenance, unsupported depth and disabled controls with no orders/fills.
These tests do not establish IBKR authentication, entitlement, actual market data
accuracy, installed SDK/wire compatibility, broker execution or measured latency.

References: [TWS API](https://www.interactivebrokers.com/docs/tws-api/doc/introduction),
[historical bars](https://www.interactivebrokers.com/docs/tws-api/doc/md/historical-bars),
[data requirements](https://www.interactivebrokers.com/docs/general/market-data-subscriptions/market-data-requirements).
