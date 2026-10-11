# Quant Lab Wave Court and Taper v0.1

## What was added

- **Wave Court** is a separate premium study on the selected Quant Lab chart, including the BTC/ETH/SOL 1-minute paper game. It requests the same source at Daily, 4H, 1H, 30M, 15M, 5M, and 1M when that provider has those bars. Three confirmed pivot degrees are evaluated on the selected chart. Labels appear only for a six-turn impulse that passes basic Elliott rules: wave 2 holds the origin, wave 3 exceeds wave 1 and is not shortest, wave 4 does not overlap wave 1, and wave 5 extends. No forced labels fill missing swings. Each source frame reports its completed cutoff or an unresolved state.
- **Taper** is a new chart-team card for BTC, ETH, and SOL game charts as well as the separate hourly research workspace. It reads the latest completed 1m OHLC bars, Wave Court candidate summaries, and nearby confirmed OHLC liquidity levels. It asks the TypeSafe Jev API to classify tape state, research bias, and structure clarity. The returned confidence is a classification measure, not a probability of hitting a target or making a profit. Refusals and missing counts are shown as such.
- Taper has a manual Read action and an opt-in browser monitor. The monitor checks every 30 seconds while the page is visible, calls Decisions at most once per new completed 1m bar, and stops after 30 automatic reads or when the page closes. It does **not** submit, amend, or close a paper or broker order.
- In the game, Wave Court reads historical Daily through 1M context from the **same provider and instrument** without extending the visible 1M battlefield or creating eligible paper levels. The frozen 15M field and its current active confirmed liquidity levels remain the only paper entry locations. Taper requires a matching field and records provider, asset, instrument type, field version, and a deterministic paper gate. A model watch bias never queues a paper order; the user chooses and confirms the SIM ticket. Coinbase and unsuffixed Binance game pairs are spot, while the Hyperliquid game pairs are perpetual. Taper blocks a spot short from its paper watch gate because borrowing and margin are not modeled. Its Review SIM ticket button appears only for a watch bias with a fresh, matching field and eligible level; it rechecks the chart cutoff and field version before opening the existing ticket. The user still chooses the level, size, stop, target, and submit action. The game opens in Practice SIM mode.
- An hourly-workspace Tickstream MYM source is available when the local Tickstream feed is configured. Its history is memory-only and bounded; Daily and 4H counts may remain unavailable. Tickstream is excluded from the BTC/ETH/SOL game mode.

## Data and cost

Taper requires `TYPESAFE_API_KEY` in the Count Desk server environment. The key stays server-side. Without it, the endpoint reports unavailable and no model output is fabricated. The local endpoint accepts only same-origin, loopback JSON. It rejects forming, out-of-order, or more than five-minute-stale 1m bars. It retains a local JSONL receipt in `count-dashboard/data/taper-decisions.jsonl` containing source/cutoff, evidence hash, model answers, token usage and estimated API cost; raw bars are not written to that receipt.

Cost uses pinned `jev-1.13.0` at the documented TypeSafe input rate of $0.042 per million tokens as an estimate; output tokens are free. Each new receipt stores pricing provenance and actual usage. Previous receipts retain their historical provider/rates. The UI shows cost per read and total for the current page; these are not costs per trade because Taper does not place trades.

## Boundaries

Wave Court in Quant Lab is a new, deliberately conservative OHLC candidate method. It is **not** a byte-for-byte port of the TradingView Pine engine or a substitute for Shammy's sourced human-reviewed seven-frame analysis. It does not certify complex corrections, diagonals, alternates, nested parent fit, or historical profit. Liquidity pivots are not order-book liquidity. Quality scores are structural descriptors.

For BTC/ETH/SOL the current Wave Court engine is an OHLC hypothesis, not a validated complete Elliott count strategy or measured edge. Before automated paper execution, the team still needs explicit trigger, invalidation, stop/target, sizing, expiry, source freshness, fee/funding, and fill rules, with a durable decision-to-order receipt. The current manual paper ticket keeps the game eligibility gate and later completed-bar fills.

MYM Tickstream uses the subscribed continuous symbol and does not establish an exact dated contract or verified roll history. Its chart and Taper results are paper research. A future automated paper strategy needs a dated contract, reconciled feed freshness, an explicit level-selection and stage policy, a tested cost/fill model, and a durable SIM decision-to-order receipt before Taper can be linked to the simulator.

## Source references

- TypeSafe HTTP API: <https://docs.typesafe.ai/api>
- TypeSafe models/pricing: <https://docs.typesafe.ai/models>
- Create a decision API: <https://developers.openai.com/api/reference/resources/decisions/methods/create>
- CME MYM tick: <https://www.cmegroup.com/articles/faqs/frequently-asked-questions-micro-e-mini-equity-index-futures.html> (1 index point = $0.50 per contract)
