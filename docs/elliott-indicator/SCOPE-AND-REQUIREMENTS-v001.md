# Chart Technician Elliott Wave Indicator

## 1. Product scope

Build a TradingView Pine Script v6 overlay that explains the market through a ranked set of Elliott Wave interpretations. The intended experience follows WaveBasis's documented visual organization: nested labels, provisional markers, alternate counts, contextual Fibonacci levels, channels, and a compact next-wave assessment. The product name is **Chart Technician Elliott**, with its own code and branding.

The first release is provisionally Pine-only, starting with MYM Daily and 4H analysis. The 1H chart supports structural refinement; 5m and 1m are later execution-context views. A wave degree describes nesting in a pattern, not a fixed chart timeframe. The same engine should ultimately support other liquid instruments, but each market/timeframe requires separate validation.

The objective is a dependable analytical instrument with visible uncertainty. “Most accurate” is an ambition to evaluate, not a specification that can honestly be guaranteed. A valid count is not necessarily the count that will forecast the next move correctly. The engine must be able to return **No qualified count** instead of manufacturing five waves.

WaveBasis documents automatic pattern search, alternate interpretations and editable counts. Its reviewed public materials do not disclose source code, search-space construction, fitted ranking weights, training data, or a reproducible accuracy benchmark. Exact engine equivalence and pixel-identical workspace behavior are therefore not established requirements. We can reproduce observable analytical conventions and build an independently testable implementation. [1–3]

**This delivery:** researched scope, requirements, architecture proposal, visual design, evaluation protocol and staged backlog. It is not a compiled indicator or a claim of equivalent WaveBasis forecasts. No subscriptions, trades or publication are included.

**Release priorities:** correctness and temporal integrity first; readable counts second; useful alternatives and targets third; breadth of rare patterns and scanning after the foundations pass. Existing chart snapshots remain versioned historical illustrations, not sufficient input data for engine validation.

---

## 2. WaveBasis feature mapping

The following is the implementation scope derived from documented behavior. “Adapt” means a Pine implementation with a different interaction, not exact platform parity.

| Documented capability | Planned TradingView implementation | Release |
|---|---|---|
| Automatic counts over a history/range [1] | Bounded automatic search with date inputs, anchor and visible start marker | R1 |
| Stacked labels, bar counts, unconfirmed ? [2] | Degree offsets, optional duration and provisional suffix | R1 |
| Primary plus up to three alternates [3] | Four ranked slots; draw one selected count, optional one alternate | R1 |
| Neutral / impulsive / corrective search [4] | Pattern-family filter; neutral default; bias always disclosed | R1 |
| Context-sensitive fibs and channels [5] | Selected-pattern controls, thin levels and rule-based channels | R1 |
| Next Subwaves across incomplete degrees [6] | Table of degree, next wave, direction, target and invalidation | R2 |
| Short/medium/long commentary [7] | Deterministic prose templates; horizons explicitly relative to degree | R2 |
| Move labels, change family, count subwaves [8] | Fixed editable anchor inputs, mode and family selector; revalidate | R2 |
| Forward pattern projection [8] | Dashed scenario path; target prices separate from schematic timing | R1 |
| Subwave drilldown and chart synchronization [9] | Explicit timeframe inputs; user changes chart; source-TF provenance | R2 |
| Fans, arcs and pitchfork enhancements [5] | Optional independent drawing tools only after core performance passes | R3 |
| Watchlist scanning and setup filters [10] | Deferred bounded scanner or companion service; not full watchlist parity | R3 |
| Saving, sharing, rich multi-chart workspace [9] | TradingView native layouts plus separate versioned export workflow | R2/R3 |

WaveBasis's hover-driven smart tools cannot be ported as arbitrary Pine mouse handlers. TradingView distinguishes user drawing tools from script drawing objects; scripts cannot directly manipulate the former. Editable time/price input points are available and provide a narrower manual workflow. [11,12]

