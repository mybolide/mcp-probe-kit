// mcp-probe-kit — CLI 入口：init / run / commit / status / doctor / export / serve / mcp
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { metaGet, metaSet, openDb, dataDir, dbPath } from "./db.js";
import { taskClose } from "./gates.js";
import { git, head, isRepo, toplevel, statusPorcelain, commitFiles, lsFiles } from "./git.js";
import { inScope, sha256 } from "./fingerprint.js";
import { bootstrap } from "./digest.js";
import { doctor, exportMarkdown } from "./report.js";
import { createRelease, getRelease, listReleases, planRelease, shipRelease } from "./release.js";
import { getTask, mapTask, listTasks, listReqs, listPaths, listDocs, reqIntake } from "./store.js";
import {
  demoteMemory,
  exportMemories,
  generalizeHint,
  listMemories,
  memoryConfig,
  memoryStatus,
  openMemory,
  promoteMemory,
  recallMemories,
  reindexPending,
  rememberAndIndex,
  searchMemories,
  softDeleteMemory,
} from "./memory.js";
import { execCommand } from "./exec.js";
import { startConsole } from "./console.js";
import { runMcp } from "./mcp.js";
import { VERSION } from "./protocol.js";
import { openDb as _openDb } from "./db.js";

const AGENTS_BLOCK = `<!-- mcp-probe-kit:begin -->
开工先跑 \`mcp-probe-kit status\`：它返回的 next 就是下一件事，不要自己挑。
改代码前必须 task.claim；不许修改 acceptance，不许自选命令；只改 scope 内的文件。
改完 \`mcp-probe-kit commit -m "..."\`（只提交 scope 内文件），再 \`mcp-probe-kit close\`（内核在干净检出里重跑验收）。
遇到歧义用 ask，不要猜。
控制台地址在 \`mcp-probe-kit status\` 的 console 字段；MCP 连接时会自动拉起，挂掉会自动重建。
<!-- mcp-probe-kit:end -->`;

// 纯 CLI 模式（不注册 MCP）时，纪律块改成 CLI 说法
const AGENTS_BLOCK_CLI = AGENTS_BLOCK.replace(
  "控制台地址在 `mcp-probe-kit status` 的 console 字段；MCP 连接时会自动拉起，挂掉会自动重建。",
  "控制台：需要时自己起 `mcp-probe-kit serve`（本模式不注册 MCP，不会自动拉起）。",
);

const MCP_PROBE_KIT_BIN = fileURLToPath(new URL("../bin/mcp-probe-kit.js", import.meta.url));

const mcpServerConfig = (root) => ({
  mcpServers: {
    "mcp-probe-kit": { command: process.execPath, args: [MCP_PROBE_KIT_BIN, "mcp"], env: { MCP_PROBE_KIT_ROOT: root } },
  },
});

const CODEX_SNIPPET = `# ~/.codex/config.toml
[mcp_servers.mcp-probe-kit]
command = "${process.execPath}"
args = ["${MCP_PROBE_KIT_BIN}", "mcp"]
env = { MCP_PROBE_KIT_ROOT = "<项目绝对路径>" }`;

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".mcp-probe-kit", "coverage", ".next", "target", "vendor"]);

export function resolveRoot() {
  if (process.env.MCP_PROBE_KIT_ROOT) return process.env.MCP_PROBE_KIT_ROOT;
  try {
    return toplevel(process.cwd()) || process.cwd();
  } catch {
    return process.cwd();
  }
}

function appendLines(file, lines) {
  const abs = path.join(process.cwd(), file);
  const cur = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
  const missing = lines.filter((l) => !cur.split("\n").includes(l));
  if (!missing.length) return false;
  fs.writeFileSync(abs, `${cur}${cur && !cur.endsWith("\n") ? "\n" : ""}${missing.join("\n")}\n`, "utf8");
  return true;
}

function writeIfMissing(rel, value) {
  const abs = path.join(process.cwd(), rel);
  if (fs.existsSync(abs)) return false;
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return true;
}

