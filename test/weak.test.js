// mcp-probe-kit — 弱模式：没有 git 的项目也能用纪律（只跑验收，无归属）
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { openDb, metaGet } from "../src/db.js";
import { reqIntake, reqApprove, getTask } from "../src/store.js";
import { taskCreate, taskClaim, taskClose } from "../src/gates.js";
import { doctor } from "../src/report.js";
import { bootstrap } from "../src/digest.js";
import { BIN } from "./helpers.js";

function makePlainDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mpk-weak-"));
  fs.mkdirSync(path.join(dir, "src"));
  fs.writeFileSync(path.join(dir, "src/a.js"), "export const a = 1;\n");
  return dir;
}

const run = (root, args) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN, ...args], { cwd: root, env: { ...process.env, MCP_PROBE_KIT_ROOT: root, MCP_PROBE_KIT_MEMORY: "off" } });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("exit", (code) => resolve({ code, out }));
  });

test("没有 git 也能 init --weak、领任务、收口（只跑验收）", async () => {
  const root = makePlainDir();
  const init = await run(root, ["init", "--weak"]);
  assert.equal(init.code, 0, init.out);
  assert.match(init.out, /weak/);
  assert.ok(fs.existsSync(path.join(root, ".mcp-probe-kit", "state.db")));

  const db = openDb(root);
  assert.equal(metaGet(db, "mode"), "weak");
  const pathId = db.prepare("SELECT id FROM paths WHERE status='draft'").get().id;
  db.prepare("UPDATE paths SET test_cmds_json=? WHERE id=?").run(JSON.stringify(['node -e "process.exit(0)"']), pathId);

  const req = reqIntake(db, root, { type: "requirement", title: "弱模式需求", goal: "g", acceptance: ['node -e "process.exit(0)" :: exit==0'] });
  const approved = reqApprove(db, root, { requirementId: req.id, pathId });
  assert.equal(approved.contractCommit, null, "弱模式不产生契约提交");

  const task = taskCreate(db, root, {
    requirementId: req.id,
    pathId,
    kind: "feature",
    title: "弱模式任务",
    acceptance: [{ deriveFrom: 0, assertion: 'node -e "process.exit(0)" :: exit==0' }],
    scope: ["src"],
  });
  assert.equal(task.base_head, "", "弱模式 base_head 为空");
  taskClaim(db, root, { id: task.id }, "agent");

  const res = await taskClose(db, root, { id: task.id });
  assert.equal(res.weak, true);
  assert.equal(res.runs[0].passed, true);
  assert.equal(getTask(db, task.id).status, "done");
  assert.equal(bootstrap(db, root).mode, "weak");

  const items = doctor(db, root).filter((i) => i.code === "WEAK_MODE");
  assert.equal(items.length, 1);
});

test("弱模式下 mcp-probe-kit commit 直接拒绝，不会假装提交成功", async () => {
  const root = makePlainDir();
  assert.equal((await run(root, ["init", "--weak"])).code, 0);
  const res = await run(root, ["commit", "-m", "x"]);
  assert.equal(res.code, 1, res.out);
  assert.match(res.out, /E_WEAK_NO_GIT/);
});

test("不是 git 又没给 --weak：明确拒绝并给出提示", async () => {
  const root = makePlainDir();
  const res = await run(root, ["init"]);
  assert.equal(res.code, 1);
  assert.match(res.out, /E_NOT_REPO/);
  assert.match(res.out, /--weak/);
});