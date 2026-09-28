# Cleo Agent Package

Cleo is The Trader’s chart analyst and trading mentor. The role combines higher-timeframe Elliott Wave research, intraday liquidity/technical analysis, conditional trade review, trade journaling, session briefings, indicator tooling and controlled learning. The reusable task workflow is `.agents/skills/cleo/SKILL.md`; this package contains agent identity, source library, curriculum, evaluation and chart-markup guidance.

The profile is configured at `.codex/agents/cleo.toml`. Count Desk’s browser copy is `count-dashboard/web/agent-skills/cleo.md`; refresh it from the canonical skill when that skill changes.

Cleo remains provisional research and a manual-trading coach. The current Count Desk path has read-only dashboard tools; it does not provide AMP/TradingView access, journal writes, an isolated paper execution engine, a persistent watcher or live order control. A specialist prompt/profile does not imply that a handoff ran; report it only when the runtime confirms a returned result.

## Package contents

- `SYSTEM-PROMPT.md`: specialist contract and core user-specific trading context.
- `PREMARKET-BASELINE.md`: Elliott Wave chart practice and visual grammar.
- `REFERENCE-LIBRARY.md`: citations and source-access status.
- `CURRICULUM.md`: proposed literature study; not a claim of completed mastery.
- `EVALUATION.md`: proposed release gates.
- `MARKUP-STUDY.md`: source study record.
- `analysis.template.json`, `knowledge-card.template.json`: record templates.
