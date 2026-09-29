# Count Desk open-source integration workspace

This workspace owns the Node-side build and probe boundary. The Python Count
Desk remains the local UI/API authority; the source forks live under
`integrations/open-source/` and are tested before they are exposed to Cleo.

## Broker SDK smoke check

```sh
npm install
npm run broker:catalog
```

The catalog command only enumerates supported adapters. It does not read
credentials, contact a broker, import fills, or expose an order endpoint.
Credentials belong in a local environment or secret store when a specific
read-only paper/shadow adapter is approved.

The dependency is the MIT-licensed `@luxalgo/broker-sdk`. Do not import the
separate experimental orders module into Count Desk.

## Local MCP boundary

Build and run the Count Desk-owned MIT MCP fork through stdio:

```sh
npm run mcp:build
npm run mcp:stdio
```

To verify the installed sidecar without credentials, use the protocol probe.
It sends only `initialize` and `tools/list`, then exits after printing the
server version, tool inventory, and any keyless-mode warnings:

```sh
npm run mcp:probe
```

The checked-in `integration-manifest.json` is the capability contract for the
Python status endpoint and future adapters. It keeps package versions,
provenance requirements, and disabled write/execution paths explicit.

The fork has no account or hosted-journal modules, so it does not require
LuxAlgo authorization. Broker adapters remain unavailable until a specific
read-only paper/shadow credential is configured server-side.

To expose the read-only MCP allowlist to Batty/Cleo during a local Count Desk
session, start the dashboard with:

```sh
BATTY_LUXALGO_MCP_ENABLED=1 python3 count-dashboard/server.py
```

The flag is off by default. The Count Desk command enables library, broker
read, Edge Stats, tracker, and prop-firm research tools; it does not expose
journal/account modules, journal writes, or the SDK's experimental order
module.
