# Indicator as a Service: collaborative Lab experience

**Status:** design proposal, 2026-09-30

**Scope:** research experiments and paper/shadow outcomes only

**First pilot:** Liquidity signal measurement, followed by a target/stop economics experiment

## Product contract

The user can bring the Lab any *well-defined* trading research question. The Lab helps turn the question into a versioned experiment: identify the eligible observations, establish a measured baseline, propose one change, freeze the method, collect untouched forward evidence, and review the result. The user can discuss and revise a draft freely. Registration freezes the question and measurement rules for that cohort; a material change creates a new version.

The Lab supports several study families through one shell:

| Study family | Example primary question | Observation unit |
| --- | --- | --- |
| Indicator signal | Did a Liquidity trigger predict the declared future event? | Eligible signal opportunity |
| Target/stop economics | Did a proposed target or stop rule improve net paper R? | Eligible triggered paper trial |
| Filter or confirmation | Did a confirmation rule improve outcomes without unacceptable coverage loss? | Eligible pre-filter opportunity |
| Timing or session | Did a frozen timing rule improve the same outcome in a specified session? | Eligible setup or session |
| Descriptive tool | Does the output match an independent reference within tolerance? | Eligible reference event |

Every study has a declared purpose, source rights, unit, cohort, baseline, candidate, primary outcome, uncertainty method, guardrails, and review gate. The Lab may display many descriptive measures, but only the preregistered primary measure decides whether the candidate advanced. Indicator signal reliability and paper trade economics remain separate studies. A target/stop experiment does not silently change the Tool Belt probability badge.

## User journey

1. **Ask.** The user tells the Lab a question in ordinary language. The Lab creates a draft with the likely study family and asks only for missing choices that would change the method.
2. **Qualify.** The Lab checks data identity and rights, dated contract, timeframe, session clock, bar/tick resolution, costs, completeness, cutoff, and available baseline observations. It shows `NOT MEASURED` when the inputs are absent.
3. **Baseline.** The Lab calculates descriptive measures from frozen, pre-outcome plans and eligible resolved observations. Each number shows its denominator, date range, source, version, and units. It includes unresolved and excluded counts.
4. **Explore.** The user can compare candidate rules on development data. These results are labeled exploratory and never overwrite the baseline or become a validated score.
5. **Register.** The Chief Scientist freezes one candidate change, eligibility, outcome, minimum useful effect, sample/interval plan, costs, and guardrails before the locked or forward cohort begins.
6. **Run.** The Lab records all eligible opportunities, signals, abstentions, forecasts, and outcomes append-only. The same opportunity set is used for incumbent and candidate comparisons. Ambiguous or missing paths remain visible.
7. **Review.** The Lab Testing Specialist reproduces the measures; the Chief Scientist interprets them; an independent reviewer checks the claim. Human chart validation and Firstmate lifecycle gates apply when connected. A role prompt or dashboard state alone does not prove dispatch.
8. **Decide.** Retain, investigate, quarantine, advance, or revert. The user sees the result, uncertainty, negative findings, and the next proposed experiment. No code or Tool Belt score is promoted solely by an exploratory backtest.

The experience should show a conversation beside a persistent experiment draft. Its status progresses through `DRAFT → SOURCE QUALIFIED → BASELINE READY → REGISTERED → COLLECTING → SCORED → REVIEWED`. A source or outcome defect yields `BLOCKED` or `QUARANTINED` with a reason. The conversation may propose experiments; the durable protocol and evidence ledger are the authority.

## Target and stop example: the baseline report

The first baseline is descriptive. It reports what the frozen plans specified and what eligible paper paths actually did. It must not choose a new target or stop from the same outcomes and then present that choice as proven.

For each eligible plan, preserve `entry`, `target`, `stop`, direction, contract, tick size source, plan time, method version, signal/zone ID, expiry, source cutoff, and whether the trigger was reached. Use an absolute distance divided by the verified contract tick size. The target must be on the favorable side and the stop on the adverse side of entry. Reject invalid geometry; do not repair it by inference.

