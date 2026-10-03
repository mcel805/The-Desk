# Cleo plan markup on the Vela chart

**Status:** first on-demand slice wired on 2026-10-03. Quant Lab now requests a compact read plus a structured mark block for chart-read requests, validates the completed block against the current source/cutoff and cited loaded bars, draws it while the response is still streaming, and presents the long explanation behind a disclosure. The chart has an independent Cleo marks visibility control and a local saved-read list; archived marks restore only on an exact source/market/timeframe/cutoff match. Browser interaction QA is pending. Per-mark draft animation and reopening a historical chart when its exact source bars are no longer loaded remain future work. Ongoing observation still depends on the separate opt-in `Trade with me` plan, event gate, and versioned `PlanDelta` in [TRADE-WITH-ME-MENTOR-EXPERIENCE-PLAN.md](./TRADE-WITH-ME-MENTOR-EXPERIENCE-PLAN.md). All reads and annotations are research and paper/shadow only.

## Intended experience

Cleo marks a chart when the user requests a visual read, a new paper trade plan needs a spatial explanation, or a material event changes a plan's relevant structure. A short chat message and the marks tell the same story: **what stands out, what might change the read, and what to watch next**. The trader decides whether to show Cleo's layer. Cleo never redraws the chart merely because another tick or forming candle arrived.

The chart toolbar gets a compact control: `Cleo marks · 4` with an eye icon and pressed state. It toggles only Cleo's marks. User drawings, indicator overlays, candles, and the paper plan remain visible. If the layer is hidden when a new read or plan arrives, keep it hidden and show `Cleo updated the map · Show` beside the short response. `Hide` does not delete the evidence record or change the paper plan.

Select a Cleo mark to open a small **Why this mark?** panel: its role, source venue and product, source timeframe, confirmed-bar cutoff, plan version, and the sentence that connects it to the plan. The panel links back to the message that introduced it. It should not show a false precision: a region drawn from OHLC evidence is a descriptive zone, and a projected path is explicitly conditional.

### Chart-first response and visible drawing progress

The chart is the primary answer. Keep Cleo's first read large and short beside it: a readable 18px headline with a one- or two-sentence conclusion, then at most three compact evidence/counterpoint rows. Move method detail, alternatives, and the source ledger behind **Why this read?**. Use plain trader language and a clear state such as `WAIT`, `CONDITIONAL`, or `REVIEW`; do not make a user translate paragraphs of levels into chart coordinates.

An on-demand chart read and a paper plan are different output types. For a chart read, annotate sourced observations and clearly labeled interpretations: confirmed swing/structure, relevant level or area, nearby opposing reference, and (only when useful) a conditional path. Do not turn a read-only request into an entry, target, or trade recommendation. Add trigger/invalidation marks only when a paper scenario was explicitly requested and its evidence passes the plan gate.

When the user asks for a read, show a compact activity strip with actual stages such as `Checking chart source`, `Mapping confirmed structure`, `Adding the key level`, and `Checking the countercase`. Do not stream private chain-of-thought or invent stage progress. Each mark appears as a lightly dashed, labeled **DRAFT** as soon as that individual mark passes local source/geometry validation. The full set becomes **REVIEW READY** only after the complete markup spec passes and matches the current chart revision. Cleo's short explanation appears in step with those marks. If validation fails or the source/chart changes, remove the draft layer and explain the limitation; never leave a partial draft looking final.

This is a foreground, user-requested read in the first release. It does not poll every bar or imply that Cleo continues watching after the turn or tab ends. Live/proactive reads remain a separate, opt-in session capability.

### Saved reads and archive view

After a completed read, offer **Save this read**. The archive stores the immutable markup spec/version, source identity, timeframes, cutoff, uncertainty, concise answer, message reference, and a preview only when retention is allowed by the applicable data-use terms. It never silently overwrites an earlier read. The list shows market, venue, timeframe, cutoff, and conclusion so the user can reopen the intended version.

