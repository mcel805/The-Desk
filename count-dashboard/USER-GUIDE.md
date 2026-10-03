# Batty on Count Desk: user guide

## What Batty is

Batty is the desk's conversational assistant. It starts with the tab and selection you are using, then explains its read in plain trading language. It uses the model and reasoning level selected below the chat composer. The current connection runs the local Codex CLI under your ChatGPT sign-in; it does not use an OpenAI API key.

Firstmate is the coordinator system around agents. It is not a model name. In the intended operating model, you talk to Batty, Batty decides whether the request needs a specialist, Firstmate manages any real handoff, and Batty returns one checked answer. A model choice changes how Batty reasons; it does not start a specialist by itself.

## Ask about the chart

1. Open **Count Desk**.
2. Select the asset and timeframe you want to discuss, then build the count.
3. Ask Batty a specific question, for example:

   > Read the current 30-minute structure. Give me the main and alternate scenarios, the evidence for each, and what would invalidate them. Tell me how old the data is.

4. Review the last-bar time and source Batty reports. Change the asset or interval first if you meant a different chart.

For Count Desk questions, the server reads a fresh, read-only snapshot from its local store for that request. It includes the selected symbol, timeframe and cutoff; run metadata and data age; up to 64 recent OHLC bars; recent structural count points; the saved drawings; and selected analytics such as confirmed swings, volume profile, Fibonacci levels, confluences, provisional paths, and liquidity zones. It does not send the full historical database.

On **Quant Lab**, “Share chart” sends the loaded chart evidence from the browser: up to 500 bars for the selected chart, up to 120 bars for each other loaded chart, the visible time range, active studies, and chart drawings. It also attaches a rendered image of the active chart when the renderer supports it; the separate **Screenshot** control lets you attach another image. If Cleo returns a `chart-markup` proposal, review the explanation and choose **Add chart marks** before it is drawn. Added Cleo marks use the native drawing controls, so they can be selected, moved, edited, and erased. **Clear Cleo marks** removes only Cleo's marks from the selected chart.

## Ask about other tabs

Batty stays available on Count Desk, Trading Journal, and Resources. On those pages it receives the active page and visible filter/selection label. It does not currently receive Trading Journal account rows, Liquidity Lab content, or the contents of other applications. Say what you want it to consider, or switch to Count Desk for a chart read.

## What happens during a reply

1. The chat records your message locally in the browser session.
2. The Count Desk server attaches the active view and gives the model read-only tools for the dashboard areas.
3. Batty decides whether the question needs a specialist. Technical chart reads go to the project-scoped Cleo agent, with the active instrument, timeframe, cutoff, stored evidence, and freshness details.
4. Batty waits for the specialist result, then relays it with clear Cleo attribution. Batty may explain the terms but must not replace the technical read with its own count.
5. For ordinary desk questions, Batty replies directly. Web research includes source links.

The activity card shows Batty coordinating the request. A specialist should be described as dispatched only when the Cleo subagent actually ran and returned findings.

## Recent chats

Use **Recent** in the chat header to reopen a conversation, or **New** to start a separate chat while keeping older ones available. Recent conversations and message timestamps are stored in this browser on this device; they do not sync to other devices. Times use the device's local timezone. Older turns from before this feature had no saved timestamps and appear as **Date unavailable** rather than receiving an invented date. Clearing this site's browser storage removes the local chat log.

## Firstmate specialists: current status

Cleo analysis is delegated to the project-scoped Codex subagent when a technical chart read is requested. The separate Firstmate crew lifecycle bridge is not connected: this handoff does not create a durable Firstmate task ID, support follow-up/stop operations, or return Firstmate lifecycle status.

Batty must not say a specialist completed work unless the named subagent actually ran and returned findings. Other seats in the Intellect ribbon remain role definitions unless their own dispatch path is connected.

## Data, research, and trading boundaries

- The chart snapshot comes from the locally stored dashboard bars and drawings. It may be delayed or stale; it is not automatically a live quote.
- Structural swing labels, forecasts, and projected paths are research aids from the current prototype. They are not validated Elliott Wave counts.
- The chat can search the live web and read local Count Desk, Trading Journal, and Liquidity Lab data when relevant. Web results and local dashboard records are sent to the selected Codex model through your ChatGPT sign-in.
- Dashboard tools are read-only. They cannot change settings or records, control another application, access a broker, or route orders.
- A connected data feed and live web search are different sources. Web search does not turn stored chart bars into live market data.
- Count Desk settings and drawing controls remain in the dashboard. Batty cannot yet change them by chat.
- Research is not a trade instruction. Keep all market-data collection within your provider's written display, analysis, cost, and retention rights.
- Trading Journal records are retrieved only when relevant to the question; they are not copied into every chat turn.

## Better prompts

- **Compare:** “What supports the preferred path, what supports the alternate, and which level changes your read?”
- **Check the evidence:** “Separate what is visible in the stored bars from the model's interpretation.”
- **Explain a term:** “Explain that in trader language and tell me why it matters on this chart.”
- **Specify a view:** “I mean MYM 30-minute on Count Desk, not the current journal tab.”
- **Check freshness:** “What is the last stored bar time and feed mode in the context you received?”

## Troubleshooting

- **Chat says it cannot sign in:** Sign in to Codex with ChatGPT on this Mac, then restart Count Desk.
- **Batty says there is no chart context:** Select a symbol/timeframe and build a count. If that timeframe has no stored bars, choose one with data.
- **The chart is old:** Check the feed status and last-bar timestamp before interpreting the read. A connected feed label does not by itself make its data real time.
- **No Cleo feedback appeared:** Batty should report that the handoff failed or identify missing chart inputs; it must not fill the gap with its own technical chart read. The local Codex subagent handoff is separate from durable Firstmate crew tracking.
