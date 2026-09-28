# MYM Liquidity Zone Forward Lab

Local paper/shadow research service for protocol `mym-lz-forward-v0.1`.

It records immutable TradingView liquidity-zone forecasts, opens a virtual one-contract reversal trial at first touch, freezes a 30-tick stop and the nearest active opposite-side target on the same timeframe, resolves outcomes from chronological ticks or bars, and reports probability calibration separately from trading economics.

It does **not** route live orders.

The dashboard also reports Count Desk user-suggested level results as a
separate cohort, grouped by timeframe and by side, bias, session, divergence,
and retracement bucket. Those observations come from the local Count Desk
journal and are not mixed into the indicator's attraction/reaction forecast
scores.

## Start

```bash
export LIQUIDITY_LAB_WEBHOOK_SECRET='replace-with-a-long-random-secret'
export LIQUIDITY_LAB_ROUND_TURN_COST_USD='0.00' # replace with the actual AMP/CQG schedule
python3 liquidity-lab/server.py
```

Open <http://127.0.0.1:8041>.

The database defaults to `liquidity-lab/data/liquidity-lab.sqlite3`. Override it with `--db /absolute/path.sqlite3`.

The service refuses a non-loopback bind unless `LIQUIDITY_LAB_WEBHOOK_SECRET` is set. It accepts the secret in `X-Liquidity-Lab-Secret`, `Authorization: Bearer ...`, or the existing Pine payload's `secret` field. Secrets are removed before payloads are stored.

## TradingView alert

Use [Batty-Clean-Zone-v1.9.6-lab.pine](../indicators/batty-liquidity/Batty-Clean-Zone-v1.9.6-lab.pine). Enable **Send new printed zones to Liquidity Lab**, put the same webhook secret in the indicator input, and create a TradingView alert using **Any alert() function call**.

Webhook endpoint:

```text
POST https://YOUR-SECURE-ENDPOINT/api/v1/forecast
```

TradingView cannot call `127.0.0.1`; exposing the endpoint requires a separately approved secure HTTPS ingress. Do not expose this server without authentication, logging, and data-rights review.

## Data endpoints

- `POST /api/v1/forecast` — TradingView `zone_created` payload.
- `POST /api/v1/tick` — chronological licensed tick/one-second observation.
- `POST /api/v1/bar` — completed OHLCV source-timeframe bar; used for expiry and conservative path resolution.
- `POST /api/v1/zone-event` — manual `cancelled` or `invalidated` lifecycle event.
- `POST /api/v1/calendar-event` — official BLS/BEA/Federal Reserve scheduled event.
- `POST /api/v1/fill` — broker/platform fill record; the execution-truth ledger.
- `GET /api/dashboard` — dashboard data.
- `GET /api/scientist-levels` — currently active levels eligible for a frozen daily assessment.
- `GET /api/scientist-journal` — daily Scientist forecast and outcome records, with per-timeframe accuracy summaries.
- `GET /api/scientist-weekly` — descriptive full-week cohorts grouped by trade week, asset, dated contract, and method version, with touch coverage, Wilson intervals, Brier score, R, and timeframe breakdowns.
- `GET /api/scientist-weekly-reviews` — append-only Chief review records with frozen weekly scorecard snapshots and integrity hashes.
- `GET /api/scientist-weekly-preregistrations` — frozen weekly questions, baselines, sample/coverage requirements, scheduled sessions, data boundary, and decision rules.
- `POST /api/v1/scientist-weekly-preregistration` — freeze the weekly experiment before its first linked forecast; later edits append a preregistration revision only while no forecast has been recorded.
- `POST /api/v1/scientist-weekly-review` — append the Chief synthesis, Lab Testing Specialist result, independent reviewer disposition, next-week proposal, and recorded Firstmate status. Requires a closed week and fully resolved forecasts.
- `POST /api/v1/scientist-forecast` — append an immutable forecast with its level, probability, risk/reward, tools, sources, and rationale.
- `POST /api/v1/scientist-outcome` — append one next-day disposition for a frozen Scientist forecast.
- `POST /api/v1/scientist-data-package` — append an immutable Lead Researcher/Analyst evidence package; readiness is recomputed by Lab gates.
- `POST /api/v1/scientist-trigger` — manual or cron trigger for the shared daily run; creates a Firstmate task only when the dispatch bridge accepts it.
- `POST /api/v1/scientist-trigger-event` — append Firstmate task completion/failure against the exact dispatched task ID.
- `GET /api/zones`, `/api/trials`, `/api/outcomes`, `/api/calendar-events`, `/api/fills` — local exports.

Example requests are under [`examples/`](examples/).

## Chief Scientist manual and cron paths

The run tracker has **Run Chief Scientist now**, **Run / resume Chief Scientist**, and **Upload specialist data package** controls. Manual requests use the same `trade_date × asset × dated contract × method_version` run as scheduled jobs. A completed manual prediction suppresses duplicate pre-session cron work for that run. Session close, evaluation, release, and daily learning remain scheduled.

The daily package format is [`daily-data-package.schema.json`](daily-data-package.schema.json). The Lead Researcher coordinates it; the Analyst checks rights, source identity, cutoff, freshness, timeframe coverage, session calendar, contract, risk rules, costs, and every candidate-level disposition. Cleo contributes level mapping. A blocked package is retained with explicit reasons. A prediction step cannot be marked complete without a ready package.

