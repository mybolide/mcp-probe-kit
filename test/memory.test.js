// mcp-probe-kit — 跨项目坑库（memory）集成测试：真 HTTP 假服务、真 SQLite、真 git
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { execFileSync } from "node:child_process";
import { openDb } from "../src/db.js";
import { reqIntake, reqApprove, getTask } from "../src/store.js";
import { taskCreate, taskClaim, taskClose } from "../src/gates.js";
import { commitFiles } from "../src/git.js";
import { memoryConfig, openMemory, promoteMemory, recallMemories, rememberAndIndex, searchMemories } from "../src/memory.js";

const sh = (cwd, ...args) => execFileSync(args[0], args.slice(1), { cwd, encoding: "utf8" });

/** 测试仓库：只有 src/ok 存在时 npm test 才通过 */
function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mpk-mem-"));
  sh(dir, "git", "init", "-q", ".");
  sh(dir, "git", "config", "user.email", "t@t");
  sh(dir, "git", "config", "user.name", "t");
  fs.mkdirSync(path.join(dir, "src"));
  const script = 'node -e "process.exit(require(\'fs\').existsSync(\'src/ok\')?0:1)"';
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "m", version: "1.0.0", scripts: { test: script } }));
  fs.writeFileSync(path.join(dir, "src/a.js"), "export const a = 1;\n");
  sh(dir, "git", "add", "-A");
  sh(dir, "git", "commit", "-qm", "init");
  return dir;
}

function setupFlow(root) {
  const db = openDb(root);
  db.prepare("INSERT INTO paths(id,allowed_paths_json,allow_new_files,budget_lines,test_cmds_json,status) VALUES('P-001',?,1,1200,?,'draft')").run(
    JSON.stringify(["src"]),
    JSON.stringify(["npm test"]),
  );
  const req = reqIntake(db, root, { type: "requirement", title: "r", goal: "g", acceptance: ["npm test :: exit==0"] });
  reqApprove(db, root, { requirementId: req.id, pathId: "P-001" });
  const task = taskCreate(db, root, {
    requirementId: req.id,
    pathId: "P-001",
    kind: "feature",
    title: "修复浮点相加精度",
    acceptance: [{ deriveFrom: 0, assertion: "npm test :: exit==0" }],
    scope: ["src", "src/ok"],
  });
  taskClaim(db, root, { id: task.id }, "agent");
  return { db, task };
}

/** 一个假的服务端同时扮演 Ollama（/api/embeddings）和 Qdrant（/collections/...） */
function fakeStack({ healthy = true } = {}) {
  const state = { created: false, points: [] };
  const server = http.createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const json = body ? JSON.parse(body) : {};
    const send = (code, obj) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(obj));
    };
    if (!healthy) return send(503, { error: "down" });
    const url = req.url ?? "";
    if (url === "/api/embeddings" && req.method === "POST") {
      const text = String(json.prompt ?? "");
      const vec = Array.from({ length: 8 }, (_, i) => ((text.charCodeAt(i % Math.max(1, text.length)) || 7) % 13) / 13);
      return send(200, { embedding: vec });
    }
    if (url.includes("/points/search")) {
      return send(200, { result: state.points.map((p) => ({ id: p.id, score: 0.91, payload: p.payload })) });
    }
    if (url.includes("/points") && req.method === "PUT") {
      for (const p of json.points ?? []) state.points.push(p);
      return send(200, { result: { status: "completed" } });
    }
    if (url.startsWith("/collections/") && req.method === "PUT") {
      state.created = true;
      return send(200, { result: true });
    }
    if (url.startsWith("/collections/") && req.method === "GET") {
      return send(state.created ? 200 : 404, { result: { status: "green" } });
    }
    return send(404, {});
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, state, url: `http://127.0.0.1:${server.address().port}` })));
}

