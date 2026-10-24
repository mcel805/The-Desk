# Swing Lab: liquidity trading studies and advisors

Version `liquidity-swing-study.1`, tracker `desk-swing-v1.2-research.2`, Jev
question pack `swing-observer.3`. This extends the existing observation Lab;
the v1 completed-swing audit and its frozen outcome rules remain available.

## Start a study

Launch the local checkout with `python3 server.py --port 18884 --no-workers`,
then open `/swing-lab.html`. Research always starts paused. Review the selected
BTC/ETH market, manual bias, permitted sides, measurement window, entry/risk
settings, optional cost scenario and research phase. Select **Start tracker
only** or explicitly enable Jev. The existing Keychain credential integration
and actual request-cost ledger are retained. No broker object enters the study.

The primary workflow is location → delivery measurement → response → selected
local confirmation → risk/room → opposing objective → outcome. The next-candle
scorecard is a separate diagnostic, not the trade-outcome target.

### HTF locations

The collector fetches completed **Daily, 4H and 1H** candles separately, with
exact symbol, interval, source receipt, completed cutoff, coverage and content
hash. The local context event retains the full source candles when the
completed histories or reference map change; Jev and advisor packets get bounded
evidence rather than the full history on every call. A missing/stale/mismatched/noncontiguous frame stays unavailable. Parent
direction requires Daily/4H HH-HL or LH-LL agreement and non-opposing 1H.
Manual bias is separate and never automatically flipped.

Automatic references use strict two-left/two-right HTF pivots, with distinct
origin, recognition and actual first-observation times. They are **confirmed
pivot references**, not verified orders, qualified Spider blocks, or a claim
of parity with Agentic Liquidity. Missing history bounds their lifecycle claim.
Lower-frame completed touches in retained history consume newly observed refs.

Use **Your HTF liquidity references** for a named Daily/4H/1H location. Specify
upper/lower identity and reaction/objective/both role. The service assigns its
ID and current known time; clients cannot backdate it. Adding/removing a level
ends the prior run. It cannot retroactively produce contacts or entries.

### Separate playbooks

- **HTF_REVERSAL:** an observed approach from away-price contacts a known HTF
  reaction reference. Coincident touched references on one side/bar produce
  one campaign, not multiple confirmations. A gap with no overlap is not a touch.
- **DRAW_CONTINUATION:** an available agreed parent draw plus a fresh corrective
  local tracker-pivot contact. Local and parent direction have distinct roles;
  absent parent agreement cannot manufacture a continuation. Known prior local
  consumption, manual side restrictions and unavailable objectives stay visible.

The objective is the nearest eligible opposing-side HTF reference, frozen at
contact. Without an intact target, complete context or permitted side, record
a blocked campaign. A contacted reference is used once per playbook/run; this
first version does not claim to detect rebuilding or qualified new re-entries.
Repeated sampling is not additional opportunities or independent evidence.

### Measurements and confirmation

Code calculates signed distance/minute, ATR-normalized speed, equal-window speed
ratio, net-progress efficiency, and recent pullback ticks from completed 1m bars.
The default uses adjacent five-minute windows. Same-direction speed ratios below
0.7/above 1.3 describe slowing/accelerating; a sign change is labeled separately.
These are frozen exploratory definitions, not optimized thresholds or forecasts.

Existing causal tracker mechanics supply READY recognition, including the chosen
reclaim/channel/retracement/body/risk gates. A campaign may only use a recognized
READY event observed after the campaign is known. In liquidity-study mode the
tracker binds a developing candidate to that campaign’s frozen HTF target; a
local-pivot target cannot silently substitute for it. A newly observed contact
becomes available to tracker evaluation on the next completed bar, not a
retroactive re-evaluation of the contact candle. Legacy tracker-only mode keeps
its original pivot/measured target rules. Confirmation timing never moves backward
to the pivot origin. Stop/target consumption and expiry cancel later entries.

### Three independent shadow alternatives

1. **touch_only:** signal after observing the completed contact candle.
2. **tracker:** signal after the recorded tracker confirmation.
3. **tracker_jev:** tracker qualification plus a timely, applicable contextual
   Jev fit at/above the frozen threshold (default 0.65, not a win probability).

All variants use the **same frozen contact extreme + stop buffer and HTF target**.
This isolates entry timing rather than silently changing brackets. The raw
tracker's own stop is retained as diagnostic evidence. The eligible entry is
the next full 1m open after actual signal/receipt time. Jev must have seen that
campaign and confirmation; stale/future/old judgments cannot approve it. The
tracker alternative must remain PENDING/OPEN, and Jev must arrive within 75s of
confirmation. Missing API evidence means no model-filtered entry, never approval.

