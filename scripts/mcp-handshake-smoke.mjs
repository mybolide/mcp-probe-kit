/**
 * Minimal MCP stdio handshake — verifies build/index.js stays alive after initialize.
 */
import { spawn } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const indexJs = path.join(root, "build", "index.js");

const env = {
  ...process.env,
  MEMORY_QDRANT_URL: "http://8.134.219.239:50008",
  MEMORY_QDRANT_API_KEY: "QHYMWGTBFYpaQ63tMpZo",
  MEMORY_QDRANT_COLLECTION: "mcp_probe_memory",
  MEMORY_EMBEDDING_PROVIDER: "openai-compatible",
  MEMORY_EMBEDDING_URL: "https://frps-tc-web.evwali.com/embedding/embeddings",
  MEMORY_EMBEDDING_MODEL: "nomic-ai/nomic-embed-text-v1.5",
  MEMORY_EMBEDDING_API_KEY: "BJp38-3Ewr3_h_KaBIKMIa6yPrQZ9spd6RTo6Po4zgw",
  MEMORY_SEARCH_LIMIT: "3",
  MEMORY_SUMMARY_MAX_CHARS: "280",
};

function send(msg) {
  const body = JSON.stringify(msg);
  return `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`;
}

const child = spawn("node", [indexJs], { cwd: root, env, stdio: ["pipe", "pipe", "pipe"] });

let stdout = "";
let stderr = "";
let exited = false;

child.stdout.on("data", (chunk) => {
  stdout += chunk.toString("utf8");
});
child.stderr.on("data", (chunk) => {
  stderr += chunk.toString("utf8");
});
child.on("exit", (code, signal) => {
  exited = true;
  console.error(`[handshake] process exited code=${code} signal=${signal}`);
  console.error("[handshake] stderr:", stderr.slice(-2000));
  console.error("[handshake] stdout head:", stdout.slice(0, 500));
  process.exit(code === 0 ? 0 : 1);
});

child.stdin.write(
  send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "handshake-smoke", version: "1.0" },
    },
  })
);

child.stdin.write(
  send({
    jsonrpc: "2.0",
    method: "notifications/initialized",
    params: {},
  })
);

child.stdin.write(
  send({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {},
  })
);

setTimeout(() => {
  if (exited) return;
  const hasTools = stdout.includes("fix_bug") && stdout.includes("start_bugfix");
  console.log("[handshake] stderr:", stderr.trim().split("\n").slice(-3).join("\n"));
  console.log("[handshake] tools/list ok:", hasTools);
  console.log("[handshake] stdout bytes:", stdout.length);
  child.kill();
  process.exit(hasTools ? 0 : 1);
}, 4000);
