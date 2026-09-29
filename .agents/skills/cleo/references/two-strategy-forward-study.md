# Two HTF-entry strategies: registration, research and forward study

Registered from Mark's instructions on 2026-09-29. Both are paper/shadow hypotheses, not established edges. The strategy families are registered; the protocol below is a draft until unresolved parameters and data readiness are frozen. No order, fill, watcher, result or expert-level performance is implied by writing this document.

## Strategy register

| Field | A — confirmed reversal | B — HTF first touch |
|---|---|---|
| ID | `A_confirmed_reversal` | `B_htf_first_touch` |
| Origin | Selected confirmed 1H or 30M level | Same selected confirmed HTF opportunity |
| Entry | HTF interaction, then confirmed 1M trend change and fresh qualifying 1M long liquidity level; subsequent return to that exact agreed level | Predeclare a limit reference at the selected HTF entry line/edge before its first eligible touch; no A-style 1M confirmation |
| Potential benefit, unproven | Avoid some failed reactions; later structure may permit tighter protection | Earlier price may leave more reward distance and capture bounces A misses |
| Potential cost, unproven | Delay, missed bounce, no retest or poor room after confirmation | Entering before reversal evidence, adverse selection, continuation through the level, possibly wider structural stop |
| Risk | Relevant blue structural stop, <=40 ticks including buffer; preferred/default 30, usual 25–35 | Same absolute 40-tick cap; 36–40 also requires fit to fixed dollar budget |

Mark described B as greater reward and greater chance of a stop. Record that expectation as the hypothesis to test. Earlier entry does not guarantee better R after a wider stop or costs. A lower stop-out rate would not alone establish better economics for A. A/B and the direction-only 1M fallback must remain separate. His latest risk reply supersedes the earlier 35-tick ceiling: "no more then 40 ticks ever target is 30 ticks average is 25 to 35 ticks". Interpret 30 here as the stop-size goal, not a take-profit target, unless corrected. He subsequently specified "1 contract for now until balance is 1K". Both arms therefore use one MYM for this cohort; the balance threshold prompts a sizing review, not automatic scaling. Current balance, all-in dollar ceiling and costs remain unknown.

The current long case is the initial study scope. A mirrored short definition is a future separately frozen rule; do not add short samples automatically.

## Research conclusions and their limits

- Osler's NY Fed studies provide evidence that support/resistance can coincide with reversals and that crossed levels can accompany accelerating continuation in currency markets. This motivates recording both rejection and continuation; it does not validate Batty zones, MYM, first touch, or the relative win rates of A/B. Do not infer actual clustered stops from chart colors.
- CME's position-sizing material connects a logical stop with a dollar-risk budget. MYM's minimum outright tick is one index point worth $0.50. Larger stops require lower quantity to preserve the same planned budget; margin is a separate constraint.
- TradingView documents confirmation delay, plotting pivots into the past, and simulator assumptions about limit fills. The zone origin candle is not the signal-availability time; touching a plotted price is not proof of an executable fill.
- Bailey et al. show the problem of strategy selection after many historical trials. Freeze one initial A/B comparison; record every trialled variant and use new untouched periods for changes. A single holdout or one profitable week is not a cure for repeated tuning.
- NIST's Wilson interval supports reporting uncertainty around a binary proportion under its assumptions. Trading observations can be dependent; report counts and session clustering, rather than treating every nearby touch as an independent trial.

These sources establish mechanics and study hazards. They do not establish either user's strategy as profitable. Learning expertise requires prospective evidence, error review and reproducible measurement, not adopting an expert persona.

## Shared ceiling, one contract and actual dollar exposure

Current executable paper cohort uses one MYM and <=40 ticks, a gross price-stop ceiling of $20 per attempt, not a guaranteed all-in loss limit. Actual exposure varies with each structural stop. Freeze any all-in `D` = maximum planned loss per attempt in dollars, plus a separate aggregate/session cap. For simple per-contract costs:

`loss_per_contract = stop_ticks * 0.50 + round_turn_fees + declared_adverse_execution_reserve`

`quantity = floor(D / loss_per_contract)`

Use actual fixed/per-order fee terms when applicable instead of this simplified formula. Cap the formula's result at Mark's current one-contract limit; it is a feasibility check, not authority to scale. Quantity must fit margin/position limits. If quantity is zero, log `SKIP_RISK_INFEASIBLE`. Never bring invalidation closer merely to fit D. Costs/reserves must be fixed before scoring net economics; zero fees is not a default. The reserve is a planning assumption, not a guaranteed worst loss; report losses beyond the planned budget from adverse execution separately.

Before costs: one MYM at 25/30/35/40 ticks risks $12.50/$15/$17.50/$20 respectively. Widening one contract from 30 to 40 adds $5 gross risk even though it respects the ceiling. Reducing quantity below one MYM is impossible. The latest quantity and tick rules establish the gross $20 ceiling; they do not establish an all-in $20 budget. More than 40 ticks is excluded. Compare equal deployed risk only in a separately declared matched-stop analysis; do not mislabel the main structural-stop comparison as exactly equal risk per trade.