Gap, no-chase, room, per-attempt, parent-count and reserved-risk gates apply.
Each variant has an independent shadow risk ledger; the three are alternatives,
not a three-position portfolio. Study run risk is a conservative unreleased
reservation cap (not a P&L loss limit); it does not reset inside the 24h run.

No BE or stop widening is applied in this comparison. Stops gap adversely at
the open; target gaps receive only the target. Both touched in a candle is
ambiguous unless the open establishes ordering. Time exit uses the frozen
study horizon. Before-entry barrier consumption, missing entry bars, pauses,
gaps/revisions and restarts retain missed/ambiguous/unresolved states rather
than borrowing future data. The core tracker's optional BE is a separate view.

Outcomes include participation/no entry, resolved sample size, gross R, optional
cost-scenario R, confirmation delay, distance already traveled, and whole-OHLC
MFE/MAE bounds. Exit-candle excursions may include movement after the actual
exit; they are not tick-exact. Drawdown is the cumulative realized R sequence,
not intratrade equity drawdown or a capital-weighted portfolio. Costs are unset
by default; a user bps scenario is not verified spread/fees/slippage/funding.

### Development and later validation

Runs freeze configuration, market, code hash, model and prompt. **Forward
validation** requires a closed development run with an exact matching recipe,
apart from the phase field. Its reference ID is saved before collecting the new
run. Only new forward contacts qualify; warmup remains context. Changes to
settings/code/model/questions require a new development reference. The study
archive keeps recipe IDs and phases separate. No automatic training, parameter
winner promotion, calibrated reversal probability or significance claim exists.
The inherited 50/200 swing milestones are audit/exploration checkpoints.

## Jev's role

The ten-question pack preserves directional lean, next-full-candle direction,
pattern and long/short reversal fit, and adds delivery state, liquidity response,
parent/local alignment and independent long/short continuation fit. Code measures;
Jev interprets the supplied bounded completed-bar evidence. A missing location,
conflicting parent or unsupported pattern can remain unresolved/no match.

Typed probabilities/confidence are model outputs for the stated question, not a
calibrated probability of target-before-stop. A contextual label never overrides
the selected tracker/risk/data gates. Raw responses, actual token usage, latency
and failures retain the original cost-accounting path. Questions use one frozen
state; expanded context can increase request size and measured cost.

## RIDER and Spider

**Ask both · same snapshot** queues two read-only reviews over one immutable
packet via the existing local Codex sign-in. Individual buttons are also
available. Reviews are never automatically dispatched on each candle. Their
usage belongs to Codex, not the Jev cost ledger. No live web, shell, apps, MCP,
broker or agent tools are enabled for these packet reviews.

- **RIDER:** delivery swing, local ABC/test, selected entry family, timing/room,
  structural risk, management and comparison review. Uses the bundled October 22
  trading lens plus the Swing Lab role contract.
- **Spider:** parent liquidity map, relevant versus competing pool, level
  lifecycle, obstacles, participant/block/secondary-pool sequence and failure
  branch. Uses the bundled 0.4 playbook plus the Swing Lab role contract.

RIDER's ABC is not Spider's qualified block/trap sequence. This study's pivots do
not supply a deterministic Spider LB/trap detector; Spider must state missing
evidence and wait when its family is unqualified. Advisor stance supports/wait/
conflict/insufficient_evidence is commentary, never an executable trade state.
The UI preserves disagreement, highlights different snapshot hashes, and does
not average opinions into a confidence score.

Packets, prompt/source hashes, requested role, evidence IDs, actual replies and
failures persist. Invalid identity/hash/unknown citations fail validation.
Completed reviews remain as-of and are marked historical as they age. Restart
interrupts unfinished jobs instead of silently resuming. No advisor can modify
study settings, past outcomes, Jev prompts, stops or orders.

## Interfaces and files

- `GET /api/swing/study?symbol=hyperliquid:BTC`: latest persisted complete study.
- `GET /api/swing/study/archive?...`: up to 200 runs, explicit truncation.
- `POST /api/swing/control`: configure/start/pause and timestamped level_add/remove.
- `POST /api/swing/advisors`: explicit same-origin request with symbol and role.
- `GET /api/swing/advisors?...`: compact review status; `/export` retains packets.
- Existing export includes the study and immutable `STUDY_EVENT` ledger records.

SQLite research tables remain private/ignored. New `study_state` holds the
derived run snapshot; immutable events retain campaign/plan/entry/outcome
receipts. `swing_advisories` retains requested review packets and responses.
No key/account/balance/order ticket enters these payloads. Public Hyperliquid
BTC/ETH behavior cannot establish MYM transfer or TradingView numerical parity.
