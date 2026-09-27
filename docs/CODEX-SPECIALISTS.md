# Count Desk Codex specialists

This repository has four project-scoped Codex custom agent definitions under `.codex/agents/`:

| Codex profile | Source role | Bounded purpose |
|---|---|---|
| `evidence_analyst` | `agents/intellect/analyst.md` | Provenance and approved-input evidence packet |
| `chart_technician` | `agents/chart-technician/SYSTEM-PROMPT.md` | Provisional count and scenario analysis from supplied charts/data |
| `independent_reviewer` | `agents/intellect/independent-reviewer.md` | Independent disposition against frozen evidence and method |
| `paper_scenario_analyst` | `agents/intellect/paper-trader.md` | Hypothetical paper-study specification after independent acceptance |

## How to use them

Open this Git repo as a trusted Codex project. Ask the primary Codex agent to delegate one clearly scoped subtask to a named specialist. Keep repository, permitted inputs, instrument/contract, venue, timeframe, cutoff, expected artifact, and review gate in the task. Each specialist returns findings to the primary agent; the primary agent integrates them into the Firstmate-owned mission lifecycle when that integration exists.

Codex custom agents are project-scoped worker configurations for spawned sessions. They are not persistent departments, do not own parent/child mission tracking, and do not dispatch automatically from Batty or Firstmate. The custom-agent files set read-only sandbox defaults; Codex documents that the parent turn's live permission and sandbox choices are reapplied to child sessions. Select the parent session's permission mode deliberately.

The profile schema is based on the current official [Codex subagents documentation](https://developers.openai.com/codex/subagents), checked 2026-09-27. Each TOML definition uses the required `name`, `description`, and `developer_instructions` fields. The format can evolve, so review the current documentation before changing runtime settings.

## Pilot status and boundaries

The definitions have been created, but Codex loading/dispatch has not been smoke-tested in a fresh session. Treat the pilot as **configured, runtime-unverified** until the profiles appear and complete a read-only sample invocation. Never claim a role was dispatched based solely on its file existing.

All Count Desk work remains research/paper/shadow. The profiles do not authorize external market-data collection, broker/account access, order control, file mutation, or numerical probabilities without calibration evidence. Source rights and the relevant paper protocol must be supplied for each mission.
