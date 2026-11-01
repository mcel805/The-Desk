# Agentic - Geometry - Volume

## Purpose and source research

One Desk study combines independent 1H/30M/15M/5M/1M geometry, venue OHLCV
participation, observed sweep/reclaim and the house corrective ABC reversal.
The 1M chart is the entry view. It continuously distinguishes AREA, ABC FORMING,
B BREAK, RETEST and QUALIFIED PAPER. No tables, account integration or live
orders. A qualified observation is not evidence of a fill or a trading edge.

The supplied Trade The Plan Rules & Guidelines (2017), pp.3–8, separates context,
area and confirmation. Pages 8–12 describe climax/churn, divergence and the first
higher low/lower high; pp.11–15 place stops behind geometry and prefer at least
3R to the first objective. The 2016 Warning Lines handout has 44 mostly scanned
chart pages; pages 11/16/21/27 show reactions around parallel outer lines. The
2016 Backtesting handout pp.2–4 combines corrective ABC, intersecting geometry
and volume; pp.5–10 illustrates slope copies, median lines, climax/churn and
warning-line rejection. These are teaching examples with hindsight, not causal
backtest records. Their drawing palettes and horizontal/parallel line spacing
inform the design; indicator output must be validated separately.

Sources were read locally and SHA256/page manifests retained in the research
artifact directory. The attached video links were attempted but unavailable to
the web tool; no transcript was inferred. Supplementary primary documentation:
https://emini-watch.com/free-stuff/volume-indicator/ (effort/range and churn), and
https://chartschool.stockcharts.com/table-of-contents/chart-analysis/chart-annotation-tools/andrews-pitchfork
(three-pivot median construction; not interchangeable with a two-anchor channel).

Existing modules: GeometryFrame/source coordinator and replay clock; Taper's
rolling climax/churn concepts; Agentic Sweep Entry v1.5.1's strict micro pivots,
minimum tick/ATR swing, frozen pool, sweep/reclaim and expiry; ABC Reversal's
corrective low/high/lower-low (or mirror), confirmed C, later B closing break and
subsequent held retest. The new study independently composes these concepts;
it does not require separately installed studies or impersonate their full
outputs. House corrective ABC is not a validated Elliott-wave count.

## Operational definitions chosen for this implementation

These defaults are explicit research definitions, not proprietary TTP parity.

- Source candles: completed standard OHLCV only, verified instrument tick;
  retain up to 1,600 1M bars to cover the anchored volume session and 600 bars
  per parent frame (the existing bounded geometry anchor window is separate);
  existing Coinbase 30M aggregation requires two completed 15M components.
- Context: independent 1H,30M,15M directions must agree for with-trend permission.
  Missing, stale, unresolved or conflicting parents block qualification. 5M is
  confirmation context; a micro turn never rewrites the parent direction.
- Area: wick-audited channels retain their exact anchors. Add center median and
  one channel-width outer warning parallel on each side. These are channel
  parallels, not an Andrews pitchfork. Projected areas are marked as projected
  in the evidence and rendered as dashed extensions, never represented as
  wick-audited future bars. No forward price forecast.
- Area confluence: touch within max(4 ticks, .12 of prior ATR14), at least two
  distinct source frames. Same-family sibling rails never count as two frames.
- Sweep: a strict 1M pivot (one bar on each side) and alternating swing clearance
  max(4 ticks, .25 ATR at anchor); pre-existing pool exceeded by one tick; close
  reclaim within three bars. Pool is consumed once. A both-side sweep on one
  candle is ambiguous and cannot arm an entry. This is OHLC sweep evidence,
  not proof of resting stops or aggressor trades.
- Volume: venue-local raw volume, RV20 against prior 20 bars, volume/range
  density, rolling 16-bar climax/churn and climax-then-churn. Zero range has no
  density; missing/zero baselines cannot qualify. Rolling RV20 is explicitly not
  TTP same-time Relative Volume. VPS on minute bars is only an average rate;
  no tick/VPS burst or bid/ask delta is invented.
- Value: the intraday continuation gate requires price inside one standard
  deviation of a fully observed anchored VWAP session. The default anchor is
  00:00 UTC, configurable by UTC hour. VWAP and its deviation use bar typical
  price weighted by venue volume, not tick-level VWAP. Missing start/gaps leave
  the value area unavailable and block qualification. This does not infer an
  exchange session calendar from a chart screenshot.