The weekly experiment and team review gates are defined in [`docs/CHIEF-SCIENTIST-WEEKLY-EXPERIMENT.md`](../docs/CHIEF-SCIENTIST-WEEKLY-EXPERIMENT.md). Freeze the weekly question, baseline, sample/coverage thresholds, session dates, source boundary, and decision rules in the dashboard before forecasting; manual pre-session dispatch and forecast completion require a matching registration. The dashboard can append a weekly review after Friday has closed and every included forecast is resolved. Each review stores its scorecard snapshot and hash, preregistration ID/hash, Chief synthesis, testing and independent dispositions, proposed next-week action, and the Firstmate disposition entered by the user. These rows are immutable; a pre-forecast plan correction or later review correction appends a revision. The scorecard remains descriptive, and the form does not dispatch reviewers or approve a method change. Use [`templates/weekly-review-template.md`](templates/weekly-review-template.md) for the full completeness checks.

The local Firstmate dispatch adapter uses these runtime environment variables:

```bash
export LIQUIDITY_LAB_FIRSTMATE_DISPATCH_URL='https://<approved-firstmate-dispatch-endpoint>'
export LIQUIDITY_LAB_FIRSTMATE_DISPATCH_TOKEN='<local-secret>'
```

The adapter contract is `firstmate-scientist-dispatch-v1`; it must enqueue the task and return a `task_id` before the task runs. The task receives the run and trigger event IDs, required roles, package-first instructions, and submission endpoints. It later posts `completed` or `failed` against that exact trigger event ID. Use HTTPS except for loopback development. Keep the token out of Git and the browser. Without the bridge, trigger attempts append a `blocked` event and do not claim that analysis ran.

If Firstmate workers cannot reach the same host's loopback interface, set `LIQUIDITY_LAB_CALLBACK_BASE_URL` to the Lab's approved HTTPS endpoint. The bridge must authenticate its callbacks using the Lab's configured webhook secret, and return the supplied `trigger_event_id` with the task ID so completion can be attached to the exact dispatch.

The cron adapter reads `scientist-crons.json` and runs any job due in the current Chicago minute. Before enabling it, create `data/scientist-scheduler.local.json` from [`examples/scientist-scheduler.local.example.json`](examples/scientist-scheduler.local.example.json), then set dated contracts and approved exchange-calendar boundaries for upcoming trade dates. A missing contract or calendar entry is logged as blocked and does not create a forecast. Install this line in the operating system crontab only after the local config and Firstmate bridge are ready:

```cron
* * * * * cd "/path/to/The Trader - a trading company" && python3 liquidity-lab/scientist_cron.py --tick >> liquidity-lab/data/scientist-cron-console.log 2>&1
```

The Lab does not install a system crontab automatically, and the dashboard cannot detect whether an OS crontab was installed. Local scheduler config and logs are gitignored. The runner requires an approved session record for each target trade date; it does not infer holiday or early-close hours from regular-session defaults.

## Outcome semantics

- BSL first touch opens a short; SSL first touch opens a long.
- Entry uses bid/ask when provided. Without it, the resolver applies the configured conservative entry slippage.
- Stop trigger is 30 ticks from actual entry. Stop-fill slippage is applied separately.
- Target is the nearest eligible opposite-side zone on the same timeframe, known at entry.
- Attraction and reaction expire after 20 source bars.
- A bar containing entry and any exit threshold is ambiguous. A later bar containing both stop and target is also ambiguous and uses stop-first only for conservative economics.
- Tick ingestion resolves the chronological path and avoids aggregate-bar ambiguity.
- Every scientific trial uses one virtual contract. The executable policy marks only the first open trial as eligible; overlapping trials are retained but blocked.

## Probability semantics

The supplied v1.9.6 indicator is not a single probability model:

- 60m / 30m: attraction or sweep probability.
- 5m / 1m: reaction or opposing-target probability.
- 15m and fallback estimates: stored but not scored as calibrated forecasts.

The dashboard never combines these into one accuracy number.

## Tests

```bash
python3 -m unittest liquidity-lab/test_lab.py
```

## External blockers

Before economic conclusions:

1. Set the actual AMP/CQG round-turn commission and fee amount.
2. Choose a licensed tick or one-second data source and confirm retention/derived-use rights.
3. Configure a secure HTTPS webhook ingress if TradingView will post directly.
4. Keep live execution disabled until a separately approved stage.

## Chief Scientist panel

The dashboard header opens the Chief Scientist role panel and links to the Scientist and Lead Researcher role files. The Chief Scientist source of truth is `agents/intellect/chief-scientist.md`; the Lead Researcher role also appears as a selectable Firstmate workflow seat in Count Desk. The Batty chat dock is a local interface preview; it does not connect a model provider or dispatch a Firstmate task.

## Primary research objective (draft)

The Captain's current objective is for the Chief Scientist to freeze daily, risk-bounded predictions across 60m, 30m, 15m, 5m, and 1m, review the forward outcomes the next day, and investigate evidence-based improvements toward 75% accuracy. The 75% figure is a target, not a measured result. See [`DAILY-LIQUIDITY-SCIENTIST-METHOD-v0.2-DRAFT.md`](../docs/DAILY-LIQUIDITY-SCIENTIST-METHOD-v0.2-DRAFT.md) for the proposed journal fields, research loop, and decisions still to lock.

The v0.1 attraction/reaction scorecards are retained as a separate indicator diagnostics study. The scientific journal now has append-only forecast and outcome records plus a manual next-day grading flow. Firstmate model dispatch and feed-driven automatic outcome resolution are not connected yet. Do not treat the existing v0.1 zones/trials as Scientist predictions.
