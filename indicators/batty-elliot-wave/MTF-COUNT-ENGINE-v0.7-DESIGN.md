# Batty Elliott Wave v0.7 — Parent-First Multi-Timeframe Count Engine

Status: architecture decision for rebuilding the count core. This is not a claim that v0.6.6 already implements multi-timeframe Elliott ancestry.

## Decision

Replace the current chart-local engine plus directional HTF filter with a canonical top-down count ledger:

```text
Daily count
  └─ active Daily leg
       └─ 4H count attached to that exact leg
            └─ active 4H leg
                 └─ 1H count attached to that exact leg
                      └─ active 1H leg
                           └─ 30M count attached to that exact leg
                                └─ 15M → 5M → 1M refinements
```

Timeframe is a data resolution, not an Elliott degree. The hierarchy above controls ancestry and evidence. Degree notation is assigned from the selected tree depth. A child correction may move against the parent trend; direction agreement is not a parent-child rule.

## What is wrong in v0.6.6

The current script makes only two external timeframe requests. `f_mtfParentState()` exports confirmed swing direction, an anchor, an invalidation and a structural ID from Daily and 4H. It does not export an Elliott family, stage, wave label, active-leg boundary, candidate set, subdivision evidence or parent count ID.

Every chart timeframe then rebuilds its own pivots, layers and count hypotheses from that chart's bars. The resulting labels share colors and notation but do not share ancestry. The strict Daily/4H direction gate can also reject a valid lower-timeframe correction because opposing direction is normal inside a parent leg.

The supplied ETH charts expose the failure:

| Chart | Observed output | Logic failure |
|---|---|---|
| Daily | Many disconnected provisional `a/b/c` fragments | No selected top-level Daily count owns the history |
| 4H | Isolated `((II))?` and `((III))?` near the current move | Labels are restarted from chart-local depth, not attached to a Daily leg |
| 1H | A few separated `a/b/c` labels plus a recent `(c)?` | No 4H parent-leg identity or boundary |
| 30M | One `((C))?` near the September high | Chart-local root is incorrectly displayed as the highest degree |
| 5M | Repeating independent `a/b/c` groups | Geometric fallback density without higher-timeframe ownership |
| 1M | One isolated high-degree label near the latest decline | No inherited 5M/15M/30M/1H structure |

## Runtime model

### 1. Canonical timeframe ladder

Initial supported ladder:

`1D → 4H → 1H → 30M → 15M → 5M → 1M`

On a chart, request only the canonical ancestors above it. The chart timeframe supplies the leaf analysis. For example:

- 4H chart: request Daily candidate pack; build 4H leaf locally.
- 30M chart: request Daily, 4H and 1H packs; build 30M leaf locally.
- 1M chart: request Daily, 4H, 1H, 30M, 15M and 5M packs; build 1M leaf locally.

Noncanonical chart intervals such as 2H should be marked `UNMAPPED` in the first release or treated only as a local diagnostic refinement beneath the next canonical parent. They must not silently become authoritative parents.

### 2. Candidate pack exported by each ancestor

Each requested timeframe returns a small, fixed candidate pack rather than raw bars or a single direction:

```text
CountCandidate
  sourceTimeframe
  countId
  revision
  family                 // impulse, zigzag; later flat, triangle, diagonal
  stage                  // completed waves/legs
  degreeRank             // internal rank only; display degree comes from ancestry
  startBoundary          // HTF bar time, side, price
  endBoundary            // HTF bar time, side, price
  activeLegStart
  activeLegDirection
  expectedChildFamily
  invalidation
  evidenceState
  scoreComponents
  confirmedThroughTime
```

Return the best three candidates per timeframe so a lower level can choose the candidate that actually attaches to its selected parent. Exporting only the locally best candidate can discard the only candidate that fits the parent.

### 3. Parent-child linker

Starting at Daily, select one preferred and one alternate tree. For every next timeframe, a child is eligible only when all these checks pass:

