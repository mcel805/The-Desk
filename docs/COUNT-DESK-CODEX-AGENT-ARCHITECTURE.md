# Count Desk Codex agent architecture

Status: implemented in the local Count Desk checkout, 2026-10-03. The shared Codex widget is mounted in Quant Lab and Vela. Runtime Build execution is wired, but the final live write/approval smoke remains unverified because Codex reported the account usage limit during the smoke turn.

## Decision

Make the existing local Codex app-server bridge the conversation runtime for Quant Lab and the Vela workspace. Present one Codex chat component with product-specific chart context. Keep research the default; allow a clearly requested Build turn to edit this repository through Codex's workspace-write sandbox and a browser approval flow. Do not expose broker write tools or live order routing.

This is an embedded Codex client, not a terminal emulator. The browser talks to the loopback Count Desk server; the server owns the local app-server process, thread mapping, authorization, and event stream. The app-server owns model turns, tools, skills, and subagent execution.

## Implemented

- `count-dashboard/codex_widget.py` is the local app-server bridge. Research turns use a read-only sandbox and decline tool approvals. Build turns use repository-scoped `workspaceWrite`, no network access, and a one-time approval relay bound to the active thread and turn.
- `count-dashboard/web/codex-widget.js` is shared by Quant Lab and Vela. It provides chat history, Research/Build selection, skill and agent pickers, optional chart context and screenshots, streamed Codex activity, Stop, and approval cards.
- Quant Lab's former `/api/chat` composer is now preserved as collapsed, read-only local history. The Codex widget receives a Quant Lab snapshot only when Share chart is enabled.
- Project skills are discovered through Codex and selectable from the widget. Selecting `$cleo` passes the existing `.agents/skills/cleo/SKILL.md` as native skill input. Selecting the Cleo agent requests an actual Codex subagent handoff; activity is labelled as Codex subagent activity, never Firstmate dispatch.
- Project agents are discovered from `.codex/agents/*.toml`. The selector labels a requested agent; only returned runtime events establish that the worker started or completed.
- `.agents/skills/quant-lab/SKILL.md` now documents Research and Build modes and distinguishes a reusable skill from a separately dispatched agent.
- `docs/COUNT-DESK-CODEX-AGENT-ARCHITECTURE.md` records the contract and remaining verification limits.

## Verification state

- Automated backend coverage previously passed: 8 focused `test_codex_widget` checks, including native Cleo skill input, Research sandbox, repository-scoped Build policy, one-time approval identity checks, image validation, and fail-closed Research approvals.
- JavaScript syntax checks, Python compilation, and `git diff --check` passed for the touched widget files.
- Live Quant Lab and Vela views rendered the shared widget. A real Cleo request previously returned actual Codex subagent activity; a follow-up UI check showed the account usage limit, so the Build write/approval loop could not complete.
- Live health checks passed for Count Desk `/api/health`, Codex widget `/api/codex-widget/health`, Liquidity Lab `/api/health`, and the journal `/api/accounts`. The Quant Lab browser tab shows the redesigned widget; the Codex account limit currently prevents sending a new model turn.
- The bounded Build smoke file was not created. No Build approval was granted.
- This checkout contains many unrelated pre-existing edits. They were preserved and no commit was made.

## Product contract

1. **One visible conversation per task.** The user can resume the same Codex thread from Quant Lab or Vela. The active chart is attached only when the user chooses Share chart; the conversation clearly shows which chart snapshot was sent with each turn.
2. **Research mode is the default.** Codex may read approved chart, journal, and Lab context; answer and draft hypotheses; invoke project skills and actual configured specialists. It cannot modify workspace files or submit a paper ticket.
3. **Build mode is explicit per turn.** Codex may read and edit only the approved repository root with network access disabled. Commands and file changes requiring approval become actionable cards. The browser displays the exact requested action, then relays an approve or decline decision. Mode is recorded with the turn. The widget currently does not create a durable diff/test receipt; inspect the workspace diff and Codex's test summary after a Build turn.
4. **Paper actions remain product flows.** A simulated ticket is an explicit chart UI action with its own receipt. Codex may draft a paper plan or propose a ticket, but the conversation does not silently turn prose into a position, fill, journal entry, or broker action.
5. **Skills describe workflows; tools provide authority.** `$quant-lab` handles chart research framing; `$cleo` handles chart/trade analysis when actually invoked; Indicator Agent owns a candidate build; Scientist/Lab owns frozen measurement; Independent Reviewer checks evidence. A skill file or role card does not prove a specialist ran.
6. **Firstmate status stays truthful.** A Codex subagent event is shown as a Codex subagent event. It becomes a Firstmate task only after a real Firstmate bridge returns task identity and lifecycle state.

