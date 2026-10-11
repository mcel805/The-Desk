# Taper / Jev — Question and output guide

Date: 2026-10-09. This describes the saved implementation, not a current market read.

## Files and versions

- [Exact 17-question JSON](Taper_Jev_Geometry_Question_Pack_2026-10-09.json)
- [Implementation description and delivery notes](Taper_Jev_Market_Geometry_2026-10-09.md)
- Method: `taper.tape-read.v0.3.geometry`
- Pack: `taper.market-geometry.questions.v1`
- Pinned model: `jev-1.13.0`

The JSON contains the exact instructions and allowed answers. Every question is reproduced below unchanged. These files contain no credentials or private session records.

## What Taper asks

An enabled Crypto Day Desk session prepares a read after each completed 1-minute candle. One Jev request evaluates all 17 independent questions against the same structured state. Questions cannot see one another's returned answers; application code combines their results with the session rules.

| Questions | Purpose | Output |
|---|---|---|
| `tape_state` | Rejection, acceptance or unresolved price action at liquidity | Choice |
| `research_bias` | Watch a qualified long, watch a qualified short, or wait | Choice |
| `structure_clarity` | Agreement between completed structure, liquidity and available parent counts | Score 0–2 |
| `geometry_1d`, `geometry_4h`, `geometry_1h`, `geometry_30m`, `geometry_15m`, `geometry_5m`, `geometry_1m` | Active channel direction in each of the seven frames | Seven independent choices |
| `geometry_interaction` | Completed 1M candle interaction with active channel rails | Choice |
| `geometry_break` | Wick excursion, accepted break, held retest or re-entry | Choice |
| `geometry_alignment` | Higher-frame versus execution-frame channel agreement | Choice |
| `geometry_liquidity` | Geometry support for your selected hunted levels | Choice |
| `geometry_path` | Conditional continuation or rotation scenario | Choice |
| `geometry_fibonacci` | Confirmed-swing Fib context for the current reaction | Choice |
| `geometry_quality` | Completeness and corroboration of geometry evidence | Score 0–3 |

## Evidence supplied

- Completed 1M candles, source identity and cutoff; each higher frame's own completed cutoff and cadence.
- User-selected hunted liquidity levels, frozen risk policy and conditional proposals.
- Seven-frame primary and alternate Wave Court candidates and user timeframe weights.
- Retained active/broken channel counts and direction counts. Detailed records are bounded to two active channels ranked by wick contacts and two recent breaks within eight completed frame bars. Historical indicator data remains stored; every historical channel is not expanded in each request.
- Wick anchors, confirmation times, last safe endpoints, slopes, widths, rail prices, wick contacts and completed-bar position.
- Observed wick breaks, two-close acceptance and held reference retests. Broken rails are historical references.
- Nearby active micro-structure, purple convergence zones and confirmed-pivot Fib references from the configured core timeframe.

Jev receives structured measurements rather than chart screenshots. Hidden display layers still contribute their calculated context. Missing evidence remains unavailable; no unseen candle or order-book depth is inferred.

## How to read a Choice answer

Each answer contains a selected `choice`, a `probabilities` map covering every allowed label, and a `confidence` field between 0 and 1. The application checks the answer type, allowed labels and probability distribution.

**Illustrative example only — not a live result:**

```json
{
  "type": "choice",
  "choice": "FALLING",
  "probabilities": {
    "RISING": 0.10,
    "FALLING": 0.70,
    "SIDEWAYS": 0.05,
    "CONFLICTED": 0.10,
    "UNAVAILABLE": 0.05
  },
  "confidence": 0.625
}
```

