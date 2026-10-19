import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import http from "node:http";
import { ProjectTaskLedger, DevControlError } from "../task-ledger.js";
import { createDevControlBoardServer } from "../board-server.js";

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
    expect(ledger!.next().blocked).toContainEqual({
      id: "F2", blockedBy: ["F1"], unverifiedChildren: [],
    });
    expect(ledger!.trace("F0").audit.some((x: any) => x.event === "legacy_import")).toBe(true);
    expect(() => ledger!.claim("F2", "blocked")).toThrowError(DevControlError);
  });

  it("rejects newly generated progress Markdown even under a broadly allowed docs directory", () => {
    create({
      id: "NEYNA-280", allowedPaths: ["docs/engineering/**"],
    });
    ledger!.approve("NEYNA-280", "owner");
    const claim = ledger!.claim("NEYNA-280", "agent");
    save("docs/engineering/agent-daily-progress.md", "auto-generated status");
    git("add", "docs/engineering/agent-daily-progress.md");
    const scope = ledger!.checkStaged();
    expect(scope.passed).toBe(false);
    expect(scope.deniedFiles).toEqual([]);
    expect(scope.unapprovedDocs).toEqual(["docs/engineering/agent-daily-progress.md"]);
    // Even skipping the Hook must not allow automatic task verification.
    commit("bypass Git hook");
    ledger!.report("NEYNA-280", claim.leaseToken, {
      kind: "test", reference: "docs validation",
    }, true);
    ledger!.complete("NEYNA-280", claim.leaseToken, {
      summary: "Agent generated an unapproved progress file",
      implementation: "Created a process-only status Markdown rather than recording the result in SQLite.",
      verification: "Expect the scope and verification gates to reject the document addition.",
    });
    const result = ledger!.verify("NEYNA-280", claim.leaseToken);
    expect(result.passed).toBe(false);
    expect(result.unapprovedDocs).toEqual(["docs/engineering/agent-daily-progress.md"]);
  });

  it("allows explicitly approved durable docs and formal feature specifications", () => {
    create({
      id: "NEYNA-281",
      allowedPaths: ["docs/engineering/approved.md", "docs/specs/**"],
    });
    ledger!.approve("NEYNA-281", "owner");
    ledger!.claim("NEYNA-281", "agent");
    save("docs/engineering/approved.md", "authorized durable operating instructions");
    save("docs/specs/example/spec.md", "required specification");
    git("add", "docs/engineering/approved.md", "docs/specs/example/spec.md");
    expect(ledger!.checkStaged().passed).toBe(true);
    expect(ledger!.checkStaged().unapprovedDocs).toEqual([]);
  });

  it("blocks nonstandard process notes hidden in an approved Spec directory", () => {
    create({
      id: "NEYNA-282",
      allowedPaths: ["docs/specs/**"],
    });
    ledger!.approve("NEYNA-282", "owner");
    ledger!.claim("NEYNA-282", "agent");
    save("docs/specs/example/daily-handoff.md", "not an approved Spec");
    git("add", "docs/specs/example/daily-handoff.md");
    const result = ledger!.checkStaged();
    expect(result.passed).toBe(false);
    expect(result.unapprovedDocs).toEqual(["docs/specs/example/daily-handoff.md"]);
  });

  it("stores detailed completion as versioned SQLite records, not Markdown", () => {
    create();
    ledger!.approve("NEYNA-200", "owner");
    const claim = ledger!.claim("NEYNA-200", "agent");
    save("tests/contracts/implemented.json", "{}");
    commit("actual delivery");
    const report = {
      summary: "Text ingestion finished and reviewed",
      implementation: "Added idempotent event contract examples and a negative payload.",
      verification: "Ran test suite, all expected conditions passed.",
      remaining: "Future work: integrate Core database transactions.",
    };
    const first = ledger!.complete("NEYNA-200", claim.leaseToken, report);
    expect(first.revision).toBe(1);
    expect(() => ledger!.complete("NEYNA-200", "wrong", report)).toThrow(/lease/i);
    expect(() => ledger!.complete("NEYNA-200", claim.leaseToken, {
      ...report, summary: "",
    })).toThrow(/must be nonempty/);
    const second = ledger!.complete("NEYNA-200", claim.leaseToken, {
      ...report, summary: "Text ingestion finished after review update",
    });
    expect(second.revision).toBe(2);
    expect(ledger!.trace("NEYNA-200").completionHistory.length).toBe(2);
    expect(ledger!.trace("NEYNA-200").completion.summary).toBe(second.summary);
    expect(fs.existsSync(path.join(root, "docs/tasks/NEYNA-200.md"))).toBe(false);
    expect(ledger!.board().columns.inProgress.some((t: any) => t.id === "NEYNA-200")).toBe(true);
  });

  it("rejects stale completion notes when later commits change the code", () => {
    create();
    ledger!.approve("NEYNA-200", "owner");
    const claim = ledger!.claim("NEYNA-200", "agent");
    save("tests/contracts/one.json", "{}");
    commit("first delivery");
    ledger!.report("NEYNA-200", claim.leaseToken, { kind: "test", reference: "tested" }, true);
    ledger!.complete("NEYNA-200", claim.leaseToken, {
      summary: "Completed first scoped delivery",
      implementation: "Implemented one event contract in the test fixture.",
      verification: "Validated isolated test runner against the current Git HEAD.",
    });
    save("tests/contracts/two.json", "{}");
    commit("second delivery");
    const stale = ledger!.verify("NEYNA-200", claim.leaseToken);
    expect(stale.passed).toBe(false);
    expect(stale.reason).toMatch(/older Git commit/);
    expect(ledger!.get("NEYNA-200").status).toBe("in_review");
  });

  it("groups SQLite task statuses into exactly three Kanban columns", () => {
    create();
    ledger!.approve("NEYNA-200", "owner");
    ledger!.claim("NEYNA-200", "agent");
    const board = ledger!.board();
    expect(Object.keys(board.columns)).toEqual(["todo", "inProgress", "done"]);
    expect(board.columns.todo.some((row: any) => row.id === "F1")).toBe(true);
    expect(board.columns.inProgress.some((row: any) => row.id === "NEYNA-200")).toBe(true);
    expect(board.columns.done.some((row: any) => row.id === "F0")).toBe(true);
    expect(board.current).toBe("NEYNA-200");
    expect(board.columns.inProgress[0]).not.toHaveProperty("token");
    expect(board.counts.todo + board.counts.inProgress + board.counts.done).toBe(4);
  });

  it("serves a local read-only board with safe HTTP defaults", async () => {
    const server = createDevControlBoardServer(ledger!);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const bound = server.address();
      const base = "http://127.0.0.1:" + (bound && typeof bound === "object" ? bound.port : 0);
      const page = await fetch(base + "/");
      expect(page.status).toBe(200);
      expect(await page.text()).toContain("研发任务看板");
      expect(page.headers.get("content-security-policy")).toContain("script-src 'nonce-");
      const boardResponse = await fetch(base + "/api/board");
      expect(boardResponse.status).toBe(200);
      expect((await boardResponse.json()).columns.done[0].id).toBe("F0");
      const detailResponse = await fetch(base + "/api/tasks/F1");
      expect((await detailResponse.json()).task.id).toBe("F1");
      expect((await fetch(base + "/api/tasks/not-valid")).status).toBe(404);
      expect((await fetch(base + "/api/board", { method: "POST" })).status).toBe(405);
      const hostileHostStatus = await new Promise<number>((resolve, reject) => {
        const req = http.get(base + "/api/board", { headers: { Host: "evil.example:1234" } }, (res) => {
          res.resume();
          res.on("end", () => resolve(res.statusCode ?? 0));
        });
        req.on("error", reject);
      });
      expect(hostileHostStatus).toBe(403);
      expect((await fetch(base + "/api/missing")).status).toBe(404);
      expect(boardResponse.headers.get("access-control-allow-origin")).toBeNull();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
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
    expect(result.importedIds).toEqual(["NEYNA-230-FOUNDATION", "NEYNA-230-CLIENT"]);
    expect(ledger!.get("NEYNA-230-CLIENT").dependsOn).toEqual(["NEYNA-230-FOUNDATION"]);
    expect(ledger!.get("NEYNA-230-CLIENT").planId).toBe("feature-memory-abc");
    expect(ledger!.get("NEYNA-230-CLIENT").status).toBe("draft");
    expect(ledger!.importSpec(input).importedIds).toEqual(result.importedIds);
    // Reordering upstream parent-child specs must not rename project tasks.
    save(manifestPath, JSON.stringify({
      layout: "parent-child",
      subspecs: [
        { id: "client", title: "Client", fr: ["FR-002"], dependsOn: ["foundation"] },
        { id: "foundation", title: "Foundation", fr: ["FR-001"] },
      ],
    }));
    expect(ledger!.importSpec(input).importedIds).toEqual(["NEYNA-230-CLIENT", "NEYNA-230-FOUNDATION"]);
  });

  it("rolls back an import if a later child conflicts with an existing task", () => {
    create({ id: "NEYNA-250" });
    create({ id: "NEYNA-260-BETA", title: "Conflicting existing task" });
    const manifestPath = "docs/specs/cycle/spec-manifest.json";
    save(manifestPath, JSON.stringify({
      layout: "parent-child",
      subspecs: [
        { id: "alpha", title: "Alpha", fr: ["FR-001"] },
        { id: "beta", title: "Beta", fr: ["FR-002"], dependsOn: ["alpha"] },
      ],
    }));
    const original = ledger!.list().length;
    expect(() => ledger!.importSpec({
      manifestPath, parentTaskId: "NEYNA-250", idPrefix: "NEYNA-260",
      allowedPaths: ["tests/contracts/**"], requiredGates: ["docs"],
    })).toThrow(/conflict/i);
    expect(ledger!.list().length).toBe(original);
  });

  it("never recommends an unverified parent over its eligible child", () => {
    create({ id: "NEYNA-270", title: "Parent" });
    create({ id: "NEYNA-271", parentId: "NEYNA-270", title: "Child", dependsOn: ["F0"] });
    ledger!.approve("NEYNA-270", "owner");
    ledger!.approve("NEYNA-271", "owner");
    const next = ledger!.next();
    expect(next.blocked).toContainEqual({
      id: "NEYNA-270", blockedBy: [], unverifiedChildren: ["NEYNA-271"],
    });
    expect(next.nextTask.id).not.toBe("NEYNA-270");
  });

  it("respects an active lease in next, renews it and releases only an untouched task", () => {
    create();
    ledger!.approve("NEYNA-200", "owner");
    const claimed = ledger!.claim("NEYNA-200", "agent", 600);
    expect(ledger!.next().nextTask.id).toBe("NEYNA-200");
    const renewed = ledger!.renew("NEYNA-200", claimed.leaseToken, 1200);
    expect(renewed.baseHead).toBe(claimed.baseHead);
    expect(renewed.expiresAt).toBeGreaterThan(Date.now() + 1190_000);
    expect(() => ledger!.renew("NEYNA-200", "wrong-token")).toThrow(/token/i);
    const released = ledger!.release("NEYNA-200", claimed.leaseToken);
    expect(released.released).toBe(true);
    expect(ledger!.get("NEYNA-200").status).toBe("ready");
    expect(ledger!.next().activeLease).toBeNull();
  });

  it("expired task reclaim preserves the original Git baseline and verification includes older commits", () => {
    create();
    ledger!.approve("NEYNA-200", "owner");
    const original = ledger!.claim("NEYNA-200", "agent-a");
    save("tests/contracts/one.json", "{}");
    commit("first session work");
    const require = createRequire(import.meta.url);
    const { DatabaseSync } = require("node:sqlite") as any;
    // Simulate time passing in this isolated SQLite test fixture.
    ledger!.close();
    const db = new DatabaseSync(path.join(root, ".neyna/state/devcontrol.sqlite3"));
    db.prepare("UPDATE dc_leases SET expires_at=0 WHERE singleton=1").run();
    db.close();
    ledger = new ProjectTaskLedger(root);
    const reclaimed = ledger!.claim("NEYNA-200", "agent-b");
    expect(reclaimed.baseHead).toBe(original.baseHead);
    expect(reclaimed.leaseToken).not.toBe(original.leaseToken);
    save("tests/contracts/two.json", "{}");
    commit("second session work");
    ledger!.report("NEYNA-200", reclaimed.leaseToken, {
      kind: "test", reference: "real verified test command",
    }, true);
    ledger!.complete("NEYNA-200", reclaimed.leaseToken, {
      summary: "Completed both interrupted implementation steps",
      implementation: "Retained the earlier Git base and included both commits.",
      verification: "Confirmed the full scoped diff and successful validation.",
    });
    const verified = ledger!.verify("NEYNA-200", reclaimed.leaseToken);
    expect(verified.passed).toBe(true);
    expect(verified.files).toContain("tests/contracts/one.json");
    expect(verified.files).toContain("tests/contracts/two.json");
  });

  it("refuses to release a lease after real code changes would lose Git provenance", () => {
    create();
    ledger!.approve("NEYNA-200", "owner");
    const claim = ledger!.claim("NEYNA-200", "agent");
    save("tests/contracts/changed.json", "{}");
    commit("partial work");
    expect(() => ledger!.release("NEYNA-200", claim.leaseToken)).toThrow(/renew or reclaim/i);
  });

  it("fails closed if a validation gate changes working files during verification", () => {
    // Prepare a hostile gate before claim, so it does not count as an
    // out-of-scope change made during the claimed task.
    save("scripts/validate_docs.py",
      "from pathlib import Path\nPath('README.md').write_text('mutated by gate')\nprint('bad gate success')\n");
    commit("baseline hostile gate for fixture");
    create();
    ledger!.approve("NEYNA-200", "owner");
    const claim = ledger!.claim("NEYNA-200", "agent");
    save("tests/contracts/test.json", "{}");
    commit("task code");
    ledger!.report("NEYNA-200", claim.leaseToken, {
      kind: "test", reference: "run actual validation",
    }, true);
    ledger!.complete("NEYNA-200", claim.leaseToken, {
      summary: "Added a valid isolated test file",
      implementation: "Committed a contract test and isolated check commands.",
      verification: "Run actual docs acceptance while monitoring Git working state.",
    });
    // The 'docs' gate mutates README.md *during* verification.
    expect(() => ledger!.verify("NEYNA-200", claim.leaseToken)).toThrow(/Git changed after gates/);
    expect(ledger!.get("NEYNA-200").status).toBe("in_review");
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
    ledger!.complete("NEYNA-200", claim.leaseToken, {
      summary: "Attempted out-of-scope code change",
      implementation: "Changed a forbidden client-side path instead of the allowed test directory.",
      verification: "Expected DevControl to reject the committed diff even with a report.",
    });
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
    expect(ledger!.verify("NEYNA-200", claim.leaseToken)).toMatchObject({
      passed: false, reason: "Missing structured completion report",
    });
    ledger!.complete("NEYNA-200", claim.leaseToken, {
      summary: "Implemented minimal contract tests",
      implementation: "Added a new test contract fixture and verified its Git scope.",
      verification: "Ran Python docs acceptance gate against the committed revision.",
    });
    const result = ledger!.verify("NEYNA-200", claim.leaseToken);
    expect(result.passed).toBe(true);
    expect(ledger!.get("NEYNA-200").status).toBe("verified");
    expect(ledger!.trace("NEYNA-200").evidence.length).toBe(1);
    expect(ledger!.trace("NEYNA-200").completion.summary).toBe("Implemented minimal contract tests");
  });

  it("replays migration without duplicating tasks", () => {
    const count = ledger!.list().length;
    ledger!.close();
    ledger = new ProjectTaskLedger(root);
    expect(ledger!.list().length).toBe(count);
  });
});
