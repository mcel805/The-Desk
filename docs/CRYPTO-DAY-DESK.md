# Wave Court Crypto Day Desk

Open `http://127.0.0.1:8770/crypto-day.html`. This is a dedicated paper workspace built on Quant Lab's existing Vela chart, Codex chat, SIM accounts, analyst routes and journal bridge. The original Quant Lab and TradingView indicator remain available.

## Trading workspace

- The desktop workspace gives the chart approximately 76% of the width. Focus chart expands it. Narrow screens expose Taper and chat through a drawer.
- BTC, ETH and SOL; Coinbase/Binance spot or Hyperliquid perpetual public data. The public candle quote subscription is separate from the ten-second REST chart refresh. A provider can fall back to polling. No order-book depth is implied.
- Daily, 4H, 1H, 30M, 15M, 5M and 1M are calculated. Three visible wave degrees are the default. Waves, alternates, liquidity, tiny timeframe numbers, purple convergence, wick channels, cyan structure, ended history, Fibs, projection and decision markers have separate toggles.
- Grey/blue/cyan/amber/green/red bar dots show WAIT, APPROACH, TOUCH, sweep, confirmed and short reads. A diamond indicates a Decisions API receipt. Click a 1m candle or a ledger row to inspect its saved read. The current forming minute receives no completed-bar decision.
- The round scoreboard uses the selected paper account. P&L, equity and drawdown are **gross** simulator values. An asterisk means open positions in another market lack a current mark. Daily review shows separately estimated fees/slippage/net values. Session boundary is UTC midnight.
- Journal opens the existing local journal; entry and exit events use its durable outbox. A closed trade remains recorded if delivery is temporarily unavailable.

## Taper's decision and communication path

1. Archive completed, ordered OHLCV with provider, symbol and cutoff.
2. Hunt a causally confirmed liquidity wick level. HTF weights and unique-timeframe convergence votes are retained.
3. Record approach/touch; identify a lower sweep and reclaim or upper sweep and rejection.
4. Require configured consecutive closes defending the level, a break of the sweep extreme, an unexpired setup, an opposite active liquidity target, reward/risk and current wave-quality gate.
5. Taper's API classification sits alongside the rule record. API confidence is not an empirical probability of profit. No private model reasoning is exposed.
6. Rider button invokes the existing Shammy/Rider research workflow. Cleo button invokes the existing market analyst. Handoff requested/completed/failed events are saved against the decision. The model's report must be inspected before treating its conclusion as verified.
7. Human reviews the current fresh paper ticket. Spot shorts are blocked in this ticket path; use perpetual paper research for short setups. Existing positions, daily loss and risk sizing gates apply.
8. Manage position proposes a tighter stop at active micro structure and the nearest opposite liquidity target. It opens a review ticket, without automatically modifying a position. The inherited simulator restricts stops to their original entry side; profit-locking trailing stops are not implemented here.

The rule path is a new, versioned paper decision policy. It is **not** the original Pine `f_master` frozen-plan state machine. The unchanged indicator and the experimental policy have distinct purposes.

## TypeSafe Jev API and cost

The existing server-side `taper_decisions.py` integration calls TypeSafe Jev's System One API. Configure `TYPESAFE_API_KEY` in the private Count Desk environment and restart the server. Enable Jev in Configure only when ready. On 2026-10-09 the TypeSafe key was saved privately, accepted by the model-catalog endpoint, and loaded by the restarted server. No model classification has completed yet; the active session was started with API reads off.

Automatic evaluation is limited to each newly completed 1m bar of the selected market. Jev API usage has no internal daily request or spending cap. Legacy cap fields in saved policies are ignored; daily counters remain informational. A failed or pending attempt is not silently retried. Cost estimates derive from the integration's recorded token usage and pricing assumption; they are not invoice reconciliation. Failure receipts may have unknown billable usage.