**Design implication:** match the chart's information hierarchy closely; adapt menus, selection and editing to TradingView's actual capabilities. Do not draw fake clickable buttons in a table. Do not promise a Pine panel can change the chart symbol/timeframe or control another chart instance.

---

## 3. Counting rules and interpretation policy

**RULE-01 — Rule registry.** Every implemented rule needs an ID, pattern family, school/profile, formula or predicate, source, severity, boundary behavior and tests. Hard failures exclude a candidate. Guidelines adjust ranking; they never rescue an invalid candidate. Missing internal subdivisions return UNKNOWN, not PASS.

**RULE-02 — Traditional core.** Impulses have five motive/corrective legs. Wave 2 must not cross the origin of wave 1; wave 3 must progress beyond wave 1 and cannot be shorter than both 1 and 5; wave 4 must not overlap wave 1 in the strict profile. Actionary legs require the appropriate internal structure; wave 3 must itself be an impulse. Use tick-normalized comparisons with an explicit equality policy. No undocumented tolerance may legalize a violation. [13]

EWI discusses rare futures overlap exceptions. The initial strict profile will reject overlap, including on MYM, and identify it as an implementation restriction. A futures-exception research profile may be considered later with explicit diagnostics. This avoids quietly converting a rule into a loose fit. [13]

**RULE-03 — Pattern coverage.** R1 detects impulse and zigzag candidates, with nested subdivision evidence where available. R2 adds regular/expanded flats, contracting/barrier triangles, leading/ending diagonals, extensions, truncations and W-X-Y combinations. Running flats, expanding structures and W-X-Y-X-Z require dedicated evidence and fixtures before inclusion. Unsupported families stay unresolved instead of being mislabeled.

| Family | Grammar / position checks | Handling |
|---|---|---|
| Zigzag | A-B-C, 5-3-5; B cannot pass A's origin in the strict template | Separate from generic three-swing correction [14] |
| Flat | A-B-C, 3-3-5; subtype distinguishes B/C endpoints | Numeric subtype tolerances versioned and identified as implementation choices [15] |
| Triangle | A-B-C-D-E; corrective substructure, permitted parent position and boundary geometry | No automatic triangle label from five converging pivots alone [16] |
| Diagonal | Leading versus ending position; subdivision profile, overlap, geometry | Never use as a universal exception for a failed impulse [17] |
| Combination | W-X-Y / W-X-Y-X-Z; component families and connector corrections | Enforce grammar; no arbitrary sequence-of-seven shortcut |

**RULE-04 — Source conflicts.** Elliott Wave Forecast offers a modern sequence interpretation that allows trend movement in corrective structures. Its page also treats momentum divergence and several Fibonacci ratios more prescriptively than this traditional baseline. Store that as a separate optional profile; do not require momentum divergence to validate a traditional impulse or force every trend into five waves. [18]

Fibonacci relationships, alternation, proportions, momentum and volume are supporting evidence unless an explicitly sourced pattern rule requires otherwise. A superficially correct 1–5 label sequence is not proof of a complete Elliott structure.

---

## 4. Proposed counting engine

This architecture is our engineering proposal, not a discovery of WaveBasis's private implementation.

**ENG-01 — Data contract.** Use exchange-qualified OHLC with tick size, timezone, session, adjustment mode, contract identity and data cutoff. Exclude synthetic candles by default. Continuous futures are useful for context; use identified individual contracts for execution testing. Changing a feed, contract roll, session or adjustment setting creates a new analysis context.

**ENG-02 — Pivot candidates.** Compare two causal pivot methods: confirmed left/right pivots and reversal-threshold pivots using tick/volatility normalization. Store both the turning-point timestamp and when it first became knowable. Keep a developing extreme separate from confirmed pivots. Define deterministic equal-high/low tie breaking. A bar containing both extremes cannot establish intrabar ordering without finer data.

