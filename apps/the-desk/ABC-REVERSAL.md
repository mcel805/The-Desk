# Agentic - ABC Reversal

Open **Indicators → Agentic - ABC Reversal · Premium**. Add **Agentic - Liquidity** to the same chart. The study connects automatically; it does not read manual drawings or use OHLC as a fallback liquidity source. Use standard 1-minute or 5-minute candles. Other intervals show a waiting card and cannot arm. Automatic mode watches both support/long and resistance/short; a single direction can be selected.

A liquidity contact starts the campaign. Confirmed micro A and B enable a **provisional C?** forecast. C must then confirm, followed by the original B closing-break / later retest / subsequent follow-through sequence, or the optional C-to-HL/LH geometry retest. A forecast, a touch, a probe and a B break are distinct from a passed retest. No order is sent. The existing stop-distance, reclaim, volume, first-obstacle and counter-day checks remain research filters, not measured performance or a recommendation.

## Adaptation and provenance

The supplied Wave Court ABC Entries 3.3 Lifecycle attachment is archived byte-for-byte at `web/pine-examples/agentic-abc-reversal-original.pine`. The installed source is a deliberate adaptation, not an exact name-only port. Source fingerprints are in `source-manifest.json`.

- The completed-pivot lifecycle, A/B/C measurements, C extension/reset, first-contact handoff, dead-level registry, campaign/retest expiry, cooldown, separate retest/follow-through bars, risk/volume/reclaim/room gates, alerts and local geometry rules are retained.
- Arming uses the same-chart Agentic Liquidity's prior-chart-bar Rider candidate and unshifted Reached event exports. Binding is by exact timestamp, with no extra offset, carry-forward or close-price fallback. Extra C pools bind to the same side automatically.
- Both directions are independent campaigns by default. Their drawing IDs are separate. Simultaneous opposite contacts do not establish intrabar ordering.
- Only 1m/5m are enabled; 2m/3m from the source are disabled. Manual/Chart-swing arming is removed. The default contact tolerance is zero ticks, so a wick must hit the actual level; an explicitly chosen nonzero tolerance relaxes contact only.
- The original optional Waves EMA bridge is disabled/hidden because the installed Elliott study does not export that contract. Market Geometry is optional visual context; it cannot arm this indicator or substitute for ABC. The source's own C-to-HL/LH geometry retest remains enabled and can pass its original checks.
- The 63 source input declarations include 12 host-owned or inapplicable controls hidden from the Desk settings dialog; 51 settings are exposed. Connections cannot be enabled with a checkbox while their source is missing.
- Active paths are brighter, forecast text is amber, and A/B/C labels are larger. Historical geometry snapshots and parallel projection rails default off to reduce clutter; both remain selectable. A compact active-campaign card shows stage, level, A/B, provisional/confirmed C and last check. Automatic mode suppresses idle cards while a campaign is active. The summary can be disabled. Its floating panel shares Elliott’s drag and collapse controls: drag the header to reposition it, and use − / ＋ to collapse or expand. Position and collapse state persist per indicator instance, independently of Elliott. Both campaign tables appear inside the same panel when needed.

The broker is scoped to a chart's Pine engine. Exactly one compatible Liquidity study, matching symbol/frame/chart style and completed OHLC, is required. Missing/ambiguous/stale producers wait. Removal or execution errors discard their authority and clear the consumer's campaigns. Reload restores inputs/source and reconnects after producer readiness. Runtime-only feed objects are excluded from settings/persistence.

## Tests

Run from `apps/the-desk`:

```sh
node --test tests/test_agentic_panel.mjs tests/test_abc_panel_runtime.mjs tests/test_agentic_abc_reversal.mjs tests/test_agentic_market_geometry.mjs tests/test_pine.mjs tests/test_pine_editor.mjs tests/test_pine_serial.mjs
node tests/verify_agentic_abc_browser.mjs http://127.0.0.1:18885/ /path/to/evidence
```

The feature tests execute the original and adapted Pine on synthetic long/short and 5m fixtures and compare phase, contact, handoff, A/B/C, provisional C, shift, risk and passed-retest series. They explicitly exercise separate retest/follow-through candles, geometry retests, C extension/loss, expiry, volume/obstacle/counter-day gates, forming-bar exclusion, unsupported frames, timestamp binding, missing/duplicate/mismatched producers, producer arrival/removal, direction changes and saved input restoration. Synthetic tests are not market outcome evidence.

