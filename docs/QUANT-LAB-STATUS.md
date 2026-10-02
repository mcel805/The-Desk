# Quant Lab status

The separate Count Desk route is `/quant-lab.html`. It keeps its chart instance, conversation history, and saved study versions separate from the main Vela workspace. The visual layout follows the supplied Quant screenshot, while the name and disclosures identify it as Count Desk research.

The [LuxAlgo Quant feature page](https://www.luxalgo.com/features/quant/) was reviewed on 2026-10-02. The page describes chart-aware chat, screenshot input, conversational strategy drafting and refinement, script validation, backtesting with performance analytics, and saved versions. Its examples and performance figures are marketing examples, not Count Desk results.

| Capability | Local status |
| --- | --- |
| Vela chart, drawings, native studies, bar replay | Implemented on the separate route. |
| Binance, Coinbase, Hyperliquid | Public market-data snapshots through the bundled Vela adapters. No broker account session. |
| Chart-aware conversation | Local `/api/chat` receives source, market, timeframe, loaded-at time, cutoff, and eight recent OHLCV bars. Answers remain hypotheses. |
| Screenshot conversation input | PNG, JPEG, and WebP attachment sent through the existing local chat route. |
| Strategy backtest | One explicit long-only SMA crossover; next-bar-open fills, one unit, user-entered per-side fee, closed-trade statistics, and version storage in the browser. Slippage, funding, and contract multiplier are excluded. |
| Arbitrary language-to-code and Pine validation | Not implemented. Vela has no scripting engine bundled in this page. Chat output does not silently become runnable code. |
| Full strategy library and arbitrary backtesting | Not implemented. The single defined rule is a reproducible first study, not feature parity. |
| Broker account linking, balances, fills, private streams, and order routing | Not implemented. Public market-data access does not authorize account access or execution. |

Before extending the backtester to another instrument, freeze its contract, price source, session, fees, slippage, and rights. A Pine engine would need to be installed, registered, and tested before any generated code could be called runnable. Broker access requires separately approved account and API permissions, and remains outside the paper-only Count Desk boundary.