**ENG-03 — Nested candidate search.** Build alternating swing sequences at several sensitivities. Construct candidate pattern nodes from admissible contiguous spans; reference lower-degree child nodes. Evaluate several plausible starts and endings. Prune hard-rule failures early. Keep a bounded set of alternatives at each span/degree and avoid exhaustive enumeration of every pivot combination.

Initial engineering budget: three computational degrees, 120 retained pivots per degree and a beam of at most 12 candidates per active family/degree. These are prototype limits to profile, not proven optimal settings. Cap candidate creation and object retention explicitly; surface a truncated-search status if a cap prevents full evaluation.

**ENG-04 — Ranking.** Rank surviving candidates using separately exposed components: subdivision coverage, Fibonacci fit, time/price proportion, alternation, channel consistency, context agreement and simplicity. Start with documented heuristic weights. Weight changes require a version bump and development-set evaluation. Report rank and evidence grade; a normalized score is not a win probability. Structurally different alternatives must survive deduplication even when they share most pivots.

**ENG-05 — Stable identities.** Pattern identity includes symbol, source timeframe, rule-profile version, ordered pivot IDs and family. Keep revisions distinct from fresh forecasts. Deterministic tie breaks must reproduce the same result on identical data/settings. A count may be superseded by new evidence; its prior published state must remain auditable.

**ENG-06 — Explainability.** A selected count exposes hard-rule results, unresolved subwaves, measured ratios, ranking components and why it changed. “No qualified count” includes a useful reason: insufficient history, unsupported correction, no valid candidates, ambiguity or resource cap.

---

## 5. Time, repainting and multi-timeframe behavior

**TIME-01 — Three distinct states.** A pivot can be confirmed while its Elliott label remains provisional. Maintain pivot state (developing/confirmed), count state (candidate/qualified/invalidated/superseded), and forecast state (open/target-first/invalidation-first/expired/ambiguous). “Qualified” means supported within the implemented grammar, not certain future price action.

**TIME-02 — Publication timing.** At bar close, run the finalized-state update and stamp known_at. A pivot anchored several bars back must disclose its confirmation delay. Alerts must never be emitted at the earlier pivot timestamp. Live intrabar previews may move; they must be visibly provisional and excluded from the default evaluation stream.

**TIME-03 — Replay equivalence.** Under identical OHLC, start date, warmup, settings and versions, sequential replay and reload must produce the same closed-bar event sequence. Later reclassification is permitted only as a timestamped revision. Do not promise that all wave labels will remain fixed forever. Feed revisions must be distinguished from software nondeterminism.

**TIME-04 — Confirmed higher timeframes.** Evaluate each higher timeframe in its own context. Use TradingView's documented confirmed HTF request technique where applicable: prior-bar expression with lookahead_on, not unoffset future data. Handle current-timeframe calculations separately. Provenance includes source-bar close and availability time. Merely putting barstate.isconfirmed inside a security request is not a complete design. [19]

**TIME-05 — Lower timeframes.** Do not claim a normal security request reconstructs all intrabars. R1 runs on the chart timeframe; R2 may use bounded lower-timeframe arrays for subdivision evidence. If ordering/history is unavailable, keep the structure unresolved. Do not infer unseen 1m swings from a Daily candle. [20]

**TIME-06 — Degree versus timeframe.** Default reports prioritize Daily and 4H. On 1H, show only the selected parent context and local count; lower-timeframe decoration stays off. Matching counts across charts requires common inputs and deterministic anchoring, not assigning the same degree name mechanically to each timeframe.

**TIME-07 — Frozen cutoffs.** Provide an analysis cutoff input that excludes later bars from candidate selection, ranking and targets. It supports historical review; it does not prove live behavior. Future dates/coordinates are permitted only for explicitly schematic forecast drawings. A screenshot must show analysis version, data cutoff, source timeframe and rule profile.

---

## 6. Visual and interaction requirements

The visual target follows documented WaveBasis conventions while retaining the chart technician's thin-line preference. This is a design specification; exact font, palette and pixel parity still need a successfully inspected reference frame. The supplied videos were not fully accessible during this research. [2,5,6,8]

