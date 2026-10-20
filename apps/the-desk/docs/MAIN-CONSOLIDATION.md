# Main branch consolidation — 2026-10-19

The Desk feature histories were combined into one integration tree for `main`.
All pre-existing tracked edits and the ABC floating panel files were saved in
commit `2075a5f` before conflict resolution. Local databases, authentication
material, dependency directories, logs, and generated test output are excluded.

## Included histories

| Feature | Branch tip included |
| --- | --- |
| Paper trading, chart controls, wallet funding, precise open P&L | `codex/desk-wallet-funding` at `d609b0a` |
| Preserved wallet restoration review fixes | `0940f1d` |
| Robinhood accounts, assets, chart previews, shadow workspace | `codex/robinhood-account-agent` at `26a1fef` |
| Read-only IBKR data and isolated demo | `codex/desk-ibkr-data` at `f334579` |
| Elliott studies and reviewed panel behavior | `codex/agentic-elliot-waves` at `daa9258` |
| Market Geometry | `codex/agentic-market-geometry` at `5d54afb` |
| ABC Reversal | `codex/agentic-abc-reversal` at `f5f2bcb` |
| Floating panels and gesture isolation | `codex/abc-floating-table` at `11e6b6d` |

The remaining local branches and fetched remote tips were already ancestors
of these histories. Explicit merges retain the feature and review commits;
newer combined indicator catalog, runtime recovery, and P&L behavior supersede
older versions where the same code was previously cherry-picked.

## Reconciled behavior

- Paper positions, account totals, DOM, and chart labels retain precise sub-cent P&L.
- Robinhood has its independent account workspace and chart account context.
  Broker-native tickets remain preview-only; shadow evaluations create no orders.
- IBKR is an optional read-only data provider. Its default mode is off, and demo
  data stays clearly identified. It does not create futures order authority.
- Reviewed removal of Hyperliquid venue submission/cancellation is retained.
  Wallet and venue account views are read-only; chart execution remains paper.
- Wallet restoration binds a provider before rendering an authenticated identity.
  Current wallet account selection and Ledger account choices are retained.
- Synthetic HTTP fixtures copy all required merged server modules. Host tests
  supply real candle fixtures required by the existing missing-history guard.

## Validation and limits

The consolidated tree passed 96 focused JavaScript checks covering account
switches, Robinhood context, paper P&L, wallet restoration, IBKR provider state,
chart brackets, DOM, floating panels, and Pine history/revision handling.
The Python suite ran 158 tests successfully, with nine opt-in HTTP/journal tests
skipped. Browser checks exercised the Robinhood workspace and account/asset
selection against an isolated synthetic broker fixture.

The broad indicator suite is not fully green. Five Liquidity/Cleo research
assertions also fail against the pre-consolidation checkout: original-input
parity, source-frame coverage, a Clean 15-minute display expectation, a fixed
5-minute sweep count, and an intrabar redraw expectation. This consolidation
preserves those source calculations rather than silently changing strategy
rules to satisfy old assertions. Broker OAuth, live brokerage reconciliation,
IBKR entitlements/Gateway connectivity, and matching-data chart parity remain
separate acceptance work. No green CI claim is made.
