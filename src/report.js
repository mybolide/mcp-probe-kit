// mcp-probe-kit — doctor 对账 + markdown 导出
import fs from "node:fs";
import path from "node:path";
import { memoryStatus } from "./memory.js";
import { metaGet } from "./db.js";
import { listTasks, listReqs, listBugs, listDocs, listPaths } from "./store.js";
import { head, isAncestor, statusPorcelain } from "./git.js";
import { sha256 } from "./fingerprint.js";

export function doctor(db, root) {
  const items = [];
  let h = null;
  const weak = metaGet(db, "mode") === "weak";
  try {
    h = head(root);
  } catch {
    if (!weak) items.push({ severity: "error", code: "NO_HEAD", detail: "仓库还没有提交" });
  }
  for (const t of listTasks(db)) {
    if (t.status === "done") {
      const ev = db.prepare("SELECT 1 FROM events WHERE task_id=? AND action='close'").get(t.id);
      if (!ev) items.push({ severity: "error", code: "GHOST_DONE", taskId: t.id, detail: "done 但没有 close 事件（疑似直接改库）" });
      if (t.closed_by === "override" || t.closed_by === "force-close") {
        items.push({ severity: "warn", code: "OVERRIDDEN", taskId: t.id, detail: `override 收口（${t.closed_by}）` });
      }
    }
    if (t.status === "doing" && t.claim_expires_at && Date.parse(t.claim_expires_at) < Date.now()) {
      items.push({ severity: "warn", code: "STALE_CLAIM", taskId: t.id, detail: "claim 已过期，下次写操作会回收" });
    }
    if (t.status === "doing" && t.closing_at && Date.now() - Date.parse(t.closing_at) > 60 * 60_000) {
      items.push({ severity: "warn", code: "STALE_CLOSING", taskId: t.id, detail: "close 卡住超过 60 分钟" });
    }
  }
  for (const p of listPaths(db)) {
    for (const rel of p.allowedPaths) {
      if (!fs.existsSync(path.join(root, rel))) items.push({ severity: "warn", code: "STALE_PATH", detail: `${p.id} 的 allowed_path 不存在：${rel}` });
    }
  }
  if (weak) {
    items.push({ severity: "warn", code: "WEAK_MODE", detail: "弱模式（无 git）：只跑验收，没有提交归属/scope/预算校验" });
  }
  const mem = memoryStatus();
  if (mem.enabled) {
    const failed = mem.byState?.failed ?? 0;
    const pending = mem.byState?.pending ?? 0;
    if (failed) items.push({ severity: "warn", code: "MEMORY_INDEX_FAILED", detail: `${failed} 条坑没进向量索引（mcp-probe-kit memory reindex 可重建）` });
    if (pending) items.push({ severity: "warn", code: "MEMORY_INDEX_PENDING", detail: `${pending} 条坑等待索引` });
  }
  for (const d of listDocs(db)) {
    const abs = path.join(root, d.path);
    if (!fs.existsSync(abs)) items.push({ severity: "warn", code: "DOC_DRIFT", detail: `文档丢失：${d.path}` });
    else if (sha256(fs.readFileSync(abs)) !== d.sha256) items.push({ severity: "warn", code: "DOC_DRIFT", detail: `文档已变化：${d.path}` });
  }
  try {
    if (statusPorcelain(root, ["--untracked-files=no", "--", ".", ":(exclude).mcp-probe-kit"])) {
      items.push({ severity: "warn", code: "DIRTY_TREE", detail: "工作树有未提交改动" });
    }
  } catch {
    /* ignore */
  }
  return items;
}

export function exportMarkdown(db) {
  const tasks = listTasks(db);
  const reqs = listReqs(db);
  const bugs = listBugs(db);
  const lines = ["# mcp-probe-kit 快照", ""];
  lines.push("## 需求");
  for (const r of reqs) lines.push(`- ${r.id} ${r.title} · ${r.status}`);
  lines.push("", "## 任务", "| ID | 类型 | 标题 | 状态 | 验收 | 行数 |", "|---|---|---|---|---|---|");
  for (const t of tasks) {
    lines.push(`| ${t.id} | ${t.kind} | ${t.title} | ${t.status} | ${t.acceptance.map((a) => a.assertion).join("；")} | ${t.changed_lines} |`);
  }
  lines.push("", "## Bug");
  for (const b of bugs) lines.push(`- ${b.id} ${b.title} · ${b.status} · ${b.severity}`);
  return lines.join("\n");
}