**VIS-01 — Chart first.** Preserve TradingView candles, background and price scale. No bar recoloring by default. Lines use width 1 in Pine; neither thicker connectors nor opaque target/liquidity rectangles may obscure candles. Default wave labels use transparent backgrounds. Explanatory paragraphs belong in the compact table or tooltips.

**VIS-02 — Nested labels.** Support conventional families: Roman, Arabic and lowercase Roman numerals for motive labels, A-B-C/a-b-c for corrections, A-B-C-D-E for triangles, W-X-Y for combinations. Parentheses and circled/ASCII-safe alternatives distinguish degrees. Default to three visible levels; larger degree sits farther from the same price pivot. Degree naming is relative until the parent context is established.

**VIS-03 — Proposed theme.** Parent labels: blue #69B8FF; local labels: light neutral #E6EDF5; minor labels: muted teal #72CFC4. Manual overrides use amber #E8BE6B and an M marker. Primary projected path is amber dashed; alternate projection is violet dotted; invalidation is red dashed. These colors are proposed choices, not verified WaveBasis color tokens.

**VIS-04 — Density control.** Clean mode draws the selected count, its active target/invalidation and three context rows. Detail mode adds lower degrees, ratios and connectors. Audit mode adds pivot confirmation markers and rule diagnostics. Default label cap is 90. When crowded, hide low-priority child labels rather than move a pivot's anchor or hide invalidation. Test light/dark themes at 1440x900 and 1920x1080.

**VIS-05 — Selection.** Settings select Primary/Alt 1/Alt 2/Alt 3, pattern and degree. One alternate may be compared simultaneously. A static table can show rank/status; it must not pretend to be clickable. Label tooltips provide rule evidence. Fixed paired input.time/input.price anchors offer limited draggable editing; automatic drawing objects are not draggable native Elliott tools. [11,12]

**VIS-06 — Liquidity overlay.** Off by default in Elliott-only mode. When enabled, use thin local segments with real source timestamps, never chart-wide approximations. Required states: unbroken active, broken retained-active, and broken inactive/archived. State transitions must come from explicit indicator data, not guessed colors. Preserve source IDs and original spans; gray/dashed historical levels must not appear to be fresh support. The prior snapshot overlay is an illustration, not the future state engine.

**VIS-07 — Layout acceptance.** Zero opaque chart fills in Clean mode; no duplicate labels on an identical count/degree/pivot; default panel occupies at most 20% of chart area on the reference viewport. Key count, provisional status and invalidation must remain readable with the Batty overlay enabled.

---

## 7. Targets, forecasts, controls and alerts

**FORE-01 — Measured targets.** Calculate target candidates from named anchors. Linear projection: target = end_of_retracement + direction × ratio × prior_wave_length. Retracement levels reference the actual preceding leg. Ratios are configurable guideline presets. Show an area only when its bounds have a defined formula; do not label an arbitrary box a statistical confidence interval.

**FORE-02 — Log option.** Offer explicit linear/log measurement modes rather than guessing the chart scale. Log ratios operate on log price and convert back to price; nonpositive inputs make log mode unavailable. Price axis display and calculation mode must be disclosed independently.

**FORE-03 — Invalidation.** Distinguish a structural invalidation level from an execution stop. Targets do not override Elliott rules. A broken hard rule retires that count and records the failed rule. Crossing a guideline target does not automatically invalidate a count.

**FORE-04 — Forward paths.** Show a primary and optionally an alternate path with different line styles. Horizontal spacing is schematic unless a separately validated time model is enabled. Target hit, invalidation, expiry and uncertain ordering are distinct outcomes. Replacing a forecast cannot erase a failed forecast.

**FORE-05 — Compact assessment.** Display selected family, current wave, next expected wave, direction, unresolved evidence, target and invalidation. Example template: “Candidate wave (4); correction may continue while below [level]. Recovery above [level] changes this scenario.” Use deterministic templates bound to actual state, not generated prose with unsupported certainty.