| Baseline measure | Formula or meaning | Denominator and disclosure |
| --- | --- | --- |
| Mean planned target | Mean of `abs(target − entry) / tick_size` | All eligible frozen plans with valid geometry, including no-touch plans; report `n`, median, IQR, and missing count. |
| Mean planned stop | Mean of `abs(entry − stop) / tick_size` | Same plan cohort and disclosures as the planned target. |
| Mean planned reward/risk | Mean of each plan's `target_ticks / stop_ticks` | Valid plans only. This is not the ratio of the two cohort means and is not expectancy. |
| Target-before-stop rate | `target / (target + stop + post-touch timeout)` | Eligible touched and resolved forecasts under the frozen expiry rule; show no-touch, ambiguity, data gaps, and unresolved cases separately. |
| Mean realized gain and loss | Mean modeled/recorded **net** result among positive and negative resolved paper trials, separately | Triggered, resolved paper paths with disclosed execution and cost assumptions; distinguish modeled exits from actual recorded paper fills and broker fills. |
| Mean and median net R | Per-trial net result divided by its frozen planned risk, then averaged | Triggered, resolved paper trials with valid risk and costs. Report timeouts and exclusions. Also show per-eligible-opportunity economics with no-touch cases accounted for explicitly. |
| MFE and MAE | Maximum favorable and adverse excursion over the active hypothetical trial, measured in ticks and R | Only paths with adequate chronological bars/ticks. Outcome labels alone cannot reconstruct excursions or the order of target and stop inside one bar. |
| Time to outcome | Elapsed bars/time from trigger to target, stop, or expiry | Resolved triggered trials; use the declared market/session clock. |

Means answer the user's average question. Medians, IQR/percentiles, and session-level uncertainty show whether a few outliers dominate. Averages must remain separate by asset, dated contract/roll policy, timeframe, strategy, direction, session, and method version; any aggregate must show its mixture and component results. If source rights, tick size, costs, or paths are missing, show the affected metric as `NOT MEASURED` with the missing field rather than a guessed number.

As inspected on 2026-09-30, the local `liquidity-lab/data/liquidity-lab.sqlite3` has **zero** rows in `trials`, `trial_outcomes`, `scientist_daily_forecasts`, `scientist_forecast_outcomes`, `market_bars`, and `market_ticks`. There is therefore no measured target or stop average to publish from this Lab today. This is a point-in-time local observation, not a claim about external systems or future records. The database remains private and excluded from Git.

## Testing a target or stop change

The Lab first freezes the existing target/stop rule as the incumbent. On development data, the user and Scientist can inspect target reach, stop reach, MFE, MAE, timeouts, and economic tradeoffs. The candidate changes one rule at a time, subject to the relevant strategy's structural invalidation and risk limits. A historical average MAE does not automatically become a valid stop.

The replay engine must use the same preselected trigger inventory and chronological source path for both versions. Changing target or stop can change outcome order, timeout mark, costs, and signal coverage; a stored `target`/`stop` outcome label cannot be re-used as the counterfactual outcome. A longer or shorter hypothetical holding period can also change which later signals a one-position paper portfolio could take. Measure setup-level counterfactuals on the common opportunity inventory first; treat portfolio-level availability as a separate, explicitly modeled paper outcome. If target and stop both lie inside one bar and finer data cannot resolve order, apply the preregistered ambiguity rule. If execution costs are unknown, report gross research geometry and mark net economics unavailable.

The primary comparison should be the preregistered paired difference in **net R per eligible triggered opportunity**, with target-before-stop rate and coverage as secondary measures. Report a session-cluster uncertainty interval, daily/weekly breakdown, and material subgroup harm. Choose the sample and minimum useful effect before the locked evaluation, preserve every tried candidate, and confirm the proposed gain on untouched forward sessions. Time-ordered partitions prevent future information entering model selection; repeated candidate searches require a fresh evaluation window or a declared multiple-testing plan.

