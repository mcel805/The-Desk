# The Trader — Product Discovery v0.1

## 1. Working definition

The Trader is a multimodal personal trading-research and decision system. It observes a trader's market context, screenshots, chart recordings, trade plans, actions, fills, and post-trade reflections; reconstructs the full session into eight comparable sub-sessions; learns a provisional model of the trader's style; converts that model into versioned hypotheses and executable specifications; and measures whether those specifications are repeatable and economically viable.

The long-term objective is a statistically defensible automated trading system. Automation is an outcome to be earned, not the starting feature.

## 2. Product promise

The Trader should make the trader's process more explicit, measurable, and falsifiable. It should surface uncertainty and disconfirming evidence as readily as it surfaces attractive results.

It should never promise profitability, infer a durable edge from a small sample, or label simulated results as live results.

## 3. Core user and first use case

Initial user: one discretionary futures trader who wants to understand and formalize their own process before automating it.

First use case (updated September 9, 2026): use actual broker records for trade execution and performance, and screenshots to study the trader's top-down liquidity-zone selection. The trader reports determining market structure, bias, and draw from the daily timeframe down to a one-minute entry. This replaces the earlier suggested 60m/30m context and five-minute baseline. Intermediate timeframe roles and exact entry rules remain to be learned, not imposed. Eight sub-sessions remain an organizational aid where boundaries are supported, not eight independent statistical samples.

The current research brief is [Top-down liquidity style study](../research/upload-data-1/STYLE-STUDY.md).

The first release should optimize for trustworthy learning, not instrument breadth.

## 4. The learning loop

```text
Observe → describe → hypothesize → specify → replay/backtest → forward test
   ↑                                                        ↓
   └──────── review evidence, revise, or reject ────────────┘
```

The model may help at every step, but each step must retain its source data, assumptions, rule version, and human review state.

### What Astra should do

- extract candidate patterns from structured records and trader notes;
- ask targeted questions when a rule is ambiguous;
- propose a plain-language style profile and a machine-readable rule draft;
- identify contradictions, missing fields, regime changes, and likely overfitting;
- generate test plans and explain results in plain language;
- recommend the next evidence-gathering step.

### What Astra must not do

- silently save a proposed rule as an approved rule;
- claim that a backtest proves future profitability;
- choose live risk limits without explicit human approval;
- place or modify real orders during discovery;
- use model confidence as a substitute for statistical evidence;
- fill missing market, fill, commission, or slippage data with invented values.

## 5. System boundaries

Keep these layers separate from the beginning:

1. **Source data** — market data, orders, fills, fees, positions, account statements, screenshots, and trader notes.
2. **Reconciliation** — identity, timestamps, time zones, duplicate detection, and broker-authoritative fill truth.
3. **Style model** — a versioned description of instruments, sessions, context, setup, entry, stop, target, management, exclusions, and psychology/discipline signals.
4. **Research engine** — replay, backtest, scenario analysis, and parameter-sensitivity tests.
5. **Forward-test ledger** — immutable predictions/signals and realized outcomes, separate from historical backtests.
6. **Risk gateway** — position sizing, max loss, daily stop, exposure, stale-data checks, duplicate prevention, and kill switch.
7. **Execution adapter** — initially absent; later isolated behind explicit approval, paper trading, assisted execution, and only then possible unattended execution.
8. **Measurement and audit** — every result links to data version, rule version, cost assumptions, and run configuration.

TradingView may be a chart or signal-input layer. The broker/platform that fills an order is the authority for actual fills, commissions, slippage, realized P&L, orders, and positions.

## 6. Research questions before implementation

### Trader and behavior

- What decisions are repeated across trades?
- Which decisions are rules, and which are discretionary judgment?
- What does the trader explicitly refuse to trade?
- What information was available at decision time, versus learned later?
- Which behaviors are stable across instruments, sessions, and market regimes?

### Data and execution

