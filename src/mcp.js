// mcp-probe-kit — MCP stdio 服务（单工具 mcp-probe-kit，11 个动作；连上即拉起 Owner 控制台）
import readline from "node:readline";
import { openDb } from "./db.js";
import { bootstrap } from "./digest.js";
import { VERSION, initializeResult } from "./protocol.js";
import { taskCreate, taskClaim, taskClose, bugReport, ask } from "./gates.js";
import { resolveRoot } from "./cli.js";
import { ensureConsole, readConsoleMeta } from "./console-boot.js";
import { mapTask } from "./store.js";
import { generalizeHint, memoryConfig, openMemory, recallMemories, rememberAndIndex, searchMemories } from "./memory.js";
import { createRelease, planRelease, shipRelease } from "./release.js";

export const INSTRUCTIONS = `你是本项目的编码 Agent。工作纪律（由 mcp-probe-kit 内核强制）：
1. 第一个动作必须是 mcp-probe-kit.bootstrap。它返回的 next 就是**你现在该做的下一件事**（内核已按依赖和验收覆盖排好序），不要自己挑；actions 是当前只该用的动作；plan 里是还没被任务覆盖的验收，拆任务时照它来。
2. 改代码前必须 task.claim；只改任务 scope 内的文件；不许改 acceptance 或自选命令。
3. 完成后 mcp-probe-kit commit -m "..."（只提交 scope 内文件），再 task.close —— 内核会在干净检出中重跑验收。
4. 遇到歧义用 ask，不要猜。
5. bootstrap 返回的 console 地址就是 Owner 控制台：MCP 启动时自动拉起、挂掉时 bootstrap 自动重建。把它转告 Owner 即可，人不需要手动启动或重启。
6. memory 是**跨项目的通用记忆**（不是本项目专用）：踩到的坑/解法、别人的约定、踩过的 SDK 怪癖，随时可以 memory.write（title + body + kind/tags）；动手前先用 memory.search 查一下。任务失败过（bootstrap.task.reviewRound > 0）时，task.close 必须带 resolvedBy，内核会自动记一条 pitfall。`;

const TOOL = {
  name: "mcp-probe-kit",
  description:
    "Project development discipline kernel. action=bootstrap; task.create/claim/close (reruns acceptance in a clean checkout); bug.report; ask; memory.write/memory.search (cross-project engineering memory).",
  inputSchema: {
    type: "object",
    properties: {
      action: { type: "string", enum: ["bootstrap", "task.create", "task.claim", "task.close", "bug.report", "ask", "memory.write", "memory.search", "release.create", "release.plan", "release.ship"] },
      id: { type: "string" },
      requirementId: { type: "string" },
      pathId: { type: "string" },
      kind: { type: "string", enum: ["feature", "bugfix", "chore", "test"] },
      title: { type: "string" },
      acceptance: { type: "array", items: { type: "object" } },
      dependsOn: { type: "array", items: { type: "string" } },
      scope: { type: "array", items: { type: "string" } },
      budgetLines: { type: "number" },
      symptom: { type: "string" },
      expected: { type: "string" },
      repro: { type: "array", items: { type: "string" } },
      severity: { type: "string" },
      resolvedBy: { type: "string", description: "失败过的任务必填：一句话说清最后怎么解决的（自动写进通用记忆）" },
      body: { type: "string", description: "memory.write 的内容：现象 + 原因 + 解法，越具体越好" },
      tags: { type: "array", items: { type: "string" }, description: "memory.write 的标签，如 git / sqlite / flutter" },
      project: { type: "string", description: "可选的出处仓库名（只是溯源，不用于分区）" },
      query: { type: "string", description: "memory.search 的检索词" },
      limit: { type: "number" },
      tasks: { type: "array", items: { type: "string" }, description: "release.plan 要挂进来的任务号" },
      targetDate: { type: "string", description: "release.create 的目标日期 YYYY-MM-DD" },
      taskId: { type: "string" },
      question: { type: "string" },
      actor: { type: "string", description: "领取者标识，默认 agent（与 mcp-probe-kit commit --actor 保持一致）" },
      options: { type: "array", items: { type: "string" } },
    },
    required: ["action"],
  },
  annotations: { readOnlyHint: false },
};

function ok(id, result) {
  return { jsonrpc: "2.0", id, result };
}
function err(id, code, message) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