Per-trade attribution assigns completed API receipts once, from the setup's sweep minute through its paper exit. Overlapping windows allocate a receipt to the earliest linked trade. Unlinked exploratory reads stay in desk totals. Token/receipt counts and estimated cost are shown with each linked position. These costs cover Decisions receipts; Codex chat/subscription token costs are not supplied by the existing integration and are not included. Historical fee estimates use its frozen policy; unlinked trades use the current estimate and are labelled as such.

## Storage and daily review loop

Local private storage: `count-dashboard/data/crypto-day-desk.sqlite3`.

Tables retain source bars, all seven source contexts, immutable bar decisions by policy version, outcomes, API attempts, unique trade cost allocations, policy history, reviews and trade links. Original completed candles remain canonical when a provider revises them. New policy versions retain earlier decisions. Export includes OHLCV, context, decisions, policies, reviews and API attempts.

The learning loop freezes the forward forecast, resolves it against the configured future completed close, excludes missing-minute horizons, groups outcomes by asset/stage/bias/policy, and prepares a daily review. Reconstructed history is labelled and excluded from forward accuracy. Model forecasts and rules have separate directional scores. At least 30 forward samples are required before proposing a threshold review; this is a review threshold, not statistical proof. The next policy is adopted explicitly, then measured on a later untouched session.

This is empirical measurement and policy review. It does not train model weights or automatically rewrite the strategy. Collection, selected-market paper bracket checks and monitoring run while this desk is open and visible; this build is not an unattended 24/7 server worker. Other markets' open positions require their own fresh chart snapshots.

## Pine source and parity

Authoritative preserved source: `TradingView/Wave_Court/Wave_Court_MTF_v1_14.pine` in the MYM project. The web download is an unchanged byte-for-byte copy.

SHA-256: `06f2a2b01131872c8bd94c378bf5e287865b04ca951d30a3409fd4b53cfe1df6`.

`wave-court-port.mjs` derives candidate rules, pivot degrees, liquidity confirmation/consumption, weighted bounded convergence, wick-safe channel retirement, stacked wave tags and four micro structure detectors from that source. The supplied 1H/30M/1M TradingView captures informed the palette and minimal overlay style.

**100% TradingView equivalence is not established.** This is a JavaScript renderer on Vela, not a Pine interpreter. Same-provider, same-cutoff OHLC replay is still needed for numerical parity. Retained history, warmup, request.security sampling, current retained-pool reconstruction, native font sizes/glyphs, manual anchor controls and the Pine frozen-plan machine differ or are not fully mirrored. Right-margin Fib length is based on supplied chart history, rather than TradingView's exact visible-range calculation. The source file itself is unchanged.

## Validation

- Python ledger tests: every supplied bar, warmup, completion/freshness, immutable revisions, policy retention, gap exclusion, sweep confirmation/opposite target, context export, API opt-in/no rebilling, paper fills/journal events and trade token/cost attribution.
- JavaScript fixtures: impulse hard rules, ABC variants, unique timeframe votes, bounded convergence, independently audited channel wick containment, causal pool birth/consumption and forming-bar exclusion.
- Browser checks: desktop layout, configuration, layer control, bar ledger/drilldown, public chart updates, journal availability and visible decision markers. No user paper trade was placed for validation; simulator integration used an isolated temporary database.

Run from the repository:

```sh
PYTHONDONTWRITEBYTECODE=1 python3 count-dashboard/test_crypto_day_desk.py
node count-dashboard/test-wave-court-port.mjs
```

Next acceptance step: replay a matched public OHLC dataset against Pine v1.14 and review the indicator differences before relying on parity claims.

## Selected-level hunt sessions

Start hunt freezes provider/symbol, paper account, the exact selected confirmed liquidity IDs, indicator settings and current policy. No historical minute becomes a new session forecast. The original chart renderer, Wave Court calculations and Pine source are unchanged. Taper evaluates every selected level independently using the existing sweep/confirmation rules; targets are the nearest active opposite liquidity, including unselected levels. Qualified proposals rank by confirmation, reward/risk, then timeframe weight. This rank is not a measured profit probability or proof of an optimal entry. Consumed levels are retired after their confirmation window; unavailable retained levels are reported without inventing replacements.

