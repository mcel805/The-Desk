# Quant Lab Trading Game — rules and personal interface v0.5

Date: 2026-10-07, America/Los_Angeles. Owner: Mark. Status: native personal interface implemented; no performance study has run. Revision v0.5 adds the range-only liquidity battlefield and forward paper limit orders. Earlier monthly rules and the USDC HTML prototype remain proposals for the later product.

## Purpose and scope

Make Quant Lab's existing Chart Trader a visual trading simulation for Mark first, restricted to BTC, ETH and SOL. Reuse its three current public market-data adapters: Binance, Coinbase Exchange and Hyperliquid. The core loop is observe the one-minute chart and its fifteen-minute dealing range, choose a conditional plan, take a paper position or wait, close, settle, and review. Use normal two-dimensional graphics initially. A future Unreal Engine client can render the same authoritative events after the rules and experience have been measured.

Confirmed user requirements: capture every 30 or 60 seconds with a toggle; decision API interprets swings/range behavior; measurement; interface available around the clock; identical trading layouts for simulation and real accounts; Base wallet identity; USDC denomination. USDC becomes available within one minute after closing. Transfers remain wallet to wallet on Base, with no bridging in the product flow. Monthly game cycles contain two divisions, at 500 and 1,000 USDC minimum funded account balances, with at most 100 players in each division. The player gets one screen with exactly two dashboard containers: chat on the left and one locked one-minute chart on the right. Its mandatory playing field is the fifteen-minute premium/discount dealing range, derived from the fifteen-minute chart context. Up to two optional indicators are allowed, including player-created custom indicators. The platform and game board form a closed-source ecosystem. Range-local data visualizations and animations should support a professional trading experience.

Latest clarification: only BTC, ETH and SOL are game markets. Quant Lab’s three connections are the provider choices, separate from the three asset choices. The supplied MYM1! screenshot remains a visual reference only; its futures prices, contract, broker and session labels are not inputs to crypto play. The 500/1,000 amounts are minimum funded account balances required at monthly-cycle entry; funds belong to the account. The simulation starts with two independent funded accounts, SIM-500 and SIM-1000. Payout economics remain deferred. Initial play is Mark-directed with agent assistance. The mandatory range does not consume an optional indicator slot; this is a proposed counting convention.

## Personal Quant Lab crypto pilot

The immediate deliverable is the existing Quant Lab chart with one selected BTC/ETH/SOL market, one selected connection, a locked 1m chart, matching 15m range context, two indicator slots, capture cadence, agent assistance, paper ledger and review. Reuse public bars, chart tickets, paper accounts and journal foundations. Latest direction: connect Mark’s personal Robinhood account through MCP while customer brokerage structure is deferred. Account reads and broker previews use a separate local transport. Broker execution is not supplied by the public chart connections.

### Allowed market universe and connection mappings

Source checked: `providerSpecs` and `renderConnections()` in `count-dashboard/web/quant-lab.js`, plus provider parsing in `web/vendor/vela.global.min.js`. These establish configured adapters and symbol conventions, not currently reachable data or permission to execute.

| Connection | BTC | ETH | SOL | Instrument convention |
| --- | --- | --- | --- | --- |
| Binance | BTCUSDT | ETHUSDT | SOLUSDT | Existing adapter treats unsuffixed symbols as spot; `.P` suffix selects its futures endpoint. Freeze exact type before scoring. |
| Coinbase Exchange | BTC-USD | ETH-USD | SOL-USD | Spot product IDs. Verify current product eligibility/metadata and actual bar availability at load. |
| Hyperliquid | BTC | ETH | SOL | Plain coin names resolve against perpetual metadata; spot uses a distinct symbol convention. Validate metadata at load. |

These are planned adapter mappings, not a claim that all nine combinations were loaded. Native game mode defaults to Coinbase / BTC-USD spot. The market selector only exposes BTC, ETH and SOL; no free-text market field in game mode. Both server and client validate the allowlist and the provider-specific instrument mapping. Existing general Quant Lab research outside game mode keeps its current symbol behavior.

Load 1m observations and the 15m context from the same provider and instrument identity. Do not derive a Coinbase range over Hyperliquid candles or mix Binance spot with perpetual prices. Retain `{provider, asset, native_symbol, market_type, quote_currency, timeframe, completed_cutoff, range_version}` on captures, predictions, orders, fills and receipts. The game ledger is denominated in play USDC; USD/USDT quoted chart data is not USDC cash or an assumed 1:1 conversion. Freeze a sourced valuation policy where conversion is needed.

Source/market changes clear unsent drafts and pause agent scheduling until a new matching 1m/15m snapshot and range are qualified. An open position remains bound to its original instrument and account; proposed v0.3 blocks source/market switches while it is open or settlement is pending. Source outages show unavailable/stale and never silently select another venue. Old captures, positions and study records retain their original identity.

Spot and perpetual markets need different fee, funding, quantity, risk and fill rules. A Short button in a simulator does not establish borrow or short-sale access on a spot venue. Score short scenarios only under an explicitly frozen hypothetical short model or qualified perpetual study. Aggregate reports must break out asset/provider/market type; comparisons use matched inputs and common assumptions. No pooling of spot/perpetual results as one BTC outcome.

The Base game retains its <=60s post-close USDC availability goal and future account parity. Public crypto data adapters do not connect private balances, custody, orders or wallet transfers. Payout economics stay deferred as requested.

## Existing implementation, verified from source

| Foundation | Current evidence | Required enhancement |
| --- | --- | --- |
| Chart trading | `count-dashboard/web/quant-lab.js:98` renders Chart Trader; account selection, chart tickets, bracket changes and manual close call `/api/chart-sim/quant-lab/*`. | Add a Game view, explicit rules, projected equity/cash, settlement receipts and study status. |
| Paper fills | `count-dashboard/server.py:855` accepts public crypto chart positions at client-supplied displayed prices. Close at line 928 requires a later chart bar; later snapshots check brackets. Multiplier is 1 for this crypto path. | An authoritative retained input and fill service must establish exact native instrument/type, eligible times, latency, costs and intrabar evidence. Current cursor fills cannot demonstrate executable results. |
| Accounts | `chart_sim_accounts` and `create_chart_sim_account` hold starting balance and account identity. | Versioned cash/reservation ledger; available, reserved, pending and wallet-transferred amounts. Never treat the static starting-balance label as equity. |
| Wallet | `count-dashboard/wallet_auth.py` declares Base chain 8453 and short local SIWE sessions. Its module explicitly provides identity only. | Real money funding, settlement, authorization, token verification, custody and payment adapters are future product work. |
| Journal | Close and entry functions queue paper journal events; `paper_journal_bridge.py` is a durable delivery foundation. | Settlement and reconciliation receipts, frozen input/media references, independently visible delivery status. |
| Presentation | `quant-lab.css` uses Inter/system type, near-black panels, purple accents, green/red trading cues and compact on-chart tickets. | Use the supplied TradingView screenshot as chart design source; retain Quant Lab identity and explicit simulation/account status. The current chart renderer is Vela; familiar chart styling does not establish full TradingView feature parity. |

