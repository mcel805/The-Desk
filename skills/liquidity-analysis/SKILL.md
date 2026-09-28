---
name: liquidity-analysis
description: Produce versioned liquidity assessments from user market snapshots and the Batty indicator, combining provisional Elliott context with conditional level-to-level scenarios and measurable forward tests.
---

# Skill 2: Liquidity Analysis

Preserve original inputs byte-for-byte; inventory SHA-256, symbol, timeframe, visible clock, uncertain capture date, current versus hovered prices, and analysis version. Never substitute order graphics for broker fills. Do not silently synchronize snapshots from different times or contracts.

Read big swing extremes before internal levels. Mark inferred buy-side liquidity above highs and sell-side below lows. Separate observed breaks/reclaims from hypotheses about trapped participants. Candles cannot establish deliberate inducement or actual stop inventory. Discount/premium describe range position, not automatic demand/supply or trade signals.

Report structure, location, next opposing level, confirmation, invalidation, alternative and no-trade conditions. Retain one MYM and the user's 30-tick maximum baseline; structural stops wider than the cap require a different confirmed entry or no trade. Never increase contracts automatically. Trading costs and timeframe are separate variables.

Use Daily Elliott analysis as provisional context; use requested 1H structure for execution planning and lower timeframes only when supplied. Do not force Elliott subdivisions. When making a second slide, preserve the first and overlay exact price-aligned vector annotations over its unchanged chart. Label asynchronous sources.

Freeze scenarios before future bars are revealed. Log first-touch ordering, expiry, ambiguity, adverse/favorable excursion, costs and broker outcomes. Compare external versus internal levels and planned target versus actual exits using independent out-of-sample sessions. Report expectancy and uncertainty, not only win rate. No claim of statistical edge or positive daily returns without evidence.

Review `references/indicator-audit.md` before interpreting Batty percentages. Share concise evidence and conclusions, not private internal reasoning. Cite only actually reviewed educational material. Never claim full video/transcript mastery from titles or search snippets.

## Mark's current execution playbook and trade journal

Treat the playbook below as Mark's current stated approach and a research hypothesis. It is not a validated profitable system. Preserve later corrections as dated revisions; do not silently turn one day's example into a permanent rule.

### Preferred level-to-confirmation approach

- Mark says he generally prefers liquidity levels mapped from the 30-minute or 1-hour charts. His supplied chart key is yellow = 15-minute, purple = 30-minute, and orange = 1-hour. Apply that color key only when Mark identifies it for the chart; colors are not universal conventions.
- His preferred sequence is: establish higher-timeframe context; let price reach or interact with a selected 30-minute/1-hour level; move to the 1-minute chart; wait for his directional confirmation of a reversal; then document the entry decision. A level touch by itself is not confirmation and does not establish that price must reverse.
- Mark has not yet defined a precise, repeatable 1-minute confirmation rule. If it is missing, record `confirmation criterion unspecified` or `not documented`; do not invent a candle pattern, claim confirmation occurred, or score rule adherence as known.
- If the preferred 30-minute/1-hour level is absent and Mark instead trades the higher-timeframe directional bias using 1-minute liquidity levels, record it as a separate `fallback / not validated against preferred setup` method. Do not blend its results with the preferred level-reaction cohort or imply it is equivalent.
- Record session phase and observed volatility, including the opening period when relevant. Mark's observation that the first hour can be unusually volatile is a hypothesis to track, not a universal market fact. Compare the planned stop with the setup's stated invalidation and contemporaneous volatility; do not use a later reversal alone to conclude that a stop was wrong.
- Keep the existing one-MYM and 30-tick maximum baseline. If the structure requires a wider stop, document that the baseline and setup conflict; do not widen the stop or increase size automatically. A level touch, directional bias, or favorable target ratio alone is not an entry signal.

### Required journal entry for every trade Mark reports

