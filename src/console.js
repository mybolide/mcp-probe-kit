// mcp-probe-kit — Owner 控制台（本地 web，127.0.0.1，Owner 动作只在这里）
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readConsoleMeta } from "./console-boot.js";
import { openDb } from "./db.js";
import { bootstrap } from "./digest.js";
import {
  reqIntake,
  reqApprove,
  reqAmend,
  taskAdjust,
  taskReopen,
  bugDecide,
  answer,
  override,
  handoff,
  listTasks,
  listReqs,
  listPaths,
  listBugs,
  listDocs,
  listQuestions,
  listRuns,
} from "./store.js";
import { editMemory, listMemories, memoryConfig, promoteMemory, softDeleteMemory } from "./memory.js";
import { resolveRoot } from "./cli.js";
import { sha256 } from "./fingerprint.js";
import { listReleases, shipRelease } from "./release.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(HERE, "..", "public");

const OWNER_ACTIONS = {
  intake: (db, root, p) => reqIntake(db, root, p),
  approve: (db, root, p) => reqApprove(db, root, p),
  amend: (db, root, p) => reqAmend(db, root, p),
  adjust: (db, root, p) => taskAdjust(db, p),
  reopen: (db, root, p) => taskReopen(db, p),
  decide: (db, root, p) => bugDecide(db, p),
  answer: (db, root, p) => answer(db, p),
  override: (db, root, p) => override(db, p),
  handoff: (db, root, p) => handoff(db, p),
  "memory.promote": async (db, root, p) => promoteMemory(memoryConfig(), p.id),
  "memory.edit": async (db, root, p) => editMemory(memoryConfig(), p.id, { title: p.title, body: p.body }, { promote: true }),
  "memory.drop": (db, root, p) => ({ dropped: softDeleteMemory(memoryConfig(), p.id) }),
  "release.ship": (db, root, p) => shipRelease(db, { id: p.id }),
};

export async function startConsole(args) {
  const root = resolveRoot();
  const portIdx = args.indexOf("--port");
  const port = Number(portIdx >= 0 ? args[portIdx + 1] : process.env.MCP_PROBE_KIT_PORT ?? 7373);
  if (args.includes("--stop")) {
    const meta = await readConsoleMeta(port);
    if (!meta) {
      console.log(`端口 ${port} 上没有 mcp-probe-kit 控制台`);
      return 1;
    }
    if (path.resolve(meta.root) !== path.resolve(root)) {
      console.log(`端口 ${port} 上是另一个项目的控制台（${meta.root}），不动它`);
      return 1;
    }
    try {
      process.kill(meta.pid, "SIGTERM");
    } catch {
      /* 已经退出 */
    }
    console.log(`已停止控制台（pid ${meta.pid}，端口 ${port}）`);
    return 0;
  }
  // 多项目：--project 可重复；第一个（或当前目录）是默认项目
  const extra = [];
  args.forEach((a, i) => {
    if (a === "--project") extra.push(args[i + 1]);
  });
  const roots = [...new Set([root, ...extra].filter(Boolean).map((r) => path.resolve(r)))];
  const projects = roots.map((r) => ({ root: r, name: path.basename(r) || r, db: openDb(r) }));
  const byRoot = new Map(projects.map((p) => [p.root, p]));
  const pickProject = (wanted) => byRoot.get(path.resolve(String(wanted ?? ""))) ?? projects[0];
  const startedAt = new Date().toISOString();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const json = (code, body) => {
      res.writeHead(code, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(body));
    };
    if (req.method === "GET" && url.pathname === "/") {
      const html = fs.readFileSync(path.join(PUBLIC, "index.html"));
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/meta") {
      // 用于「这个端口上是不是本项目的 mcp-probe-kit 控制台」的探测与复用
      return json(200, { app: "mcp-probe-kit", schema: 2, root: projects[0].root, port, pid: process.pid, startedAt, projects: projects.map((p) => p.root) });
    }
    if (req.method === "GET" && url.pathname === "/api/state") {
      const active = pickProject(url.searchParams.get("project"));
      return json(200, {
        project: { root: active.root, name: active.name },
        projects: projects.map((p) => ({ name: p.name, root: p.root, current: p.root === active.root })),
        digest: bootstrap(active.db, active.root, { console: `http://127.0.0.1:${port}/` }),
        requirements: listReqs(active.db),
        paths: listPaths(active.db),
        tasks: listTasks(active.db),
        bugs: listBugs(active.db),
        docs: listDocs(active.db).map((d) => {
          const abs = path.join(active.root, d.path);
          const drift = !fs.existsSync(abs) ? "missing" : sha256(fs.readFileSync(abs)) !== d.sha256 ? "changed" : null;
          return { ...d, drift };
        }),
        questions: listQuestions(active.db),
        memories: listMemories(memoryConfig(), 30, null, "candidate"),
        memoriesActive: listMemories(memoryConfig(), 30, null, "active"),
        runs: listRuns(active.db, 30),
        releases: listReleases(active.db),
      });
    }
    if (req.method === "POST" && url.pathname === "/api/owner") {
      let body = "";
      for await (const chunk of req) body += chunk;
      let payload;
      try {
        payload = JSON.parse(body || "{}");
      } catch {
        return json(400, { ok: false, code: "E_INTERNAL", message: "body 不是 JSON" });
      }
      const action = OWNER_ACTIONS[payload.action];
      if (!action) return json(400, { ok: false, code: "INVALID_ARGUMENT", message: `未知 owner action：${payload.action}` });
      const active = pickProject(payload.project ?? payload.payload?.project);
      try {
        return json(200, { ok: true, result: await action(active.db, active.root, payload.payload ?? payload) });
      } catch (error) {
        return json(200, { ok: false, code: error.code ?? "E_INTERNAL", message: error.message, data: error.data ?? null });
      }
    }
    return json(404, { ok: false, code: "NOT_FOUND" });
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`mcp-probe-kit 控制台：http://127.0.0.1:${port}`);
    console.log(`项目：${root}`);
  });
  return new Promise((resolve) => {
    server.on("close", () => resolve(0));
    process.on("SIGINT", () => server.close());
  });
}