/**
 * Smoke: multi-client MCP snippets share the same URL, differ by JSON shape.
 * Run: npx tsx scripts/smoke-mcp-clients.mjs
 */
import {
  buildMcpClientSnippets,
  buildMcpRemoteStdioSnippet,
} from "../packages/mcp/src/clients.ts";

const url = "http://localhost:3000/p/abc/mcp";
const serverId = "synapsee-abc";
const apiKey = "dev-key";

const clients = buildMcpClientSnippets({ serverId, url, apiKey });
const ids = clients.map((c) => c.id);
const expected = ["cursor", "claude", "vscode", "windsurf", "chatgpt", "generic"];

for (const id of expected) {
  if (!ids.includes(id)) throw new Error(`missing client ${id}`);
}

const vscode = clients.find((c) => c.id === "vscode");
if (!vscode?.config.servers) throw new Error("vscode must use servers root key");
if (vscode.config.mcpServers) throw new Error("vscode must not use mcpServers");

const cursor = clients.find((c) => c.id === "cursor");
if (!cursor?.config.mcpServers) throw new Error("cursor must use mcpServers");

const entry = cursor.config.mcpServers[serverId];
if (entry.url !== url) throw new Error("url mismatch");
if (entry.headers["X-API-Key"] !== apiKey) throw new Error("api key mismatch");

const stdio = buildMcpRemoteStdioSnippet({ serverId, url, apiKey });
if (stdio.mcpServers[serverId].command !== "npx") {
  throw new Error("stdio bridge should use npx");
}

console.log("smoke-mcp-clients: OK", ids.join(", "));
