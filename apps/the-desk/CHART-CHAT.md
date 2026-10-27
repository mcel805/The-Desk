# Trading chart chat MVP

Chart chat is a collapsible, resizable panel on the left of The Desk. Enter a
trading question or request a chart markup. Enter sends; Shift+Enter adds a line.
The active chart badge identifies the market and timeframe. A run captures its
chart before analysis; changing charts during the run prevents its pending markup
from landing. Analysis is manual and uses completed candles only.

The visual design uses The Desk's existing dark/light theme tokens and Vela
canvas. Interaction research, inspected October 27, 2026:

- [Quant introduction](https://docs.luxalgo.com/platform/quant/introduction)
- [Drawing on the chart](https://docs.luxalgo.com/platform/quant/drawing)
- [Working the chart](https://docs.luxalgo.com/platform/quant/working-the-chart)
- [Volume profiles](https://docs.luxalgo.com/platform/charts/order-flow/volume-profiles)

This implements the core chat-to-chart workflow; it is not full Quant feature or
model parity. No proprietary Quant code or prompts are used.

## Try it

1. “On the one-minute chart, draw a volume profile for every completed swing.”
2. “On the 30-minute chart, draw liquidity levels and explain which have the
   strongest evidence on each side and why.”
3. Enable **Web research** to require live research during the specialist review.
4. Inspect RIDER / Spider reviews, Source & method, the ranked levels and chart.
5. Use Hide AI, Clear AI drawings, or Undo markup. Clear affects only the active
   symbol/timeframe, preserving hidden AI drawings for other scopes. Manual drawings and the
   separate Spider report drawings are preserved.

Additional bounded tools: candidate blocks, fair value gaps, close breaks and
chart discussion. Natural-language timeframe routing supports the application's
1m, 2m, 3m, 5m, 15m, 30m, 1h, 2h, 4h and daily analysis intervals. Unsupported
markets and arbitrary generated studies require further integration; the chat
cannot establish a missing stock/futures feed by researching a website.

## Agent and chart contract

The server uses the existing `spider_codex.CodexSession` transport and local Codex
sign-in. Credentials stay server-side. Each analysis request runs an actual
coordinator and RIDER review; liquidity / block requests also run an actual
Spider review. Explicit clear requests skip specialist review because they only
remove this chat's drawings. These are application analyst sessions, separate
from the independent paper agent fleet. They do not arm a worker, submit a paper
order or control a broker.

RIDER shares the existing `swing-advisors/rider-trading-lens.md` snapshot with
Swing Advisors; Spider loads the existing
`spider/references/playbook.md`. Missing parent frames, manual bias, participant
sequence and qualified entries remain missing. This MVP analyzes the requested
chart; it does not fabricate a full multi-timeframe package.

The coordinator selects an enum tool. Deterministic Python calculates all
geometry. Models cannot submit executable code, drawing coordinates or orders.
Specialist evidence IDs and structured replies are validated, with one bounded
schema repair. External research is enabled only for the selected review when
requested. The response records actual web events and retained opened URLs; a
model that never searches cannot claim research success.

Snapshots retain provider:symbol, chart ID, timeframe, UTC receipt/completed
cutoffs, exact OHLCV, gap count and SHA-256. The source is the active browser
chart, not an independent server verification of its provider. Forming bars are
excluded. A provider correction or source change blocks application. Replay
analysis and transformed candles are unavailable in this MVP.

Native Vela drawings are applied as a batch. Failure removes the new batch while
retaining previous markup. A repeated concept replaces its own source-scoped
drawings, including removal of old candidates when a refresh finds none. AI drawings are visible only on their captured symbol/timeframe;
liquidity badges show up to six ranked levels without crowding nearby prices.
Manual drawings remain editable through Vela. AI drawings initially land locked
and can be unlocked in Vela. Undo markup reverses the latest chat batch/clear.

## Methods and limitations

**Swing profiles.** Strict pivots use three completed candles on each side;
ambiguous outside candles are omitted. Consecutive same-side pivots collapse to
the more extreme one. Each alternating confirmed pair receives a native
`fixedrangevp` drawing. Profiles crossing missing intervals are omitted. The
newest 40 completed swings are supported per request; developing edge swings
are excluded. Native profiles default to 24 rows, 70% value area and POC.
These use Vela's OHLC-bucketed candle-volume approximation, not exchange
trade-at-price, footprint data or aggressor delta. Adjacent profiles share a
turning candle and must not be summed as disjoint volume windows. Missing or
zero volume fails explicitly.

**Liquidity.** Confirmed highs/lows are grouped by an explicit chart-range and
price-based tolerance. Levels cleared beyond that tolerance are omitted; reactions before a prior clearance do not count toward a rebuilt pool. At
most 18 candidate pools are ranked by reaction count, departure and recency.
The score is an uncalibrated display heuristic; it is not the probability of
being reached, reversing, or generating a profitable trade. Both-side levels,
intervening obstacles and specialist disagreements belong in the explanation.
OHLC cannot identify actual resting orders or establish participant intent.

**Blocks / structure.** Last opposing candles before observed close breaks and
unfilled three-candle gaps are mechanical candidates. They do not automatically
pass Spider's block/trap/secondary-pool requirements or establish entry readiness.

This is a frozen chart study. New bars do not automatically redraw an old request.
Send a fresh request to refresh. Existing studies, Pine compilation, chart
controls and broker review flows continue through their existing interfaces.

## Local access policy

This MVP is a trusted-local application. The owner explicitly chose to allow
same-machine processes to read saved chart-chat research through its loopback
API. Chat IDs are identifiers, not access credentials. There is no per-user
login or conversation ownership boundary. The server continues to reject
non-loopback Hosts and cross-origin browser requests through its shared route
checks. Keep this deployment bound to loopback. Network/multi-user hosting
requires a separate authenticated access model before exposure.

Helpful/Improve controls are an intentional part of the Quant-style MVP, as
confirmed by the owner. They retain feedback in this browser and let the trader
request an improved response; they do not train a model.

## Persistence and verification

Conversations, runs, evidence, research and application receipts use new tables
inside `desk.sqlite3`, covered by the existing database backup path. Native
drawings persist with the existing layout. Opening old chat history does not
silently replay its chart mutations. Ratings, panel width, visibility and last
conversation ID are browser preferences. Stop prevents pending application;
restarting the server marks interrupted runs failed.

Run the isolated preview without affecting the normal Desk process:

```sh
python3 server.py --port 18883 --data-dir /tmp/desk-chart-chat-mvp-20261027 --no-workers
```

Deterministic checks:

```sh
python3 -m unittest discover -s tests -p test_chart_chat.py -v
node --test tests/test_chart_chat_model.mjs
```

Real acceptance uses the local Codex account and public chart feed. Start the
30m liquidity request with Web research enabled on an isolated Desk, then run:

```sh
node tests/verify_chart_chat_browser.mjs http://127.0.0.1:18883/ /absolute/evidence/folder
```

The browser check verifies native drawings, both specialists, actual web events,
timeframe isolation, hide/show, clear/undo, manual-drawing preservation,
cancellation, collapse and persistence. It never submits an order. Acceptance
results and screenshots are local evidence, not evidence of trading performance.
The retained package at
`/Users/markceleste/Documents/Oct 2026 Charts MYM/chart-chat-qa-2026-10-27/acceptance.json`
predates the latest source-scoped clearing, empty-refresh, label-safety,
late-stop/context-rollback and stale-poll hardening; treat it as pre-hardening
evidence rather than current proof of those follow-up paths.

Focused fixture regressions and syntax checks run in GitHub Actions through
`.github/workflows/chart-chat.yml`. Real Codex/web/provider runs remain manual
acceptance checks so CI does not consume account usage or depend on live feeds.
