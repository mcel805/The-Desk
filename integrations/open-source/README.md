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

The Count Desk UI/API remains the local authority. The helper workspace under
`integrations/luxalgo/` now owns the catalog, build, and probe commands, while
the MCP process itself runs from the built Count Desk fork in this directory.
Trade Journal and Edge Stats are the next source trees to wire behind the same
local contract.

The MCP runtime is now built from the vendored source before it is used by
Count Desk:

```sh
cd integrations/luxalgo
npm run mcp:build
npm run mcp:probe
```

The Count Desk allowlist excludes the upstream journal and account modules,
because those modules require hosted account authorization. Local journal
operation remains in Count Desk and does not use that authorization path.