Opening a saved read must never paint historical marks onto a different/current market. If authorized source bars remain available, open a clearly labeled, read-only historical chart at the saved cutoff and render that saved layer. If they do not, show the saved visual snapshot only when retention is permitted; otherwise show the archive record and explain that the chart source cannot be restored. Archive visibility is separate from the live `Cleo marks` toggle. Hiding an overlay or deleting an archive cannot edit the evidence record attached to the originating message.

## On-demand chart-read contract

`ChartReadMarkupSpec` is separate from the paper-plan `ChartMarkupSpec`. The read spec has no entry, stop, target, order side, or implied position unless the user explicitly requested a paper scenario. The app-server/runtime bridge may emit these structured events while the response streams:

| Event | Required fields | UI result |
| --- | --- | --- |
| `chart-markup:draft-start` | `readId`, chart/source identity, chart revision hash, cutoff | Pin the read context; show `Reading your chart`. |
| `chart-markup:mark` | `readId`, monotonic `sequence`, one complete mark, evidence refs | Validate locally, then add one labeled DRAFT mark and the matching short explanation. |
| `chart-markup:accepted` | `readId`, final spec hash, all mark IDs | Promote the complete draft set to a locked review layer and display the short headline. |
| `chart-markup:rejected` | `readId`, safe reason code, optional `markId` | Clear this draft and state why no overlay was applied. |

A read spec includes `readId`, `chartRevisionHash`, `status`, a compact `readout` (`decision`, `headline`, one-sentence `takeaway`), pinned `source` identity/freshness/cutoff, up to five marks, competing evidence, and `messageRef`. Marks use bar IDs/times and numeric price anchors from the pinned read-only chart packet. The front end ignores free-form drawing instructions, unknown roles, and marks for a different chart revision. Out-of-order or duplicate events are idempotently ignored. Text may stream before the geometry finishes, but the UI labels it as a draft until the matching `accepted` event arrives.

Runtime activity remains task-level and concise: `Checking the selected chart`, `Mapping confirmed structure`, and `Checking the countercase`. It is driven by actual work events, not a narrated private thought transcript. The UI never claims “reading” or “drawing” stages from elapsed time alone.

## When a mark is justified

| Situation | Chart behavior |
| --- | --- |
| User asks Cleo to read the chart | Draw only the source-bound structure, key levels, counter-reference, and any clearly conditional branch needed to explain that read. Keep the response review-only unless a paper scenario was requested. |
| Session starts with a verified, frozen plan | Mark up to the few levels needed to explain the current branch. If the plan lacks sourced anchors, show the plan card without marks. |
| Cleo proposes a new paper plan | Publish the plan and its markup together after the structured evidence check. The chart appears with context area, trigger, invalidation, and nearest opposing obstacle if each has an actual source. |
| Material `PlanDelta` changes a level or branch | Retire the prior active group and draw the new version. Highlight what changed in the message and evidence panel. |
| Ordinary bar, repeated touch, or still-forming pattern | Keep the current marks; do not move them with every update or create a new drawing set. |
| Source stalls, chart changes venue/symbol/product, replay starts, or plan evidence expires | Immediately label or hide the active group as stale/archived. Do not carry the marks onto a different market. |
| Cleo cannot validate geometry or Vela cannot draw it | Keep the text plan, show `Chart marks unavailable`, and log the failure. Never guess coordinates. |

**Visual budget:** usually 2–4 marks and never more than five. The current chat renderer uses native `hray` for a single sourced level, `trendline` between two confirmed pivots, and a right-extending `ray` only for a conditional path. It does not use boxes, free-floating text, or multi-segment paths for a routine chart read. Labels are optional, one line, at most 18 characters, and rendered tiny; omit them when they would crowd the chart. Cleo lines use a thin stroke below the price series so candle bodies and wicks remain visible. Inspect existing drawings and avoid duplicating or crowding them. Do not move sourced anchors to make the overlay look tidy, and do not draw a target line merely to complete the chart.

## Contract between Cleo and the chart

Cleo returns a **structured `ChartMarkupSpec`** beside a proposed plan version. It is data, not HTML, SVG, JavaScript, or a command to the renderer. An example shape is:

