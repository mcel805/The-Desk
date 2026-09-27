# Phase 4 proposal — Daily, 4H and 1H usability and forecast repair

Status: diagnosis and implementation plan, not an implemented release. Reviewed v0.3.4-clean source and the four supplied screenshots. Preserve all prior releases. No new indicator code or clipboard replacement in this planning turn.

## Evidence from the current outputs

| Timeframe | Screenshot observation | What it establishes |
|---|---|---|
| Daily | 5/9 root legs interpreted; four unresolved; limited search; P1/P2 have no supported path; latest parent label clipped at top | Incomplete structure and no eligible forecast under current selection/gating. Smaller labels were not sufficient to fix placement. |
| 4H | 6/11 root legs interpreted; five unresolved; limited search; P1 UP 61,707, INV 51,992; P2 UP 100,896 with invalidation partly obscured | Two scenarios exist, but their target distance and display spacing are inappropriate for the visible window. This is not the same failure as Daily. |
| 1H | 3/8 root legs interpreted; five unresolved; limited search; no visible wave labels; P1/P2 unavailable | Some history is interpreted. The screenshot alone does not establish whether those anchors are outside the viewport, omitted by hierarchy, or displaced vertically. |

Coverage is not accuracy. Screenshots cannot establish exact pivot values, confirmed-at timestamps or subdivision validity. The final reference image is a style target from an older Python engine, not native runtime proof or a count to force into all timeframes.

## Confirmed implementation limitations

1. `f_rootDegree` chooses scale principally by retained pivot count, with a 36-pivot stopping threshold. It does not select a local analysis scale for the most recent visible region.
2. The selected root tree controls which children are drawn. Local analysis in unresolved root gaps is off by default. A long-range root gap can leave the 1H trading window empty even when local patterns exist.
3. Parent enrichment is bounded and ordered by existing merit. Recent unresolved legs do not have a reserved search allocation. Child queues and global edge budgets can be exhausted.
4. `f_scenarios` requires a candidate at the last retained pivot of its layer, alive and evidence-supported. `f_pair` chooses alternatives only from four history interpretations and the first eligible degree. It cannot provide two paths consistently when this narrow candidate set fails.
5. `f_forecast` places a target at `anchorTime + timeframe duration * 30` by default. Distance of the target and duration of the underlying swing are not used. Higher-degree targets can appear as almost vertical lines; time increments also do not represent session-aware future trading bars. Spacing is currently schematic, not predicted timing.
6. Label displacement uses a fraction of nominal price or whole-pattern span, multiplied by hierarchy depth. This creates large vertical offsets, especially at intraday scales. Clean labels also remove degree notation, increasing reliance on color and size.
7. Multi-point projected continuations are implemented only for selected stages. Some candidates produce one line to a target rather than a full next-wave narrative.

## Build sequence

### 1. Reproducible capture and diagnostic ledger

Capture the same instrument, adjustment method, session, cutoff, analysis inputs and available OHLC history for Daily, 4H and 1H. Save input hashes and screenshots. Keep the actual loaded history bounds explicit.

For each retained candidate record: ID; family; degree; anchor time/price; confirmed-at time; parent and child IDs; numerical checks; evidence status; searched work/cap; inclusion or exclusion reason. For rendering, separately count nodes outside horizontal view, labels displaced outside price range, hidden layers, label-budget omissions and unresolved regions. Forecast exclusions need separate codes: no terminal candidate, stale, invalidated, target already reached, evidence missing, no distinct second candidate, or unsupported family.

This ledger resolves the 1H blank-chart diagnosis and allows an actual numerical audit of the latest 4H swing. Do not infer a rule violation merely because labels look odd.

### 2. Full-history context plus independently searched local structure

Continue analysis across retained loaded history. Add a local structure search across retained local windows, independent of viewport and whether the largest parent succeeds. Keep local candidates distinct from validated children: a local root is allowed to lack a larger parent, but must pass its own geometry and stated evidence requirements.

Viewport changes select which already-computed scales to display; they must not alter historical anchors or locked predictions. Use explicit Context / Local / Both display controls and automatic display-depth selection with manual override. Reserve work for recent local structure and distribute the remaining budget across older regions. Cache fixed-endpoint searches and avoid repeatedly exploring equivalent branches. Report any cap rather than treating unsearched spans as invalid.

