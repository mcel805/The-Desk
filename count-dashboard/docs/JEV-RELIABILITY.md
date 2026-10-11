# Jev reliability repair — 2026-10-09

The background Rider and chart reads now use `geometryTape()` from `web/jev-market-geometry.mjs`: 28 completed candles match geometry's 20-bar baseline plus eight reaction bars. Genuine OHLCV mismatches remain rejected.

`taper_decisions.decide()` validates each typed answer. It retries only invalid questions once against the identical evidence, validates the replacement strictly, and retains the original answers and validation failures in attempt receipts. It does not normalize a 0.99 probability sum or relax the probability gate. Usage and estimated cost include both measured requests; unknown retry billing remains separate.

HTTP failures retain sanitized provider messages and status codes. Authentication and request-validation failures require review/re-arm. Rate limiting, overload, transient server/network errors and exhausted invalid-answer retries cancel pending entries and keep Rider waiting for a new completed minute. Fresh validated evidence restores monitoring. Existing source, cutoff, risk, confidence, expiry and limit-only gates still apply. No daily API request or spending cap was added.

Validation: 62 focused tests pass across `test_jev_reliability`, `test_taper_swing_geometry`, `test_crypto_day_desk`, and `test_rider_auto`. Fresh public BTC evidence passed local validation with 28 candles and seven frames. A generic greeting-only request succeeded against Jev 1.13.0. The full current-chart external request remains unverified pending explicit authorization following automatic approval review's rejection. No trades were submitted during validation.

References: https://docs.typesafe.ai/api and https://docs.typesafe.ai/sdk/python/api/retries.

Run locally from count-dashboard:

```sh
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python3 -m unittest test_jev_reliability test_taper_swing_geometry test_crypto_day_desk test_rider_auto
```

## Context-limit repair — 2026-10-10

A public-only reproduction confirmed HTTP 400 with `detail.error_type=max_tokens_exceeded`. The previous parser ignored `error_type`, hiding the diagnosis. All seven frame-direction questions now share a bounded request containing complete validated channel anchors/rails/breaks; the execution/context request uses full execution geometry and measured parent summaries. Per-frame scope descriptions make the omitted redundant raw fields explicit. The complete validated geometry remains in the local decision record. Source, cutoff, selected levels, playbook, confidence and risk gates remain frozen.

All requests and any invalid-answer retry contribute measured usage/cost; each attempt records scope, question IDs and state hash. No invalid probability distribution is normalized or silently accepted. The desk exposes the latest persisted failed/pending/valid API attempt instead of equating credentials with a working connection. Failed reads with measurable partial usage are included in daily token and cost totals.

Observed diagnostic: fresh public Hyperliquid BTC 1m evidence returned all 28 valid answers through the installed integration in 1,208 ms. Two invalid probability totals were repaired by one retry each, for four HTTP requests total: 98,914 input tokens, 2,026 output tokens, $0.00415439 estimated. No session was started or re-armed and no orders were made. This confirms request/response operation, not model accuracy or profitable trading. No automated test suite was run for this repair.

### Local status polling repair

Profiling the live state path showed 59.424 seconds for a response, with 56.888 seconds spent rebuilding all historical reviews. Normal polling now returns explicitly labeled saved historical outcome reviews and current position/health data. Opening Sessions & reviews / Daily review, exporting, or clocking out rebuilds historical outcomes. Saved API summaries are reused only when their timestamp covers all relevant session events. Measured shadow summaries are retained for the polling view; unmeasured holdouts stay unavailable. A local state request returned all 17 sessions in 10.419 seconds after this change.

Database lock errors additionally showed state trade tracing racing with unsynchronized context writes. Context/settings/review/link/chat writes now use the desk lock, and an already-recorded event returns before requesting a write lock. No events or source evidence were deleted.

Polling also shares historical learning totals within one minute, labeled with `computedAt` and `refreshIntervalMs`; explicit review/export clears that cache. Current Jev health, positions, cutoffs and entry evidence are not cached. Repeated candidate chart context is removed by SQLite before parsing status responses; full database records and exports remain unchanged. Existing monthly accounts are read without requesting an ignored insert on every poll.

Final local status observation: 1.868 seconds, 17 saved session summaries retained. An empty initial account selection now resolves to the current monthly account on the server, avoiding the initial-load race that briefly showed zero sessions and mixed account positions.