- What is the authoritative source for market bars and for fills?
- Are timestamps exchange time, local time, or broker time?
- Can historical data represent the information available at the time without look-ahead?
- What fees, commissions, spread, slippage, rejected orders, partial fills, and latency must be modeled?
- How will contract rolls, session boundaries, holidays, and missing bars be handled?

### Validity

- What is the unit of analysis: trade, setup, session, day, or strategy version?
- How large must the sample be before a result is decision-relevant?
- What is the holdout period and what data is never used for tuning?
- How will multiple hypotheses and repeated tuning be recorded?
- What minimum performance and robustness thresholds justify moving stages?

## 7. Measurement plan

Every test must report more than a win rate. At minimum, capture:

- number of eligible setups, taken trades, rejected trades, and missing-data cases;
- gross and net P&L, net R, expectancy per trade, median R, and payoff distribution;
- win rate, average win/loss, profit factor, and cost-adjusted profit factor;
- maximum drawdown, drawdown duration, losing streaks, daily loss concentration, and exposure;
- slippage and commission sensitivity;
- results by session, direction, setup subtype, volatility regime, and instrument;
- in-sample, validation, holdout, and forward-test results;
- parameter sensitivity and performance degradation under adverse assumptions;
- confidence intervals or bootstrap ranges, with the method and assumptions recorded.

No single metric is a gate by itself. A candidate advances only when performance is positive after realistic costs, does not depend on one narrow parameter choice, survives untouched data, and remains operationally safe.

## 8. Staged scope

### Stage 0 — research charter

Define the trader, instrument, session, data sources, terminology, safety constraints, and the exact first setup. Deliver a glossary, data dictionary, decision log, and acceptance criteria.

### Stage 1 — evidence capture

Import broker-authoritative statements/fills, market data, trade plans, and post-trade notes. Reconcile records and show provenance. No signals and no orders.

### Stage 2 — style profiler

Generate a proposed style profile from evidence. Show source examples, confidence as uncertainty—not truth—and unresolved questions. The trader explicitly approves each rule version.

### Stage 3 — research engine

Run deterministic replay/backtests with realistic costs, bounded date ranges, no look-ahead, and reproducible configurations. Persist every run and result.

### Stage 4 — forward testing

Record time-stamped signals and hypothetical actions prospectively. Compare predictions with later market and broker results without changing the historical record.

### Stage 5 — controlled assistance

Paper trading, then guide/approval mode. A risk gateway can reject unsafe actions; the human remains the execution authority.

### Stage 6 — automation review

Only after sufficient independent evidence, operational rehearsal, and explicit approval should unattended execution even be considered. The system must retain a kill switch and a rapid rollback path.

## 9. Deliberate non-goals for v0

- multi-market optimization;
- autonomous live execution;
- a chatbot that gives unlogged trade advice;
- a strategy marketplace or social leaderboard;
- a claim that model-generated rules are profitable;
- replacing broker records with chart-platform estimates;
- tuning on all available history and calling the result validated.

## 10. Initial acceptance criteria

The discovery phase is complete when:

1. one setup has an unambiguous written specification;
2. every required input has an identified source and timestamp policy;
3. a sample of trades can be reconciled from source records to the internal ledger;
4. a model-generated style profile shows evidence and unresolved ambiguity;
5. a deterministic test can be rerun and produce the same result;
6. the measurement report separates in-sample, holdout, and forward results;
7. the team can explain why the evidence is insufficient or sufficient for the next stage;
8. no component can place a real order in the discovery build.

## 11. Immediate next decisions

Before writing the product architecture, decide:

- primary instrument and contract;
- trading session and time zone;
- first setup name and plain-language definition;
- market-data source and broker/fill source;
- historical date range and minimum sample target;
- initial risk unit and cost/slippage assumptions;
- whether the first interface is a local desktop tool, local web app, or research notebook workflow.

The recommended next artifact is a multimodal session schema and one-page research charter for one setup, followed by a small reconciled dataset and a deterministic replay—not a live bot.