/** 已有配置但 MCP_PROBE_KIT_ROOT 指向别处（仓库被移动/复制）→ 重写，保留其他 MCP server */
function writeMcpConfig(rel, value, root) {
  const abs = path.join(process.cwd(), rel);
  if (!fs.existsSync(abs)) return writeIfMissing(rel, value) ? "written" : "exists";
  let current;
  try {
    current = JSON.parse(fs.readFileSync(abs, "utf8"));
  } catch {
    return "invalid"; // 不碰用户手写的坏文件
  }
  const isOpenCode = Boolean(current.mcp);
  const entry = isOpenCode ? current.mcp?.["mcp-probe-kit"] : current.mcpServers?.["mcp-probe-kit"];
  const currentRoot = isOpenCode ? entry?.environment?.MCP_PROBE_KIT_ROOT : entry?.env?.MCP_PROBE_KIT_ROOT;
  if (currentRoot && path.resolve(currentRoot) === path.resolve(root)) return "exists";
  if (isOpenCode) {
    current.mcp = { ...(current.mcp ?? {}), "mcp-probe-kit": value.mcp["mcp-probe-kit"] };
  } else {
    current.mcpServers = { ...(current.mcpServers ?? {}), "mcp-probe-kit": value.mcpServers["mcp-probe-kit"] };
  }
  fs.writeFileSync(abs, `${JSON.stringify(current, null, 2)}\n`, "utf8");
  return "updated";
}

export function cmdInit(args) {
  const root = resolveRoot();
  const weak = args.includes("--weak");
  const gitMode = isRepo(root);
  if (!gitMode && !weak) {
    console.error("E_NOT_REPO: 这里不是 git 仓库。加 --weak 使用弱模式（只跑验收，没有提交归属与 scope 校验）");
    return 1;
  }
  process.chdir(root);
  fs.mkdirSync(path.join(dataDir(root), "runs"), { recursive: true });
  fs.mkdirSync(path.join(dataDir(root), "contracts"), { recursive: true });
  appendLines(".gitignore", [
    ".mcp-probe-kit/state.db*",
    ".mcp-probe-kit/runs/",
    ".mcp-probe-kit/r2-wt/",
    ".mcp-probe-kit/r2-wt-legacy/",
    ".mcp-probe-kit/console.lock",
  ]);
  appendLines(".gitattributes", ["* text=auto eol=lf"]);
  const noMcp = args.includes("--no-mcp");
  const onlyIdx = args.indexOf("--only");
  const only = onlyIdx >= 0 ? new Set(String(args[onlyIdx + 1] ?? "").split(",").filter(Boolean)) : null;

  const db = openDb(root);
  metaSet(db, "mode", gitMode ? "git" : "weak");
  const pkgFile = path.join(root, "package.json");
  let testCmds = [];
  if (fs.existsSync(pkgFile)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgFile, "utf8"));
      if (pkg.scripts?.test) testCmds = [pkg.scripts.test.includes("--") ? `npm test` : "npm test"];
    } catch {
      /* ignore */
    }
  }
  let created = 0;
  const dirs = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith("."))
    .map((e) => e.name)
    .filter((d) => !only || only.has(d));
  for (const dir of dirs) {
    const exists = db.prepare("SELECT 1 FROM paths WHERE allowed_paths_json=?").get(JSON.stringify([dir]));
    if (exists) continue;
    const n = Number(db.prepare("SELECT value FROM meta WHERE key='counter:P'").get()?.value ?? 0) + 1;
    db.prepare("INSERT INTO paths(id,allowed_paths_json,allow_new_files,budget_lines,test_cmds_json,status) VALUES(?,?,?,?,?,?)").run(
      `P-${String(n).padStart(3, "0")}`,
      JSON.stringify([dir]),
      0,
      1200,
      JSON.stringify(testCmds),
      "draft",
    );
    db.prepare("INSERT INTO meta(key,value) VALUES('counter:P',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(n));
    created += 1;
  }
  const label = (v) => ({ written: "已写", updated: "已按新路径更新", exists: "已存在", invalid: "已存在但解析失败，未改动", skipped: "跳过（--no-mcp）" })[v] ?? v;
  const wroteMcp = noMcp ? "skipped" : writeMcpConfig(".mcp.json", mcpServerConfig(root), root);
  const wroteCursor = noMcp ? "skipped" : writeMcpConfig(".cursor/mcp.json", mcpServerConfig(root), root);
  const wroteOpencode = noMcp
    ? "skipped"
    : writeMcpConfig(
        "opencode.json",
        { mcp: { "mcp-probe-kit": { type: "local", command: [process.execPath, MCP_PROBE_KIT_BIN, "mcp"], environment: { MCP_PROBE_KIT_ROOT: root } } } },
        root,
      );
  const agentsFile = path.join(root, "AGENTS.md");
  const agents = fs.existsSync(agentsFile) ? fs.readFileSync(agentsFile, "utf8") : "";
  if (!agents.includes("<!-- mcp-probe-kit:begin -->")) {
    fs.writeFileSync(agentsFile, `${agents}${agents ? "\n" : ""}${noMcp ? AGENTS_BLOCK_CLI : AGENTS_BLOCK}\n`, "utf8");
  }
  // init 自己写的配置要自己提交：否则第一次 close 会被 E_DIRTY_SCOPE 拦住
  const managed = [".gitignore", ".gitattributes", "AGENTS.md", ...(noMcp ? [] : [".mcp.json", ".cursor/mcp.json", "opencode.json"])].filter((f) =>
    fs.existsSync(path.join(root, f)),
  );
  let initCommit = null;
  try {
    initCommit = commitFiles(root, managed, "chore(mcp-probe-kit): init");
  } catch {
    /* 没有可提交改动 */
  }
  console.log(`mcp-probe-kit init 完成：
- 数据目录 .mcp-probe-kit/（state.db / contracts / runs）
- 模式：${gitMode ? "git（完整门禁）" : "weak（无 git：只跑验收，无归属校验）"}
- Path 草稿 ${created} 条（都还是 draft，需要 Owner 批准）
- 客户端配置：.mcp.json ${label(wroteMcp)} / .cursor/mcp.json ${label(wroteCursor)} / opencode.json ${label(wroteOpencode)}
- AGENTS.md 标记块已就绪
- 控制台：随 MCP 连接自动启动并复用（Owner 也可以手动 mcp-probe-kit serve）
- 托管文件：${initCommit ? `已提交 chore(mcp-probe-kit): init @ ${initCommit.slice(0, 8)}` : "无变化"}
${noMcp ? "- 纯 CLI 模式：没有注册 MCP，Agent 直接用 mcp-probe-kit status / commit / close；需要控制台时自己 mcp-probe-kit serve" : `- Codex 需要手动加：\n${CODEX_SNIPPET}`}`);
  return 0;
}

