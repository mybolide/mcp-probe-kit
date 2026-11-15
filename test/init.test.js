// mcp-probe-kit — init 的客户端配置：仓库被移动/复制后要跟着改，且不能弄坏用户的其他 MCP server
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { makeRepo, BIN } from "./helpers.js";

const runInit = (root, args = []) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN, "init", ...args], { cwd: root, env: { ...process.env, MCP_PROBE_KIT_ROOT: root } });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("exit", (code) => resolve({ code, out }));
  });

test("旧的 .mcp.json 指向别处：init 会按新路径更新，并保留其他 MCP server", async () => {
  const root = makeRepo();
  fs.writeFileSync(
    path.join(root, ".mcp.json"),
    JSON.stringify({
      mcpServers: {
        "mcp-probe-kit": { command: "node", args: ["/old/path/bin/mcp-probe-kit.js", "mcp"], env: { MCP_PROBE_KIT_ROOT: "/old/project" } },
        other: { command: "node", args: ["other.js"] },
      },
    }),
  );

  const res = await runInit(root);
  assert.equal(res.code, 0, res.out);
  assert.match(res.out, /已按新路径更新/);

  const cfg = JSON.parse(fs.readFileSync(path.join(root, ".mcp.json"), "utf8"));
  assert.equal(path.resolve(cfg.mcpServers["mcp-probe-kit"].env.MCP_PROBE_KIT_ROOT), path.resolve(root));
  assert.deepEqual(cfg.mcpServers.other, { command: "node", args: ["other.js"] }, "不能删掉别人的 server");
});

test("配置已经指向本项目：init 不动它（幂等）", async () => {
  const root = makeRepo();
  assert.equal((await runInit(root)).code, 0);
  const before = fs.readFileSync(path.join(root, ".mcp.json"), "utf8");
  assert.equal((await runInit(root)).code, 0);
  assert.equal(fs.readFileSync(path.join(root, ".mcp.json"), "utf8"), before);
});
test("--no-mcp：只写 AGENTS.md，不写任何客户端配置，纪律块改成 CLI 说法", async () => {
  const root = makeRepo();
  const res = await runInit(root, ["--no-mcp"]);
  assert.equal(res.code, 0, res.out);
  assert.ok(!fs.existsSync(path.join(root, ".mcp.json")), "不该写 .mcp.json");
  assert.ok(!fs.existsSync(path.join(root, ".cursor", "mcp.json")), "不该写 cursor 配置");
  assert.ok(!fs.existsSync(path.join(root, "opencode.json")), "不该写 opencode 配置");
  assert.match(res.out, /纯 CLI 模式/);

  const agents = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
  assert.match(agents, /mcp-probe-kit status/);
  assert.match(agents, /mcp-probe-kit close/);
  assert.match(agents, /不注册 MCP/);
});