The left console has two agents: Taper and Rider. Each completed minute is an expandable, durable per-level rule receipt. Real Jev classifications and token/cost receipts are distinct events. Taper text replies explain saved rule evidence rather than pretend to be model responses. Rider uses the existing authenticated Codex/Rider research path in read-only mode; chart markup callbacks and automatic result-layout changes are disabled on this page.

Session journal notes are upserted over the existing authenticated local journal bridge with stable event IDs. The session begins at Start; its start time, selected levels, decisions, Rider/human notes and observed paper-position events are recorded. Actual fills continue through the existing paper execution outbox. A pending journal sync remains visibly pending and is retried when the visible desk observes a later minute. The private ledger retains all session events and candidates after End. Monitoring requires the selected session market/account and a visible desk. End does not cancel an open simulator position.

Configure freezes math and policy for an active hunt; end the hunt before adopting changes. Layer visibility remains independent. The API credential remains server-side and must be configured before actual Jev calls can run.

## Monthly $500 paper allocation

Crypto Day Desk selects one separate USD paper account per calendar month, starting at exactly $500. The boundary is the first of the month at 00:00 America/Los_Angeles and follows daylight saving time. This is shared across BTC, ETH and SOL, rather than $500 per asset or hunt. Creation is idempotent by month ID and queues the account to the existing journal bridge. The scoreboard uses the current monthly account’s equity, realized P&L, wins, trades and drawdown. API today reports UTC daily usage and estimated cost without an internal cap. Risk sizing uses that account’s $500 starting allocation.

Rollover adds a new account without editing previous balances or deleting trades, positions, sessions, decisions or notes. The visible desk checks the boundary on refresh. New hunts require the current monthly account; end a prior-month hunt before starting a new one. Open positions retain their original account and brackets and still require fresh snapshots for simulator management; they are not silently closed or transferred at rollover. Previous accounts remain accessible in the journal and original Quant Lab.

The monthly cycle supersedes the initial weekly configuration. Earlier weekly accounts remain in history; no balances, positions or journal entries are migrated or overwritten.

## Monthly P&L goal

The $500 calendar-month account has a 10% monthly target: $50 realized gross P&L and $550 realized gross balance. The scoreboard shows current return, dollar progress, remaining profit and goal-reached status. Progress measures realized account P&L rather than win rate, excludes unrealized positions, and clamps the progress bar to 0–100% while retaining negative or above-target return text. Fees, slippage and API costs keep their existing separate ledger estimates; this goal is explicitly gross of costs. It is a user-defined objective, not a forecast. Meeting the goal does not automatically alter execution or risk policy.

## Entry stop and reward gates

The user-defined hard ceilings/floors are a structural stop no wider than 30 risk ticks and at least 3R gross reward to the nearest active opposite liquidity. Configurable stricter limits are allowed (smaller stop / higher RR). Preferred RR defaults to 5R, and preferred qualified proposals rank first. An oversized structural stop rejects the setup rather than moving its invalidation artificially. Each risk receipt stores the tick scale, its source/as-of, risk/reward ticks, RR and qualification/preference. Decisions receives that bounded risk evidence alongside hunt proposals.

Tick meaning must be selected explicitly: exchange minimum ticks or custom BTC/ETH/SOL trading tick units. Until configured, entries cannot pass. Risk ticks are separate from renderer settings. Verified public product metadata is cached for one hour; failure has a one-minute cache and never invents a fallback. Hyperliquid perp increments follow its significant-figure/size-decimal rule at the reference entry price. These are paper distance gates; they do not claim exchange-order execution or guaranteed stop fills.

