# Agents

Open the robot **Agents** button in the Desk header. The workspace is global;
Robinhood's Agents tab links here and retains earlier shadow profiles under
Legacy Robinhood shadow configurations. Existing broker/wallet connections and
the independent paper trader remain available.

## Build delivered

- Profile fleet with state/venue/account/version, module summaries, actual
  attributed simulation performance, owned positions/orders and latest run.
- Versioned modular editor for identity, account, line signal, market/limit
  entry, bracket/time exit and independent risk controls.
- Detail tabs: overview, modules, chart levels, runs/evidence, execution,
  performance, activity and revision history. Full JSON export is unbounded;
  the interactive run/event view shows the latest 200 records.
- Clone (no copied performance), archive, explicit arm/pause, global pause,
  owned-order cancellation and separate owned-position flatten controls.
- Local worker for verified simulation only. Run/order acceptance is atomic in
  the engine SQLite transaction; engine fill-time ownership prevents unrelated
  positions from being netted when a resting order fills.
- Common adapter capabilities: accounts, preview, submit, cancel and reconcile.
  All six venue identities share the profile contract. Simulation is executable;
  the other adapters expose their current unavailable/signature/preview/data
  boundaries and cannot arm. They are extension points, not implemented live
  Coinbase/Binance/IBKR execution connections. Wallet identity or market data
  never authorizes an autonomous order.

This is a deterministic strategy runtime. Description/research text is stored,
not interpreted by an LLM. There is no unattended external broker execution.

## Test Agent walkthrough

1. Open Agents → Test Agent → Configure. It starts paused with a separate
   **Agents · Test simulation** $10,000 virtual account and no trade history.
2. Keep its exact instrument active on the chart (default `hyperliquid:BTC`).
   The chart feed and paper account choice do not change the agent's assigned
   account. Profiles retain a separate execution product reference; simulation
   requires the exact chart instrument. External observe profiles require an
   explicit venue product and never convert perpetuals into spot orders. Default fixed quantity is 0.001; choose appropriate limits yourself.
3. Draw a cyan/aqua horizontal line, or use Levels → Cyan horizontal line.
   Newly created lines bind to their creation market. Existing drawings without
   saved provenance need **Bind existing cyan lines to this market** in Levels.
   A BTC line cannot silently become an ETH/SOL signal when changing symbols.
   Synchronized copies are excluded until explicitly adopted; independent cells
   have separate source identities.
4. Alternatively install **Agentic - Liquidity** in **Clean** view. Active main
   solid 2-pixel pools are accepted; retired lines and other studies are excluded.
   Pool identity uses source instance, origin and price, not transient drawing ID.
5. Save the profile; every new revision is paused. Arm simulation explicitly.
   Price must first establish an away-from-line baseline, then be observed in
   the configured tolerance band. Arming on a line, moving one onto price,
   replay, stale quotes/chart heartbeat or a jump across a level does not enter.
6. Each source line gets at most one attempted run per arm session, including
   blocked signals. Pause/rearm begins a new session. Cooldown, spread, daily
   trade count, per-order risk/notional, account exposure and concurrency apply.
7. A successful decision submits to the existing paper engine. Market entries
   use executable bid/ask; limits use existing quote/trade-touch matching. Stops
   and targets remain engine protections. Maximum-hold exits remain supervised
   while entries are paused, provided a fresh quote is available.
8. Runs retain exact level/configuration/quote/preview/order evidence. Execution
   shows real simulated fills. Performance includes attributed fees and actual
   outcomes; no seeded win rate or fabricated fills. The daily counter uses UTC.

The worker polls at one second and the browser publishes chart context every
two seconds. The active chart heartbeat expires after ten seconds. The browser
must remain open with the correct chart; this is not an exchange tick-complete
detector and brief touches between observations can be missed. Switching charts
publishes a fresh context; old out-of-order context cannot overwrite a newer one.
Server restart pauses all armed agents. Existing protections remain in the
engine. Pause does not cancel a working order; **Stop & cancel owned orders**
does. **Flatten owned simulation** additionally closes owned positions using a
fresh quote. These actions never mutate unrelated paper orders or positions.

## Verification

```sh
python3 -B -m unittest discover -s tests -p 'test_agents*.py'
python3 -B -m unittest discover -s tests -p 'test_engine.py'
node --test tests/test_agents_model.mjs tests/test_agents_chart.mjs tests/test_agents_liquidity_bridge.mjs \
  tests/test_agentic_host.mjs tests/test_pine_refresh.mjs \
  tests/test_trading_model.mjs tests/test_chart_menu_actions.mjs
```

HTTP checks use temporary loopback ports and SQLite. The guarded browser script
`tests/verify_agents_browser.js` refuses every origin except port 18891 and
requires the synthetic fixture's health marker before any mutation:

```sh
python3 -B tests/launch_agents_fixture.py --port 18891 --data-dir /tmp/agents-fixture
chrome-devtools-axi open http://127.0.0.1:18891/
```

Pass the script's contents as the structured argument to `chrome-devtools-axi
eval`. It checks cyan chart capture, arm/touch, paper entry, protective exit,
fill fees, pause, immutable run inspection, performance, clone and deduplication.
Fixture quotes/fills are synthetic; Vela's native chart may still fetch public
exchange candles. This does not prove price parity or any real broker action.