The example favors FALLING under that question. Its 0.70 is support for a classification, not a measured 70% chance of a profitable short. Confidence summarizes the answer distribution, not independently validated trading accuracy. The five-choice example follows the documented formula: (0.70 − 1/5) ÷ (1 − 1/5) = 0.625. [TypeSafe confidence documentation](https://docs.typesafe.ai/confidence).

`UNAVAILABLE` means required evidence is absent or incomplete. It does not mean SIDEWAYS. `WAIT` means no adequately supported watch/action scenario under that question's rules.

## How to read a Score answer

- `structure_clarity`: 0 Weak → 1 Mixed → 2 Clear.
- `geometry_quality`: 0 Insufficient → 1 Limited → 2 Moderate → 3 Strong.

A score answer contains `score`, probabilities over numeric rubric indices, a `legend` describing those indices, and `confidence`. Scores can be fractional. For example, probabilities 0.10, 0.30, 0.40 and 0.20 over geometry indices 0–3 produce a weighted score of 1.70. That falls between Limited and Moderate; it is neither a win probability nor a 1.70R target.

## Break and retest interpretation

| Answer | Meaning |
|---|---|
| `INTACT` | Active channel evidence and no recent broken channel. |
| `WICK_ONLY` | Excursion without observed two-close acceptance. |
| `ACCEPTED_UP` / `ACCEPTED_DOWN` | Two completed closes outside the reference corridor; no subsequent held retest established. |
| `RETEST_HELD_UP` / `RETEST_HELD_DOWN` | Accepted break followed by an observed held contact with the historical reference rail. |
| `REENTERED` | Completed price returned inside the broken reference corridor. |
| `CONFLICTED` | Recent channels give incompatible evidence. |
| `UNAVAILABLE` | Required active/break measurements absent. |

Read the break question's instruction sentence together with its explicit criteria: two outside closes establish acceptance; a subsequent held contact is additionally required for a held-retest label.

## Geometry versus trade permission

Hypothetical examples, not current market calls:

- Falling 4H and rising 5M can describe a counter-move. A parent reversal requires further evidence.
- Rejection at a selected lower liquidity level can support a reaction scenario. Entry still requires confirmation and a qualified risk proposal.
- Supportive geometry with missing tick units should leave `research_bias` at WAIT.
- Broken or unverified Fib references cannot serve as active support merely because price is nearby.

The session policy remains maximum 30 risk ticks, minimum 3R, preferred 5R+, with eligible opposite liquidity as the target. Code risk gates and human paper-ticket confirmation govern entries. A WATCH answer does not submit an order.

## What appears in Taper's chat

1. The questions and source measurements for the completed bar.
2. A seven-frame geometry matrix.
3. Interaction, break/retest, alignment, hunted-level, path, Fib and quality judgments.
4. Typed answers and full probability distributions.
5. Rule checks and reasons the paper gate remains WAIT or manual review.
6. Actual request token usage, estimated API cost and latency.

The **Jev questions** preview shows prepared measurements before inference. MODEL NOT RUN HERE means the preview is not an API answer. The interface exposes evidence, questions and returned judgments, not private internal model thoughts.

## Saved output receipt

| Field | Explanation |
|---|---|
| `decisionId`, `createdAt` | Read identity and receipt timestamp. |
| `agent`, `method`, `questionPack` | Taper and evaluation versions. |
| `source` | Provider, symbol, timeframe and completed-bar/source cutoffs. |
| `evidenceHash` | Fingerprint of supplied evidence. |
| `marketGeometry` | Measurements supplied to this read. |
| `questions` | Exact submitted instructions and criteria. |
| `rawAnswers` | Original API answer map keyed by question ID. |
| `answers` | Answers adapted to the UI list, with `name` added. |
| `provider`, `model` | Provider and pinned returned model. |
| `usage` | Actual input, output and total token counts. |
| `latencyMs`, `requestBytes` | Latency and serialized request size. |
| `pricing`, `estimatedUsd` | Pinned rate/source/date and estimated request cost. |
| `mode`, `paperGate` | Paper research mode and application gate. |
| `huntSessionId`, `levelRevision` | Dashboard session and selected-level revision linkage when attached. |

## Session Tracker and cost

The scoreboard aggregates actual reads/failures, elapsed session time, input/output/total tokens and estimated API cost. Usage is for the complete request; this integration does not provide measured tokens or cost for each individual question.

The saved implementation pins input pricing at $0.042 per million tokens and output pricing at $0, with metadata dated 2026-10-09:

```text
estimated request USD = input_tokens × 0.042 ÷ 1,000,000
```

This is the implementation's pinned estimate, not an invoice or a promise about future rates. Session totals are separate from the TODAY UTC aggregate.

## Delivery status at packaging

The build notes report all 17 questions and measured source context displayed in the browser, successful syntax checks and a healthy local dashboard. The expanded 17-question pack had not yet completed a paid inference in those notes. Earlier successful session receipts exercised the previous three-question pack. Packaging these files does not run a new inference, session or trade.

## Exact question instructions and answer criteria

The following sections are generated directly from the saved JSON with unchanged wording.

### 1. tape_state

Type: **choice**

Classify the latest completed 1-minute tape around confirmed liquidity in `state`. Use only supplied bars and levels; infer no unseen candle or order-book depth. When `hunt` exists, prioritize `hunt.selectedLevels` and assess its conditional rule proposals. Historical learningContext is observational context, not proof of improvement.

| Allowed answer / rubric index | Definition |
|---|---|
| `reject_high` | Price touched an upper liquidity level and completed back below it. |
| `reject_low` | Price touched a lower liquidity level and completed back above it. |
| `accept_above` | Completed closes accepted above an upper liquidity level. |
| `accept_below` | Completed closes accepted below a lower liquidity level. |
| `range` | Recent bars remain in a range with no qualified level resolution. |
| `unclear` | Mixed evidence, unresolved direction, or required context unavailable. |

### 2. research_bias

Type: **choice**

Select a watch bias from supplied completed candles, confirmed levels and Wave Court context. This is paper research, never an order or probability of profit. When `hunt` exists, assess only its selected levels using its frozen policy: max 30 risk ticks, minimum 3R, prefer 5R+, nearest active opposite liquidity target. Missing risk scale or unqualified proposals mean WAIT. For `game`, only eligible levels in the matching frozen field govern a paper entry. Higher-frame context and learningContext cannot create new levels or bypass risk gates. Prefer WAIT when evidence is conflicting or insufficient.

| Allowed answer / rubric index | Definition |
|---|---|
| `WATCH_LONG` | Completed tape supports watching a qualified long setup at a selected level. |
| `WATCH_SHORT` | Completed tape supports watching a qualified short setup at a selected level. |
| `WAIT` | No qualified supported setup; confirmation, risk scale, context or evidence missing. |

### 3. structure_clarity

Type: **score**

Rate agreement between supplied completed-bar structure, confirmed liquidity and available higher-frame Wave Court candidates. Missing parent counts reduce clarity. This question cannot see answers to other questions in this request.

| Allowed answer / rubric index | Definition |
|---|---|
| `0` | Weak: conflicting or insufficient completed tape and required parent context missing. |
| `1` | Mixed: some agreement, but an important confirmation or context is absent. |
| `2` | Clear: completed structure, nearby confirmed liquidity and available parent context agree. |

### 4. geometry_1d

Type: **choice**

Classify Daily channel direction from `marketGeometry.frames` where timeframe is `1d`. Use all active directionCounts and bounded channel details. ACTIVE is local to its declared completed cutoff. Broken references do not establish a current trend. If no active channel or cadence gaps, choose UNAVAILABLE. Do not certify an Elliott count or predict profit.

| Allowed answer / rubric index | Definition |
|---|---|
| `RISING` | Active wick-supported channels predominantly rise. |
| `FALLING` | Active wick-supported channels predominantly fall. |
| `SIDEWAYS` | Active channels predominantly have flat slope. |
| `CONFLICTED` | Opposing active channel slopes give no dominant geometric direction. |
| `UNAVAILABLE` | Frame missing, no active wick channel, or source cadence incomplete. |

### 5. geometry_4h

Type: **choice**

Classify 4H channel direction from `marketGeometry.frames` where timeframe is `4h`. Use all active directionCounts and bounded channel details. ACTIVE is local to its declared completed cutoff. Broken references do not establish a current trend. If no active channel or cadence gaps, choose UNAVAILABLE. Do not certify an Elliott count or predict profit.

| Allowed answer / rubric index | Definition |
|---|---|
| `RISING` | Active wick-supported channels predominantly rise. |
| `FALLING` | Active wick-supported channels predominantly fall. |
| `SIDEWAYS` | Active channels predominantly have flat slope. |
| `CONFLICTED` | Opposing active channel slopes give no dominant geometric direction. |
| `UNAVAILABLE` | Frame missing, no active wick channel, or source cadence incomplete. |

### 6. geometry_1h

Type: **choice**

Classify 1H channel direction from `marketGeometry.frames` where timeframe is `1h`. Use all active directionCounts and bounded channel details. ACTIVE is local to its declared completed cutoff. Broken references do not establish a current trend. If no active channel or cadence gaps, choose UNAVAILABLE. Do not certify an Elliott count or predict profit.

| Allowed answer / rubric index | Definition |
|---|---|
| `RISING` | Active wick-supported channels predominantly rise. |
| `FALLING` | Active wick-supported channels predominantly fall. |
| `SIDEWAYS` | Active channels predominantly have flat slope. |
| `CONFLICTED` | Opposing active channel slopes give no dominant geometric direction. |
| `UNAVAILABLE` | Frame missing, no active wick channel, or source cadence incomplete. |

### 7. geometry_30m

Type: **choice**

Classify 30M channel direction from `marketGeometry.frames` where timeframe is `30m`. Use all active directionCounts and bounded channel details. ACTIVE is local to its declared completed cutoff. Broken references do not establish a current trend. If no active channel or cadence gaps, choose UNAVAILABLE. Do not certify an Elliott count or predict profit.

| Allowed answer / rubric index | Definition |
|---|---|
| `RISING` | Active wick-supported channels predominantly rise. |
| `FALLING` | Active wick-supported channels predominantly fall. |
| `SIDEWAYS` | Active channels predominantly have flat slope. |
| `CONFLICTED` | Opposing active channel slopes give no dominant geometric direction. |
| `UNAVAILABLE` | Frame missing, no active wick channel, or source cadence incomplete. |

### 8. geometry_15m

Type: **choice**

Classify 15M channel direction from `marketGeometry.frames` where timeframe is `15m`. Use all active directionCounts and bounded channel details. ACTIVE is local to its declared completed cutoff. Broken references do not establish a current trend. If no active channel or cadence gaps, choose UNAVAILABLE. Do not certify an Elliott count or predict profit.

| Allowed answer / rubric index | Definition |
|---|---|
| `RISING` | Active wick-supported channels predominantly rise. |
| `FALLING` | Active wick-supported channels predominantly fall. |
| `SIDEWAYS` | Active channels predominantly have flat slope. |
| `CONFLICTED` | Opposing active channel slopes give no dominant geometric direction. |
| `UNAVAILABLE` | Frame missing, no active wick channel, or source cadence incomplete. |

### 9. geometry_5m

Type: **choice**

Classify 5M channel direction from `marketGeometry.frames` where timeframe is `5m`. Use all active directionCounts and bounded channel details. ACTIVE is local to its declared completed cutoff. Broken references do not establish a current trend. If no active channel or cadence gaps, choose UNAVAILABLE. Do not certify an Elliott count or predict profit.

| Allowed answer / rubric index | Definition |
|---|---|
| `RISING` | Active wick-supported channels predominantly rise. |
| `FALLING` | Active wick-supported channels predominantly fall. |
| `SIDEWAYS` | Active channels predominantly have flat slope. |
| `CONFLICTED` | Opposing active channel slopes give no dominant geometric direction. |
| `UNAVAILABLE` | Frame missing, no active wick channel, or source cadence incomplete. |

### 10. geometry_1m

Type: **choice**

Classify 1M channel direction from `marketGeometry.frames` where timeframe is `1m`. Use all active directionCounts and bounded channel details. ACTIVE is local to its declared completed cutoff. Broken references do not establish a current trend. If no active channel or cadence gaps, choose UNAVAILABLE. Do not certify an Elliott count or predict profit.

| Allowed answer / rubric index | Definition |
|---|---|
| `RISING` | Active wick-supported channels predominantly rise. |
| `FALLING` | Active wick-supported channels predominantly fall. |
| `SIDEWAYS` | Active channels predominantly have flat slope. |
| `CONFLICTED` | Opposing active channel slopes give no dominant geometric direction. |
| `UNAVAILABLE` | Frame missing, no active wick channel, or source cadence incomplete. |

### 11. geometry_interaction

Type: **choice**

Use only supplied completed-bar `marketGeometry` measurements and `hunt` selected levels. Unavailable context must remain unknown. No unseen candles, order book or guaranteed reversal. Each question is independent. What is the current 1M price interaction with active channel rails? Use lastBar, interaction and position; count simultaneous conflicting rails as MIXED. Broken rails are excluded from active support/resistance.

| Allowed answer / rubric index | Definition |
|---|---|
| `LOWER_REJECTION` | Completed candle touches a lower active rail and closes away above it. |
| `UPPER_REJECTION` | Completed candle touches an upper active rail and closes away below it. |
| `EDGE_TOUCH` | Touches an active edge with little completed rejection evidence. |
| `INSIDE` | Within active channels away from edges. |
| `MIXED` | Opposing channels/both-edge contacts conflict. |
| `UNAVAILABLE` | No active 1M channel or required measurements missing. |

### 12. geometry_break

Type: **choice**

Use only supplied completed-bar `marketGeometry` measurements and `hunt` selected levels. Unavailable context must remain unknown. No unseen candles, order book or guaranteed reversal. Each question is independent. Assess recent 1M break quality. Use breakState and breakAgeBars <=8. WICK_ONLY is not a confirmed trend break; confirmed/retest states require observed two outside closes and a subsequent contact. After break, rails are historical references only.

| Allowed answer / rubric index | Definition |
|---|---|
| `INTACT` | No recent broken channel and at least one active channel. |
| `WICK_ONLY` | Recent excursion has no two-close acceptance evidence. |
| `ACCEPTED_UP` | Recent upward two-close break without subsequent held retest. |
| `ACCEPTED_DOWN` | Recent downward two-close break without subsequent held retest. |
| `RETEST_HELD_UP` | Recent upward break then observed held reference retest. |
| `RETEST_HELD_DOWN` | Recent downward break then observed held reference retest. |
| `REENTERED` | Recent broken channel with completed price back inside its reference corridor. |
| `CONFLICTED` | Different recent channels give incompatible break evidence. |
| `UNAVAILABLE` | No available break/active evidence. |

### 13. geometry_alignment

Type: **choice**

Use only supplied completed-bar `marketGeometry` measurements and `hunt` selected levels. Unavailable context must remain unknown. No unseen candles, order book or guaranteed reversal. Each question is independent. Assess Daily/4H/1H channel context against 15M/5M/1M channels directly from frame evidence. User frame weights give higher frames more influence. Do not see other question answers. Missing required parent channels means UNAVAILABLE, not alignment.

| Allowed answer / rubric index | Definition |
|---|---|
| `UP_ALIGNED` | Higher and execution frames predominantly rise. |
| `DOWN_ALIGNED` | Higher and execution frames predominantly fall. |
| `PULLBACK` | Execution slopes oppose a coherent higher-frame channel trend. |
| `CONFLICTED` | Higher frames or execution frames disagree without a clear parent. |
| `UNAVAILABLE` | Insufficient active channels to establish higher-to-lower relationship. |

### 14. geometry_liquidity

Type: **choice**

Use only supplied completed-bar `marketGeometry` measurements and `hunt` selected levels. Unavailable context must remain unknown. No unseen candles, order book or guaranteed reversal. Each question is independent. Does geometry currently support a reaction at a user-hunted liquidity level? Compare selected prices/sides to supplied 1M active rail levels, wick tolerance/ATR, microStructure and convergence. Higher-frame direction is context only. No unselected price is an entry. Missing risk units still block research_bias WATCH entries.

| Allowed answer / rubric index | Definition |
|---|---|
| `LOWER_SUPPORT` | A selected lower liquidity level is near qualified active lower geometry and completed support reaction. |
| `UPPER_RESISTANCE` | A selected upper liquidity level is near qualified active upper geometry and completed resistance reaction. |
| `BOTH_SIDES` | Both hunted sides have geometric support without a resolved reaction. |
| `AGAINST` | Geometry is accepting through or opposing the hunted reaction. |
| `NO_OVERLAP` | Available geometry is away from selected levels. |
| `UNAVAILABLE` | No selected level or required active geometry available. |

### 15. geometry_path

Type: **choice**

Use only supplied completed-bar `marketGeometry` measurements and `hunt` selected levels. Unavailable context must remain unknown. No unseen candles, order book or guaranteed reversal. Each question is independent. Which conditional market path is most supported by supplied geometry and recent completed tape? Consider all seven frames and unresolved wave alternates. This is a qualitative scenario, not a hit-first probability, an order, or guaranteed forecast. Missing/conflicting parents must favor WAIT.

| Allowed answer / rubric index | Definition |
|---|---|
| `CONTINUE_UP` | Rising context with observed acceptance supports watching continuation up. |
| `CONTINUE_DOWN` | Falling context with observed acceptance supports watching continuation down. |
| `ROTATE_UP` | Observed lower-edge rejection supports watching rotation toward upper liquidity. |
| `ROTATE_DOWN` | Observed upper-edge rejection supports watching rotation toward lower liquidity. |
| `WAIT` | Unclear, conflicting, no validated reaction, or key parent evidence missing. |

### 16. geometry_fibonacci

Type: **choice**

Use only supplied completed-bar `marketGeometry` measurements and `hunt` selected levels. Unavailable context must remain unknown. No unseen candles, order book or guaranteed reversal. Each question is independent. Assess the supplied core-timeframe confirmed-pivot Fibonacci measurements against the completed 1M tape. They are conditional references even when chart display is off. Identify whether current interaction around active untapped/tested levels reinforces a geometry reaction. Broken or unverified levels cannot count as active support. Do not fabricate missing swing anchors.

| Allowed answer / rubric index | Definition |
|---|---|
| `SUPPORT_CONTEXT` | Unbroken Fibonacci area aligns with observed lower-edge support. |
| `RESISTANCE_CONTEXT` | Unbroken Fibonacci area aligns with observed upper-edge resistance. |
| `NO_ACTIVE_OVERLAP` | Available unbroken Fib references do not reinforce current geometry interaction. |
| `BROKEN_CONTEXT` | Relevant Fib area has already been broken by completed closes. |
| `UNAVAILABLE` | Swing anchors/levels unverified or absent. |

### 17. geometry_quality

Type: **score**

Use only supplied completed-bar `marketGeometry` measurements and `hunt` selected levels. Unavailable context must remain unknown. No unseen candles, order book or guaranteed reversal. Each question is independent. Score evidence quality for the geometry read. Consider wickContacts, same-frame cadence, age, active versus archived references and disagreement. This is an evidence-quality rubric, not probability of profit. A third wick contact corroborates two anchors; do not call two anchors alone a third validation.

| Allowed answer / rubric index | Definition |
|---|---|
| `0` | Insufficient: missing channels, gaps or conflicting geometry. |
| `1` | Limited: two anchor contacts with weak corroboration or missing parent context. |
| `2` | Moderate: extra wick contacts and consistent recent structure, but one important conflict. |
| `3` | Strong: corroborated active rails, recent observed reactions, complete aligned parent context. |