```json
{
  "schema": "cleo.chart-markup.v1",
  "sessionId": "session-reference",
  "planId": "paper-plan-reference",
  "planVersion": 2,
  "source": {
    "venue": "selected-venue",
    "symbol": "selected-market",
    "productType": "spot-or-perpetual",
    "decisionTimeframe": "selected-timeframe",
    "cutoff": "confirmed-source-timestamp",
    "evidenceHash": "validated-input-hash"
  },
  "marks": [
    {
      "markId": "plan-v2-invalidation",
      "role": "INVALIDATION",
      "geometry": "level",
      "anchors": [{ "barTime": "sourced-bar-time", "price": "sourced-level" }],
      "evidenceRefs": ["source-bar-or-derived-level-id"],
      "reason": "The confirmed structure that would end this paper idea."
    }
  ]
}
```

The strings above are placeholders for a contract example, not market facts. The implementation uses numeric, finite time/price values tied to the loaded source bars. The validator rejects unsupported geometry, missing evidence references, out-of-context venue/product/timeframe, duplicate mark IDs, impossible or reversed bounds, excessive marks, and a cutoff later than the evidence packet. A conditional ray extends from two sourced pivots to the right edge; it cannot add future-time anchors, invent candles, or imply a guaranteed destination. The validator checks that each mark's `planVersion` matches the accepted `PlanDelta` before rendering.

The current read renderer maps its bounded markup data to Vela's native `hray`, `trendline`, and `ray` primitives. The adapter owns the concrete drawing IDs returned by `chart.drawings.add` and saves them in the Cleo-only layer keyed to the loaded source and cutoff. A mark ID also maps to its source evidence and explanatory message. Cleo cannot call `drawings.add` directly. The adapter decides styling and validates all anchors.

### Visual language

- Context or observed structure: neutral teal thin line.
- In-progress draft: thin dotted outline plus a persistent `DRAFT` label; never rely on translucency alone to signal provisional status.
- Conditional trigger: bright teal, short label and a confirmation condition.
- Invalidation: coral/red dashed line, label `INVALIDATION`; its reason remains available when color is hard to see.
- Opposing obstacle: amber thin line, with a tiny label only when needed.
- Alternate: muted violet dashed mark, shown only when the alternate branch has independent evidence.

Do not use color as the only distinction. The concise readout and evidence drawer carry the meaning. Marks sit below candles in Vela's price-series z-order. No large text boxes, unsupported win probability, or profit target are painted on the chart.

## Visibility, lifecycle, and ownership

Vela's drawing controller already has `add`, `remove`, `setVisible`, `setLocked`, `all`, and `toJSON`. The Tool Belt currently records its own `toolBeltDrawingIds`; Cleo's registry must be separate. Hiding uses `setVisible` only on Cleo IDs. Replacing a plan removes or archives only the prior Cleo group. User drawing IDs and Tool Belt IDs are never bulk-cleared by this feature.

The active group is **read-only** to preserve provenance. The trader can hide it, inspect it, or explicitly copy a mark into personal drawings in a later iteration. A copied mark becomes a user drawing with a source reference and can be edited without rewriting Cleo's original. A user-drawn level that Cleo uses stays user-owned and is cited as a user level; Cleo does not silently adopt or alter it.

On symbol, venue, product, or timeframe switch, the current group is no longer active. On replay, use the replay cutoff and reject marks derived from later bars. On chart destruction/recreation, restore only a group whose identity and cutoff still match the loaded chart. When a session ends, keep the plan record in the permitted local paper study store, but remove the live layer from the chart unless the trader explicitly saves a snapshot. Do not place detailed chart data, screenshots, or private account state in the support log.

## Fast path and failure handling

For the first release, a manual chart-read turn builds the map in that same request; no model call per tick or second exchange subscription is needed. A versioned `chart-markup:draft-start`, `chart-markup:mark`, `chart-markup:accepted`, or `chart-markup:rejected` event carries concise status and structured mark data. The UI does not infer drawing progress from prose. Each draft mark is validated against the pinned chart revision, exact loaded bars, source/cutoff, and evidence references before it is drawn. The complete spec is validated at the end; accepted marks are locked and promoted to the completed group. Cap marks and batch renderer updates where supported so a plan change does not freeze the chart.

