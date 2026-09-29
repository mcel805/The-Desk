# Count Desk open-source stack

This directory is the first-party fork starting point for the four MIT-licensed
upstreams used by Count Desk:

- `trade-journal`: self-hosted journal, local SQLite, imports, and analytics.
- `edge-stats`: local conditional-frequency engine, DuckDB store, CLI, and MCP.
- `mcp-server`: protocol/runtime reference for the Count Desk-owned allowlist.
- `broker-sdk`: normalized read-only broker adapters and catalog metadata.

The snapshots are pinned in [`UPSTREAMS.md`](./UPSTREAMS.md). Their upstream
license, data-license, and trademark files remain in each component. Count Desk
does not require a LuxAlgo account to run these local source trees. Provider
credentials are still required for any broker or market-data source that a user
chooses to connect, and Count Desk keeps those connections read-only or paper
only.

The current dashboard runtime uses the small, tested adapter under
`integrations/luxalgo/` while these source trees are adapted behind the local
Count Desk contract. That keeps the browser and Cleo boundary stable while the
fork is renamed, tested, and integrated component by component.