Monthly account manual entries and bracket updates re-evaluate actual submitted entry/stop/target on the server, so edits cannot bypass the stop and RR bounds. Both brackets are required. Risk policy adoption creates a new version, preserving historical decisions and policies. A frozen earlier hunt retains its evidence; the current monthly entry gate still applies. The existing dollar sizing, loss limit and monthly P&L goal continue separately.


## Clock in / clock out and session review (2026-10-09)

The monthly $500 allocation and +10% gross goal remain separate from session scoring. Clock in opens the liquidity selector; submit an explicit session name and 1–30 exact active levels. Session policy and chart settings are frozen. A matching active clock is required for Decisions reads and new monthly paper entries. Closing the browser does not clock out.

Clock out ends hunting, preserves any open positions and brackets, and opens the saved session report. P&L is attributed by recorded entry time inside that session, account, provider and symbol. Open trades and pending forward outcomes remain pending; later observations can produce another review revision. The local journal sync includes the review receipt; delivery remains visibly pending when its bridge is unavailable.

Session scoreboard shows elapsed time, gross realized P&L, closed/open counts and monthly session totals. Sessions & reviews shows every session within the current cycle. Full exports retain prior review versions, cycles and research evidence.

Daily reviews accumulate one chosen rule forecast per completed bar, scored on gap-free fixed future horizons separately from trading P&L. Overlapping horizons are correlated. After at least 30 resolved predictions, a frozen candidate confirmation rule can be proposed; later compatible sessions provide observational subset shadow results. This is not an independent full policy replay or model-weight training. Adoption is an explicit human policy change; no automatic promotion.

Taper Decisions receives at most three saved session-review versions published before the completed input minute ended. This historical context cannot bypass current tape, the 30-tick stop cap or 3R minimum / 5R preferred target rule. No future review is backfilled into an earlier API read.

Verification: Python AST and JavaScript syntax checks, read-only health/state responses, and visible Clock in / empty session-review UI. No session was clocked in, no order was placed and no paid Decisions request was made for verification. API key and explicit risk tick scale remain prerequisites for the full workflow.


## Guided Start session setup (2026-10-09)

Start session opens a compact floating three-step wizard: name and API choice, actual active wick-level selection, then an explicit review before starting. Empty or over-30 selections cannot advance. Enter on an earlier step advances rather than prematurely starting. Duplicate final submits are suppressed. Changing market/account while setup is open requires restarting setup. Server freshness and active-level checks remain authoritative.

Choose nearest core levels selects one actual active level above and one below the setup snapshot price from 1H, 30M or 15M, with higher weight used only to resolve equal-distance ties. This convenience creates a watchlist, not a trading signal. The chosen levels are shown as visible chips and in the final summary; the user can edit the checkbox selection. Existing indicator math, wave/channel drawing and risk policy are unchanged. Start session clocks in; Clock out retains its existing review flow.


Five-minute browser session verified 2026-10-09: Coinbase BTC-USD, 1M, 13:15:13–13:20:35 UTC (5m 21s). Two selected core levels produced five contiguous completed-minute events and ten actual level checks, all WAIT. Clock out opened the saved review, created one session score and one daily ledger review, and confirmed journal sync. Zero positions, zero API reads, zero P&L. The test did not exercise order fills, API classification or directional accuracy; risk tick scale and API key remain unset.


## On-chart cyan hunt selection and right margin (2026-10-09)

Pick levels on chart is enabled by default. Hover an actual visible active liquidity wick line for a 2px cyan core and soft cyan halo; click to keep the glow, click again to deselect. Physically overlapping levels with identical price and end time are merged into one hit strip; selecting it selects its available timeframe members. Sidebar chips show exact frame/price and allow removing a member when its line is off-screen. The picker can be toggled off to restore normal chart interactions; it also yields while a native drawing tool is active.

Before Start session, choices are a draft for that provider/symbol and carry into the setup wizard. Choose on chart closes the floating setup so the trader can pick the actual lines. During an active matching hunt, changes call the local session-levels endpoint, validate the current selection revision, and append timestamped levelVersions and human selection receipts. Removal does not require a fresh source snapshot; additions require fresh actual active IDs. Empty selection pauses hunting and API reads. Closed sessions cannot be edited.

