// mcp-probe-kit — Owner 动作 / MCP / 控制台 集成测试
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { openDb } from "../src/db.js";
import {
  getTask,
  waiveFor,
  taskAdjust,
  taskReopen,
  bugDecide,
  answer,
  override,
  handoff,
  reqIntake,
  reqApprove,
  reqAmend,
  listBugs,
} from "../src/store.js";
import { taskClaim, taskClose, ask } from "../src/gates.js";
import { commitFiles } from "../src/git.js";
import { makeRepo, initFlow, newTask, BIN } from "./helpers.js";
import { memoryConfig, openMemory, remember } from "../src/memory.js";

function startMcp(root, extraEnv = {}) {
  const child = spawn(process.execPath, [BIN, "mcp"], {
    env: { ...process.env, MCP_PROBE_KIT_ROOT: root, MCP_PROBE_KIT_CONSOLE: "0", ...extraEnv },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const waiters = new Map();
  let buf = "";
  child.stdout.on("data", (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (!line.trim()) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      const w = waiters.get(msg.id);
      if (w) {
        waiters.delete(msg.id);
        w(msg);
      }
    }
  });
  let seq = 0;
  return {
    call(method, params = {}) {
      const id = ++seq;
      return new Promise((resolve, reject) => {
        waiters.set(id, resolve);
        setTimeout(() => {
          if (waiters.delete(id)) reject(new Error(`MCP 超时：${method}`));
        }, 15000);
        child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      });
    },
    close() {
      child.kill();
    },
  };
}

function startConsole(root, port = 20000 + Math.floor(Math.random() * 20000), extraEnv = {}, extraArgs = []) {
  const child = spawn(process.execPath, [BIN, "serve", "--port", String(port), ...extraArgs], {
    env: { ...process.env, MCP_PROBE_KIT_ROOT: root, ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Promise((resolve, reject) => {
    let out = "";
    const timer = setTimeout(() => reject(new Error(`serve 未就绪：${out}`)), 15000);
    child.stdout.on("data", (d) => {
      out += d.toString();
      if (out.includes("控制台")) {
        clearTimeout(timer);
        resolve({ port, child, base: `http://127.0.0.1:${port}` });
      }
    });
    child.stderr.on("data", (d) => {
      out += d.toString();
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`serve 退出 ${code}：${out}`));
    });
  });
}

function runCli(root, args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN, ...args], {
      cwd: root,
      env: { ...process.env, MCP_PROBE_KIT_ROOT: root, ...env },
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("exit", (code) => resolve({ code, out }));
  });
}

const REASON = "Owner 决定：这条断言在本机环境不稳定，本次发布先放行，后续补测。";

test("Owner 动作：adjust / handoff / override / reopen / decide", () => {
  const root = makeRepo();
  const { db, reqId } = initFlow(root);
  const task = newTask(db, root, reqId);

  taskAdjust(db, { taskId: task.id, scope: ["src"], budgetLines: 50, reason: "收紧预算" });
  assert.equal(getTask(db, task.id).budget_lines, 50);

  const card = handoff(db, { taskId: task.id });
  assert.match(card.text, new RegExp(task.id));

  assert.throws(() => override(db, { taskId: task.id, code: "E_DIFF_BUDGET", reason: "太短" }), (e) => e.code === "E_CONTRACT");
  override(db, { taskId: task.id, code: "E_DIFF_BUDGET", reason: REASON });
  assert.equal(waiveFor(db, task.id, "E_DIFF_BUDGET"), true);

  override(db, { taskId: task.id, mode: "force-close", reason: REASON });
  assert.equal(getTask(db, task.id).status, "done");
  assert.equal(getTask(db, task.id).closed_by, "force-close");

  taskReopen(db, { taskId: task.id, reason: "验收标准漏了边界" });
  const back = getTask(db, task.id);
  assert.equal(back.status, "backlog");
  assert.equal(back.review_round, 0);

  const bug = reqIntake(db, root, { type: "bug", title: "列表为空", repro: ["打开页面"] });
  bugDecide(db, { bugId: bug.id, decision: "accept" });
  assert.equal(listBugs(db).find((b) => b.id === bug.id).status, "closed");
  assert.throws(() => taskReopen(db, { taskId: "T-999", reason: "x" }), (e) => e.code === "NOT_FOUND");
});

