import { spawn } from "node:child_process";
import { strict as assert } from "node:assert";

const child = spawn(process.execPath, ["dist/index.js"], {
  cwd: new URL("..", import.meta.url),
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, POSTHOG_PROJECT_TOKEN: "" },
});

let buffer = "";
const responses = new Map();
child.stdout.on("data", (chunk) => {
  buffer += chunk.toString();
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";
  for (const line of lines) {
    if (!line.trim()) continue;
    const message = JSON.parse(line);
    if (message.id !== undefined) responses.set(message.id, message);
  }
});

function request(id, method, params = {}) {
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  return new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error(`${method} timed out`)), 8000);
    const poll = setInterval(() => {
      const message = responses.get(id);
      if (!message) return;
      clearTimeout(deadline);
      clearInterval(poll);
      responses.delete(id);
      if (message.error) reject(new Error(message.error.message || method));
      else resolve(message.result);
    }, 10);
  });
}

try {
  const initialize = await request(1, "initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "count-desk-surface-test", version: "1" },
  });
  const result = await request(2, "tools/list");
  const names = (result.tools || []).map((tool) => tool.name).sort();
  assert.equal(initialize.serverInfo.name, "count-desk-open-source-mcp");
  assert.equal(initialize.serverInfo.version, "0.1.0");
  assert.equal(names.length, 34);
  assert(!names.includes("luxalgo_account"));
  assert(!names.some((name) => name.startsWith("journal_")));
  assert(names.includes("broker_accounts"));
  assert(names.includes("propfirms_simulate"));
  assert(names.includes("edge_report"));
  console.log(`Count Desk MCP surface passed: ${names.length} read-only/paper tools`);
} finally {
  child.kill("SIGTERM");
}