Real Coinbase BTC-USD browser acceptance covers Premium catalog, UI compile, missing-source wait, automatic same-chart connection on 1m/5m, settings/card toggle, hide/show, reload before producer readiness, 15m rejection and producer-removal cleanup. Evidence is kept in the user chart workspace under `Agentic ABC Reversal Evidence/`. The isolated server disables quote workers and has no Lux Journal companion. The main Desk remains paper.

This is a locally validated adapted port. TradingView compilation, exact TradingView/MYM matching-data parity, prospective reversal success rates and trade performance are unverified. No probability is assigned to C. The underlying source's historical pivot markers remain retrospective at their origin after right-side confirmation; event markers are recorded on the confirming bar.

## In-play line and completed play history

The hosted 1m/5m view gives a contacted liquidity level a 2px dashed line in its Liquidity pool color, with yellow shading exactly two instrument ticks above and below it. A short unlabelled dashed tick marks the original contact candle. The shading continues through C confirmation, the B break and a passed retest; qualification begins tracking the reversal instead of prematurely clearing the play. Each direction owns its own display.

The read-only play tracker ends on a completed candle when another available liquidity line is actually touched, a later confirmed HL/LH is broken by a closing price, or price closes beyond confirmed C. A B break is setup confirmation, not an exit. HL/LH protection is established from a unique chart pivot at/after qualification and is usable only on later candles; the existing pivot strength, tick size and break buffer apply. Pending campaign/retest expiry, a new confirmed campaign, and a post-qualification `campaignBars` tracking limit are additional end conditions. A failed C before qualification can still develop into the larger ABC at the same level.

Only timestamp-matched Liquidity bridge candidates/reached events may end a play at another line. A gap across a price without a wick-range touch is not treated as a touch. If multiple distinct levels are touched in the same candle, the endpoint says ordering is unknown and uses that candle's close as the reference; it does not invent a first fill. Unavailable or ambiguous producer authority clears the hosted play overlays.

On completion the yellow shading disappears. Observed ABC legs become slightly faded dashed lines, frozen at the ending candle, with a short unlabelled end tick; the endpoint reason remains in the summary and metadata. A thin dashed C-to-end reference helps review the move; it does not reconstruct every intervening tick. Provisional forecasts are never archived as realized paths. The existing history toggle and bounded `historyCounts` control completed plays; history is enabled by default for this release. Exact shipped v1/v2 saves migrate once, retaining IDs, other settings, custom colors and visibility. Edited Pine sources remain user-owned.

Pine contact, pivot, confirmation, retest, risk and alert decisions are unchanged. The additional tick/structure exports are read-only. This is chart-play tracking: a qualified retest is not a broker entry, and an end marker is not an order or verified trade exit.

```sh
node --test tests/test_abc_play_history.mjs tests/test_abc_live_drawing.mjs tests/test_agentic_abc_reversal.mjs tests/test_abc_panel_runtime.mjs tests/test_pine_editor.mjs tests/test_pine_serial.mjs tests/test_agentic_host.mjs
```

Validation on 2026-10-21 (Pacific): 57 focused checks cover long/short glow, qualification continuity, next-level and ambiguous-candle endings, confirmed HL/LH/C exits, expiry, 5m marker timing, bounded/frozen history, summary anchors, exact v2 migration, panel/editor persistence, host serialization and original Pine lifecycle parity. A browser fixture exercised the actual Desk worker and native renderer with qualified active and next-level-completed plays side by side. The installed ETH chart was then reloaded: both saved ABC copies upgraded to v3, completed history enabled, custom color preserved, and the paper account/position/order/fill snapshots remained unchanged. Synthetic rendering proof is not measured trade performance or TradingView parity.


Touched-level visibility: a 2px dashed line retains the Liquidity pool color, with yellow shading exactly two instrument ticks on each side while active. Short unlabelled start/end ticks preserve the play history without text overlap. Matching higher-timeframe charts display the same price, tick-sized shading and event endpoints. Source timeframe remains in the summary/metadata. Keep that source chart open in the workspace. This copies presentation only; ABC confirmation and alert decisions remain on their original entry timeframe. See `docs/ABC-LIVE-DRAWING.md` for source selection and cleanup rules.