This is a source inventory, not a runtime acceptance report. Port 8770 was not listening during this planning session. Some older experience documentation predates the public crypto paper path; source above is the current basis. Current BTC/ETH/SOL feed availability and freshness have not been verified in this scope revision.

## Game rules v0.3

All numeric timing and scoring rules below are proposed study settings. Freeze the configuration and hashes before scoring; edits create a new version or a separate study arm.

| ID | Rule | What the player sees |
| --- | --- | --- |
| G01 | One selected account, one exact BTC/ETH/SOL instrument, one open position at a time in v0.3. One chart locked to 1m. No averaging or hidden position mirroring. | Account/mode badge remains visible on chart, ticket, position, receipt and journal. The 15m context is an overlay, never a second player chart. |
| G02 | A range is eligible only with high > low, source, anchor times, calculation/confirmation time and rule version. Equilibrium = (high + low)/2. Premium is above equilibrium; discount below. | The one-minute chart carries low, equilibrium and high, with the range's fifteen-minute origin. “Fifteen-minute range” means derived from 15m structure; it does not define its lifetime. |
| G03 | Initially use Mark's supplied/drawn range as authoritative user context. Preserve it until its explicit update or invalidation. No guessing the indicator's algorithm. Freeze the range version for each forecast and entry. | New ranges can appear while an old position retains its original context and rationale. |
| G04 | Capture cadence is 30s or 60s. Main decisions occur once per newly completed one-minute bar; a 30s interim image is a provisional observation. | Capture countdown and last completed bar time; an interim update never silently becomes a second order. |
| G05 | Select a candidate: rotation up, rotation down, breakout up, breakout down, or unresolved. Premium/discount alone is insufficient confirmation. | Evidence, strongest objection, trigger, invalidation, expiry and “Wait” are visible. |
| G06 | Proposed forecast horizon is the next five completed 1m bars. Observe which frozen level is reached first; report high/low excursion. Untriggered entry proposals expire after three completed 1m bars. | Five-bar scenario window and separate three-bar entry expiry. Neither is a promised price or win probability. |
| G07 | Mark chooses Long, Short or Wait in initial play. A valid entry needs exact source, freshness, stop/invalidation, size, planned risk and a supported fill/cost configuration. A new autonomous paper study is a separate version. | A preview states why a proposed entry is eligible or blocked. |
| G08 | Set one virtual risk unit R before play. Planned risk per entry <= 1R; stop new entries after session realized net loss reaches 3R. Use the configured exchange session, not a guessed calendar day. | Planned risk, remaining loss budget and halt reason. These are draft settings, not changes to Mark's existing strategies. |
| G09 | Allow manual close, stop, target or a proposed 15 completed-bar time exit. Do not widen a protective stop to increase planned risk. A Wait decision is valid play. | One clear Close action and visible exit reason. Time exit is independent of the settlement clock. |
| G10 | Calculate paper P&L from sourced simulated fills: direction × quantity × multiplier × (exit − entry), minus configured known costs. Stops can slip; gaps can exceed planned R. | Gross, costs, net and risk-limit breach. Missing costs mean net is unscored, never silently zero. |
| G11 | Every confirmed close receives one settlement identity. Release the position reservation and apply its net balance change atomically. Duplicate closes, retries and restarts cannot pay twice. | Position closed → calculating → available → transfer pending → wallet confirmed. Simulation ends at virtual availability unless a payment failure is being rehearsed. |
| G12 | Target every eligible settlement becoming available within 60 seconds of confirmed close; report the deadline-compliance rate plus p50/p95/p99 and worst-case latency. Separately measure close-request latency and close-to-wallet receipt latency. Delays remain visible. | A receipt timer; pending state at 60s, with the reason and retry status. No fabricated successful receipt. |
| G13 | Each monthly game cycle has a 500 USDC minimum-balance division and a 1,000 USDC minimum-balance division, each capped at 100 players. Month-end never erases liabilities or losses. At monthly entry the account must meet its division minimum in confirmed settled available funds. Joining does not deduct the minimum. No fee or prize pool is inferred. | Division, account funding status, cycle boundary and statements. Public admissions/prizes are deferred beyond the personal pilot. |
| G14 | Record rule adherence, evidence and review separately from financial outcome. Proposed competition ranking is net return after configured costs, subject to drawdown and rule-violation criteria frozen for each division. Do not award rank for trade count, deposit size or chasing a loss. | Private practice feedback and official division standings have distinct status. No fabricated rank or payout. Ranking/tie-break rules require a separate freeze before competition. |
| G15 | Stale data, missing instrument/range, incomplete execution evidence, loss cap or missing ledger blocks dependent actions. A missing model does not disable supported manual paper exits. | Explicit source status and resume criteria; no silent substitute feed or account. |
| G16 | The interface and historical practice can be available 24 hours. Forward observations follow the selected market calendar, outages and data rights. | Replay / synthetic practice / forward paper / market closed / delayed / disconnected are unmistakable states. |
| G17 | At most two optional calculation/indicator slots. Custom indicators follow the same input, causality, resource and version rules. Mandatory field/position/receipt/agent annotations do not secretly install extra predictive studies. | Two visible slots; adding a third requires replacing one. Every displayed indicator has an owner/version. |
| G18 | All gameplay transfers use the approved native USDC token on the configured Base network. No cross-chain route or bridge is part of entry or settlement. | Sender, recipient, amount, token, chain and transaction receipt. Wallet identity alone does not verify an eligible funded account. |
| G19 | Range-local animations are views of retained data and interactions. They cannot change time, prices, fills, risk, ranking or balances. | An animation can be paused while the authoritative source and settlement engine continue. Synthetic/reconstructed scenes remain labeled. |
| G20 | Only BTC, ETH and SOL, through Binance, Coinbase Exchange or Hyperliquid. Freeze one exact venue/instrument/type/quote for 1m and 15m inputs. Provider/market changes are blocked while a position or receipt is pending. | Separate connection and three-choice market selectors; stale/unavailable states; source identity on every decision/receipt. |

