# Chief Scientist Daily Liquidity Lab — Operating Protocol v0.3

## Goal

Measure whether the Chief Scientist can reach at least 75% target-before-stop accuracy on untouched, session-bounded liquidity-level forecasts for MYM, MCL, and MGC. Accuracy is reported with coverage, sample size, uncertainty, probability calibration, and R results. It is not a guarantee or a substitute for expectancy.

## Daily unit of work

A run is unique by CME trade date, asset, dated contract, and method version. Its regular window opens at 5:00 p.m. America/Chicago on the prior calendar day and closes at 4:00 p.m. on the trade date. Approved holiday and early-close calendars may shorten that window.

Every paper position must be flat by the run's declared close. An unresolved touched forecast is recorded as a timeout at the session-close mark. An untouched forecast is recorded as no-touch. Nothing rolls into the next run.

## Required loop

1. Preparation — session manifest and eligible-level inventory.
2. Research — cited Lead Researcher packet.
3. Prediction — immutable complete forecast packet.
4. Recording — observation and disposition ledger.
5. Evaluation — asset/timeframe/session scorecard.
6. Journal — clickable daily release and audit narrative.
7. Daily learning — one bounded prospective learning memo.

The latest event controls the visible status of each step, while all earlier events remain in the release history. A completed step requires either stored output text or a clickable output URL.

## Implemented records

- `scientist_daily_runs`: immutable session identity and mandate.
- `scientist_run_step_events`: append-only state and audit narrative.
- `scientist_run_artifacts`: immutable stored documents or source links.
- `scientist_run_forecasts`: links frozen forecasts to one run.
- `/api/scientist-runs`: run and step history for the dashboard.
- `/scientist-release?run_id=...`: human-readable replay of the entire run.
- `/api/scientist-artifact?artifact_id=...`: clickable stored output.

## Write API

### Open a run

`POST /api/v1/scientist-run`

```json
{
  "trade_date": "2026-09-28",
  "asset_code": "MYM",
  "contract": "MYMZ2026",
  "method_version": "liquidity-loop-v0.3",
  "created_by": "user",
  "mandate": "Measure which liquidity levels hold within frozen session risk and reward."
}
```

### Append a step event

`POST /api/v1/scientist-step`

```json
{
  "run_id": "sr-...",
  "step_key": "preparation",
  "event_type": "completed",
  "owner": "Chief Scientist",
  "summary": "Verified the contract, source boundary, session calendar, and eligible levels.",
  "output_title": "Preparation manifest",
  "output_document": "Markdown or plain-text output",
  "output_url": "https://optional-source.example/report",
  "detail": {
    "source_as_of": "2026-09-27T21:00:00Z"
  }
}
```

### Freeze a forecast

`POST /api/v1/scientist-forecast` now requires `run_id`. The service rejects a forecast when its asset does not match the run or its expiry exceeds session close.

### Record an outcome

`POST /api/v1/scientist-outcome` rejects any outcome timestamp later than the linked run's session close.

### Force the session flat

`POST /api/v1/scientist-session-close` resolves every open forecast at the run's declared close. Untouched levels become `no_touch`; touched forecasts become `timeout` and require an approved close price. The cron runner should call this endpoint before evaluation.

## Cron contract

The intended schedule is declared in `liquidity-lab/scientist-crons.json`. It is configuration, not an installed operating-system crontab.

Validate it with:

```sh
python3 liquidity-lab/validate_crons.py
python3 liquidity-lab/validate_crons.py --json
```

The validator checks the IANA timezone, exact asset universe, session boundary, no-carry policy, required jobs, five-field cron syntax, weekday groups, declared clock offsets, and step names. It intentionally requires a later approved exchange-calendar adapter before unattended holiday scheduling.

## Remaining activation gates

- Supply dated contracts and roll rules for MYM, MCL, and MGC.
- Freeze MCL and MGC stop, target, slippage, commission, and data-source rules.
- Approve the exchange holiday and early-close calendar source.
- Approve licensed market-data processing, retention, cost, and sharing scope.
- Connect the cron contract to a scheduler that calls the local append-only APIs and reports blocked jobs.
- Connect Firstmate model dispatch and independent review.
- Connect the implemented session-close resolver to the scheduler and an approved close-price source.

Until these gates pass, the dashboard supports a manually reviewed paper/shadow pilot and produces complete daily releases. It does not route live orders.
