# Indicator as a Service: simple Lab workflow

**Status:** design proposal · 2026-09-30
**Scope:** research and paper/shadow studies

## What we built

This work produced a design for using the Lab to study any clear trading question. The first indicator study is Liquidity. A target/stop comparison is the example of how a separate paper economics experiment would work.

The design includes a five-step experiment loop, a target/stop baseline report, and evidence gates for changing a signal or publishing a measured score. The companion HTML is a visual walkthrough. These are plans; they do not add the experiment builder or connect the Lab to new data.

The repository already has a confirmed Liquidity level engine, an Indicator Agent protocol and observation ledger, and a Liquidity Lab that stores frozen forecasts and outcomes. The Tool Belt's 50/50 badge is still an uncalibrated placeholder. At the last local database inspection, the Lab had no trial, forecast, or market-path records, so measured target and stop averages are unavailable.

## How to use the Lab

1. **Ask a question.** Example: “Do our Liquidity signals improve when the profit target or stop changes?” The Lab drafts a study and identifies what information is missing.
2. **Measure the baseline.** Fix the eligible signals, source, date range, timeframe, and current indicator or strategy version. The Lab reports the current result before proposing a change.
3. **Freeze one change.** State exactly what changes, what counts as success, how long to observe, and what would count as an inconclusive result. Save the protocol before collecting the test outcomes.
4. **Run the forward test.** Record every eligible opportunity and its outcome under the frozen rules. Compare the candidate with the baseline on the same opportunities; retain missing and ambiguous cases in the report.
5. **Review and decide.** Check the counts, effect, uncertainty, coverage, and data quality. Keep the current version, investigate, or accept the candidate for further human review. A new result does not guarantee future performance.

## Target and stop example

First describe the existing plan. Calculate average planned target and stop as entry-to-level distance in verified ticks. Show each average with its sample count and median. Include eligible plans even when the entry was never touched, and show missing plans separately.

Then report what happened on resolved paper trials: average net win, average net loss, target-before-stop rate, average net R, and MFE/MAE when chronological data supports them. Show timeouts, no-touch opportunities, unresolved cases, and costs separately. A planned target is not a realized win; outcome labels alone do not reveal the price path.

After reviewing this baseline, test **one** target or stop change. Replay both rules over the same opportunities and full price paths, then evaluate the frozen candidate on later untouched sessions. Compare net R and target-before-stop rate, while checking signal coverage and the strategy's structural and risk limits. Do not choose a new stop just because it is near the historical average MAE.

## One Liquidity score

The external-zone first-touch study is the pilot, not the all-signal score. Keep the Tool Belt at its placeholder until the included Liquidity signal families share a defined outcome and have enough reviewed evidence. Then show the observed rate, uncertainty interval, sample count, coverage, timeframe, cutoff, and link to the study. If a signal produces a per-event probability, also test whether those probabilities match observed outcomes. Keep target/stop economics in its own report.

## Responsibilities

- **User and Lab:** shape the question and inspect the baseline and results.
- **Chief Scientist:** freezes the question, outcome, baseline, and decision rule.
- **Lab:** records the forward observations and calculates the registered measures.
- **Lab Testing Specialist and independent reviewer:** reproduce the results and challenge the method.
- **Human reviewer:** decides whether a reviewed candidate should be accepted.

## Minimum quality rules

- Use data with known source, permission, contract, timeframe, and cutoff.
- Keep each experiment's observations, rules, and outcome records versioned and append-only.
- Do not use later data to set the baseline or tune the candidate under test.
- Show sample counts, coverage, uncertainty, unresolved cases, and any costs needed for the claim.
- Label empty or incomplete evidence `NOT MEASURED`; never fill gaps with invented values.
- Keep all results research-only and paper/shadow.

## Repository status and next step

Existing pieces: `count-dashboard/liquidity_engine.py`, `count-dashboard/indicator_agent_store.py`, and `liquidity-lab/server.py`. Still to build: a simple experiment draft, measured baseline report, forward comparison flow, and reviewed result display in the Tool Belt.

The next step is to define the Liquidity pilot's success event and observation window, then connect its confirmed signals to a qualified, permissioned source. The Lab can start the target/stop example once there are frozen plans, resolved chronological price paths, and verified costs. Until then, averages remain `NOT MEASURED`.

## References

- [NIST: confidence limits for a mean](https://www.itl.nist.gov/div898/handbook/eda/section3/eda352.htm)
- [NIST: confidence intervals for proportions](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm)
- [scikit-learn: time-ordered evaluation](https://scikit-learn.org/stable/modules/cross_validation.html#cross-validation-of-time-series-data)
- [scikit-learn: probability calibration](https://scikit-learn.org/stable/modules/calibration.html)
