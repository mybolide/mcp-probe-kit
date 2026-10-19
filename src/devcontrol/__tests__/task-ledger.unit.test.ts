import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { ProjectTaskLedger, DevControlError } from "../task-ledger.js";

let root = "";
let ledger: ProjectTaskLedger | null = null;

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}
function save(file: string, content: string): void {
  const absolute = path.join(root, file);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content);
}
function commit(message = "change"): void {
  git("add", "-A");
  git("-c", "user.name=Fixture", "-c", "user.email=test@example.invalid",
    "commit", "-qm", message);
}
function create(options: Partial<{
  id: string; title: string; parentId: string; dependsOn: string[];
  allowedPaths: string[]; requiredGates: string[]; specId: string;
}> = {}) {
  return ledger!.create({
    id: "NEYNA-200", title: "Contract", allowedPaths: ["tests/contracts/**"],
    requiredGates: ["docs"], ...options,
  }, "agent-proposal");
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "probe-devcontrol-"));
  git("init", "-q");
  save(".gitignore", ".neyna/state/\n");
  save("scripts/validate_docs.py", "print('documentation checks ok')\n");
  save("README.md", "fixture\n");
  save(".neyna/devcontrol-plan.json", JSON.stringify({
    schema_version: 1, project_id: "neyna", phase: "0-to-1", focus_task: "F1",
    tasks: [
      { id: "F0", title: "Environment", release: "V0.1", track: "product",
        allowed_paths: ["docs/**"], required_gates: ["docs"], depends_on: [],
        bootstrap: { status: "verified", evidence: "environment checked" } },
      { id: "F1", title: "API contract", release: "V0.1", track: "product",
        allowed_paths: ["tests/contracts/**"], required_gates: ["docs"], depends_on: ["F0"] },
      { id: "F2", title: "Core", release: "V0.1", track: "product",
        allowed_paths: ["services/core/**"], required_gates: ["docs"], depends_on: ["F1"] },
    ],
  }));
  commit("legacy baseline");
  // Simulate Python v0.1 local DB migration, including an existing verified task.
  const require = createRequire(import.meta.url);
  const { DatabaseSync } = require("node:sqlite") as {
    DatabaseSync: new (file: string) => {
      exec(sql: string): void; close(): void;
      prepare(sql: string): { run(...args: any[]): unknown };
    };
  };
  fs.mkdirSync(path.join(root, ".neyna/state"), { recursive: true });
  const db = new DatabaseSync(path.join(root, ".neyna/state/devcontrol.sqlite3"));
  db.exec("CREATE TABLE task_state(task_id TEXT PRIMARY KEY,status TEXT,verified_at TEXT);");
  db.prepare("INSERT INTO task_state VALUES(?,?,?)").run("F0", "verified", "2026-10-19T00:00:00Z");
  db.prepare("INSERT INTO task_state VALUES(?,?,?)").run("F1", "planned", null);
  db.prepare("INSERT INTO task_state VALUES(?,?,?)").run("F2", "planned", null);
  db.close();
  ledger = new ProjectTaskLedger(root);
});

afterEach(() => {
  ledger?.close();
  ledger = null;
  fs.rmSync(root, { recursive: true, force: true });
});