## Proposed forward-test design: `mym-ab-htf-v0.1-draft`

### Freeze before the first scored event

1. **Identity/data:** dated MYM contract and roll policy; verified authorized input/retention; indicator version/hash/settings; actual 1H/30M and 1M zone definitions; bar/session/timezone conventions; source and detection times. Continuous-chart screenshots are illustrative, not a tick-level execution feed.
2. **Candidate inventory:** predeclare all selected eligible 1H/30M long levels before approach. Record every candidate and exclusion. Do not pick the level only after it bounced. Record zone bounds, exact entry line/edge, origin, `available_at`, prior zone interactions and prior entry-line touches since availability. Proposed B baseline: first post-availability touch of the predeclared entry line; box touches are separately tagged. If Mark instead wants first zone-edge touch, freeze that as a different rule before collecting.
3. **Freshness and duplicates:** define whether a prior box visit excludes a candidate. Record both first zone interaction and first entry-line touch even when eligibility is line-based. Merge overlapping 1H/30M candidates into one event with confluence tags and a predeclared anchor; do not double the sample. Retests of the same zone are not new first touches. Late snapshots with unknown lifecycle are `FRESHNESS_UNKNOWN`, not assumed fresh.
4. **A mechanics:** freeze swing/pivot confirmation timing and zone class/boundary. Proposed completed-close-above-last-lower-high plus confirmed higher-low test remains pending. No entry before both reversal and fresh-zone availability. No retest = `NO_FILL`, not a market chase. Record how much movement occurs during confirmation delay.
5. **Risk/exit:** D, per-session cap, size limit, fees/reserve, stop structure and exact buffer, latest absolute-40/preferred-30/usual-25–35 rule, target rule, minimum room, expiry and catalysts. Tag 36–40 stops separately for descriptive review; never optimize their subgroup after outcomes or widen an existing stopped trade in hindsight. No >40-tick entry is eligible.
6. **Shared target/horizon proposal:** map the nearest confirmed opposing HTF reference before the opportunity starts and freeze it for both arms. Log nearer 1M obstacles at each entry. Proposed pilot uses entry-ready net reward/risk >=1.5 to the common target, no partial exits or break-even adjustments, candidate expiry at 30 minutes after first HTF interaction, and position exit at 30 minutes after each fill or the declared session close, whichever is earlier. These are test controls, not Mark-approved values or proven optimal settings. Both arms get the same holding duration; also report a common-clock diagnostic at 30 minutes after interaction, marking positions at that cutoff without changing actual primary exits.

Mark later asked to explore full exits near opposing structure and confirmed 1M higher-low trailing for countertrend first-touch trades. Keep those as separately versioned exit-management variants under `trade-management-learning.md`. They do not retroactively alter this frozen A/B entry comparison, its common target, or its no-break-even baseline.
7. **Session proposal:** cash-session morning window 06:30–10:00 America/Los_Angeles, converted using exchange timezone/calendar. No carry beyond declared session close; define early-close handling. Proposed new-entry blackout is 5 minutes before through 5 minutes after preregistered scheduled high-impact releases, identically for both arms; retain excluded candidates and event tags. Record already-open positions; do not invent a news-time exit. Overnight and later sessions form separate future cohorts.

### Collect and resolve

- Run two independent hypothetical books on the same chronological input and same candidate inventory. Neither book may use information unavailable at its decision time. One attempt per event per arm; no averaging, pyramiding, repeat stop-outs or discretionary rescue in the pilot. One open position per arm; later candidates remain in the inventory as `SKIP_OPEN_POSITION`. The two-book comparison is not authorization to deploy two risk budgets simultaneously.
- Record the paper-plan creation time before any claimed entry. Require subsequent chronological executable evidence; model long limit fills using ask <= limit after activation when quotes exist, but still label simulator fills as queue-uncertain. With trades only, predeclare a conservative one-tick trade-through rule for limit fills (not exact-touch fill); do not claim it reproduces queue execution. A gap does not guarantee the stop price. Short fill logic, if later studied, must be separately defined.
- Prefer licensed ticks/quotes or a verified paper simulator. One-second OHLC can still be ambiguous. If only 1M OHLC exists and entry/stop/target sequence is unknowable, mark `AMBIGUOUS`. Do not resolve it favorably. Show a pessimistic/optimistic bounds analysis separately; if a data gap cannot support bounds, report it as unscored. Do not insert an ambiguous result as zero.
- Store event time, availability, received/detected time, paper-plan activation and paper fill/exit time separately. Retain the raw source/hash, inference labels, exclusions, cancellation, stop/target changes, and manual deviations. Corrections append to the ledger; original hypotheses stay unchanged. Screenshots supplied after a move may illustrate the method but do not become forward samples retroactively.
- Close each event with a disposition for both arms: `TARGET`, `STOP`, `TIME_EXIT`, `NO_CONFIRMATION`, `NO_RETEST`, `NO_FILL`, `SKIP_RISK_INFEASIBLE`, `SKIP_ROOM`, `SKIP_OPEN_POSITION`, `INVALIDATED`, `AMBIGUOUS`, `DATA_GAP`, or `UNRESOLVED`, with reason. Known no-trade events earn zero in policy economics; missing/ambiguous outcomes remain missing and affect coverage.