function useMemoryEnv(url, overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mpk-memdb-"));
  const saved = {};
  const env = {
    MCP_PROBE_KIT_MEMORY_DB: path.join(dir, "memory.db"),
    MEMORY_EMBEDDING_URL: url,
    MEMORY_QDRANT_URL: url,
    MEMORY_TIMEOUT_MS: "1500",
    MEMORY_MIN_SCORE: "0.5",
    MEMORY_EMBEDDING_PROVIDER: "ollama",
    ...overrides,
  };
  for (const [k, v] of Object.entries(env)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return {
    restore() {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    },
  };
}

test("失败过的任务必须给 resolvedBy，否则 E_NEED_RESOLUTION；给了就落坑并进向量索引", async () => {
  const stack = await fakeStack();
  const env = useMemoryEnv(stack.url);
  try {
    const root = makeRepo();
    const { db, task } = setupFlow(root);

    fs.writeFileSync(path.join(root, "src/a.js"), "export const a = 2;\n");
    commitFiles(root, ["src/a.js"], `feat\n\nTask-Id: ${task.id}`, { author: "agent" });
    await assert.rejects(() => taskClose(db, root, { id: task.id }), (e) => e.code === "E_ASSERTION_FAILED");
    assert.equal(getTask(db, task.id).review_round, 1);

    await assert.rejects(() => taskClose(db, root, { id: task.id }), (e) => e.code === "E_NEED_RESOLUTION");

    fs.writeFileSync(path.join(root, "src/ok"), "ok\n");
    commitFiles(root, ["src/ok"], `fix\n\nTask-Id: ${task.id}`, { author: "agent" });
    const res = await taskClose(db, root, { id: task.id, resolvedBy: "验收脚本要求 src/ok 存在，补上这个标记文件就好了" });
    assert.equal(getTask(db, task.id).status, "done");
    assert.equal(res.memory.recorded, true);
    assert.equal(res.memory.indexed, true, res.memory.indexError ?? "");

    const cfg = memoryConfig();
    const mem = openMemory(cfg);
    const row = mem.prepare("SELECT * FROM memories").get();
    assert.equal(row.index_state, "indexed");
    assert.match(row.body, /E_ASSERTION_FAILED/);
    assert.match(row.body, /src\/ok/);
    const found = await searchMemories(cfg, mem, { query: "浮点精度", limit: 3 });
    assert.equal(found.mode, "vector");
    assert.equal(found.memories.length, 1);
    mem.close();

    // bootstrap 注入：按任务标题/scope 召回
    const recalled = await recallMemories(root, { title: task.title, scope: task.scope, kind: task.kind });
    assert.equal(recalled.memories.length, 1);
    assert.equal(recalled.mode, "vector");
  } finally {
    env.restore();
    stack.server.close();
  }
});

test("向量栈挂了也不阻塞收口：落库成功、索引失败、检索降级为关键词", async () => {
  const dead = await fakeStack({ healthy: false });
  const env = useMemoryEnv(dead.url);
  try {
    const root = makeRepo();
    const { db, task } = setupFlow(root);
    fs.writeFileSync(path.join(root, "src/a.js"), "export const a = 3;\n");
    commitFiles(root, ["src/a.js"], `feat\n\nTask-Id: ${task.id}`, { author: "agent" });
    await assert.rejects(() => taskClose(db, root, { id: task.id }), (e) => e.code === "E_ASSERTION_FAILED");

    fs.writeFileSync(path.join(root, "src/ok"), "ok\n");
    commitFiles(root, ["src/ok"], `fix\n\nTask-Id: ${task.id}`, { author: "agent" });
    const res = await taskClose(db, root, { id: task.id, resolvedBy: "补 src/ok 标记文件" });
    assert.equal(getTask(db, task.id).status, "done");
    assert.equal(res.memory.recorded, true);
    assert.equal(res.memory.indexed, false);

    const cfg = memoryConfig();
    const mem = openMemory(cfg);
    assert.equal(mem.prepare("SELECT index_state FROM memories").get().index_state, "failed");
    const found = await searchMemories(cfg, mem, { query: "src/ok 浮点", limit: 3 });
    assert.equal(found.mode, "keyword");
    assert.equal(found.memories.length, 1);
    mem.close();
  } finally {
    env.restore();
    dead.server.close();
  }
});

test("MCP_PROBE_KIT_MEMORY=off：不强制 resolvedBy，也不落坑", async () => {
  const env = useMemoryEnv("http://127.0.0.1:1", { MCP_PROBE_KIT_MEMORY: "off" });
  try {
    const root = makeRepo();
    const { db, task } = setupFlow(root);
    fs.writeFileSync(path.join(root, "src/a.js"), "export const a = 4;\n");
    commitFiles(root, ["src/a.js"], `feat\n\nTask-Id: ${task.id}`, { author: "agent" });
    await assert.rejects(() => taskClose(db, root, { id: task.id }), (e) => e.code === "E_ASSERTION_FAILED");

    fs.writeFileSync(path.join(root, "src/ok"), "ok\n");
    commitFiles(root, ["src/ok"], `fix\n\nTask-Id: ${task.id}`, { author: "agent" });
    const res = await taskClose(db, root, { id: task.id });
    assert.equal(getTask(db, task.id).status, "done");
    assert.equal(res.memory, null);
  } finally {
    env.restore();
  }
});
test("一次性手滑没有资格进记忆：落成候选，不进索引也不召回；Owner 可晋升", async () => {
  const stack = await fakeStack();
  const env = useMemoryEnv(stack.url);
  try {
    const root = makeRepo();
    const { db, task } = setupFlow(root);
    fs.writeFileSync(path.join(root, "src/a.js"), "export const a = 9;\n");
    commitFiles(root, ["src/a.js"], `feat\n\nTask-Id: ${task.id}`, { author: "agent" });
    await assert.rejects(() => taskClose(db, root, { id: task.id }), (e) => e.code === "E_ASSERTION_FAILED");

    fs.writeFileSync(path.join(root, "src/ok"), "ok\n");
    commitFiles(root, ["src/ok"], `fix\n\nTask-Id: ${task.id}`, { author: "agent" });
    const res = await taskClose(db, root, { id: task.id, resolvedBy: "漏了 src/ok 这个标记文件" });
    assert.equal(getTask(db, task.id).status, "done");
    assert.equal(res.memory.recorded, true);
    assert.equal(res.memory.status, "candidate");
    assert.ok(res.memory.reasons.includes("one-off"), JSON.stringify(res.memory.reasons));
    // 不合格不是丢掉：给出「改写成通则」的指令
    assert.equal(res.memoryHint.code, "E_MEMORY_CANDIDATE");
    assert.match(res.memoryHint.ask, /通则/);
    assert.match(res.memoryHint.template, /当出现 X 时，用 Y/);

    const cfg = memoryConfig();
    const mem = openMemory(cfg);
    assert.equal(mem.prepare("SELECT status, index_state FROM memories").get().status, "candidate");
    const notFound = await searchMemories(cfg, mem, { query: "浮点精度", limit: 3 });
    assert.equal(notFound.memories.length, 0, "候选不该被召回");
    mem.close();

    // 晋升后进索引、可召回
    const promoted = await promoteMemory(cfg, res.memory.id);
    assert.equal(promoted.promoted, true);
    assert.equal(promoted.indexed, true, promoted.indexError ?? "");
    const mem2 = openMemory(cfg);
    const found = await searchMemories(cfg, mem2, { query: "浮点精度", limit: 3 });
    assert.equal(found.memories.length, 1);
    mem2.close();
  } finally {
    env.restore();
    stack.server.close();
  }
});

test("按提示改写成通则后合格入库：kind=howto 直接进正式库", async () => {
  const stack = await fakeStack();
  const env = useMemoryEnv(stack.url);
  try {
    const cfg = memoryConfig();
    const res = await rememberAndIndex(
      {
        title: "当 worktree 里提交但主仓库 HEAD 不变时用 cherry-pick 回主仓库",
        body: "当出现 r2-wt 里 commit 成功但主仓库看不到时，用 git cherry-pick 把提交搬回主分支（原因：worktree 是 detached HEAD，提交不属于任何分支）。",
        kind: "howto",
        tags: ["git", "worktree"],
        source: "agent",
      },
      cfg,
    );
    assert.equal(res.status, "active", JSON.stringify(res));
    assert.equal(res.indexed, true, res.indexError ?? "");
    const mem = openMemory(cfg);
    assert.equal(mem.prepare("SELECT status FROM memories").get().status, "active");
    const found = await searchMemories(cfg, mem, { query: "worktree 提交丢失", limit: 3 });
    assert.equal(found.memories.length, 1);
    mem.close();
  } finally {
    env.restore();
    stack.server.close();
  }
});

test("语义去重：和已有记忆太像就合并，不新增条目", async () => {
  const stack = await fakeStack();
  const env = useMemoryEnv(stack.url, { MEMORY_DEDUPE_SCORE: "0.9" });
  try {
    const cfg = memoryConfig();
    const first = await rememberAndIndex(
      {
        title: "当 worktree 里提交但主仓库 HEAD 不变时用 cherry-pick",
        body: "当出现 r2-wt 里 commit 成功但主仓库看不到时，用 git cherry-pick 搬回主分支（原因：worktree 是 detached HEAD）。",
        kind: "howto",
        tags: ["git"],
      },
      cfg,
    );
    assert.equal(first.status, "active");
    assert.equal(first.deduped, undefined);

    const second = await rememberAndIndex(
      {
        title: "worktree 提交丢失的另一个说法",
        body: "当出现 worktree 内提交后主分支查看不到时，用 cherry-pick 把提交取回主分支（原因：detached HEAD 不属于任何分支）。这里是更长的补充说明，方便合并时保留更完整的一条。",
        kind: "howto",
        tags: ["worktree"],
      },
      cfg,
    );
    assert.equal(second.deduped, true, JSON.stringify(second));
    assert.equal(second.id, first.id);

    const mem = openMemory(cfg);
    const rows = mem.prepare("SELECT * FROM memories").all();
    assert.equal(rows.length, 1, "相似内容不该新增条目");
    assert.equal(rows[0].hits, 1, "合并一次应累计 1 次命中");
    assert.match(rows[0].body, /更长的补充说明/, "应保留更完整的正文");
    assert.match(rows[0].tags_json, /worktree/, "标签应合并");
    mem.close();
  } finally {
    env.restore();
    stack.server.close();
  }
});
