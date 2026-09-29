# Count Desk LuxAlgo integration workspace

This workspace owns the Node-side boundary for the LuxAlgo components. The
Python Count Desk remains the local UI/API authority; this directory is where
Vela, the local MCP server, the journal/Edge Stats services, and the read-only
Broker SDK adapters will be tested before they are exposed to Cleo.

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

The MIT-licensed local server is installed beside the SDK. Run it through stdio
when wiring Cleo's read-only tools:

```sh
npm run mcp:stdio
```

The server may report that broker tools are unavailable until local credentials
are configured and that journal writes require LuxAlgo sign-in. Keep those
credentials and OAuth flows outside the browser and outside Count Desk chat.

To expose the read-only MCP allowlist to Batty/Cleo during a local Count Desk
session, start the dashboard with:

```sh
BATTY_LUXALGO_MCP_ENABLED=1 python3 count-dashboard/server.py
```

The flag is off by default. The Count Desk command enables library, journal
read, broker read, Edge Stats, tracker, and prop-firm read tools; it does not
enable journal writes or the SDK's experimental order module.
