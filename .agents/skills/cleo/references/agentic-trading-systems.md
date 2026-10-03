# Agentic trading systems

Use this workflow when designing a trading agent that observes market state, evaluates a plan, communicates decisions, or may eventually control a paper workflow. Specify what the system is authorized and technically able to do at each stage. Architecture documents and agent skills do not establish deployed capabilities.

## Describe the operating stages

Name the stage and allowed actions explicitly:

1. **Research/design:** define behavior and interfaces from supplied or approved evidence.
2. **Replay:** run frozen logic against historical records with decision-time availability preserved.
3. **Shadow:** observe eligible live/delayed inputs and record decisions without taking action; clearly disclose source and freshness.
4. **Paper proposal:** produce a conditional paper plan for explicit user review.
5. **Paper execution:** only through a separately authorized paper product flow that returns a durable receipt.
6. **Live execution:** outside this repository's current authority; requires a separately approved and verified integration, permissions, risk controls, and operating policy before it can be represented as available.

Moving between stages requires an explicit gate and evidence. Do not describe a planned monitor, dispatch, broker link, or action route as active until it has been verified in the running system.

## Specify the agent contract

Document the agent's purpose, instruments and sessions, source inputs and freshness requirements, strategy/rule versions, decision cadence, state it may observe, tools it may call, outputs, persistence, and owner of each decision. Separate:

- **Observation:** sourced bars/events, timestamps, contract identity, and quality/freshness state.
- **Interpretation:** a model or rule's candidate scenario with evidence and uncertainty.
- **Risk gate:** independently enforced size, exposure, loss, session, and eligibility constraints.
- **Action:** an allowed paper recommendation or product action with explicit actor, approval, and receipt.
- **Record:** immutable input snapshot, rule/model version, decision, action or suppression reason, and resulting state.

Define the state machine and transitions, including candidate detection, confirmation, expiry, invalidation, duplicate suppression, user approval, cancellation, and recovery after restart. Specify idempotency keys and reconciliation before retrying any action that can create a position or record. Store rejected and suppressed candidates with reasons so missed and false interventions can be studied.

## Fail safely

Define hard constraints independently of the strategy signal. Specify configured limits and the response when any required value is missing or breached: stale/disconnected data, unknown contract or position, incomplete bar, conflicting sources, exceeded risk limit, unavailable risk service, duplicate event, clock/session mismatch, or ledger failure. Unknown state should block the dependent action and produce a clear status; do not guess or silently fall back to a riskier mode.

Include user-visible pause/resume and emergency-stop behavior, approval requirements by action, notification/suppression rules, audit retention, access control, and a tested recovery path. Model output cannot override hard risk controls. Do not imply account or position state without an authorized source. Avoid automatic retries for non-idempotent actions unless the system can prove the prior attempt did not take effect.

## Evaluate before increasing autonomy

Test the policy on replay with point-in-time inputs and adversarial cases: stale or missing data, delayed confirmation, duplicated/reordered events, disconnects, restarts, conflicting signals, and risk-service/ledger failures. In shadow mode, compare decisions and suppressions with time-aligned human labels before producing interventions. In paper mode, use explicit product receipts and realistic fill/cost assumptions. Measure operational reliability, rule violations, false and missed interventions, delay, and paper outcomes separately; trading performance requires its own frozen strategy study.

Keep a human able to inspect the evidence, pause the system, and understand why it did or did not act. Report the tested stage, exact tools and sources exercised, known gaps, and next gate. Current repository policy is paper/shadow only and provides no general live-order authority.
