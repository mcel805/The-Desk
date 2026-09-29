# Cleo overlay: session observation loop

Status: product and implementation contract, 2026-09-28. The first native
overlay build is under `cleo-overlay-macos/`: floating window, local capture
timer, chat input, and a Codex review call. Screen Recording permission and
TradingView OAuth still need to be completed on this Mac; Jev and broker order
routing are not connected.

## Experience

TradingView remains the chart and manual execution application. Cleo is a
separate floating macOS window that occupies the right side of the display,
over the TradingView side panel. It does not resize, re-skin, or control
TradingView. The chat window owns **Start session**, **Pause**, **Resume**,
**Capture now**, and **End session**. A compact status line shows the selected
source window, current session mode, last successful observation, last Cleo
assessment, and whether context is stale.

The intended cadence is:

1. During an active session, schedule capture just after each wall-clock minute
   boundary and verify from the chart whether the one-minute candle has closed.
   If the chart clock or completion cannot be read, do not call it a closed-bar
   observation. Window-specific capture should be tested to ensure the floating
   Cleo window is absent from the captured image.
2. Store the original image privately with a capture timestamp, source-window
   identity, chart symbol/timeframe as visibly read, and a content hash. Keep
   the original unchanged. If the chart or cutoff cannot be identified, mark
   the observation incomplete.
3. A vision/OCR step turns each image into a **provisional** structured chart
   observation: visible price structure, indicator labels, levels, timeframe,
   and any legible candle values. Do not invent OHLC from pixels.
4. Jev receives that structured observation, the previous observation, and
   the current scenario state. It triages `routine`, `review_now`, or
   `uncertain`. Jev does not consume the image directly and does not generate
   exact arithmetic or price values.
5. Cleo reviews the latest five-minute observation window on the first
   completed five-minute boundary during the session. A `review_now` flag
   requests earlier review. Cleo reads the actual source images when needed,
   compares them with the prior scenario, and records what changed, what did
   not, and what would invalidate the current interpretation.
6. Cleo sends one concise proactive chat message only for a material change,
   a newly relevant conditional paper setup, a broken premise, or an
   unresolved observation that requires Mark's attention. Routine scans
   update the timeline without interrupting him.

The five-minute timer is an assessment cadence, not a claim that the source
data are live or complete. A major-move flag triggers a review request, not an
automatic trade. Mark remains the sole operator of his broker account.

## Review and event contract

Each review must carry:

| Field | Meaning |
| --- | --- |
| `session_id`, `observation_ids` | Exact local evidence used |
| `source` | Selected application/window and, if available, approved structured feed |
| `symbol`, `contract`, `timeframe` | What was actually confirmed; `MYM1!` alone is a continuous chart symbol |
| `captured_at`, `chart_cutoff`, `bar_complete` | Separate machine capture time from chart time and completion status |
| `image_hashes`, `extraction_version` | Reproduce the visible evidence and extraction method |
| `prior_scenario_id` | Carry forward the previous Cleo hypothesis |
| `trigger`, `trigger_evidence` | `five_minute`, `jev_review_now`, or `manual` with reason |
| `observation`, `interpretation`, `uncertainty` | Keep visible facts apart from Cleo's reading |
| `decision` | `wait`, `conditional_paper_scenario`, or `review_only` |
| `invalidates_if`, `next_watch` | What would change the assessment |

Do not turn a screen-derived value into an exact order price. If the chart is
occluded, changes symbol, loses connectivity, or its timeframe/cutoff cannot be
read, pause assessment and show `source uncertain` or `stale` in the overlay.

## Trigger design for the prototype

Initially, Jev should flag **possible** material movement from visual changes
and indicator/level transitions. Cleo verifies the flagged image and can
discard a false alarm. Numeric candle-size thresholds, range breaks, and
level-distance calculations require a separately authorized, timestamped OHLC
source; they should be performed in deterministic code before Jev triage.
Cooldown and scenario IDs prevent repeated messages about the same candle.

## Build and validation order

1. Native floating Cleo window with right-side positioning, resize, and
   session controls. Validate window behavior across Spaces and TradingView
   fullscreen/windowed modes using a local test chart.
2. Single-window capture with macOS Screen Recording permission, private local
   storage, visible capture health, and an explicit retention setting. Test
   overlay exclusion, one-minute timing, pause/resume, and source loss against
   an authorized local chart.
3. Image extraction and evidence timeline. Evaluate against labeled screenshots
   for symbol/timeframe detection, missed labels, false labels, and stale bars.
4. Jev triage on structured observations, then Cleo scheduled/triggered review
   with scenario continuity and interruption throttling.
5. If permitted by the source and data agreements, add a structured feed and
   official MCP context for exact candles and chart metadata. Reconcile the
   same symbol, contract, session, timezone, and bar cutoff before calculations.

TradingView's published policy prohibits automated screen/data collection and
non-display processing of its market data. The automated TradingView capture
and AI assessment path therefore requires written permission or another
licensed source before it is enabled for that application. Manual chart
snapshots and a local/authorized chart can be used to validate the overlay
experience in the meantime. See [TradingView policies](https://www.tradingview.com/policies/)
and [TradingView's automated-collection notice](https://www.tradingview.com/support/solutions/43000674726-why-is-my-account-banned-due-to-suspicious-activity/).

For the proposed native implementation, Apple's [ScreenCaptureKit single-window
filter](https://developer.apple.com/documentation/screencapturekit/sccontentfilter/init%28desktopindependentwindow%3A%29)
is the capture primitive. Actual capture of an obscured TradingView window and
fullscreen behavior must be verified on Mark's Mac.