test("ask 挂起任务 → Owner answer 放回队列；配额满只记事件", () => {
  const root = makeRepo();
  const { db, reqId } = initFlow(root);
  const task = newTask(db, root, reqId);
  taskClaim(db, root, { id: task.id }, "agentA");
  const q = ask(db, { taskId: task.id, question: "字段用驼峰还是下划线？", options: ["驼峰", "下划线"] });
  assert.ok(q.questionId);
  assert.equal(getTask(db, task.id).status, "parked");
  answer(db, { questionId: q.questionId, answer: "驼峰" });
  assert.equal(getTask(db, task.id).status, "backlog");

  taskClaim(db, root, { id: task.id }, "agentA");
  for (let i = 0; i < 3; i += 1) ask(db, { taskId: task.id, question: `补充问题 ${i}` });
  const quota = ask(db, { taskId: task.id, question: "第 4 个" });
  assert.equal(quota.questionId, null);
});

test("MCP：initialize / tools/list / claim 默认 actor / bootstrap", async () => {
  const root = makeRepo();
  const { db, reqId } = initFlow(root);
  const task = newTask(db, root, reqId);
  const mcp = startMcp(root);
  try {
    const init = await mcp.call("initialize", { protocolVersion: "2025-06-18" });
    assert.match(init.result.instructions, /bootstrap/);
    const list = await mcp.call("tools/list");
    const tool = list.result.tools[0];
    assert.equal(tool.name, "mcp-probe-kit");
    assert.ok(tool.inputSchema.properties.action.enum.includes("task.close"));

    const claim = await mcp.call("tools/call", { name: "mcp-probe-kit", arguments: { action: "task.claim", id: task.id } });
    assert.ok(!claim.result.isError, JSON.stringify(claim.result));
    assert.equal(getTask(db, task.id).claimed_by, "agent");

    const boot = await mcp.call("tools/call", { name: "mcp-probe-kit", arguments: { action: "bootstrap" } });
    const digest = JSON.parse(boot.result.content[0].text);
    assert.equal(digest.phase, "executing");
    assert.equal(digest.task.id, task.id);

    const bad = await mcp.call("tools/call", { name: "mcp-probe-kit", arguments: { action: "task.claim", id: "T-999" } });
    assert.equal(bad.result.isError, true);
    assert.equal(JSON.parse(bad.result.content[0].text).code, "NOT_FOUND");
  } finally {
    mcp.close();
  }
});