Sizing requires confirmed tick size, tick value, quantity step, multiplier and costs for the selected instrument. Freeze the native symbol, spot/perpetual type, quote and valuation policy for each provider/asset. The game must not force a nonzero trade if the smallest eligible size exceeds the virtual risk budget. A gap that exceeds the reservation debits the virtual cash account honestly, can produce a deficit/halt, and cannot be hidden as a bounded loss.

## Proposed player experience

1. **Enter:** choose simulation or a visibly unavailable future real account context, then see the cycle and account status. The monthly divisions require at least 500 or 1,000 settled available USDC respectively at entry. The pilot supplies SIM-500 with 500 and SIM-1000 with 1,000 play USDC. Each must join the demo cycle after passing its minimum-balance check; no real funds move.
2. **Observe:** one screen contains one locked one-minute chart. The fifteen-minute range is shaded on the right chart; the left chat shows the current candidate and its evidence. The capture toggle, source clock, account selector, two indicator slots and trading controls remain inside the right chart container. Tickets and receipts open over that chart; there is no third persistent sidebar. Fifteen-minute source context is computed/stored behind the chart rather than opened as a second player chart.
3. **Choose:** Long, Short and Wait sit beside the account selector. An on-chart preview exposes entry, stop, target, planned risk, costs and proposal expiry. Confirmation creates a paper order, not a guaranteed fill.
4. **Manage:** one position strip shows floating P&L separately from settled funds. The chart preserves entry and range versions. Closing stays accessible without opening a drawer. Stale data does not synthesize an exit fill.
5. **Settle:** the receipt shows actual fill time, gross/net, released reservation, available balance, processing time and failure state. A future actual wallet transfer has its own transaction hash, chain, token and confirmation status.
6. **Review:** entry and exit screenshots/reconstructions and the exact prediction are linked to the journal. The trader marks rule adherence and a short reflection. Rejected, Wait and missed cases are retained for scoring.
7. **Monthly cycle:** show division membership, settled profit/loss, costs, drawdown, rule adherence, settlement reliability and official/provisional standings. Preserve liabilities and history at rollover. Per-close availability does not depend on leaderboard publication. Any monthly award uses a separately funded and reconciled award ledger.

The visual prototype uses deliberately synthetic normalized chart levels and play USDC. Its example 8-second settlement and sample P&L are interaction fixtures, not measured results. It calls no market, decision, wallet or transaction service.

## Monthly divisions and admission

| Division | Minimum settled available USDC at entry | Player limit | Aggregate minimum at full capacity |
| --- | --- | --- | --- |
| Division 500 | 500 USDC | 100 | 50,000 USDC |
| Division 1000 | 1,000 USDC | 100 | 100,000 USDC |

The combined full-capacity aggregate minimum is 150,000 USDC. Accounts may contain more than the entry minimum. This is arithmetic capacity, not a pooled prize fund, revenue, available platform treasury or a balance actually received. Tier selection never authorizes a transfer to platform custody.

Proposed future admission states: account created → funded → minimum balance qualified → seat temporarily reserved → active → cycle complete/disqualified according to frozen terms. Use atomic capacity reservations with expiry; reject a 101st seat. Freeze cycle start/end in UTC, display the player's local time, specify cutoff/late entry/reconnect rules and don't retroactively admit historical profitable trades. Proposed initial fairness rule is one competition seat per verified player per cycle, in one chosen division; final identity/seat rules remain design choices. Account verification never creates an implicit platform payment. Any actual custody/transfer/refund design is deferred with payout economics.

For this personal pilot, initialize exactly two independent accounts: SIM-500 with 500 play USDC, SIM-1000 with 1,000 play USDC. They have separate cash, reservations, realized net P&L, receipts and cycle membership. Selecting another account never copies its balance or positions. For a future scored division, freeze funding/deposit treatment and standardized risk/fill/cost/source rules before rankings; return calculations must exclude external deposits. A player switching indicators gains no future data or changed source. Version official rankings and keep provisional statuses until all trade/cost/settlement records reconcile. Define ties, minimum eligible observations, no-trade participants, drawdown penalties, rule breaches and dispute review before opening a scored cycle. Customer wallet value, broker buying power and future competition awards are different facts and must not be merged.

## Two indicators and the closed platform

The range, one-minute candles, position levels and settlement status are mandatory game infrastructure. Players select at most two optional indicators; custom indicators occupy slots exactly like catalog indicators. An AI scenario is visibly labeled assistance, not an invisible third custom calculation. If a visual computes another independent predictive study, it must count against a slot or be declared common game infrastructure before the cycle starts.

Custom builds use a constrained SDK over approved point-in-time market inputs. Sandbox calculation with no secrets, wallet access, arbitrary host filesystem/network access, future-bar access or balance mutations. Validate resource budgets, causality, version signatures, licensing/ownership and reproducible replay before admitting a module. Preserve creator ownership and explicit sharing/private settings. Indicator source remains private according to the agreed author policy; the game board and backend remain proprietary. Closed source does not conceal the rules, applicable fees, sourced prices or the player's receipts. Freeze custom code/settings at the appropriate session/cycle boundary so historical decisions can be reproduced; updates create versions.

Range-local experiences proposed for exploration: approach-speed animation, completed-bar volatility shading, confirmed swing trails, time spent above/below equilibrium, first-touch/retest markers, volume displays when qualified, and a replay of the agent's evidence/uncertainty. Show whether each quantity is observed, calculated or approximate. Each visual has an off switch, stable scale, input hash/version and reduced-motion option. Keep the Close control, field boundaries and money states readable. Data collection records market-subset features (position within range, range width/age, direction/velocity, qualified volume, excursion and touch sequence) and separately consented player interaction events (proposal shown, Wait, chosen action, latency and review). Retain private player/wallet data outside Git and preserve market-data rights for storage, model use and derived distribution.

## Simulation and real account parity

Use one presentation component and shared event vocabulary. Account identity, balances, positions, secrets, ledgers and adapters are isolated. Similar screens do not mean identical balances, fills, timings or permissions.

