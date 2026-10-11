# Count Desk block workspace foundation

This browser framework is the working base for the planned Blender and Unreal chart experience. It runs in the existing Chart Workspace at `/vela-preview.html` and uses the current Vela chart for prices and chart controls. Blender and Unreal are optional presentation layers to add later.

## What works now

- A 12-column by 8-row logical desktop board now drives the actual CSS placement. The chart reserves the primary area in the standard desk. A single visible widget fills the board. At 1050 px and narrower, modules form one readable column with the chart first and separately saved row heights.
- Build mode exposes board studs and a block tray. Dragging a title bar lifts its block and shows its snapped footprint; dropping requests that position and repacks collisions deterministically. Header arrow keys move one cell at a time. The glowing edge previews a resize before committing. Undo restores the previous move or resize, and Escape cancels an active drag.
- Each widget uses a raised shell, satin header, soft contact shadow, and restrained selection light. The sound is a synthesized short click and remains optional, off by default. Reduced-motion preference removes the settlement animation.
- The Plan on Chart rail collapses to a persistent tab and restores the chart area. Draft form values stay mounted. Opening a plan from the chart expands the rail.
- Candle Life adds a switchable visual layer over stored Count Desk historical bars. It receives the line segments drawn by the active Liquidity indicator and marks the first closed bar whose high–low range spans each line price while that segment exists. The view shows only one small burst at a time, centered on the line price, and moves to the latest qualifying bar when switched on. Vela still draws every body, wick, time slot, axis, and scale. A bar range spanning a line is a visual touch hypothesis; the exact intrabar touch time and sequence are unknown. Motion follows reduced-motion preferences, and the switch saves in this browser.
- The Candle Life inspector opens from the chart toolbar or the reaction marker. Its scrubber, bar steps, reaction jumps, latest-bar shortcut, and auto scan select stored bars without changing OHLC data. The selected bar is highlighted and brought into view. The card shows its timestamp, OHLC, matched line and touch price, instrument, timeframe, source, rule version, and dataset cutoff. During a scan, markers stop at the selected bar; the full historical chart remains visible, so this is an inspection view rather than a no-lookahead market replay.
- Module order, named size, custom span, grid position, mobile height, and templates save in this browser. Build mode is a temporary editing view; the saved layout remains visible after leaving it.

## Code boundaries

| File | Responsibility |
| --- | --- |
| `count-dashboard/web/lego-grid-core.js` | Stateless grid dimensions, module spans, collision checks, and deterministic packing. No market data or renderer dependency. |
| `count-dashboard/web/modular-workspace.js` | Existing widget composition, interactions, persistence, and placement events. |
| `count-dashboard/web/lego-workspace.css` | Browser block materials, grid sockets, selection/resize states, responsive layout, and paper-rail collapse. |
| `count-dashboard/web/paper-chart-planner.js` | Existing paper planner plus its collapse control and saved preference. |
| `count-dashboard/web/living-candles.js` and `.css` | Closed-bar event rules, Vela-aligned effect layer, motion, scrub inspector, and source readout. |

`countdesk:workspace-layout` bubbles from `#modularGrid` after layout. Its `detail` is `{version:1, grid:{columns,rows}, placements:[{id,x,y,columns,rows}]}`. The desktop base is 12 × 8; the grid reports additional occupied rows when needed. Mobile uses one column. Positions are one-based grid cells. This is a presentation contract only. A future renderer can place block meshes from these rectangles, while the browser retains chart, form, keyboard, and source-state authority.

The browser layout is the source for module positions. A future Unreal scene should listen to this event and return interaction requests (select, move, resize) to the browser layout controller. It must not create price bars, market timestamps, paper fills, or orders.

## Blender and Unreal asset handoff

Build one calibrated block kit before making the full environment. One horizontal grid unit and one vertical grid unit are the design scale. Each mesh uses a lower-left board pivot, a named top/front/side material set, and a bounding box that matches an integer span. Deliver a chart block, compact data block, edge grip, snap socket, and neutral board first; give each low/medium/high detail variants. The browser CSS shell is the visual reference for depth, bevels, teal selection light, and contact shadow.

The living candle is a separate procedural actor. Its body endpoints map to open and close; wick endpoints map to low and high; horizontal placement maps to the source bar time. Blender should supply reusable body/wick/material and aura/impact assets. Unreal should size the actor from sourced OHLC and animate the aura from qualified chart events. Uptrend expansion, downtrend withering, level breakthrough, and support/resistance reaction affect the aura and surrounding effects. They must not distort the encoded OHLC body, wick, price scale, or time spacing. See the local design artifact in `.lavish/chart-lego-grid-unreal-blender-plan.html` for the state vocabulary and visual study.

## Next build gate

Review the line-touch events against an identified bar fixture and confirm the plotted line lifecycle and coordinate alignment. Export those event records with their bar time, line identity, source, rule version, and cutoff for a Blender/Unreal asset handoff. Before calling the immersive mode 4K-ready, prove the Unreal candle has the same OHLC geometry and event timing as Vela and measure frame time on the named target machine. The browser grid and chart should still work when the Unreal renderer is unavailable.