**CTRL-01 — Input groups.** Data/range; pivot confirmation; rule profile; candidate selection; visible degrees; targets/channels; manual anchors; alert policy; liquidity integration; diagnostics. Every input must affect behavior or be removed. Defaults: neutral bias, confirmed-bar alerts, three degrees, one visible count, fills off, liquidity off.

**ALERT-01 — Event types.** New qualified count, primary changed, invalidation crossed, target entered, target reached and count expired. Alert once per event ID after close by default. Store event ID, pattern ID/revision, source context, known_at, event time, target/invalidation, rule version, score type and provisional flags.

**ALERT-02 — Delivery.** Pine alerts and TradingView webhooks can send an event to an external collector. Webhooks can fail; the collector must deduplicate and record receipt, and not assume complete historical capture. A webhook is outbound notification, not a route for a server to overwrite Pine's internal count. No order execution is part of this indicator. [21]

---

## 8. Feasibility and component boundaries

The Pine-first product must be a bounded incremental engine. TradingView currently documents a 500 ms per-loop limit, total dataset execution limits, 64 plot counts, and maxima of 500 line/box/label IDs and 100 polylines. Request limits are plan-dependent: 40 unique calls normally, 64 on Ultimate. These constraints make a proof of concept a release dependency. [22]

**Proposed R1 operating envelope:** 3,000 analyzed chart bars after a documented warmup; three degrees; four output candidates; at most 300 line IDs, 200 labels, 20 boxes and two tables; no more than eight unique request contexts. Delete/reuse drawing objects explicitly. These budgets are engineering targets, not statements of guaranteed runtime. If the history is shorter than requested, disclose the effective range.

Use arrays/user-defined types and an iterative pattern graph. Do not design the Pine implementation around unrestricted recursion, unlimited combinatorial search or continuous model training. Recompute affected spans on a confirmed pivot instead of scanning all combinations on every tick. The renderer reads state; it must not alter the candidate ranking.

**Component contracts**

- Pivot: ID, time, price_ticks, type, source_tf, known_at, confirmation_method, tie_policy.
- Pattern: ID, family, degree, direction, pivot_ids, child_ids, rule_results, evidence_grade, score_components, state, revision.
- Forecast: ID, pattern_revision, issued_at, price_anchors, target_bounds, invalidation, horizon_bars, outcome and resolution_time.
- Context: tickerid, contract/continuous status, session, adjustments, tick size, timeframe, cutoff, engine_version, settings fingerprint.
- LiquidityLevel: ID, source_tf, price_bounds, origin_time, known_at, break_time, active flag, lifecycle enum, end_time.

**Separate research harness.** An offline reference implementation and test runner should replay exported/licensed OHLC, evaluate fixtures, store forecasts and compare releases. It supports development even when the runtime indicator is Pine-only. It does not require live networking inside Pine.

**Optional companion service.** Broader search, persistent databases, large scans, calibration and report generation belong outside Pine if needed. No documented general-purpose HTTP request or arbitrary inbound data channel is assumed for a Pine indicator. Any hybrid design must explicitly specify where its results display. TradingView's standalone charting-library datafeed API is a separate product, not a way to turn a public-chart Pine script into a custom web application. [20,23]

Batty integration cannot read another script's arbitrary labels, arrays or boxes. Use a shared calculation library, an agreed exposed numeric-series contract, or a separate external event join. Keep liquidity confluence out of Elliott hard-rule validation.

---

## 9. Accuracy and validation protocol

Accuracy is three questions: is the pattern legal under its profile, is the available-time history honest, and does the forecast add predictive value? A beautiful hindsight count answers none of these by itself. Requirements below are prospective acceptance criteria; no results are yet available.

