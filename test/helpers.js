// mcp-probe-kit — 测试夹具：临时仓库 + 最小「需求批准 → 任务」链路
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { openDb } from "../src/db.js";
import { reqIntake, reqApprove } from "../src/store.js";
import { taskCreate } from "../src/gates.js";

export const BIN = path.join(import.meta.dirname, "..", "bin", "mcp-probe-kit.js");

export function sh(cwd, ...args) {
  return execFileSync(args[0], args.slice(1), { cwd, encoding: "utf8" });
}

export function makeRepo({ failTest = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mpk-"));
  sh(dir, "git", "init", "-q", ".");
  sh(dir, "git", "config", "user.email", "t@t");
  sh(dir, "git", "config", "user.name", "t");
  fs.mkdirSync(path.join(dir, "src"));
  const script = failTest ? 'node -e "process.exit(1)"' : 'node -e "process.exit(0)"';
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "d", version: "1.0.0", scripts: { test: script } }));
  fs.writeFileSync(path.join(dir, "src/a.js"), "export const a = 1;\n");
  sh(dir, "git", "add", "-A");
  sh(dir, "git", "commit", "-qm", "init");
  return dir;
}

export function initFlow(root, { testCmd = "npm test" } = {}) {
  const db = openDb(root);
  db.prepare("INSERT INTO paths(id,allowed_paths_json,allow_new_files,budget_lines,test_cmds_json,status) VALUES('P-001',?,0,1200,?,'draft')").run(
    JSON.stringify(["src"]),
    JSON.stringify([testCmd]),
  );
  const req = reqIntake(db, root, { type: "requirement", title: "r", goal: "g", acceptance: [`${testCmd} :: exit==0`] });
  reqApprove(db, root, { requirementId: req.id, pathId: "P-001" });
  return { db, reqId: req.id };
}

export function newTask(db, root, reqId, extra = {}) {
  return taskCreate(db, root, {
    requirementId: reqId,
    pathId: "P-001",
    kind: "feature",
    title: "改 a.js",
    acceptance: [{ deriveFrom: 0, assertion: "npm test :: exit==0" }],
    scope: ["src"],
    ...extra,
  });
}