- Divergence: confirmed pivot comparisons in price versus RSI14 and RV20;
  publish at pivot confirmation, not anchor time. This is an independent proxy
  for the proprietary momentum/volume tools. Recent 1M or 5M evidence is required.
- ABC: area contact starts a campaign. Confirmed A/B/C after contact; C extends
  A by at least one tick. C is a pivot, not an entry. B break needs a later
  completed 1M close, followed by a later bar's held B retest. Sweep/reclaim and
  volume/divergence must belong to that campaign and remain within expiry.
- Risk: freeze stop beyond C and reclaimed sweep block plus two ticks. First
  opposing known geometry/unswept pivot is the objective. No fabricated 3R
  target: absent/nearby objective blocks qualification; require net room >=3R after configured fees and slippage; show gross room
  separately in audit evidence. Stop prices round outward to the verified tick.
- Paper observation: a qualified close schedules a hypothetical next-bar-open
  entry. Recheck room at that open, charge configured fees/slippage, stop-first
  on a same-bar stop/target ambiguity, and mark missing intervals unresolved.
  Limit two stopped paper observations per frozen area; new area required after.
- No automatic Elliott count, unconfirmed V-top entry, discretionary averaging
  down, proprietary VPS equivalence, or old contract-margin rules. The documented
  source framework includes discretion; software makes its narrower rules visible.

## Implementation plan

1. Reuse source loading and completed-time ordering with before/after feed hooks.
   Implement rolling volume, strict sweeps, geometry areas and ABC campaign as
   separate deterministic units. Keep bounded ledgers and resumable checkpoints.
2. Add a dedicated numeric worker profile and exact catalog-source fingerprint.
   Edited Pine runs its own chart-local code with an explicit scope warning.
3. Render a native-timeframe swing path, all five enabled geometry maps,
   center/outer parallels, small volume bars and one current margin callout. No tables
   or large dashboard. Parent directions and the next missing condition use a
   slim strip. Settings control frame selection, density and visibility.
4. Register Agentic - Geometry - Volume in the Desk indicator picker. Add settings,
   state persistence and read-only audit export; existing studies remain available.
5. Verify hand-calculated geometry, volume zero/gap/warmup, mirrored sweeps and
   ABC stages, no-lookahead prefixes, unchanged locked anchors, missing-source
   blocking, settings isolation, revision/replay/checkpoint behavior, paper fees,
   next-open fills and ambiguous stops. Exercise the actual catalog/worker/chart
   on desktop/mobile and light/dark themes; capture rendered proof.

## Acceptance boundary

Local deterministic tests and synthetic browser acceptance prove mechanics and
rendering only. A reproducible replay command records source identity/cutoff,
settings, counts, unresolved cases and hypothetical outcomes. It does not claim
native TradingView MTF parity, exact TTP proprietary parity or profitability.

## Running and checking the study

In the Desk choose **Indicators → Agentic - Geometry - Volume → Add**. The study
owns its five sources, sweep pools and ABC campaign; separate installed studies
are not required. Use the 1M chart for entry evaluation; the study can be viewed
on 1H/30M/15M/5M/1M charts. All five enabled source frames draw their own
channel maps on every viewing interval, retaining full source anchors rather
than clipping parent geometry to the shorter 1M history. Click 1H/30M/15M in
the slim strip to emphasize a parent color; the other enabled maps remain
visible. Each chart uses its own timeframe for the dominant locked swing path
and venue-volume strip. The ABC entry path and dots remain on 1M/5M views;
entry confirmation always uses 1M. **Line view**
changes price display; geometry calculations still use wicks. Source toggles and
show/hide controls are drawing choices, not permission changes. A gray missing
frame or a blocker in the bottom caption means the setup is still unqualified.

The download icon exports source candles, inputs and the recorded ledger to a
local JSON file. Run a bounded replay from the app directory:

```sh
node tools/replay_geometry_volume.mjs exported-evidence.json replay-report.json
node --test tests/test_geometry_volume.mjs tests/test_geometry_volume_worker.mjs
python3 -B tests/launch_geometry_volume_fixture.py --port 18917
CHROME_DEVTOOLS_AXI_PORT=19897 node tests/verify_geometry_volume_browser.mjs /tmp/gv-browser
```