**VAL-01 — Rule fixtures.** At least 120 reviewed cases across enabled families: legal bull/bear examples, each hard-rule violation, exact-equality boundaries, tied extremes, gaps, truncation, insufficient data and ambiguous intrabar ordering. Unsupported family fixtures must return unresolved. Gate: zero accepted hard violations in the adjudicated fixtures; all UNKNOWN cases stay visibly unresolved.

**VAL-02 — Temporal integrity.** Compare bar-by-bar replay, reload and frozen cutoffs under identical data. Test multiple start dates, warmup lengths and live/closed-bar boundaries. Gate: zero unexplained mismatches in finalized events; no alert precedes known_at; every count revision has a reason and timestamp. Rerunning with later bars hidden must not improve an earlier decision.

**VAL-03 — Human assessment.** Build at least 200 distinct cutoffs spanning trends, ranges, volatility shifts and contract rolls, prioritizing MYM Daily/4H. Two independent qualified reviewers label acceptable pattern families, endpoint tolerances, alternatives and unresolved cases while future bars remain hidden. Track agreement; use an admissible set rather than declaring one analyst's labels absolute truth. Target: top-three structural agreement at least 80% on the adjudicated holdout subset, with coverage and abstention reported. This is a proposed gate to revisit before dataset unblinding, not an expected win rate.

**VAL-04 — Forecast evaluation.** Freeze target-first versus invalidation-first, with expiry initially 20 completed source-timeframe bars. Treat neither touched as expired and both touched in one bar as ambiguous unless finer data resolves order. Compare against matched causal baselines: last-swing continuation and a simple pivot-based Fibonacci method, using the same cutoffs, horizons and target-distance policy. Report coverage, sample size, first-touch rate, directional results, error and confidence intervals.

**VAL-05 — Independence.** Split chronologically into development, validation and untouched final holdout. Purge overlapping forecast horizons; embargo boundaries by at least the maximum test horizon. Cluster uncertainty by session/market regime rather than treating overlapping 1m forecasts as independent samples. Keep all attempted parameter sets and failures in a research ledger.

**VAL-06 — Probabilities.** R1 has no numerical probability claims. Later calibration requires a defined event, disjoint outcome categories including expiry where applicable, calibration/test separation, reliability analysis, Brier score and sample counts. More than 300 non-overlapping resolved forecasts per deployed market/timeframe bucket is an initial eligibility floor, not proof of adequate power. Do not normalize arbitrary count scores into percentages.

**VAL-07 — Trading edge.** A profitable trading claim needs a separate predeclared entry/stop/exit strategy, fees, slippage and independent fills. Do not equate forecast accuracy with profitability. Superiority over WaveBasis requires matched as-of inputs and stored vendor outputs; it has not been demonstrated by this research.

---

## 10. Delivery roadmap and acceptance

**M0 — Reference and design freeze.** Confirm Pine-first assumption, intended TradingView plan/history, target contract/feed/session and the selected visual reference. Resolve video access and review screenshots before claiming visual parity. Deliver rule registry, candidate-state schema, labeled visual specimen and fixture index. Exit: every must-have has a test and every source conflict has a policy.

**M1 — Causal pivot / rendering prototype.** Build Pine v6 inputs, pivot records, known-at markers, three-degree labels and bounded object reuse. Deliver a private compilable script, screenshots and replay evidence. Exit: temporal tests and Clean-mode layout checks pass on Daily and 4H. This is not yet a full Elliott indicator.

**M2 — R1 counting core.** Add strict impulse/zigzag grammar, nested evidence grades, ranked primary plus three alternate slots, explicit no-count states, target formulas and invalidation. Deliver rule/temporal fixture results, profiling records and installation instructions. Exit: no hard-rule failures in the agreed suite; no silently asserted subdivisions; all default datasets run without resource errors on the target account.

**M3 — R2 analytical workflow.** Add correction families, carefully profiled diagonals/combinations, confirmed MTF context, selected-pattern edits, next-wave table, revisions and alerts. Exit: each new family has passing fixtures; manual changes cannot bypass validation; alert deduplication is verified; 1H does not drown in lower-timeframe lines.

