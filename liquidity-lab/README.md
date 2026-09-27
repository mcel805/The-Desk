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
- `POST /api/v1/scientist-forecast` — append an immutable forecast with its level, probability, risk/reward, tools, sources, and rationale.
- `POST /api/v1/scientist-outcome` — append one next-day disposition for a frozen Scientist forecast.
- `GET /api/zones`, `/api/trials`, `/api/outcomes`, `/api/calendar-events`, `/api/fills` — local exports.

Example requests are under [`examples/`](examples/).

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