export async function cmdRun(args) {
  const idx = args.indexOf("--");
  const command = idx >= 0 ? args.slice(idx + 1).join(" ") : args.join(" ");
  if (!command) {
    console.error("用法：mcp-probe-kit run -- <command>");
    return 2;
  }
  const root = resolveRoot();
  const result = await execCommand(root, command);
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  console.log(`\n[mcp-probe-kit] exit ${result.exit} · ${result.durationMs}ms`);
  return result.exit;
}

export function cmdCommit(args) {
  const root = resolveRoot();
  const msgIdx = args.indexOf("-m");
  const message = msgIdx >= 0 ? args[msgIdx + 1] : null;
  if (!message) {
    console.error('用法：mcp-probe-kit commit -m "<message>" [--actor name]');
    return 2;
  }
  const actorIdx = args.indexOf("--actor");
  const actor = actorIdx >= 0 ? args[actorIdx + 1] : process.env.MCP_PROBE_KIT_ACTOR || "agent";
  const db = openDb(root);
  if (metaGet(db, "mode") === "weak") {
    console.error("E_WEAK_NO_GIT: 弱模式没有 git，不能提交；直接把改动留在工作树里，然后 mcp-probe-kit close");
    return 1;
  }
  const doing = db.prepare("SELECT * FROM tasks WHERE status='doing' AND claimed_by=? AND closing_token IS NULL").all(actor);
  if (!doing.length) {
    console.error(`E_NO_TASK: ${actor} 手上没有在办任务，先 task.claim`);
    return 1;
  }
  if (doing.length > 1) {
    console.error(`E_WIP_LIMIT: ${actor} 有多个在办任务：${doing.map((t) => t.id).join(", ")}`);
    return 1;
  }
  const task = getTask(db, doing[0].id);
  const dirty = statusPorcelain(root, ["--untracked-files=all"])
    .split("\n")
    .filter((l) => l.length > 3)
    .map((l) => {
      const rest = l.slice(3).trim();
      const arrow = rest.lastIndexOf(" -> ");
      return (arrow >= 0 ? rest.slice(arrow + 4) : rest).replace(/^"|"$/g, "");
    })
    .filter(Boolean);
  const mine = dirty.filter((f) => inScope(f, task.scope));
  const foreign = dirty.filter((f) => !inScope(f, task.scope) && !f.startsWith(".mcp-probe-kit/"));
  if (foreign.length) {
    console.error(`E_SCOPE_VIOLATION: 以下改动不在 ${task.id} 的 scope 内：\n${foreign.join("\n")}`);
    return 1;
  }
  if (!mine.length) {
    console.error("没有可提交的改动（scope 内为空）");
    return 1;
  }
  const body = `${message}\n\nTask-Id: ${task.id}\nDevflow-Base: ${task.base_head}`;
  const sha = commitFiles(root, mine, body, { author: actor });
  console.log(`${sha.slice(0, 8)}  ${task.id}  ${mine.length} 个文件`);
  return 0;
}