1. Its complete time interval lies inside one specific parent leg.
2. Its first and final anchors map to that leg's boundaries or current developing endpoint.
3. A completed child subdivides the parent leg with the expected grammar: five for motive, three for simple correction, or the declared corrective family.
4. Hard Elliott rules pass at the child level.
5. The child stores `parentCountId`, `parentRevision` and `parentLegIndex`.
6. A parent revision invalidates or relinks every descendant; descendants never survive as detached counts.

HTF bar timestamps are period boundaries, not necessarily the precise intrabar extreme. Boundary matching therefore uses the parent HTF period plus price/side, then refines the anchor to the lower-timeframe bar that made the same extreme. It must not require equality between a Daily bar-open timestamp and an intraday pivot timestamp.

### 4. Grammar-aware direction

Delete `Daily direction == 4H direction == local direction` as an Elliott gate. Replace it with an expected-role gate:

- Parent motive wave: child sequence must complete the required motive subdivision.
- Parent corrective wave: child sequence may oppose the larger trend and must match its declared corrective family.
- Developing parent leg: permit provisional children but withhold completion labels until the parent boundary confirms.

Direction remains useful for validating individual legs and invalidations. It does not establish ancestry.

### 5. State separation

Maintain three explicit states:

- `CONFIRMED`: based only on closed bars and a confirmed pivot; eligible as ancestry.
- `DEVELOPING`: current incomplete leg; can display provisional children but cannot certify a completed parent.
- `INVALIDATED`: hard-rule or boundary failure; remove from preferred tree and cascade the revision.

All `request.security()` ancestor data must use the confirmed-bar offset with `barmerge.lookahead_on`. Developing HTF state, if shown, must be separately labeled as repainting/provisional and cannot replace confirmed ancestry.

### 6. Rendering contract

Render one coherent selected tree, not every local geometric candidate:

- Neutral `((...))`: selected Daily parent degree.
- Blue `(...)`: direct child degree of the visible parent.
- Red unparenthesized: next child degree.
- Additional degrees use a deterministic notation cycle while retaining `countId` ancestry in tooltips.
- Stack labels only when two degrees terminate at the same mapped pivot.
- Put forecasts only in future space and associate them with a complete `countId/parentLeg` path.
- Diagnostic candidates live behind a separate setting and never masquerade as the preferred tree.

The same structural pivot must keep the same count ID when the user changes chart timeframe. Only the amount of visible subdivision changes.

## Pine data constraints

Pine can request higher-timeframe calculations, but it cannot load unlimited complete datasets for every timeframe. `request.security()` is suitable for ancestor contexts; ordinary lower-timeframe requests return only one intrabar per chart bar, while `request.security_lower_tf()` returns arrays of available intrabars. TradingView also limits unique `request.*()` calls and lower-timeframe bar history.

The design therefore requests compact candidate packs from ancestors instead of copying all their bars into the chart context. Use one tuple or object request per ancestor and set an explicit `calc_bars_count`. On a 1M chart this is six ancestor requests, comfortably below request-count limits, but candidate-pack fields and memory still need profiling.

Official references:

- https://www.tradingview.com/pine-script-docs/concepts/other-timeframes-and-data/
- https://www.tradingview.com/pine-script-docs/faq/other-data-and-timeframes/
- https://www.tradingview.com/pine-script-docs/writing/limitations/

## Recommended historical-data architecture

For durable history and true on-demand recounting, make an external data and count service the source of truth. Pine variables and arrays are runtime state; they are reconstructed when the script reloads and are not a persistent historical database.

```text
licensed market feed
  -> immutable canonical bars
  -> deterministic timeframe aggregation
  -> versioned data snapshot at an as-of cutoff
  -> Daily-first count engine
  -> linked 4H -> 1H -> 30M -> 15M -> 5M -> 1M tree
  -> versioned count ledger and chart response
```

### Stored market data

Store the smallest dependable resolution required by the product, normally one-minute OHLCV, and retain provider-native Daily/4H bars when their session construction matters. Every bar must include provider, venue, symbol, interval, open time, session/calendar version, adjustment/roll policy, OHLCV, completeness state and source revision.

Aggregate every subordinate timeframe from the same immutable base snapshot. Do not mix independently downloaded Daily, 4H and intraday histories without reconciliation; different sessions, continuous-futures rolls and vendor corrections can create incompatible pivots.