A slow or obsolete reply is discarded if its source, chart, or plan version changed before commit. Source health and local status update immediately. On any invalid anchor, unsupported drawing, provider/market switch, changed cutoff, timeout, permission failure, or stale data, clear the current draft, keep any prior completed read separate, and show a short status plus the reason. Never carry marks to another market or turn a rejected draft into an archive entry.

The first version cannot claim to keep the drawing map current after its turn or tab closes. Archived reads are historical records, not active monitoring. Any later server-side session monitor must revalidate accepted plan versions when the chart reconnects and use its own explicit source and retention rules.

## Delivery after the mentor interaction

1. Freeze `ChartReadMarkupSpec` for on-demand observations and its `PlanDelta` extension for paper scenarios; implement validation and a Cleo-only registry independent of Tool Belt/user drawing IDs.
2. Build the on-demand chart read as the first end-to-end slice: short, larger answer; real activity events; validated draft drawing; accept/fail status; independent visibility toggle; mark explanation. Use the existing Vela drawing API, with no new chart engine.
3. Add local **Saved reads** with source/rights-aware restoration, read-only historical mode, archive list, and retention/delete behavior. Keep historical marks out of the active chart unless the user opens the matching saved read.
4. Run replay and rendered-chart reviews for wrong anchors, missed/extra marks, stale carryover, draft cleanup, archive matching, legibility, and readability at common zoom levels. Do not enable proactive redraws as part of this manual-read milestone.
5. After the on-demand experience is accepted, connect material `PlanDelta` events from the separately gated foreground mentor session.

**Acceptance:** the user can understand Cleo's main read from the chart plus its short headline; activity reflects actual work; draft marks remain visibly provisional until final validation; failed/stale drafts clear without altering prior marks; hiding Cleo leaves user and Tool Belt marks untouched; saved reads reopen at their own market and cutoff without blending into live data; switching providers cannot display prior-venue marks; a replay cannot show future evidence; a new version does not erase its predecessor; every mark traces to evidence and cutoff; unsupported geometry produces no fabricated drawing.

## First-milestone options

| Option | Scope | Trade-off |
| --- | --- | --- |
| **A. On-demand live-draw (recommended)** | A user asks Cleo for a read; validated draft marks stream onto the selected chart, then a short conclusion and saveable read appear. | Delivers the requested visual answer with pinned context and no background-monitoring claim. |
| B. Foreground chart watch | Add a session start/pause/end control and let Cleo update the map on material chart events. | More interruptive and needs a reliable event gate, attention policy, persistent runtime, and replay/shadow calibration. Keep as a later extension. |
| C. Draw only after the response | Return the same structured read, but paint all marks only after Cleo has finished. | Simpler implementation; loses the requested experience of watching Cleo map the chart as she works. |

**Risks and implementation gates:** exact mark retention and archived chart restoration depend on the selected provider's data-use terms; mark coordinates can drift if the chart revision changes during generation; small labels can become unreadable when several panes are open; and a runtime that emits only text cannot support real-time drawing until it provides the structured event contract above. Unknown source rights, source/cutoff mismatch, or unsupported renderer geometry block the affected archive or overlay rather than falling back to guessed levels. The only product choice required to start is selecting Option A as the first slice; it is recommended here because it supports live drawing while keeping the interaction user-initiated.

## Code anchors checked for this design

- `count-dashboard/web/vela-preview.js`: `addToolBeltDrawing`, `clearToolBeltDrawings`, `window.countDeskVelaContext`, and chart recreation in `loadPreview` and provider switching.
- `integrations/vela/src/core/drawings/DrawingController.ts`: programmatic `add`, `setVisible`, `setLocked`, `remove`, `all`, and `toJSON`.
- `integrations/vela/src/core/drawings/Drawing.ts`: time/price anchors, `visible`, `locked`, `zIndex`, and supported drawing types.
- `count-dashboard/web/vela-preview.html`: chart toolbar and existing Cleo context drawer.
