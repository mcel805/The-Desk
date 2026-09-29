# Count Desk open-source upstreams

These are vendored source snapshots used as implementation references and
fork starting points. Count Desk owns the adapters and runtime policy in the
parent repository; upstream code is not treated as an authorization service.

| Component | Source | Pinned commit | License | Count Desk boundary |
| --- | --- | --- | --- | --- |
| Trade Journal | https://github.com/LuxAlgo/trade-journal | `949bca1993ee284e1facf2e26cfd1fa820b8f5cf` | MIT | local SQLite/journal surfaces; no LuxAlgo sign-in or write-through |
| Edge Stats | https://github.com/LuxAlgo/edge-stats | `a48259887962d0f67a27d2b0815e2df9a52efca5` | MIT code; `DATA_LICENSE` also applies | local bars and paper fills; retain data attribution and provenance |
| MCP server | https://github.com/LuxAlgo/luxalgo-mcp-server | `c8d7c98f97145fc321598b8ce7fc65beaa685a6d` | MIT | Count Desk-owned allowlist; protected account and write tools disabled |
| Broker SDK | https://github.com/LuxAlgo/broker-sdk | `56015a48dce27ac84349488108d1755b6733c269` | MIT | read-only adapter catalog and paper/shadow imports; order module disabled |

The snapshots retain upstream `LICENSE`, `DATA_LICENSE`, and `TRADEMARKS.md`
files. Before redistribution, apply the required copyright, attribution, and
trademark notices. Do not copy upstream hosted data, credentials, or accounts
into Count Desk.

To refresh a snapshot, update the commit here and rerun the relevant source
tests before changing the Count Desk adapter contract.
