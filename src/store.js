// mcp-probe-kit — 存储与 Owner 侧动作
import fs from "node:fs";
import path from "node:path";
import { logEvent, metaGet, metaSet, nextId, tx } from "./db.js";
import { commitContract, contractBody, parseAssertion } from "./contract.js";
import { sha256 } from "./fingerprint.js";

export const now = () => new Date().toISOString();
export const MIN = 60_000;

export class DFError extends Error {
  constructor(code, message, data) {
    super(message);
    this.code = code;
    this.data = data;
  }
}
export const fail = (code, message, data) => {
  throw new DFError(code, message, data);
};

const J = (v, d) => {
  try {
    return JSON.parse(v);
  } catch {
    return d;
  }
};

export function mapReq(r) {
  return r && { ...r, acceptance: J(r.acceptance_json, []) };
}
export function mapPath(p) {
  return p && { ...p, allowedPaths: J(p.allowed_paths_json, []), testCmds: J(p.test_cmds_json, []) };
}
export function mapTask(t) {
  return (
    t && {
      ...t,
      scope: J(t.scope_json, []),
      acceptance: J(t.acceptance_json, []),
      dependsOn: J(t.depends_on_json, []),
    }
  );
}
export function mapBug(b) {
  return b && { ...b, repro: J(b.repro_json, []), attachments: J(b.attachments_json, []) };
}

export function getReq(db, id) {
  return mapReq(db.prepare("SELECT * FROM requirements WHERE id=?").get(id));
}
export function getPath(db, id) {
  return mapPath(db.prepare("SELECT * FROM paths WHERE id=?").get(id));
}
export function getTask(db, id) {
  return mapTask(db.prepare("SELECT * FROM tasks WHERE id=?").get(id));
}
export function getBug(db, id) {
  return mapBug(db.prepare("SELECT * FROM bugs WHERE id=?").get(id));
}
export function listTasks(db) {
  return db.prepare("SELECT * FROM tasks ORDER BY id").all().map(mapTask);
}
export function listReqs(db) {
  return db.prepare("SELECT * FROM requirements ORDER BY id").all().map(mapReq);
}
export function listPaths(db) {
  return db.prepare("SELECT * FROM paths ORDER BY id").all().map(mapPath);
}
export function listBugs(db) {
  return db.prepare("SELECT * FROM bugs ORDER BY id").all().map(mapBug);
}
export function listDocs(db) {
  return db.prepare("SELECT * FROM docs ORDER BY id").all();
}
/** 证据流：每次验收重跑的命令/退出码/HEAD/指纹，可复核 */
export function listRuns(db, limit = 20) {
  return db
    .prepare(
      `SELECT r.id, r.task_id, t.title AS task_title, r.assertion_idx, r.command, r.exit_code,
              r.head, r.fingerprint, r.log_sha256, r.started_at, r.duration_ms
         FROM runs r LEFT JOIN tasks t ON t.id = r.task_id
        ORDER BY r.started_at DESC LIMIT ?`,
    )
    .all(limit);
}

export function listQuestions(db) {
  return db.prepare("SELECT * FROM questions ORDER BY id").all();
}

export function taskExists(db, id) {
  return Boolean(db.prepare("SELECT 1 FROM tasks WHERE id=?").get(id));
}

/** 惰性回收：过期 doing → backlog（closing 中的不动） */
export function recycleExpired(db) {
  const rows = db
    .prepare("SELECT id, claimed_by FROM tasks WHERE status='doing' AND closing_token IS NULL AND claim_expires_at < ?")
    .all(now());
  for (const row of rows) {
    db.prepare("UPDATE tasks SET status='backlog', claimed_by=NULL, claimed_at=NULL, claim_expires_at=NULL, updated_at=? WHERE id=?").run(now(), row.id);
    logEvent(db, { action: "recycle", taskId: row.id, code: "E_CLAIM_STALE", detail: `接管 ${row.claimed_by ?? "?"} 的过期任务` });
  }
  return rows.length;
}

/** 一次性 waive：override mode=waive 写入，close 消费 */
export function setWaive(db, taskId, code) {
  metaSet(db, `waive:${taskId}:${code}`, "1");
}
export function waiveFor(db, taskId, code) {
  return metaGet(db, `waive:${taskId}:${code}`) === "1";
}
export function consumeWaive(db, taskId, code) {
  db.prepare("DELETE FROM meta WHERE key=?").run(`waive:${taskId}:${code}`);
}

// ── Owner：需求 / Bug / 文档 ────────────────────────────────────────────────

