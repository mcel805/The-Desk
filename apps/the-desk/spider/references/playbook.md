# Spider: multi-timeframe liquidity strategy and rulebook

Version 0.4 · Study cutoff: October 24, 2026 · Inter Equity Trading

This is a source-derived discretionary strategy for chart analysis and paper testing. It expands the original three-video Spider study with the 61 other uploads on the channel's **Videos** tab. All 64 timestamped transcripts were reviewed. Selected visual review now covers every inventoried upload: 155 accepted frames in total, including 94 newly inspected frames across the 45 previously unsampled uploads. The associated ledger aligns visible player times to the retained transcript passages and distinguishes rejected thumbnails from decoded source frames. This is not continuous audiovisual viewing of every video, a study of the separate Shorts/Live tabs, or verification of the presenters' results. The source catalog records coverage individually. The linked channel is the same Inter Equity source used for Spider's first three videos, rather than an independently verified second trading school.

The central decision is: **Which actual pool is relevant now, which traders may have entered around it, what move would clear them, and what opposing objective still makes the trade worthwhile?** Price, time and the sequence must agree. A compelling rectangle or candle pattern is insufficient.

## 1. Evidence and vocabulary

Keep three categories distinct throughout a read:

- **Source practice:** a presenter explicitly describes or demonstrates it. Video IDs and timestamps below identify support.
- **Spider operational rule:** a convention added to make analysis reproducible, such as setup IDs, completed-bar provenance, a frozen plan or a recorded risk cap. It is not attributed to the presenter.
- **Hypothesis:** an inference about future price or unseen participants. Chart candles do not prove actual stop orders, positions, intentional manipulation or the absence of liquidity.

| Term | Meaning in this strategy | What it does not establish |
|---|---|---|
| Structural liquidity | Modeled stop/entry interest around swings that price respects and moves away from, often after structural breaks | Every high/low is equally valuable |
| Buy-side liquidity | Candidate orders above highs, including stops of shorts | A guaranteed upward move |
| Sell-side liquidity | Candidate orders below lows, including stops of longs | A guaranteed downward move |
| Induced buyers | A rise, commonly through a prior high, may attract early longs; later respect/reaction helps locate their modeled risk | An immediate sell signal |
| Induced sellers | A decline, commonly through a prior low, may attract early shorts | An immediate buy signal |
| Trap/sweep | Price clears the relevant boundary after modeled participation has formed | Proof everyone was liquidated or that price must reverse |
| Engineered liquidity | The presenter's label for respect/reaction sequences that leave candidate orders for a later run | A visible measurement of order size |
| Liquidity block (LB) | The origin/extreme left by a prior liquidity run and departure; it supplies a defensible stop anchor | Any arbitrary order block, FVG or last opposite-colored candle |
| Parent draw | The supported objective of the larger setup | Permission to ignore an invalid child entry |
| Confirmation | A fresh local liquidity run and departure builds an LB, then participation/pool formation and another run provide an entry | Merely one large candle, BOS or first rejection |