Create one durable, screenshot-backed journal entry for every distinct trade Mark reports, including a stopped trade. Repeated screenshots, bracket edits, and partial fills for the same position are evidence for one trade record, not automatically separate trades. Update an existing record when later evidence reconciles it; preserve the original pre-trade snapshot and earlier uncertainty.

Use the evidence labels `observed`, `user-reported`, `inferred/calculated`, and `unknown/not reconciled` for material facts. A user statement can establish the stated account classification or starting balance, but it does not independently verify a broker fill. Broker/platform execution history is the source of truth for fills, commissions, slippage, and realized P&L. A chart marker or a working-order screen is not a fill record.

The entry must include:

1. **Identity and source:** trade/session ID; trader; account name or masked identifier; broker; live, demo, or paper classification and its evidence; instrument; exact dated contract versus continuous symbol; session/timezone; source filenames; visible capture times; chart timeframe; and missing source details. Never expose credentials. Preserve supplied originals and record SHA-256 when tooling permits.
2. **Pre-trade thesis:** higher-timeframe bias; selected liquidity level and its source timeframe; user's provided color key where applicable; whether this is the preferred 30-minute/1-hour setup or the separate fallback; planned direction, entry type, stop/invalidation, shared target(s), size, and intended 1-minute confirmation. Distinguish resting/pending orders from filled positions.
3. **Before chart:** include the original 1-minute chart immediately before entry when supplied. Add higher-timeframe context charts when supplied. Preserve originals unchanged; annotations must be separate overlays/copies. If evidence is missing, show `not supplied` rather than recreating it.
4. **Execution and management:** actual entry/exit fills, quantities, timestamps, order type, stop/target changes, partial fills, and broker-reported costs when available. Keep planned levels separate from actual fills. If execution is inferred from chart annotations, label it provisional and state exactly what remains unreconciled.
5. **After chart:** include the original 1-minute chart after exit when supplied, with capture time and any visible entry/exit markers described as chart evidence. Do not let the later price path rewrite what was knowable before entry.
6. **Outcome and account:** points, gross P&L, costs, net P&L, and R only when the inputs support them. State the contract multiplier/source and formula for calculations; leave net P&L unknown if costs are unavailable. Keep starting balance, verified ending balance/equity, buying power, margin, and open trade equity (OTE) as separate fields. A screenshot labeled `purchasing power` must never be relabeled as account value/equity. Calculate a post-trade balance only when all intervening deposits, withdrawals, fees, and other activity are reconciled.
7. **Review:** separately assess setup quality, execution/rule adherence, and outcome. Record whether the HTF level reacted, whether the defined 1-minute confirmation appeared before entry, what invalidated the thesis, stop placement relative to that invalidation and session volatility, maximum adverse/favorable excursion when evidence supports it, and Mark's stated lesson or emotional notes. Unknown confirmation or fills remain unknown; a loss or later reversal alone does not prove the decision was good or bad.

### Journal deliverable and safety boundary

- When filesystem output is available, save a self-contained local review page at `count-dashboard/output/trading-journal/YYYY-MM-DD-<instrument>-<trade-id>/entry.html` with the before and after 1-minute charts side by side, concise trade fields, review, evidence labels, and links/embeds to unchanged originals. Keep supporting screenshots in the same folder. Generated output remains local and excluded from the Git baseline unless curated.
- Record historical trades Mark reports, including a user-reported live-account trade, as passive journal evidence only. Do not route, place, modify, or cancel live orders; do not claim account access. Do not put screenshot-derived or unreconciled fills into a paper-trade table or a broker-reconciled execution ledger. Use an actual-execution import only when the journal's supported source and required fill evidence are available; otherwise retain a clearly labeled provisional review entry and name what would reconcile it.
- Do not claim a strategy edge from an isolated trade or a small sample. Preserve outcomes for later cohort analysis, including setup type, timeframe, session phase, confirmation status, volatility context, planned risk/reward, actual costs, and uncertainty. Report measured results only when trades are deduplicated and execution data, sample boundaries, and costs are defined.