export function reqIntake(db, root, input) {
  return tx(db, () => {
    const type = input.type ?? "requirement";
    if (type === "doc") {
      const rel = String(input.path ?? "").trim();
      const abs = path.join(root, rel);
      if (!rel || !fs.existsSync(abs)) fail("E_CONTRACT", `文档不存在：${rel}`);
      const id = nextId(db, "D");
      db.prepare("INSERT INTO docs(id,requirement_id,path,sha256,title,kind,registered_at) VALUES(?,?,?,?,?,?,?)").run(
        id,
        input.requirementId ?? null,
        rel,
        sha256(fs.readFileSync(abs)),
        input.title ?? path.basename(rel),
        input.kind ?? "spec",
        now(),
      );
      logEvent(db, { channel: "owner", action: "doc.intake", detail: rel });
      return { id, type };
    }
    if (type === "bug") {
      const id = nextId(db, "B");
      db.prepare(
        "INSERT INTO bugs(id,requirement_id,title,symptom,expected,repro_json,attachments_json,severity,status,task_id,source,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
      ).run(
        id,
        input.requirementId ?? null,
        String(input.title ?? "").trim(),
        String(input.symptom ?? "").trim(),
        String(input.expected ?? "").trim(),
        JSON.stringify(input.repro ?? []),
        JSON.stringify(input.attachments ?? []),
        input.severity ?? "P2",
        "new",
        null,
        "owner",
        now(),
      );
      logEvent(db, { channel: "owner", action: "bug.intake", detail: input.title ?? "" });
      return { id, type };
    }
    const acceptance = (input.acceptance ?? []).map((a) => (typeof a === "string" ? a : a.assertion)).filter(Boolean);
    if (!acceptance.length) fail("E_CONTRACT", "需求至少要有一条可观测断言");
    for (const a of acceptance) parseAssertion(a);
    const id = nextId(db, "FR");
    db.prepare(
      "INSERT INTO requirements(id,title,goal,acceptance_json,status,created_at) VALUES(?,?,?,?,?,?)",
    ).run(id, String(input.title ?? "").trim(), String(input.goal ?? "").trim(), JSON.stringify(acceptance), "draft", now());
    logEvent(db, { channel: "owner", action: "req.intake", detail: input.title ?? "" });
    return { id, type };
  });
}

/** 一键批准：需求 + Path 一起冻结，写契约提交 */
export function reqApprove(db, root, input) {
  return tx(db, () => {
    const req = getReq(db, input.requirementId);
    if (!req) fail("E_NEED_APPROVED", `需求不存在：${input.requirementId}`);
    const p = getPath(db, input.pathId);
    if (!p) fail("E_NEED_APPROVED", `Path 不存在：${input.pathId}`);
    if (p.status === "approved") fail("E_ILLEGAL_TRANSITION", `${p.id} 已批准`);
    const expected = sha256(Buffer.from(JSON.stringify(req.acceptance)));
    if (input.acceptanceHashPrefix && !expected.startsWith(input.acceptanceHashPrefix)) {
      fail("E_HASH_MISMATCH", `哈希前 8 位不符：${expected.slice(0, 8)}`);
    }
    const body = contractBody({
      pathId: p.id,
      requirementId: req.id,
      allowedPaths: p.allowedPaths,
      allowNewFiles: Boolean(p.allow_new_files),
      testCmds: p.testCmds,
      budgetLines: p.budget_lines,
    });
    const weak = metaGet(db, "mode") === "weak";
    const { sha, hash } = commitContract(root, body, "approve", { weak });
    db.prepare("UPDATE requirements SET status='approved', approved_at=? WHERE id=?").run(now(), req.id);
    db.prepare("UPDATE paths SET requirement_id=?, status='approved', hash=?, contract_commit=?, approved_at=? WHERE id=?").run(
      req.id,
      hash,
      sha,
      now(),
      p.id,
    );
    logEvent(db, { channel: "owner", action: "req.approve", detail: `${req.id} + ${p.id} @ ${sha ? sha.slice(0, 8) : "弱模式"}` });
    return { requirementId: req.id, pathId: p.id, contractCommit: sha, hash };
  });
}

export function reqAmend(db, root, input) {
  return tx(db, () => {
    const req = getReq(db, input.requirementId);
    if (!req) fail("E_NEED_APPROVED", `需求不存在：${input.requirementId}`);
    const acceptance = input.acceptance
      ? input.acceptance.map((a) => (typeof a === "string" ? a : a.assertion)).filter(Boolean)
      : req.acceptance;
    for (const a of acceptance) parseAssertion(a);
    const paths = listPaths(db).filter((p) => p.requirement_id === req.id);
    const touchesPaths = Boolean(input.allowedPaths);
    db.prepare("UPDATE requirements SET acceptance_json=?, status='building' WHERE id=?").run(JSON.stringify(acceptance), req.id);
    const affected = [];
    for (const p of paths) {
      const allowed = input.allowedPaths ?? p.allowedPaths;
      const body = contractBody({
        pathId: p.id,
        requirementId: req.id,
        allowedPaths: allowed,
        allowNewFiles: Boolean(p.allow_new_files),
        testCmds: p.testCmds,
        budgetLines: p.budget_lines,
      });
      const { sha, hash } = commitContract(root, body, "amend", { weak: metaGet(db, "mode") === "weak" });
      db.prepare("UPDATE paths SET allowed_paths_json=?, hash=?, contract_commit=?, status=? WHERE id=?").run(
        JSON.stringify(allowed),
        hash,
        sha,
        touchesPaths ? "draft" : "approved",
        p.id,
      );
      const doing = db.prepare("SELECT id FROM tasks WHERE path_id=? AND status='doing' AND closing_token IS NULL").all(p.id);
      for (const t of doing) {
        db.prepare("UPDATE tasks SET status='backlog', claimed_by=NULL, claimed_at=NULL, claim_expires_at=NULL, contract_hash=?, contract_commit=?, base_head=?, updated_at=? WHERE id=?").run(
          hash,
          sha,
          sha,
          now(),
          t.id,
        );
        affected.push(t.id);
      }
    }
    logEvent(db, { channel: "owner", action: "req.amend", detail: `${req.id}${touchesPaths ? " (path → draft)" : ""}` });
    return { requirementId: req.id, affectedTasks: affected, pathStatus: touchesPaths ? "draft" : "approved" };
  });
}