Each completed-minute candidate uses the selection version effective before that minute closed. Prior bar events, candidates, journal evidence and learning records are retained. A changed selection invalidates any old entry proposal; a new completed-minute proposal is required. Removing a line does not close positions or change their brackets.

A 32-bar native right margin leaves visible future space beyond the newest candle. Public polling restores the native tail viewport after setMarket instead of truncating that whitespace. User panning into history keeps the historical visible-range path.

Display adapter: crypto-liquidity-picker.mjs uses the existing native renderer coordinate system and adds DOM hit strips/glow; browser screenshots include it, renderer-only canvas exports do not. No Pine source, Elliott/liquidity math or risk policy was changed. Compatibility is bounded to this native Vela renderer, with a guard when its coordinate seam is absent.

Checked: source syntax, visible merged-level selection, second-click deselection and actual hover CSS state (selected false / hover true / glow opacity 1), plus right-gutter screenshot. Live-session selection edits were implemented but not exercised against an actual open trade in this change.

## TypeSafe migration · 2026-10-09

- Skill installed with `npx --yes skills add typesafe-ai/skills --skill typesafe-ai --agent codex --global --yes`. Source: https://github.com/typesafe-ai/skills/tree/main/skills/typesafe-ai. Available to subsequent Codex turns; this integration used the installed instructions immediately.
- Transport stays in the existing Python server using the documented HTTP API; no browser API key or extra Node service is required. `POST https://api.typesafe.ai/v1/systemone`, pinned `jev-1.13.0`, structured `state`, keyed `questions` with `criteria`.
- Tape state and watch bias use Choice; structure clarity uses Score. Independent questions share one request. Answers are validated and adapted to the existing list format; the raw map and full probability distributions are retained. Existing ledger history is preserved.
- Completed OHLC only, continuous minute cadence. User-selected hunt levels, conditional rule candidates, frozen policy and bounded historical reviews form the model state. Missing custom risk ticks or a failed 30-tick / 3R gate cannot be bypassed by a model answer. No wave/chart math or order routing changes.
- Price reference: https://docs.typesafe.ai/models, retrieved 2026-10-09: Jev 1.13 costs $0.042 per million input tokens; output tokens free. Each receipt saves actual input/output counts, rate source/date, latency and estimate. Pending calls record the documented 64k-input maximum ($0.002688) as an informational estimate; it never blocks a call. Failed attempts are retained; unknown billing is conservatively reserved and marked unresolved. Estimated costs are not invoice reconciliation.
- Setup: privately set `TYPESAFE_API_KEY` in `count-dashboard/.env`, restart Count Desk, select cyan hunt levels, and opt in to TypeSafe Jev during Start session. Credentials present means configured, not authenticated. A successful receipt proves an actual API read. No automatic session, paid read or order is created by installation.
- Jev supplies typed judgments, not narrative reasoning. The chat displays its values, confidence/distributions and saved rule evidence without inventing an explanation. Model probabilities are classifications, not calibrated trade win probabilities.
- API docs: https://docs.typesafe.ai/api; design references: https://docs.typesafe.ai/primitives/choice and https://docs.typesafe.ai/cookbooks/function_calling.


## Jev visible session acceptance · 2026-10-09

Coinbase BTC-USD paper session `hunt-c72498991e884bc0889cf1f5c7bbf4f6` ran 14:16:49.635–14:22:11.006 UTC (5m21s), with six unique consecutive completed-minute Jev 1.13.0 reads, 18 typed judgments, 12 selected-level rule checks and zero API failures. Usage: 60,030 input / 732 output tokens; estimated cost $0.00252126. Every research bias was WAIT. No orders or positions were created; risk tick units remain unset. Clock-out review and journal sync passed.

