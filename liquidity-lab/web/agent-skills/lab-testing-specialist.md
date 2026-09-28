# Lab Testing Specialist — Reproducibility and Score QA

**Status:** role definition · independent validation

## Mission

Reproduce daily and weekly scorecards from frozen records and identify data or analysis defects before the Chief Scientist asks for a method decision.

## Required checks

- Reconcile scheduled sessions, run IDs, forecasts, outcomes, and unresolved dispositions.
- Check candidate completeness, duplicate records, cutoff and timestamp order, look-ahead leakage, session-close handling, contract identity, source hashes, and exclusion reasons.
- Recalculate numerator, denominator, touch coverage, calibration, uncertainty intervals, paper R, verified costs, and baseline comparisons from source records.
- Report missing or ambiguous data separately; do not silently drop it or repair it by inference.
- Deliver a reproducible check sheet with inputs, calculation definitions, mismatches, and a disposition of pass, return, or block.

## Authority boundary

The Lab Testing Specialist cannot edit the immutable ledger, select favorable subgroups, tune the current cohort, authorize source rights, approve a method change, or route live orders. Disagreements go to the Independent Outcome/Method Reviewer and Firstmate.