export async function cmdClose(args) {
  const root = resolveRoot();
  const db = openDb(root);
  const flagValue = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const actor = flagValue("--actor") ?? process.env.MCP_PROBE_KIT_ACTOR ?? "agent";
  const resolvedBy = flagValue("--resolved-by");
  const consumed = new Set([actor, resolvedBy].filter(Boolean));
  let id = args.find((a) => !a.startsWith("--") && !consumed.has(a));
  if (!id) {
    const doing = db.prepare("SELECT id FROM tasks WHERE status='doing' AND claimed_by=? AND closing_token IS NULL").all(actor);
    if (doing.length !== 1) {
      console.error(doing.length ? `E_WIP_LIMIT: ${actor} 有多个在办任务，请指明任务号` : `E_NO_TASK: ${actor} 手上没有在办任务`);
      return 1;
    }
    id = doing[0].id;
  }
  try {
    const res = await taskClose(db, root, { id, resolvedBy });
    console.log(JSON.stringify(res, null, 2));
    return 0;
  } catch (error) {
    const payload = { ok: false, code: error.code ?? "E_INTERNAL", message: error.message, data: error.data ?? null };
    console.error(JSON.stringify(payload, null, 2));
    return 1;
  }
}

export async function cmdStatus() {
  const root = resolveRoot();
  const db = openDb(root);
  const doing = db.prepare("SELECT * FROM tasks WHERE status='doing' ORDER BY id LIMIT 1").get();
  const memory = await recallMemories(root, doing ? mapTask(doing) : null);
  console.log(JSON.stringify(bootstrap(db, root, { memories: memory.memories }), null, 2));
  return 0;
}