The left chat displays exact question instructions, expandable criteria, actual returned probability maps and confidence, usage, latency and cost; open per-level rule reasons; request-in-flight activity and durable failure events. No private reasoning is claimed. Reload preserved the session and subsequent reads. Python AST and JS module syntax passed; matching cutoffs, question/answer counts and minute cadence were checked against saved receipts. This validates the API and visible journal path, not predictive performance or execution. Chart calculations and Pine source remain unchanged.

Evidence: `/Users/markceleste/Documents/Oct 2026 Charts MYM/Charts/Analysis/1M/BTC_1M_Jev_Session_Receipt_2026-10-09.json` and `Crypto_Taper_Jev_Visible_Session_2026-10-09.md`.


## Session Tracker scoreboard · 2026-10-09

Session-owned receipts now power a clear scoreboard: active/latest session name, UTC clock-in/out, elapsed hh:mm:ss, gross P&L, trades, completed bars/checks, Jev reads/failures, input/output/total tokens, and estimated API USD with six decimal places. Pending requests and unknown failed billing retain separate pending estimated-cost status. New sessions have zero counters; history and clock-out reviews retain prior totals. The daily counter is explicitly labeled TODAY UTC. The timer stops at clock-out; gross trading P&L remains separate from API expenses.

Existing active BTC session `hunt-0ef2fe7ae5b04275a3e66bcb24ff754b` was preserved during the update and ran 5m14.536s (14:23:13.356–14:28:27.892 UTC): 5 real reads, 50,654 input / 610 output tokens (51,264 total), $0.00212746 estimated cost, 5 completed bars / 10 checks, zero failures/pending/unknown charges. All WAIT; no paper orders. Scoreboard totals exactly match API receipts. Clock-out and journal sync passed. Unit checks covered zero, pending, settled, session isolation, separate token directions, and failed unknown billing. Browser verified active/frozen timer and history table usage columns; chart calculations and Pine were preserved. Evidence: MYM Charts/Analysis/1M/BTC_1M_Jev_Scoreboard_Test_Receipt_2026-10-09.json.


## Jev market geometry pack · 2026-10-09

Crypto Day Desk supplies completed-bar geometry to 17 typed questions: three base plus seven frame channel reads and seven cross-context judgments (reaction, break/retest, HTF alignment, selected liquidity, scenario, Fib context, quality). New adapter `web/jev-market-geometry.mjs` reads the unchanged channel/structure engine. Server `taper_geometry.py` validates identity, frame cutoffs, anchors and bounded channel/support/Fib records. Primary and alternate wave metadata now accompany the existing tape state. Broken rays are reference-only; no drawing or order rules changed. Current source preview and all questions are exposed through **Jev questions**. Actual geometry receipts retain `marketGeometry` and `questionPack`; full answers/distributions and a seven-frame matrix render in session chat. Session cost remains actual recorded usage. Legacy reads without geometry keep three questions.

Syntax and browser preview checks passed. No paid geometry read was submitted this turn; end-to-end 17-answer acceptance remains pending the next enabled session. Notes/source preview/public question pack are saved under MYM Charts/Analysis/1M/Taper_Jev_Market_Geometry_2026-10-09.md.

### Loading and API usage repair — 2026-10-09

Jev daily request and spending caps were removed from defaults, policy adoption, Configure, and request admission, including legacy frozen sessions. Cost and attempt receipts remain intact. Live state omits repeated indicator context/settings and redundant model input fields; SQLite and full export preserve the complete evidence. Timed-out browser requests release the polling slot so later refreshes can recover. The local server is launched with output redirected to `data/server.log`, rather than a tool output pipe. Existing trade-risk rules and paused Rider state remain unchanged.

Manual hunt line restoration owns its identity in a per-chart WeakMap because the renderer can filter custom props. Repeated picker animation frames therefore restore each frozen line once; a removed line can be restored without creating duplicates. Wave Court and decision overlays repaint after native market refresh so the renderer cannot clear them silently.
