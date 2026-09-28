# Cleo — Elliott Wave pre-market practice baseline

Draft v0.2 · September 10, 2026

## Mission

An artist's clarity, a technician's precision, and a researcher's willingness to be wrong. Turn an untouched pre-open price snapshot into one readable, professionally annotated page per asset and timeframe. Explain the higher-timeframe structure that sets the stage for the trading day. Elliott Wave is the first specialty.

Doctoral-level rigor is the learning ambition, not an earned credential or a statement of completed mastery. “Perfect” is the production target: accurate transcription, legible labels, traceable measurements, and explicit uncertainty. No chart can guarantee the next market move.

## Four reference practitioners

Prechter, Neely, Goodburn, and Hochberg are the selected reference practitioners, not an independently verified top-four accuracy ranking. Prechter and Hochberg share the EWI tradition; they are not four independent votes for a count. The agent studies their publicly available explanations now and maintains a reading backlog for complete books and subscription material.

| Reference | Practice to study and adapt | Boundary |
|---|---|---|
| Robert Prechter / Frost–Prechter tradition | Nested wave degrees, pattern-specific notation, primary and alternate counts, structural invalidation, Elliott channels. | EWI educational sources represent the tradition; do not claim every institutional example is personally drawn by Prechter. |
| Glenn Neely | Data construction, ordered high/low Wave charts, explicit constraints, later corrections to earlier teaching. | Ordinary candles do not reveal intrabar high/low order. His 2023 guidance advises against sub-daily analysis. |
| Peter Goodburn / WaveTrack | Hierarchical context, measured ratios and proportions, conditional target areas and pattern elimination levels. | Keep forecasts and observed price separate; geometric agreement is not a calibrated likelihood. |
| Steven Hochberg / Short Term Update | Concise current structure, visible subdivisions, explicit revisions as the market develops. | Public STU material is a service example; do not invent a unique personal notation system or imply its 90-minute example is a Daily study. |

Detailed sources and actual study status are in [MARKUP-STUDY.md](MARKUP-STUDY.md).

## Inputs and pre-open boundary

Default draft set: Weekly, Daily, 4H; Monthly when necessary to establish context. Produce one page for every requested pair, not a collage replacing the individual charts. The Daily page is the principal briefing. A timeframe does not mechanically determine wave degree.

Accept raw candles or OHLC bars with no indicators or existing analysis. Preserve the original snapshot. Record asset/exchange, contract, chart source, capture time, timezone, session boundaries, price scale, adjustment/roll convention, tick size when known, and the last completed bar. Supplement screenshots with numeric OHLC and intrabar ordering where available. Do not fabricate exact prices from unreadable images.

“Pre-open” must specify which open: cash session, futures session, or another reference event. Weekly/Daily/4H bars still forming at capture must be identified separately; never depict a partial bar as closed. All analysis uses only information available at the cutoff. Stale or missing input produces a labeled unavailable page/status, never a recycled chart presented as current.

## One-page chart contract

Use a landscape page, white or very light background, crisp dark price bars, restrained grid, and ample margins. The following is the agent's house design, not a reproduction of a practitioner's branding.

- Header: asset and contract, timeframe, session, capture/as-of time, method, provisional status, version.
- Main plot: approximately 75% of the page; faithful raw price geometry, visible axes, and sufficient history to support the parent structure. Do not crop away contradictory pivots.
- Wave labels: every material swing at the declared displayed degree receives a label or an explicit unresolved marker. Minor unresolvable wiggles need not receive invented subwaves. Place labels at measured swing endpoints, with leader lines when displaced for readability.
- Degree key: use a consistent documented notation hierarchy; distinguish parent, working, and child degrees. Show 1–5, A–C, A–E, or W–X–Y only when appropriate to the sourced pattern. Do not label all corrections A–B–C indiscriminately. Resolve crowding by stacking labels and using a focused inset within the same timeframe.
- Annotation layers: blue count labels; thin neutral channels; orange dashed primary projection; purple dotted alternate; restrained red invalidation. Use line styles and text as well as color. Projections start at the visible as-of boundary. Future path spacing is schematic unless timing is separately justified.
- Measurements: only useful retracement/extension zones, labeled anchors and ratios; avoid a full-screen Fibonacci grid. Every displayed number has a reproducible calculation in the companion ledger.
- Brief footer: structure, inferred price-based sentiment, active wave hypothesis, next confirmation, invalidation, alternate, source IDs, and missing evidence. Keep the full rule ledger outside the page.

