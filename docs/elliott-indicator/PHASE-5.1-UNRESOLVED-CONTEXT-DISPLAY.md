# Phase 5.1: unresolved parent context display

Release: `v0.4.5-unresolved-context`.

The 4H screenshot showed `5/12 legs`, `7 unresolved`, and `no supported local run`, but no count lines. The strict validator was working; the renderer made the result too opaque. The new display rule draws whatever parent segments the bounded search did find when no supported local run exists.

The fallback is presentation-only. A node is gray when it is not promotable to the requested evidence depth. Its labels carry `?` even in Clean mode. Children inherit unresolved styling when their parent is unresolved. The panel tooltip states that these are geometric hypotheses and that subdivision evidence is missing.

The default is enabled so 4H remains readable. Users may turn it off when they want an evidence-only view. The fallback does not change candidate selection, support checks, forecast eligibility, invalidation, locking, or search budgets.

Acceptance: compile v0.4.5 on MYM 4H with the same data and settings as the screenshot. Confirm that the previously blank area now shows gray provisional parent connectors and question-mark labels; then compile the same release on 1H and verify the existing supported/local styling remains unchanged.