test("MCP 连上就拉起控制台：自己的实例杀掉重启，别人的端口不碰", async () => {
  const root = makeRepo();
  initFlow(root);
  const port = 21000 + Math.floor(Math.random() * 2000);
  const env = { MCP_PROBE_KIT_CONSOLE: "1", MCP_PROBE_KIT_PORT: String(port), MCP_PROBE_KIT_RESTART_GRACE_MS: "0" };
  const pids = [];
  const getJson = async (url) => (await fetch(url)).json();
  const mcp = startMcp(root, env);
  try {
    const boot = await mcp.call("tools/call", { name: "mcp-probe-kit", arguments: { action: "bootstrap" } });
    const digest = JSON.parse(boot.result.content[0].text);
    assert.ok(digest.console, `bootstrap 没给出控制台地址：${JSON.stringify(digest)}`);
    assert.equal(digest.console, `http://127.0.0.1:${port}/`);

    const first = await getJson(`${digest.console}api/meta`);
    assert.equal(first.app, "mcp-probe-kit");
    assert.equal(first.root, root);
    pids.push(first.pid);
    const state = await getJson(`${digest.console}api/state`);
    assert.equal(state.paths[0].status, "approved");

    // 第二次连接：同一端口、换进程 —— 自己的实例被杀掉重启
    const mcp2 = startMcp(root, env);
    try {
      const boot2 = await mcp2.call("tools/call", { name: "mcp-probe-kit", arguments: { action: "bootstrap" } });
      assert.equal(JSON.parse(boot2.result.content[0].text).console, digest.console);
    } finally {
      mcp2.close();
    }
    const second = await getJson(`${digest.console}api/meta`);
    assert.notEqual(second.pid, first.pid);
    assert.throws(() => process.kill(first.pid, 0), (e) => e.code === "ESRCH");
    pids.push(second.pid);

    // 宽限期内的第三次连接：不重启，直接复用（避免把用户刚打开的页面刷掉）
    const mcpGrace = startMcp(root, { ...env, MCP_PROBE_KIT_RESTART_GRACE_MS: "30000" });
    try {
      const bootGrace = await mcpGrace.call("tools/call", { name: "mcp-probe-kit", arguments: { action: "bootstrap" } });
      assert.equal(JSON.parse(bootGrace.result.content[0].text).console, digest.console);
    } finally {
      mcpGrace.close();
    }
    assert.equal((await getJson(`${digest.console}api/meta`)).pid, second.pid);

    // 控制台被人停掉/崩了：下一次 bootstrap 就地重建，不用人手动重启
    process.kill(second.pid, "SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 500));
    const heal = await mcp.call("tools/call", { name: "mcp-probe-kit", arguments: { action: "bootstrap" } });
    const healedUrl = JSON.parse(heal.result.content[0].text).console;
    assert.equal(healedUrl, digest.console);
    const healed = await getJson(`${healedUrl}api/meta`);
    assert.notEqual(healed.pid, second.pid);
    pids.push(healed.pid);

    // 端口上是别的项目 → 绝不杀，换下一个端口
    const other = makeRepo();
    initFlow(other);
    const foreign = await startConsole(other, port + 1);
    try {
      const third = startMcp(root, { MCP_PROBE_KIT_CONSOLE: "1", MCP_PROBE_KIT_PORT: String(port + 1) });
      try {
        const boot3 = await third.call("tools/call", { name: "mcp-probe-kit", arguments: { action: "bootstrap" } });
        const url3 = JSON.parse(boot3.result.content[0].text).console;
        assert.equal(url3, `http://127.0.0.1:${port + 2}/`);
        const mine = await getJson(`${url3}api/meta`);
        assert.equal(mine.root, root);
        pids.push(mine.pid);
        assert.equal((await getJson(`${foreign.base}/api/meta`)).root, other); // 别人的还在跑
      } finally {
        third.close();
      }
    } finally {
      foreign.child.kill();
    }
  } finally {
    mcp.close();
    for (const pid of pids) {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        /* 已退出 */
      }
    }
  }
});
test("控制台：state 快照 + Owner 只从这里动作", async () => {
  const root = makeRepo();
  initFlow(root);
  const svc = await startConsole(root);
  try {
    const state = await (await fetch(`${svc.base}/api/state`)).json();
    assert.equal(state.requirements.length, 1);
    assert.equal(state.paths[0].status, "approved");
    assert.equal(state.digest.phase, "idle");

    const post = async (payload) => {
      const res = await fetch(`${svc.base}/api/owner`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      return { status: res.status, body: await res.json() };
    };

    const intake = await post({ action: "intake", payload: { type: "requirement", title: "登录", goal: "能登录", acceptance: ["npm test :: exit==0"] } });
    assert.equal(intake.status, 200);
    assert.equal(intake.body.ok, true);
    assert.match(intake.body.result.id, /^FR-/);

    const bad = await post({ action: "nope" });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.code, "INVALID_ARGUMENT");

    const rejected = await post({ action: "override", payload: { taskId: "T-999", code: "E_DIFF_BUDGET", reason: REASON } });
    assert.equal(rejected.body.ok, false);
    assert.equal(rejected.body.code, "NOT_FOUND");

    const html = await (await fetch(svc.base)).text();
    assert.match(html, /mcp-probe-kit/);
  } finally {
    svc.child.kill();
  }
});

