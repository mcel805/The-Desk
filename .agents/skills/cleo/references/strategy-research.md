# Systematic strategy research

Use this workflow to turn a trading idea into a reproducible paper/shadow strategy definition and a fair evaluation plan. A plausible narrative, favorable chart, or backtest summary is not evidence of a durable edge by itself.

## Freeze the rules before testing

Identify the hypothesis, strategy/version, market and dated contract or explicit continuous-series policy, venue/data source, timeframe, session/timezone, and decision cutoff. Specify deterministic or auditable rules for:

- Eligible opportunities and any regime/session filters.
- Setup/entry trigger, order type/reference, confirmation delay, and cancellation/no-trade conditions.
- Initial stop and structural invalidation, target/exit, trailing or break-even changes, time exit, and maximum holding period.
- Position sizing, tick/point value, risk limits, and how unknown balance/account state is handled.
- Fill model, limit-touch rules, latency, partial fills, spread, commissions, fees, slippage, and ambiguous intrabar ordering.
- Data quality, missing bars, roll adjustment, warm-up, and whether only completed bars are eligible.

Record every rule version and the time the rule became available. Keep alternative strategies in separate arms with separate identifiers. Do not change parameters after looking at the evaluation outcome and then report the revised result as if it were the original test.

## Design the evaluation

Use data with approved rights and a source manifest. Freeze the eligible cohort, outcome horizon, baseline and simple comparator, exclusions, primary metric, guardrails, sample target, uncertainty method, and decision rule before scoring. Use development observations for construction, held-out observations for evaluation, and untouched forward observations to assess durability. Prevent lookahead, survivorship, selection, and repeated-tuning leakage.

Use metrics that match the question. For a trading strategy, report counts and denominators alongside net outcomes after known costs; include drawdown and tail/clustered loss behavior, fill/no-fill rates, exposure, and sensitivity across material instruments, sessions, and regimes. Show gross and net values separately. If costs, fills, contract specification, or data provenance are unknown, state which conclusions cannot be measured. Do not translate a small sample or a favorable point estimate into a win-rate promise or validated edge.

Retain rejected, missed, invalidated, and unfilled opportunities as well as fills. Separate signal correctness, entry quality, execution assumptions, risk-rule adherence, and trade outcome. A trade ledger or strategy label does not prove its records are complete or authoritative.

## Research states and authority

Label each artifact as **idea**, **formalized**, **candidate implementation**, **historical simulation**, **shadow observation**, **paper forward study**, **independently reviewed**, or **human accepted** as applicable. Report who or what produced each state and what evidence supports it. A backtest is a historical simulation; it does not establish future performance or mean an agent ran the test.

Cleo may formulate the hypothesis and strategy rules, draft implementation or study specifications, analyze qualifying result packets, and propose the next experiment. Keep frozen measurement definitions and scientific acceptance with the designated Scientist/Lab workflow, independent challenge with the reviewer, and promotion or lifecycle authority with the designated human/system owner. Do not claim a role was dispatched or approved because a profile exists.

## Result summary

State the frozen question and version, source/cutoff/rights state, cohort and dates, rule and fill assumptions, metrics with raw counts and denominators, costs, uncertainty and subgroup limitations, deviations or data gaps, reviewer/human disposition, and the next decision. When the evaluation has not run or is unqualified, say **not measured** and identify the missing gate.