describe("project ledger and legacy migration", () => {
  it("imports existing verified task status, preserves legacy schema, and recommends F1", () => {
    expect(ledger!.get("F0").status).toBe("verified");
    expect(ledger!.get("F1").status).toBe("ready");
    expect(ledger!.next().nextTask.id).toBe("F1");
    expect(ledger!.next().blocked).toContainEqual({ id: "F2", blockedBy: ["F1"] });
    expect(ledger!.trace("F0").audit.some((x: any) => x.event === "legacy_import")).toBe(true);
    expect(() => ledger!.claim("F2", "blocked")).toThrowError(DevControlError);
  });

  it("creates draft child tasks that cannot be claimed before explicit approval", () => {
    create({ id: "NEYNA-200", title: "Parent" });
    create({ id: "NEYNA-201", parentId: "NEYNA-200", title: "Child" });
    expect(ledger!.get("NEYNA-201").status).toBe("draft");
    expect(() => ledger!.claim("NEYNA-201", "agent")).toThrow(/ready|draft/i);
    ledger!.approve("NEYNA-201", "owner");
    expect(ledger!.claim("NEYNA-201", "agent").task.status).toBe("in_progress");
    expect(ledger!.trace("NEYNA-201").audit.some((x: any) => x.event === "approved")).toBe(true);
  });

  it("disallows cycles, changes of approved dependencies and unverified prerequisites", () => {
    create({ id: "NEYNA-210" });
    create({ id: "NEYNA-211", dependsOn: ["NEYNA-210"] });
    expect(() => ledger!.addDependency("NEYNA-210", "NEYNA-211", "agent")).toThrow(/cycle/i);
    ledger!.approve("NEYNA-211", "owner");
    expect(() => ledger!.addDependency("NEYNA-211", "F1", "agent")).toThrow(/before approval/i);
    expect(() => ledger!.claim("NEYNA-211", "agent")).toThrow(/depends on/i);
  });

  it("imports parent-child spec manifest with stable IDs and dependencies as drafts", () => {
    create({ id: "NEYNA-220" });
    const manifestPath = "docs/specs/memory/spec-manifest.json";
    save(manifestPath, JSON.stringify({
      layout: "parent-child",
      subspecs: [
        { id: "foundation", title: "Foundation", fr: ["FR-001"] },
        { id: "client", title: "Client", fr: ["FR-002"], dependsOn: ["foundation"] },
      ],
    }));
    const input = {
      manifestPath, parentTaskId: "NEYNA-220", idPrefix: "NEYNA-230",
      allowedPaths: ["tests/contracts/**"], requiredGates: ["docs"],
      planId: "feature-memory-abc",
    };
    const result = ledger!.importSpec(input);
    expect(result.importedIds).toEqual(["NEYNA-230-01", "NEYNA-230-02"]);
    expect(ledger!.get("NEYNA-230-02").dependsOn).toEqual(["NEYNA-230-01"]);
    expect(ledger!.get("NEYNA-230-02").planId).toBe("feature-memory-abc");
    expect(ledger!.get("NEYNA-230-02").status).toBe("draft");
    expect(ledger!.importSpec(input).importedIds).toEqual(result.importedIds);
  });

  it("blocks parent verification while any child is unverified", () => {
    create({ id: "NEYNA-240", allowedPaths: ["tests/contracts/**"] });
    create({ id: "NEYNA-241", parentId: "NEYNA-240" });
    ledger!.approve("NEYNA-240", "owner");
    const claim = ledger!.claim("NEYNA-240", "agent");
    save("tests/contracts/test.txt", "evidence");
    commit();
    ledger!.report("NEYNA-240", claim.leaseToken, { kind: "test", reference: "docs-ok" }, true);
    const result = ledger!.verify("NEYNA-240", claim.leaseToken);
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/Children/);
  });

  it("fails verification after out-of-scope changes even if local Git hook was bypassed", () => {
    create();
    ledger!.approve("NEYNA-200", "owner");
    const claim = ledger!.claim("NEYNA-200", "agent");
    save("apps/client/hijack.dart", "wrong scope");
    commit();
    ledger!.report("NEYNA-200", claim.leaseToken, { kind: "test", reference: "attempt" }, true);
    const result = ledger!.verify("NEYNA-200", claim.leaseToken);
    expect(result.passed).toBe(false);
    expect(result.denied).toContain("apps/client/hijack.dart");
  });

  it("refuses commits without an active lease and rejects staged paths outside scope", () => {
    create();
    ledger!.approve("NEYNA-200", "owner");
    expect(() => ledger!.checkStaged()).toThrow(/No active approved task lease/);
    ledger!.claim("NEYNA-200", "agent");
    save("apps/client/unauthorized.dart", "wrong");
    git("add", "apps/client/unauthorized.dart");
    expect(ledger!.checkStaged().passed).toBe(false);
    expect(ledger!.checkStaged().deniedFiles).toContain("apps/client/unauthorized.dart");
  });

  it("cannot mark a task verified without actual changes and actual gate success", () => {
    create();
    ledger!.approve("NEYNA-200", "owner");
    const claim = ledger!.claim("NEYNA-200", "agent");
    expect(() => ledger!.verify("NEYNA-200", claim.leaseToken)).toThrow(/Submit evidence/);
    save("tests/contracts/contract.go", "actual change");
    commit();
    ledger!.report("NEYNA-200", claim.leaseToken, { kind: "test", reference: "unit tests" }, true);
    const result = ledger!.verify("NEYNA-200", claim.leaseToken);
    expect(result.passed).toBe(true);
    expect(ledger!.get("NEYNA-200").status).toBe("verified");
    expect(ledger!.trace("NEYNA-200").evidence.length).toBe(1);
  });

  it("replays migration without duplicating tasks", () => {
    const count = ledger!.list().length;
    ledger!.close();
    ledger = new ProjectTaskLedger(root);
    expect(ledger!.list().length).toBe(count);
  });
});
