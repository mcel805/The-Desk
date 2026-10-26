# Swing warning integration · v1.3

Swing Lab's shared collector now calculates the eight v1.3 warning features,
retains their episode lifecycle, sends bounded evidence to Jev and displays tags
on the selected matching 1m Desk chart. The standalone TradingView source and
reference/outcome tools live in `indicators/agentic-swing-tracker-v1.3/`.

## Observation flow

1. Start an observation run in Swing Lab. The supported collector instruments
   remain Hyperliquid BTC/ETH perpetuals. MYM TradingView charts are a separate
   source; no MYM market adapter or alert webhook is added by this feature.
2. The server requests public venue 1m OHLCV and fresh verified quote metadata.
   Its configured cadence defaults to 15 seconds. One saved observation per run
   and sampling slot; extra tabs and charts create no extra requests. The warning
   provisional sub-sampler uses 15-second slots; changing the outer cadence to
   10/30/60 seconds changes available receipts, not a guaranteed four observations.
3. New closed bars advance both the existing structure tracker and the warning
   engine. Existing parent, ABC, permissions, risk and shadow-plan rules remain
   separate. Forming OHLC supplies provisional warnings only; partial volume is
   unavailable. No absent intrabar path is reconstructed from historical OHLC.
4. Closed state, provisional state, source cutoffs, observation time, feature
   configuration and recent events are included in `state.swing_warnings` in each
   saved prediction. They also reach the collection checkpoint, status snapshot,
   history and existing export. Forward lifecycle changes enter `WARNING_EVENT`
   ledger rows in the same transaction as candles, prediction and checkpoint.
5. With Jev enabled, the SAME observation request receives that evidence through
   the bounded projection. `swing_warning_response` classifies building warnings,
   repaired/tracking delivery, a confirmed local turn, or insufficient evidence.
   Existing directional lean, pattern, participation and next-candle questions
   remain separate. The versioned prompt and source hash split old/new cohorts.
6. Chart tags show warning START and severity UPDATE events at recognition/receipt
   time. Hover explains the code, first observation and warmup/forward scope.
   Cleared tags turn gray. Jev dots retain their own directional judgment colors.
   Swing Lab shows all eight feature states, support, pressure, coverage and history.

The local server and awake computer own collection; a browser is a display.
Missed slots are not invented or backfilled. Gaps, revised closed bars and stale
sources retain the existing run barriers. Paused/restarted snapshots remain
archived; restart pauses the collector until a new explicit start. New code only runs after the updated server is
launched and a new run starts.

## Rules and interpretation

The Python engine is checked against the shipped JavaScript reference on the
same synthetic OHLCV and clocks, including both fixed directions and automatic
turn transitions. SLOW/CHOP/DIVERGENCE share one capped delivery family; rejection,
extension, location, volume effort and structure have separate weights. Repeated
bars in one episode are updates, not new independent warnings. Repair clears the
active episode. Structure stages are micro break, protected break, and failed
reclaim or sustained opposite departure. Automatic delivery flips on the next
closed bar after confirmed stage 3; it does not flip on each red/green candle.

Editable warning rules are under **Observation settings → Swing warning settings**.
They are frozen into each run and saved observation. Verified venue tick size
overrides the research tick setting. The original parent direction/manual bias
stay separate from local warning delivery. No order module consumes warning
pressure or the new Jev answer.

Location comes from the Lab's timestamped HTF references, requiring first local
availability before a contact candle starts. Producer known time is retained as
separate metadata. Missing levels/volume/momentum history stay unavailable, and
the coverage mask accompanies every score. Historical warmup tags are labeled
WARMUP and cannot claim forward observations.

## Outcomes and probability

Pressure is a weighted evidence score, **not reversal probability**. Jev's Choice
distribution refers to its contextual question. It is not a trade win rate.

Export raw research data using Swing Lab's existing Export link, then run:

```sh
node scripts/score-swing-warnings.mjs saved-desk-export.json warning-audit.json
```

This offline adapter takes the first saved receipt for each closed cutoff,
deduplicates repeated slots across runs, retains exact instrument/config/code
cohorts and labels outcomes only from that observation's own run bars. The first
saved receipt sets outcome eligibility; a warmup timestamp cannot score a move
before live observation. Missing horizons and both-barrier candles remain
unavailable/ambiguous. The default frozen research question is a 1.0 mean-range
opposite move before 0.5 mean-range continuation, within 10 full future minutes.
It is distinct from the existing next-candle scorecard and trade-plan outcomes.

Chronological session holdout, support, Brier baseline and per-bucket calibration
gates must pass before the research library returns an experimental probability.
The UI remains UNCALIBRATED. No trained MYM model or automatic warning-based
parameter promotion is installed. This feature does not automatically promote warning settings or train Jev. Existing
next-candle and fixed-plan studies remain separate.

## Verification boundaries

Executable parity and service tests cover clocks, four slots, no duplicate model
calls, closed/provisional separation, missing inputs, episode clearing, gap reset,
known levels, config changes, persisted checkpoints and restart. JS tests cover
warning projection, clearing, escaping, stale displays, settings and export audit.
Full Swing Lab, volume, HTTP and Jev reliability regression suites are included.
Browser fixtures use invented data and no paid requests or trading accounts.

The Pine package retains its 73 local checks. Native TradingView compilation and
four-slot alerts remain unverified: the local Vela/PineTS adapter emits only the
first realtime slot. Desk's four-slot collector is independently tested. These
are different runtimes and evidence must not be substituted between them.