export async function handleRequest(db, root, req, ctx = {}) {
  const { id, method, params } = req;
  if (method === "initialize") {
    return ok(id, initializeResult(params?.protocolVersion, { instructions: INSTRUCTIONS, version: VERSION }));
  }
  if (method === "notifications/initialized") return null;
  if (method === "tools/list") return ok(id, { tools: [TOOL] });
  if (method === "ping") return ok(id, {});
  if (method === "tools/call") {
    const name = params?.name;
    if (name !== "mcp-probe-kit") return err(id, -32602, `unknown tool: ${name}`);
    const args = params?.arguments ?? {};
    const action = args.action;
    try {
      let result;
      switch (action) {
        case "bootstrap": {
          const doing = db.prepare("SELECT * FROM tasks WHERE status='doing' ORDER BY id LIMIT 1").get();
          const memory = await recallMemories(root, doing ? mapTask(doing) : null);
          result = bootstrap(db, root, { console: ctx.consoleUrl ? await ctx.consoleUrl() : null, memories: memory.memories });
          break;
        }
        case "task.create":
          result = taskCreate(db, root, args);
          break;
        case "task.claim":
          result = taskClaim(db, root, args, args.actor ?? process.env.MCP_PROBE_KIT_ACTOR ?? "agent");
          break;
        case "task.close":
          result = taskClose(db, root, args);
          break;
        case "bug.report":
          result = bugReport(db, args);
          break;
        case "ask":
          result = ask(db, args);
          break;
        case "memory.write": {
          result = await rememberAndIndex({
            title: String(args.title ?? ""),
            body: String(args.body ?? args.content ?? ""),
            kind: args.kind ?? "note",
            tags: Array.isArray(args.tags) ? args.tags.map(String) : String(args.tags ?? "").split(",").map((s) => s.trim()).filter(Boolean),
            project: args.project ?? null,
            source: "agent",
            projectTokens: args.project ? [String(args.project)] : [],
          });
          // 写进去但不够通用：告诉 Agent 怎么改写成通则，而不是默默隔离
          if (result?.status === "candidate") result.hint = generalizeHint(result.reasons ?? []);
          break;
        }
        case "release.create":
          result = createRelease(db, { title: String(args.title ?? ""), targetDate: args.targetDate ?? null });
          break;
        case "release.plan":
          result = planRelease(db, { id: args.id, tasks: args.tasks });
          break;
        case "release.ship":
          result = shipRelease(db, { id: args.id });
          break;
        case "memory.search": {
          const cfg = memoryConfig();
          const mem = openMemory(cfg);
          try {
            result = await searchMemories(cfg, mem, { query: String(args.query ?? ""), limit: Number(args.limit ?? 5) });
          } finally {
            mem.close();
          }
          break;
        }
        default:
          return ok(id, {
            content: [{ type: "text", text: JSON.stringify({ ok: false, code: "INVALID_ARGUMENT", message: `未知 action：${action}` }) }],
            isError: true,
          });
      }
      const text = JSON.stringify({ ok: true, ...result });
      return ok(id, { content: [{ type: "text", text: text.length > 12000 ? `${text.slice(0, 12000)}…` : text }] });
    } catch (error) {
      const payload = { ok: false, code: error.code ?? "E_INTERNAL", message: error.message, data: error.data ?? null };
      return ok(id, { content: [{ type: "text", text: JSON.stringify(payload) }], isError: true });
    }
  }
  return err(id, -32601, `method not found: ${method}`);
}

export async function runMcp() {
  const root = resolveRoot();
  const db = openDb(root);
  // MCP 连接即控制台的生命周期触发器：连上就确保控制台在跑（复用同项目实例）
  const consoleReady = ensureConsole(root).catch(() => null);
  // bootstrap 时校验一次：控制台被停掉/崩了就地重建，人不该手动重启
  const consoleUrl = async () => {
    const cached = await Promise.race([consoleReady, new Promise((resolve) => setTimeout(() => resolve(null), 4000))]);
    const url = cached?.url ?? null;
    if (url) {
      const port = Number(new URL(url).port);
      if (await readConsoleMeta(port)) return url;
    }
    const again = await ensureConsole(root).catch(() => null);
    return again?.url ?? null;
  };
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  // 客户端随时可能断开（MCP host 关闭连接）：写 stdout 的 EPIPE 不算错误
  process.stdout.on("error", () => {});
  const send = (message) => {
    if (!message) return;
    if (process.stdout.destroyed || process.stdout.writableEnded) return;
    try {
      process.stdout.write(`${JSON.stringify(message)}\n`);
    } catch {
      /* 管道已断，静默退出 */
    }
  };
  let chain = Promise.resolve();
  rl.on("line", (line) => {
    chain = chain.then(async () => {
      const text = line.trim();
      if (!text) return;
      let req;
      try {
        req = JSON.parse(text);
      } catch {
        send(err(null, -32700, "parse error"));
        return;
      }
      const res = await handleRequest(db, root, req, { consoleUrl });
      send(res);
    });
  });
  await new Promise((resolve) => rl.on("close", resolve));
  await chain;
  return 0;
}