test("mcp-probe-kit serve --stop 只停本项目自己的控制台", async () => {
  const root = makeRepo();
  initFlow(root);
  const svc = await startConsole(root);
  const meta = await (await fetch(`${svc.base}/api/meta`)).json();
  assert.equal(meta.root, root);

  const stop = await runCli(root, ["serve", "--stop", "--port", String(svc.port)]);
  assert.equal(stop.code, 0, stop.out);
  assert.match(stop.out, /已停止控制台/);
  await new Promise((resolve) => setTimeout(resolve, 400));
  await assert.rejects(() => fetch(`${svc.base}/api/meta`));

  // 端口上是别的项目 → 不许杀
  const other = makeRepo();
  initFlow(other);
  const svc2 = await startConsole(other);
  try {
    const denied = await runCli(root, ["serve", "--stop", "--port", String(svc2.port)]);
    assert.equal(denied.code, 1, denied.out);
    assert.match(denied.out, /另一个项目/);
    assert.equal((await (await fetch(`${svc2.base}/api/meta`)).json()).root, other);
  } finally {
    svc2.child.kill();
  }
});

test("CLI 全链路：init → claim → commit → close → status", async () => {
  const root = makeRepo();
  const run = (args) =>
    new Promise((resolve) => {
      const child = spawn(process.execPath, [BIN, ...args], { cwd: root, env: { ...process.env, MCP_PROBE_KIT_ROOT: root } });
      let out = "";
      child.stdout.on("data", (d) => (out += d));
      child.stderr.on("data", (d) => (out += d));
      child.on("exit", (code) => resolve({ code, out }));
    });

  const init = await run(["init"]);
  assert.equal(init.code, 0, init.out);
  assert.ok(fs.existsSync(path.join(root, ".mcp-probe-kit", "state.db")));
  assert.ok(fs.existsSync(path.join(root, ".mcp.json")));
  assert.match(fs.readFileSync(path.join(root, ".mcp.json"), "utf8"), /MCP_PROBE_KIT_ROOT/);

  // init 自己产生的配置文件必须已提交，否则第一次 close 会被 E_DIRTY_SCOPE 拦
  const status = await run(["status"]);
  assert.equal(status.code, 0, status.out);

  const { db, reqId } = initFlowFromInit(root);
  const task = newTask(db, root, reqId, { scope: ["src"] });
  taskClaim(db, root, { id: task.id }, "agent");

  fs.writeFileSync(path.join(root, "src/a.js"), "export const a = 42;\n");
  const commit = await run(["commit", "-m", "feat: a 改成 42"]);
  assert.equal(commit.code, 0, commit.out);
  assert.match(commit.out, new RegExp(task.id));

  const close = await run(["close"]);
  assert.equal(close.code, 0, close.out);
  assert.equal(getTask(db, task.id).status, "done");

  const after = await run(["doctor"]);
  assert.equal(after.code, 0, after.out);
});

/** mcp-probe-kit init 已经把 Path 草稿写好，这里只补「Owner 批准 + 建任务」 */
function initFlowFromInit(root) {
  const db = openDb(root);
  const req = reqIntake(db, root, { type: "requirement", title: "r", goal: "g", acceptance: ["npm test :: exit==0"] });

  const paths = db.prepare("SELECT id FROM paths WHERE status='draft'").all();
  assert.ok(paths.length > 0, "init 应该生成 Path 草稿");
  reqApprove(db, root, { requirementId: req.id, pathId: paths[0].id });
  return { db, reqId: req.id, pathId: paths[0].id };
}

test("Owner amend：契约前移、在办任务回 backlog，重领后仍能收口", async () => {
  const root = makeRepo();
  const { db, reqId } = initFlow(root);
  const task = newTask(db, root, reqId);
  taskClaim(db, root, { id: task.id }, "agentA");
  const before = getTask(db, task.id);

  reqAmend(db, root, { requirementId: reqId, acceptance: ["npm test :: exit==0"] });
  const after = getTask(db, task.id);
  assert.equal(after.status, "backlog");
  // 只改验收（契约内容不变）时不该产生空提交，契约提交保持不动
  assert.equal(after.contract_commit, before.contract_commit);
  assert.equal(after.base_head, after.contract_commit);

  taskClaim(db, root, { id: task.id }, "agentA");
  fs.writeFileSync(path.join(root, "src/a.js"), "export const a = 7;\n");
  commitFiles(root, ["src/a.js"], `feat\n\nTask-Id: ${task.id}`, { author: "agentA" });
  const res = await taskClose(db, root, { id: task.id });
  assert.equal(res.runs[0].passed, true);
  assert.equal(getTask(db, task.id).status, "done");
});

