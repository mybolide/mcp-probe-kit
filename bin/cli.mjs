#!/usr/bin/env node
// mcp-probe-kit: zero-config(ish) MCP server for multiple clients
// tools: fingerprint_env (no network), compute_hash, network_probe (with --allow-net)
// flags: --bootstrap [--bootstrap-claude] [--allow-net]
//        writes ~/.cursor/mcp.json and optionally Claude Desktop config (macOS).

import { stdin as input, stdout as output } from "node:process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const args = process.argv.slice(2);
const allowNet = args.includes("--allow-net");
const doBootstrap = args.includes("--bootstrap");
const doClaude = args.includes("--bootstrap-claude");

function ensureJson(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch {}
  return {};
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function mergeMcpEntry(obj, entryName, argsArr) {
  if (!obj.mcpServers) obj.mcpServers = {};
  obj.mcpServers[entryName] = { command: "npx", args: argsArr };
}

async function bootstrap() {
  const argsArr = ["-y", "mcp-probe-kit"];
  if (allowNet) argsArr.push("--allow-net");

  // 1) Cursor
  const cursorFile = path.join(os.homedir(), ".cursor", "mcp.json");
  const cursor = ensureJson(cursorFile);
  mergeMcpEntry(cursor, "mcp-probe-kit", argsArr);
  writeJson(cursorFile, cursor);
  console.log("✓ Bootstrapped Cursor MCP at", cursorFile);

  // 2) Claude Desktop (macOS)
  if (doClaude) {
    const claudeFile = path.join(os.homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json");
    const claude = ensureJson(claudeFile);
    mergeMcpEntry(claude, "mcp-probe-kit", argsArr);
    writeJson(claudeFile, claude);
    console.log("✓ Bootstrapped Claude Desktop MCP at", claudeFile);
  }
  process.exit(0);
}

if (doBootstrap) {
  await bootstrap();
}

// ---------------- MCP server (stdio JSON-RPC) ----------------
const serverInfo = {
  protocol: "2023-11-05",
  capabilities: { tools: {} },
  tools: [
    {
      name: "fingerprint_env",
      description: "收集运行环境与可见代理变量（不联网）。",
      inputSchema: { type: "object", properties: {}, additionalProperties: false }
    },
    {
      name: "compute_hash",
      description: "计算哈希/编码: {text, algo[sha256|sha1|md5], encoding[hex|base64]} (默认 sha256/hex)",
      inputSchema: {
        type: "object",
        properties: {
          text: { type: "string" },
          algo: { type: "string", enum: ["sha256", "sha1", "md5"] },
          encoding: { type: "string", enum: ["hex", "base64"] }
        },
        required: ["text"],
        additionalProperties: false
      }
    },
    ...(allowNet ? [{
      name: "network_probe",
      description: "HEAD 网络连通性测试（需 --allow-net）。输入: {urls: string[], timeoutMs?: number}",
      inputSchema: {
        type: "object",
        properties: {
          urls: { type: "array", items: { type: "string" } },
          timeoutMs: { type: "number" }
        },
        required: ["urls"],
        additionalProperties: false
      }
    }] : [])
  ]
};

function getEnvInfo() {
  const env = process.env;
  return {
    node_version: process.version,
    platform: process.platform,
    arch: process.arch,
    http_proxy: env.HTTP_PROXY || env.http_proxy || null,
    https_proxy: env.HTTPS_PROXY || env.https_proxy || null,
    cursor_env: {
      provider_hint: env.CURSOR_PROVIDER || null,
      model_hint: env.CURSOR_MODEL || null
    },
    time: new Date().toISOString()
  };
}

async function callTool(name, params) {
  if (name === "fingerprint_env") {
    return { content: [{ type: "text", text: JSON.stringify(getEnvInfo()) }] };
  }
  if (name === "compute_hash") {
    const text = params?.text ?? "";
    const algo = params?.algo ?? "sha256";
    const encoding = params?.encoding ?? "hex";
    const h = crypto.createHash(algo).update(text, "utf8").digest(encoding);
    const b64 = Buffer.from(text, "utf8").toString("base64");
    return { content: [{ type: "text", text: JSON.stringify({ algo, encoding, hash: h, base64: b64 }) }] };
  }
  if (name === "network_probe" && allowNet) {
    const urls = params?.urls ?? [];
    const timeoutMs = Math.max(100, Math.min(10000, params?.timeoutMs ?? 2000));
    const results = [];
    for (const url of urls) {
      const start = Date.now();
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeoutMs);
        const res = await fetch(url, { method: "HEAD", signal: ctrl.signal });
        clearTimeout(t);
        results.push({ url, ok: res.ok, status: res.status, ms: Date.now() - start });
      } catch (e) {
        results.push({ url, ok: false, error: String(e), ms: Date.now() - start });
      }
    }
    return { content: [{ type: "text", text: JSON.stringify({ results }) }] };
  }
  throw new Error("Unknown tool or not allowed");
}

// Minimal JSON-RPC loop
let buffer = "";
input.setEncoding("utf8");
input.on("data", async (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, idx);
    buffer = buffer.slice(idx + 1);
    if (!line.trim()) continue;
    try {
      const req = JSON.parse(line);
      if (req.method === "initialize") {
        output.write(JSON.stringify({ jsonrpc: "2.0", id: req.id, result: serverInfo }) + "\n");
      } else if (req.method === "tools/list") {
        output.write(JSON.stringify({ jsonrpc: "2.0", id: req.id, result: serverInfo.tools }) + "\n");
      } else if (req.method === "tools/call") {
        const { name, arguments: params } = req.params || {};
        try {
          const result = await callTool(name, params);
          output.write(JSON.stringify({ jsonrpc: "2.0", id: req.id, result }) + "\n");
        } catch (err) {
          output.write(JSON.stringify({ jsonrpc: "2.0", id: req.id, error: { code: -32000, message: String(err) } }) + "\n");
        }
      } else {
        output.write(JSON.stringify({ jsonrpc: "2.0", id: req.id, error: { code: -32601, message: "Method not found" } }) + "\n");
      }
    } catch (e) {
      output.write(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }) + "\n");
    }
  }
});
