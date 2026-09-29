import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Credential-free protocol probe. It only asks the local sidecar to initialize
// and enumerate tools; it never signs in, opens a broker connection, or calls a
// journal, account, or execution tool.
const integrationRoot = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = process.env.COUNT_DESK_MCP_ROOT || path.resolve(integrationRoot, "../open-source/mcp-server");
const command = process.execPath;
const args = [path.join(serverRoot, "dist", "index.js")];
const timeoutMs = Number(process.env.LUXALGO_MCP_PROBE_TIMEOUT_MS || 8000);
const child = spawn(command, args, { cwd: serverRoot, env: process.env });
let buffer = "";
let stderr = "";
let nextId = 1;
const pending = new Map();

function request(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });
}

function fail(error) {
  for (const { reject } of pending.values()) reject(error);
  pending.clear();
}

child.stdout.on("data", (chunk) => {
  buffer += chunk.toString();
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";
  for (const line of lines) {
    if (!line.trim()) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch (error) {
      fail(new Error(`Invalid JSON-RPC response: ${error.message}`));
      continue;
    }
    const requestState = pending.get(message.id);
    if (!requestState) continue;
    pending.delete(message.id);
    if (message.error) requestState.reject(new Error(message.error.message || "MCP request failed"));
    else requestState.resolve(message.result);
  }
});
child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
child.on("error", fail);
child.on("exit", (code, signal) => {
  if (pending.size) fail(new Error(`MCP sidecar exited before responding (code=${code}, signal=${signal})`));
});

const timer = setTimeout(() => {
  fail(new Error(`MCP probe timed out after ${timeoutMs}ms`));
  child.kill("SIGTERM");
}, timeoutMs);

try {
  const initialize = await request("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "count-desk-probe", version: "1.0.0" },
  });
  const tools = await request("tools/list");
  const names = (tools.tools || []).map((tool) => tool.name).filter(Boolean).sort();
  process.stdout.write(`${JSON.stringify({
    readOnly: true,
    initialized: Boolean(initialize?.serverInfo),
    serverInfo: initialize?.serverInfo || null,
    toolCount: names.length,
    tools: names,
    sidecarWarnings: stderr.trim() ? stderr.trim().split("\n").slice(0, 8) : [],
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
} finally {
  clearTimeout(timer);
  child.kill("SIGTERM");
}