| Behavior | Simulation | Future real account |
| --- | --- | --- |
| Display | SIM · play USDC; selectable synthetic/replay/forward source | REAL · native USDC; explicit readiness and authoritative price source |
| Funds | Configured virtual ledger | Verified backing, custody and payment architecture |
| Price authority | Frozen simulator input and fill rules | Product-specific independent pricing/oracle or authorized execution venue |
| Close/settle | Durable virtual receipt | Durable real settlement receipt and verified balance effect |
| Transfer | Rehearsed receipt; no money moves | Authorized USDC transaction, token/chain match, confirmation and reconciliation |
| Failures | Record deficit, stale data, duplicate suppression and failed settlement | Enforce product terms, liquidity and authorization; cannot fall back to SIM |

Account switching clears unsent drafts, pauses account-bound assistance and requires explicit position selection. An existing open position stays in its original account. There is no automatic copying between accounts.

Mark deferred real-game payout economics. A future product phase will specify payout counterparties, loss allocation, fees, liquidity/backing, custody and applicable review. No prize allocation or synthetic profit redemption is assumed. This deferral does not block the personal crypto chart or paper measurement work.

## Settlement contract and balance rules

Use double-entry entries in integer micro-USDC, with a rounding policy. Account projections expose cash, reserved, settlement-pending, transfer-pending and available; floating P&L is separate. Never sum the same claim in multiple buckets. Transfers to a wallet reduce app custody cash after the configured confirmation policy, with reconciliation for pending/replaced/reverted transactions.

Virtual example: 1,000 play USDC cash; 10 reserved for one trade, 990 available. At close, a fixture gross gain of 2.40 and configured example cost of 0.20 produce net +2.20. Release the 10 reservation and apply +2.20 once: 1,002.20 cash/available. Released reservation is not profit and must not be counted again. A real payable transfer depends on the eventual custody/product model; never mint a claim because a vision model predicts a gain.

Receipt fields: settlement_id, trade_id, account_id, mode, rule/fill/cost versions, source input hash, confirmed close timestamp, calculation timestamp, availability timestamp, gross/cost/net values and status, released reservation, ledger event IDs, transfer ID, chain/token/tx hash, receipt block/hash, confirmation policy, status, error and reconciliation cutoff. Close and transfer idempotency keys are unique per account/trade/action. Persist before acknowledgment; recover the same receipt after restart. Corrections use linked adjustment events rather than rewriting original receipts.

