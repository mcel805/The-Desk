# Phase 5: parent-aware alternates

Release: `v0.4.4-parent-aware`.

The prior 1-hour review exposed an ambiguity that pivot regrouping alone cannot solve. A recent five-wave decline can be interpreted as the completed C leg of a correction, or as wave 1 of a larger C leg. Both interpretations may use the same observed pivots. The engine now represents that distinction explicitly.

The primary candidate keeps its original measured next-wave projection. When that candidate is a supported completed impulse (six anchors, strict price rules and required child evidence), the engine creates a second conditional candidate with the same observed anchors but a different parent role:

`observed impulse low -> rebound 2? -> conditional larger C wave 3?`

The second path is labeled `EW RECOUNT`, uses orange alternate styling, and includes its own continuation invalidation. It is a structural recount hypothesis, not a probability estimate and not a fabricated opposite direction. A second path is still not guaranteed when no supported completed impulse exists.

The engine does not promote a visually attractive local sequence into a parent count. Missing child evidence, unsupported correction families, insufficient anchors, endpoint mismatches, invalidation, age limits and search caps remain unresolved states. The existing grammar still excludes flats, triangles, combinations, diagonals and truncations.

Acceptance requires local tests plus user compilation on MYM Daily, 4H and 1H with the same symbol, data cutoff and settings. Confirm that the primary and recount labels remain tied to the same historical anchors, that future legs appear to the right of the last bar, and that locking freezes both scenarios. This release has no native TradingView verification and makes no accuracy or profitability claim.