### Score the policy as well as the trades

Primary proposed comparison: mean paired difference `net_dollars_B - net_dollars_A` per eligible HTF event at one MYM each, including known nonentries as zero. Both arms share the 40-tick gross ceiling but may deploy different stop risk. Also report each arm's event-level mean versus zero; B merely outperforming a losing A is not evidence B is worth adopting. If reporting normalized values, use a declared common reference such as the $20 gross ceiling and label it as such, not as actual trade R or all-in budget. Log spent risk and returns per filled trade separately. A pair is scorable only when both arms' outcomes/nonentries are known.

Secondary: net dollars/session; average/median trade R using each actual frozen planned loss including costs; fill/participation rate; stop-out rate per fill; win/target rate with explicit denominators; profit factor; chronological maximum drawdown and loss streak; MAE/MFE in ticks/dollars/R; time underwater; time-to-target; missed-bounce rate, defined as common target reached by event expiry before A had an executable fill. Track paper gaps beyond D and how often each arm is risk-infeasible.

Record MAE/MFE to the recorded exit and a separate fixed event horizon for nonentries; do not label post-exit excursions as trade MAE/MFE. Full path required. Keep 1H/30M, trend-aligned/countertrend, volatility, session and event tags descriptive until sample sizes and subgroup questions are preregistered. Do not merge indicator attraction percentages with reversal/trading success.

### Pilot and later evidence

Proposed pilot: freeze the next 20 complete eligible trading sessions and record all opportunities. Ten-session extension blocks may be predeclared only for insufficient technical coverage, not because P&L disappoints. Daily review checks completeness; weekly review checks integrity and explains errors without changing scored rules. Twenty sessions are for feasibility and measurement, not proof of edge.

For a subsequent untouched confirmation block, estimate required session count from pilot day-level variance and a declared smallest meaningful effect; set the count and maximum duration before starting. Use paired day-cluster resampling for event-level differences and report its dependence limitations; Wilson intervals for fill-level binary rates are descriptive and may understate uncertainty under clustering. Do not treat '100 trades' as automatically sufficient. Avoid repeated significance peeking or stopping when profitable.

Proposed research decision: investigate a strategy further only if its absolute net event expectancy and the paired comparison withstand cost/fill stress, missing-outcome bounds and session-level uncertainty, without hidden risk-budget violations. Positive point estimates or a high win rate alone do not promote a method. A rule change starts a prospective version; independent review is a required later governance step, not an already dispatched reviewer.

## Existing lab and activation

The inspected `liquidity-lab/protocol-v0.1.json` is a separate one-virtual-contract, fixed-30-tick, first-touch experiment across several timeframes, with target and 20-source-bar expiry rules. It contains placeholder fees. Its results cannot validate this paired A/B protocol, and it must not be overwritten to make them appear equivalent. The lab Pine recorder has local pivot defaults 14 external / 5 internal; installed settings must be verified. HTF indicator percentage labels concern attraction/sweep in the existing protocol, not these entries' win rates.

At 2026-09-29 inspection the MYM feed reported stale/delayed historical bars and the local lab health endpoint was unreachable. Recheck before activation. Manual prospective logging is possible from authorized current evidence; economic scoring still needs adequate chronological execution evidence and costs. No continuous watcher or scheduled run is established by this skill update.

## Primary sources, accessed 2026-09-29

- [CME Micro E-mini FAQ](https://www.cmegroup.com/articles/faqs/micro-e-mini-equity-index-futures-frequently-asked-questions.html) — MYM tick specification.
- [CME Proper Position Size](https://www.cmegroup.com/education/courses/trade-and-risk-management/proper-position-size) — logical stops and dollar-risk sizing.
- [Osler, NY Fed Staff Report 125](https://www.newyorkfed.org/research/staff_reports/sr125.html) — currency order clustering and reversals/continuation; external validity limited.
- [Osler, NY Fed Staff Report 150](https://www.newyorkfed.org/research/staff_reports/sr150.html) — currency stop-loss cascades; not MYM strategy evidence.
- [TradingView Repainting](https://www.tradingview.com/pine-script-docs/concepts/repainting/) — signal availability and historical plotting.
- [TradingView Strategies](https://www.tradingview.com/pine-script-docs/concepts/strategies/) — fill assumptions and execution limits.
- [Bailey et al., The Probability of Backtest Overfitting](https://www.davidhbailey.com/dhbpapers/backtest-prob.pdf) — multiple-testing and selection risk.
- [NIST Confidence Intervals](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm) — Wilson proportion intervals.
