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
import { ensureDatabaseIgnored, resolveProjectDatabase } from "./project-storage.js";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { parseParentChildManifest } from "../lib/parent-child-spec.js";
import { reviewReleasePlan, type ReleasePlanProposal, type ReleasePlanNode } from "./release-plan.js";

type Value = string | number | null;
type Row = Record<string, any>;
interface SqlStmt {
  get(...args: Value[]): Row | undefined;
  all(...args: Value[]): Row[];
  run(...args: Value[]): { changes: number };
}

// Session memory has its own History Session subsystem. This table must not
// masquerade as the global Qdrant memory asset system or the session archive.
type WorkItemKind = "bug" | "architecture_change";

export interface ProjectWorkItemInput {
  kind: WorkItemKind;
  title: string;
  description: string;
  featureName?: string;
  topLevelDocument?: string;
  sourceRef?: string;
}

function normalizedLabel(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en")
    .replace(/[\s\p{P}\p{S}]+/gu, "").trim();
}

function actorInfo(projectRoot: string): { creator: string; device: string } {
  // Display labels are deliberately local, never transmitted to any service.
  // Do not store user home directory, IP, MAC address or machine UUID.
  let creator = process.env.DEVCONTROL_ACTOR?.trim() || "";
  if (!creator) {
    const result = spawnSync("git", ["config", "user.name"], {
      cwd: projectRoot, encoding: "utf8", timeout: 2_000,
    });
    creator = result.status === 0 ? (result.stdout || "").trim() : "";
  }
  return { creator: creator.slice(0, 120) || "local-developer",
    device: (process.env.DEVCONTROL_DEVICE_NAME?.trim() || os.hostname()).slice(0, 120) };
}
interface SqlDatabase {
  exec(query: string): void;
  prepare(query: string): SqlStmt;
  close(): void;
}

function addedFiles(root: string, base: string): string[] {
  const result = spawnSync(
    "git", ["diff", "--no-renames", "--name-only", "-z", "--diff-filter=A", base, "HEAD"],
    { cwd: root, encoding: "buffer", timeout: 12_000 },
  );
  if (result.status !== 0 || !Buffer.isBuffer(result.stdout)) {
    fail("GIT_ERROR", "Cannot determine newly added files");
  }
  return result.stdout.toString("utf8").split("\0").filter(Boolean);
}