Replay accepts at most 2,000 minute bars and 1,200 bars in each parent source,
clips all future candles at the supplied cutoff and rejects mixed instruments.
Reports label hypothetical next-open entries, skipped opens, stop-first ambiguous
bars, fees and unresolved gaps. Counts concern the bounded retained window;
longer-running chart anchors can predate an exported raw window. The ledger
snapshot is provided separately and is not silently treated as recomputed data.
A synthetic replay with zero qualified observations proves neither success nor
failure of a market edge. Validation includes hand-defined positive and negative
qualification cases alongside end-to-end OHLCV mechanics and actual rendering.

Display ownership: a just-qualified paper sequence, or its still-pending/open
hypothetical observation, keeps the current ABC path/callout ahead of an older
blocked opposite campaign. Once that paper observation ends, active developing
sequences can take display priority again; historical evidence is unchanged.
The extra-wick-contact threshold applies to confluence areas, the objective
universe and context channel selection, as well as the inherited geometry ledger.

## TTP-style geometry map and clear annotation margin

The Warning Lines handout pp.11/21 and Backtesting handout pp.3/6 show multiple
long and local slopes, channel boundaries, medians and outer parallel lines
together. The hosted drawing follows that hierarchy using the existing audited
channel ledger: stronger main rails, finer dotted medians and lighter dashed
warning parallels. Each frame retains three distinct channel families by default
(configurable from one to eight). Near-duplicate rail pairs are suppressed;
historical slopes remain available with their exact audited endpoints. Any
extension beyond an audited endpoint is dashed and identified as untested.
Optional forward projections are controlled separately. This is a drawing
interpretation of the supplied examples, not an Andrews pitchfork implementation.

A small shared right-margin reservation keeps current ABC status after the latest
price bar. The old centered speech box and its diagonal leader are removed.
On-chart ABC text is replaced by small pivot dots; the full stage is in the
margin and bottom caption. If panning removes the clear margin, the floating
status hides instead of covering candles. Hide/remove releases the owned margin;
user panning and larger existing margins are preserved. No tables are added.

The source fingerprint and strategy calculations are unchanged, so saved catalog
studies retain their hosted behavior and frozen evidence. The newly exposed
channel-density/history drawing controls trigger redraws, not source refetches or
qualification changes. Focused verification:

```sh
node --test tests/test_geometry_volume_map.mjs tests/test_geometry_volume.mjs tests/test_geometry_volume_worker.mjs
python3 -B tests/launch_geometry_volume_fixture.py --port 18919
GV_FIXTURE_URL=http://127.0.0.1:18919/ CHROME_DEVTOOLS_AXI_PORT=19898 node tests/verify_geometry_volume_map_browser.mjs /tmp/gv-map-browser
```

## Watched ABC display

The supplied Swing Tracker 1.9 reference is Pine v6. Its house continuation
model uses a confirmed parent origin O, delivery O–A, retracement A–B, then
continuation B–C. It distinguishes recognition time from retrospective pivot
location, freezes confirmed endpoints, emphasizes one selected cycle, and makes
extra parent zigzags optional. Its projected objective is conditional.

Geometry Volume retains its existing corrective reversal semantics: A, opposite
B, extended confirmed C, later closing B break and subsequent held retest. The
reference's O is not invented or mapped onto this different pattern, and no
measured-move forecast is added. This revision adopts its visual hierarchy only.

**Focus on one ABC** defaults on, including for existing saved studies. It
suppresses the unrelated native swing zigzag while retaining all geometry maps.
Turn it off to restore optional background swing paths. Only the watched
campaign draws a bold path, with a contrasting halo, cyan rising legs and pearl
falling legs (dark teal/slate on light themes), and endpoint hashes/dots. The
right-margin annotation identifies the campaign by start time, direction, stage,
and A/B/C prices formatted to the verified instrument tick precision; missing points
say pending. Small dots remain at pivot locations
and labels stay off the candles. Qualification rules and recorded evidence are
unchanged. Confirmed pivots do not alone imply a qualified reversal.