Future funds remain on Base for the proposed same-network USDC payout path. Use native Circle USDC identified from its official registry; Base mainnet address is `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`. Base Sepolia uses a different test token with no financial value. [Circle contract registry](https://developers.circle.com/stablecoins/usdc-contract-addresses).

Base distinguishes early L2 inclusion from later Ethereum batch finality. Therefore the 60-second product goal must name its confirmation/availability policy; it is not a guarantee of finality or bridge completion. [Base transaction finality](https://docs.base.org/specifications/transactions/transaction-finality). Base transactions have L2 and L1 fee components. Budget gas sponsorship or an explicit fee arrangement to support an experience denominated in USDC. [Base network fees](https://docs.base.org/specifications/transactions/network-fees).

Crypto practice and the interface target 24-hour availability. Provider outages, missing bars and stale inputs still suspend dependent forward decisions. Define a UTC observation day/session convention before measuring; the reference image’s CME session is not the crypto study calendar.

## Agent and service design

Source intake → qualified completed bar + capture → range version → decision API → proposal → independent eligibility/risk gate → Mark's confirmation → paper fill engine → position close → settlement ledger → journal/review. A future payment adapter reads approved payable receipts; the model cannot write balances or direct transfers.

Services/objects: Cycle/Division/SeatAdmission (capacity, account eligibility, receipt); GameSession (account, source, rules, cycle, division, indicators); RangeSnapshot (exact boundaries, anchors, effective time); Capture (time, image hash, bar state); Observation (completed OHLC, source/receive times, quality); IndicatorBuild (owner, version, causal inputs, resource profile); Decision (candidate, evidence, opposition, trigger, invalidation, five-bar horizon, three-bar expiry); Order/Fill/Position; SettlementReceipt; CycleStatement/AwardReceipt/Ranking; StudyRun. Stable IDs link all objects. Store market evidence and private account data outside Git.

Decision responses are schema-validated. Required output: identity, cutoff, frozen range ID, completed bar ID, candidate or abstain, supporting anchors, conflicting evidence, proposed trigger/invalidation, expiry and horizon, data-quality status. Prices inferred only from pixels carry approximate status and cannot alone populate exact executable levels. One decision key per (account, rule version, provider, native instrument, market type, completed bar, range version); late responses cannot alter a recorded decision. Screenshots supplement approved retained OHLC/tick/quote evidence. Browser screen capture requires a user-started permission flow; prefer rendering the app-owned chart for unattended captures.

Proposed new modules: `trading_game.py` (rules/eligibility), `game_ledger.py` (virtual balances/receipts), `game_study.py` (frozen evaluation), `web/quant-game.js` and `.css` (shared view). Add namespaced `/api/trading-game/*` routes through `server.py`. They are planned names, not existing services. Reuse Chart Trader/account/journal entry points, but isolate the new fill rules from legacy cursor-based snapshots. Preserve existing IDs and historical records; import old positions as `legacy_unscored` until costs and evidence are reconciled. Feature flag `quant_game_v1` starts off; disabling it restores the existing presentation, while durable receipts remain accessible. Never delete legacy records as a migration shortcut.

## Measurement before claiming success

Freeze data rights/manifest, exact instrument, sampling, costs, rules, model/prompt hashes, range derivation, labels, exclusions and study schedule before viewing held-out outcomes. Development examples teach the vocabulary; held-out examples score it; forward paper observations are a third stage.

| Question | Proposed measurement | Acceptance / interpretation |
| --- | --- | --- |
| Can Mark use the experience? | Ten scripted personal-use tasks covering entry, Wait, close, receipt, history, mode selection, stale data, monthly review, settlement delay and restart. Record completion, critical mistakes and perceived available funds. | All critical paths completed; zero mode or money-status misunderstandings. A single person's result is personal-use evidence only. |
| Are rules enforced? | Replay duplicate/reordered captures, forming bar, changed range, gap, stop+target in same OHLC bar, loss cap, model timeout, disconnect and restart. | Zero future-data leaks; all blocked cases explain why. Same input/config yields identical fills and balances. |
| Does the forecast add information? | Proposed pilot: 200 eligible nonoverlapping five-bar windows over at least 20 sessions; held-out and forward results reported separately. Compare agent to a frozen location-only baseline: discount→midpoint up, premium→midpoint down, midpoint→abstain. Report class counts, abstention/coverage, excursion error, ambiguous cases and session-clustered uncertainty. | Pilot is not statistical proof. No calibrated probabilities until proper scored calibration. An uncertain interval is inconclusive. |
| Does assistance improve decisions? | Compare manual and assisted play on disjoint, matched replay cases; alternate order. Record net paper outcome, drawdown, adherence, missed/false interventions and interaction time. | Report personal learning/carryover limitations; no broad customer inference. More trades is not success. |
| Is settlement reliable? | Clock request→confirmed close, close→ledger available, and (future testnet) close→wallet receipt separately. Include failed/retried/pending attempts in denominators. | Target 100% deadline compliance in the finite acceptance run; report all latency percentiles and failures, with zero duplicate credits/transfers and exact ledger reconciliation. Failure drills reported separately, never silently excluded. |
| Does trading have an edge? | Net expectancy with all configured costs, exposure, loss clustering, fill sensitivity and session-clustered confidence intervals; full trade/no-trade denominators. | No positive-expectancy claim while costs/source rights are missing or interval spans zero. Separate UX acceptance from trading performance. |

Metrics currently: NOT MEASURED. Freeze the pilot's baseline tie-breaking, near-midpoint band, session calendar, overlap exclusions and material costs before scoring; ambiguous OHLC first-touch ordering needs finer data or an explicitly unscored outcome. Study sample size is provisional and should be revised using a prespecified uncertainty/precision target, not favorable preliminary performance. Once scoring starts, changing a rule creates a new study.

## Build sequence and delivery gates

1. **Review rules and interaction prototype:** inspect the normal-graphics mock; freeze the selected BTC/ETH/SOL instrument mapping and range formula. Post-close availability, account tiers, two divisions, minimum balance admission, two simulated starting accounts and two indicator slots are confirmed. Payout economics are deferred. No funds needed for personal practice.
2. **Personal simulation vertical slice:** source-qualified chart + range + manual paper ticket + deterministic fills + risk gate + cash/reservation ledger + one close/receipt + journal. Accept identity correctness, recorded fills, restart safety and traceable balances.
3. **Agent-assisted replay study:** add capture toggle, strict Decision contract, remembered scenario state, expiry/invalidation, and immutable study inputs. Accept duplicate suppression, cutoff correctness and baseline report.
4. **Forward paper operation:** verified source subscription/rights, actual market calendar, server scheduler, freshness, gap detection and reconciliation. Run 24-hour infrastructure soak across UTC day boundaries and provider outages; measure availability and settlement reliability.
5. **Three-market coverage:** qualify BTC, ETH and SOL for each selected adapter; retain venue/type/quote identity, fees, funding and valuation. Report provider/asset-specific measurement. Private account integration is a future approved scope.
6. **Wallet/payment rehearsal later:** separate Base Sepolia test account adapter; exercise sign/deny/wrong network/wrong token/insufficient gas/revert/replacement/reorg/restart. Test tokens have no monetary value. Game payout economics remain deferred.
7. **Monthly competition later:** two 100-player account divisions, frozen rankings and any subsequently defined awards; rollover preserves equity and liabilities. Exercise capacity/cutoff/reconnect and month-end reconciliation in simulation.
8. **Real game product later:** resolve the deferred payout funding, pricing/counterparty authority, custody, liquidity, fees, data rights and explicit approvals before enabling actual game payments.
9. **Unreal presentation:** render signed/validated event projections through a versioned client API. Unreal owns visuals; the server owns time, fills, balances, settlement and records. Normal and Unreal clients replay identical outcomes. Explore scenery/animations after readable trading and rule adherence pass.

## Decisions needed to freeze v1

- 500/1,000 are minimum funded account balances at monthly entry. SIM-500 starts with 500; SIM-1000 starts with 1,000 play USDC. Freeze future monthly ranking/tie rules before competition; payout economics were deferred by Mark and do not block the personal pilot.
- Confirm the chosen provider/instrument mapping, exact native symbol/market type, range indicator/settings or user-drawing rules, and data/AI/replay rights.
- Confirm personal virtual funding, R, session loss cap, holding limit, cost/fill model and forecast horizon. Current numerical rules are proposals.
- Qualify BTC/ETH/SOL feed availability per connection and freeze spot/perpetual, shorting, valuation, costs and session/day boundaries. Base-game payout funding remains future work, as requested.

Recommended first implementation: one complete BTC manual paper trade through a settlement receipt in the existing Quant Lab chart, with a frozen fifteen-minute range and the normal two-dimensional view. Add agent prediction as a separately measurable layer.

## Earlier v0.1 prototype verification

The standalone HTML was checked in Chrome in dark/light themes and at a 390px viewport. Long preview/open/close produced one synthetic receipt and +2.20 play USDC; a subsequent loss applied -2.60, yielding -0.40 cumulative net. An injected 70-second delay retained the reservation until recovery. Robinhood preview showed unknown currency and disabled paper execution controls. Two indicator selections showed 2/2 slots; the 30-second toggle marked interim updates provisional. Chrome reported no console messages. These are earlier v0.1 interface-fixture checks, not trading, source-feed, production ledger or settlement measurements. The v0.2 market-selector and v0.3 account/admission revisions have not been run or tested.

## Confirmed dashboard layout revision

Mark specified exactly two containers: chat left and a single one-minute chart right. The mock now uses those two direct dashboard regions. Chat contains the agent conversation and composer. Chart contains the mandatory fifteen-minute field, two indicator slots, capture toggle, account and trade controls, position/cash strip, and on-chart tickets/receipts. The supplied MYM1! / 1m / CBOT screenshot now defines the chart look: dark #131722 canvas, compact near-black toolbars, white candles, left price scale, embedded drawing rail, on-chart trade labels, and bottom time/session controls. Its AMP Live and real-time labels are source-image content, not verified app integration. The yellow account-size note is reference content; the user’s funding-tier clarification still governs the plan.


## TradingView-style chart and customization enhancement

Design source 1: Mark's explicitly supplied TradingView screenshot. Target the familiar visual layout and interaction conventions throughout the right chart container. Keep the chart interval locked to 1m in game mode; the 30s/60s toggle controls image capture. Do not display a functioning 15m chart selector as though it changes the playing chart. Fifteen-minute context remains a stored overlay. All game trades and scores use standard sourced 1m OHLC bars, even if an alternative visual style is selected.

### Customization contract

| Area | Required controls | Prototype status |
| --- | --- | --- |
| Price series | Up/down bodies, borders, wicks, last-price line/label, countdown; candles/OHLC bars/line; font and precision. | Candle/line colors and three render styles; last sample marker toggle. |
| Canvas | Solid/gradient background, grid colors/styles/opacity, crosshair color/style, text size, dark/light presets. | Solid canvas color, grid and crosshair toggles. Chart settings remain independent of page theme. |
| Range | Premium/discount/equilibrium colors, opacity, label position/visibility, boundary styling; retain authoritative source anchors. | Fixed normalized range fixture; styling controls planned. Hiding annotations never removes their scoring context. |
| Price/time scales | Left/right, auto/manual, linear/log/percent/indexed/invert; bar spacing, fit/reset, timezone, exchange sessions, history/date navigation. | Left/right percentage scale; synthetic relative time. Never apply logarithmic scaling to ineligible nonpositive values. |
| Drawing workspace | Lines/rays/channels, horizontal/vertical levels, rectangles, Fib tools, text, measure and long/short planning drawings. Edit/drag/style, snap, lock, hide, group, object tree and undo/redo. | Trend/horizontal/rectangle drawing by chart clicks; undo/hide/clear, session-local only. Drawings are annotations, not orders. |
| Indicators | Two selectors; parameters, plot styles/colors/visibility and removal; versioned custom module import/build. | Slot count only, no computed indicator. Optional subpanes belong within the one chart container and count toward the two slots. |
| Trading | Buy/sell widget, sizing, on-chart entry/position/SL/TP labels; dragging makes a preview requiring confirmation; close and receipt. | Fictional preview/open/close/receipt. Production paper execution and drag validation remain implementation work. |
| Interaction | Wheel/pinch zoom, drag pan, shortcuts, context menus, focus/fullscreen, resizable chat, reduced motion. | Cursor crosshair and local drawing interactions. Pan/zoom and persistent workspace interactions planned. |
| Persistence | Named templates, reset/import/export; chart/indicator settings, drawings, viewport and user preferences. | Appearance stored locally in browser with reset; production workspace storage and drawing persistence planned. |

Changes to appearance can occur during play. Calculation settings and custom code changes must respect the frozen study/cycle version. Capture each image together with provider, asset/native symbol, spot/perpetual type, quote currency, timeframe, source time, completed cutoff, viewport, scale, timezone, range anchors/version, indicator code/parameters, drawing versions and account mode. Preserve the original unannotated capture plus the decision overlay. Pixel reads of prices stay approximate; retained market data supports exact scores. The supplied screenshot is a design/provenance reference and is not reconstructed as real OHLC data.

### Chart engine decision

For the personal pilot, extend the current Vela renderer (`count-dashboard/web/quant-lab.js`, chart creation around line 914) and build the missing customization controls against a tracked feature checklist. Reuse its existing chart ticket/drawing foundations. The prototype is an SVG interaction sketch, not an installed chart engine replacement. The complete TradingView application and its integrated chart library are distinct products; matching styling does not supply TradingView data, Pine, user accounts or broker connections.

TradingView's current eligibility FAQ says Advanced Charts and Trading Platform are proprietary libraries restricted to eligible company public projects/applications, unavailable for personal hobbies/studies/testing. Lightweight Charts is available for personal projects under Apache 2.0, but recreating advanced controls still requires application work. Evaluate a licensed library path when the product qualifies; do not make that a dependency for Mark's immediate private prototype. [Official library comparison and eligibility](https://www.tradingview.com/free-charting-libraries/).

Their custom-study documentation supports JavaScript modules and does not support Pine Script. The library itself does not provide an end-user code authoring facility. A player-created indicator experience therefore needs our own sandbox/editor/version registry and renderer adapters. Porting a supplied Pine indicator requires rights and independently checked calculations; do not promise automatic script compatibility. [Official custom study documentation](https://www.tradingview.com/charting-library-docs/latest/custom_studies/).

### First implementation slice

Build the TradingView-style right-container chrome and appearance settings over Vela, preserving left chat. Then add persisted drawings and exactly two indicator controls, followed by the paper ticket/receipt loop. Document each feature as working, partial or planned; accepting the appearance alone does not accept prediction accuracy, broker access or settlement. Full feature parity is a separately auditable scope.


### Reference revision browser checks

Chrome displayed exactly two dashboard children and one chart SVG. The settings dialog opened, selecting Line created the line renderer, choosing the right scale hid the left labels, and disabling the grid hid the grid. Reset restored the screenshot-inspired default. A click-created horizontal drawing appeared; Hide concealed it and Undo removed it. The reference asset is preserved locally and embedded into the portable export. These checks cover the design prototype only; the production Quant Lab chart has not been changed in this revision.


## Funded accounts and monthly entry — v0.3

Confirmed: users fund an account and must have the division minimum to enter a monthly cycle. The personal simulation has two distinct accounts; it is not one account with a changed tier label.

| Simulation account | Initial settled cash | Monthly entry minimum | Separate records |
| --- | --- | --- | --- |
| SIM-500 | 500 play USDC | At least 500 play USDC | Balance, P&L, positions/reservations, entry and settlement receipts |
| SIM-1000 | 1,000 play USDC | At least 1,000 play USDC | Balance, P&L, positions/reservations, entry and settlement receipts |

Proposed qualification basis: confirmed settled available balance, excluding floating gains, reservations, pending settlement and unconfirmed deposits. A candidate qualifies when available >= division minimum. Production admission checks balance, seat capacity and rule version atomically and issues an idempotent admission receipt. The minimum is a balance requirement, not a deduction. Real funding/ownership/custody and account structure must be defined when that product phase is designed. Mark described a brokerage-like business; its role and business/legal structure remain undecided. This plan does not declare a brokerage registration or create a real account.

The user specified a minimum **to enter**. Proposed v0.3 checks it on monthly admission. After an admitted trade loses money, the account balance reflects the loss without silently resetting, charging a fee or removing membership. Existing trading risk/available-funds gates still apply. Next cycle requires a fresh minimum check. Any continuous minimum, top-up deadline or mid-cycle withdrawal restriction is a separate rule to define; none is inferred from this entry requirement. Funding and profit withdrawals must be handled separately from ranking performance.

For the local prototype, both funding amounts are fixtures already credited at initialization. Each account has its own Join monthly cycle action. Source/market and account switching are blocked while a position or settlement is pending. Next demo cycle retains balances and trade history, clears membership and rechecks eligibility. Reset both SIM accounts explicitly restores both initial funding fixtures and clears their local histories. Browser memory holds these records for this page only; durable repository accounts and deposit/withdrawal ledger events are implementation work. Both accounts can be admitted in this private two-account exercise; the future one-player/one-seat admission proposal remains a separate competition policy.

Planned measurement cases: 499.99 fails / 500.00 qualifies for Division 500; 999.99 fails / 1,000.00 qualifies for Division 1000; joining changes no cash; one account's close changes only its ledger; an admitted loss below the minimum does not reset cash; the next-cycle admission fails until qualified; duplicate join/close remains idempotent; switching/reset behavior is explicit. These cases have not been run in this revision.


## Native Quant Lab implementation — v0.4

Open `http://127.0.0.1:8770/quant-lab.html` and select a strategy from the shared Trading page. `?strategy=hourly` opens the 1h workflow; `?strategy=day` opens the 1m liquidity-field workflow. The former `?game=1` link remains a compatibility alias. Both use the existing Vela chart engine. This is not the proprietary TradingView library or a claim of complete TradingView customization parity.

Implemented:

- Chat left; one locked 1m chart right; source and BTC/ETH/SOL selectors.
- Two optional studies. Built-in volume and the mandatory range do not consume these slots. The existing indicator picker remains the study interface; arbitrary custom indicator execution is not newly implemented.
- Load completed 15m source context, edit high/low, then explicitly freeze a versioned premium/discount field with equilibrium. The latest completed 15m candle supplies a preview; it does not reproduce the unspecified reference indicator formula. Changing chart identity invalidates the field.
- 30s/60s screenshot capture. Each capture first refreshes the same public provider, retains the PNG, latest 120 completed 1m OHLCV bars, study names, cutoff and range version locally, and labels repeated completed-bar observations. The capture process does not invoke a decision API. Browser timers pause in hidden tabs and end when the page closes; this is not a headless 24-hour service.
- Two durable paper accounts, Range Trader SIM-500 and SIM-1000, use the existing virtual USD ledger and paper tickets. They are separate accounts. These native accounts are not the earlier prototype’s play-USDC wallet ledger, and native monthly admission/settlement rules are not implemented here.
- Robinhood MCP refresh gets the accessible account, crypto buying power, current pair eligibility, all holdings pages and broker quotes. Quotes remain dated and separate from chart prices. BTC/ETH/SOL broker pairs are USD spot; a Sell means disposal of owned units, not a perpetual short.
- Buy/Sell and Chart Trader in Robinhood mode open a local draft form. Broker preview is requested separately for that specific draft. The application accepts actual successful MCP responses with matching account and parameters; model prose cannot become a snapshot or receipt. Preview responses may include validation errors and are not submitted orders or fills.
- The local Codex runtime uses its configured Robinhood MCP login. Only account/portfolio/pairs/positions/quotes and preview tools are allowlisted. Placement/cancellation/transfer tools are absent. This pilot has no live order placement control, no USDC transfer and no measured settlement promise.

Account snapshots, draft records, captures and MCP diagnostic traces are local private data under `count-dashboard/data/` and excluded from Git. The browser never receives credentials or full account identifiers. The research chat remains governed by its existing paper/research policy.

Runtime observations on October 7: the native Coinbase BTC-USD 1m chart loaded and its completed 15m field rendered. The local MCP runtime returned the accessible account, portfolio, BTC/ETH/SOL pairs, holdings and quotes, and the server accepted an account refresh. A subsequent public chart refresh saved one PNG observation with 120 completed bars and the frozen field. The page reported no console errors during that interaction. No broker order was placed. Broker previews require a user-specified draft; no trade parameters were invented to exercise that path. No automated tests or performance evaluation ran.

Remaining stages: wire the specified decision API and immutable forecast/outcome ledger; establish the exact range formula and frozen study/fill/cost rules; validate broker previews for Mark’s chosen order; add an explicitly authorized execution transport with reconciliation; measure the personal experience before Unreal or customer wallet/cycle economics.

Codex tool allowlists follow the official configuration reference: <https://learn.chatgpt.com/docs/config-file/config-reference>. Local authentication is inherited through the configured runtime, not extracted by this application.

## Liquidity battlefield — v0.5

Confirmed by Mark: entries are permitted only at liquidity levels inside the 15m premium/discount range. A default chart indicator has an off toggle. Data shown belongs to that field, without earlier history. This revision supersedes v0.4's 120-bar capture scope and immediate paper-entry controls in game mode.

### Field and data

The default field initializes from the latest completed 15m candle's high/low, with equilibrium at their midpoint. This is a provisional initialization method: the exact algorithm from Mark's reference indicator has not been supplied. The range dialog allows manually specified bounds and a new frozen field version. Source identity, range start, bounds, completed cutoff and version accompany the field.

Current interpretation of “no historical”: only 1m candles from that completed 15m candle's formation onward are fetched for the game, calculations, agent context and new captures. Older candles are excluded rather than just hidden in the viewport. This was the stated implementation assumption while awaiting clarification. The two completed 15m context candles used to initialize the field are not displayed as trading history. Previously saved private research records are preserved. The game chat has its own conversation selection and does not automatically reopen the earlier Quant Lab research conversation.

The price scale is fixed between the field low and high. Price outside those bounds is visually clipped; original OHLC values remain intact. Pan/zoom does not load earlier history. The field is frozen until replaced; it does not silently roll every 15 minutes. Changing source or asset establishes a separate field. Calculations start again when the field changes. Long warmup studies have limited data, and studies that require data outside the field are disabled in game mode.

### Default indicator: Range Liquidity v1

The built-in indicator is separate from the two optional study slots. It uses the current Quant Lab structural swing semantics on completed, contiguous 1m candles only:

| Setting | Rule |
| --- | --- |
| Internal levels | Strict unique high/low with five completed candles on each side |
| External levels | Strict unique high/low with fourteen completed candles on each side |
| Availability | Only after the right-side confirmation candle closes; the line begins there |
| High level invalidation | A later completed close above its price |
| Low level invalidation | A later completed close below its price |
| Eligible field | Level price must lie within the frozen field, including its boundaries |
| Missing candles | Reset calculation to the latest contiguous segment; do not assume unseen history |

High levels are labeled BSL; low levels SSL. These are OHLC-derived structural hypotheses, not observed resting orders, order-book size, probabilities or a demonstrated edge. Tied extrema do not produce a level. There may be no eligible level until enough field-local candles exist. Turning **Default liquidity** off hides its drawings while the entry rule and calculations remain active. The level selector remains usable and does not silently select a replacement when a selected level disappears.

### Entry and paper fill rules

The server requires a matching field version, provider, native symbol and 1m timeframe, an active confirmed level identifier, an exact matching entry price, and a latest completed candle no more than 120 seconds old. A stale field, missing level or changed bounds rejects a new entry. Exits remain available independently of entry eligibility.

Paper entries are pending limit orders in the two Range Trader accounts. Units must be entered by Mark. The following are explicit v0.5 simulation assumptions, implemented but not yet trade-exercised or performance-validated:

- Reserve 1x virtual notional against starting cash plus closed gross P&L, less open and pending notional. Both paper long and short consume this reservation; this is a simulation convention, not broker margin eligibility.
- Evaluate only completed candles starting with the next full minute after placement. The partial placement minute cannot establish a later touch.
- Fill at the exact selected level only if a later candle spans it. Cancel a buy/long whose candle opens below its limit, or sell/short whose candle opens above, because an exact limit touch is not established by those gaps or marketable starts.
- Cancel if the field is replaced, required candles are missing, or the level breaks before an entry can be established. User cancellation releases the pending reservation.
- If an entry candle also reaches its stop, record the conservative same-candle stop. Do not assume favorable same-candle target ordering. Later candles use the existing paper bracket engine; when both stop and target are touched without an observable ordering, its conservative stop-first rule applies.
- Store field/level proof, confirmation time, request ID, source and fill model with the paper order. A fill candle identifies an OHLC interval, not an exact tick execution time.
- Results remain gross of fees, spread, slippage, funding and borrow costs. Those inputs and the fill rules must be frozen before measuring net trading performance. No one-minute USDC settlement claim is measured here.

Robinhood Buy drafts likewise require a confirmed field-local level and a limit price. Eligibility is checked again before and after the separate MCP preview request. Selling owned broker units is an exit and may use the existing exit draft options. The bridge still exposes account reads and previews only; no broker order is placed by this implementation.

The open game page refreshes its public chart, synchronizes levels, and in paper mode advances matching game orders at the selected 30s/60s cadence. Screenshot saving is optional. Hidden tabs skip this loop and closing the page stops it. This is not a persistent 24-hour worker. New screenshots retain completed field-local candles, liquidity method/parameters/levels, visibility, source cutoff, studies and field version; no decision API is invoked yet.

### Current observations and remaining acceptance

On October 7, the actual native game page displayed candles from the active field onward, a fixed field price scale and subsequently one eligible confirmed liquidity level. Switching the default overlay off hid its drawing while the entry requirement persisted. The page reported no console errors during those interactions. No paper entry, broker preview or live order was submitted to exercise this enhancement. No automated tests or performance study ran.

Next: specify the original 15m field formula, then explicitly validate the frozen paper rules with known candle fixtures and an agreed cost model before forecasting/outcome measurement. The decision API, automated trading, complete TradingView parity, customer cycles and actual settlement remain subsequent work.

### Active and expired levels — Range Liquidity v2

Mark's added rule: only live active levels can be used for entries. Each active level carries a small green dot tag; expired levels remain in their original BSL/SSL colors and line styles, without a green dot. The display retains expired levels from the current contiguous field-local data, ending their line at the completed candle that established expiry. No earlier-field history is loaded.

The existing completed-close invalidation remains the expiry rule: HIGH expires on a later completed close above its price; LOW expires on a later completed close below. Expiry time and reason are retained separately from confirmation time. Active and expired outputs are separate, and only active confirmed levels enter the selector and server eligibility check. The interpretation of “new” is still live/active; no first-touch-only restriction, age-based level expiry or one-trade-per-level policy is inferred. A wick touch alone does not expire a level under this current rule.

If the source snapshot is stale, green dots are removed and new entry choices are unavailable until refresh. Stale data is not relabeled as an observed market expiry. The overlay toggle hides both types of line and their tags together; entry restrictions continue. Captures and agent context carry status and expired records separately, so expired drawings cannot become an eligible level. Pending paper orders still evaluate causal candle ordering rather than retrospectively rejecting a touch that preceded the later expiry close.

This revision changes lifecycle output and presentation, not measured performance. No trade or automated test was submitted for this change.

## TradingView-style chart shell — v0.6

The game pane now follows the supplied TradingView reference more closely: compact market and interval controls, chart-style and indicators access, source/capture/account controls, Buy/Sell actions, a title/OHLC/volume header, the renderer's vertical drawing toolbar, range shortcuts, and a compact chart status strip. The game still presents exactly one locked 1m chart. Other timeframe buttons are visibly disabled; the 15m field is an overlay and setup control. The existing public-source selector, Robinhood account/draft panel, liquidity toggle, and capture cadence remain available in the top strip. Bottom date-range shortcuts change the visible window within loaded field data and never request earlier game history.

This is Quant Lab styling around the existing Vela chart engine. It does not become the TradingView application, its proprietary library, Pine Script, or full interaction/customization parity. TradingView marks and brand assets are not copied. The supplied screenshot remains the layout/style reference. Browser inspection at `http://127.0.0.1:8770/quant-lab.html?game=1` showed the 1m BTC-USD Coinbase chart, OHLC header, one chart, range shortcuts, and no console errors. No automated tests were run.

### Premium, equilibrium and discount field styling — v0.7

The frozen range uses faint red premium shading and faint teal discount shading, with a 2px red upper Premium line, 2px gold dashed Equilibrium · 50% midline, and 2px teal lower Discount line. Each line is labeled on chart. The fills stay in the background so candles, liquidity lines and other levels remain prominent. This is a presentation change only; the field bounds and entry rules are unchanged.

## Unified strategy entry — v0.8

Quant Lab and Range Trader now share one Trading page and one strategy selector; the old `?game=1` link is accepted and normalized to `?strategy=day` for compatibility. Select **1-hour trading** to open the 1h chart with the Quant Lab analyst team (Cleo for market research; Shammy for Elliott Wave structure), or **Day trading** for the 1m chart and the frozen 15m liquidity field (Cleo chat, field-scoped entries, and no six-chart analyst dispatch). Both modes use the same Vela chart engine and shared Range Trader SIM account selection. The day mode retains its active-level-only entry checks and account snapshot/order-preview boundary. This combines navigation and account selection; it does not imply live broker routing or measured agent performance.
