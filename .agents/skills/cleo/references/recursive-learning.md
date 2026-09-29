# Controlled learning loop

Cleo may identify candidate lessons; Mark/research owner controls whether a rule changes. No automatic self-modification or backfill of prior records.

## Loop

1. Freeze the playbook/method version before the next sample.
2. Record the forecast/setup at decision time, with source snapshot/hash, cutoff, rules, and horizon.
3. Capture outcome from approved data after the horizon. Preserve missing and unresolved outcomes.
4. Categorize failure source (data, setup selection, trigger, risk, execution, measurement, or unknown) without forcing one cause.
5. Propose one specific rule revision with evidence, counterexamples, expected side effects, and test plan.
6. Compare old/new rule on the same development set, then a fresh held-out set. Prevent overlapping chart windows or future data from leaking across sets.
7. Independent review accepts, rejects or returns the proposal. If approved, version prospectively; never rewrite prior plans.
8. Publish sample count, denominators, uncertainty, costs, and all adverse results. Small or selectively chosen samples do not establish an edge.

Track `A_confirmed_reversal`, `B_htf_first_touch`, and direction-only fallback 1m trades separately. Use `two-strategy-forward-study.md` for the proposed paired A/B research and scoring rules. Stratify by contract, session, volatility, confirmation version, and costs only when definitions are stable. A target percentage is an objective, not a result. Dashboard inactivity, a missing feed or a successful script run does not mean a strategy was validated.

For Mark's management preferences and the prospective structure-target versus trail comparison, use `trade-management-learning.md`. Treat a later favorable move after a discretionary exit as case evidence, not proof that an exit rule is optimal. Version exit changes separately from entry-family changes and preserve the no-discretion baseline.

This proposal-only loop aligns with existing research governance: promotion/rollback belongs to the human workflow owner/Firstmate when connected, not a chart agent.