Daily prioritizes multi-year parent context plus the current correction. 4H prioritizes the recent impulse/correction and its children. 1H prioritizes the current swing sequence without requiring a successful multi-year parent count.

### 3. Two-path forecast policy

Two scenario slots remain present on every supported timeframe:
- Prefer two materially distinct, rule-admissible Elliott hypotheses at a suitable local degree, with evidence status disclosed.
- If sufficient Elliott hypotheses cannot be found, use explicit conditional market-structure branches: continuation after a trigger and recovery/reversal after a trigger. Label them **structure scenarios**, not confirmed Elliott counts. Do not invent wave numbers or probabilities for these branches.
- No arbitrary mirrored arrows or artificial second Elliott count. If usable price structure/data are absent, report that rather than fabricate it.

Choose forecasts relevant to the local analysis horizon. Keep larger-degree targets as higher-timeframe context. The 61,707 and 100,896 targets must be traced to their exact anchors/formulas and evaluated for degree relevance; do not simply clamp or shrink their prices to fit the screen. Two bullish candidates may be legitimate, but duplicates with effectively identical conditions should not fill both slots.

Use distinct amber/orange line styles, common issue anchor, visible trigger/invalidation, and conditional continuation vertices where justified. Use deliberate display spacing in trading-bar units, explicitly schematic until a timing model is validated. Off-screen targets need an honest boundary marker and actual price in the summary; do not rescale the whole chart around distant projections.

Freeze the entire pair, including triggers, points, evidence and issuance metadata. Keep market-structure fallback outcomes separate from Elliott outcomes. Measure first target/invalidation, ambiguity, expiry and excursions without treating them as proof of full multi-wave path success. No statistical ranking until prospective samples support it.

### 4. Larger labels and consistent presentation

Default parent labels Huge, children Large, finer labels Normal, all adjustable. Plain letters/numbers remain the default. Blue parents, white children, teal fine structure; amber/orange only for conditional paths. Degree and evidence details stay in hover text; standard degree notation is optional.

Replace nominal-price displacement with volatility/range-aware bounded placement. Handle labels sharing a pivot with ordered offsets; keep labels near their actual swing. Avoid top/bottom clipping and do not distort the price scale merely to fit text. Pine does not expose unrestricted pixel layout, so verify placement at full-history and recent zoom levels. Preserve thin connectors and a small text summary; never restore the large diagnostic grid by default.

### 5. Count review and missing grammar

Audit every selected parent/child edge on each snapshot using exact OHLC. For the last 4H swing establish which degree each 3/4/5 belongs to, whether the endpoint is confirmed or developing, whether corrections satisfy the currently supported grammar, and why each forecast was selected. Different degrees can legitimately show different stages at the same time.

Current checks are a conservative subset of Elliott theory. Flats, triangles, diagonals and combinations remain missing; a zigzag-only correction engine can leave valid lower-timeframe structures unresolved. Add families incrementally with independent positive/negative fixtures and disclosure, based on the rejection ledger. Do not disable the rules or favor impulses merely to increase label coverage.

## Timeframe acceptance matrix

| Timeframe | Required evidence before release |
|---|---|
| Daily | Readable unclipped parent/child labels; explicit current correction or unresolved explanation; two visible conditional paths with correct scenario classification. |
| 4H | Latest swing numerically audited with degree context; forecast targets traceable; local paths visible rather than near-vertical off-screen lines; higher-degree targets separated. |
| 1H | Recent local structure visible when qualifying candidates exist, even with unresolved larger context; diagnostic reason for every omitted recent section; two eligible conditional paths, or explicit data insufficiency. |
| All | Same clean styling; timeframe-specific anchors and horizon relevance; unchanged counts when only display settings change; unchanged locked coordinates after new bars; no runtime error at default settings. |

Native evidence required: TradingView compiler result and screenshots for full-history, recent zoom, both orange paths, and a lock before/after subsequent bars on all three timeframes. Add replay tests for incomplete patterns, cap exhaustion, ambiguous intrabar outcomes and missing second Elliott candidate. Cross-timeframe contradictions must be explained by degree or flagged; independent chart instances are not automatically synchronized.

Local Python tests remain useful but cannot substitute for Pine execution or native screenshots. This is the release gate that prior iterations lacked. Source transmission for external compilation still needs the previously requested explicit authorization; read-only chart inspection and local preparation can proceed independently.