/** Creation of any noncanonical Markdown document needs exact approved path. */
function undocumentedMarkdown(additions: string[], allowedPaths: string[]): string[] {
  return additions.filter((file) => {
    if (!file.toLowerCase().endsWith(".md") || allowedPaths.includes(file)) return false;
    // Existing feature-spec convention: only these four files may be created
    // by a scoped feature workflow without individually naming each file.
    const canonical = /^docs\/specs\/[^/]+\/(spec|design|test-plan|evidence)\.md$/i.test(file);
    return !canonical || !allowedPaths.some((pattern) => pathAllowed(file, pattern));
  });
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

/** One structured completion report lives in SQLite, not in new Markdown files. */
export interface CompletionReport {
  summary: string;
  implementation: string;
  verification: string;
  remaining?: string;
}

export interface FeatureProposal {
  name: string;
  description: string;
  layout: "flat" | "parent-child";
  plan: Record<string, unknown>;
  draft: Record<string, unknown> | null;
  /** Requirements clarification can precede a complete decomposition. */
  status?: "needs_decomposition" | "draft";
}

export class ProjectTaskLedger {
  private readonly db: SqlDatabase;
  private transactionDepth = 0;
  readonly root: string;
  readonly databasePath: string;

  constructor(root: string, dbPath?: string) {
    this.root = path.resolve(root);
    if (!fs.existsSync(path.join(this.root, ".git"))) {
      fail("NOT_GIT_PROJECT", "DevControl requires a Git project root");
    }
    this.databasePath = dbPath ?? resolveProjectDatabase(this.root);
    ensureDatabaseIgnored(this.root, this.databasePath);
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

  hasReviewedProductPlan(): boolean {
    const releases = [...new Set(this.db.prepare(
      "SELECT release FROM dc_tasks WHERE track='product' AND status!='cancelled'",
    ).all().map(row=>String(row.release)))];
    return releases.length > 0 && releases.every(release=>{
      const item = this.releasePlan(release);
      return item.revision > 0 && item.sourceDrift === false;
    });
  }

  private planSourceUnchanged(plan: ReleasePlanProposal & { sourceHash?: string }): boolean {
    if (!plan.sourceHash) return false;
    try {
      const file = path.resolve(this.root, plan.scopeSource);
      const realRoot = fs.realpathSync(this.root);
      const realFile = fs.realpathSync(file);
      const relative = path.relative(realRoot, realFile);
      if (!relative || relative === ".." || relative.startsWith(".." + path.sep) ||
          path.isAbsolute(relative)) return false;
      return createHash("sha256").update(fs.readFileSync(realFile))
        .digest("hex") === plan.sourceHash;
    } catch { return false; }
  }

  private inTransaction<T>(action: () => T): T {
    const level = this.transactionDepth;
    const savepoint = `devcontrol_nested_${level}`;
    this.db.exec(level === 0 ? "BEGIN IMMEDIATE" : `SAVEPOINT ${savepoint}`);
    this.transactionDepth++;
    try {
      const output = action();
      this.db.exec(level === 0 ? "COMMIT" : `RELEASE SAVEPOINT ${savepoint}`);
      return output;
    } catch (error) {
      if (level === 0) {
        this.db.exec("ROLLBACK");
      } else {
        this.db.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        this.db.exec(`RELEASE SAVEPOINT ${savepoint}`);
      }
      throw error;
    } finally {
      this.transactionDepth--;
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
      CREATE TABLE IF NOT EXISTS dc_release_plans (
        release TEXT PRIMARY KEY,
        revision INTEGER NOT NULL,
        hash TEXT NOT NULL,
        snapshot_json TEXT NOT NULL,
        approved_by TEXT NOT NULL,
        approved_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS dc_release_proposals (
        release TEXT PRIMARY KEY,
        base_revision INTEGER NOT NULL,
        hash TEXT NOT NULL,
        snapshot_json TEXT NOT NULL,
        proposed_by TEXT NOT NULL,
        proposed_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS dc_release_plan_revisions (
        release TEXT NOT NULL,
        revision INTEGER NOT NULL,
        hash TEXT NOT NULL,
        snapshot_json TEXT NOT NULL,
        approved_by TEXT NOT NULL,
        approved_at TEXT NOT NULL,
        PRIMARY KEY(release,revision)
      );
      CREATE TABLE IF NOT EXISTS dc_task_specs (
        task_id TEXT PRIMARY KEY REFERENCES dc_tasks(id),
        requirement_ids_json TEXT NOT NULL,
        acceptance TEXT NOT NULL,
        design_ref TEXT NOT NULL DEFAULT '',
        positive_tests_json TEXT NOT NULL DEFAULT '[]',
        negative_cases_json TEXT NOT NULL,
        out_of_scope_json TEXT NOT NULL DEFAULT '[]',
        deliverables_json TEXT NOT NULL,
        estimated_hours REAL,
        plan_revision INTEGER NOT NULL
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
      CREATE TABLE IF NOT EXISTS dc_completion_notes (
        task_id TEXT NOT NULL REFERENCES dc_tasks(id),
        revision INTEGER NOT NULL,
        summary TEXT NOT NULL,
        implementation TEXT NOT NULL,
        verification TEXT NOT NULL,
        remaining TEXT NOT NULL DEFAULT '',
        git_head TEXT NOT NULL,
        agent TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(task_id, revision)
      );
      CREATE TABLE IF NOT EXISTS dc_features (
        name TEXT PRIMARY KEY,
        description TEXT NOT NULL,
        layout TEXT NOT NULL CHECK(layout IN ('flat','parent-child')),
        status TEXT NOT NULL CHECK(status IN ('needs_decomposition','draft','specified')),
        plan_json TEXT NOT NULL,
        draft_json TEXT NOT NULL,
        sections_json TEXT NOT NULL,
        fingerprint TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS dc_feature_revisions (
        name TEXT NOT NULL REFERENCES dc_features(name),
        revision INTEGER NOT NULL,
        snapshot_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(name,revision)
      );
      CREATE TABLE IF NOT EXISTS dc_work_items (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL CHECK(kind IN ('bug','architecture_change')),
        title TEXT NOT NULL,
        normalized_title TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        feature_name TEXT,
        top_level_document TEXT,
        source_ref TEXT,
        creator TEXT NOT NULL,
        device TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(kind,normalized_title)
      );
      CREATE TABLE IF NOT EXISTS dc_work_item_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id TEXT NOT NULL REFERENCES dc_work_items(id),
        event TEXT NOT NULL,
        details_json TEXT NOT NULL,
        created_at TEXT NOT NULL
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
      const initialTracked = run(this.root,"git",["ls-files","--cached"],12_000);
      const tracked = initialTracked.passed ? initialTracked.stdout.split("\n") : [];
      const existingTrackedCode = tracked.some(p =>
          /^(?:src|app|apps|lib|services|packages|tests|cmd)\//.test(p));
      const existingDocumentedBaseline = [
        ["docs/product/vision.md","docs/project-context.md"],
        ["docs/CONSTITUTION.md","docs/constitution.md"],
        ["docs/product/requirements.md","docs/requirements.md"],
        ["docs/architecture/overview.md","docs/architecture.md"],
      ].every(candidates=>candidates.some(file=>tracked.includes(file)));
      this.db.prepare("INSERT INTO dc_meta(key,value) VALUES('bootstrap',?)").run(
        JSON.stringify({ at: utc(), importedTasks: imported.length,
          existingTrackedCode, existingDocumentedBaseline, planHash }),
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
    const created = spawnSync(
      "git", ["diff", "--cached", "--no-renames", "--name-only", "-z", "--diff-filter=A"],
      { cwd: this.root, encoding: "buffer", timeout: 12_000 },
    );
    if (created.status !== 0 || !Buffer.isBuffer(created.stdout)) {
      fail("GIT_ERROR", "Cannot inspect new Markdown documents");
    }
    const newFiles = created.stdout.toString("utf8").split("\0").filter(Boolean);
    const unapprovedDocs = undocumentedMarkdown(newFiles, patterns);
    return {
      passed: denied.length === 0 && unapprovedDocs.length === 0,
      taskId: task.id, stagedFiles: files, deniedFiles: denied,
      unapprovedDocs,
    };
  }

  private task(row: Row): Row {
    const detail = this.db.prepare("SELECT * FROM dc_task_specs WHERE task_id=?").get(row.id);
    return {
      id: row.id, title: row.title, parentId: row.parent_id ?? null,
      track: row.track, release: row.release, priority: row.priority, status: row.status,
      allowedPaths: JSON.parse(row.allowed_paths), requiredGates: JSON.parse(row.required_gates),
      specId: row.spec_id, planId: row.plan_id, approvedBy: row.approved_by,
      dependsOn: this.db.prepare("SELECT depends_on FROM dc_dependencies WHERE task_id=?").all(row.id)
        .map((d) => d.depends_on),
      childIds: this.db.prepare("SELECT id FROM dc_tasks WHERE parent_id=?").all(row.id).map((c) => c.id),
      updatedAt: row.updated_at, verifiedAt: row.verified_at,
      spec: detail ? {
        requirementIds: JSON.parse(detail.requirement_ids_json),
        acceptance: detail.acceptance,
        designRef: detail.design_ref,
        testCases: JSON.parse(detail.positive_tests_json),
        negativeCases: JSON.parse(detail.negative_cases_json),
        outOfScope: JSON.parse(detail.out_of_scope_json),
        deliverables: JSON.parse(detail.deliverables_json),
        estimatedHours: detail.estimated_hours, planRevision: detail.plan_revision,
      } : null,
    };
  }

  get(id: string): Row { return this.task(this.requireTask(id)); }

  releasePlan(release: string): Row {
    const frozen = this.db.prepare("SELECT * FROM dc_release_plans WHERE release=?").get(release);
    const proposal = this.db.prepare("SELECT * FROM dc_release_proposals WHERE release=?").get(release);
    const frozenSnapshot = frozen ? JSON.parse(frozen.snapshot_json) as ReleasePlanProposal & {
      sourceHash?: string;
    } : null;
    return {
      release, status: proposal ? "review_pending" : frozen ? "frozen" : "missing",
      revision: frozen?.revision ?? 0,
      approvedBy: frozen?.approved_by ?? null,
      frozenHash: frozen?.hash ?? null,
      frozen: frozenSnapshot,
      sourceDrift: frozenSnapshot ? !this.planSourceUnchanged(frozenSnapshot) : false,
      history: this.db.prepare(
        "SELECT revision,hash,approved_by,approved_at FROM dc_release_plan_revisions WHERE release=? ORDER BY revision",
      ).all(release).map(row=>({
        revision:row.revision,hash:row.hash,
        approvedBy:row.approved_by,approvedAt:row.approved_at,
      })),
      proposal: proposal ? {
        ...JSON.parse(proposal.snapshot_json),
        hash: proposal.hash, proposedBy: proposal.proposed_by,
      } : null,
    };
  }

  /** Proposal only: never silently creates executable tasks. */
  proposeReleasePlan(input: ReleasePlanProposal, actor: string): Row {
    if (typeof actor !== "string" || !actor.trim()) fail("ACTOR_REQUIRED", "Actor required");
    const review = reviewReleasePlan(input);
    if (!review.passed) fail("INCOMPLETE_PLAN", review.issues.join("; "));
    const sourcePath = path.resolve(this.root, input.scopeSource);
    const parent = fs.realpathSync(this.root);
    const real = fs.realpathSync(sourcePath);
    const relative = path.relative(parent, real);
    if (!relative || relative.startsWith(".." + path.sep) ||
        relative === ".." || path.isAbsolute(relative)) {
      fail("UNSAFE_SCOPE", "Scope document must be inside this Git project");
    }
    const sourceText = fs.readFileSync(real, "utf8");
    // Scope must be an actual committed Git source, not a transient local
    // rewrite presented to the reviewer as the approved baseline.
    if (!run(this.root,"git",["ls-files","--error-unmatch","--",input.scopeSource],12_000).passed ||
        !run(this.root,"git",["diff","--quiet","HEAD","--",input.scopeSource],12_000).passed) {
      fail("UNCOMMITTED_SCOPE", "Commit the canonical requirements source before plan review");
    }
    for (const id of input.requirementIds) {
      if (!new RegExp(`\\b${id}\\b`).test(sourceText)) {
        fail("UNKNOWN_REQUIREMENT", `${id} not present in actual ${input.scopeSource}`);
      }
    }
    const sourceHash = createHash("sha256").update(sourceText).digest("hex");
    for (const node of input.nodes) {
      if (node.existing) {
        const prior = this.db.prepare("SELECT status,approved_by,release FROM dc_tasks WHERE id=?").get(node.id);
        if (!prior || prior.release !== input.release || prior.status === "draft" ||
            prior.status === "cancelled" || !String(prior.approved_by ?? "").trim()) {
          fail("INVALID_LEGACY_REFERENCE",
            `Task ${node.id} cannot bypass detailed Spec validation as an unapproved legacy entry`);
        }
      }
      if (node.kind !== "leaf" || node.existing) continue;
      const reference = node.designRef ?? "";
      if (reference.startsWith("feature:")) {
        const name = reference.slice("feature:".length).replace(/#design$/, "");
        const row = this.db.prepare("SELECT status FROM dc_features WHERE name=?").get(name);
        if (!reference.endsWith("#design") || row?.status !== "specified") {
          fail("UNREVIEWED_DESIGN", `Design reference ${reference} has no validated SQLite Feature`);
        }
        continue;
      }
      const designFile = reference.split("#")[0];
      const candidate = path.resolve(this.root,designFile);
      const resolved = fs.existsSync(candidate) ? fs.realpathSync(candidate) : "";
      const within = resolved && path.relative(parent,resolved);
      if (!designFile.startsWith("docs/") ||
          designFile.split("/").includes("..") ||
          !within || within === ".." || within.startsWith(".." + path.sep) ||
          path.isAbsolute(within) || !fs.statSync(resolved).isFile() ||
          !run(this.root,"git",["ls-files","--error-unmatch","--",designFile],12_000).passed ||
          !run(this.root,"git",["diff","--quiet","HEAD","--",designFile],12_000).passed) {
        fail("MISSING_DESIGN_SOURCE", `Design reference not found in tracked project docs: ${reference}`);
      }
    }
    const snapshot = JSON.stringify({ ...input, sourceHash });
    const hash = createHash("sha256").update(snapshot).digest("hex");
    return this.inTransaction(() => {
      const current = this.db.prepare("SELECT * FROM dc_release_plans WHERE release=?").get(input.release);
      const missingExisting = this.db.prepare(
        "SELECT id FROM dc_tasks WHERE release=? AND track='product' AND status!='cancelled'",
      ).all(input.release).map(row => String(row.id)).filter(id =>
        !input.nodes.some(node => node.id === id));
      if (missingExisting.length) {
        fail("INCOMPLETE_BASELINE", "Include every existing product task in the full release tree: "+
          missingExisting.join(", "));
      }
      const revision = current?.revision ?? 0;
      if (input.baseRevision !== revision) fail("STALE_PLAN", "The approved release plan revision changed");
      if (current) {
        // Existing scope is immutable. Amendments can only append leaf tasks,
        // retaining every prior node with identical definitions and IDs.
        const previous = JSON.parse(current.snapshot_json) as ReleasePlanProposal;
        if (input.scopeSource !== previous.scopeSource ||
            previous.requirementIds.some(id => !input.requirementIds.includes(id))) {
          fail("SCOPE_CHANGE_REVIEW_REQUIRED",
            "Cannot silently remove approved requirements or substitute the scope source");
        }
        const byId = new Map(input.nodes.map(node => [node.id, node]));
        for (const node of previous.nodes) {
          if (JSON.stringify(byId.get(node.id)) !== JSON.stringify(node)) {
            fail("SCOPE_CHANGE_REVIEW_REQUIRED",
              `Existing ${node.id} definition changed; submit a separate scope-changing decision`);
          }
        }
        if (input.nodes.length <= previous.nodes.length) {
          fail("NO_ADDITIONS", "Approved plan unchanged; no new tasks to add");
        }
        for (const node of input.nodes) {
          const old = previous.nodes.find(t => t.id === node.id);
          if (!old && node.existing) fail("UNREVIEWED_EXISTING", "Cannot mark newly introduced task as legacy");
        }
      }
      const existing = this.db.prepare("SELECT * FROM dc_release_proposals WHERE release=?").get(input.release);
      if (existing && existing.hash !== hash) {
        fail("PROPOSAL_PENDING", "An earlier proposal must be reviewed before replacement");
      }
      this.db.prepare(`INSERT INTO dc_release_proposals
        (release,base_revision,hash,snapshot_json,proposed_by,proposed_at)
        VALUES(?,?,?,?,?,?)
        ON CONFLICT(release) DO UPDATE SET
          base_revision=excluded.base_revision,hash=excluded.hash,
          snapshot_json=excluded.snapshot_json,proposed_by=excluded.proposed_by,
          proposed_at=excluded.proposed_at`
      ).run(input.release,input.baseRevision,hash,snapshot,actor.trim(),utc());
      this.audit(null, "release_plan_proposed", actor, {
        release: input.release, revision: revision + 1, hash,
        requirementCount: input.requirementIds.length, taskCount: input.nodes.length,
      });
      return { release: input.release, review, hash, nextRevision: revision + 1,
        status: "review_pending" };
    });
  }

  /** Owner-acknowledged atomic import; never overwrite verified legacy tasks. */
  approveReleasePlan(release: string, approvedBy: string, expectedHash: string): Row {
    if (!approvedBy?.trim() || !/^[a-f0-9]{64}$/.test(expectedHash)) {
      fail("PLAN_APPROVAL_REQUIRED", "Approver and exact reviewed proposal hash required");
    }
    return this.inTransaction(() => {
      const pending = this.db.prepare("SELECT * FROM dc_release_proposals WHERE release=?").get(release);
      if (!pending || pending.hash !== expectedHash) {
        fail("PLAN_REVIEW_MISMATCH", "No matching proposed version is awaiting review");
      }
      const active = this.db.prepare("SELECT task_id FROM dc_leases WHERE singleton=1").get();
      if (active) fail("ACTIVE_TASK", "Wait for the active lease before freezing the plan");
      const plan = JSON.parse(pending.snapshot_json) as ReleasePlanProposal;
      const source = path.resolve(this.root,plan.scopeSource);
      const sourceHash = createHash("sha256").update(fs.readFileSync(source)).digest("hex");
      if (sourceHash !== (plan as ReleasePlanProposal & { sourceHash:string }).sourceHash ||
          !run(this.root,"git",["diff","--quiet","HEAD","--",plan.scopeSource],12_000).passed) {
        fail("SCOPE_DRIFT", "Reviewed requirements changed since proposal; re-review before approval");
      }
      const result = reviewReleasePlan(plan);
      if (!result.passed) fail("INCOMPLETE_PLAN", result.issues.join("; "));
      const current = this.db.prepare("SELECT revision FROM dc_release_plans WHERE release=?").get(release);
      if ((current?.revision ?? 0) !== pending.base_revision) fail("STALE_PLAN", "Old plan revision");
      const revision = Number(pending.base_revision) + 1;
      // Parent-first creation. Newly approved tasks receive stable IDs,
      // typed leaf Specs and constraints in ONE SQLite transaction.
      const nodes = [...plan.nodes];
      const old = new Set(this.db.prepare("SELECT id FROM dc_tasks").all().map(row => String(row.id)));
      const added: string[] = [];
      while (nodes.length) {
        let progress = false;
        for (let index = 0; index < nodes.length; index++) {
          const item = nodes[index];
          if (item.parentId && !old.has(item.parentId)) continue;
          const prior = this.db.prepare("SELECT * FROM dc_tasks WHERE id=?").get(item.id);
          if (prior) {
            if (!item.existing && !current) fail("TASK_ID_CONFLICT", `Existing task ${item.id} not declared legacy`);
            if (prior.release !== release || prior.track !== "product" ||
                prior.title !== item.title || (prior.parent_id ?? null) !== (item.parentId ?? null)) {
              fail("TASK_ID_CONFLICT", `Task ${item.id} has a different release or parent`);
            }
            if (item.kind === "group" && prior.status === "verified") {
              const newlyIncomplete = plan.nodes.filter(child=>child.parentId === item.id)
                .some(child => this.db.prepare(
                  "SELECT status FROM dc_tasks WHERE id=?",
                ).get(child.id)?.status !== "verified");
              if (newlyIncomplete) fail("VERIFIED_PARENT_FROZEN",
                `Cannot attach unverified work under verified historical task ${item.id}; preserve the original delivery evidence`);
            }
          } else {
            if (item.existing) fail("TASK_NOT_FOUND", `Referenced legacy task ${item.id} missing`);
            const created = this.create({
              id:item.id, title:item.title, parentId:item.parentId,
              allowedPaths:item.allowedPaths ?? ["docs/**"],
              requiredGates:item.requiredGates ?? ["docs"],
              track:"product", release,
              specId:plan.scopeSource+"#"+item.id,
              planId:`release:${release}:v${revision}`,
            }, "release-plan:" + approvedBy);
            if (created.status !== "draft") fail("PLAN_IMPORT_FAILED", "Expected draft task");
            this.db.prepare(
              "UPDATE dc_tasks SET status='ready',approved_by=?,updated_at=? WHERE id=?",
            ).run(approvedBy.trim(),utc(),item.id);
            this.audit(item.id,"approved_by_release_plan",approvedBy,{release,revision});
            added.push(item.id);
          }
          if (item.kind === "leaf") {
            this.db.prepare(`INSERT INTO dc_task_specs
              (task_id,requirement_ids_json,acceptance,design_ref,
               positive_tests_json,negative_cases_json,out_of_scope_json,
               deliverables_json,estimated_hours,plan_revision)
              VALUES(?,?,?,?,?,?,?,?,?,?)
              ON CONFLICT(task_id) DO NOTHING`
            ).run(item.id,JSON.stringify(item.requirementIds ?? []),
              item.acceptance ?? "",item.designRef ?? "",
              JSON.stringify(item.testCases ?? []),JSON.stringify(item.negativeCases ?? []),
              JSON.stringify(item.outOfScope ?? []),JSON.stringify(item.deliverables ?? []),
              item.estimatedHours ?? null,revision);
          }
          old.add(item.id);
          nodes.splice(index,1);index--;progress = true;
        }
        if (!progress) fail("PARENT_CYCLE", "Cannot create plan: unresolved parent tree");
      }
      // Dependencies are inserted after all nodes, allowing forward references.
      for (const item of plan.nodes) for (const dep of item.dependsOn ?? []) {
        const prior = this.db.prepare(
          "SELECT depends_on FROM dc_dependencies WHERE task_id=? AND depends_on=?",
        ).get(item.id,dep);
        if (!prior) {
          if (item.existing) fail("EXISTING_TASK_FROZEN", `Unreviewed dependency change on ${item.id}`);
          this.db.prepare("INSERT INTO dc_dependencies(task_id,depends_on) VALUES(?,?)").run(item.id,dep);
        }
      }
      this.db.prepare(`INSERT INTO dc_release_plans
        (release,revision,hash,snapshot_json,approved_by,approved_at)
        VALUES(?,?,?,?,?,?)
        ON CONFLICT(release) DO UPDATE SET
          revision=excluded.revision,hash=excluded.hash,
          snapshot_json=excluded.snapshot_json,approved_by=excluded.approved_by,
          approved_at=excluded.approved_at`
      ).run(release,revision,pending.hash,pending.snapshot_json,approvedBy.trim(),utc());
      this.db.prepare(`INSERT INTO dc_release_plan_revisions
        (release,revision,hash,snapshot_json,approved_by,approved_at)
        VALUES(?,?,?,?,?,?)`
      ).run(release,revision,pending.hash,pending.snapshot_json,approvedBy.trim(),utc());
      this.db.prepare("DELETE FROM dc_release_proposals WHERE release=?").run(release);
      this.audit(null,"release_plan_approved",approvedBy,{
        release,revision,hash:pending.hash,added,
      });
      return {release,revision,hash:pending.hash,added,status:"frozen",review:result};
    });
  }
  list(): Row[] {
    return this.db.prepare("SELECT * FROM dc_tasks ORDER BY priority ASC,id ASC").all().map((r) => this.task(r));
  }

  private feature(row: Row): Row {
    return {
      name: row.name, description: row.description, layout: row.layout,
      status: row.status, plan: JSON.parse(row.plan_json),
      draft: JSON.parse(row.draft_json), sections: JSON.parse(row.sections_json),
      revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }

  listFeatures(): Row[] {
    return this.db.prepare("SELECT * FROM dc_features ORDER BY updated_at DESC,name").all()
      .map((row) => ({
        name: row.name, description: row.description, layout: row.layout,
        status: row.status, revision: row.revision, updatedAt: row.updated_at,
      }));
  }

  getFeature(name: string): Row {
    const found = this.db.prepare("SELECT * FROM dc_features WHERE name=?").get(name);
    if (!found) fail("FEATURE_NOT_FOUND", `Unknown project feature: ${name}`);
    return this.feature(found!);
  }

  listWorkItems(kind?: WorkItemKind): Row[] {
    const rows = kind
      ? this.db.prepare("SELECT * FROM dc_work_items WHERE kind=? ORDER BY updated_at DESC").all(kind)
      : this.db.prepare("SELECT * FROM dc_work_items ORDER BY updated_at DESC").all();
    return rows.map((row) => ({
      id: row.id, kind: row.kind, title: row.title, description: row.description,
      status: row.status, featureName: row.feature_name ?? null,
      topLevelDocument: row.top_level_document ?? null,
      sourceRef: row.source_ref ?? null, creator: row.creator, device: row.device,
      createdAt: row.created_at, updatedAt: row.updated_at,
    }));
  }

  recordWorkItem(input: ProjectWorkItemInput): Row {
    if (!input || !["bug", "architecture_change"].includes(input.kind)) {
      fail("INVALID_WORK_ITEM", "Only bug or architecture_change records are supported; use History Session for project memory");
    }
    const title = input.title?.trim(), description = input.description?.trim();
    if (!title || title.length > 250 || !description || description.length > 64_000) {
      fail("INVALID_WORK_ITEM", "Work item requires a title (max 250) and description (max 64 KiB)");
    }
    const key = normalizedLabel(title);
    if (!key) fail("INVALID_WORK_ITEM", "Work item title must have distinctive characters");
    const doc = input.topLevelDocument?.trim() || null;
    if (input.kind === "architecture_change" &&
        (!doc || !/^docs\/architecture\/[a-zA-Z0-9/_-]+\.md$/.test(doc) || doc.includes(".."))) {
      fail("ARCHITECTURE_SOURCE_REQUIRED",
        "Architecture changes must name the exact top-level docs/architecture/*.md file");
    }
    const prefix = input.kind === "bug" ? "BUG" : "ARC";
    const id = prefix + "-" + createHash("sha256").update(key).digest("hex").slice(0, 15).toUpperCase();
    return this.inTransaction(() => {
      const existing = this.db.prepare(
        "SELECT * FROM dc_work_items WHERE kind=? AND normalized_title=?",
      ).get(input.kind, key);
      if (existing) return {
        id: existing.id, kind: existing.kind, title: existing.title,
        status: existing.status, reused: true, creator: existing.creator,
        device: existing.device,
      };
      const time = utc(), identity = actorInfo(this.root);
      this.db.prepare(`
        INSERT INTO dc_work_items(id,kind,title,normalized_title,description,status,
          feature_name,top_level_document,source_ref,creator,device,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(id, input.kind, title, key, description,
        input.kind === "architecture_change" ? "requires_top_level_sync" : "draft",
        input.featureName ?? null, doc, input.sourceRef ?? null,
        identity.creator, identity.device, time, time);
      this.db.prepare(
        "INSERT INTO dc_work_item_audit(item_id,event,details_json,created_at) VALUES(?,?,?,?)",
      ).run(id, "created", JSON.stringify({ actor: identity.creator, device: identity.device }), time);
      return { id, kind: input.kind, title, status: input.kind === "architecture_change" ?
        "requires_top_level_sync" : "draft", reused: false,
        creator: identity.creator, device: identity.device,
        architectureReviewRequired: input.kind === "architecture_change" };
    });
  }

  syncArchitecture(id: string, reviewer: string): Row {
    if (!reviewer?.trim()) fail("REVIEWER_REQUIRED", "Architecture sync requires reviewer identity");
    return this.inTransaction(() => {
      const row = this.db.prepare("SELECT * FROM dc_work_items WHERE id=?").get(id);
      if (!row || row.kind !== "architecture_change") {
        fail("ARCHITECTURE_NOT_FOUND", "Unknown architecture change request");
      }
      if (row.status === "synced") return { id, status: "synced", reused: true };
      const base = String(row.source_ref ?? "");
      const head = git(this.root, ["rev-parse", "HEAD"]);
      if (!base || !run(this.root, "git", ["merge-base", "--is-ancestor", base, head]).passed) {
        fail("ARCHITECTURE_BASE_MISSING", "Architecture change requires original Git base");
      }
      if (git(this.root, ["status", "--porcelain"])) {
        fail("DIRTY_WORKTREE", "Commit architecture documents before synchronizing");
      }
      if (!changedFiles(this.root, base).includes(String(row.top_level_document))) {
        fail("ARCHITECTURE_NOT_UPDATED",
          `The approved top-level design ${row.top_level_document} has not changed since proposal`);
      }
      this.db.prepare(
        "UPDATE dc_work_items SET status='synced',updated_at=? WHERE id=?",
      ).run(utc(), id);
      this.db.prepare(
        "INSERT INTO dc_work_item_audit(item_id,event,details_json,created_at) VALUES(?,?,?,?)",
      ).run(id, "architecture_synced", JSON.stringify({
        reviewer: reviewer.trim(), document: row.top_level_document, gitHead: head,
      }), utc());
      return { id, status: "synced", gitHead: head, document: row.top_level_document };
    });
  }

  /**
   * start_feature writes a proposal into the project database immediately.
   * Replays with identical payload are idempotent; revised requirements create
   * a revision. A proposal is not an approved task or a passing Spec.
   */
  saveFeature(input: FeatureProposal, actor = "start_feature"): Row {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.name) || input.name.length > 120) {
      fail("INVALID_FEATURE", "Feature name must be a stable kebab-case identifier");
    }
    if (typeof input.description !== "string" || !input.description.trim() ||
        input.description.length > 64_000) {
      fail("INVALID_FEATURE", "Feature description must be nonempty and at most 64 KiB");
    }
    if (!["flat", "parent-child"].includes(input.layout)) {
      fail("INVALID_FEATURE", "Unsupported feature spec layout");
    }
    const status = input.status ?? "draft";
    if (!["draft", "needs_decomposition"].includes(status)) {
      fail("INVALID_FEATURE", "Only unapproved feature proposals can be created");
    }
    const plan = JSON.stringify(input.plan ?? {});
    const draft = JSON.stringify(input.draft ?? null);
    if (plan.length + draft.length > 750_000) {
      fail("FEATURE_TOO_LARGE", "Feature plan and draft exceed project storage limits");
    }
    const fingerprint = createHash("sha256").update(JSON.stringify({
      description: input.description.trim(), layout: input.layout, status,
      subspecs: input.draft?.subspecs ?? null,
    })).digest("hex");
    return this.inTransaction(() => {
      const current = this.db.prepare("SELECT * FROM dc_features WHERE name=?").get(input.name);
      if (current?.fingerprint === fingerprint) return this.feature(current);
      if (current?.status === "specified") {
        fail("FROZEN_FEATURE", "Specified feature cannot be silently replaced by start_feature");
      }
      const updatedAt = utc();
      const revision = current ? Number(current.revision) + 1 : 1;
      const sections = current?.sections_json ?? JSON.stringify({
        requirements: "", design: "", tasks: "",
      });
      this.db.prepare(`
        INSERT INTO dc_features(name,description,layout,status,plan_json,draft_json,
                                sections_json,fingerprint,revision,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(name) DO UPDATE SET
          description=excluded.description,layout=excluded.layout,
          status=excluded.status,plan_json=excluded.plan_json,
          draft_json=excluded.draft_json,fingerprint=excluded.fingerprint,
          revision=excluded.revision,updated_at=excluded.updated_at
      `).run(input.name, input.description.trim(), input.layout, status,
        plan, draft, sections, fingerprint, revision, current?.created_at ?? updatedAt, updatedAt);
      const snapshot = this.getFeature(input.name);
      this.db.prepare(
        "INSERT INTO dc_feature_revisions(name,revision,snapshot_json,created_at) VALUES(?,?,?,?)",
      ).run(input.name, revision, JSON.stringify(snapshot), updatedAt);
      this.audit(null, current ? "feature_revised" : "feature_proposed", actor, {
        name: input.name, revision, layout: input.layout, status,
      });
      return snapshot;
    });
  }

  reviseFeature(
    name: string, sections: Record<string, string>, actor = "agent",
    architectureImpact?: boolean, topLevelDocument = "docs/architecture/overview.md",
  ): Row {
    const fields = ["requirements", "design", "tasks"];
    if (!sections || typeof sections !== "object" || Array.isArray(sections) ||
        !Object.keys(sections).length || Object.keys(sections).some((key) => !fields.includes(key)) ||
        Object.values(sections).some((value) => typeof value !== "string" || value.length > 120_000)) {
      fail("INVALID_SPEC", "Provide requirements/design/tasks text only, each under 120 KiB");
    }
    return this.inTransaction(() => {
      const row = this.db.prepare("SELECT * FROM dc_features WHERE name=?").get(name);
      if (!row) fail("FEATURE_NOT_FOUND", `Unknown feature ${name}`);
      const merged = { ...JSON.parse(row.sections_json), ...sections };
      const designChanged = Object.prototype.hasOwnProperty.call(sections, "design") &&
        String(merged.design) !== String(JSON.parse(row.sections_json).design ?? "");
      if (designChanged && typeof architectureImpact !== "boolean") {
        fail("ARCHITECTURE_IMPACT_REQUIRED",
          "Any new feature design must explicitly declare architectureImpact=true or false");
      }
      const revision = Number(row.revision) + 1;
      const updatedAt = utc();
      this.db.prepare(
        "UPDATE dc_features SET sections_json=?,status='draft',revision=?,updated_at=? WHERE name=?",
      ).run(JSON.stringify(merged), revision, updatedAt, name);
      const snapshot = this.getFeature(name);
      this.db.prepare(
        "INSERT INTO dc_feature_revisions(name,revision,snapshot_json,created_at) VALUES(?,?,?,?)",
      ).run(name, revision, JSON.stringify(snapshot), updatedAt);
      this.audit(null, "feature_spec_revised", actor, { name, revision, sections: Object.keys(sections) });
      if (designChanged && architectureImpact) {
        this.recordWorkItem({
          kind: "architecture_change",
          title: `Feature ${name} architectural design sync revision ${revision}`,
          description: `Design revision ${revision} impacts the top-level architecture; reconcile ${topLevelDocument} with this feature before approval.`,
          featureName: name, topLevelDocument,
          sourceRef: git(this.root, ["rev-parse", "HEAD"]),
        });
      }
      return snapshot;
    });
  }

  validateFeature(name: string): Row {
    const feature = this.getFeature(name);
    const issues: string[] = [];
    if (feature.status === "needs_decomposition") issues.push("子规格尚未完成分解");
    const sections = feature.sections as Record<string, string>;
    const outstandingArchitecture = this.listWorkItems("architecture_change")
      .filter((item) => item.featureName === name && item.status !== "synced");
    if (outstandingArchitecture.length) {
      issues.push("顶层架构同步尚未验收：" + outstandingArchitecture.map((item) => item.id).join(", "));
    }
    for (const kind of ["requirements", "design", "tasks"]) {
      const body = String(sections[kind] ?? "").trim();
      if (body.length < 30) issues.push(`${kind} 内容不足`);
      if (/\[(?:填写|待补|TODO)|\bTODO\b|\bTBD\b/.test(body)) {
        issues.push(`${kind} 存在占位符`);
      }
    }
    if (feature.layout === "parent-child") {
      const draft = feature.draft as Record<string, any> | null;
      if (!Array.isArray(draft?.subspecs) || !draft.subspecs.length) {
        issues.push("parent-child 尚无子规格清单");
      }
    }
    const passed = issues.length === 0;
    if (passed && feature.status !== "specified") {
      this.inTransaction(() => {
        this.db.prepare("UPDATE dc_features SET status='specified',updated_at=? WHERE name=?")
          .run(utc(), name);
        this.audit(null, "feature_specified", "devcontrol", { name, revision: feature.revision });
      });
    }
    return { name, passed, revision: feature.revision, issues };
  }

  exportFeature(name: string, format: "markdown" | "json" = "markdown"): string {
    const feature = this.getFeature(name);
    if (format === "json") return JSON.stringify(feature, null, 2) + "\n";
    if (format !== "markdown") fail("INVALID_EXPORT", "Export format must be markdown or json");
    const sections = feature.sections as Record<string, string>;
    const plan = feature.plan as Record<string, any>;
    const steps = Array.isArray(plan.steps) ? plan.steps as Row[] : [];
    return [
      `# Feature — ${name}`, "",
      `> 状态：${feature.status}；项目本地 SQLite 导出；修订：${feature.revision}`,
      "", "## 功能目标", "", feature.description as string,
      "", "## 需求", "", sections.requirements || "尚未完善（草稿）",
      "", "## 技术设计", "", sections.design || "尚未完善（草稿）",
      "", "## 研发任务", "", sections.tasks || "尚未完善（草稿）",
      "", "## 执行计划索引", "",
      ...steps.map((step) => `- ${step.id ?? ""}：${step.action ?? step.tool ?? step.type ?? ""}`),
      "", `导出版本：${feature.updatedAt}`, "",
    ].join("\n");
  }

  /**
   * Board groups the authoritative database statuses rather than keeping a
   * second board-specific task state. Cancelled tasks are counted as archived.
   */
  board(): Row {
    const groups: Record<string, Row[]> = {
      todo: [], inProgress: [], done: [],
    };
    const tasks = this.list();
    let archived = 0;
    for (const task of tasks) {
      if (task.status === "cancelled") {
        archived++;
        continue;
      }
      const blockers = this.blockers(task.id);
      const unverifiedChildren = task.childIds.filter(
        (id: string) => this.requireTask(id).status !== "verified",
      );
      const latest = this.latestCompletion(task.id);
      const card = {
        id: task.id, title: task.title, status: task.status,
        parentId: task.parentId, childIds: task.childIds, dependsOn: task.dependsOn,
        track: task.track, release: task.release, priority: task.priority,
        blockedBy: blockers, unverifiedChildren, updatedAt: task.updatedAt,
        verifiedAt: task.verifiedAt, completionSummary: latest?.summary ?? null,
        spec: task.spec,
      };
      const column = task.status === "verified" ? "done" :
        task.status === "in_progress" || task.status === "in_review" ? "inProgress" : "todo";
      groups[column].push(card);
    }
    return {
      columns: groups,
      counts: {
        todo: groups.todo.length, inProgress: groups.inProgress.length,
        done: groups.done.length, archived,
      },
      current: this.next().nextTask?.id ?? null,
      updatedAt: utc(),
    };
  }

  private latestCompletion(id: string): Row | null {
    return this.db.prepare(
      "SELECT * FROM dc_completion_notes WHERE task_id=? ORDER BY revision DESC LIMIT 1",
    ).get(id) ?? null;
  }

  /**
   * Completion reports are append-only revisions, tied to the committed Git
   * HEAD. An Agent may revise a report before verification, never afterward.
   */
  complete(id: string, token: string, input: CompletionReport): Row {
    const mandatory = ["summary", "implementation", "verification"] as const;
    for (const field of mandatory) {
      const value = input?.[field];
      if (typeof value !== "string" || !value.trim() || value.length > 12_000) {
        fail("COMPLETION_REQUIRED", `Completion ${field} must be nonempty and at most 12000 characters`);
      }
    }
    if (input.remaining !== undefined &&
        (typeof input.remaining !== "string" || input.remaining.length > 12_000)) {
      fail("INVALID_REMAINING", "Remaining work must be text of at most 12000 characters");
    }
    const head = git(this.root, ["rev-parse", "HEAD"]);
    if (git(this.root, ["status", "--porcelain"])) {
      fail("DIRTY_WORKTREE", "Commit all scoped code before recording completion");
    }
    return this.inTransaction(() => {
      const lease = this.requireLease(id, token);
      const task = this.requireTask(id);
      if (!["in_progress", "in_review"].includes(task.status)) {
        fail("INVALID_STATE", "Only a claimed task can record completion before verification");
      }
      const previous = this.latestCompletion(id);
      const revision = (previous?.revision ?? 0) + 1;
      const record = {
        taskId: id, revision,
        summary: input.summary.trim(),
        implementation: input.implementation.trim(),
        verification: input.verification.trim(),
        remaining: (input.remaining ?? "").trim(),
        gitHead: head, agent: lease.agent, createdAt: utc(),
      };
      this.db.prepare(`
        INSERT INTO dc_completion_notes
        (task_id,revision,summary,implementation,verification,remaining,git_head,agent,created_at)
        VALUES (?,?,?,?,?,?,?,?,?)
      `).run(id, revision, record.summary, record.implementation,
        record.verification, record.remaining, head, lease.agent, record.createdAt);
      this.audit(id, "completion_recorded", lease.agent, {
        revision, gitHead: head,
        checksum: createHash("sha256").update(JSON.stringify(record)).digest("hex"),
      });
      return record;
    });
  }
  private blockers(taskId: string): string[] {
    return this.db.prepare(`
      SELECT d.depends_on FROM dc_dependencies d
      JOIN dc_tasks p ON d.depends_on=p.id
      WHERE d.task_id=? AND p.status!='verified'
    `).all(taskId).map((r) => r.depends_on);
  }
  private isApprovedForExecution(task: Row): boolean {
    const frozen = this.db.prepare(
      "SELECT snapshot_json FROM dc_release_plans WHERE release=?",
    ).get(task.release);
    if (frozen) {
      const plan = JSON.parse(frozen.snapshot_json) as ReleasePlanProposal & {
        sourceHash?: string;
      };
      return this.planSourceUnchanged(plan) &&
        plan.nodes.some(node => node.id === task.id && node.kind === "leaf");
    }
    // Explicit legacy compatibility until the first frozen plan is approved.
    // New Git projects (zero imported tasks) fail closed. Once a release is
    // frozen, legacy allowance is permanently replaced by strict membership.
    const bootstrap = this.db.prepare(
      "SELECT value FROM dc_meta WHERE key='bootstrap'",
    ).get();
    if (!bootstrap) return false;
    try {
      const initial=JSON.parse(bootstrap.value);
      return Number(initial.importedTasks ?? 0) > 0;
    } catch { return false; }
  }

  private executable(task: Row): boolean {
    return task.status !== "draft" && task.status !== "cancelled" &&
      !!(JSON.parse(task.required_gates) as string[]).length &&
      !this.db.prepare("SELECT id FROM dc_tasks WHERE parent_id=? LIMIT 1").get(task.id) &&
      this.isApprovedForExecution(task);
  }

  next(): Row {
    const tasks = this.list();
    const active = this.db.prepare("SELECT task_id,agent,expires_at FROM dc_leases WHERE singleton=1").get();
    const activeLease = active && active.expires_at > Date.now()
      ? { taskId: active.task_id, agent: active.agent, expiresAt: active.expires_at } : null;
    const ready = tasks.filter((t) =>
      (t.status === "ready" || t.status === "in_progress" || t.status === "in_review") &&
      this.executable(this.requireTask(t.id)) &&
      this.blockers(t.id).length === 0 &&
      !t.childIds.some((id: string) => this.requireTask(id).status !== "verified"),
    );
    // A lease represents work already in progress; never recommend a different
    // task to a second agent while this single-worktree lock is active.
    const selected = activeLease ? this.get(activeLease.taskId)
      : ready.find((t) => t.track === "product") ?? ready[0] ?? null;
    return {
      projectRoot: this.root, nextTask: selected,
      activeLease,
      blocked: tasks.filter((t) => t.status !== "verified" && (
        this.blockers(t.id).length ||
        t.childIds.some((id: string) => this.requireTask(id).status !== "verified")
      )).map((t) => ({
        id: t.id, blockedBy: this.blockers(t.id),
        unverifiedChildren: t.childIds.filter((id: string) => this.requireTask(id).status !== "verified"),
      })),
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
      // Equality is task semantics, not title alone: distinct dependencies,
      // parents and file scopes can legitimately share a short display title.
      const duplicate = this.db.prepare(
        "SELECT * FROM dc_tasks WHERE track=? AND release=? AND status!='cancelled'",
      ).all(input.track ?? "product", input.release ?? "V0.1").find((item) =>
        normalizedLabel(item.title) === normalizedLabel(input.title) &&
        (item.parent_id ?? null) === (input.parentId ?? null) &&
        JSON.stringify([...JSON.parse(item.allowed_paths)].sort()) === JSON.stringify([...allowedPaths].sort()) &&
        JSON.stringify([...JSON.parse(item.required_gates)].sort()) === JSON.stringify([...input.requiredGates].sort()) &&
        JSON.stringify(this.db.prepare("SELECT depends_on FROM dc_dependencies WHERE task_id=?").all(item.id)
          .map((r) => r.depends_on).sort()) === JSON.stringify([...dependsOn].sort()));
      if (duplicate) {
        fail("DUPLICATE_TASK", `A matching task already exists: ${duplicate.id} (${duplicate.title})`);
      }
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
        device: actorInfo(this.root).device,
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
    const real = fs.realpathSync(absolute);
    // On macOS /var and /private/var can denote the same directory.
    // Compare canonical paths, not their pre-realpath string spellings.
    const relative = path.relative(fs.realpathSync(this.root), real);
    if (!relative || relative === ".." || relative.startsWith(".." + path.sep) ||
        path.isAbsolute(relative)) {
      fail("UNSAFE_MANIFEST_PATH", "Spec manifest must remain inside project root");
    }
    const manifest = parseParentChildManifest(fs.readFileSync(real, "utf8"));
    if (!manifest) fail("INVALID_MANIFEST", "Expected a valid parent-child spec-manifest.json");
    this.requireTask(input.parentTaskId);
    if (!idPattern.test(input.idPrefix)) fail("INVALID_ID", "Invalid stable task ID prefix");
    // IDs derive from the stable upstream subspec identifier, NEVER its
    // array position: reordering the manifest must not reassign old tasks.
    const identities = new Map(manifest.subspecs.map((subspec) => [
      subspec.id, `${input.idPrefix}-${subspec.id.toUpperCase().replace(/[^A-Z0-9-]/g, "-")}`,
    ]));
    if (new Set(identities.values()).size !== identities.size) {
      fail("IMPORT_CONFLICT", "Two subspec identifiers map to the same task ID");
    }
    for (const id of identities.values()) {
      if (!idPattern.test(id)) fail("INVALID_ID", `Imported task ID exceeds size limit: ${id}`);
    }
    safePaths(input.allowedPaths);
    if (!input.requiredGates?.length || input.requiredGates.some((gate) => !allowedGates.has(gate))) {
      fail("GATE_REQUIRED", "Provide preapproved nonempty gate list for imported subtasks");
    }
    return this.inTransaction(() => {
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
      // Two passes allow forward dependency references. All writes form one
      // transaction: missing dependencies or conflicts cannot half-import.
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
    });
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
      // All new product work must arrive as an Owner-approved full release plan.
      // This is enforced in the ledger, shared by CLI and MCP.
      if (row.track === "product" && !this.isApprovedForExecution(row)) {
        fail("RELEASE_PLAN_REQUIRED", "Approve the complete, reviewed release plan instead of an isolated task");
      }
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
      if (task.status !== "ready" && task.status !== "in_progress" && task.status !== "in_review") {
        fail("TASK_NOT_READY", `Task ${id} is ${task.status}`);
      }
      if (this.db.prepare("SELECT id FROM dc_tasks WHERE parent_id=? LIMIT 1").get(id) &&
          this.db.prepare("SELECT release FROM dc_release_plans WHERE release=?").get(task.release)) {
        fail("PARENT_NOT_EXECUTABLE", "Only leaf tasks can be claimed; group progress aggregates verified children");
      }
      if (!this.isApprovedForExecution(task)) {
        fail("RELEASE_PLAN_REQUIRED", "Release tasks must belong to an approved, frozen plan");
      }
      if (!(JSON.parse(task.required_gates) as string[]).length) {
        fail("GATE_REQUIRED", "Acceptance Gates must be defined before execution");
      }
      if (this.blockers(id).length) fail("TASK_BLOCKED", `Task ${id} depends on ${this.blockers(id).join(", ")}`);
      const lease = this.db.prepare("SELECT * FROM dc_leases WHERE singleton=1").get();
      if (lease && lease.expires_at > Date.now()) {
        fail("LEASE_CONFLICT", `Task ${lease.task_id} is already claimed by ${lease.agent}`);
      }
      // A crashed agent may have committed files before its lease expired.
      // Reclaiming that *same* task must not discard its original Git base.
      if (lease && lease.task_id !== id &&
          ["in_progress", "in_review"].includes(this.requireTask(lease.task_id).status)) {
        fail("ABANDONED_TASK", `Expired task ${lease.task_id} must be resumed or reviewed before switching tasks`);
      }
      const originalBase = lease?.task_id === id ? String(lease.base_head) : base;
      if (lease?.task_id === id) {
        const ancestor = run(this.root, "git", ["merge-base", "--is-ancestor", originalBase, base]);
        if (!ancestor.passed) fail("GIT_HISTORY_CHANGED", "Cannot resume: prior task baseline is not an ancestor of HEAD");
      }
      const token = randomUUID();
      this.db.prepare(`
        INSERT OR REPLACE INTO dc_leases(singleton,task_id,agent,token,base_head,expires_at)
        VALUES(1,?,?,?,?,?)
      `).run(id, agent.trim(), token, originalBase, Date.now() + ttlSeconds * 1000);
      if (task.status !== "in_review") {
        this.db.prepare(
          "UPDATE dc_tasks SET status='in_progress',updated_at=? WHERE id=?",
        ).run(utc(), id);
      }
      this.audit(id, lease?.task_id === id ? "reclaimed" : "claimed", agent, {
        base: originalBase, ttlSeconds,
      });
      return { task: this.get(id), leaseToken: token, baseHead: originalBase };
    });
  }

  renew(id: string, token: string, ttlSeconds = 1800): Row {
    if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 3600) {
      fail("INVALID_TTL", "Lease must be 60–3600 seconds");
    }
    return this.inTransaction(() => {
      const current = this.requireLease(id, token);
      const expiresAt = Date.now() + ttlSeconds * 1000;
      this.db.prepare("UPDATE dc_leases SET expires_at=? WHERE singleton=1").run(expiresAt);
      this.audit(id, "lease_renewed", current.agent, { ttlSeconds, expiresAt });
      return { taskId: id, agent: current.agent, baseHead: current.base_head, expiresAt };
    });
  }

  release(id: string, token: string): Row {
    return this.inTransaction(() => {
      const current = this.requireLease(id, token);
      const task = this.requireTask(id);
      if (task.status !== "in_progress") {
        fail("TASK_IN_REVIEW", "Task in review cannot be released without review resolution");
      }
      // Releasing discards the lease's base revision. Only permit it when no
      // Git commits or uncommitted changes could be orphaned.
      if (git(this.root, ["rev-parse", "HEAD"]) !== current.base_head ||
          git(this.root, ["status", "--porcelain"])) {
        fail("UNFINISHED_WORK", "Do not release after code changes; renew or reclaim this task instead");
      }
      this.db.prepare("DELETE FROM dc_leases WHERE singleton=1").run();
      this.db.prepare("UPDATE dc_tasks SET status='ready',updated_at=? WHERE id=?").run(utc(), id);
      this.audit(id, "lease_released", current.agent, { baseHead: current.base_head });
      return { taskId: id, status: "ready", released: true };
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
    const startHead = git(this.root, ["rev-parse", "HEAD"]);
    const note = this.latestCompletion(id);
    if (!note) {
      return { taskId: id, passed: false, reason: "Missing structured completion report" };
    }
    if (note.git_head !== startHead) {
      return { taskId: id, passed: false, reason: "Completion report refers to an older Git commit; record a new revision" };
    }
    const dirty = git(this.root, ["status", "--porcelain"]);
    if (dirty) return { taskId: id, passed: false, reason: "Git working tree must be clean" };
    if (!run(this.root, "git", ["merge-base", "--is-ancestor", lease.base_head, startHead]).passed) {
      return { taskId: id, passed: false, reason: "Claim baseline is not an ancestor of HEAD" };
    }
    const files = changedFiles(this.root, lease.base_head);
    const allowedPaths = JSON.parse(task.allowed_paths) as string[];
    const denied = files.filter((f) => !allowedPaths.some((p) => pathAllowed(f, p)));
    const unapprovedDocs = undocumentedMarkdown(addedFiles(this.root, lease.base_head), allowedPaths);
    if (!files.length || denied.length || unapprovedDocs.length) {
      return {
        taskId: id, passed: false,
        reason: !files.length ? "No committed task diff" :
          denied.length ? "Out-of-scope files" : "Unapproved new Markdown documents",
        denied, unapprovedDocs, files,
      };
    }
    const gates = JSON.parse(task.required_gates) as string[];
    if (!gates.length) return { taskId: id, passed: false, reason: "Missing gate definition" };
    const results = Object.fromEntries(gates.map((name) => [name, this.gate(name)]));
    const stableHead = git(this.root, ["rev-parse", "HEAD"]);
    const stableTree = git(this.root, ["status", "--porcelain"]);
    const stable = startHead === stableHead && !stableTree;
    const passed = stable && Object.values(results).every((r) => r.passed);
    this.inTransaction(() => {
      const current = this.requireLease(id, token);
      if (current.base_head !== lease.base_head) fail("LEASE_CHANGED", "Lease changed during validation");
      if (git(this.root, ["rev-parse", "HEAD"]) !== startHead ||
          git(this.root, ["status", "--porcelain"])) {
        fail("GIT_CHANGED_DURING_VERIFY", "Git changed after gates; re-run verification");
      }
      this.audit(id, passed ? "verified" : "verify_failed", "devcontrol", {
        revision: startHead, completionRevision: note.revision, files, results, gitStable: stable,
      });
      if (passed) {
        this.db.prepare(
          "UPDATE dc_tasks SET status='verified',verified_at=?,updated_at=? WHERE id=?",
        ).run(utc(), utc(), id);
        // No artificial completion commit for a group: the parent is derived
        // from its independently verified leaf descendants.
        let ancestor = task.parent_id as string | null;
        while (ancestor) {
          const parent = this.requireTask(ancestor);
          const incomplete = this.db.prepare(
            "SELECT id FROM dc_tasks WHERE parent_id=? AND status!='verified' LIMIT 1",
          ).get(ancestor);
          if (incomplete || parent.status === "verified") break;
          this.db.prepare(
            "UPDATE dc_tasks SET status='verified',verified_at=?,updated_at=? WHERE id=?",
          ).run(utc(),utc(),ancestor);
          this.audit(ancestor,"group_verified_by_children","devcontrol",{
            lastVerifiedChild:id,
          });
          ancestor = parent.parent_id;
        }
        this.db.prepare("DELETE FROM dc_leases WHERE singleton=1").run();
      }
    });
    return { taskId: id, passed, files, results, gitStable: stable };
  }

  trace(id: string): Row {
    this.requireTask(id);
    return {
      task: this.get(id),
      evidence: this.db.prepare("SELECT * FROM dc_evidence WHERE task_id=? ORDER BY id").all(id),
      completion: this.latestCompletion(id),
      completionHistory: this.db.prepare(
        "SELECT * FROM dc_completion_notes WHERE task_id=? ORDER BY revision",
      ).all(id),
      audit: this.db.prepare("SELECT * FROM dc_audit WHERE task_id=? ORDER BY id").all(id)
        .map((r) => ({ ...r, details: JSON.parse(r.details_json), details_json: undefined })),
    };
  }
}
