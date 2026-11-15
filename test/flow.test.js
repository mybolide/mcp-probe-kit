// mcp-probe-kit — 门禁集成测试（node --test）
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { getTask, reqIntake } from "../src/store.js";
import { taskClaim, taskClose } from "../src/gates.js";
import { commitFiles } from "../src/git.js";
import { makeRepo, initFlow, newTask } from "./helpers.js";
import { doctor } from "../src/report.js";
test("happy path：claim → commit → close 重跑通过", async () => {
  const root = makeRepo();
  const { db, reqId } = initFlow(root);
  const task = newTask(db, root, reqId);
  taskClaim(db, root, { id: task.id }, "agentA");
  fs.writeFileSync(path.join(root, "src/a.js"), "export const a = 2;\n");
  commitFiles(root, ["src/a.js"], `feat\n\nTask-Id: ${task.id}\nDevflow-Base: ${task.base_head}`, { author: "agentA" });
  const res = await taskClose(db, root, { id: task.id });
  assert.equal(res.runs[0].passed, true);
  assert.equal(getTask(db, task.id).status, "done");
});

test("close 在没有交付提交时被拦（E_NO_DELIVERY）", async () => {
  const root = makeRepo();
  const { db, reqId } = initFlow(root);
  const task = newTask(db, root, reqId);
  taskClaim(db, root, { id: task.id }, "agentA");
  await assert.rejects(() => taskClose(db, root, { id: task.id }), (e) => e.code === "E_NO_DELIVERY");
  assert.equal(getTask(db, task.id).status, "doing");
});

test("无主提交（无 Task-Id）被拦（E_UNOWNED_COMMIT）", async () => {
  const root = makeRepo();
  const { db, reqId } = initFlow(root);
  const task = newTask(db, root, reqId);
  taskClaim(db, root, { id: task.id }, "agentA");
  fs.writeFileSync(path.join(root, "src/a.js"), "export const a = 3;\n");
  commitFiles(root, ["src/a.js"], "no trailer", { author: "agentA" });
  await assert.rejects(() => taskClose(db, root, { id: task.id }), (e) => e.code === "E_UNOWNED_COMMIT");
});

test("越界改动被拦（E_SCOPE_VIOLATION）", async () => {
  const root = makeRepo();
  const { db, reqId } = initFlow(root);
  const task = newTask(db, root, reqId);
  taskClaim(db, root, { id: task.id }, "agentA");
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: "d", version: "1.0.1", scripts: { test: 'node -e "process.exit(0)"' } }));
  commitFiles(root, ["package.json"], `chore\n\nTask-Id: ${task.id}`, { author: "agentA" });
  await assert.rejects(() => taskClose(db, root, { id: task.id }), (e) => e.code === "E_SCOPE_VIOLATION");
});

test("脏工作树被拦（E_DIRTY_SCOPE），且不计 review_round", async () => {
  const root = makeRepo();
  const { db, reqId } = initFlow(root);
  const task = newTask(db, root, reqId);
  taskClaim(db, root, { id: task.id }, "agentA");
  fs.writeFileSync(path.join(root, "src/a.js"), "export const a = 4;\n");
  commitFiles(root, ["src/a.js"], `feat\n\nTask-Id: ${task.id}`, { author: "agentA" });
  fs.writeFileSync(path.join(root, "src/a.js"), "export const a = 5;\n"); // 未提交
  await assert.rejects(() => taskClose(db, root, { id: task.id }), (e) => e.code === "E_DIRTY_SCOPE");
  assert.equal(getTask(db, task.id).review_round, 0);
});

test("验收失败 → E_ASSERTION_FAILED，并累计一次 review_round", async () => {
  // 仓库自带一条失败的测试命令；任务只改 src，靠重跑失败触发断言拦截。
  const root = makeRepo({ failTest: true });
  const { db, reqId } = initFlow(root);
  const task = newTask(db, root, reqId);
  taskClaim(db, root, { id: task.id }, "agentA");
  fs.writeFileSync(path.join(root, "src/a.js"), "export const a = 6;\n");
  commitFiles(root, ["src/a.js"], `feat\n\nTask-Id: ${task.id}`, { author: "agentA" });
  await assert.rejects(
    () => taskClose(db, root, { id: task.id }),
    (e) => e.code === "E_ASSERTION_FAILED",
  );
  const t = getTask(db, task.id);
  assert.equal(t.status, "doing");
  assert.equal(t.review_round, 1);
});
test("文档登记与漂移：登记后 doctor 干净，改动后报 DOC_DRIFT", () => {
  const root = makeRepo();
  const { db } = initFlow(root);
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs/spec.md"), "# spec v1\n");
  const res = reqIntake(db, root, { type: "doc", path: "docs/spec.md", title: "规格" });
  assert.match(res.id, /^D-/);
  assert.equal(doctor(db, root).filter((i) => i.code === "DOC_DRIFT").length, 0);

  fs.writeFileSync(path.join(root, "docs/spec.md"), "# spec v2\n");
  const drift = doctor(db, root).filter((i) => i.code === "DOC_DRIFT");
  assert.equal(drift.length, 1);
  assert.match(drift[0].detail, /docs\/spec\.md/);
});