## Architecture

```text
Quant Lab chart ─┐
                 ├─> shared Codex chat component ─> loopback API ─> Codex app-server
Vela chart ──────┘         │                             │                │
        source / symbol / timeframe / cutoff      thread + event store  skills, tools, subagents
        + optional screenshot                     approval relay        workspace sandbox
                                                     │
                                          read-only Count Desk MCP tools
```

The chart context adapter returns a typed snapshot: chart ID, provider/source, venue, symbol and dated contract when known, timeframe, timezone, last loaded bar timestamp, fetch time, freshness/history state, overlay versions, and any selected range. Missing fields remain unknown. Server validation must cap size and reject malformed or stale claims; the browser snapshot remains untrusted evidence. The transcript should retain the snapshot receipt associated with the turn, rather than overwrite context when the chart changes.

## UI contract

- Header: thread selector, New, current **Research** or **Build** mode, local Codex connection state.
- Context strip: **Share chart** toggle and a concise source / symbol / timeframe / cutoff receipt. Screenshot preview and removal sit beside it.
- Stream: user/assistant messages, actual skill or specialist events, tool activity, approval cards, errors, and file/test artifacts. Show `requested`, `running`, `completed`, or `failed` from events; never infer completion from a badge.
- Composer: one message field, attachment control, Send, and Stop. Offer chart/indicator/strategy starter prompts without hardwiring a specialist dispatch.
- Build review: the current widget prompts the user to inspect the workspace diff and test results after the turn. A structured changed-file list, durable diff/test receipt, and review-workflow handoff remain follow-up work. Keep tool output bounded and redact secrets before it reaches the browser.

## Delivery status

- Shared `createCodexWidget` is mounted in Quant Lab and Vela. Quant Lab's previous composer is read-only history; `/api/chat` remains available for other existing callers.
- The widget sends optional selected-chart snapshots and screenshots, resumes saved Codex threads, and exposes stop, skill, and named-agent controls.
- Research and Build policies plus approval request/response handling are implemented. Research is read-only; Build is repository-scoped with network disabled.
- Live browser rendering, route health, and a real Cleo delegation event were observed. The Build write/approval cycle and thread handoff between Quant Lab and Vela still need live end-to-end verification.
- The current widget does not generate a structured diff/test receipt or hand off to the existing review workflow.

## Acceptance checks

- **Verified in code/tests:** project skill selection passes native skill input; named agents are requested through Codex and surfaced from actual activity events; Research uses read-only permissions; Build is confined to the repository with network disabled; approval identity is bound to the active thread and turn; screenshot type and size are validated.
- **Verified live:** Quant Lab and Vela rendered the shared widget; a Cleo request returned real Codex subagent activity; Count Desk, Codex widget, Liquidity Lab, and journal health endpoints responded.
- **Still pending:** Build file write plus approve/decline through the browser; cross-surface thread resume; refresh persistence; and error/stop recovery. The live Build check was blocked by the Codex account usage limit.
- **Follow-up feature:** structured changed-file list, durable diff/test receipt, and review-workflow handoff.
- Paper simulation remains a separate explicit product flow. The Codex widget does not expose broker actions or submit paper tickets.

## Risks to resolve during implementation

- Approval requests must be correlated to the exact thread, turn, tool call, and requested command or file change; stale or cross-thread approvals must fail closed.
- The current single app-server process and in-memory event queue need restart recovery and bounded event retention. Transcripts and attachments are local private data and remain out of Git.
- The Quant Lab screenshot and browser-local chart snapshot need a clear retention limit and a server-side source check before they are treated as evidence.
- Existing paper simulation endpoints must stay outside Codex's general tool list; any future write tool needs an explicit, separately reviewed product action and receipt.

## References

- Official Codex app-server documentation: <https://developers.openai.com/codex/app-server>
- Official Codex skills documentation: <https://developers.openai.com/codex/skills>