export async function cmdMemory(args) {
  const sub = args[0] ?? "status";
  const cfg = memoryConfig();
  const flag = (name, fallback = undefined) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : fallback;
  };
  if (sub === "status") {
    console.log(JSON.stringify(memoryStatus(cfg), null, 2));
    return 0;
  }
  if (sub === "list") {
    const kind = flag("kind", args[1] && !args[1].startsWith("--") ? args[1] : null);
    const status = flag("status", null);
    for (const m of listMemories(cfg, Number(flag("limit", 20)), kind, status)) {
      console.log(`${m.id}  [${m.kind}${m.status === "candidate" ? " · 候选" : ""}${m.project ? ` · ${m.project}` : ""}]  ${m.title}`);
      console.log(`        ${m.body.split("\n")[0].slice(0, 120)}`);
    }
    return 0;
  }
  if (sub === "search") {
    const query = args.slice(1).filter((a) => !a.startsWith("--")).join(" ").trim();
    if (!query) {
      console.error('用法：mcp-probe-kit memory search "<关键词>"');
      return 2;
    }
    const mem = openMemory(cfg);
    try {
      const { memories, mode, degraded } = await searchMemories(cfg, mem, { query, limit: Number(flag("limit", 5)) });
      if (!memories.length) console.log("没有命中");
      for (const m of memories) {
        console.log(`${m.id}${m.score ? ` (${m.score})` : ""}  [${m.kind}${m.project ? ` · ${m.project}` : ""}]  ${m.title}`);
        console.log(`        ${m.body.replace(/\n/g, "\n        ")}`);
      }
      if (mode === "keyword") console.log(`\n[降级：向量检索不可用，用的是关键词。${degraded ?? ""}]`);
    } finally {
      mem.close();
    }
    return 0;
  }
  if (sub === "add") {
    const title = args[1] && !args[1].startsWith("--") ? args[1] : flag("title");
    const body = flag("body");
    if (!title || !body) {
      console.error('用法：mcp-probe-kit memory add "标题" --body "现象/原因/解法" [--kind pitfall|howto|decision|preference|snippet|note] [--tags a,b]');
      return 2;
    }
    const res = await rememberAndIndex(
      {
        title,
        body,
        kind: flag("kind", "note"),
        tags: String(flag("tags", "")).split(",").map((s) => s.trim()).filter(Boolean),
        project: flag("project", null),
        source: "owner",
      },
      cfg,
    );
    console.log(JSON.stringify(res));
    if (res.status === "candidate") console.log(`\n${generalizeHint(res.reasons ?? []).ask}`);
    return res.recorded ? 0 : 1;
  }
  if (sub === "export") {
    process.stdout.write(`${exportMemories(cfg, Number(flag("limit", 500)))}\n`);
    return 0;
  }
  if (sub === "reindex") {
    const mem = openMemory(cfg);
    try {
      console.log(JSON.stringify(await reindexPending(mem, cfg)));
    } finally {
      mem.close();
    }
    return 0;
  }
  if (sub === "promote" || sub === "demote") {
    if (!args[1]) {
      console.error(`用法：mcp-probe-kit memory ${sub} M-xxxxxxxx`);
      return 2;
    }
    if (sub === "promote") {
      console.log(JSON.stringify(await promoteMemory(cfg, args[1])));
    } else {
      console.log(demoteMemory(cfg, args[1]) ? "已转回候选（不再参与召回）" : "没有这条记录");
    }
    return 0;
  }
  if (sub === "delete") {
    if (!args[1]) {
      console.error("用法：mcp-probe-kit memory delete M-xxxxxxxx");
      return 2;
    }
    console.log(softDeleteMemory(cfg, args[1]) ? "已软删除" : "没有这条记录");
    return 0;
  }
  console.error("未知子命令：status | list | search | add | export | reindex | promote | demote | delete");
  return 2;
}

export function cmdDoctor() {
  const root = resolveRoot();
  const db = openDb(root);
  const items = doctor(db, root);
  if (!items.length) console.log("doctor: 一切正常");
  for (const it of items) console.log(`${it.severity === "error" ? "ERROR" : "warn "} ${it.code} ${it.taskId ?? ""} ${it.detail}`);
  return items.some((i) => i.severity === "error") ? 1 : 0;
}

export function cmdDoc(args) {
  const root = resolveRoot();
  const db = openDb(root);
  const sub = args[0] ?? "list";
  if (sub === "add") {
    const rel = args[1];
    if (!rel) {
      console.error("用法：mcp-probe-kit doc add <相对路径> [--title 标题] [--kind spec|adr|guide]");
      return 2;
    }
    const flag = (name) => {
      const i = args.indexOf(`--${name}`);
      return i >= 0 ? args[i + 1] : undefined;
    };
    const res = reqIntake(db, root, { type: "doc", path: rel, title: flag("title"), kind: flag("kind") ?? "spec" });
    console.log(JSON.stringify(res));
    return 0;
  }
  if (sub === "list") {
    const drift = doctor(db, root).filter((i) => i.code === "DOC_DRIFT");
    const docs = listDocs(db);
    if (!docs.length) console.log("还没有登记的文档（mcp-probe-kit doc add <文件>）");
    for (const d of docs) {
      const hit = drift.find((x) => String(x.detail).includes(d.path));
      console.log(`${d.id}  ${d.path}  ${hit ? `漂移：${hit.detail}` : "OK"}`);
    }
    return 0;
  }
  console.error("未知子命令：add | list");
  return 2;
}

