// mcp-probe-kit — 发布插件：一组任务全 done 才能 ship
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { getTask } from "../src/store.js";
import { taskClaim, taskClose } from "../src/gates.js";
import { commitFiles } from "../src/git.js";
import { createRelease, planRelease, shipRelease, getRelease, releaseSummary, listReleases } from "../src/release.js";
import { makeRepo, initFlow, newTask } from "./helpers.js";

const finish = async (db, root, task) => {
  if (getTask(db, task.id).status === "backlog") taskClaim(db, root, { id: task.id }, "agent");
  fs.writeFileSync(path.join(root, "src/a.js"), `export const a = "${task.id}";\n`);
  commitFiles(root, ["src/a.js"], `feat\n\nTask-Id: ${task.id}`, { author: "agent" });
  return taskClose(db, root, { id: task.id });
};

test("发布门禁：没挂任务不能 ship，任务没全 done 不能 ship", async () => {
  const root = makeRepo();
  const { db, reqId } = initFlow(root);
  const t1 = newTask(db, root, reqId, { title: "第一件" });
  const t2 = newTask(db, root, reqId, { title: "第二件" });

  const empty = createRelease(db, { title: "空发布" });
  assert.equal(empty.id, "R-001");
  assert.equal(empty.status, "planned");
  assert.throws(() => shipRelease(db, { id: empty.id }), (e) => e.code === "E_RELEASE_EMPTY");

  const r = createRelease(db, { title: "v0.1", targetDate: "2026-01-01" });
  const planned = planRelease(db, { id: r.id, tasks: [t1.id, t2.id] });
  assert.equal(planned.status, "building");
  assert.equal(planned.tasks.length, 2);
  assert.equal(planned.pending, 2);

  const summary = releaseSummary(db);
  assert.equal(summary.id, r.id);
  assert.equal(summary.ready, false);

  assert.throws(() => shipRelease(db, { id: r.id }), (e) => e.code === "E_RELEASE_OPEN" && e.data.pending.length === 2);

  await finish(db, root, t1);
  assert.equal(getRelease(db, r.id).pending, 1);
  assert.throws(() => shipRelease(db, { id: r.id }), (e) => e.code === "E_RELEASE_OPEN");

  await finish(db, root, t2);
  const shipped = shipRelease(db, { id: r.id });
  assert.equal(shipped.status, "shipped");
  assert.ok(shipped.shipped_at);
  assert.equal(releaseSummary(db), null, "发布后不再是进行中的发布");
  assert.equal(listReleases(db).length, 2);
  assert.throws(() => shipRelease(db, { id: r.id }), (e) => e.code === "E_ILLEGAL_TRANSITION");
});

test("plan 拒绝不存在的任务，已发布的发布不能再改", () => {
  const root = makeRepo();
  const { db, reqId } = initFlow(root);
  const t1 = newTask(db, root, reqId);
  const r = createRelease(db, { title: "v1" });
  assert.throws(() => planRelease(db, { id: r.id, tasks: ["T-999"] }), (e) => e.code === "NOT_FOUND");
  planRelease(db, { id: r.id, tasks: [t1.id] });
  db.prepare("UPDATE releases SET status='shipped' WHERE id=?").run(r.id);
  assert.throws(() => planRelease(db, { id: r.id, tasks: [t1.id] }), (e) => e.code === "E_ILLEGAL_TRANSITION");
});