**M4 — Evaluation release.** Freeze a candidate version and run independent holdout evaluation. Publish both successful and failed forecasts, ambiguity and abstention. Exit: temporal/rule gates pass and forecast results meet the predeclared comparison criterion. If predictive improvement is not supported, release only as an experimental structural aid, without accuracy superiority claims.

**M5 — Advanced options.** Consider scanning, calibrated probabilities, secondary drawing tools and liquidity confluence only after they show incremental benefit over R1/R2. Profile each addition and perform an ablation: retain it only if it improves measured utility or materially improves analyst workflow without undermining reliability.

No credible delivery date can be committed before M1 measures Pine search capacity and confirms available data. Milestones are evidence-based build gates, not time estimates. Mark remains the acceptance authority for layout and practical workflow; rule correctness is assessed against the explicit registry.

**Implementation package required at release:** readable Pine source and version notes; offline reference evaluator; settings examples; rule registry and fixtures; saved datasets or reproducible acquisition manifests; validation report; known limitations; install/update instructions; alert schema and snapshot inventory. Keep previous versions available for comparison.

---

## 11. Decisions, exclusions and research coverage

**Assumptions proceeding without delay:** Pine v6 first, traditional strict default, MYM Daily/4H priority, 1H refinement, one selected count visible, thin lines/no fills, and no numeric win probabilities before calibration. These are reversible design choices. An external-service preference changes runtime/display architecture, not the causal validation requirement.

**Open decisions before implementation:** exact TradingView plan and feed; continuous versus dated MYM research data; ETH versus RTH baseline; available expert-review corpus; allowable pivot-confirmation delay; which manual editing workflow is sufficient. The existing $700 / one-MYM / 30-tick practice constraint belongs in optional execution-risk context, not in wave detection. The engine must not bend its count to manufacture an affordable stop.

**Excluded from R1:** exact proprietary engine replication; full WaveBasis workspace/sidebar behavior; reading arbitrary drawings from other scripts; unrestricted watchlist scanning; training itself online; guaranteed positive sessions; autonomous trade execution; historical-perfect counts presented as available in real time.

**Evidence status.** Official WaveBasis documentation was reviewed for automatic counts, reading labels, alternatives, count bias, enhancements, next subwaves, forecasts, editing and scanning. These documents establish vendor-described behavior; their performance language is not independent evidence. Public source code, ranking weights and reproducible accuracy results were not established.

The supplied Elliott Wave Forecast theory page was reviewed and contrasted with EWI's pattern definitions. Its author-specific interpretations remain labeled. Official Pine documentation was reviewed for drawings, inputs, repainting, requests, limits and webhook delivery.

Video M6l8IrvhkhI opened as a 2:35 player, but captions/transcript export were unavailable and full visual inspection did not complete. Video NeSyZ26yjzA could not be inspected because browser access timed out; direct web retrieval also failed. Neither video is cited as substantive evidence. Both are retained below as pending references. Exact visual matching must wait for verified frames; this document does not claim frame-by-frame review.

The attached visual specimen is an original schematic of the proposed information hierarchy. Its points are synthetic, not live prices, a completed detector output or a WaveBasis screenshot. It is intended to make design review concrete while clearly identifying the remaining visual-reference gap.

---

## 12. Sources and reference links

Research date: September 12, 2026. Source dates below are those exposed by the reviewed pages; otherwise publication/update date was not established. All substantive notes are original summaries.

