# The Trader — Multimodal Session Analysis Specification v0.1

## Product center

The Trader begins with what the trader actually did, not with a preselected indicator or algorithm.

September 9 scope update: actual broker exports determine executions and measurable trade results. Screenshots explain chart context and liquidity-zone selection, not execution truth. The trader's stated workflow is daily market structure/bias/draw down to a one-minute entry; intermediate steps must be reconstructed from evidence. See [the current style-study brief](../research/upload-data-1/STYLE-STUDY.md).

The trader submits:

- screenshots and still images;
- full or partial screen recordings;
- chart recordings with visible time, instrument, timeframe, drawings, orders, and positions where available;
- voice or text explanation of swing/day-trading style;
- broker statements, fills, or order exports when available;
- optional post-session reflection.

The system creates a time-aligned session record, divides the session into eight sub-sessions, measures behavior and outcomes, and turns observations into hypotheses for controlled testing.

## The eight-sub-session model

“Eight sub-sessions” is a required product structure, but the boundaries must be explicit and configurable. The initial implementation should support either equal time windows or trader-defined boundaries, with the boundary method saved in the session record.

Default representation:

| Sub-session | Purpose | Example measurements |
|---|---|---|
| 1. Pre-market/context | Establish the initial market map and plan | bias, levels, scenario count, scheduled events, planned risk |
| 2. Opening observation | Capture the first live conditions before or around entry | volatility, range, liquidity, missed/ignored setups |
| 3. Setup formation | Identify when the trader believed a setup was forming | setup type, context, confirmation, confidence, invalidation |
| 4. Entry decision | Evaluate the actual decision to enter, wait, or pass | entry price, timing, size, stop, target, planned R:R |
| 5. Position management | Measure decisions while in the trade | stop movement, scaling, target changes, rule adherence |
| 6. Exit and immediate aftermath | Evaluate the exit and near-term consequence | exit reason, realized R, MFE, MAE, slippage, missed continuation |
| 7. Re-entry or later-session behavior | Identify repetition, revenge trading, hesitation, or adaptation | new setups, repeated errors, exposure, emotional state |
| 8. Review and close | Capture the trader’s own interpretation and next action | lesson, rule change proposal, unresolved question, evidence quality |

These are analytical phases, not claims that every trading day has the same market structure. The system must allow a sub-session to be marked `not_applicable`, `unclear`, or `insufficient_evidence` rather than inventing observations.

## Analysis pipeline

```text
Upload → ingest → transcribe/OCR → identify time anchors → align evidence
   → segment into 8 sub-sessions → extract events → reconcile fills
   → calculate metrics → compare sessions → propose hypotheses
   → human review → approved rule/version → controlled test
```

### 1. Ingest

Record the original file, checksum, upload time, duration, frame rate, timezone if known, source device, and whether the recording is complete. Preserve the original. Derived transcripts, thumbnails, OCR, and event annotations are separate artifacts.

### 2. Understand visual and audio evidence

Use video sampling and key-frame extraction to identify:

- instrument, contract, timeframe, session clock, and chart state;
- visible price levels, drawings, indicators, DOM/order panel, orders, positions, and P&L;
- moments when the chart, order state, or trader behavior changed;
- spoken or written explanations and uncertainty language.

The model should cite the file and timestamp for every material observation. “The trader moved the stop” is an observation only when the recording supports it; “the trader was emotional” is a hypothesis unless the trader states it or the evidence is explicitly labeled as behavioral interpretation.

### 3. Align time

All observations need a confidence-rated time anchor:

- exact timestamp from screen or broker record;
- timestamp inferred from recording metadata;
- relative recording time only;
- unresolved.

Broker fills and order records override visual estimates for actual execution. Visual evidence remains valuable for intent, hesitation, context, and decisions that never became orders.

### 4. Segment

Create eight sub-session records using the configured boundary method. A session may contain multiple setup events inside a sub-session. The product must not force one trade per segment.

### 5. Extract events

The event vocabulary should begin with:

- context observation;
- planned setup;
- valid setup observed;
- setup rejected or skipped;
- order intended;
- order submitted;
- order filled, partially filled, rejected, or canceled;
- stop/target created or changed;
- scale-in or scale-out;
- manual exit;
- rule deviation;
- emotional/discipline note, explicitly sourced;
- session pause, stop, or review.

Each event stores `observed`, `inferred`, or `user_reported` provenance, plus confidence and evidence references.

