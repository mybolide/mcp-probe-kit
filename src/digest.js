// mcp-probe-kit — bootstrap digest：内核自己决定「下一步该做什么」，不让人挑
import { listReqs, listPaths, listTasks, getTask, now } from "./store.js";
import { head } from "./git.js";
import { metaGet } from "./db.js";
import { releaseSummary } from "./release.js";

/**
 * 需求覆盖度：每条需求验收有没有任务在管。
 * 这是「系统规划」的判据——缺哪条，就对 Agent 说缺哪条。
 */
export function coverage(db) {
  const reqs = listReqs(db).filter((r) => ["approved", "building"].includes(r.status));
  const tasks = listTasks(db);
  return reqs.map((r) => {
    const covered = new Set();
    for (const t of tasks) {
      if (t.requirement_id !== r.id || t.status === "parked") continue;
      for (const a of t.acceptance) if (typeof a.deriveFrom === "number") covered.add(a.deriveFrom);
    }
    const missing = r.acceptance.map((text, idx) => ({ idx, text })).filter((x) => !covered.has(x.idx));
    return { id: r.id, title: r.title, total: r.acceptance.length, covered: covered.size, missing };
  });
}

/** 依赖已满足的 backlog（内核按依赖排序，而不是按 ID 抓第一个） */
export function claimableTasks(db, tasks) {
  const backlog = tasks.filter((t) => t.status === "backlog");
  const ok = backlog.filter((t) => t.dependsOn.every((dep) => getTask(db, dep)?.status === "done"));
  const blocked = backlog.filter((t) => !ok.includes(t));
  return { ok, blocked };
}

/** 按当前状态下发**只该用**的动作（渐进动作面） */
export function availableActions(db) {
  const reqs = listReqs(db);
  const paths = listPaths(db);
  const tasks = listTasks(db);
  const doing = tasks.filter((t) => t.status === "doing");
  const { ok } = claimableTasks(db, tasks);
  const approvedReq = reqs.some((r) => ["approved", "building"].includes(r.status));
  const approvedPath = paths.some((p) => p.status === "approved");
  const acts = new Set(["bootstrap", "bug.report"]);
  if (doing.length) {
    acts.add("task.close");
    acts.add("ask");
  } else if (approvedReq && approvedPath) {
    acts.add("task.create");
    if (ok.length) acts.add("task.claim");
  }
  return [...acts];
}

export function bootstrap(db, root, extra = {}) {
  const reqs = listReqs(db);
  const paths = listPaths(db);
  const tasks = listTasks(db);
  const doing = tasks.filter((t) => t.status === "doing");
  const backlog = tasks.filter((t) => t.status === "backlog");
  const parked = tasks.filter((t) => t.status === "parked");
  const current = doing[0] ?? null;

  const plan = coverage(db);
  const gaps = plan.filter((p) => p.missing.length);
  const { ok: ready, blocked } = claimableTasks(db, tasks);

  const blockers = [];
  for (const r of reqs.filter((r) => r.status === "draft")) blockers.push({ code: "E_NEED_APPROVED", fix: `等 Owner 批准 ${r.id}` });
  for (const p of paths.filter((p) => p.status === "draft")) blockers.push({ code: "E_NEED_APPROVED", fix: `等 Owner 批准 Path ${p.id}` });
  for (const t of parked) blockers.push({ code: "E_PARKED", fix: `${t.id} 已 parked，等 Owner reopen` });
  for (const t of blocked) blockers.push({ code: "E_DEP_OPEN", fix: `${t.id} 等前置：${t.dependsOn.join(", ")}` });

  // 内核自己排优先级：收口 > 领取（依赖已满足）> 补拆（验收没被覆盖）> 等阻塞
  const next = current
    ? { action: "task.close", args: { id: current.id }, why: `继续做完 ${current.id} 并收口` }
    : ready[0]
      ? { action: "task.claim", args: { id: ready[0].id }, why: `依赖已满足，下一个可领取：${ready[0].title}` }
      : gaps.length
        ? {
            action: "task.create",
            args: { requirementId: gaps[0].id, deriveFrom: gaps[0].missing[0].idx },
            why: `需求 ${gaps[0].id} 还有 ${gaps[0].missing.length} 条验收没有任务覆盖：${gaps[0].missing[0].text}`,
          }
        : blocked.length
          ? { action: "wait", args: {}, why: `${blocked[0].id} 等前置 ${blocked[0].dependsOn.join(", ")} 完成`, blocked: blocked.map((t) => t.id) }
          : !reqs.some((r) => ["approved", "building"].includes(r.status))
            ? { action: "wait", args: {}, why: reqs.some((r) => r.status === "draft") ? "等 Owner 批准需求" : "还没有已批准的需求，等 Owner 收件并批准" }
            : !paths.some((p) => p.status === "approved")
              ? { action: "wait", args: {}, why: "还没有已批准的 Path，等 Owner 批准" }
              : { action: "task.create", args: {}, why: "没有待办任务，去拆新任务" };

  const recent = db.prepare("SELECT at, action, task_id, detail FROM events ORDER BY id DESC LIMIT 3").all().map((e) => ({ at: e.at, action: e.action, taskId: e.task_id, detail: e.detail }));
  return {
    phase: current ? "executing" : backlog.length ? "planning" : "idle",
    mode: metaGet(db, "mode") ?? "git",
    actions: availableActions(db),
    release: releaseSummary(db),
    plan: gaps.length ? gaps.map((g) => ({ id: g.id, covered: `${g.covered}/${g.total}`, missing: g.missing.slice(0, 3).map((m) => m.text) })) : [],
    memories: extra.memories ?? [],
    console: extra.console ?? null,
    now: now(),
    head: (() => {
      try {
        return head(root).slice(0, 8);
      } catch {
        return null;
      }
    })(),
    requirement: reqs[0] ? { id: reqs[0].id, title: reqs[0].title, status: reqs[0].status } : null,
    path: paths[0] ? { id: paths[0].id, status: paths[0].status, allowed: paths[0].allowedPaths } : null,
    task: current
      ? {
          id: current.id,
          title: current.title,
          status: current.status,
          claimExpiresAt: current.claim_expires_at,
          reviewRound: current.review_round,
        }
      : null,
    blockers: blockers.slice(0, 5),
    next,
    counts: {
      todo: backlog.length,
      doing: doing.length,
      parked: parked.length,
      done: tasks.filter((t) => t.status === "done").length,
      blocked: blocked.length,
    },
    recent,
  };
}