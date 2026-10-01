# Count Desk Connection Atlas and Robinhood integration plan

Prepared 2026-09-30. This is an implementation plan, not a claim that a broker, wallet, or live account is connected. All Count Desk behavior remains paper/shadow only.

## Goal and current state

The chart toolbar already opens a connection drawer in `count-dashboard/web/vela-preview.html`. `vela-preview.js` contains direct Vela connection flows for **Binance**, **Coinbase Exchange**, and **Hyperliquid**, plus a separate Tickstream server stream and stored Count Desk bars. The Market Data Access page reads `/api/feed/sources`. The drawer currently mixes provider selection with short descriptions and status labels. The attached 2026-09-30 screenshot shows a blank chart. The default app port `127.0.0.1:8770` did not answer during this review. An isolated test instance on port `18770` served the updated drawer, but none of the three direct feeds was verified end to end.

The intended manager is a searchable, clickable source index. Opening a source shows a print-friendly reference record with a clear boundary between documented capability and observed local health. The active chart source remains visible in the toolbar.

## Source records

| Record | Role | Assets and markets | Data level and current claim |
| --- | --- | --- | --- |
| Binance | Direct Vela chart feed | Crypto spot and supported USDT-margined perpetuals | OHLCV via REST and kline WebSocket with poll fallback. Built in code; runtime freshness unverified. |
| Coinbase Exchange | Direct Vela chart feed | Crypto spot products | OHLCV via REST; live candles from ticker WebSocket with reseed/poll fallback. Built in code; runtime freshness unverified. |
| Hyperliquid | Direct Vela chart feed | Supported crypto perpetuals and spot | OHLCV via REST and candle WebSocket with poll fallback; recent history is bounded. Built in code; runtime freshness unverified. |
| Tickstream | Server-side futures stream | MYM and NQ, subject to account catalog | Delayed ticks aggregated to memory-only 1M, 1H, 4H, 1D bars; isolated test instance reported server key needed. |
| Count Desk historical | Local replay/stored data | Dataset-dependent | Stored OHLCV; always display dataset source and cutoff. |
| AMP/CQG | Planned entitled futures adapter | CME Group venues subject to account entitlement | API approval, credentials, data rights, dated contracts, and actual level are unresolved. |
| Robinhood Trading MCP | Planned broker/account research link | Robinhood-supported equities, options, crypto, and account records | Official MCP tools; no authorized session or verified chart-feed rights. |
| Robinhood Wallet | Planned onboarding handoff | User-controlled crypto wallet | Separate self-custody app; not a brokerage or market-data feed. |
| Robinhood Connect | Planned funding handoff | Eligible crypto and networks by location | Robinhood-directed on-ramp/off-ramp; partner access and terms unresolved. |

### MCP reference within Connections

The workspace Connections drawer also lists relevant MCP servers. These are agent tool sources, not chart-feed activations. Every item links to the vendor or upstream source, and its label distinguishes an available external server, vendored source, a conditionally enabled local sidecar, and an active Count Desk session.

