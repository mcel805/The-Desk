# Chief Scientist Weekly Experiment Protocol v0.1

## Purpose

Measure whether one frozen forecasting method can identify eligible liquidity levels that reach their declared target before their stop over a full trading week. The weekly research target is 75% target-before-stop accuracy. It is a target, not a performance claim or a promise of positive returns.

The unit is a CME trade week: the set of scheduled trade dates from Monday through Friday, adjusted for the approved exchange holiday calendar. A shortened week is still one cohort and must be labeled as shortened. Each day remains a separate session-bounded experiment. Weekly review never changes or rewrites a daily forecast.

## Experiment identity and preregistration

Identify a weekly cohort by:

`week_start × asset × dated contract/roll policy × method_version`

Keep MYM, MCL, and MGC cohorts separate. A cross-asset summary may be shown only alongside each asset result. Keep timeframe, direction, session window, and method-version breakdowns visible so a pooled weekly result cannot hide a weak segment.

Before the first forecast of the week, freeze a weekly preregistration record containing:

- research question and the single primary outcome;
- forecast eligibility rule and complete candidate inventory rule;
- asset, contract/roll policy, method version, timeframes, session boundaries, and holiday source;
- risk, target, expiry, costs, source rights, data resolution, and missing-data treatment;
- minimum eligible coverage and minimum resolved sample, with rationale;
- the comparison baseline and the analysis/interval method;
- the allowed method-change scope and the next review date.

Lock the method for the cohort. Corrections are appended with reasons; they do not replace the original preregistration. Any changed selection rule, threshold, model, or risk definition starts a new method version and is evaluated on future untouched weeks.

## Daily session loop

Run the existing seven daily steps for every scheduled asset session: preparation, research, prediction freeze, recording, evaluation, journal, and daily learning. The daily forecast packet must be frozen before the declared session open/cutoff. It records every eligible candidate, including explicit exclusions, with source, timeframe, cutoff, probability, trigger, stop, target, costs, expiry, uncertainty, invalidation, and method version.

Resolve every paper outcome by the approved session close. `target` is a hit; `stop` and post-touch `timeout` are misses for target-before-stop. `no_touch` is excluded from conditional accuracy but counts against neither side; report it in touch coverage. `ambiguous`, `invalidated`, and `data_gap` stay visible and are excluded from the binary score only with a reason. Do not carry paper positions across sessions or weeks.

Daily forecasts for the following designated trading day are part of this same forward study. After resolution, the Junior Scientist records the outcome and error category; the Chief Scientist may use it for the weekly review but cannot modify the frozen forecast or method in place.

## Weekly measures

Publish one weekly report after all scheduled sessions are closed and scored. Report counts and rates, not just a headline percentage:

1. **Primary accuracy:** `target / (target + stop + post-touch timeout)` for eligible touched forecasts.
2. **Touch coverage:** `touched / all eligible frozen forecasts`.
3. **Data and disposition coverage:** counts of target, stop, timeout, no-touch, ambiguous, invalidated, data-gap, and unresolved forecasts.
4. **Probability quality:** Brier score and calibration by probability band when probabilities were recorded before outcomes.
5. **Paper economics:** average and median R, expectancy, MAE/MFE, and net results after verified costs. Keep these separate from forecast accuracy and broker fills.
6. **Stability:** daily and weekly results by asset, timeframe, direction, session window, and method version, with denominators and 95% uncertainty intervals.
7. **Baseline comparison:** the preregistered baseline scored on the same eligible records and source boundary.

Show both the week's result and the cumulative untouched result for the current method version. A one-week point estimate at or above 75% is only “weekly target reached”; it does not validate the method. A sustained 75% claim requires the preregistered sample and sequential analysis plan to be complete, with its uncertainty interval and coverage requirements satisfied. If no such plan has been frozen, label the outcome “descriptive; validation threshold not preregistered.” Never stop a study or choose a subgroup after seeing that week’s results.

## Weekly review and change gate

The Chief Scientist publishes a review package with:

- preregistration and method hash;
- links to all daily releases and a manifest of the scheduled and completed sessions;
- the seven measure groups above, exclusions, source/data quality, and unresolved records;
- errors grouped by level selection, timing, regime, session, probability calibration, entry/stop/target, costs, and data quality;
- what matched or failed against the baseline, plus uncertainty and alternative explanations;
- a decision: retain, investigate, propose a new version, or stop the study;
- at most one primary method change proposal, with mechanism, expected effect, downside, and rejection criteria.

The Lab Testing Specialist reproduces counts, checks for look-ahead, missing candidates, duplicate records, and correct session boundaries. The Independent Outcome/Method Reviewer checks the protocol and interpretation without changing the source ledger. Firstmate owns the approval gate. An accepted proposal becomes a new method version and begins on the next untouched week; otherwise retain the frozen version. A weekly report is not complete until its review disposition and unresolved blockers are recorded.

## Team structure and authority

| Role | Owns | Does not own |
|---|---|---|
| Chief Scientist | Weekly question, preregistration, method, daily forecast decisions, weekly synthesis, prospective change proposal | Data rights, Firstmate dispatch, method approval, live trading |
| Junior Scientist | Daily run execution under the frozen method, complete candidate ledger, outcome classification, daily learning memo | Changing the method or deleting/correcting frozen evidence |
| Lead Researcher | Coordinates each daily and weekly evidence package and research agenda | Source permission or unsupported market observations |
| Research Associate | Cited searches, indicator/tool definitions, source conflicts, falsifiable ideas | Declaring an idea proven or gathering unauthorized exchange data |
| Analyst / Data QA | Rights, provenance, cutoff, freshness, contract, calendar, completeness, source-boundary checks | Filling missing fields by inference |
| Cleo | Provisional level maps, triggers, invalidations, multi-timeframe chart evidence | Numeric certainty unsupported by the supplied evidence |
| Lab Testing Specialist | Reproducible scoring, data-quality checks, baseline comparison, leakage/duplicate/session-boundary audit | Editing forecasts or choosing favorable samples |
| Independent Outcome/Method Reviewer | Independent weekly disposition: accept, return, reject, or block | Owning the method or Firstmate lifecycle |

Firstmate/Batty remains the only human-facing lifecycle and approval authority when connected. A roster entry or profile file does not mean a specialist was dispatched. All forecasts and simulated outcomes remain paper/shadow research.

## Current implementation boundary

The local Liquidity Lab records daily runs, immutable forecast/outcome events, session releases, and manual/scheduled trigger attempts. `GET /api/scientist-weekly` derives descriptive weekly scorecards from those daily records. Use [`liquidity-lab/templates/weekly-review-template.md`](../liquidity-lab/templates/weekly-review-template.md) to record the Chief's interpretation, testing disposition, independent review, and proposed next-week change as a linked review artifact. These decisions are not yet stored as a first-class weekly ledger; label the weekly decision “not recorded” until the review artifact exists. The API does not infer missing sessions or treat a descriptive point estimate as validation.