test("MCP 客户端提前断开不崩（EPIPE 容错）", async () => {
  const root = makeRepo();
  initFlow(root);
  const child = spawn(process.execPath, [BIN, "mcp"], {
    env: { ...process.env, MCP_PROBE_KIT_ROOT: root, MCP_PROBE_KIT_CONSOLE: "0" },
  });
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d));
  child.stdin.write(
    `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "mcp-probe-kit", arguments: { action: "bootstrap" } } })}\n`,
  );
  child.stdin.end(); // 模拟 host 立刻关连接
  const code = await new Promise((resolve) => child.on("exit", resolve));
  assert.equal(code, 0, stderr);
  assert.doesNotMatch(stderr, /EPIPE|Unhandled/);
});

test("MCP 协议协商：认识就回显，不认识回落到最新并声明支持列表", async () => {
  const root = makeRepo();
  initFlow(root);
  const mcp = startMcp(root);
  try {
    const known = await mcp.call("initialize", { protocolVersion: "2025-03-26" });
    assert.equal(known.result.protocolVersion, "2025-03-26");
    assert.equal(known.result._meta.negotiated, true);
    assert.equal(known.result.serverInfo.version, "6.0.0-alpha.1");

    const unknown = await mcp.call("initialize", { protocolVersion: "1999-01-01" });
    assert.equal(unknown.result.protocolVersion, "2025-06-18");
    assert.equal(unknown.result._meta.negotiated, false);
    assert.deepEqual(unknown.result._meta.supported, ["2025-06-18", "2025-03-26"]);
  } finally {
    mcp.close();
  }
});

test("bootstrap 渐进下发动作面：按状态只给该用的动作", async () => {
  const root = makeRepo();
  const { db, reqId } = initFlow(root);
  const mcp = startMcp(root);
  const boot = async () =>
    JSON.parse((await mcp.call("tools/call", { name: "mcp-probe-kit", arguments: { action: "bootstrap" } })).result.content[0].text);
  try {
    const idle = await boot();
    assert.ok(idle.actions.includes("task.create"), JSON.stringify(idle.actions));
    assert.ok(!idle.actions.includes("task.close"));
    assert.ok(!idle.actions.includes("task.claim"));

    const task = newTask(db, root, reqId);
    const planning = await boot();
    assert.ok(planning.actions.includes("task.claim"));
    assert.ok(planning.actions.includes("task.create"));

    taskClaim(db, root, { id: task.id }, "agent");
    const doing = await boot();
    assert.ok(doing.actions.includes("task.close"));
    assert.ok(doing.actions.includes("ask"));
    assert.ok(!doing.actions.includes("task.create"), "在办时不该再给 task.create");
  } finally {
    mcp.close();
  }
});