1. WaveBasis. [Automatic Wave Counts](https://wavebasis.com/docs/reference-guide/automatic-wave-counts/). Updated August 2, 2024. Pattern-search capability; implementation undisclosed.
2. WaveBasis. [Reading a Wave Count](https://wavebasis.com/docs/reference-guide/automatic-wave-counts/reading-a-wave-count/). Label hierarchy, duration and provisional state.
3. WaveBasis. [Alternate Wave Counts](https://wavebasis.com/docs/reference-guide/the-gadgets/alternate-wave-counts/). Primary and three alternatives.
4. WaveBasis. [Wave Count Bias](https://wavebasis.com/docs/reference-guide/automatic-wave-counts/wave-count-bias/). Updated April 24, 2023. Neutral/impulsive/corrective filter.
5. WaveBasis. [Wave Count Enhancements](https://wavebasis.com/docs/reference-guide/smart-tools/wave-count-enhancements/). Targets, fibs, channels and secondary tools.
6. WaveBasis. [Next Subwaves](https://wavebasis.com/docs/reference-guide/the-gadgets/next-subwaves/). Degree-based setup summary.
7. WaveBasis. [Wave Count Forecast](https://wavebasis.com/docs/reference-guide/the-gadgets/wave-count-forecast/). Updated June 28, 2024. Relative-horizon interpretation.
8. WaveBasis. [Modifying Waves and Patterns](https://wavebasis.com/docs/reference-guide/modifying-waves-and-patterns/). Updated October 18, 2024. Editing and forward projection.
9. WaveBasis. [Reference documentation](https://wavebasis.com/docs/). Workspace and drilldown discovery; not source-code documentation.
10. WaveBasis. [Wave Scanner](https://wavebasis.com/docs/reference-guide/the-gadgets/wave-scanner/). Setup search and filters.
11. TradingView. [Lines and boxes](https://www.tradingview.com/pine-script-docs/visuals/lines-and-boxes/). Script drawings versus native tools.
12. TradingView. [Inputs](https://www.tradingview.com/pine-script-docs/concepts/inputs/). Interactive time/price anchors.
13. Elliott Wave International. [Impulse](https://www.elliottwave.com/waveopedia/impulse/). Rule definitions and futures-overlap qualification.
14. Elliott Wave International. [Zigzags](https://www.elliottwave.com/waveopedia/zigzags/). 5-3-5 corrections.
15. Elliott Wave International. [Flats](https://www.elliottwave.com/waveopedia/flats/). 3-3-5 and flat subtypes.
16. Elliott Wave International. [Triangles](https://www.elliottwave.com/waveopedia/triangles/). Five corrective legs and geometry.
17. Elliott Wave International. [Diagonals](https://www.elliottwave.com/waveopedia/elliott-wave-pattern-diagonals/). Ending/leading distinctions and uncertainty in leading subdivisions.
18. Elliott Wave Forecast. [Elliott Wave Theory](https://elliottwave-forecast.com/elliott-wave-theory/). Traditional overview and vendor-specific modern interpretation.
19. TradingView. [Repainting](https://www.tradingview.com/pine-script-docs/concepts/repainting/). Confirmation and future-leak controls.
20. TradingView. [Other timeframes and data](https://www.tradingview.com/pine-script-docs/concepts/other-timeframes-and-data/). Supported request mechanisms and timeframe behavior.
21. TradingView. [How to configure webhook alerts](https://www.tradingview.com/support/solutions/43000529348-how-to-configure-webhook-alerts/). Outbound events and delivery limits.
22. TradingView. [Limitations](https://www.tradingview.com/pine-script-docs/writing/limitations/). Runtime and object budgets; recheck during implementation.
23. TradingView. [Datafeed API tutorial](https://tradingview.com/charting-library-docs/latest/tutorials/implement_datafeed_tutorial/). Separate charting-library architecture; search-discovered context.
24. YouTube. [Supplied WaveBasis video](https://www.youtube.com/watch?v=M6l8IrvhkhI). Partial player access; transcript unavailable; substantive review pending.
25. YouTube. [Supplied reference video](https://www.youtube.com/watch?v=NeSyZ26yjzA). Access unsuccessful; substantive review pending.

Document version: v001. Status: scope proposal, no implementation or accuracy results yet. Related artifacts: VISUAL-SPECIMEN-v001.svg and SCOPE-AND-REQUIREMENTS-v001.pdf.
