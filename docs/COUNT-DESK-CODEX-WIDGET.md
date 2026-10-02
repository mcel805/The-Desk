# Count Desk Codex widget

The **Codex** block in Chart Workspace is a local client for `codex app-server`.
Codex owns model turns, tools, skills, and project subagents. Count Desk provides
the widget, a loopback bridge, and a small transcript cache for display.

## Use

1. Sign in to Codex CLI with **ChatGPT** on the Mac that runs Count Desk.
   The widget checks `account/read` for a `chatgpt` account and does not accept
   API-key sign-in or read an OAuth token into Count Desk.
2. Open the Chart Workspace and select **› Codex** in the workspace toolbar.
   It adds the widget or focuses it if already present. Codex is also in
   **Add widget**.
3. Select **New**, then send a message. A chart request can ask Codex to call
   the project `cleo` subagent. Check **Share chart context** to include the
   browser's visible symbol, timeframe, source label, and cutoff in that turn.

The widget is research and paper/shadow only. Its Codex thread uses the
read-only sandbox and never requests escalation. The dashboard MCP tools are
read-only. A Cleo call is a Codex subagent turn, not a Firstmate work item.

Only local thread IDs, titles, and display transcripts are saved under
`count-dashboard/output/codex-widget/`; that directory is Git-ignored. Codex
keeps the authoritative thread. A Count Desk restart resumes it through
`thread/resume`. The widget currently supports text messages, streaming,
recent chats, and interruption. It does not provide the full Codex terminal,
file attachment, or approval UI.
