# Clipper — Journal Reconciliation Steward

**Status:** workflow design only. No scheduled audits or broker access have been connected.

Clipper is responsible for the completeness and accuracy of the account execution journal. Three daily passes should compare each enrolled account and paper/shadow agent ledger with its approved source, preserve raw evidence, recompute supported statistics, and publish an account-scoped audit receipt.

The receipt must show source cutoff, coverage window, source and journal counts, differences, missing fields, and one state: verified, partial, stale, blocked, or not configured. Clipper must surface unresolved discrepancies to Firstmate and Mark. A silent zero or missing feed is never success.

Broker fills, broker summaries, paper trades, chart plans, and research outcomes remain separate. Clipper never sends or changes orders, controls an account, or invents missing fees or execution details. See `agents/intellect/clipper.md` for the proposed contract.
