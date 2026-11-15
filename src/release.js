// mcp-probe-kit — 发布插件：一次交付 = 一组任务，全部 done 才能 ship
import { logEvent, nextId } from "./db.js";
import { fail, getTask, now, taskExists } from "./store.js";

const RELEASE_STATUS = ["planned", "building", "shipped"];

export function getRelease(db, id) {
  const row = db.prepare("SELECT * FROM releases WHERE id=?").get(id);
  if (!row) return null;
  const tasks = db
    .prepare(
      `SELECT t.id, t.title, t.status FROM release_tasks rt JOIN tasks t ON t.id = rt.task_id
        WHERE rt.release_id=? ORDER BY t.id`,
    )
    .all(id);
  return { ...row, tasks, pending: tasks.filter((t) => t.status !== "done").length };
}

export function listReleases(db) {
  return db
    .prepare("SELECT id FROM releases ORDER BY created_at DESC")
    .all()
    .map((r) => getRelease(db, r.id))
    .filter(Boolean);
}

export function createRelease(db, { title, targetDate } = {}) {
  const name = String(title ?? "").trim();
  if (!name) fail("E_CONTRACT", "发布需要一个名字");
  const id = nextId(db, "R");
  db.prepare("INSERT INTO releases(id,title,status,target_date,created_at) VALUES(?,?,?,?,?)").run(id, name, "planned", targetDate ?? null, now());
  logEvent(db, { action: "release.create", detail: `${id} ${name}` });
  return getRelease(db, id);
}

export function planRelease(db, { id, tasks } = {}) {
  const r = getRelease(db, id);
  if (!r) fail("NOT_FOUND", `发布不存在：${id}`);
  if (r.status === "shipped") fail("E_ILLEGAL_TRANSITION", `${id} 已发布`);
  const list = Array.isArray(tasks) ? tasks.map(String) : [];
  if (!list.length) fail("E_CONTRACT", "plan 需要至少一个任务号");
  for (const taskId of list) {
    if (!taskExists(db, taskId)) fail("NOT_FOUND", `任务不存在：${taskId}`);
    db.prepare("INSERT OR IGNORE INTO release_tasks(release_id,task_id) VALUES(?,?)").run(id, taskId);
  }
  db.prepare("UPDATE releases SET status='building' WHERE id=? AND status='planned'").run(id);
  logEvent(db, { action: "release.plan", detail: `${id} +${list.length}` });
  return getRelease(db, id);
}

/** 发布门禁：至少挂一个任务，且全部 done；没做完就把剩下的点出来 */
export function shipRelease(db, { id } = {}) {
  const r = getRelease(db, id);
  if (!r) fail("NOT_FOUND", `发布不存在：${id}`);
  if (r.status === "shipped") fail("E_ILLEGAL_TRANSITION", `${id} 已经发布过`);
  if (!r.tasks.length) fail("E_RELEASE_EMPTY", `${id} 还没有挂任何任务`);
  if (r.pending) {
    fail("E_RELEASE_OPEN", `${id} 还有 ${r.pending} 个任务没完成`, {
      pending: r.tasks.filter((t) => t.status !== "done").map((t) => ({ id: t.id, status: t.status })),
    });
  }
  db.prepare("UPDATE releases SET status='shipped', shipped_at=? WHERE id=?").run(now(), id);
  logEvent(db, { action: "release.ship", detail: `${id} ${r.tasks.length} 个任务` });
  return getRelease(db, id);
}

/** bootstrap 用：有在进行的发布就报一句，没有就 null */
export function releaseSummary(db) {
  // 还没挂任务的「草稿发布」不算当前发布，不往 bootstrap 里塞噪音
  const row = db
    .prepare(
      `SELECT id FROM releases r
        WHERE r.status IN ('planned','building')
          AND EXISTS (SELECT 1 FROM release_tasks rt WHERE rt.release_id = r.id)
        ORDER BY r.created_at DESC LIMIT 1`,
    )
    .get();
  if (!row) return null;
  const r = getRelease(db, row.id);
  return {
    id: r.id,
    title: r.title,
    status: r.status,
    targetDate: r.target_date,
    pending: r.pending,
    tasks: r.tasks.slice(0, 8).map((t) => ({ id: t.id, status: t.status })),
    ready: r.tasks.length > 0 && r.pending === 0,
  };
}

export function assertReleaseStatus(status) {
  if (!RELEASE_STATUS.includes(status)) fail("E_CONTRACT", `未知发布状态：${status}`);
  return status;
}