/*
  Count Desk local stdio entry. It serves only the modules listed in the
  Count Desk fork manifest. Broker tools read the user's own read-only keys
  from BROKERS_* environment variables; those keys never leave this machine.
  Account and hosted-journal modules are intentionally excluded from this
  fork, so local operation does not require an external authorization flow.
*/
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { registerLuxalgoTools } from "../server/create-server.js";
import { SERVER_NAME, SERVER_VERSION } from "../server/version.js";
import { connectionsFromEnv } from "../tools/broker/tools.js";
import { shutdownAnalytics } from "../platform/analytics.js";
import { hostedAuthRuntime } from "../auth/runtime.js";

// stderr only — stdout belongs to the MCP protocol.
const log = (message: string) => console.error(`count-desk-mcp: ${message}`);

export function main(): void {
  serve();
}

function serve(): void {
  const configured = connectionsFromEnv(process.env).map((c) => c.broker);
  log(
    configured.length > 0
      ? `broker tools serving ${configured.length} connection(s): ${configured.join(", ")} (read-only)`
      : "no broker configured (keyless tools only) — call broker_setup to see the env vars",
  );
  // Flush queued analytics events before the process dies. Only installed when
  // analytics is on, so default signal behavior is untouched otherwise.
  if (process.env.POSTHOG_PROJECT_TOKEN) {
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      process.on(signal, () => {
        void shutdownAnalytics().finally(() => process.exit(0));
      });
    }
  }

  // serveStdio() calls the factory once per connection (MCP 2026-07-28 pins
  // one instance for the connection's lifetime and also serves 2025-era
  // clients from the same factory). The auth runtime holds the server so it
  // can ask the client to open the sign-in URL (URL-mode elicitation).
  serveStdio(() => {
    const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
    registerLuxalgoTools(server, { entry: "local", auth: hostedAuthRuntime, log });
    return server;
  });
}
