// mcp-probe-kit — v5 记忆迁移：映射 + dry-run
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { mapV5Point, runImport, fetchV5Points } from "../scripts/v5-import.mjs";
import { memoryConfig, openMemory, remember } from "../src/memory.js";

function fakeV5(points) {
  const server = http.createServer(async (req, res) => {
    const send = (code, obj) => {
      res.writeHead(code, { "content-type": "application/json" });
      res.end(JSON.stringify(obj));
    };
    if (req.method === "GET" && req.url.startsWith("/collections/")) return send(200, { result: { status: "green" } });
    if (req.method === "POST" && req.url.endsWith("/points/scroll")) return send(200, { result: { points, next_page_offset: null } });
    return send(404, {});
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, url: `http://127.0.0.1:${server.address().port}` })));
}

test("mapV5Point：标题/正文/类型/标签/出处都能对上", () => {
  const mapped = mapV5Point({
    id: 7,
    payload: {
      title: "iOS 键盘残留",
      content: "现象：pop 后键盘不收起。解法：dispose 前 unfocus。",
      type: "gotcha",
      tags: ["flutter"],
      sourceProject: "demo-app",
    },
  });
  assert.equal(mapped.title, "iOS 键盘残留");
  assert.equal(mapped.kind, "pitfall");
  assert.equal(mapped.project, "demo-app");
  assert.deepEqual(mapped.tags.sort(), ["demo-app", "flutter"]);
  assert.equal(mapped.source, "v5-import");

  const derived = mapV5Point({ id: 1, payload: { content: "没有标题就用第一行\n第二行" } });
  assert.equal(derived.title, "没有标题就用第一行");
  assert.equal(mapV5Point({ id: 2, payload: { title: "只有标题没有正文" } }), null);
});

test("dry-run 不写库，重复标题计入 duplicates", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mpk-v5imp-"));
  const saved = { db: process.env.MCP_PROBE_KIT_MEMORY_DB, q: process.env.MEMORY_QDRANT_URL };
  process.env.MCP_PROBE_KIT_MEMORY_DB = path.join(dir, "memory.db");
  const v5 = await fakeV5([
    { id: "a", payload: { title: "worktree 提交丢失", content: "用 cherry-pick 搬回主分支。", type: "howto" } },
    { id: "b", payload: { title: "无内容条目" } },
  ]);
  process.env.MEMORY_QDRANT_URL = v5.url;
  try {
    const cfg = memoryConfig();
    const db = openMemory(cfg);
    remember(db, { title: "worktree 提交丢失", body: "旧记录", kind: "note" });
    db.close();

    const lines = [];
    const res = await runImport({ qdrantUrl: v5.url, collection: "memory", dryRun: true, log: (l) => lines.push(l) });
    assert.equal(res.total, 2);
    assert.equal(res.mapped, 1, "没有 content 的条目不可映射");
    assert.equal(res.duplicates, 1);
    assert.equal(res.written, 0);

    const mem = openMemory(cfg);
    assert.equal(mem.prepare("SELECT COUNT(*) n FROM memories").get().n, 1, "dry-run 不能写库");
    mem.close();
    assert.ok(lines[0].includes("dry-run"));
  } finally {
    if (saved.db === undefined) delete process.env.MCP_PROBE_KIT_MEMORY_DB;
    else process.env.MCP_PROBE_KIT_MEMORY_DB = saved.db;
    if (saved.q === undefined) delete process.env.MEMORY_QDRANT_URL;
    else process.env.MEMORY_QDRANT_URL = saved.q;
    v5.server.close();
  }
});

test("--write 才写入：新增条目进 v6 记忆库", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mpk-v5imp2-"));
  const saved = { db: process.env.MCP_PROBE_KIT_MEMORY_DB };
  process.env.MCP_PROBE_KIT_MEMORY_DB = path.join(dir, "memory.db");
  const v5 = await fakeV5([{ id: "c", payload: { title: "Flutter 热重载失效", content: "清 build 目录后重启即可。", type: "howto" } }]);
  try {
    const res = await runImport({ qdrantUrl: v5.url, collection: "memory", dryRun: false, log: () => {} });
    assert.equal(res.written, 1);
    const mem = openMemory(memoryConfig());
    const row = mem.prepare("SELECT title, kind, source FROM memories").get();
    assert.equal(row.title, "Flutter 热重载失效");
    assert.equal(row.source, "v5-import");
    mem.close();
  } finally {
    if (saved.db === undefined) delete process.env.MCP_PROBE_KIT_MEMORY_DB;
    else process.env.MCP_PROBE_KIT_MEMORY_DB = saved.db;
    v5.server.close();
  }
});

test("fetchV5Points：collection 不存在时报错而不是静默空跑", async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(404, { "content-type": "application/json" });
    res.end("{}");
  });
  const url = await new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`)));
  try {
    await assert.rejects(() => fetchV5Points(url, "nope"), /collection 不存在/);
  } finally {
    server.close();
  }
});