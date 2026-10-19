/**
 * Optional project-level work ledger. Deliberately separate from MCP protocol
 * Tasks (src/tasks) and feature Delegated Plans (src/plans).
 *
 * Requires Node 22+ for the built-in SQLite module. Normal probe-kit usage
 * continues to support Node 20; SQLite is loaded only when DevControl is used.
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { parseParentChildManifest } from "../lib/parent-child-spec.js";

type Value = string | number | null;
type Row = Record<string, any>;
interface SqlStmt {
  get(...args: Value[]): Row | undefined;
  all(...args: Value[]): Row[];
  run(...args: Value[]): { changes: number };
}
interface SqlDatabase {
  exec(query: string): void;
  prepare(query: string): SqlStmt;
  close(): void;
}

const idPattern = /^[A-Z][A-Z0-9-]{1,39}$/;
const allowedGates = new Set(["docs", "devcontrol_tests", "go_contract"]);
const utc = () => new Date().toISOString();

export class DevControlError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }

}

function fail(code: string, message: string): never {
  throw new DevControlError(code, message);
}

function run(root: string, command: string, args: string[], timeout = 90_000) {
  const result = spawnSync(command, args, {
    cwd: root, encoding: "utf8", timeout, maxBuffer: 4_000_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  return {
    passed: result.status === 0 && !result.error,
    exitCode: result.status,
    stdout: result.stdout?.slice(-3200) ?? "",
    stderr: result.stderr?.slice(-3200) ?? "",
    ...(result.error ? { error: result.error.message } : {}),
  };
}

function git(root: string, args: string[]): string {
  const result = run(root, "git", args, 12_000);
  if (!result.passed) fail("GIT_ERROR", result.stderr || result.error || "Git failed");
  return result.stdout.trim();
}

function changedFiles(root: string, base: string): string[] {
  const result = spawnSync(
    "git", ["diff", "--no-renames", "--name-only", "-z", "--diff-filter=ACMRTD", base, "HEAD"],
    { cwd: root, encoding: "buffer", timeout: 12_000 },
  );
  if (result.status !== 0 || !Buffer.isBuffer(result.stdout)) {
    fail("GIT_ERROR", "Cannot determine actual committed changes");
  }
  return [...new Set(result.stdout.toString("utf8").split("\0").filter(Boolean))].sort();
}

function safePaths(paths: string[]): string[] {
  if (!Array.isArray(paths) || !paths.length) fail("SCOPE_REQUIRED", "Task must declare at least one allowed path");
  for (const item of paths) {
    if (typeof item !== "string" || !item || item.startsWith("/") ||
        item.split("/").includes("..") || item.includes("\\")) {
      fail("INVALID_SCOPE", `Invalid scope: ${String(item)}`);
    }
  }
  return [...new Set(paths)];
}

function pathAllowed(file: string, pattern: string): boolean {
  if (pattern.endsWith("/**")) {
    return file.startsWith(pattern.slice(0, -3) + "/");
  }
  return file === pattern;
}

export interface CreateWorkItem {
  id: string;
  title: string;
  parentId?: string;
  dependsOn?: string[];
  allowedPaths: string[];
  requiredGates: string[];
  track?: string;
  release?: string;
  priority?: number;
  specId?: string;
  planId?: string;
}

export class ProjectTaskLedger {
  private readonly db: SqlDatabase;
  readonly root: string;
  readonly databasePath: string;

  constructor(root: string, dbPath?: string) {
    this.root = path.resolve(root);
    if (!fs.existsSync(path.join(this.root, ".git"))) {
      fail("NOT_GIT_PROJECT", "DevControl requires a Git project root");
    }
    this.databasePath = dbPath ?? path.join(this.root, ".neyna/state/devcontrol.sqlite3");
    fs.mkdirSync(path.dirname(this.databasePath), { recursive: true });
    if (Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10) < 22) {
      fail("NODE_22_REQUIRED", "DevControl SQLite requires Node 22+, while the rest of probe-kit supports Node 20+");
    }
    // createRequire avoids a hard Node22-only import at module evaluation time.
    const sqlite = createRequire(import.meta.url)("node:sqlite") as {
      DatabaseSync: new (filename: string) => SqlDatabase;
    };
    this.db = new sqlite.DatabaseSync(this.databasePath);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=8000;");
    this.migrate();
  }

  close(): void { this.db.close(); }

  private inTransaction<T>(action: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const output = action();
      this.db.exec("COMMIT");
      return output;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  private audit(taskId: string | null, event: string, actor: string, data: Row = {}): void {
    this.db.prepare(
      "INSERT INTO dc_audit (task_id,event,actor,details_json,created_at) VALUES (?,?,?,?,?)",
    ).run(taskId, event, actor, JSON.stringify(data), utc());
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS dc_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS dc_tasks (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, parent_id TEXT REFERENCES dc_tasks(id),
        track TEXT NOT NULL, release TEXT NOT NULL, priority INTEGER NOT NULL DEFAULT 50,
        status TEXT NOT NULL CHECK(status IN ('draft','ready','in_progress','in_review','verified','cancelled')),
        allowed_paths TEXT NOT NULL, required_gates TEXT NOT NULL,
        spec_id TEXT, plan_id TEXT, approved_by TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, verified_at TEXT
      );
      CREATE TABLE IF NOT EXISTS dc_dependencies (
        task_id TEXT NOT NULL REFERENCES dc_tasks(id),
        depends_on TEXT NOT NULL REFERENCES dc_tasks(id),
        PRIMARY KEY(task_id,depends_on), CHECK(task_id <> depends_on)
      );
      CREATE TABLE IF NOT EXISTS dc_leases (
        singleton INTEGER PRIMARY KEY CHECK(singleton=1),
        task_id TEXT NOT NULL REFERENCES dc_tasks(id), agent TEXT NOT NULL,
        token TEXT NOT NULL, base_head TEXT NOT NULL, expires_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS dc_evidence (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL REFERENCES dc_tasks(id), kind TEXT NOT NULL,
        reference TEXT NOT NULL, git_head TEXT, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS dc_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT, event TEXT NOT NULL, actor TEXT NOT NULL,
        details_json TEXT NOT NULL, created_at TEXT NOT NULL
      );
    `);
    const alreadyImported = this.db.prepare("SELECT value FROM dc_meta WHERE key='bootstrap'").get();
    if (alreadyImported) return;
    // Import from the previous Neyna Python experiment without deleting or
    // mutating any old tables, task state, audit or evidence.
    const oldPlanPath = path.join(this.root, ".neyna/devcontrol-plan.json");
    const oldPlan = fs.existsSync(oldPlanPath)
      ? JSON.parse(fs.readFileSync(oldPlanPath, "utf8")) as { tasks?: Row[] }
      : null;
    const tableExists = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='task_state'",
    ).get();
    this.inTransaction(() => {
      const imported = oldPlan?.tasks ?? [];
      // Two-pass insert ensures foreign-key-safe parent links once they are available.
      for (const task of imported) {
        const legacy = tableExists
          ? this.db.prepare("SELECT status,verified_at FROM task_state WHERE task_id=?").get(task.id)
          : undefined;
        const legacyStatus = legacy?.status ?? task.bootstrap?.status ?? "planned";
        const status = legacyStatus === "verified" ? "verified"
          : legacyStatus === "in_progress" ? "in_progress" : "ready";
        this.db.prepare(`
          INSERT INTO dc_tasks(id,title,track,release,priority,status,allowed_paths,required_gates,
                               created_at,updated_at,verified_at,approved_by)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
        `).run(task.id, task.title, task.track ?? "product", task.release ?? "V0.1",
          task.track === "governance" ? 90 : 50, status,
          JSON.stringify(task.allowed_paths), JSON.stringify(task.required_gates),
          utc(), utc(), legacy?.verified_at ?? (status === "verified" ? utc() : null), "legacy-import");
        this.audit(task.id, "legacy_import", "migration", {
          legacyStatus, legacyEvidence: task.bootstrap?.evidence ?? null,
        });
      }
      for (const task of imported) {
        for (const dep of task.depends_on ?? []) {
          this.db.prepare(
            "INSERT INTO dc_dependencies(task_id,depends_on) VALUES(?,?)",
          ).run(task.id, dep);
        }
      }
      const planHash = fs.existsSync(oldPlanPath)
        ? createHash("sha256").update(fs.readFileSync(oldPlanPath)).digest("hex") : "none";
      this.db.prepare("INSERT INTO dc_meta(key,value) VALUES('bootstrap',?)").run(
        JSON.stringify({ at: utc(), importedTasks: imported.length, planHash }),
      );
    });
  }

  private requireTask(id: string): Row {
    const row = this.db.prepare("SELECT * FROM dc_tasks WHERE id=?").get(id);
    if (!row) fail("TASK_NOT_FOUND", `Unknown project task: ${id}`);
    return row!;
  }

  checkStaged(): Row {
    const lease = this.db.prepare("SELECT * FROM dc_leases WHERE singleton=1").get();
    if (!lease || lease.expires_at <= Date.now()) {
      fail("LEASE_REQUIRED", "No active approved task lease; refusing Git commit");
    }
    const task = this.requireTask(lease.task_id);
    if (task.status !== "in_progress" && task.status !== "in_review") {
      fail("TASK_NOT_ACTIVE", "Only active work may be committed");
    }
    if (this.blockers(task.id).length) fail("TASK_BLOCKED", "A prerequisite is no longer verified");
    const result = spawnSync(
      "git", ["diff", "--cached", "--no-renames", "--name-only", "-z", "--diff-filter=ACMRTD"],
      { cwd: this.root, encoding: "buffer", timeout: 12_000 },
    );
    if (result.status !== 0 || !Buffer.isBuffer(result.stdout)) {
      fail("GIT_ERROR", "Cannot inspect staged files");
    }
    const files = [...new Set(result.stdout.toString("utf8").split("\0").filter(Boolean))].sort();
    const patterns = JSON.parse(task.allowed_paths) as string[];
    const denied = files.filter((file) => !patterns.some((pattern) => pathAllowed(file, pattern)));
    return { passed: denied.length === 0, taskId: task.id, stagedFiles: files, deniedFiles: denied };
  }

  private task(row: Row): Row {
    return {
      id: row.id, title: row.title, parentId: row.parent_id ?? null,
      track: row.track, release: row.release, priority: row.priority, status: row.status,
      allowedPaths: JSON.parse(row.allowed_paths), requiredGates: JSON.parse(row.required_gates),
      specId: row.spec_id, planId: row.plan_id, approvedBy: row.approved_by,
      dependsOn: this.db.prepare("SELECT depends_on FROM dc_dependencies WHERE task_id=?").all(row.id)
        .map((d) => d.depends_on),
      childIds: this.db.prepare("SELECT id FROM dc_tasks WHERE parent_id=?").all(row.id).map((c) => c.id),
      updatedAt: row.updated_at, verifiedAt: row.verified_at,
    };
  }

  get(id: string): Row { return this.task(this.requireTask(id)); }
  list(): Row[] {
    return this.db.prepare("SELECT * FROM dc_tasks ORDER BY priority ASC,id ASC").all().map((r) => this.task(r));
  }
  private blockers(taskId: string): string[] {
    return this.db.prepare(`
      SELECT d.depends_on FROM dc_dependencies d
      JOIN dc_tasks p ON d.depends_on=p.id
      WHERE d.task_id=? AND p.status!='verified'
    `).all(taskId).map((r) => r.depends_on);
  }
  next(): Row {
    const tasks = this.list();
    const active = this.db.prepare("SELECT task_id,agent,expires_at FROM dc_leases WHERE singleton=1").get();
    const ready = tasks.filter((t) =>
      (t.status === "ready" || t.status === "in_progress" || t.status === "in_review") &&
      this.blockers(t.id).length === 0,
    );
    const product = ready.find((t) => t.track === "product");
    return {
      projectRoot: this.root, nextTask: product ?? ready[0] ?? null,
      activeLease: active && active.expires_at > Date.now()
        ? { taskId: active.task_id, agent: active.agent, expiresAt: active.expires_at } : null,
      blocked: tasks.filter((t) => t.status !== "verified" && this.blockers(t.id).length)
        .map((t) => ({ id: t.id, blockedBy: this.blockers(t.id) })),
    };
  }

  create(input: CreateWorkItem, actor: string): Row {
    if (!idPattern.test(input.id)) fail("INVALID_ID", "Task ID must be an uppercase stable identifier");
    if (!input.title?.trim()) fail("TITLE_REQUIRED", "Task title is required");
    const allowedPaths = safePaths(input.allowedPaths);
    if (!Array.isArray(input.requiredGates) ||
        input.requiredGates.some((gate) => !allowedGates.has(gate))) {
      fail("UNKNOWN_GATE", "Use only approved fixed acceptance gates");
    }
    if (!input.requiredGates.length) fail("GATE_REQUIRED", "A task cannot be verified without gates");
    const dependsOn = [...new Set(input.dependsOn ?? [])];
    return this.inTransaction(() => {
      if (input.parentId) {
        const parent = this.requireTask(input.parentId);
        if (parent.status === "verified" || parent.status === "cancelled") {
          fail("PARENT_CLOSED", "Cannot add subtasks to a closed parent");
        }
      }
      for (const dep of dependsOn) {
        if (dep === input.id) fail("DEPENDENCY_CYCLE", "Task cannot depend on itself");
        this.requireTask(dep);
      }
      this.db.prepare(`
        INSERT INTO dc_tasks(id,title,parent_id,track,release,priority,status,
                             allowed_paths,required_gates,spec_id,plan_id,created_at,updated_at)
        VALUES(?,?,?,?,?,?,'draft',?,?,?,?,?,?)
      `).run(input.id, input.title.trim(), input.parentId ?? null,
        input.track ?? "product", input.release ?? "V0.1",
        input.priority ?? 50, JSON.stringify(allowedPaths), JSON.stringify(input.requiredGates),
        input.specId ?? null, input.planId ?? null, utc(), utc());
      for (const dep of dependsOn) {
        this.db.prepare("INSERT INTO dc_dependencies(task_id,depends_on) VALUES(?,?)").run(input.id, dep);
      }
      this.audit(input.id, "created_proposal", actor, {
        parentId: input.parentId ?? null, dependsOn, specId: input.specId, planId: input.planId,
      });
      return this.get(input.id);
    });
  }

  /**
   * Import mcp-probe-kit parent-child Spec suggestions as *draft* tasks.
   * The Spec owns the decomposition proposal; only DevControl may approve it
   * for execution. Stable IDs and dependencies survive restarts.
   */
  importSpec(input: {
    manifestPath: string; parentTaskId: string; idPrefix: string;
    allowedPaths: string[]; requiredGates: string[]; actor?: string;
    planId?: string;
  }): Row {
    const absolute = path.resolve(this.root, input.manifestPath);
    if (!absolute.startsWith(this.root + path.sep)) {
      fail("UNSAFE_MANIFEST_PATH", "Spec manifest must remain inside project root");
    }
    const manifest = parseParentChildManifest(fs.readFileSync(absolute, "utf8"));
    if (!manifest) fail("INVALID_MANIFEST", "Expected a valid parent-child spec-manifest.json");
    this.requireTask(input.parentTaskId);
    if (!idPattern.test(input.idPrefix)) fail("INVALID_ID", "Invalid stable task ID prefix");
    const identities = new Map(manifest.subspecs.map((subspec, index) => [
      subspec.id, `${input.idPrefix}-${String(index + 1).padStart(2, "0")}`,
    ]));
    for (const id of identities.values()) {
      if (!idPattern.test(id)) fail("INVALID_ID", `Imported task ID exceeds size limit: ${id}`);
    }
    safePaths(input.allowedPaths);
    if (!input.requiredGates?.length || input.requiredGates.some((gate) => !allowedGates.has(gate))) {
      fail("GATE_REQUIRED", "Provide preapproved nonempty gate list for imported subtasks");
    }
    const results: Row[] = [];
    for (const spec of manifest.subspecs) {
      const id = identities.get(spec.id)!;
      const existing = this.db.prepare("SELECT id,parent_id,spec_id FROM dc_tasks WHERE id=?").get(id);
      const specId = `${input.manifestPath}#${spec.id}`;
      if (existing) {
        if (existing.parent_id !== input.parentTaskId || existing.spec_id !== specId) {
          fail("IMPORT_CONFLICT", `Task ID conflict while importing ${id}`);
        }
        results.push(this.get(id));
      } else {
        results.push(this.create({
          id, title: spec.title, parentId: input.parentTaskId,
          allowedPaths: input.allowedPaths, requiredGates: input.requiredGates,
          specId, planId: input.planId,
        }, input.actor ?? "spec-import"));
      }
    }
    // Two phases allow forward references in the manifest's dependency graph.
    for (const spec of manifest.subspecs) {
      for (const dep of spec.dependsOn ?? []) {
        const taskId = identities.get(spec.id)!;
        if (this.requireTask(taskId).status !== "draft") {
          if (!this.db.prepare(
            "SELECT task_id FROM dc_dependencies WHERE task_id=? AND depends_on=?",
          ).get(taskId, identities.get(dep)!)) {
            fail("FROZEN_TASK", "Existing approved task dependency differs from manifest");
          }
          continue;
        }
        this.addDependency(taskId, identities.get(dep)!, input.actor ?? "spec-import");
      }
    }
    return {
      parentTaskId: input.parentTaskId, importedIds: [...identities.values()],
      status: "draft", tasks: results.map((r) => this.get(r.id)),
    };
  }

  addDependency(id: string, dependency: string, actor: string): Row {
    return this.inTransaction(() => {
      if (this.requireTask(id).status !== "draft") fail("FROZEN_TASK", "Dependencies change only before approval");
      this.requireTask(dependency);
      if (id === dependency) fail("DEPENDENCY_CYCLE", "Self dependency rejected");
      const traversed = new Set<string>();
      const visits = (target: string): boolean => {
        if (target === id) return true;
        if (traversed.has(target)) return false;
        traversed.add(target);
        return this.db.prepare("SELECT depends_on FROM dc_dependencies WHERE task_id=?").all(target)
          .some((r) => visits(r.depends_on));
      };
      if (visits(dependency)) fail("DEPENDENCY_CYCLE", "Dependency cycle detected");
      this.db.prepare("INSERT OR IGNORE INTO dc_dependencies(task_id,depends_on) VALUES(?,?)")
        .run(id, dependency);
      this.audit(id, "dependency_added", actor, { dependency });
      return this.get(id);
    });
  }

  approve(id: string, approvedBy: string): Row {
    if (!approvedBy?.trim()) fail("APPROVER_REQUIRED", "Human-approved identity required");
    return this.inTransaction(() => {
      const row = this.requireTask(id);
      if (row.status !== "draft") fail("TASK_FROZEN", "Only draft tasks may be approved");
      if (!JSON.parse(row.required_gates).length) fail("GATE_REQUIRED", "Acceptance gates must be defined");
      this.db.prepare(
        "UPDATE dc_tasks SET status='ready',approved_by=?,updated_at=? WHERE id=?",
      ).run(approvedBy, utc(), id);
      this.audit(id, "approved", approvedBy, {});
      return this.get(id);
    });
  }

  claim(id: string, agent: string, ttlSeconds = 1800): Row {
    if (!agent?.trim()) fail("AGENT_REQUIRED", "Agent identity required");
    if (ttlSeconds < 60 || ttlSeconds > 3600) fail("INVALID_TTL", "Lease must be 60–3600 seconds");
    const base = git(this.root, ["rev-parse", "HEAD"]);
    return this.inTransaction(() => {
      const task = this.requireTask(id);
      if (task.status !== "ready" && task.status !== "in_progress") {
        fail("TASK_NOT_READY", `Task ${id} is ${task.status}`);
      }
      if (this.blockers(id).length) fail("TASK_BLOCKED", `Task ${id} depends on ${this.blockers(id).join(", ")}`);
      const lease = this.db.prepare("SELECT * FROM dc_leases WHERE singleton=1").get();
      if (lease && lease.expires_at > Date.now()) {
        fail("LEASE_CONFLICT", `Task ${lease.task_id} is already claimed by ${lease.agent}`);
      }
      const token = randomUUID();
      this.db.prepare(`
        INSERT OR REPLACE INTO dc_leases(singleton,task_id,agent,token,base_head,expires_at)
        VALUES(1,?,?,?,?,?)
      `).run(id, agent.trim(), token, base, Date.now() + ttlSeconds * 1000);
      this.db.prepare(
        "UPDATE dc_tasks SET status='in_progress',updated_at=? WHERE id=?",
      ).run(utc(), id);
      this.audit(id, "claimed", agent, { base, ttlSeconds });
      return { task: this.get(id), leaseToken: token, baseHead: base };
    });
  }

  private requireLease(id: string, token: string): Row {
    const row = this.db.prepare("SELECT * FROM dc_leases WHERE singleton=1").get();
    if (!row || row.task_id !== id || row.token !== token || row.expires_at <= Date.now()) {
      fail("LEASE_REQUIRED", "Active task lease token required");
    }
    return row!;
  }

  report(id: string, token: string, evidence: { kind: string; reference: string }, readyForReview = false): Row {
    return this.inTransaction(() => {
      const lease = this.requireLease(id, token);
      const current = this.requireTask(id);
      if (current.status !== "in_progress") fail("INVALID_STATE", "Only an in-progress task can report");
      if (!evidence.kind?.trim() || !evidence.reference?.trim()) {
        fail("EVIDENCE_REQUIRED", "Evidence kind and reference required");
      }
      const head = git(this.root, ["rev-parse", "HEAD"]);
      this.db.prepare(
        "INSERT INTO dc_evidence(task_id,kind,reference,git_head,created_at) VALUES(?,?,?,?,?)",
      ).run(id, evidence.kind, evidence.reference, head, utc());
      if (readyForReview) {
        this.db.prepare(
          "UPDATE dc_tasks SET status='in_review',updated_at=? WHERE id=?",
        ).run(utc(), id);
      }
      this.audit(id, "evidence_reported", lease.agent, {
        kind: evidence.kind, reference: evidence.reference, readyForReview, gitHead: head,
      });
      return this.get(id);
    });
  }

  private gate(name: string): Row {
    if (name === "docs") return run(this.root, "python3", ["scripts/validate_docs.py"]);
    if (name === "devcontrol_tests") return run(
      this.root, "python3", ["-m", "unittest", "discover", "-s", "tests/devcontrol", "-p", "test_*.py", "-q"],
    );
    if (name === "go_contract") {
      const tests = path.join(this.root, "tests/contracts");
      if (!fs.existsSync(path.join(tests, "go.mod"))) {
        return { passed: false, error: "Go contract module not found" };
      }
      const testFiles = fs.readdirSync(tests).filter((file) => file.endsWith("_test.go"));
      if (!testFiles.length || !testFiles.some((file) =>
        /^func Test\w+\s*\(/m.test(fs.readFileSync(path.join(tests, file), "utf8")))) {
        return { passed: false, error: "No non-vacuous Go contract tests" };
      }
      return run(tests, "go", ["test", "./..."]);
    }
    return { passed: false, error: `Unknown gate ${name}` };
  }

  verify(id: string, token: string): Row {
    const lease = this.requireLease(id, token);
    const task = this.requireTask(id);
    if (task.status !== "in_review") fail("NOT_IN_REVIEW", "Submit evidence and request review first");
    const children = this.db.prepare("SELECT id FROM dc_tasks WHERE parent_id=? AND status!='verified'").all(id);
    if (children.length) {
      return { taskId: id, passed: false, reason: "Children not verified", childIds: children.map((r) => r.id) };
    }
    const evidence = this.db.prepare("SELECT id FROM dc_evidence WHERE task_id=?").all(id);
    if (!evidence.length) return { taskId: id, passed: false, reason: "Missing evidence" };
    const dirty = git(this.root, ["status", "--porcelain"]);
    if (dirty) return { taskId: id, passed: false, reason: "Git working tree must be clean" };
    const files = changedFiles(this.root, lease.base_head);
    const allowedPaths = JSON.parse(task.allowed_paths) as string[];
    const denied = files.filter((f) => !allowedPaths.some((p) => pathAllowed(f, p)));
    if (!files.length || denied.length) {
      return { taskId: id, passed: false, reason: !files.length ? "No committed task diff" : "Out-of-scope files", denied, files };
    }
    const gates = JSON.parse(task.required_gates) as string[];
    if (!gates.length) return { taskId: id, passed: false, reason: "Missing gate definition" };
    const results = Object.fromEntries(gates.map((name) => [name, this.gate(name)]));
    const passed = Object.values(results).every((r) => r.passed);
    this.inTransaction(() => {
      const current = this.requireLease(id, token);
      if (current.base_head !== lease.base_head) fail("LEASE_CHANGED", "Lease changed during validation");
      this.audit(id, passed ? "verified" : "verify_failed", "devcontrol", {
        revision: git(this.root, ["rev-parse", "HEAD"]), files, results,
      });
      if (passed) {
        this.db.prepare(
          "UPDATE dc_tasks SET status='verified',verified_at=?,updated_at=? WHERE id=?",
        ).run(utc(), utc(), id);
        this.db.prepare("DELETE FROM dc_leases WHERE singleton=1").run();
      }
    });
    return { taskId: id, passed, files, results };
  }

  trace(id: string): Row {
    this.requireTask(id);
    return {
      task: this.get(id),
      evidence: this.db.prepare("SELECT * FROM dc_evidence WHERE task_id=? ORDER BY id").all(id),
      audit: this.db.prepare("SELECT * FROM dc_audit WHERE task_id=? ORDER BY id").all(id)
        .map((r) => ({ ...r, details: JSON.parse(r.details_json), details_json: undefined })),
    };
  }
}