export function cmdRelease(args) {
  const root = resolveRoot();
  const db = openDb(root);
  const sub = args[0] ?? "list";
  const flag = (name) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : undefined;
  };
  try {
    if (sub === "list") {
      const rows = listReleases(db);
      if (!rows.length) console.log("还没有发布（mcp-probe-kit release create \"v0.1\"）");
      for (const r of rows) console.log(`${r.id}  [${r.status}]  ${r.title}  ${r.tasks.length - r.pending}/${r.tasks.length} done${r.target_date ? `  target ${r.target_date}` : ""}`);
      return 0;
    }
    if (sub === "create") {
      const title = args[1] ?? flag("title");
      if (!title) {
        console.error('用法：mcp-probe-kit release create "v0.1" [--target 2026-01-01]');
        return 2;
      }
      console.log(JSON.stringify(createRelease(db, { title, targetDate: flag("target") }), null, 2));
      return 0;
    }
    if (sub === "plan") {
      const id = args[1];
      const tasks = args.slice(2).filter((a) => /^T-/.test(a));
      console.log(JSON.stringify(planRelease(db, { id, tasks }), null, 2));
      return 0;
    }
    if (sub === "ship") {
      console.log(JSON.stringify(shipRelease(db, { id: args[1] }), null, 2));
      return 0;
    }
    if (sub === "show") {
      console.log(JSON.stringify(getRelease(db, args[1]), null, 2));
      return 0;
    }
    console.error("未知子命令：list | create | plan | ship | show");
    return 2;
  } catch (error) {
    console.error(`${error.code ?? "E_ERROR"}: ${error.message}`);
    if (error.data) console.error(JSON.stringify(error.data, null, 2));
    return 1;
  }
}

export function cmdExport() {
  const root = resolveRoot();
  const db = openDb(root);
  process.stdout.write(`${exportMarkdown(db)}\n`);
  return 0;
}

export async function main(argv) {
  const [cmd, ...args] = argv;
  try {
    switch (cmd) {
      case "init":
        return cmdInit(args);
      case "run":
        return await cmdRun(args);
      case "commit":
        return cmdCommit(args);
      case "close":
        return await cmdClose(args);
      case "status":
        return await cmdStatus();
      case "memory":
        return await cmdMemory(args);
      case "doctor":
        return cmdDoctor();
      case "doc":
        return cmdDoc(args);
      case "release":
        return cmdRelease(args);
      case "export":
        return cmdExport();
      case "serve":
        return await startConsole(args);
      case "mcp":
        return await runMcp();
      case "--help":
      case "-h":
      case undefined:
        console.log(`mcp-probe-kit ${VERSION} — 极小的研发纪律内核

  mcp-probe-kit init [--weak] [--no-mcp]  建 .mcp-probe-kit/、Path 草稿、MCP 配置（--no-mcp 则不写）、AGENTS.md
  mcp-probe-kit run -- <cmd>            采证执行（记录退出码与耗时）
  mcp-probe-kit commit -m "<msg>"       只提交 scope 内文件，自动写 Task-Id trailer
  mcp-probe-kit close [T-00x] [--resolved-by "…"]  收口：干净检出内重跑验收（R0–R5）
  mcp-probe-kit status                  bootstrap 摘要：next / actions / plan / 记忆命中
  mcp-probe-kit memory [status|list|search|add|export|reindex|promote|demote|delete]  通用记忆
  mcp-probe-kit doctor                  对账：幽灵 done / 未落地 / 悬空 claim / 文档漂移
  mcp-probe-kit doc [add|list]          登记文档并检测漂移（改了没登记 → doc 漂移）
  mcp-probe-kit release [list|create|plan|ship]  发布：一组任务全 done 才能 ship
  mcp-probe-kit export                  markdown 快照
  mcp-probe-kit serve [--port 7373] [--project <path>…]  Owner 控制台（MCP 连上会自动启动/复用）
  mcp-probe-kit mcp                     MCP stdio 服务（11 个动作，启动时顺带拉起控制台）
`);
        return 0;
      default:
        console.error(`未知命令：${cmd}`);
        return 2;
    }
  } catch (error) {
    console.error(`${error.code ?? "E_ERROR"}: ${error.message}`);
    if (process.env.MCP_PROBE_KIT_DEBUG) console.error(error.stack);
    return 1;
  }
}