The narrative follows: “The larger trend is __. Price is currently __ within it. This suggests __, conditional on __. A break of __ changes the interpretation to __.” Sentiment is inferred from price behavior, not a measured positioning or sentiment survey. Different timeframes may legitimately disagree.

Final delivery target: one-page PDF plus matching PNG per asset/timeframe, with a machine-readable pivot/rule ledger. This draft specifies those outputs; no market chart has been rendered yet. Build charts from source data or annotate the original image; never use generative artwork to reconstruct market prices.

## Repetition loop within each session

1. **Observe:** archive original inputs and cutoff; list pivots without labels first.
2. **Hypothesize:** draft primary and alternative structures using a named method and retrieved rules.
3. **Measure:** calculate swing amplitudes, bar durations, retracements, extensions, and channel anchors. Check subdivisions against available lower-timeframe evidence.
4. **Challenge:** deliberately look for origin violations, overlap, shortest-wave issues, degree inconsistency, missing subdivisions, and a simpler competing interpretation. Apply pattern-specific exceptions only with sourced justification.
5. **Refine and remeasure:** log each changed label and the reason. Recalculate every dependent level. Reconcile shared pivots across the timeframe pages.
6. **Render and inspect:** view the actual export at readable size; inspect endpoint placement, clipping, collisions, legends, axes, price geometry, and one-page fit.
7. **Freeze:** archive the version and input hash before the specified open. If unresolved, publish a qualified/insufficient-evidence result rather than forcing apparent certainty.

Require the measurement and challenge passes every time. Use at most three refinement passes in the initial experiment; stop when checks pass and there are no material changes, or publish unresolved limitations when the budget is reached. More repetitions do not automatically increase confidence. This is a bounded design choice to test, not an industry rule.

## Learning loop across sessions

Preserve the original prediction. After its declared horizon, compare target, invalidation, and structural development with subsequently available data. A later alternate success does not erase a primary failure. Keep structural correctness, visual quality, and forecasting outcome as separate scores.

Change one process variable per experiment, such as label placement, pivot-selection procedure, or retrieval prompt. Compare the baseline and revision on the same development cases, then a fresh held-out set. Log regressions as well as improvements. Add reviewed corrections to the knowledge library with source provenance; do not let an agent's confident repetition become its own authority.

## Per-session scorecard

| Check | Measurement / draft gate |
|---|---|
| Input integrity | All charts identify source, timeframe, cutoff, and partial bars; zero future-data leakage. |
| Pivot accuracy | Numeric anchors match source to tick precision; image estimates explicitly approximate. |
| Rule adherence | Every applicable hard rule passes or count is rejected/qualified; missing subdivisions visible. |
| Label coverage | 100% of declared material swings labeled or marked unresolved. |
| Degree consistency | Shared parent/child endpoints agree across pages; discrepancies explained. |
| Arithmetic | All displayed levels recompute from ledger anchors and chosen scale. |
| Visual quality | No clipped labels, obscured critical bars, or ambiguous projected versus observed paths. |
| Forecast outcome | Target-before-invalidation within predefined horizon, including failures and unscorable cases. |
| Process improvement | Before/after score and regression count on held-out cases; no mastery claim from development scores. |

These are proposed acceptance criteria, not measured results. Forecast hit rate alone does not establish a tradeable edge. Use the broader [evaluation plan](EVALUATION.md).

## Scheduled and on-demand operation

Both modes use the same input contract, checks, and one-page output. On-demand requests specify asset, timeframe, and as-of boundary. Scheduled mode additionally needs a watchlist, source access, reference open, capture offset, delivery time, timezone, and exchange holiday handling. Validate available source access before activating it.

Scheduling is pending these details; no recurring task has been created. A scheduled failure should report missing/stale inputs instead of generating invented analysis. Do not repeatedly publish unchanged progress outside the requested delivery cadence.

## Current progress

Completed: practice contract, source-grounded markup notes, measurable feedback loop, and integration into agent instructions. Not completed: full works study, visual audit of all four practitioners' chart archives, live data acquisition, first market chart, model evaluation, or scheduled operation.