### Versioned count ledger

An on-demand result stores:

```text
CountRun
  runId
  symbol / venue
  asOfCutoff
  dataSnapshotHash
  algorithmVersion
  hierarchyConfiguration
  createdAt

CountNode
  countId / revision
  parentCountId / parentLegIndex
  timeframe / degreeRank
  family / stage / direction
  startPivot / internalPivots / activeEndpoint
  status                  // CONFIRMED, DEVELOPING, INVALIDATED
  invalidation
  score and evidence
```

The engine begins with the Daily snapshot, selects preferred and alternate parent counts, then solves each lower timeframe only inside the selected parent leg. A parent revision creates a new descendant tree rather than silently rewriting the prior run. Cache completed runs by symbol, cutoff, data snapshot hash, algorithm version and hierarchy configuration.

### On-demand behavior

The caller can request either the latest confirmed tree or a historical replay cutoff. The service loads only data available through that cutoff, runs the hierarchy top-down, returns the complete count tree plus chart-ready pivots/labels, and preserves the result for comparison and audit. This makes timeframe switching a rendering operation over one count tree instead of six independent recounts.

### TradingView boundary

TradingView Pine should remain a compact visualization and diagnostic companion. It can reconstruct bounded ancestor packs with `request.security()`, but it cannot act as the durable store or directly query a general-purpose custom count database. The primary on-demand output should therefore live in the Batty chart/dashboard. If TradingView display remains required, port the same deterministic rules into Pine for a bounded window or load a deliberately selected snapshot through explicit user inputs; do not describe that as live synchronization with the external ledger.

## Implementation sequence

### Phase 1 — Pure count state

Refactor pivot reduction, candidate generation, hard-rule audit and ranking into functions that can run unchanged in chart or requested timeframe context. Remove chart rendering and forecast objects from this core.

### Phase 2 — Daily authority

Build a Daily candidate pack containing preferred plus alternates. Require a stable Daily `countId`, active-leg identity, invalidation and confirmed-through time. Do not proceed until replay tests show no future leak and stable IDs across chart reloads.

### Phase 3 — 4H linker

Request Daily state on a 4H chart, attach 4H candidates to Daily legs, and prove that changing between Daily and 4H preserves the same Daily pivots and IDs. This is the first real multi-timeframe acceptance gate.

### Phase 4 — Descend the ladder

Add 1H, 30M, 15M, 5M and 1M one level at a time. Each release must pass the same parent boundary, revision cascade and ID-stability tests before the next timeframe is enabled.

### Phase 5 — Corrective families

The current strict impulse/zigzag grammar cannot match the professional reference consistently. Add flats, expanded/running flats, triangles, diagonals, combinations and truncation handling as explicit families with hard rules and separate scores. Unknown structures must remain unknown.

### Phase 6 — Forecasts

Re-enable forecasts only after the selected ancestry is stable. A forecast must cite the complete chain, for example:

`D:<id>/leg4 → 4H:<id>/legC → 1H:<id>/leg3 → 30M:<id>/legiv`

## Acceptance tests

1. The same Daily `countId`, pivots, family and stage appear on Daily, 4H, 1H, 30M, 5M and 1M charts.
2. Every non-Daily label has a valid parent count ID and parent leg index.
3. No child pivot lies outside its parent leg's time/price boundary.
4. A corrective child is not rejected solely because its direction opposes the parent trend.
5. A parent revision invalidates or relinks all descendants in the same calculation.
6. Switching chart timeframe changes subdivision visibility, not higher-level identities.
7. Historical and realtime confirmed states match after reload; no lookahead leak.
8. The chart shows zero orphan labels and zero restarted highest-degree labels on lower timeframes.
9. Preferred and alternate trees are distinct structural interpretations, not duplicate targets with different names.
10. Daily → 4H is validated before 1H and lower are enabled.

## Recommendation

Freeze v0.6.6 as a diagnostic prototype. Build v0.7 alongside it, beginning with Daily → 4H only. Extending the current directional filter and fallback renderer will produce more labels, but it will not create shared Elliott ancestry.