## Indicator-wide score

The current Tool Belt `50% / 50%` badge is a display placeholder. The first Liquidity pilot can measure confirmed external-zone first-touch reactions, but that pilot result cannot be relabeled as an all-signal indicator score. The eventual indicator-wide card must account for all included Liquidity signal families under a shared, frozen outcome and aggregation rule, or show separately validated families until a defensible combined meaning exists. Freeze the family mix/weights and show coverage so suppression of difficult signals cannot increase the headline by selection alone. Display the exact observed rate, interval, `n`, outcome, cohort, cutoff, and evidence link. The current 50–95, five-point badge range must be replaced before real publication; results below 50 must remain visible.

If future versions emit per-signal probabilities, test their calibration and Brier score against a simple base-rate forecast. A cohort's observed success fraction is not a calibrated probability for each individual signal. Paper net R and target/stop choices remain an adjacent economics scorecard, not part of the predictive probability by default.

## Implementation path

1. **Registry and draft experience.** Extend the existing Indicator Agent/Lab protocol concepts into a general experiment draft with study family, unit, cohort, baseline, candidate, sources, outcome, status, and evidence links. Keep drafts editable and frozen protocols append-only.
2. **Baseline read model.** Add a read-only target/stop baseline report over qualified Lab records with the exact definitions above. Include zero-data, missing-cost, ambiguous-path, and mixed-contract states. Do not mutate existing forecasts or outcomes.
3. **Causal paired replay.** Record complete eligible opportunities and chronological source paths; replay incumbent and candidate with frozen parameters. Keep development, locked holdout, and untouched forward partitions distinct.
4. **Review and publication.** Add Lab QA, Scientist decision, independent review, human validation, and rollback links. Only a reviewed indicator result may feed a Tool Belt score. The paper economics report remains separately labeled.

### Acceptance checks

- Empty Lab data displays `NOT MEASURED`, not a zero average or a demo result.
- Planned target and stop means use pre-outcome values, correct direction and tick size, identical cohort, visible `n`, and separate no-touch coverage.
- Mean of per-plan reward/risk is not computed from mean target divided by mean stop.
- Target/stop candidate replay recalculates outcomes from chronological data; a stored outcome label is not treated as the counterfactual.
- Same-bar ambiguity, data gaps, unknown costs, unresolved records, and rights blockers remain visible.
- Candidate and incumbent use the same opportunity inventory and a time-ordered evaluation; a change in signal count is reported.
- An exploratory result cannot advance a version or replace the Tool Belt placeholder without frozen protocol and recorded review.

## Existing repository anchors

- `count-dashboard/liquidity_engine.py`: confirmed level IDs, confirmation/touch/broken times, and input hash.
- `count-dashboard/indicator_agent_store.py`: frozen protocols, append-only paired observations, descriptive session bootstrap, and Scientist decisions; no probability publication path.
- `liquidity-lab/server.py`: frozen trial/forecast entry, stop, target, immutable outcomes, and weekly accuracy/Brier/mean-R summaries.
- `docs/CHIEF-SCIENTIST-WEEKLY-EXPERIMENT.md`: current weekly target-before-stop outcome and paper-economics separation.
- `count-dashboard/web/tool-belt.js`: uncalibrated `50% / 50%` placeholder and future reviewed score gate.

## Statistical references

- [NIST, confidence limits for a mean](https://www.itl.nist.gov/div898/handbook/eda/section3/eda352.htm): measured averages need interval estimates and assumptions.
- [NIST, confidence intervals for proportions](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm): Wilson intervals for simple binary rates.
- [scikit-learn, time-ordered evaluation](https://scikit-learn.org/stable/modules/cross_validation.html#cross-validation-of-time-series-data): future observations must not influence earlier model selection.
- [scikit-learn, probability calibration](https://scikit-learn.org/stable/modules/calibration.html): calibration and Brier scoring are distinct from classification accuracy.