| MCP | Brief purpose | Count Desk status | Source |
| --- | --- | --- | --- |
| TradingView MCP | Delayed quotes/history, screeners, fundamentals, news, watchlists, and alerts in a public beta. | External reference; not wired to Count Desk bars or count processing. | [TradingView announcement and setup](https://www.tradingview.com/blog/en/tradingview-mcp-server-public-beta-60864/) |
| Robinhood Trading MCP | Brokerage account, portfolio, transaction, and market context, with separate order-capable tools. | Planned read-only research pilot; no Count Desk session implied. | [Robinhood external-agent onboarding](https://robinhood.com/us/en/support/articles/agentic-trading-overview/) |
| LuxAlgo MCP local sidecar | Library, broker-read, Edge Stats, and public-record research tools for Cleo. | Vendored and conditionally started for local chat when enabled; inspect `/api/integrations/luxalgo` for current capability. | [LuxAlgo MCP source](https://github.com/LuxAlgo/luxalgo-mcp-server) |
| Edge Stats MCP | Read-only queries and supporting sessions over a local authorized historical store, with sample sizes and uncertainty. | Standalone MCP package vendored; server liveness and data rights must be observed. Its hosted derived statistics also appear through LuxAlgo MCP. | [Edge Stats source](https://github.com/LuxAlgo/edge-stats#readme) |

The local LuxAlgo sidecar's tracker tools cover the Market Trackers research use case; it does not require a second active MCP entry merely because a standalone upstream package exists. Clicking an MCP source link opens documentation, not authentication or a connection attempt.

## Connection record contract

Use one schema for catalog facts and a separate observation object for the current device/session:

```text
catalog: id, name, layer, operator, broker_or_venue, asset_classes,
         markets, example_symbols, intervals, data_level, transport,
         documented_delay, authentication, account_reach, available_actions,
         data_rights, retention_policy, agent_use_rights, source_urls
observation: state, checked_at, source_timestamp, received_at, lag_seconds,
             history_state, bar_count, active_symbol, active_timeframe,
             canvas_painted, transport_mode, error_code, error_message
```

States: `unavailable`, `not_configured`, `configured`, `connecting`, `receiving`, `delayed`, `stale`, `failed`, `disconnected`. “Configured” only means local settings exist. “Receiving” requires returned bars **and a painted chart**. “Real time” additionally requires entitlement and an observed source timestamp within a documented threshold. No source may inherit rights or account authority from another connection.

Provide a normalized read-only `/api/connections` endpoint over existing `/api/feed/sources` and `/api/tickstream/status`; merge browser-only Vela paint and provider observations in the UI. Keep existing routes and connection controls during migration. Credentials, raw account numbers, and wallet secrets never enter this catalog.

## Implementation order and acceptance

1. **Manager and dossiers.** Upgrade the existing drawer and link it from the Market Data Access page. Each source opens its identity, broker, supported assets, markets, data level, freshness, authentication, rights, health, and source documentation. Add the MCP reference list below the chart feeds, with brief descriptions and direct source links. Search/filter and print work on desktop and narrow layouts. The visual planning prototype is `.lavish/connection-atlas-plan-2026-09-30.html` (local, ignored by the baseline).
2. **Three provider gate.** On a running Count Desk instance, connect Binance `BTCUSDT`, Coinbase `BTC-USD`, and Hyperliquid `BTC` separately. For each, verify nonempty bars, a visible painted candle canvas, correct symbol/timeframe, source and receipt timestamps, and a newer update or explicit poll mode. Verify source switching, reconnect, disconnect, a missing symbol, an empty response, stale data, and responsive chart resize. Test Binance perpetual `BTCUSDT.P` after fixing the current market-input validation, which rejects dots.
3. **Other source honesty.** Tickstream displays delayed/memory-only status, last source time by symbol, and history completeness; historical bars display cutoff. AMP/CQG remains unavailable until approved account entitlement, API access, dated contract mapping, and written rights are established.
4. **Robinhood MCP research pilot.** Use Robinhood’s official endpoint and user-authenticated flow only after determining whether this product is an approved client and what access is permitted. Isolate an allowlist of read tools for account, history, and market context. The existing `import_robinhood_mcp_snapshot` path can be the normalized ingest seam, with masked identifiers, source timestamps, deduplication, reconciliation, revocation, and audit. Do not expose order tools to Count Desk agents or use MCP quotes as a chart feed without tool and data-rights verification.
5. **Wallet and funding onboarding.** Offer a choice between research-account linking, Robinhood Wallet setup, and Robinhood Connect funding. Wallet creation, key backup, identity checks, transaction review, and funding happen in official Robinhood flows. Count Desk can show a user-consented address, supported network, estimated fees, and a status returned by an approved integration; it does not hold keys or initiate transfers. Confirm Robinhood Connect partner access, license, regional eligibility, supported asset/network combinations, and callback contract before embedding a conversion flow.

## Robinhood facts that shape the plan

Robinhood documents the external Trading MCP at `https://agent.robinhood.com/mcp/trading`. It says an external agent can read **all Robinhood accounts**, positions, balances, and transactions, while trades are confined to a dedicated agentic account. Its currently documented external-agent tools cover account, watchlist, market data, equities, options, and crypto; capabilities and eligibility can change. Robinhood says its agent cannot open a crypto account or transfer, stake, or lend crypto for the user. It also says third-party trading APIs need written authorization. These points require a narrow data-access design and a current Robinhood review before a product integration. [External agent onboarding](https://robinhood.com/us/en/support/articles/agentic-trading-overview/) · [Agent tools and controls](https://robinhood.com/us/en/support/articles/trading-with-your-agent/) · [Third-party connections](https://robinhood.com/us/en/support/articles/third-party-connections/)

Robinhood Wallet is a separate self-custody app. Robinhood Connect can fund eligible wallets through a user-directed purchase/transfer flow, with fees and eligibility shown in that flow. The Trading MCP does not create or fund a wallet. [Wallet setup](https://robinhood.com/us/en/support/articles/robinhood-wallet/) · [Robinhood Connect](https://robinhood.com/us/en/support/articles/robinhood-connect/)

Robinhood’s Crypto Trading API is a separate candidate. It does not imply general equities/options brokerage API access, MCP wallet actions, or permission for a multi-user platform. [Crypto API](https://docs.robinhood.com/)

## Agent choices and bot performance plan

Robinhood now documents two agent paths. **Robinhood Agents** creates an agent inside its mobile app, with a selected model, instructions, skills, and a dedicated Agentic account. Its setup guide currently allows one built-in agent. **Trading MCP** connects an external agent, such as Codex, to Robinhood’s official Streamable HTTP endpoint. Robinhood’s authentication flow can open a dedicated MCP account for that agent; registering the endpoint alone does not prove a Count Desk session or grant a product-wide connection. Built-in agents and external MCP accounts have different trade-approval defaults, so the actual account setting must be checked in Robinhood before any use. [Built-in overview](https://robinhood.com/us/en/support/articles/built-in-trading-agent-overview/) · [Built-in setup](https://robinhood.com/us/en/support/articles/setting-up-an-agent/) · [External setup](https://robinhood.com/us/en/support/articles/agentic-trading-overview/) · [Trade approvals](https://robinhood.com/us/en/support/articles/trading-with-your-agent/)

For Count Desk, make each bot a versioned **paper strategy** first. Freeze its instrument, market, timeframe, source rights, entry/exit rules, risk limits, model and prompt version, and test window before comparing results. Record every decision, proposed order, rejected signal, hypothetical fill, fee/slippage assumption, and source timestamp against a `bot_id` and `run_id`. Keep the paper event log separate from Robinhood account activity.

The initial scorecard should report closed-trade count, gross and estimated net P&L, win rate, average win/loss, expectancy, max drawdown, exposure, turnover, model/token cost, and a same-period benchmark. Show sample size, open-position mark method, missing fees, and data freshness beside the figures. Robinhood’s `get_realized_pnl` and `get_pnl_trade_history` tools can later provide broker-reported results for an authorized account; `get_equity_orders`, `get_option_orders`, and `get_crypto_orders` can provide order history. Those tools report account activity, not a trustworthy `bot_id`, so per-bot attribution requires a separate immutable decision log and reconciliation against broker order IDs or isolated accounts. Do not infer a bot’s performance from account P&L when humans or other bots share the account. [Robinhood tool inventory](https://robinhood.com/us/en/support/articles/trading-with-your-agent/)

The rollout is: (1) paper bot definitions and reproducible replay, (2) shadow decisions on qualified current data with no orders, (3) broker read-only reconciliation after user authentication and approved scope, then (4) independent review of results and data rights. Robinhood announced **Loops** for recurring built-in agent instructions, but describes them as coming soon; do not treat Loops as an available bot scheduler. [HOOD Summit announcement](https://robinhood.com/us/en/newsroom/hood-summit-2026/)

## Code touchpoints

- `count-dashboard/web/vela-preview.html`, `vela-preview.js`, and `vela-preview.css`: manager UI, provider status, painted-chart observations, source switching.
- `count-dashboard/web/market-data.html` and `market-data.js`: shared source records and rights/entitlement guidance.
- `count-dashboard/server.py` and `tickstream_adapter.py`: normalized connection catalog and server source observations; preserve read-only Robinhood import.
- `integrations/vela/docs/user/data-providers.md`: provider symbol formats, transports, and bounded-history behavior.

The next implementation milestone is the manager plus the three direct-provider acceptance gate. Robinhood connection work follows a verified feed baseline and explicit product-access scope.