## Measurable data model

### Session-level fields

- session ID, trader ID, date, market, instrument/contract;
- recording completeness and evidence quality;
- session start/end and timezone confidence;
- planned risk, actual maximum risk, and daily loss limit;
- market regime/context labels with evidence;
- number of eligible setups, taken trades, skipped trades, and ambiguous cases;
- total realized R, net P&L, commissions, slippage, drawdown, and exposure;
- rule adherence and unresolved questions;
- session review status.

### Trade/setup-level fields

- setup ID and style-rule version;
- context and timeframe;
- direction, entry, stop, target, size, and time-in-trade;
- planned R:R and realized R:R;
- initial risk, maximum adverse excursion (MAE), maximum favorable excursion (MFE);
- entry/exit quality, fill quality, and slippage;
- outcome: win, loss, scratch, missed, rejected, or unclassifiable;
- rule adherence, deviation reason, and evidence references.

### Sub-session fields

- start/end and boundary method;
- market state and trader state, each with confidence and evidence type;
- active setup IDs and actions;
- planned versus actual risk;
- opportunity count, participation count, and missed opportunity count;
- decision latency where timestamps support it;
- behavior labels such as patience, hesitation, over-trading, stop discipline, or target discipline;
- explicit distinction between observation, inference, and self-report.

## Risk/reward evaluation

The system should evaluate risk/reward before judging win percentage.

For every proposed trade:

```text
planned R = |entry - stop| × point value × size
planned reward = |target - entry| × point value × size
planned R:R = planned reward / planned risk
realized R = realized P&L / initial planned risk
```

The exact formula must adapt for contract specifications, direction, scaling, commissions, and currency. If the stop or size is unknown, the system reports “not measurable” rather than guessing.

The product should separate:

- **opportunity quality:** what the market offered after the setup became valid;
- **decision quality:** what the trader chose given information available then;
- **execution quality:** what the order actually received;
- **outcome:** what happened after the trade.

A losing trade can be a good decision. A winning trade can be a bad decision. The product must not train the user to maximize win percentage at the expense of expectancy, drawdown, or tail risk.

## Finding statistical advantages

The system should search for conditional advantages only after enough sessions and comparable labels exist. Candidate comparisons may include:

- setup type;
- market session and sub-session;
- direction;
- volatility/range state;
- higher-timeframe context;
- entry trigger;
- planned R:R bucket;
- management choice;
- time of day;
- rule adherence versus deviation;
- 1m versus 5m execution context.

Each finding must include:

- sample size and number of sessions;
- numerator/denominator for the reported rate;
- net expectancy and distribution, not just win percentage;
- costs and slippage assumptions;
- confidence or uncertainty interval;
- comparison group;
- number of conditions tested;
- holdout or forward-test status;
- evidence quality and missing-data rate.

The model may recommend a hypothesis such as “test waiting for confirmation in this context,” but the hypothesis is not an advantage until it survives a predeclared test and prospective evaluation.

## How “study the art of trading” becomes product behavior

The Trader can maintain a curated, versioned research library covering:

- trade management and expectancy;
- risk sizing and drawdown control;
- market structure and auction behavior;
- execution and slippage;
- journaling and deliberate practice;
- cognitive and behavioral error patterns;
- statistical validation and backtest methodology.

The library should influence questions, labels, and experiment proposals. It should not be used to retrofit a theory onto every recording. Every recommendation should state whether it came from:

1. the trader’s own observed evidence;
2. an external source or trading framework;
3. a statistical comparison in The Trader;
4. an unresolved model hypothesis.

## Human review contract

After each session, the trader reviews:

- the eight sub-session summaries;
- key evidence clips and timestamps;
- extracted trades and proposed setup classifications;
- risk/reward calculations;
- uncertain or missing fields;
- proposed lessons and experiments.

The trader can approve, correct, reject, or defer each material observation. Corrections become labeled training/review data; they do not silently rewrite the original recording analysis.

## First implementation slice

The first working slice should analyze one uploaded session end to end:

1. preserve the uploaded video and images;
2. produce a timestamped transcript and key frames;
3. create eight sub-session records;
4. identify candidate trades and decisions;
5. allow the trader to correct the extracted timeline;
6. calculate risk/reward for trades with sufficient evidence;
7. produce a reviewable session report;
8. store no “approved style” until the trader confirms it.

The first success criterion is not improved profitability. It is a trustworthy, correctable reconstruction of what happened.
