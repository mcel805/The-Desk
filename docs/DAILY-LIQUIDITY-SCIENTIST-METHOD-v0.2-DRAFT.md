# Daily Liquidity Scientist Method — v0.2 draft

**Purpose:** make the Lab's primary research question the Scientist's forward accuracy at identifying which active liquidity levels hold best on each timeframe under a fixed risk/reward rule.

**State:** proposal from the Captain's latest direction; not yet an activated protocol. The current MYM v0.1 attraction/reaction study remains separately versioned until Firstmate approves a replacement or companion study.

## Objective

Aim for **at least 75% resolved accuracy** in daily, forward-looking level predictions, reported separately for 60m, 30m, 15m, 5m, and 1m. This is a research target, not a present performance claim. Report forecast counts and uncertainty with the percentage. Do not describe a small or selected subset as meeting the objective.

For each daily assessment:

- Freeze the assessment timestamp, contract, data snapshot, current levels, indicator and tool versions, research references, and prediction before the outcome window begins.
- Identify eligible active levels and rank them within each timeframe. Keep every eligible prediction in the denominator, including misses, timeouts, no-touches, and ambiguous paths as separately reported dispositions.
- Record the hold/fail call, calibrated probability, risk trigger, stop, target, reward/risk ratio, expiry, evidence, and rationale.
- On the next scheduled review, resolve the forecast from the declared forward data. Preserve the original forecast and append its outcome.
- Report hit rate per timeframe alongside calibration, Brier score, sample size, confidence intervals, realized R, and net economics after verified costs.

## Provisional scoring interpretation

Until the Captain chooses otherwise, carry forward the existing Lab convention for risk: a 30-tick stop and the nearest eligible opposite-side zone on the same timeframe as the target, frozen before the outcome. Use the next-day review as the record-and-resolution checkpoint; the forecast horizon and exact session cutoff must be frozen consistently across timeframes before activation.

“Hold” should count as a successful risk-bounded forecast only when the registered target is reached before the registered stop after the forecast trigger. No touch, timeout, and ambiguous bar-only path remain distinct outcomes; they are not silently called wins or dropped. Use tick or one-second paths where permitted when both barriers occur inside one aggregate bar.

A fixed stop with a variable opposite-zone target creates different reward/risk ratios. Therefore publish the ratio for every forecast and its realized R; the 75% hit-rate goal does not by itself establish positive expectancy or a tradable edge.

## Daily team loop

1. **Lead Researcher:** search broadly across publicly reachable or otherwise authorized internet sources; examine primary literature, exchange and regulator specifications, current indicator documentation, and every relevant dashboard analysis tool. Return direct citations, dates, findings, limitations, disagreements, and rights notes.
2. **Chief Scientist:** inspect all relevant dashboard evidence and the research packet, rank the existing levels on each timeframe, state uncertainty and risk/reward, then freeze the daily forecast before the next forward window.
3. **Independent Reviewer:** check source provenance, timeframe identity, look-ahead, forecast completeness, and risk/reward consistency before the forecast is accepted into the scored cohort.
4. **Outcome Reviewer:** the next day, resolve each frozen prediction from the approved data path and record all dispositions without rewriting the forecast.
5. **Chief Scientist:** examine misses and candidate improvements. Any selected feature, rule, threshold, or indicator change is assigned a new method version and tested on later untouched forecasts.
6. **Firstmate:** owns permissions, data/cost/retention gates, dispatch, review disposition, and delivery. No agent authorizes live orders.

The Scientist may use any indicator or tool available in the dashboard as exploratory evidence, but each scored method version must record which tools/features it used. Additional feature searches cannot rewrite the already frozen prediction.

## Scientific Journal section

The scientific journal is separate from the account execution journal and from user-suggested chart ideas. Each immutable daily record should include:

- forecast ID, forecast date/time, as-of snapshot hash, Scientist/model version, and protocol version;
- contract, timeframe, level/zone ID and price bounds, level side, eligibility, and within-timeframe rank;
- hold/fail prediction, stated probability, trigger, stop, target, expiry, risk ticks, reward ticks, and reward/risk ratio;
- indicators/tools and values used, Lead Researcher source links and retrieval dates, rationale, and reviewer disposition;
- next-day outcome, resolution source, ambiguity/missingness status, realized R and net result after verified costs;
- immutable amendments linked to their original record, never overwrites.

Summary cards should show the 75% target and actual resolved hit rate per timeframe, sample count and uncertainty, unresolved/ambiguous counts, calibration, realized R/expectancy, and model version. Keep the scientist forecast cohort distinct from live broker fills and from paper simulations not based on an accepted forecast.

## Research and data boundaries

Broad internet research permits searching and reading publicly reachable or otherwise authorized material. It does not permit bypassing paywalls, access controls, or provider terms. Public chart access, indicator output, or web citations do not automatically grant rights to automate collection, process, retain, or redistribute the underlying market data. Firstmate records the relevant rights, approved cost, and retention period before collection. Keep all order routing disabled.

## Activation decisions

Before this draft becomes a scoring protocol, Firstmate and the Captain need to lock:

1. the stop/target rule (retain 30 ticks plus frozen same-timeframe opposite-zone target, or replace it);
2. the daily forecast cutoff and exact next-day market session/horizon in a named timezone;
3. the eligible level universe and how levels are ranked when a timeframe has multiple candidates;
4. whether the 75% goal means target-before-stop accuracy across all eligible resolved calls, or a separately pre-registered confidence threshold;
5. the outcome feed, costs, market-data rights, processing rights, and retention period.