The presenter models a fresh sweep-created extreme as having no new liquidity until later activity rebuilds it. Spider calls it **conditionally protected**, rather than claiming that no orders exist. Later respect and departure can change its classification. A block can remain a reaction area while no longer qualifying as the same protected origin for a fresh direct entry. [V008 04:36–06:18](https://www.youtube.com/watch?v=9URArIuZ2BM&t=276), [V044 03:42–05:58](https://www.youtube.com/watch?v=GIYrW7FC06M&t=222).

## 2. The decision hierarchy

1. Establish market evidence and trading time.
2. Form a higher-timeframe liquidity thesis or stand aside.
3. Identify the active participant/trap sequence.
4. Identify an existing LB or wait for a new one.
5. Identify the specific secondary pool whose clearance will activate the entry.
6. Check opposing objectives, competing pools, stop distance, costs and the paper risk budget.
7. Predefine entry, stop, target ladder, management and cancellation.
8. Observe the trigger, distinguish a plan from a fill, and manage only the chosen attempt.

Liquidity reasoning has priority over blocks. A technically recognizable LB can be a poor trade location if the direction, trap or target is missing. No block means no usable direct stop anchor: wait for confirmation or pass. Good direction with no executable setup is a valid no-trade. [V044 03:42–05:20](https://www.youtube.com/watch?v=GIYrW7FC06M&t=222), [V056 04:14–04:56 and 07:48–08:38](https://www.youtube.com/watch?v=x-7H1E4ToC8&t=254).

## 3. Inputs and chart provenance

Record provider/platform, instrument, exchange and contract; distinguish cash/CFD, futures and continuous futures. Record timezone, session calendar, analysis time, data cutoff and whether the last candle has closed. A chart labeled YM, US30 or MYM is not automatically the same price series. Do not transfer a numerical level between them without a verified mapping.

Use only timeframes actually supplied or accessible. Missing weekly/daily context remains missing; a 1H screenshot cannot supply verified daily OHLC or completed-bar pivots. For images, preserve originals and hashes, use coordinate-anchored overlays and label numerical zones approximate. For OHLC, retain timestamp semantics, session boundaries, tick size and bar completion.

These are Spider's evidence conventions. They prevent hindsight or false precision; they are not claimed as video terminology. A forming candle can be observed intrabar, but cannot be called a completed sweep-and-departure block before the required departure exists.

## 4. Top-down routine

### Weekly and daily context

At the start of a week, examine the previous weekly close and meaningful extremes. At a new trading day, mark previous daily high/low and inspect what yesterday actually cleared, respected and left intact. Ask whether yesterday delivered a large range, whether today's price may remain inside it, and whether a prior sweep-origin provides a conditional block.

Weekly/daily context is now directly supported, beyond the initial 4H/1H/15m study. It can guide a long-lived draw without being the entry frame. A prior daily high/low is a useful reference, not automatic liquidity qualification. Do not mechanically buy PDL and sell PDH. [V016 00:29–02:55](https://www.youtube.com/watch?v=-mX823uc5-s&t=29), [V037 00:57–03:47](https://www.youtube.com/watch?v=aKoGbAe-xTE&t=57), [V063 01:21–02:41](https://www.youtube.com/watch?v=xaF0OBgzPYs&t=81).

### 4H and 1H parent map

Mark a small number of meaningful pools on both sides. Trace each reaction back to its source on the left. Identify the origin, later respect, departure and whether that boundary has already been cleared. Include equal/relative highs/lows, repeated swing respect and trend/channel structures. Rank the nearest obstacle, intended objective and farther objective by their role in the actual narrative, rather than a fabricated numerical score.

Do not descend merely to find an attractive entry when the larger direction is unclear. If the 4H is visually compressed, use 1H to inspect the same area; if 1H is compressed, open 15m. More granularity may improve understanding without creating a new independent confluence. [V022 01:38–02:46](https://www.youtube.com/watch?v=d_rkvsi47qo&t=98).

### 30m, 15m, 5m, 2m and 1m refinement

Use the frame that makes the relevant sequence legible. The channel demonstrates higher-timeframe entries, 30m timing, and occasional 2m chart inspection as well as familiar 15m/5m/1m execution. Do not force every setup down to 1m, or claim that fractal similarity proves equal performance across frames. Seconds charts are mentioned but are not required by these examples.

Each refinement needs its own actual sweep, LB, secondary pool and stop. A smaller stop is legitimate only when supported by a smaller qualified setup. Moving a stop inside a broad block just to display a better R is not refinement. [V034 05:12–05:56](https://www.youtube.com/watch?v=lmGJ2OxBzP0&t=312), [V037 08:29–09:09](https://www.youtube.com/watch?v=aKoGbAe-xTE&t=509).

### Session handoff

For a New York read, ask: what did Asia build or clear; what did London build, sweep or deliver; what meaningful draw remains for New York? If London already delivered the large parent move, a fresh NY opportunity may be absent. Consolidation may prepare expansion but does not itself predict its direction. Stand aside if the evidence is unresolved. [V022 04:38–06:21 and 09:11–10:02](https://www.youtube.com/watch?v=d_rkvsi47qo&t=278).

## 5. Liquidity lifecycle and the crucial newer qualification

Use an event history for each level:

`reference → respected and departed / modeled pool built → contacted → cleared → reassessed → possibly rebuilt`

Keep the sweep-origin LB and the pool to be cleared on the future entry separate. A bullish block often lies below the newer buyer pool; a bearish block above the newer seller pool. The originating sweep and the later entry sweep are different events.

The early lessons repeatedly warn against choosing the latest small swing while a more important left-side pool remains. Preserve that warning, but **do not turn it into “always sweep the deepest historical low/high.”** The September lessons explicitly correct that interpretation:

1. A structural break alone does not determine which old origin must be revisited.
2. Observe the retracement as it forms.
3. A fresh local sequence can induce traders at a different respected internal level.
4. If those actual local traders are trapped, that pool can be the relevant activation point while an older extreme remains untouched.
5. Still require an appropriate LB, supported direction and an opposing objective.
6. Record the old pool as a competing/future reference; do not pretend it has disappeared.

[V059 01:33–06:47](https://www.youtube.com/watch?v=E2n7KMQDYIU&t=93), [V063 13:17–14:59](https://www.youtube.com/watch?v=xaF0OBgzPYs&t=797).

The companion default filter is important: after a genuine buyer-inducement then buyer-trap sequence, do not keep initiating fresh shorts solely to chase the next deeper old low. Mirror this after sellers are induced and trapped: do not chase fresh longs solely toward the next older high. An older intact pool is not an immediate directional command. Prefer waiting or a fresh continuation in the newly supported direction. The presenter mentions advanced exceptions and lower-risk variations; Spider does not silently enable them. This filter concerns **new entries**, not an automatic instruction to reverse or close every existing position. [V060 04:00–08:31 and 09:39–10:41](https://www.youtube.com/watch?v=LWEuNvtjQNA&t=240).

## 6. Two setup families, several execution methods

### A. Entry from an existing block

Bullish prerequisites:

1. A parent objective above remains supported and untaken.
2. A prior downside liquidity run and bullish departure established a usable LB and its extreme low.
3. A newer buyer pool forms above/within the relevant block region, with observed respect and departure supporting the hypothesis.
4. A downside run of that particular pool brings price into the valid entry region while the chosen block invalidation remains intact.
5. Entry, stop beyond the block low, costs and target room are defined.

The direct entry may occur as the secondary liquidity is taken. A new reversal candle is not mandatory for this family. It is an anticipatory entry and can fail. The favored entry zone can extend from the secondary low down toward the LB origin low; exact edges must come from the actual chart, not an invented universal last-candle formula.

Mirror for shorts: prior upper run and bearish departure; newer seller pool below the block; entry when price clears that pool into the block; stop beyond the origin high; lower target intact.

### B. Confirmation after the parent event

Use this when no clean block exists to the left, the broad stop makes the entry unattractive, or the origin is unclear.

1. Observe the relevant parent pool run.
2. Allow a bottom/top and meaningful departure to form; do not assume the first reaction qualifies.
3. Identify a new local sweep-origin LB.
4. Wait for new local participation/secondary liquidity to form.
5. Enter on clearance of that new pool in the intended direction, with stop beyond the new block and a still-live parent objective.

This is the same liquidity logic on a smaller scale. It may fill later and at a less extreme price. Missing the absolute top/bottom is acceptable. [V028 01:32–08:31](https://www.youtube.com/watch?v=60yOXkGhdW8&t=92).

**Execution is separate from setup family.** Alert-and-review, a pending limit, and market execution can implement a family. A market order is not a third analytical family. The webinar describes preferring alerts/manual review; later overnight examples explicitly use limits. A specially timed candle-close variant appears in V056; it does not authorize taking every engulfing candle. [V021 13:51–16:42](https://www.youtube.com/watch?v=fHZRztFT4mk&t=831), [V043 07:20–07:42](https://www.youtube.com/watch?v=3Xgukzx6nOw&t=440), [V056 19:27–20:16](https://www.youtube.com/watch?v=x-7H1E4ToC8&t=1167).

## 7. The stop, entry quality and reward-to-risk

The initial stop belongs beyond the selected LB's full origin extreme. Do not put it arbitrarily in the middle of the wick/block. Price can penetrate farther into the zone, run an internal high/low again, and remain within the initial setup. If the genuine stop is too large, wait for a deeper valid entry, seek a fresh smaller qualified block, reduce paper size or pass.

The latest YM lesson demonstrates an otherwise valid broad entry around 2.2R that the presenter declines under his personal approximately 3R minimum. He waits for a deeper price with the same stop, or a confirmation entry. Other R thresholds are explicitly permitted for other traders. Spider records Mark's selected paper threshold; it does not invent one or apply the source's preference to every setup. [V064 07:10–10:13](https://www.youtube.com/watch?v=9gUKOkgODK4&t=430).

Distinguish:

- **R filter:** whether a trade offers acceptable room to a defensible target.
- **Target selection:** which actual liquidity level supplies that room.
- **Realized return:** what exits, fees, slippage and remaining volume ultimately produced.

Do not close simply because the drawing tool reaches 3R if that was not the selected technical exit. Do not extend a target to a random 10R to make a poor setup attractive. A nearby obstacle can matter even when the final objective offers large nominal R. [V035 01:38–04:48](https://www.youtube.com/watch?v=3X7JvlNf2NI&t=98).

For a long, gross R to a target is `(target − entry)/(entry − stop)`; mirror for shorts. Use the actual intended fill and protected stop including its buffer. Include tick size, spread, commissions and slippage assumptions when available. A historical forex spread allowance is not a universal number. V043/V051 explicitly widen stops for spread; the webinar's claim about sell limits having “no spread” is not a sound general execution assumption and is not adopted.

Spider's risk conventions: no widening a frozen stop; no hidden averaging into a loss; no calculating quantity without a supplied paper risk budget and instrument value. For sizing, per-unit risk equals stop distance times monetary point value plus expected costs, and quantity is rounded down to the valid increment. If one minimum unit exceeds the budget, pass. A stop-price order does not guarantee a fill at that price during gaps or releases.

## 8. Targets, partials and stop management

Before entry identify: first meaningful obstacle, management pool, partial level(s), final objective, and the conditions for retaining a runner. State whether targets are touch, trade-through or completed-bar events. The source varies; a universal close-confirmation or exact tolerance is not established.

For a long, structural/internal highs may be nearer protection/partial points while a daily/weekly upper pool supplies the parent draw. For shorts, mirror with lows. Taking an internal pool can produce a pullback or a full reversal. An intact remote draw does not excuse leaving risk unmanaged indefinitely.

Do not tighten a stop just because one candle looks strong or P&L is green. Several examples show a first favorable reaction followed by a second trap inside the original block. An emotional stop moved behind the first internal swing can lose the trade before the intended move. Preserve the initial anchor until the chosen meaningful event occurs. [V027 07:55–08:50](https://www.youtube.com/watch?v=d7hXMToNQIo&t=475), [V030 09:06–09:58 and 13:47–14:14](https://www.youtube.com/watch?v=QTGP2NQUcBE&t=546).

After the **preselected** management pool is taken, choose the plan's action: partial, entry-price stop, reduced-risk structural stop, or a combination. A fresh qualified LB may provide a protected trailing anchor. Do not call a reduced-risk stop “break even”; an entry-price stop can still lose costs. A partial plus a residual loss can be net profitable, but calculate it rather than call the entire remaining position risk-free.

| Management variant | Source example | Implication |
|---|---|---|
| 50% then distant objective | V004 04:28 | A particular example, not a fixed template |
| 75% partial, runner misses farther target | V042 06:10–06:20 | Retain the incomplete outcome |
| Small partial and structural residual stop | V021 19:44–20:06 | Partial profit may offset remaining nominal risk |
| No partial, more stop rolling | V054 08:44–10:31 | A stated recent preference in a live-stream excerpt |
| About 25% early, preserve volume for parent target | V062 08:14–08:51 | Excessive early reductions can defeat the intended swing |
| 25–50% plus BE at named partial | V064 12:42–13:23 | Latest example still uses partials; no monotonic permanent rule change |

Preselect the variant for a new paper attempt. Percentages must say **of original position** or **of remaining position**, sum correctly, and never exceed available quantity. Weighted gross R is the sum of each exited fraction of original size times that exit's R. Keep runner P&L separate until realized.

There are real source tensions. V035 says wait for the selected high to be taken; V054 10:53 closes “basically at” the target before the high is finally run. V032/V056 skip small partials while protecting at a nearby low-R pool; V063 describes a sizable nearer partial. These are discretionary variants, not grounds to manufacture a single inflexible exit rule. Exact tolerances and a universal optimal schedule remain untested.

## 9. Time, news, holidays and holding

Use a verified date-specific calendar before a current actionable read. The early lessons repeatedly prohibit **new entries before scheduled major news** and prefer reviewing price after the release. Example times such as 08:31/08:32 are illustrations, not a proven one-minute cooling-off rule. Verify the event, spread and executable structure after it occurs. A news spike that fits retrospectively may be unrealistic to catch live; V061 explicitly says so. [V006 02:08–02:47](https://www.youtube.com/watch?v=CIDKNCq6vgA&t=128), [V022 00:49–01:29](https://www.youtube.com/watch?v=d_rkvsi47qo&t=49), [V061 07:21–07:42](https://www.youtube.com/watch?v=SkKjZeY6EN4&t=441).

Index entries are mainly New York, commonly after the 09:30 US cash open, but later lessons explicitly acknowledge some earlier index entries. Do not convert one US30 example's strict 09:30 rule into an immutable channel-wide restriction. Forex/swing examples can begin in Asia and hold through London, news or the next day. A rule against new entries before news differs from management of an existing position. Define event exposure before holding a paper runner across a release.

The channel often says “EST” while chart clocks show UTC−4. Record the displayed offset and use the date-specific `America/New_York` zone for US sessions, not a permanent EST or fixed Pacific conversion. Verify provider candle alignment: a CFD H4 open can differ from a futures H4 open. Session opens, hourly turns and H4 closes are confluences, not standalone entry signals.

V056 explicitly advises no new trading on bank holidays; check the relevant market/exchange and currency holiday rather than every holiday anywhere. The live futures example describes same-day exit constraints, whereas forex examples hold overnight/weekend. Choose instrument/account session rules before the plan; the skill does not override them or authorize unattended execution. There is no sourced universal maximum holding duration or automatic “exit after four minutes.”

## 10. Optional models built on the same core

### Engineered-liquidity continuation

A supported bearish parent reaches but respects an intended lower pool and departs upward, leaving that pool intact. The rebound must create a relevant seller pool and a usable upper block; wait for the proper seller clearance, not the first small high with more relevant liquidity above. Short toward the still-live lower draw. Mirror for bullish continuation. No respect/build event means no engineered continuation under this model. [V030 04:25–08:17](https://www.youtube.com/watch?v=QTGP2NQUcBE&t=265).

### 10 a.m. H4 reversal model

In the demonstrated bullish setup, the source identifies the completed **06:00–10:00 H4 candle** on its chart clock. After 10:00 opens the new candle, a run below that prior H4 low activates the search for a long. Require the parent bullish draw and actual LB-supported entry; the sweep alone is not permission to buy. The old H4 high may be a target if appropriate, alongside actual liquidity objectives. Verify candle alignment and timezone. The exact bearish time model is a mirrored research hypothesis unless independently sourced and tested. [V040 01:41–03:26 and 05:43–08:59](https://www.youtube.com/watch?v=lEsZYpeGNVQ&t=101).

### Sweep-origin / respect / next sweep candle sequence

A candle clears a prior low and departs/reclaims, making a candidate lower-frame block. A later candle respects a low and moves higher, leaving a secondary pool. A subsequent run of that pool within the origin extreme can activate a long; mirror for shorts. Candle colors are not the essence, and entry need not occur exactly on the fourth bar: the lesson shows later respect delaying activation. Keep completed candles distinct from the current intrabar trigger. Bias and target must come from the broader method. [V046 01:37–03:15 and 05:04–05:51](https://www.youtube.com/watch?v=yIYY_jYy3sE&t=97).

### Daily inside-range recovery

After a large sweep day, an inside day may build fresh liquidity while the earlier sweep-origin stays protected. A following day can clear the inside day's low, retain the older block low, and offer a long to internal/daily highs. This is conditional: a large day does not guarantee the next inside day or a reversal. Use local confirmation if the outer origin is unclear. Mirror as a separately tested bearish model. [V055 02:43–03:29 and 07:16–10:42](https://www.youtube.com/watch?v=HEBP5I3z__c&t=163).

### Both sides / “ping pong”

One example takes an opening short toward a lower objective and then a post-10:00 long after a new lower run and fresh entry sequence, with an upper target intact. These days are described as uncommon. Finish or separately account for the first attempt, rebuild the map, and qualify the second. A hit target does not automatically trigger the opposite order. [V050 06:14–09:02](https://www.youtube.com/watch?v=ZLTo-Fct8Ks&t=374).

### Additions and re-entry

A remaining parent draw can support another entry only when a fresh local block/pool/trap qualifies. The stacking lesson also allows sequential trades after closing the first; do not assume every displayed trade was held concurrently. Recalculate total downside across all positions, correlated instruments and duplicate accounts. An addition needs unused risk capacity; existing profit is not automatic permission to increase risk. Aggregate caps are Spider's operational requirement, not a numerical rule supplied by the videos. [V051 05:12–08:29](https://www.youtube.com/watch?v=fTAVvXYvhi4&t=312).

## 11. No-trade and cancellation rules

Pass or remain waiting when:

- Higher-timeframe direction is unclear, evidence is stale or the required frame/anchor is unavailable.
- A pool exists but no supported opposing objective remains.
- Only a BOS, impulse, imbalance, block label or similar-looking candle pattern is present.
- The active traders have not formed/been cleared under the selected family.
- A direct entry lacks a usable block, or a confirmation has not completed its fresh build-and-run sequence.
- The genuine stop and costs leave inadequate room under the selected paper plan.
- Price remains inside the mapped range with no qualifying edge sequence.
- Scheduled news, a relevant holiday, the chosen session restriction or account closing constraint excludes the attempt.
- The correct location is missed and no fresh setup forms. Do not chase.
- The new-entry trap filter disallows chasing an older objective.

Cancel a pending idea when its selected target is consumed before entry, its block/structural invalidation fails, risk capacity disappears, a newly verified event excludes entry, or its predeclared session/reassessment condition expires. A level may stay on the historical map after its associated trade is canceled. New respect/build can create a fresh target and a **new** attempt, not retroactively validate the old plan. [V047 03:02–03:31 and 06:47–07:23](https://www.youtube.com/watch?v=5VvFss8cKPY&t=182).

There is no source-defined fixed expiry in bars. Some examples wait a day or more than a week. Spider uses an explicit review event rather than treating time passing alone as either proof or invalidation.

## 12. State machine for paper analysis

These state names and transition records are Spider conventions:

| State | Required meaning | Next event |
|---|---|---|
| `insufficient-evidence` | Essential source, cutoff or anchor missing | Obtain/identify the missing evidence |
| `watch` | Parent idea exists, no qualified local setup | New mapped participation/location |
| `waiting-for-trap` | Specific secondary pool identified but uncleared | That pool's actual clearance |
| `waiting-for-block` | Parent event occurred, no defensible LB yet | New sweep plus departure |
| `waiting-for-reaction` | Selected confirmation is incomplete | Its specified departure/build |
| `waiting-for-revisit` | Ready direct zone or confirmed setup awaits contact | Defined contact/run |
| `ready-paper` | Every pre-entry requirement and risk anchor is known | Staging/contact, not assumed fill |
| `active-paper` | A paper fill is actually observed under the chosen fill assumptions | Named management, exit or invalidation |
| `missed` | Move departed without this plan's valid fill | Fresh setup only |
| `invalidated` | A declared premise/cancellation event failed | Record reason; new attempt if justified |
| `completed-paper` | Full exit actually recorded | Audit outcome without rewriting forecast |

An anticipatory direct limit can be ready to stage while future contact is pending. A confirmation setup cannot be ready before its required confirmation exists. In screenshots with no time-ordered intrabar data, touching both stop and target in one bar has unresolved order. Report ambiguous outcome rather than selecting the profitable path.

## 13. Required chart markup and read output

Use the chart's own drawing controls when available, otherwise preserve the source image and add an SVG/HTML overlay. Do not generate substitute candles. Mark all requested frames or label a frame unavailable.

| Drawing | Content |
|---|---|
| Parent objective | Blue horizontal level, timeframe, ID, untouched/taken state |
| Originating sweep | Reference boundary, sweep time/extreme and departure |
| LB | Light zone and full origin extreme; distinguish source-supported and approximate edges |
| Secondary pool | Separate line/region identifying the buyers/sellers to be cleared |
| Trap hypothesis | Amber/red translucent region with the actual sequence, not just “liquidity” |
| Entry | Family, selected trigger, pending/observed status |
| Stop/invalidation | Red level, distinguish child stop from parent failure |
| Management and targets | Named first pool, partial(s), final objective |
| Conditional route | Dashed arrow with condition, never a solid future fact |

Colors are Spider's consistent presentation convention; source colors vary. For every anchor retain timeframe, time/price or image coordinates, evidence cutoff and observed/hypothesized state. Use a readable parent map and a separate execution detail. Inspect label overlap and actual image alignment.

A completed read should lead with the opportunity status and next required event, then supply the timeframe map, ordered trap narrative, chosen family, plan, competing path and the actual marked artifact. If not ready, explain the missing condition. Do not hide uncertainty under “high probability.”

## 14. Paper-plan template

```text
Setup/attempt ID; analysis version; known-as-of:
Provider / symbol / contract / timeframe / timezone / completed cutoff:
Evidence type and missing frames:
Calendar/session context and next excluded event:
Parent direction, draw ID, rationale, conflicting pool:
Prior originating sweep ID -> LB ID/extreme/departure:
Active participant sequence and relevant secondary pool ID:
New-entry trap filter result; older pool treatment:
Family: existing-block / confirmation; execution: alert / limit / market:
Trigger and exact contact/run rule; pending conditions:
Entry or zone; initial stop; buffer and cost assumptions:
Paper risk budget; point value; quantity; total concurrent risk:
First obstacle; management event/action; partial fractions; final target:
Gross/net R estimates; minimum-R policy if supplied:
Cancellation, reassessment/session expiry and holding/event policy:
Status; observed fill vs hypothetical fill; outcome ambiguity:
Parent invalidation and competing path:
Chart artifact and source references:
```

## 15. Practice, evaluation and unresolved questions

Study the material, replay it without future candles, apply it, then revisit the same lessons. Practice live recognition in a paper account. Keep no-trades, missed entries, failed reads, stopped attempts, BE exits and unfilled plans in the journal. Quality is a decision criterion, not a quota: the presenter's “one to three trades a week” is a personal heuristic, not a guaranteed route to profitability. Prop-firm promotions and funding headlines are not adopted as recommendations. [V039 01:05–03:26 and 05:59–07:51](https://www.youtube.com/watch?v=vFDga7Hi0wY&t=65).

Before claiming an edge, freeze an operational version and test chronological data with fees, bid/ask mechanics, slippage, session gaps and ambiguous fills. Separate development samples from later holdout samples. Measure net expectancy, loss distribution, drawdown, stop/target excursion, time to fill/exit, management variants, setup family, instrument and session. Compare partial versus trailing variants on the same predefined opportunities, including failures. A higher multi-timeframe agreement count is not a calibrated win probability.

The channel does not resolve a universal tick tolerance for respect/equality/sweep; a fixed departure magnitude; objective weighting; exact block body/wick construction in every example; a numerical session-range exhaustion threshold; risk-per-attempt or daily loss limits; correlated exposure caps; optimal partial percentages; a universal stop buffer; or a deterministic parent reversal algorithm. These remain configuration/research questions. No hidden numerical defaults are inserted into Spider to make the method appear fully automated.

Several transcript numbers and directions are unreliable: V005's spoken dollar amounts conflict; V026's stop reduction arithmetic is corrected by calculation; V046 has a bullish stop-direction slip; V058's final R wording is unclear; V063's partial R descriptions conflict; V064 says approximately 3.5 and 13 in its closing R discussion. Do not use those strings as market data or performance proof. Local raw transcripts are retained so source wording can be checked against the video.

Spider's intended mindset is patient and conditional: frame the larger draw, locate the actual trap, require a defensible entry and stop, accept a valid no-trade or loss, manage at predefined events, and revise when new evidence changes the story. Learning this framework does not establish that Spider trades like an independently ranked “best trader,” or that the examples will reproduce in MYM or any other market.

## 16. Operational gates: turn a read into a reviewable paper decision

These gates are Spider's operational synthesis of the preceding source rules. They do not add numerical thresholds, calibrated probabilities or execution authority. Evaluate each as **supported**, **waiting**, **failed** or **unavailable**, with an anchor or a short reason. Do not turn the count of supported gates into a win-rate estimate.

| Gate | Evidence required | If it is missing or fails |
|---|---|---|
| Evidence | Actual market, provider/contract, accessible frames, timezone and known-as-of cutoff | Essential unavailable evidence gives `insufficient-evidence`; screenshot-only numeric zones remain approximate |
| Parent | A meaningful opposing draw remains intact; nearer obstacles and conflicting pools are identified | Unclear direction stays `watch`; do not search smaller charts to force agreement |
| Participants | A specific respect/departure and run sequence supports who was induced or trapped on the selected frame | A lone BOS, big candle or presumed stops stays waiting; name the actual pool needed next |
| Block and family | Existing-block origin and full extreme, or an actually formed new confirmation block followed by its new secondary pool/run | An attractive area without a usable stop is not an entry; wait for a fresh qualified block or pass |
| Objective and cancellation | A live technical objective, intermediate management pools and a clear cancellation event | Target consumed before entry invalidates this attempt; retain the historical level, not an active stale order |
| Execution and capacity | Defined trigger/zone, true stop, costs and fill assumptions; selected calendar/session permits the entry | An unrealistic news-wick fill, excluded event or inadequate room fails the attempt. Sizing additionally needs Mark's budget, instrument value and aggregate capacity |
| Management | Named event for the first action, selected partial/trailing variant, runner policy and parent/child invalidation | Do not call an entry ready while its stop or management is undefined; green P&L alone is not the event |

For every timeframe, declare its role: **context** supplies the larger draw, **setup** supplies the chosen block and participant sequence, and **execution** supplies the trigger when finer detail is needed. A single hourly chart can supply more than one role. A one-minute copy of the same swing is not independent confirmation. Refine only when the smaller frame contains an actual smaller qualified setup. [V034 05:12–05:56](https://www.youtube.com/watch?v=lmGJ2OxBzP0&t=312), [V037 08:29–09:09](https://www.youtube.com/watch?v=aKoGbAe-xTE&t=509).

### Freeze the attempt before the future arrives

Record the setup and attempt IDs, current state, parent and child anchors, entry family, pending condition, stop, technical target ladder, management action and cancellation/review event at the evidence cutoff. Keep subsequent revisions as new versions. A direct plan may be ready to stage before contact; a confirmation plan remains waiting until its required sequence exists. Direction can be correct while the entry gate fails, as in the gold example without practical confirmation. [V056 04:14–04:56](https://www.youtube.com/watch?v=x-7H1E4ToC8&t=254).

When a pending entry's target is reached first, cancel that attempt. If a later respect/departure builds a new target and fresh sequence at the retained level, create another attempt with a new known-as-of record. The later winner must not be used to erase the earlier cancellation. [V047 03:02–03:31 and 06:47–07:23](https://www.youtube.com/watch?v=5VvFss8cKPY&t=182).

### At trigger and during management

Classify what happened: planned zone, observed contact/run, source-reported trade, assumed paper fill under stated rules, or verified fill. A tool's green rectangle or printed closed-P&L number alone cannot establish actual execution. If only screenshots are available, do not infer the intrabar order of entry, stop and target contacts.

After entry, evaluate the predefined meaningful event before changing risk. A return through the first small swing can remain inside the original block, as the gold and EURUSD examples demonstrate. Hold the chosen structural stop or apply a previously specified management action; never enlarge it to rescue the trade. If the stop fails, record the child loss even if the parent objective is reached later. A surviving parent thesis needs a separately qualified new entry. [V027 07:55–08:50](https://www.youtube.com/watch?v=d7hXMToNQIo&t=475), [V033 04:12–05:24](https://www.youtube.com/watch?v=h2nwyVPSLOU&t=252).

For partials, retain original size, exited quantity, exit price, original-risk denominator, remaining size and remaining stop exposure. A 25% partial in one EURUSD example and a 75% partial in another forex example are different plans; neither is an automatic template. Keep source-reported amounts separate from calculated paper results. [V062 08:14–08:51](https://www.youtube.com/watch?v=HfnKU1D_woM&t=494), [V042 06:10–06:20](https://www.youtube.com/watch?v=rtOidpOrC70&t=370).

### Audit the decision, not only the eventual direction

Review whether the read used information available at the cutoff, chose the actual active pool, waited for the selected family, preserved the real stop, used an intact technical objective and followed the frozen management policy. Record a passed setup, canceled limit, missed move, stopped attempt, break-even, partial with an unfulfilled runner and full target as distinct outcomes. A correct pass remains a valid process result when a move later occurs without an executable entry. A beautiful hindsight wick is not a missed fill. [V061 07:21–07:42](https://www.youtube.com/watch?v=SkKjZeY6EN4&t=441).

If a gate needs an exact tolerance or risk setting that the source never defines, show the unresolved setting and keep the judgment provisional. This makes the method reviewable without pretending that the videos have supplied a complete deterministic trading algorithm.