test("控制台收件箱：待提炼的记忆可以改一句话再收进记忆，或直接丢弃", async () => {
  const root = makeRepo();
  initFlow(root);
  const memDir = fs.mkdtempSync(path.join(os.tmpdir(), "mpk-memcons-"));
  const memEnv = {
    MCP_PROBE_KIT_MEMORY: "on",
    MCP_PROBE_KIT_MEMORY_DB: path.join(memDir, "memory.db"),
    MEMORY_EMBEDDING_URL: "http://127.0.0.1:1",
    MEMORY_QDRANT_URL: "http://127.0.0.1:1",
    MEMORY_TIMEOUT_MS: "300",
  };
  const saved = {};
  for (const [k, v] of Object.entries(memEnv)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
  let svc;
  try {
    const db = openMemory(memoryConfig());
    const row = remember(db, {
      title: "iOS 键盘残留",
      body: "现象：pop 之后键盘还在。解法：补上 unfocus。",
      kind: "pitfall",
      status: "candidate",
      reasons: ["one-off"],
    });
    db.close();

    svc = await startConsole(root, undefined, memEnv);
    const state = await (await fetch(`${svc.base}/api/state`)).json();
    assert.equal(state.memories.length, 1);
    assert.equal(state.memories[0].id, row.id);

    const edit = await (
      await fetch(`${svc.base}/api/owner`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "memory.edit",
          payload: { id: row.id, body: "当出现 iOS pop 后键盘残留时，用 FocusManager.instance.primaryFocus?.unfocus() 收起（原因：路由 pop 不会自动失焦）。" },
        }),
      })
    ).json();
    assert.equal(edit.ok, true, JSON.stringify(edit));
    assert.equal(edit.result.status, "active");

    const after = await (await fetch(`${svc.base}/api/state`)).json();
    assert.equal(after.memories.length, 0, "晋升后不该再出现在待提炼里");
  } finally {
    svc?.child.kill();
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test("控制台证据屏：每次重跑都能看到命令/退出码/HEAD/指纹", async () => {
  const root = makeRepo();
  const { db, reqId } = initFlow(root);
  const task = newTask(db, root, reqId);
  taskClaim(db, root, { id: task.id }, "agent");
  fs.writeFileSync(path.join(root, "src/a.js"), "export const a = 11;\n");
  commitFiles(root, ["src/a.js"], `feat\n\nTask-Id: ${task.id}`, { author: "agent" });
  const res = await taskClose(db, root, { id: task.id, resolvedBy: "补齐" });
  assert.equal(res.runs[0].passed, true);

  const svc = await startConsole(root);
  try {
    const state = await (await fetch(`${svc.base}/api/state`)).json();
    assert.equal(state.runs.length, 1, JSON.stringify(state.runs));
    assert.equal(state.runs[0].task_id, task.id);
    assert.equal(state.runs[0].exit_code, 0);
    assert.equal(state.runs[0].command, "npm test");
    assert.equal(state.runs[0].head.length, 40);
    assert.ok(state.runs[0].duration_ms >= 0);
  } finally {
    svc.child.kill();
  }
});

test("多项目：一个控制台切换多个仓库，owner 动作按 project 落到对应仓库", async () => {
  const rootA = makeRepo();
  const a = initFlow(rootA);
  reqIntake(a.db, rootA, { type: "requirement", title: "A 的需求", goal: "g", acceptance: ["npm test :: exit==0"] });
  const rootB = makeRepo();
  const b = initFlow(rootB);
  reqIntake(b.db, rootB, { type: "requirement", title: "B 的需求", goal: "g", acceptance: ["npm test :: exit==0"] });

  const svc = await startConsole(rootA, undefined, {}, ["--project", rootB]);
  try {
    const meta = await (await fetch(`${svc.base}/api/meta`)).json();
    assert.equal(meta.projects.length, 2, JSON.stringify(meta));

    const stateA = await (await fetch(`${svc.base}/api/state`)).json();
    assert.equal(stateA.project.root, rootA);
    const titlesA = stateA.requirements.map((r) => r.title).sort();
    assert.deepEqual(titlesA, ["A 的需求", "r"]);

    const stateB = await (await fetch(`${svc.base}/api/state?project=${encodeURIComponent(rootB)}`)).json();
    assert.equal(stateB.project.root, rootB);
    assert.deepEqual(stateB.requirements.map((r) => r.title).sort(), ["B 的需求", "r"]);
    assert.equal(stateB.projects.length, 2);

    const post = await (
      await fetch(`${svc.base}/api/owner`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "intake", project: rootB, payload: { type: "requirement", title: "B 的新需求", goal: "g", acceptance: ["npm test :: exit==0"] } }),
      })
    ).json();
    assert.equal(post.ok, true, JSON.stringify(post));

    const afterB = await (await fetch(`${svc.base}/api/state?project=${encodeURIComponent(rootB)}`)).json();
    assert.ok(afterB.requirements.some((r) => r.title === "B 的新需求"));
    const afterA = await (await fetch(`${svc.base}/api/state`)).json();
    assert.ok(!afterA.requirements.some((r) => r.title === "B 的新需求"), "不能写到默认仓库");
  } finally {
    svc.child.kill();
  }
});
