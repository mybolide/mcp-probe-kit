// mcp-probe-kit — 内核自己决定下一步：验收覆盖 + 依赖排序
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { openDb } from "../src/db.js";
import { reqIntake, reqApprove, getTask } from "../src/store.js";
import { taskCreate, taskClaim, taskClose } from "../src/gates.js";
import { commitFiles } from "../src/git.js";
import { bootstrap } from "../src/digest.js";
import { makeRepo } from "./helpers.js";

function setup(root, acceptance = ["npm test :: exit==0", "npm test :: exit==0"]) {
  const db = openDb(root);
  db.prepare("INSERT INTO paths(id,allowed_paths_json,allow_new_files,budget_lines,test_cmds_json,status) VALUES('P-001',?,0,1200,?,'draft')").run(
    JSON.stringify(["src"]),
    JSON.stringify(["npm test"]),
  );
  const req = reqIntake(db, root, { type: "requirement", title: "两件事", goal: "g", acceptance });
  reqApprove(db, root, { requirementId: req.id, pathId: "P-001" });
  return { db, req };
}

const mkTask = (db, root, req, extra = {}) =>
  taskCreate(db, root, {
    requirementId: req.id,
    pathId: "P-001",
    kind: "feature",
    title: "改 a.js",
    acceptance: [{ deriveFrom: 0, assertion: "npm test :: exit==0" }],
    scope: ["src"],
    ...extra,
  });

const finish = async (db, root, task) => {
  if (getTask(db, task.id).status === "backlog") taskClaim(db, root, { id: task.id }, "agent");
  fs.writeFileSync(path.join(root, "src/a.js"), `export const a = "${task.id}";\n`);
  commitFiles(root, ["src/a.js"], `feat\n\nTask-Id: ${task.id}`, { author: "agent" });
  return taskClose(db, root, { id: task.id, resolvedBy: "按模板补齐" });
};

test("覆盖度：验收没被任务覆盖时，内核让 Agent 去补拆，而不是自己去挑", async () => {
  const root = makeRepo();
  const { db, req } = setup(root);

  const first = bootstrap(db, root);
  assert.equal(first.next.action, "task.create");
  assert.match(first.next.why, /2 条验收没有任务覆盖/);
  assert.equal(first.plan[0].covered, "0/2");

  const t1 = mkTask(db, root, req, { title: "第一件事" });
  const second = bootstrap(db, root);
  assert.equal(second.next.action, "task.claim", "已有可领取任务时先做，不催拆新任务");
  assert.equal(second.next.args.id, t1.id);
  assert.equal(second.plan[0].covered, "1/2");

  await finish(db, root, t1);
  const third = bootstrap(db, root);
  assert.equal(third.next.action, "task.create");
  assert.match(third.next.why, /还有 1 条验收没有任务覆盖/);
  assert.equal(third.next.args.deriveFrom, 1);
  assert.deepEqual(third.plan[0].missing.length, 1);
});

test("依赖排序：前置没完成时内核说「等」，而不是把阻塞任务推给 Agent", async () => {
  const root = makeRepo();
  const { db, req } = setup(root, ["npm test :: exit==0"]);

  const t1 = mkTask(db, root, req, { title: "前置" });
  const t2 = mkTask(db, root, req, { title: "后置", dependsOn: [t1.id] });

  // T1 在办，T2 阻塞 → 不该被推荐领取
  taskClaim(db, root, { id: t1.id }, "agent");
  const blocked = bootstrap(db, root);
  assert.equal(blocked.next.action, "task.close", "在办任务优先收口");

  await finish(db, root, t1);
  const after = bootstrap(db, root);
  assert.equal(after.next.action, "task.claim");
  assert.equal(after.next.args.id, t2.id);
  assert.equal(getTask(db, t2.id).status, "backlog");
});

test("只有阻塞任务时：next=wait，并给出阻塞原因与计数", async () => {
  const root = makeRepo();
  const { db, req } = setup(root, ["npm test :: exit==0"]);

  const t1 = mkTask(db, root, req, { title: "前置" });
  const t2 = mkTask(db, root, req, { title: "后置", dependsOn: [t1.id] });

  const dig = bootstrap(db, root);
  assert.equal(dig.next.action, "task.claim");
  assert.equal(dig.next.args.id, t1.id);

  db.prepare("UPDATE tasks SET status='parked' WHERE id=?").run(t1.id);
  const parked = bootstrap(db, root);
  assert.equal(parked.next.action, "wait");
  assert.match(parked.next.why, new RegExp(t2.id));
  assert.deepEqual(parked.next.blocked, [t2.id]);
  assert.equal(parked.counts.blocked, 1);
});
test("还没批准的需求/Path 时，next 是 wait 而不是给一个调不了的动作", () => {
  const root = makeRepo();
  const db = openDb(root);
  db.prepare("INSERT INTO paths(id,allowed_paths_json,allow_new_files,budget_lines,test_cmds_json,status) VALUES('P-001',?,0,1200,?,'draft')").run(
    JSON.stringify(["src"]),
    JSON.stringify(["npm test"]),
  );
  const dig = bootstrap(db, root);
  assert.equal(dig.next.action, "wait");
  assert.match(dig.next.why, /批准/);
  assert.ok(!dig.actions.includes("task.create"), "不能给一个会被 E_NEED_APPROVED 拦掉的动作");
});
