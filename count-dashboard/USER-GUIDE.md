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

## Ask about other tabs

Batty stays available on Count Desk, Trading Journal, and Resources. On those pages it receives the active page and visible filter/selection label. It does not currently receive Trading Journal account rows, Liquidity Lab content, or the contents of other applications. Say what you want it to consider, or switch to Count Desk for a chart read.

## What happens during a reply

1. The chat records your message locally in the browser session.
2. The Count Desk server assembles the matching read-only dashboard context.
3. The selected Codex model reasons over your question and that context using the ChatGPT sign-in.
4. Batty streams the completed model text into the conversation.

The animation and activity card show Batty's request in progress. The specialist seats in the Intellect ribbon are role definitions, not proof those agents were called.

## Firstmate specialists: current status

**Live specialist dispatch from the web chat is not connected.** The installed Firstmate runtime does not currently provide a supported browser-callable bridge that can create a crew task, send later messages, read its live result, stop the same task, and return the normal Firstmate lifecycle status. A partial thread or a decorative roster would not provide that supervision contract.

So today, Batty answers with the selected model and attached Count Desk data. He must not say that the CFO, Scientist, Analyst, Chart Technician, Reviewer, Paper Trader, or Outcome agent completed work unless a later version shows a real dispatch and returned evidence. Firstmate crew dispatch remains a separate integration step.

## Data, research, and trading boundaries

- The chart snapshot comes from the locally stored dashboard bars and drawings. It may be delayed or stale; it is not automatically a live quote.
- Structural swing labels, forecasts, and projected paths are research aids from the current prototype. They are not validated Elliott Wave counts.
- The chat is not connected to a web-search tool, live-news service, broker, another application's controls, or order routing. Ask it to distinguish stored evidence from a hypothesis.
- Count Desk settings and drawing controls remain in the dashboard. Batty cannot yet change them by chat.
- Research is not a trade instruction. Keep all market-data collection within your provider's written display, analysis, cost, and retention rights.
- Trading Journal data is intentionally not attached to model prompts just because that tab is open.

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
- **You expected a Firstmate agent:** The dashboard does not currently dispatch the crew from browser chat. Its status display should say so until a supported bridge is implemented.