// ── Owner：任务动作 ────────────────────────────────────────────────────────

export function taskAdjust(db, input) {
  return tx(db, () => {
    const t = getTask(db, input.taskId);
    if (!t) fail("NOT_FOUND", `任务不存在：${input.taskId}`);
    const scope = input.scope ?? t.scope;
    const budget = input.budgetLines ?? t.budget_lines;
    db.prepare("UPDATE tasks SET scope_json=?, budget_lines=?, updated_at=? WHERE id=?").run(
      JSON.stringify(scope),
      Number(budget),
      now(),
      t.id,
    );
    logEvent(db, { channel: "owner", action: "task.adjust", taskId: t.id, detail: input.reason ?? "" });
    return { taskId: t.id, scope, budgetLines: budget };
  });
}

export function taskReopen(db, input) {
  return tx(db, () => {
    const t = getTask(db, input.taskId);
    if (!t) fail("NOT_FOUND", `任务不存在：${input.taskId}`);
    if (!["done", "parked"].includes(t.status)) fail("E_ILLEGAL_TRANSITION", `${t.id} 当前 ${t.status}，不能打回`);
    db.prepare("UPDATE tasks SET status='backlog', closed_by=NULL, closed_at=NULL, review_round=0, updated_at=? WHERE id=?").run(now(), t.id);
    logEvent(db, { channel: "owner", action: "task.reopen", taskId: t.id, detail: input.reason ?? "" });
    return { taskId: t.id, status: "backlog" };
  });
}

export function bugDecide(db, input) {
  return tx(db, () => {
    const b = getBug(db, input.bugId);
    const decision = input.decision ?? "accept";
    const status = decision === "reject" ? "fixing" : "closed";
    db.prepare("UPDATE bugs SET status=?, closed_by=? WHERE id=?").run(status, decision, b.id);
    logEvent(db, { channel: "owner", action: "bug.decide", detail: `${b.id} ${decision}` });
    return { bugId: b.id, status };
  });
}

export function answer(db, input) {
  return tx(db, () => {
    const q = db.prepare("SELECT * FROM questions WHERE id=?").get(input.questionId);
    if (!q) fail("NOT_FOUND", `问题不存在：${input.questionId}`);
    db.prepare("UPDATE questions SET answer=?, answered_at=?, status='answered' WHERE id=?").run(String(input.answer ?? ""), now(), q.id);
    if (q.task_id) {
      db.prepare("UPDATE tasks SET status='backlog', claimed_by=NULL, claimed_at=NULL, claim_expires_at=NULL, updated_at=? WHERE id=? AND status='parked'").run(now(), q.task_id);
    }
    logEvent(db, { channel: "owner", action: "answer", taskId: q.task_id, detail: q.id });
    return { questionId: q.id, taskResumed: q.task_id ?? null };
  });
}

export function override(db, input) {
  return tx(db, () => {
    const t = getTask(db, input.taskId);
    if (!t) fail("NOT_FOUND", `任务不存在：${input.taskId}`);
    if (String(input.reason ?? "").trim().length < 30) fail("E_CONTRACT", "override 理由至少 30 字");
    if (input.mode === "force-close") {
      db.prepare("UPDATE tasks SET status='done', closed_by='force-close', closed_at=?, closing_at=NULL, closing_token=NULL, updated_at=? WHERE id=?").run(now(), now(), t.id);
    } else {
      setWaive(db, t.id, input.code);
    }
    logEvent(db, { channel: "owner", action: "override", taskId: t.id, code: input.code, detail: input.reason });
    return { taskId: t.id, mode: input.mode ?? "waive", code: input.code };
  });
}

export function handoff(db, input) {
  const t = getTask(db, input.taskId);
  if (!t) fail("NOT_FOUND", `任务不存在：${input.taskId}`);
  const req = getReq(db, t.requirement_id);
  const p = getPath(db, t.path_id);
  const lines = [
    `【${t.id}】${t.title}`,
    `需求 ${req?.id ?? "?"} · Path ${p?.id ?? "?"} · scope: ${t.scope.join(", ") || "(未设)"}`,
    `验收: ${t.acceptance.map((a) => a.assertion).join("；") || "(未设)"}`,
    `前置: ${t.dependsOn.length ? t.dependsOn.join(", ") : "无"} · 预算: ${t.budget_lines} 行（已用 ${t.changed_lines}）`,
    `起步: mcp-probe-kit mcp → task.claim(${t.id})`,
  ];
  return { text: lines.join("\n") };
}