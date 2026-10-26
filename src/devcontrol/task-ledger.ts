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
import { resolveFlutterTestTarget } from "./flutter-gate.js";
import { runLivePostgresGate, livePostgresTestFile } from "./go-postgres-gate.js";
import { makeReviewAgentAction, type ReviewAgentAction } from "./review-actions.js";
import { reviewReleasePlan, type ReleasePlanProposal, type ReleasePlanNode } from "./release-plan.js";
import { localDeveloper } from "./local-developer.js";
import { SRC8_STEPS, type BugStepUpdate } from "./bug-analysis.js";
import { reviewFeatureTaskPlan, type FeatureTaskPlan } from "./feature-task-plan.js";
import { checkManagedGuidanceCommit } from "./managed-guidance-gate.js";
import { amendmentSubjectHash, checkAmendmentShape, checkAmendmentReview,
  type ReleaseWorkScopeAmendment, type ReleaseWorkAmendmentReview,
} from "./release-work-amendment.js";
import { incrementalSubjectHash, checkIncrementalShape, checkIncrementalIndependentReview,
  type ReleaseWorkIncrementalAmendment, type ReleaseWorkIncrementalReview,
} from "./release-work-incremental.js";
import { artifactIsCovered, manifestSubjectHash, reviewArtifactChange, reviewManifest,
  type GovernedArtifactManifest, type GovernedArtifactReview,
} from "./governed-artifacts.js";
import { releaseReviewSubjectHash, reviewAgentReview, reviewAtomicWorkItems, reviewDetailedWorkItems, reviewTaskQualityJudgments, auditAtomicWorkItemDetail, scopeStages, type ReleaseWorkPlan } from "./release-work.js";
import { assessIdeaShape, ideaSubjectHash, reviewIdeaShape,
  type IdeaAssessment, type IdeaIndependentReview } from "./idea-review.js";

type Value = string | number | null;
type Row = Record<string, any>;
interface SqlStmt {
  get(...args: Value[]): Row | undefined;
  all(...args: Value[]): Row[];
  run(...args: Value[]): { changes: number };
}

/** Preflight only: an impossible frozen file scope must not be claimable.
 * Existing fixtures may satisfy a gate; otherwise this task must be allowed
 * to create or repair the actual files used by that gate. Do not weaken it.
 */
function missingGatePrerequisiteScope(root:string,gates:string[],allowedPaths:string[]):string[] {
  const requirements:{gate:string;file:string;valid:(absolute:string)=>boolean}[]=[
    {gate:"go_http_integration",file:"services/core/go.mod",
      valid:location=>fs.existsSync(location)},
    {gate:"go_http_integration",file:"services/core/internal/http_integration_test.go",
      valid:location=>fs.existsSync(location)&&
        /^func TestHTTP\w*\s*\(/m.test(fs.readFileSync(location,"utf8"))},
    {gate:"go_postgres_live",file:"services/core/go.mod",
      valid:location=>fs.existsSync(location)},
    {gate:"go_postgres_live",file:livePostgresTestFile,
      valid:location=>fs.existsSync(location)&&
        /^func TestPostgresLive\w*\s*\(\s*t\s+\*testing\.T\s*\)/m.test(
          fs.readFileSync(location,"utf8"))},
  ];
  const issues:string[]=[];
  for(const requirement of requirements){
    if(!gates.includes(requirement.gate))continue;
    if(requirement.valid(path.join(root,requirement.file)))continue;
    if(allowedPaths.some(pattern=>pathAllowed(requirement.file,pattern)))continue;
    issues.push("Gate "+requirement.gate+" requires missing or invalid "+requirement.file+
      " outside allowedPaths; request a reviewed frozen-scope amendment before claiming");
  }

  return issues;
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
const allowedGates = new Set([
  "docs", "sqlite_decision", "devcontrol_tests", "go_contract", "go_http_integration", "go_postgres_live",
  "flutter_test", "ios_device_e2e", "v01_release_e2e",
]);
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
    killSignal: "SIGKILL",
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

function safePaths(paths: string[], sqliteDecision = false): string[] {
  if (!Array.isArray(paths) || (!paths.length && !sqliteDecision))
    fail("SCOPE_REQUIRED", "Only SQLite-only decision tasks may omit Git file scope");
  if (sqliteDecision && paths.length)
    fail("INVALID_SCOPE", "SQLite-only decision tasks may not modify Git files");
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
  private releaseWorkApprovalInProgress = false;
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
    const firstDatabase = !fs.existsSync(this.databasePath);
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
    // New independent projects start with the stricter planning contract.
    // Existing databases (including pending v2 proposals) are grandfathered;
    // changing their minimum requires a separate reviewed migration.
    if(firstDatabase && !fs.existsSync(path.join(this.root,".neyna/devcontrol-plan.json"))){
      this.db.prepare(
        "INSERT OR IGNORE INTO dc_meta(key,value) VALUES('minimumReleaseProfile','spec-depth-v3')",
      ).run();
    }
  }

  close(): void { this.db.close(); }

  hasReviewedProductPlan(): boolean {
    const tasks=this.db.prepare(
      "SELECT * FROM dc_tasks WHERE track='product' AND status!='cancelled'",
    ).all();
    const leaves=tasks.filter(task=>!this.db.prepare(
      "SELECT id FROM dc_tasks WHERE parent_id=? LIMIT 1",
    ).get(task.id));
    return leaves.length>0 && leaves.every(task=>this.isApprovedForExecution(task));
  }

  private planSourceUnchanged(plan: ReleasePlanProposal & { sourceHash?: string }): boolean {
    if (!plan.sourceHash) return false;
    try {
      if (plan.sourceFeature && !this.featureBindingMatches(plan.sourceFeature)) return false;
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
      CREATE TABLE IF NOT EXISTS dc_release_proposal_drafts (
        release TEXT NOT NULL,
        old_hash TEXT NOT NULL,
        next_hash TEXT NOT NULL,
        old_snapshot_json TEXT NOT NULL,
        revised_by TEXT NOT NULL,
        revised_at TEXT NOT NULL,
        PRIMARY KEY(release,old_hash)
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
      CREATE TABLE IF NOT EXISTS dc_release_work_proposals (
        release TEXT PRIMARY KEY, hash TEXT NOT NULL, snapshot_json TEXT NOT NULL,
        proposed_by TEXT NOT NULL, proposed_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS dc_release_work_plans (
        release TEXT PRIMARY KEY, revision INTEGER NOT NULL, hash TEXT NOT NULL,
        snapshot_json TEXT NOT NULL, approved_by TEXT NOT NULL, approved_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS dc_release_work_history (
        release TEXT NOT NULL, revision INTEGER NOT NULL, hash TEXT NOT NULL,
        snapshot_json TEXT NOT NULL, approved_by TEXT NOT NULL, approved_at TEXT NOT NULL,
        PRIMARY KEY(release,revision)
      );
      CREATE TABLE IF NOT EXISTS dc_release_work_amendments (
        release TEXT PRIMARY KEY, proposal_hash TEXT NOT NULL,
        snapshot_json TEXT NOT NULL, proposed_by TEXT NOT NULL,
        reviewed_json TEXT, review_hash TEXT, proposed_at TEXT NOT NULL,
        reviewed_at TEXT
      );
      CREATE TABLE IF NOT EXISTS dc_release_work_incrementals (
        release TEXT PRIMARY KEY, proposal_hash TEXT NOT NULL,
        snapshot_json TEXT NOT NULL, proposed_by TEXT NOT NULL,
        reviewed_json TEXT, review_hash TEXT, proposed_at TEXT NOT NULL,
        reviewed_at TEXT
      );
      CREATE TABLE IF NOT EXISTS dc_governed_artifacts (
        id TEXT PRIMARY KEY, revision INTEGER NOT NULL, hash TEXT NOT NULL,
        manifest_json TEXT NOT NULL, approved_by TEXT NOT NULL, approved_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS dc_governed_artifact_history (
        id TEXT NOT NULL, revision INTEGER NOT NULL, hash TEXT NOT NULL,
        manifest_json TEXT NOT NULL, approved_by TEXT NOT NULL, approved_at TEXT NOT NULL,
        PRIMARY KEY(id,revision)
      );
      CREATE TABLE IF NOT EXISTS dc_governed_artifact_proposals (
        id TEXT PRIMARY KEY, base_revision INTEGER NOT NULL, base_hash TEXT NOT NULL,
        proposal_hash TEXT NOT NULL, manifest_json TEXT NOT NULL,
        proposed_by TEXT NOT NULL, proposed_at TEXT NOT NULL,
        review_json TEXT, review_hash TEXT
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
      CREATE TABLE IF NOT EXISTS dc_task_assignments (
        task_id TEXT PRIMARY KEY REFERENCES dc_tasks(id),
        owner TEXT NOT NULL,
        assigned_by TEXT NOT NULL,
        decision_ref TEXT NOT NULL,
        assigned_at TEXT NOT NULL,
        device TEXT NOT NULL DEFAULT '',
        identity_source TEXT NOT NULL DEFAULT ''
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
      CREATE TABLE IF NOT EXISTS dc_scope_pauses (
        task_id TEXT PRIMARY KEY REFERENCES dc_tasks(id),
        release TEXT NOT NULL,
        proposal_hash TEXT NOT NULL,
        base_head TEXT NOT NULL,
        paused_head TEXT NOT NULL,
        changed_files_json TEXT NOT NULL,
        reason TEXT NOT NULL,
        paused_by TEXT NOT NULL,
        paused_at TEXT NOT NULL,
        resumed_at TEXT
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
      CREATE TABLE IF NOT EXISTS dc_task_decisions (
        task_id TEXT PRIMARY KEY REFERENCES dc_tasks(id),
        revision INTEGER NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('proposed','decided')),
        question TEXT NOT NULL, decision TEXT NOT NULL,
        rationale TEXT NOT NULL, alternatives TEXT NOT NULL,
        consequences TEXT NOT NULL, verification_plan TEXT NOT NULL,
        actor TEXT NOT NULL, git_head TEXT NOT NULL,
        lease_token_hash TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS dc_task_decision_revisions (
        task_id TEXT NOT NULL REFERENCES dc_tasks(id),
        revision INTEGER NOT NULL, snapshot_json TEXT NOT NULL,
        created_at TEXT NOT NULL, PRIMARY KEY(task_id,revision)
      );
      CREATE TABLE IF NOT EXISTS dc_ideas (
        id TEXT PRIMARY KEY, release TEXT NOT NULL, title TEXT NOT NULL,
        description TEXT NOT NULL, source_ref TEXT NOT NULL, submitted_by TEXT NOT NULL,
        status TEXT NOT NULL, revision INTEGER NOT NULL,
        baseline_hash TEXT NOT NULL, assessment_json TEXT,
        assessment_hash TEXT, review_json TEXT, review_hash TEXT,
        disposition_json TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS dc_idea_revisions (
        idea_id TEXT NOT NULL REFERENCES dc_ideas(id),
        revision INTEGER NOT NULL, event TEXT NOT NULL, snapshot_json TEXT NOT NULL,
        created_at TEXT NOT NULL, PRIMARY KEY(idea_id,revision)
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
      CREATE TABLE IF NOT EXISTS dc_feature_task_proposals (
        feature_name TEXT PRIMARY KEY REFERENCES dc_features(name),
        revision INTEGER NOT NULL, hash TEXT NOT NULL,
        snapshot_json TEXT NOT NULL, proposed_by TEXT NOT NULL,
        proposed_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS dc_feature_task_plans (
        feature_name TEXT PRIMARY KEY REFERENCES dc_features(name),
        revision INTEGER NOT NULL, hash TEXT NOT NULL,
        snapshot_json TEXT NOT NULL, approved_by TEXT NOT NULL,
        approved_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS dc_feature_task_plan_revisions (
        feature_name TEXT NOT NULL REFERENCES dc_features(name),
        revision INTEGER NOT NULL, hash TEXT NOT NULL,
        snapshot_json TEXT NOT NULL, approved_by TEXT NOT NULL,
        approved_at TEXT NOT NULL, PRIMARY KEY(feature_name,revision)
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
      CREATE TABLE IF NOT EXISTS dc_bug_steps (
        item_id TEXT NOT NULL REFERENCES dc_work_items(id),
        step INTEGER NOT NULL CHECK(step BETWEEN 1 AND 8),
        status TEXT NOT NULL CHECK(status IN ('pending','in_progress','blocked','completed')),
        summary TEXT NOT NULL,
        evidence_json TEXT NOT NULL,
        revision INTEGER NOT NULL,
        updated_by TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(item_id,step)
      );
      CREATE TABLE IF NOT EXISTS dc_bug_step_revisions (
        item_id TEXT NOT NULL,
        step INTEGER NOT NULL,
        revision INTEGER NOT NULL,
        snapshot_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(item_id,step,revision),
        FOREIGN KEY(item_id,step) REFERENCES dc_bug_steps(item_id,step)
      );
      CREATE TABLE IF NOT EXISTS dc_bug_task_links (
        item_id TEXT NOT NULL REFERENCES dc_work_items(id),
        task_id TEXT NOT NULL REFERENCES dc_tasks(id),
        role TEXT NOT NULL CHECK(role IN ('repair','test')),
        PRIMARY KEY(item_id,task_id,role)
      );
    `);
    // Keep existing assignment rows intact when upgrading a project database.
    const assignmentColumns = new Set(
      this.db.prepare("PRAGMA table_info(dc_task_assignments)").all().map(row=>row.name),
    );
    if(!assignmentColumns.has("device"))
      this.db.exec("ALTER TABLE dc_task_assignments ADD COLUMN device TEXT NOT NULL DEFAULT ''");
    if(!assignmentColumns.has("identity_source"))
      this.db.exec("ALTER TABLE dc_task_assignments ADD COLUMN identity_source TEXT NOT NULL DEFAULT ''");
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

  /** Persist an engineering decision without generating any ADR/Spec Markdown.
   * This is NOT G2 acceptance: proposed and decided remain separate from the
   * real-world product verification and formal approval process.
   */
  recordDecision(id:string,token:string,input:{
    question:string;decision:string;rationale:string;alternatives:string;
    consequences:string;verificationPlan:string;status:"proposed"|"decided";
    expectedRevision?:number;
  }):Row {
    return this.inTransaction(()=>{
      const lease=this.requireLease(id,token);
      const task=this.requireTask(id);
      const contract=this.executionContract(id);
      if(task.status!=="in_progress"||contract.profile!=="atomic-work-item"||
        (contract.spec as {type?:string}|null)?.type!=="decision"||
        !contract.eligible)
        fail("DECISION_TASK_REQUIRED","An approved, claimed frozen decision work item is required");
      if(git(this.root,["status","--porcelain"])||
        git(this.root,["rev-parse","HEAD"])!==lease.base_head)
        fail("GIT_CHANGED","SQLite-only decisions cannot carry uncommitted or committed Git changes");
      if(!["proposed","decided"].includes(input?.status))
        fail("INVALID_DECISION","Use proposed or decided; neither implies G2 acceptance");
      for(const field of ["question","decision","rationale","alternatives",
        "consequences","verificationPlan"] as const){
        const value=input?.[field];
        if(typeof value!=="string"||value.trim().length<12||value.length>12000)
          fail("INVALID_DECISION",field+" needs a substantial, bounded explanation");
      }
      const previous=this.db.prepare("SELECT revision FROM dc_task_decisions WHERE task_id=?").get(id);
      const revision=Number(previous?.revision??0)+1;
      if(input.expectedRevision!==undefined&&input.expectedRevision!==revision-1)
        fail("STALE_DECISION","Use the current decision revision before editing");
      const tokenHash=createHash("sha256").update(token).digest("hex");
      const record={taskId:id,revision,status:input.status,
        question:input.question.trim(),decision:input.decision.trim(),
        rationale:input.rationale.trim(),alternatives:input.alternatives.trim(),
        consequences:input.consequences.trim(),verificationPlan:input.verificationPlan.trim(),
        actor:lease.agent,gitHead:lease.base_head,updatedAt:utc()};
      this.db.prepare(`INSERT INTO dc_task_decisions
        (task_id,revision,status,question,decision,rationale,alternatives,consequences,
          verification_plan,actor,git_head,lease_token_hash,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(task_id) DO UPDATE SET revision=excluded.revision,status=excluded.status,
          question=excluded.question,decision=excluded.decision,rationale=excluded.rationale,
          alternatives=excluded.alternatives,consequences=excluded.consequences,
          verification_plan=excluded.verification_plan,actor=excluded.actor,
          git_head=excluded.git_head,lease_token_hash=excluded.lease_token_hash,
          updated_at=excluded.updated_at`).run(
          id,revision,record.status,record.question,record.decision,record.rationale,
          record.alternatives,record.consequences,record.verificationPlan,
          record.actor,record.gitHead,tokenHash,record.updatedAt);
      this.db.prepare("INSERT INTO dc_task_decision_revisions VALUES(?,?,?,?)")
        .run(id,revision,JSON.stringify(record),record.updatedAt);
      this.audit(id,"sqlite_decision_saved",lease.agent,{
        revision,status:record.status,
        sha256:createHash("sha256").update(JSON.stringify(record)).digest("hex"),
      });
      return record;
    });
  }

  getDecision(id:string):Row {
    this.requireTask(id);
    const latest=this.db.prepare("SELECT * FROM dc_task_decisions WHERE task_id=?").get(id);
    return {taskId:id,decision:latest?{
      revision:latest.revision,status:latest.status,question:latest.question,
      decision:latest.decision,rationale:latest.rationale,alternatives:latest.alternatives,
      consequences:latest.consequences,verificationPlan:latest.verification_plan,
      actor:latest.actor,gitHead:latest.git_head,updatedAt:latest.updated_at,
    }:null,history:this.db.prepare(
      "SELECT revision,snapshot_json,created_at FROM dc_task_decision_revisions WHERE task_id=? ORDER BY revision"
    ).all(id).map(row=>({...row,snapshot:JSON.parse(row.snapshot_json),snapshot_json:undefined}))};
  }

  /** The frozen release is the only source of executable stage/task IDs. */
  private ideaContext(release:string):{
    hash:string;stages:Set<string>;tasks:Set<string>;stageOf:Map<string,string>;
  } {
    const row=this.db.prepare(
      "SELECT hash,snapshot_json FROM dc_release_work_plans WHERE release=?").get(release);
    if(!row)fail("RELEASE_NOT_FROZEN","Ideas can be scheduled only against a frozen release");
    const plan=(JSON.parse(row.snapshot_json) as {plan:ReleaseWorkPlan}).plan;
    return {hash:row.hash,
      stages:new Set(plan.stages.map(stage=>stage.id)),
      tasks:new Set(plan.workItems.map(item=>item.id)),
      stageOf:new Map(plan.workItems.map(item=>[item.id,item.stageId]))};
  }

  private ideaRow(id:string):Row {
    const row=this.db.prepare("SELECT * FROM dc_ideas WHERE id=?").get(id);
    if(!row)fail("IDEA_NOT_FOUND","Unknown idea");
    return row;
  }

  getIdea(id:string):Row {
    const row=this.ideaRow(id);
    return {id:row.id,release:row.release,title:row.title,
      description:row.description,sourceRef:row.source_ref,submittedBy:row.submitted_by,
      status:row.status,revision:row.revision,baselineHash:row.baseline_hash,
      assessment:row.assessment_json?JSON.parse(row.assessment_json):null,
      assessmentHash:row.assessment_hash??null,
      review:row.review_json?JSON.parse(row.review_json):null,
      reviewHash:row.review_hash??null,
      disposition:row.disposition_json?JSON.parse(row.disposition_json):null,
      createdAt:row.created_at,updatedAt:row.updated_at,
      history:this.db.prepare(
        "SELECT revision,event,snapshot_json,created_at FROM dc_idea_revisions WHERE idea_id=? ORDER BY revision"
      ).all(id).map(x=>({revision:x.revision,event:x.event,
        snapshot:JSON.parse(x.snapshot_json),createdAt:x.created_at}))};
  }

  listIdeas(release?:string):Row {
    const rows=release
      ?this.db.prepare("SELECT id FROM dc_ideas WHERE release=? ORDER BY created_at,id").all(release)
      :this.db.prepare("SELECT id FROM dc_ideas ORDER BY created_at,id").all();
    return {ideas:rows.map(row=>this.getIdea(row.id))};
  }

  private appendIdeaRevision(id:string,revision:number,event:string,record:Row):void {
    this.db.prepare("INSERT INTO dc_idea_revisions VALUES(?,?,?,?,?)")
      .run(id,revision,event,JSON.stringify(record),utc());
    this.audit(null,"idea_"+event,record.actor??"devcontrol",
      {ideaId:id,revision,event});
  }

  captureIdea(input:{
    release:string;title:string;description:string;sourceRef:string;submittedBy:string;
  }):Row {
    const release=String(input?.release??"").trim();
    const context=this.ideaContext(release);
    for(const [key,min,max] of [
      ["title",4,180],["description",12,10000],
      ["sourceRef",3,400],["submittedBy",2,120],
    ] as const){
      const val=input?.[key];
      if(typeof val!=="string"||val.trim().length<min||val.length>max)
        fail("INVALID_IDEA",key+" is missing or exceeds its safe bound");
    }
    return this.inTransaction(()=>{
      const id="IDEA-"+randomUUID();
      const timestamp=utc();
      this.db.prepare(`INSERT INTO dc_ideas
        (id,release,title,description,source_ref,submitted_by,status,revision,
          baseline_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id,release,input.title.trim(),input.description.trim(),
          input.sourceRef.trim(),input.submittedBy.trim(),"captured",1,
          context.hash,timestamp,timestamp);
      this.appendIdeaRevision(id,1,"captured",
        {title:input.title,description:input.description,sourceRef:input.sourceRef,
          baselineHash:context.hash,actor:input.submittedBy});
      return {...this.getIdea(id),executableTaskCreated:false};
    });
  }

  assessIdea(id:string,assessment:IdeaAssessment,expectedRevision:number):Row {
    return this.inTransaction(()=>{
      const row=this.ideaRow(id);
      if(row.status!=="captured"&&row.status!=="assessed")
        fail("IDEA_FROZEN","Only captured/assessed ideas can be re-assessed");
      if(row.revision!==expectedRevision)fail("STALE_IDEA","Idea revision changed");
      const context=this.ideaContext(row.release);
      if(row.baseline_hash!==context.hash)
        fail("STALE_RELEASE","Release baseline changed; re-capture impact proposal");
      const issues=assessIdeaShape(assessment,context.stages,context.tasks);
      if(["within_task","after_task"].includes(assessment?.placement)&&
        context.stageOf.get(assessment.targetTaskId??"")!==assessment.targetStageId)
        issues.push("insertion stage must match the target frozen work item");
      if(issues.length)fail("IDEA_ASSESSMENT_INVALID",issues.join("; "));
      const hash=ideaSubjectHash({id,release:row.release,title:row.title,
        description:row.description,sourceRef:row.source_ref,
        baselineHash:row.baseline_hash,assessment});
      const revision=row.revision+1;
      this.db.prepare(`UPDATE dc_ideas SET status='assessed',revision=?,assessment_json=?,
        assessment_hash=?,review_json=NULL,review_hash=NULL,
        disposition_json=NULL,updated_at=? WHERE id=?`)
        .run(revision,JSON.stringify(assessment),hash,utc(),id);
      this.appendIdeaRevision(id,revision,"assessed",
        {assessment,assessmentHash:hash,actor:assessment.assessedBy});
      return {...this.getIdea(id),executableTaskCreated:false};
    });
  }

  reviewIdea(id:string,review:IdeaIndependentReview,expectedRevision:number):Row {
    return this.inTransaction(()=>{
      const row=this.ideaRow(id);
      if(row.status!=="assessed")fail("IDEA_NOT_ASSESSED","Assess before independent review");
      if(row.revision!==expectedRevision)fail("STALE_IDEA","Idea revision changed");
      const context=this.ideaContext(row.release);
      if(row.baseline_hash!==context.hash)
        fail("STALE_RELEASE","Frozen release changed; re-evaluate idea");
      const assessment=JSON.parse(row.assessment_json) as IdeaAssessment;
      const expected=ideaSubjectHash({id,release:row.release,title:row.title,
        description:row.description,sourceRef:row.source_ref,
        baselineHash:row.baseline_hash,assessment});
      if(expected!==row.assessment_hash)
        fail("STALE_IDEA","Stored assessment was changed");
      const issues=reviewIdeaShape(review,assessment.assessedBy,expected,context.tasks);
      if(assessment.targetTaskId){
        const task=this.db.prepare("SELECT status,plan_id FROM dc_tasks WHERE id=?")
          .get(assessment.targetTaskId);
        const inScopeCurrentTask=assessment.placement==="within_task"&&
          task?.status==="in_progress"&&
          task?.plan_id==="release-work:"+row.release;
        if(task?.status!=="ready"&&!inScopeCurrentTask)
          issues.push("Insertion anchor changed; re-assess placement or use an authorized current task");
        if(review.checks?.some(check=>!check.taskIds?.includes(assessment.targetTaskId!)))
          issues.push("Every independent dimension must consider the insertion anchor");
      }
      if(issues.length)fail("IDEA_REVIEW_INVALID",issues.join("; "));
      const reviewHash=createHash("sha256").update(JSON.stringify(review)).digest("hex");
      const revision=row.revision+1;
      this.db.prepare(`UPDATE dc_ideas SET status='reviewed',revision=?,review_json=?,
        review_hash=?,updated_at=? WHERE id=?`)
        .run(revision,JSON.stringify(review),reviewHash,utc(),id);
      this.appendIdeaRevision(id,revision,"reviewed",
        {review,reviewHash,actor:review.reviewer});
      return {...this.getIdea(id),executableTaskCreated:false};
    });
  }

  decideIdea(id:string,input:{
    disposition:"adopt"|"defer"|"reject";approvedBy:string;
    expectedRevision:number;expectedReviewHash:string;reason:string;
    explicitAuthorization:boolean;
  }):Row {
    return this.inTransaction(()=>{
      const row=this.ideaRow(id);
      if(row.status!=="reviewed")fail("IDEA_REVIEW_REQUIRED","Review the idea first");
      if(row.revision!==input.expectedRevision)
        fail("STALE_IDEA","Idea revision changed");
      if(row.review_hash!==input.expectedReviewHash)
        fail("IDEA_REVIEW_MISMATCH","Exact independent review hash required");
      if(input.explicitAuthorization!==true)
        fail("EXPLICIT_AUTHORIZATION_REQUIRED",
          "The Owner must explicitly authorize the reviewed disposition");
      const context=this.ideaContext(row.release);
      if(row.baseline_hash!==context.hash)
        fail("STALE_RELEASE","Frozen release changed since idea review");
      if(!["adopt","defer","reject"].includes(input.disposition)||
        typeof input.approvedBy!=="string"||input.approvedBy.trim().length<2||
        typeof input.reason!=="string"||input.reason.trim().length<12)
        fail("INVALID_DISPOSITION","Explicit Owner label, disposition and reason required");
      const assessment=JSON.parse(row.assessment_json) as IdeaAssessment;
      if(input.disposition==="adopt"&&assessment.recommendation!=="adopt")
        fail("ASSESSMENT_MISMATCH","Reassess and re-review before overriding to adopt");
      if(assessment.targetTaskId){
        const target=this.db.prepare("SELECT status,plan_id FROM dc_tasks WHERE id=?")
          .get(assessment.targetTaskId);
        const canUseClaimedTask=assessment.placement==="within_task"&&
          target?.status==="in_progress"&&
          target?.plan_id==="release-work:"+row.release;
        if(target?.status!=="ready"&&!canUseClaimedTask)
          fail("STALE_PLACEMENT",
            "Target is no longer schedulable; reassess placement instead of forcing deferral");
      }
      const status=input.disposition==="adopt"?"approved_for_planning":
        input.disposition==="defer"?"deferred":"rejected";
      const revision=row.revision+1;
      const disposition={decision:input.disposition,reason:input.reason.trim(),
        approvedBy:input.approvedBy.trim(),reviewHash:row.review_hash,
        at:utc(),authorization:"audit_label_not_verified_identity"};
      this.db.prepare(`UPDATE dc_ideas SET status=?,revision=?,disposition_json=?,
        updated_at=? WHERE id=?`)
        .run(status,revision,JSON.stringify(disposition),utc(),id);
      this.appendIdeaRevision(id,revision,"decided",
        {disposition,actor:input.approvedBy});
      const nextGate=status!=="approved_for_planning"?"none":
        assessment.placement==="within_task"?
          "Existing task contract: only implement if original acceptance, file scope, gates and a valid claim already authorize it; otherwise request a reviewed release amendment":
        assessment.placement==="after_task"?
          "Reviewed whole-release amendment and explicit approval required before inserting work":
          "Future release planning and separate approval required";
      return {...this.getIdea(id),executableTaskCreated:false,
        frozenPlanChanged:false,nextGate,
        canProceedWithinExistingTask:status==="approved_for_planning"&&
          assessment.placement==="within_task",
        releaseAmendmentRequired:status==="approved_for_planning"&&
          assessment.placement!=="within_task"};
    });
  }

  /** Read-only integrity preflight for all formally frozen architecture artifacts. */
  checkGovernedArtifacts(changedPaths?:string[],staged=false):Row {
    const frozen=this.db.prepare("SELECT * FROM dc_governed_artifacts ORDER BY id").all();
    const issues:string[]=[];
    const governed:string[]=[];
    for(const row of frozen){
      const manifest=JSON.parse(row.manifest_json) as GovernedArtifactManifest;
      const roots=manifest.guardRoots;
      const expected=new Map(manifest.files.map(file=>[file.path,file.sha256]));
      let observed:string[];
      if(changedPaths){
        observed=changedPaths.filter(file=>artifactIsCovered(file,roots));
      }else{
        const result=spawnSync("git",
          ["ls-files","--cached","--others","--exclude-standard","-z","--",...roots],
          {cwd:this.root,encoding:"buffer",timeout:12_000});
        if(result.status!==0||!Buffer.isBuffer(result.stdout))
          fail("GIT_ERROR","Unable to inspect frozen architecture artifact paths");
        observed=[...new Set([
          ...manifest.files.map(file=>file.path),
          ...result.stdout.toString("utf8").split("\0").filter(Boolean),
        ])];
      }
      for(const file of observed){
        governed.push(file);
        const expectedHash=expected.get(file);
        if(!expectedHash){
          issues.push(row.id+": "+file+" is not present in the approved artifact manifest");
          continue;
        }
        const absolute=path.resolve(this.root,file);
        try {
          if(!fs.lstatSync(absolute).isFile()) {
            issues.push(row.id+": "+file+" is not an ordinary file");continue;
          }
          const bytes=staged?
            spawnSync("git",["show",":"+file],{cwd:this.root,encoding:"buffer",
              timeout:12_000,maxBuffer:4_000_000}):null;
          if(bytes&&(bytes.status!==0||!Buffer.isBuffer(bytes.stdout))){
            issues.push(row.id+": "+file+" cannot read staged contents");continue;
          }
          const actual=createHash("sha256")
            .update(bytes?bytes.stdout:fs.readFileSync(absolute)).digest("hex");
          if(actual!==expectedHash)
            issues.push(row.id+": "+file+" SHA-256 differs from approved revision "+
              row.revision+" (submit reviewed amendment)");
        }catch{
          issues.push(row.id+": "+file+" is missing or inaccessible");
        }
      }
    }
    return {passed:issues.length===0,issues,protectedFiles:[...new Set(governed)].sort(),
      protectedBaselines:frozen.map(row=>({id:row.id,revision:row.revision,hash:row.hash}))};
  }

  governedArtifact(id:string):Row {
    const current=this.db.prepare("SELECT * FROM dc_governed_artifacts WHERE id=?").get(id);
    const proposal=this.db.prepare("SELECT * FROM dc_governed_artifact_proposals WHERE id=?").get(id);
    return {id,baseline:current?{revision:current.revision,hash:current.hash,
      manifest:JSON.parse(current.manifest_json),approvedBy:current.approved_by}:null,
      pending:proposal?{baseRevision:proposal.base_revision,baseHash:proposal.base_hash,
        proposalHash:proposal.proposal_hash,manifest:JSON.parse(proposal.manifest_json),
        proposedBy:proposal.proposed_by,review:proposal.review_json?
          JSON.parse(proposal.review_json):null,reviewHash:proposal.review_hash??null}:null};
  }

  stageGovernedArtifact(manifest:GovernedArtifactManifest,
    baseRevision:number,baseHash:string,actor:string):Row {
    if(typeof actor!=="string"||actor.trim().length<3)
      fail("ACTOR_REQUIRED","Artifact proposer label is required");
    const issues=reviewManifest(manifest);
    if(issues.length)fail("ARTIFACT_INVALID",issues.join("; "));
    return this.inTransaction(()=>{
      const existing=this.db.prepare("SELECT * FROM dc_governed_artifacts WHERE id=?")
        .get(manifest.id);
      const actualRevision=existing?.revision??0;
      const actualHash=existing?.hash??"";
      if(actualRevision!==baseRevision||actualHash!==baseHash)
        fail("STALE_ARTIFACT","Approved artifact baseline revision/hash changed");
      if(this.db.prepare("SELECT id FROM dc_governed_artifact_proposals WHERE id=?")
        .get(manifest.id))fail("ARTIFACT_PENDING","Resolve pending artifact proposal");
      if(existing) {
        const old=JSON.parse(existing.manifest_json) as GovernedArtifactManifest;
        if(JSON.stringify(old.guardRoots)!==JSON.stringify(manifest.guardRoots))
          fail("ARTIFACT_ROOT_CHANGE","Guarded directory roots cannot be silently removed or changed");
        if(JSON.stringify(old.files)===JSON.stringify(manifest.files))
          fail("ARTIFACT_NO_CHANGE","Revising an artifact requires a genuine file manifest change");
      }
      const others=this.db.prepare("SELECT id,manifest_json FROM dc_governed_artifacts")
        .all().filter(row=>row.id!==manifest.id);
      for(const other of others){
        const roots=(JSON.parse(other.manifest_json) as GovernedArtifactManifest).guardRoots;
        if(roots.some(existingRoot=>manifest.guardRoots.some(root=>
          root===existingRoot||root.startsWith(existingRoot+"/")||
          existingRoot.startsWith(root+"/"))))
          fail("ARTIFACT_OVERLAP","Guarded directory already governed by "+other.id);
      }
      const hash=manifestSubjectHash(manifest,baseRevision,baseHash);
      this.db.prepare(`INSERT INTO dc_governed_artifact_proposals
        (id,base_revision,base_hash,proposal_hash,manifest_json,proposed_by,proposed_at)
        VALUES(?,?,?,?,?,?,?)`).run(manifest.id,baseRevision,baseHash,hash,
        JSON.stringify(manifest),actor.trim(),utc());
      this.audit(null,"governed_artifact_staged",actor,{id:manifest.id,
        baseRevision,baseHash,hash,files:manifest.files.map(file=>file.path)});
      return {id:manifest.id,status:"awaiting_independent_review",proposalHash:hash,
        baselineChanged:false};
    });
  }

  independentlyReviewGovernedArtifact(id:string,review:GovernedArtifactReview,
    expectedProposalHash:string):Row {
    return this.inTransaction(()=>{
      const row=this.db.prepare("SELECT * FROM dc_governed_artifact_proposals WHERE id=?").get(id);
      if(!row||row.proposal_hash!==expectedProposalHash)
        fail("ARTIFACT_PROPOSAL_REQUIRED","Exact staged artifact proposal required");
      if(row.review_json)fail("ARTIFACT_ALREADY_REVIEWED","Review is already recorded");
      const current=this.db.prepare("SELECT * FROM dc_governed_artifacts WHERE id=?").get(id);
      if((current?.revision??0)!==row.base_revision||(current?.hash??"")!==row.base_hash)
        fail("STALE_ARTIFACT","Frozen artifact changed during review");
      const manifest=JSON.parse(row.manifest_json) as GovernedArtifactManifest;
      const issues=reviewArtifactChange(review,row.proposed_by,row.proposal_hash,
        manifest.sourceRefs);
      if(issues.length)fail("ARTIFACT_INDEPENDENT_REVIEW_REQUIRED",issues.join("; "));
      const hash=createHash("sha256").update(JSON.stringify(review)).digest("hex");
      this.db.prepare(`UPDATE dc_governed_artifact_proposals
        SET review_json=?,review_hash=? WHERE id=?`).run(JSON.stringify(review),hash,id);
      this.audit(null,"governed_artifact_reviewed",review.reviewer,
        {id,proposalHash:expectedProposalHash,reviewHash:hash});
      return {id,status:"reviewed",proposalHash:expectedProposalHash,reviewHash:hash,
        baselineChanged:false};
    });
  }

  approveGovernedArtifact(input:{id:string;expectedProposalHash:string;
    expectedReviewHash:string;approvedBy:string;reason:string;
    explicitAuthorization:boolean}):Row {
    if(input?.explicitAuthorization!==true||typeof input.approvedBy!=="string"||
      input.approvedBy.trim().length<2||typeof input.reason!=="string"||
      input.reason.trim().length<25)
      fail("OWNER_AUTHORIZATION_REQUIRED","Explicit Owner authorization and concrete reason required");
    return this.inTransaction(()=>{
      if(this.db.prepare("SELECT task_id FROM dc_leases WHERE singleton=1").get())
        fail("ACTIVE_TASK","Cannot rebase governed architecture during active work");
      const row=this.db.prepare("SELECT * FROM dc_governed_artifact_proposals WHERE id=?")
        .get(input.id);
      if(!row||!row.review_json||row.proposal_hash!==input.expectedProposalHash||
        row.review_hash!==input.expectedReviewHash)
        fail("ARTIFACT_REVIEW_REQUIRED","Exact reviewed proposal and review hashes required");
      const old=this.db.prepare("SELECT * FROM dc_governed_artifacts WHERE id=?")
        .get(input.id);
      if((old?.revision??0)!==row.base_revision||(old?.hash??"")!==row.base_hash)
        fail("STALE_ARTIFACT","Frozen architecture baseline changed");
      const revision=(old?.revision??0)+1,now=utc();
      const manifest=JSON.parse(row.manifest_json) as GovernedArtifactManifest;
      // First freeze anchors files that already exist on disk; a later
      // revision can approve the exact future file hashes before the commit.
      if(!old){
        for(const file of manifest.files){
          const abs=path.resolve(this.root,file.path);
          if(!fs.existsSync(abs)||!fs.lstatSync(abs).isFile()||
            createHash("sha256").update(fs.readFileSync(abs)).digest("hex")!==file.sha256)
            fail("INITIAL_ARTIFACT_MISMATCH",
              "Initial frozen baseline needs existing matching project file "+file.path);
          const tracked=spawnSync("git",["ls-files","--error-unmatch","--",file.path],
            {cwd:this.root,encoding:"utf8",timeout:5_000});
          if(tracked.status!==0)
            fail("INITIAL_ARTIFACT_UNTRACKED",
              "Initial frozen baseline requires committed/otherwise Git-tracked file "+file.path);
          const dirty=spawnSync("git",["status","--porcelain","--",file.path],
            {cwd:this.root,encoding:"utf8",timeout:5_000});
          if(dirty.status!==0||dirty.stdout?.trim())
            fail("INITIAL_ARTIFACT_DIRTY",
              "First architecture freeze requires a clean committed project file "+file.path);
        }
      }
      const otherBaselines=this.db.prepare(
        "SELECT id,manifest_json FROM dc_governed_artifacts WHERE id<>?").all(input.id);
      for(const other of otherBaselines){
        const otherRoots=(JSON.parse(other.manifest_json) as GovernedArtifactManifest).guardRoots;
        if(otherRoots.some(existingRoot=>manifest.guardRoots.some(root=>
          root===existingRoot||root.startsWith(existingRoot+"/")||
          existingRoot.startsWith(root+"/"))))
          fail("ARTIFACT_OVERLAP","Artifact guard roots overlap an existing frozen baseline");
      }
      this.db.prepare(`INSERT INTO dc_governed_artifacts
        (id,revision,hash,manifest_json,approved_by,approved_at)
        VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
          revision=excluded.revision,hash=excluded.hash,
          manifest_json=excluded.manifest_json,
          approved_by=excluded.approved_by,approved_at=excluded.approved_at`)
        .run(input.id,revision,row.proposal_hash,row.manifest_json,input.approvedBy.trim(),now);
      this.db.prepare(`INSERT INTO dc_governed_artifact_history
        (id,revision,hash,manifest_json,approved_by,approved_at)
        VALUES(?,?,?,?,?,?)`).run(input.id,revision,row.proposal_hash,
          row.manifest_json,input.approvedBy.trim(),now);
      this.db.prepare("DELETE FROM dc_governed_artifact_proposals WHERE id=?")
        .run(input.id);
      this.audit(null,"governed_artifact_approved",input.approvedBy,{
        id:input.id,revision,hash:row.proposal_hash,previousHash:old?.hash??"",
        reviewHash:row.review_hash,reason:input.reason});
      return {id:input.id,status:"frozen",revision,hash:row.proposal_hash,
        previousHash:old?.hash??"",fileCount:manifest.files.length};
    });
  }
  checkStaged(): Row {
    const staged=spawnSync(
      "git",["diff","--cached","--no-renames","--name-only","-z","--diff-filter=ACMRTD"],
      {cwd:this.root,encoding:"buffer",timeout:12_000},
    );
    if(staged.status!==0||!Buffer.isBuffer(staged.stdout))fail("GIT_ERROR","Cannot inspect staged files");
    const files=[...new Set(staged.stdout.toString("utf8").split("\0").filter(Boolean))].sort();
    const artifactGate=this.checkGovernedArtifacts(files,true);
    if(!artifactGate.passed)
      return {passed:false,reason:"Frozen governed artifact changed without reviewed approval",
        ...artifactGate,stagedFiles:files};
    const guidance=checkManagedGuidanceCommit(this.root,files);
    // No implicit approval for arbitrary edits to AGENTS.md or the Skill.
    // This exception requires only canonical generator output and no other files.
    if(files.length&&guidance.passed)
      return {passed:true,taskId:null,scope:"managed-guidance-sync",
        stagedFiles:files,deniedFiles:[],unapprovedDocs:[],managedFiles:guidance.managedFiles};
    const lease = this.db.prepare("SELECT * FROM dc_leases WHERE singleton=1").get();
    if (!lease || lease.expires_at <= Date.now()) {
      fail("LEASE_REQUIRED", "No active approved task lease; refusing Git commit"+
        (guidance.issues.length?"; managed guidance validation: "+guidance.issues.join("; "):""));
    }
    const task = this.requireTask(lease.task_id);
    if((task.required_gates as string).includes('"sqlite_decision"'))
      return {passed:false,taskId:task.id,reason:
        "SQLite-only decisions do not create Git commits; use decision-save, complete, report and verify"};
    if (task.status !== "in_progress" && task.status !== "in_review") {
      fail("TASK_NOT_ACTIVE", "Only active work may be committed");
    }
    if (this.blockers(task.id).length) fail("TASK_BLOCKED", "A prerequisite is no longer verified");
    const patterns = JSON.parse(task.allowed_paths) as string[];
    const contract=this.executionContract(task.id);
    const spec=contract.profile==="spec-depth-v3"?
      contract.spec as ReleasePlanNode:null;
    const exact=spec?.allowedChangedFiles;
    const denied = files.filter((file) =>
      !patterns.some((pattern) => pathAllowed(file, pattern)) ||
      (exact && !exact.includes(file)));
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
      passed: files.length>0 && denied.length === 0 && unapprovedDocs.length === 0,
      taskId: task.id, stagedFiles: files, deniedFiles: denied,
      unapprovedDocs,exactFileScope:exact??null,
      ...(files.length?{}:{reason:"No staged task changes"}),
    };
  }

  private task(row: Row): Row {
    const detail = this.db.prepare("SELECT * FROM dc_task_specs WHERE task_id=?").get(row.id);
    const assignment=this.db.prepare(
      "SELECT owner,assigned_by,decision_ref,assigned_at,device,identity_source FROM dc_task_assignments WHERE task_id=?",
    ).get(row.id);
    return {
      id: row.id, title: row.title, parentId: row.parent_id ?? null,
      track: row.track, release: row.release, priority: row.priority, status: row.status,
      allowedPaths: JSON.parse(row.allowed_paths), requiredGates: JSON.parse(row.required_gates),
      specId: row.spec_id, planId: row.plan_id, approvedBy: row.approved_by,
      owner:assignment?.owner??null,
      ownerAssignment:assignment?{assignedBy:assignment.assigned_by,
        decisionRef:assignment.decision_ref,assignedAt:assignment.assigned_at,
        device:assignment.device,identitySource:assignment.identity_source}:null,
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

  /** Select an actual project release, not a hardcoded name from the pilot project. */
  primaryRelease(): string {
    const roster=this.db.prepare("SELECT release FROM dc_release_work_proposals ORDER BY proposed_at DESC LIMIT 1").get()
      ?? this.db.prepare("SELECT release FROM dc_release_work_plans ORDER BY approved_at DESC LIMIT 1").get();
    if(roster)return String(roster.release);
    const proposal=this.db.prepare(
      "SELECT release FROM dc_release_proposals ORDER BY proposed_at DESC LIMIT 1",
    ).get();
    if(proposal)return String(proposal.release);
    const frozen=this.db.prepare(
      "SELECT release FROM dc_release_plans ORDER BY approved_at DESC LIMIT 1",
    ).get();
    if(frozen)return String(frozen.release);
    const product=this.db.prepare(
      "SELECT release FROM dc_tasks WHERE track='product' ORDER BY updated_at DESC LIMIT 1",
    ).get();
    return product?String(product.release):"";
  }

  /** The effective Git identity of THIS checkout now, never historical authors. */
  localDeveloper(): Row { return localDeveloper(this.root); }

  releaseWorkPlan(release: string): Row {
    const pending=this.db.prepare("SELECT * FROM dc_release_work_proposals WHERE release=?").get(release);
    const frozen=this.db.prepare("SELECT * FROM dc_release_work_plans WHERE release=?").get(release);
    const proposal=pending?JSON.parse(pending.snapshot_json):null;
    const approved=frozen?JSON.parse(frozen.snapshot_json):null;
    // A persisted draft may have been created before the current review
    // policy existed. Re-check it live rather than trusting stale 'passed'.
    const liveReview=proposal?.plan?this.reviewReleaseWork(proposal.plan):null;
    if(proposal&&liveReview)proposal.review=liveReview;
    return {
      release, status:pending?(liveReview?.passed?"review_pending":"needs_revision"):
        frozen?"frozen":"missing",
      proposal, proposalHash:pending?.hash??null, frozen:approved,
      frozenHash:frozen?.hash??null, revision:frozen?.revision??0,
      issues:liveReview?.issues??[], approvedBy:frozen?.approved_by??null,
      scopeAmendment:this.releaseWorkScopeAmendment(release),
      incrementalAmendment:this.releaseWorkIncrementalAmendment(release),
    };
  }

  releaseWorkScopeAmendment(release:string):Row|null {
    const row=this.db.prepare("SELECT * FROM dc_release_work_amendments WHERE release=?").get(release);
    if(!row)return null;
    const proposal=JSON.parse(row.snapshot_json) as ReleaseWorkScopeAmendment;
    return {release,proposalHash:row.proposal_hash,
      proposal,proposedBy:row.proposed_by,
      review:row.reviewed_json?JSON.parse(row.reviewed_json):null,
      reviewHash:row.review_hash??null,
      status:row.reviewed_json?"reviewed":"awaiting_independent_review",
      requiredAgentAction:makeReviewAgentAction({kind:"scope_amendment",release,
        proposalHash:row.proposal_hash,reviewHash:row.review_hash??null,
        affectedTaskIds:proposal.changes.map(change=>change.taskId)})};
  }

  /** When independent review discovers an insufficient acceptance Gate, the
   * Owner may retire only that exact UNREVIEWED candidate and restage a fixed
   * proposal. No task is created; original frozen revision remains intact.
   * Reviewed/approved amendments require their separate governing process.
   */
  withdrawReleaseWorkIncremental(input:{release:string;expectedProposalHash:string;
    approvedBy:string;reason:string;explicitAuthorization:boolean}):Row {
    if(input?.explicitAuthorization!==true||!input.approvedBy?.trim()||
      typeof input.reason!=="string"||input.reason.trim().length<25)
      fail("OWNER_AUTHORIZATION_REQUIRED","Owner authorization and specific rejected Gate reason required");
    return this.inTransaction(()=>{
      const row=this.db.prepare("SELECT * FROM dc_release_work_incrementals WHERE release=?")
        .get(input.release);
      if(!row||row.proposal_hash!==input.expectedProposalHash||row.reviewed_json)
        fail("INCREMENTAL_WITHDRAWAL_REVIEW_REQUIRED",
          "Only the exact unreviewed frozen work candidate may be retired");
      if(this.db.prepare("SELECT task_id FROM dc_leases WHERE singleton=1").get())
        fail("ACTIVE_TASK","Do not withdraw pending prerequisites during an active task lease");
      this.db.prepare("DELETE FROM dc_release_work_incrementals WHERE release=?")
        .run(input.release);
      this.audit(null,"release_incremental_withdrawn",input.approvedBy.trim(),{
        release:input.release,proposalHash:row.proposal_hash,reason:input.reason.trim(),
        executableTasksChanged:false});
      return {release:input.release,withdrawn:true,proposalHash:row.proposal_hash,
        executableTasksChanged:false,frozenRevisionUnchanged:true};
    });
  }

  private taskAwaitsScopeReview(id:string,release:string):boolean {
    const pending=this.db.prepare(
      "SELECT snapshot_json FROM dc_release_work_amendments WHERE release=?",
    ).get(release);
    if(!pending)return false;
    const proposal=JSON.parse(pending.snapshot_json) as ReleaseWorkScopeAmendment;
    return proposal.changes.some(change=>change.taskId===id);
  }

  /** Evaluate a scope expansion without modifying a frozen task, lease or revision. */
  reviewReleaseWorkScopeAmendment(input:ReleaseWorkScopeAmendment):Row {
    const issues=checkAmendmentShape(input);
    if(issues.length)return {passed:false,issues};
    const row=this.db.prepare(
      "SELECT revision,hash,snapshot_json FROM dc_release_work_plans WHERE release=?").get(input.release);
    if(!row)return {passed:false,issues:["No frozen release with this ID"]};
    if(row.revision!==input.baseRevision||row.hash!==input.baseHash)
      issues.push("Frozen release revision or hash changed; re-evaluate the amendment");
    const snapshot=JSON.parse(row.snapshot_json) as {plan:ReleaseWorkPlan};
    if(this.db.prepare("SELECT release FROM dc_release_work_proposals WHERE release=?").get(input.release))
      issues.push("A whole-release proposal is already pending; resolve it before scope amendment");
    if(this.db.prepare("SELECT release FROM dc_release_work_incrementals WHERE release=?")
      .get(input.release))issues.push("A separate work-item incremental amendment is pending");
    const byId=new Map(snapshot.plan.workItems.map(item=>[item.id,item]));
    for(const change of input.changes){
      const item=byId.get(change.taskId);
      const task=this.db.prepare("SELECT status,plan_id FROM dc_tasks WHERE id=?").get(change.taskId);
      if(!item||task?.plan_id!=="release-work:"+input.release){
        issues.push(change.taskId+": not in this frozen release");continue;
      }
      // A developer may discover a missing native/bootstrap file only AFTER
      // safely committing the already-authorized partial implementation.
      // Allow a proposal to be *staged* against the active, leased task so it
      // can then use pause-for-scope. This is NOT executable approval: the
      // original changed-file boundary remains enforced by pause, and the
      // task must become Ready before the independent-review/Owner approval.
      const lease=this.db.prepare(
        "SELECT * FROM dc_leases WHERE task_id=? AND expires_at>?",
      ).get(change.taskId,Date.now());
      const mayPause=task.status==="in_progress"&&!!lease&&
        !this.latestCompletion(change.taskId)&&
        !this.db.prepare("SELECT id FROM dc_evidence WHERE task_id=? LIMIT 1")
          .get(change.taskId)&&
        !this.db.prepare("SELECT task_id FROM dc_task_decisions WHERE task_id=?")
          .get(change.taskId);
      if(task.status!=="ready"&&!mayPause)
        issues.push(change.taskId+": only Ready or safely leased in-progress work awaiting pause may expand scope");
      for(const file of change.addAllowedPaths){
        if(item.allowedPaths.some(p=>pathAllowed(file,p)||file===p))
          issues.push(change.taskId+": "+file+" already covered by the frozen scope");
      }
    }
    return {passed:issues.length===0,issues,subjectHash:amendmentSubjectHash(input),
      release:input.release,baseRevision:input.baseRevision,
      affectedTaskIds:input.changes.map(c=>c.taskId)};
  }

  stageReleaseWorkScopeAmendment(input:ReleaseWorkScopeAmendment,actor:string):Row {
    if(typeof actor!=="string"||actor.trim().length<3)
      fail("ACTOR_REQUIRED","A real amendment proposer label is required");
    return this.inTransaction(()=>{
      const review=this.reviewReleaseWorkScopeAmendment(input);
      if(!review.passed)fail("AMENDMENT_INVALID",review.issues.join("; "));
      if(this.db.prepare("SELECT release FROM dc_release_work_amendments WHERE release=?").get(input.release))
        fail("AMENDMENT_PENDING","Resolve the existing scope amendment before proposing another");
      const now=utc();
      this.db.prepare(`INSERT INTO dc_release_work_amendments
        (release,proposal_hash,snapshot_json,proposed_by,proposed_at)
        VALUES(?,?,?,?,?)`).run(input.release,review.subjectHash,JSON.stringify(input),actor.trim(),now);
      this.audit(null,"release_scope_amendment_proposed",actor.trim(),{
        release:input.release,proposalHash:review.subjectHash,taskIds:review.affectedTaskIds,
        baseHash:input.baseHash});
      return {release:input.release,status:"awaiting_independent_review",
        proposalHash:review.subjectHash,review,executableScopeChanged:false,
        requiredAgentAction:makeReviewAgentAction({kind:"scope_amendment",
          release:input.release,proposalHash:review.subjectHash,reviewHash:null,
          affectedTaskIds:review.affectedTaskIds})};
    });
  }

  reviewStagedReleaseWorkScopeAmendment(release:string,
    review:ReleaseWorkAmendmentReview,expectedProposalHash:string):Row {
    return this.inTransaction(()=>{
      const row=this.db.prepare("SELECT * FROM dc_release_work_amendments WHERE release=?").get(release);
      if(!row||row.proposal_hash!==expectedProposalHash)
        fail("AMENDMENT_NOT_FOUND","No matching staged scope amendment");
      if(row.reviewed_json)fail("AMENDMENT_REVIEWED","The amendment has already been reviewed");
      const proposal=JSON.parse(row.snapshot_json) as ReleaseWorkScopeAmendment;
      const current=this.reviewReleaseWorkScopeAmendment(proposal);
      if(!current.passed||current.subjectHash!==row.proposal_hash)
        fail("STALE_AMENDMENT","Frozen plan or task state changed since the proposal");
      const issues=checkAmendmentReview(review,row.proposed_by,row.proposal_hash,
        proposal.changes.map(c=>c.taskId));
      if(!review.sourceRefs?.some(ref=>proposal.sourceRefs.includes(ref)))
        issues.push("Independent reviewer must cite a source from the staged amendment");
      if(issues.length)fail("INDEPENDENT_REVIEW_REQUIRED",issues.join("; "));
      const reviewHash=createHash("sha256").update(JSON.stringify(review)).digest("hex");
      this.db.prepare(`UPDATE dc_release_work_amendments SET reviewed_json=?,review_hash=?,
        reviewed_at=? WHERE release=?`).run(JSON.stringify(review),reviewHash,utc(),release);
      this.audit(null,"release_scope_amendment_reviewed",review.reviewer,{release,
        proposalHash:row.proposal_hash,reviewHash,taskIds:proposal.changes.map(c=>c.taskId)});
      return {release,status:"reviewed",proposalHash:row.proposal_hash,
        reviewHash,executableScopeChanged:false,
        requiredAgentAction:makeReviewAgentAction({kind:"scope_amendment",release,
          proposalHash:row.proposal_hash,reviewHash,
          affectedTaskIds:proposal.changes.map(change=>change.taskId)})};
    });
  }

  approveReleaseWorkScopeAmendment(input:{release:string;expectedProposalHash:string;
    expectedReviewHash:string;approvedBy:string;reason:string;explicitAuthorization:boolean}):Row {
    if(input?.explicitAuthorization!==true||typeof input.approvedBy!=="string"||
      input.approvedBy.trim().length<2||typeof input.reason!=="string"||
      input.reason.trim().length<20)
      fail("OWNER_AUTHORIZATION_REQUIRED","Explicit Owner authorization, identity label and reason required");
    return this.inTransaction(()=>{
      if(this.db.prepare("SELECT task_id FROM dc_leases WHERE singleton=1").get())
        fail("ACTIVE_TASK","An active task lease must finish before scope approval");
      const row=this.db.prepare("SELECT * FROM dc_release_work_amendments WHERE release=?")
        .get(input.release);
      if(!row||row.proposal_hash!==input.expectedProposalHash||!row.reviewed_json||
        row.review_hash!==input.expectedReviewHash)
        fail("AMENDMENT_REVIEW_REQUIRED","Exact staged proposal and independent review hashes required");
      const proposal=JSON.parse(row.snapshot_json) as ReleaseWorkScopeAmendment;
      const review=this.reviewReleaseWorkScopeAmendment(proposal);
      if(!review.passed||review.subjectHash!==row.proposal_hash)
        fail("STALE_AMENDMENT","Frozen release changed or affected tasks are no longer Ready");
      const frozen=this.db.prepare("SELECT * FROM dc_release_work_plans WHERE release=?").get(input.release)!;
      const old=JSON.parse(frozen.snapshot_json) as {plan:ReleaseWorkPlan;[key:string]:unknown};
      const additions=new Map(proposal.changes.map(change=>[change.taskId,change.addAllowedPaths]));
      const changed=old.plan.workItems.map(item=>({
        ...item,allowedPaths:additions.has(item.id)?
          [...item.allowedPaths,...additions.get(item.id)!]:item.allowedPaths,
      }));
      const now=utc(),revision=frozen.revision+1;
      const snapshot=JSON.stringify({...old,plan:{...old.plan,workItems:changed},
        scopeAmendment:{proposalHash:row.proposal_hash,reviewHash:row.review_hash,
          previousHash:frozen.hash,affectedTaskIds:[...additions.keys()],
          approvedBy:input.approvedBy.trim(),reason:input.reason.trim()}});
      const hash=createHash("sha256").update(snapshot).digest("hex");
      for(const [id,paths] of additions){
        const item=changed.find(entry=>entry.id===id)!;
        this.db.prepare("UPDATE dc_tasks SET allowed_paths=?,updated_at=? WHERE id=?")
          .run(JSON.stringify(item.allowedPaths),now,id);
        this.db.prepare("UPDATE dc_task_specs SET plan_revision=? WHERE task_id=?")
          .run(revision,id);
      }
      this.db.prepare(`UPDATE dc_release_work_plans SET revision=?,hash=?,snapshot_json=?,
        approved_by=?,approved_at=? WHERE release=?`).run(revision,hash,snapshot,
        input.approvedBy.trim(),now,input.release);
      this.db.prepare(`INSERT INTO dc_release_work_history
        (release,revision,hash,snapshot_json,approved_by,approved_at) VALUES(?,?,?,?,?,?)`)
        .run(input.release,revision,hash,snapshot,input.approvedBy.trim(),now);
      this.db.prepare("DELETE FROM dc_release_work_amendments WHERE release=?").run(input.release);
      this.audit(null,"release_scope_amendment_approved",input.approvedBy.trim(),{
        release:input.release,previousHash:frozen.hash,hash,revision,
        proposalHash:row.proposal_hash,reviewHash:row.review_hash,
        affectedTaskIds:[...additions.keys()]});
      return {release:input.release,status:"frozen",revision,hash,
        previousHash:frozen.hash,affectedTaskIds:[...additions.keys()],
        scopeOnly:true,approvedBy:input.approvedBy.trim()};
    });
  }

  releaseWorkIncrementalAmendment(release:string):Row|null {
    const row=this.db.prepare("SELECT * FROM dc_release_work_incrementals WHERE release=?")
      .get(release);
    if(!row)return null;
    const proposal=JSON.parse(row.snapshot_json) as ReleaseWorkIncrementalAmendment;
    const affected=[...new Set([...proposal.addWorkItems.map(item=>item.id),
      ...proposal.addDependencies.map(change=>change.taskId)])];
    return {release,proposalHash:row.proposal_hash,proposal,
      proposedBy:row.proposed_by,review:row.reviewed_json?JSON.parse(row.reviewed_json):null,
      reviewHash:row.review_hash??null,
      status:row.reviewed_json?"reviewed":"awaiting_independent_review",
      requiredAgentAction:makeReviewAgentAction({kind:"incremental_work",release,
        proposalHash:row.proposal_hash,reviewHash:row.review_hash??null,
        affectedTaskIds:affected})};
  }

  private taskAwaitsIncrementalReview(id:string,release:string):boolean {
    const pending=this.db.prepare(
      "SELECT snapshot_json FROM dc_release_work_incrementals WHERE release=?").get(release);
    if(!pending)return false;
    const proposal=JSON.parse(pending.snapshot_json) as ReleaseWorkIncrementalAmendment;
    return proposal.addDependencies.some(change=>change.taskId===id);
  }

  /** Read-only review: exact frozen baseline, no edits to accepted tasks, and
   * no dependent QA may be completed before the newly inserted prerequisite. */
  reviewReleaseWorkIncremental(input:ReleaseWorkIncrementalAmendment):Row {
    const issues=checkIncrementalShape(input);
    if(issues.length)return {passed:false,issues};
    const frozen=this.db.prepare("SELECT * FROM dc_release_work_plans WHERE release=?")
      .get(input.release);
    if(!frozen)return {passed:false,issues:["No frozen release to extend"]};
    if(input.baseHash!==frozen.hash||input.baseRevision!==frozen.revision)
      issues.push("Frozen release revision/hash drift: refresh the entire amendment");
    if(this.db.prepare("SELECT release FROM dc_release_work_proposals WHERE release=?")
      .get(input.release))issues.push("Whole-release planning proposal is pending");
    if(this.db.prepare("SELECT release FROM dc_release_work_amendments WHERE release=?")
      .get(input.release))issues.push("Alternative frozen-scope proposal is still pending");
    const approved=JSON.parse(frozen.snapshot_json) as {plan:ReleaseWorkPlan;
      sourceHash:string;features:{name:string;revision:number;hash:string}[]};
    // A frozen Git scope source and Feature specifications must still match
    // their reviewed baseline, rather than silently inheriting a drift.
    try {
      const source=fs.readFileSync(path.resolve(this.root,approved.plan.scopeSource));
      if(createHash("sha256").update(source).digest("hex")!==approved.sourceHash)
        issues.push("Frozen version scope source changed since approval");
    } catch {issues.push("Frozen version scope source is not readable");}
    for(const binding of approved.features??[])
      if(!this.featureBindingMatches(binding))
        issues.push("Frozen Feature binding changed: "+binding.name);
    const oldItems=approved.plan.workItems;
    const existing=new Map(oldItems.map(item=>[item.id,item]));
    const added=new Map<string,(typeof input.addWorkItems)[number]>();
    const ids=new Set<string>(existing.keys());
    const knownGates=allowedGates;
    const stages=new Set(approved.plan.stages.map(stage=>stage.id));
    for(const item of input.addWorkItems){
      if(!item||!idPattern.test(item.id??"")||ids.has(item.id)||
        this.db.prepare("SELECT id FROM dc_tasks WHERE id=?").get(item.id)){
        issues.push("New task ID must be unique and unused: "+String(item?.id));continue;
      }
      ids.add(item.id);added.set(item.id,item);
      if(!stages.has(item.stageId))issues.push(item.id+": not in this frozen release stage");
      if(typeof item.title!=="string"||item.title.trim().length<4||item.title.length>65||
        /[；;\n]|(?:以及|同时完成|全部功能|整个版本)/.test(item.title))
        issues.push(item.id+": title must express one atomic action");
      if(oldItems.some(old=>old.stageId===item.stageId&&old.title===item.title))
        issues.push(item.id+": duplicates an existing task objective");
      if(!item.platform?.trim()||(!item.owner?.trim()&&!item.ownerRole?.trim()))
        issues.push(item.id+": platform and accountable role required");
      if(!item.acceptance?.trim()||item.acceptance.trim().length<12)
        issues.push(item.id+": precise testable acceptance required");
      if(!["analysis","decision","coordination","development","testing","integration","bugfix","release"].includes(item.type))
        issues.push(item.id+": invalid work type");
      try {safePaths(item.allowedPaths,
        item.type==="decision"&&item.requiredGates?.length===1&&item.requiredGates[0]==="sqlite_decision");}
      catch {issues.push(item.id+": unsafe file permissions");}
      if(!Array.isArray(item.requiredGates)||!item.requiredGates.length||
        item.requiredGates.some(gate=>!knownGates.has(gate)))
        issues.push(item.id+": approved real verification gate required");
      if(item.requiredGates?.includes("sqlite_decision")&&
        (item.type!=="decision"||item.requiredGates.length!==1||item.allowedPaths.length))
        issues.push(item.id+": cannot mix SQLite-only decision with code gates");
      if(item.estimatedHours!==undefined&&
        (!Number.isFinite(item.estimatedHours)||item.estimatedHours<=0||item.estimatedHours>8))
        issues.push(item.id+": split work greater than eight hours");
      if(approved.plan.qualityProfile==="task-detail-v1")
        issues.push(...reviewDetailedWorkItems([item]));
    }
    const additions=new Set(input.addDependencies.map(change=>change.taskId));
    if(additions.size!==input.addDependencies.length)
      issues.push("Dependency amendments may affect a Ready task only once");
    const graph=new Map<string,string[]>(oldItems.map(item=>[item.id,[...(item.dependsOn??[])]]));
    for(const item of added.values())graph.set(item.id,[...(item.dependsOn??[])]);
    for(const change of input.addDependencies){
      const old=existing.get(change.taskId);
      const task=this.db.prepare("SELECT status,plan_id FROM dc_tasks WHERE id=?")
        .get(change.taskId);
      if(!old||task?.plan_id!=="release-work:"+input.release||task.status!=="ready"){
        issues.push(change.taskId+": may append prerequisites only to unclaimed Ready frozen tasks");
        continue;
      }
      if(!Array.isArray(change.dependsOn)||!change.dependsOn.length||
        change.dependsOn.some(id=>!added.has(id))||
        new Set(change.dependsOn).size!==change.dependsOn.length)
        issues.push(change.taskId+": added prerequisites must be new unique task IDs");
      graph.set(change.taskId,[...(graph.get(change.taskId)??[]),...change.dependsOn]);
    }
    for(const id of added.keys()) {
      const dependents=[...input.addDependencies,...[...added.values()].map(item=>({
        taskId:item.id,dependsOn:item.dependsOn??[],
      }))].filter(item=>item.dependsOn.includes(id));
      if(!dependents.length)issues.push(id+": new task is orphaned from the release dependency chain");
    }
    const visited=new Set<string>(),active=new Set<string>();
    const walk=(id:string):void=>{
      if(active.has(id)){issues.push(id+": cyclic release dependency");return;}
      if(visited.has(id))return;
      active.add(id);
      for(const dep of graph.get(id)??[]){
        if(graph.has(dep))walk(dep);
        else {
          const external=this.db.prepare("SELECT status FROM dc_tasks WHERE id=?").get(dep);
          // Legacy frozen work rosters may depend on a separately verified
          // stage gate. Such an unchanged historical prerequisite is valid.
          if(external?.status!=="verified")issues.push(id+": unknown or unverified external dependency "+dep);
        }
      }
      active.delete(id);visited.add(id);
    };
    for(const id of graph.keys())walk(id);
    return {passed:issues.length===0,issues,
      subjectHash:incrementalSubjectHash(input),release:input.release,
      baseRevision:input.baseRevision,
      affectedTaskIds:[...added.keys(),...additions]};
  }

  stageReleaseWorkIncremental(input:ReleaseWorkIncrementalAmendment,actor:string):Row {
    if(typeof actor!=="string"||actor.trim().length<3)
      fail("ACTOR_REQUIRED","Specific proposal agent label required");
    return this.inTransaction(()=>{
      const review=this.reviewReleaseWorkIncremental(input);
      if(!review.passed)fail("INCREMENTAL_INVALID",review.issues.join("; "));
      if(this.db.prepare("SELECT release FROM dc_release_work_incrementals WHERE release=?")
        .get(input.release))fail("INCREMENTAL_PENDING","Resolve previous incremental first");
      this.db.prepare(`INSERT INTO dc_release_work_incrementals
        (release,proposal_hash,snapshot_json,proposed_by,proposed_at)
        VALUES(?,?,?,?,?)`).run(input.release,review.subjectHash,JSON.stringify(input),actor.trim(),utc());
      this.audit(null,"release_incremental_proposed",actor.trim(),{
        release:input.release,proposalHash:review.subjectHash,affectedTaskIds:review.affectedTaskIds});
      return {release:input.release,status:"awaiting_independent_review",
        proposalHash:review.subjectHash,review,executableTasksChanged:false,
        requiredAgentAction:makeReviewAgentAction({kind:"incremental_work",
          release:input.release,proposalHash:review.subjectHash,reviewHash:null,
          affectedTaskIds:review.affectedTaskIds})};
    });
  }

  reviewStagedReleaseWorkIncremental(release:string,review:ReleaseWorkIncrementalReview,
    expectedProposalHash:string):Row {
    return this.inTransaction(()=>{
      const row=this.db.prepare("SELECT * FROM dc_release_work_incrementals WHERE release=?")
        .get(release);
      if(!row||row.proposal_hash!==expectedProposalHash||row.reviewed_json)
        fail("INCREMENTAL_REVIEW_REQUIRED","Exact new, unreviewed proposal required");
      const input=JSON.parse(row.snapshot_json) as ReleaseWorkIncrementalAmendment;
      const checked=this.reviewReleaseWorkIncremental(input);
      if(!checked.passed||checked.subjectHash!==row.proposal_hash)
        fail("STALE_INCREMENTAL","Frozen release changed during independent review");
      const issues=checkIncrementalIndependentReview(review,row.proposed_by,row.proposal_hash,
        checked.affectedTaskIds,input.sourceRefs);
      if(issues.length)fail("INDEPENDENT_REVIEW_REQUIRED",issues.join("; "));
      const reviewHash=createHash("sha256").update(JSON.stringify(review)).digest("hex");
      this.db.prepare(`UPDATE dc_release_work_incrementals SET reviewed_json=?,review_hash=?,
        reviewed_at=? WHERE release=?`).run(JSON.stringify(review),reviewHash,utc(),release);
      this.audit(null,"release_incremental_reviewed",review.reviewer,{release,
        proposalHash:row.proposal_hash,reviewHash});
      return {release,status:"reviewed",proposalHash:row.proposal_hash,
        reviewHash,executableTasksChanged:false,
        requiredAgentAction:makeReviewAgentAction({kind:"incremental_work",release,
          proposalHash:row.proposal_hash,reviewHash,
          affectedTaskIds:checked.affectedTaskIds})};
    });
  }

  approveReleaseWorkIncremental(input:{release:string;expectedProposalHash:string;
    expectedReviewHash:string;approvedBy:string;reason:string;explicitAuthorization:boolean}):Row {
    if(input?.explicitAuthorization!==true||!input.approvedBy?.trim()||
      typeof input.reason!=="string"||input.reason.trim().length<25)
      fail("OWNER_AUTHORIZATION_REQUIRED","Owner must explicitly approve both exact hashes");
    return this.inTransaction(()=>{
      if(this.db.prepare("SELECT task_id FROM dc_leases WHERE singleton=1").get())
        fail("ACTIVE_TASK","Complete or release the current lease before changing frozen work");
      const pending=this.db.prepare("SELECT * FROM dc_release_work_incrementals WHERE release=?")
        .get(input.release);
      if(!pending||pending.proposal_hash!==input.expectedProposalHash||
        !pending.reviewed_json||pending.review_hash!==input.expectedReviewHash)
        fail("INCREMENTAL_REVIEW_REQUIRED","Exact independently reviewed amendment hashes required");
      const proposal=JSON.parse(pending.snapshot_json) as ReleaseWorkIncrementalAmendment;
      const checked=this.reviewReleaseWorkIncremental(proposal);
      if(!checked.passed||checked.subjectHash!==pending.proposal_hash)
        fail("STALE_INCREMENTAL","The frozen baseline or Ready dependencies changed");
      const frozen=this.db.prepare("SELECT * FROM dc_release_work_plans WHERE release=?")
        .get(input.release)!;
      const original=JSON.parse(frozen.snapshot_json) as {plan:ReleaseWorkPlan;[key:string]:unknown};
      const revision=frozen.revision+1,now=utc();
      const extras=new Map(proposal.addDependencies.map(d=>[d.taskId,d.dependsOn]));
      const oldItems=original.plan.workItems.map(item=>({...item,
        dependsOn:extras.has(item.id)?[...(item.dependsOn??[]),...extras.get(item.id)!]:item.dependsOn,
      }));
      const nextPlan={...original.plan,workItems:[...oldItems,...proposal.addWorkItems]};
      // Nothing in the previously approved tasks except explicit new
      // prerequisites changes. Freeze both the provenance and new roster.
      const snapshot=JSON.stringify({...original,plan:nextPlan,
        incrementalWorkAmendment:{proposalHash:pending.proposal_hash,
          reviewHash:pending.review_hash,previousHash:frozen.hash,
          affectedTaskIds:checked.affectedTaskIds,approvedBy:input.approvedBy.trim(),
          reason:input.reason.trim()}});
      const hash=createHash("sha256").update(snapshot).digest("hex");
      for(const item of proposal.addWorkItems){
        this.create({id:item.id,title:item.title,release:input.release,track:"product",
          dependsOn:[],allowedPaths:item.allowedPaths,requiredGates:item.requiredGates,
          priority:item.priority,planId:"release-work:"+input.release,
          specId:item.featureName?"feature:"+item.featureName:"#release-work:"+input.release},
        input.approvedBy.trim());
        this.db.prepare("UPDATE dc_tasks SET status='ready',approved_by=?,updated_at=? WHERE id=?")
          .run(input.approvedBy.trim(),now,item.id);
        this.db.prepare(`UPDATE dc_task_assignments SET owner=?,assigned_by=?,
          decision_ref=?,identity_source=? WHERE task_id=?`).run(item.owner??"",
          input.approvedBy.trim(),"release-work:"+hash,"release-planning",item.id);
        this.db.prepare(`INSERT INTO dc_task_specs
          (task_id,requirement_ids_json,acceptance,design_ref,positive_tests_json,
           negative_cases_json,out_of_scope_json,deliverables_json,estimated_hours,plan_revision)
          VALUES(?,?,?,?,?,?,?,?,?,?)`).run(item.id,JSON.stringify(item.requirementIds??[]),
          item.acceptance,item.featureName?"feature:"+item.featureName+"#design":"release:"+input.release,
          JSON.stringify(item.testCases??[]),JSON.stringify(item.negativeCases??[]),
          JSON.stringify(item.outOfScope??[]),JSON.stringify([item.title]),item.estimatedHours??null,
          revision);
        for(const dep of item.dependsOn??[])
          this.db.prepare("INSERT INTO dc_dependencies(task_id,depends_on) VALUES(?,?)")
            .run(item.id,dep);
      }
      for(const change of proposal.addDependencies){
        for(const dep of change.dependsOn)
          this.db.prepare("INSERT INTO dc_dependencies(task_id,depends_on) VALUES(?,?)")
            .run(change.taskId,dep);
        this.db.prepare("UPDATE dc_tasks SET updated_at=? WHERE id=?")
          .run(now,change.taskId);
      }
      this.db.prepare(`UPDATE dc_release_work_plans SET revision=?,hash=?,snapshot_json=?,
        approved_by=?,approved_at=? WHERE release=?`).run(revision,hash,snapshot,
        input.approvedBy.trim(),now,input.release);
      this.db.prepare(`INSERT INTO dc_release_work_history
        (release,revision,hash,snapshot_json,approved_by,approved_at) VALUES(?,?,?,?,?,?)`)
        .run(input.release,revision,hash,snapshot,input.approvedBy.trim(),now);
      this.db.prepare("DELETE FROM dc_release_work_incrementals WHERE release=?").run(input.release);
      this.audit(null,"release_incremental_approved",input.approvedBy.trim(),{
        release:input.release,previousHash:frozen.hash,hash,revision,
        proposalHash:pending.proposal_hash,reviewHash:pending.review_hash,
        affectedTaskIds:checked.affectedTaskIds,reason:input.reason.trim()});
      return {release:input.release,revision,hash,previousHash:frozen.hash,
        added:proposal.addWorkItems.map(item=>item.id),
        blockedByNewPrerequisite:proposal.addDependencies.map(d=>d.taskId),
        status:"frozen",approvedBy:input.approvedBy.trim()};
    });
  }

  /** Retire an unreviewed alternative after Owner chooses a different path.
   * This never changes the frozen task's permissions, gates or status. */
  withdrawReleaseWorkScopeAmendment(input:{release:string;expectedProposalHash:string;
    approvedBy:string;reason:string;explicitAuthorization:boolean}):Row {
    if(input?.explicitAuthorization!==true||!input.approvedBy?.trim()||
      typeof input.reason!=="string"||input.reason.trim().length<25)
      fail("OWNER_AUTHORIZATION_REQUIRED","Owner authorization and a concrete withdrawal reason required");
    return this.inTransaction(()=>{
      const row=this.db.prepare("SELECT * FROM dc_release_work_amendments WHERE release=?")
        .get(input.release);
      if(!row||row.proposal_hash!==input.expectedProposalHash||row.reviewed_json)
        fail("AMENDMENT_WITHDRAWAL_REVIEW_REQUIRED",
          "Only the exact unreviewed proposal may be retired; reviewed plans need separate governance");
      this.db.prepare("DELETE FROM dc_release_work_amendments WHERE release=?").run(input.release);
      this.audit(null,"release_scope_amendment_withdrawn",input.approvedBy.trim(),{
        release:input.release,proposalHash:row.proposal_hash,reason:input.reason.trim()});
      return {release:input.release,withdrawn:true,proposalHash:row.proposal_hash,
        executableScopeChanged:false};
    });
  }

  reviewReleaseWork(input: ReleaseWorkPlan): Row {
    const issues:string[]=[];
    if(!input||!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,39}$/.test(input.release??"")) {
      return {passed:false,issues:["Invalid release version"],stageCount:0,workItemCount:0};
    }
    const scope=input.scopeSource;
    let expected:string[]=[];
    let sourceHash="";
    if(typeof scope!=="string"||!/^docs\/[a-zA-Z0-9/._-]+\.md$/.test(scope)||
      scope.split("/").includes("..")) issues.push("Release needs a safe canonical Git scope document");
    else try {
      const real=fs.realpathSync(path.resolve(this.root,scope));
      if(!real.startsWith(fs.realpathSync(this.root)+path.sep)) throw new Error("outside project");
      const body=fs.readFileSync(real,"utf8");
      expected=scopeStages(body);
      sourceHash=createHash("sha256").update(body).digest("hex");
      if(!run(this.root,"git",["ls-files","--error-unmatch","--",scope],12_000).passed ||
        !run(this.root,"git",["diff","--quiet","HEAD","--",scope],12_000).passed)
        issues.push("Release scope source must be committed and unchanged");
      if(!expected.length) issues.push("No milestone/stage identifiers found in release scope");
    } catch { issues.push("Release scope document missing or outside Git project"); }
    const stages=Array.isArray(input.stages)?input.stages:[];
    const ids=stages.map(s=>s.id);
    if(new Set(ids).size!==ids.length) issues.push("Duplicate release stages");
    for(const id of expected) if(!ids.includes(id)) issues.push("Missing version stage "+id);
    for(const id of ids) if(!expected.includes(id)) issues.push("Unknown version stage "+id);
    const usedFeatures=new Set<string>(),completeFeatures:string[]=[];
    const workItems=Array.isArray(input.workItems)?input.workItems:[];
    const existingIds=new Set<string>(this.db.prepare(
      "SELECT id FROM dc_tasks WHERE status='verified'"
    ).all().map(row=>String(row.id)));
    issues.push(...reviewAtomicWorkItems(workItems,ids,existingIds));
    if(input.qualityProfile==="task-detail-v1")
      issues.push(...reviewDetailedWorkItems(workItems),...reviewTaskQualityJudgments(input));
    else if(input.qualityProfile!==undefined)
      issues.push("Unknown release task detail quality profile");
    // The host Agent is responsible for semantic judgement. DevControl only
    // verifies a separate review artifact tied to the exact roster snapshot.
    issues.push(...reviewAgentReview(input));
    const declaredRequirements=input.requiredRequirementIds??[];
    if(stages.some(s=>(s.features??[]).length>0)&&!declaredRequirements.length)
      issues.push("Whole-version FR/NFR baseline is missing: requiredRequirementIds");
    if(new Set(declaredRequirements).size!==declaredRequirements.length)
      issues.push("Duplicate requirement ID in whole-version baseline");
    const covered=new Set(workItems.flatMap(item=>item.requirementIds??[]));
    for(const req of declaredRequirements)if(!covered.has(req))
      issues.push("Whole-version requirement "+req+" has no independent work item");
    if(declaredRequirements.length) {
      const source=input.requirementsSource??"";
      if(!/^docs\/[a-zA-Z0-9/._-]+\.md$/.test(source)||source.includes(".."))
        issues.push("A safe Git PRD requirementsSource is required");
      else try {
        const body=fs.readFileSync(path.resolve(this.root,source),"utf8");
        for(const req of declaredRequirements)if(!body.includes("| "+req+" |"))
          issues.push("Requirement "+req+" is not in Git PRD source");
      }catch{issues.push("Requirements source cannot be read");}
    }
    const findings=input.reviewFindings??[];
    if(!Array.isArray(findings)||new Set(findings.map(f=>f.id)).size!==findings.length)
      issues.push("Version review findings must have unique IDs");
    else for(const finding of findings) {
      if(!finding.id?.trim()||!finding.title?.trim()||!finding.detail?.trim()||
        !["blocker","warning"].includes(finding.severity)||
        !["open","resolved"].includes(finding.status))
        issues.push("Invalid version review finding");
      else {
        // Engineering design approval and real-world verification are distinct.
        // A pending implementation is work *after* plan approval, not a reason
        // to deadlock the entire version before any task can be claimed.
        const decided=finding.decisionStatus==="decided"&&
          typeof finding.decision==="string"&&finding.decision.trim().length>=25&&
          typeof finding.nextAction==="string"&&finding.nextAction.trim().length>=20;
        const proof=(finding.verificationEvidenceRefs??[]).filter(
          ref=>typeof ref==="string"&&ref.trim().length>=8);
        if(finding.decisionStatus&&
          !["decided","pending"].includes(finding.decisionStatus))
          issues.push("Invalid engineering decision state "+finding.id);
        if(finding.verificationStatus&&
          !["pending","passed","not_required"].includes(finding.verificationStatus))
          issues.push("Invalid verification state "+finding.id);
        if(finding.verificationStatus==="passed"&&
          (!proof.length||finding.status!=="resolved"))
          issues.push("Verification cannot pass without evidence and resolution: "+finding.id);
        if(finding.status==="resolved"&&finding.verificationStatus==="pending")
          issues.push("Unverified product outcome cannot be closed: "+finding.id);
        if(finding.severity==="blocker"&&finding.status==="open"&&
          !(decided&&finding.verificationStatus==="pending"&&
            Array.isArray(finding.affectedIds)&&finding.affectedIds.length>0&&
            finding.affectedIds.every((id:string)=>
              workItems.some(item=>item.id===id))))
          issues.push("Version review blocker "+finding.id+": "+finding.title);
      }
    }
    for(const stage of stages) {
      const tasks=workItems.filter(item=>item.stageId===stage.id);
      const verified=stage.verifiedTaskIds??[];
      if(!tasks.length&&!verified.length)issues.push(stage.id+": no independent work item or verified deliverable");
      for(const id of verified) {
        const record=this.db.prepare("SELECT status,release FROM dc_tasks WHERE id=?").get(id);
        if(record?.status!=="verified"||record?.release!==input.release)
          issues.push(stage.id+": "+id+" is not a verified historical task of this version");
      }
      for(const name of stage.features??[]) {
        if(usedFeatures.has(name))issues.push("Feature appears in more than one stage: "+name);
        usedFeatures.add(name);
        try{
          const brief=this.featureTaskBrief(name);
          if(brief.feature.status!=="specified")
            issues.push(stage.id+": "+name+" requirements/design are still draft");
          const linked=tasks.filter(item=>item.featureName===name);
          if(!linked.length)issues.push(stage.id+": Feature "+name+" has no independent work items");
          for(const req of brief.requirementIds as string[]) {
            if(!linked.some(item=>item.requirementIds?.includes(req)))
              issues.push(stage.id+": "+name+" requirement "+req+" has no task");
          }
          completeFeatures.push(name);
        }catch{issues.push(stage.id+": unknown Feature "+name);}
      }
      for(const item of tasks)if(item.featureName&&!(stage.features??[]).includes(item.featureName))
        issues.push(item.id+": Feature "+item.featureName+" not assigned to stage "+stage.id);
    }
    if(typeof input.rationale!=="string"||input.rationale.trim().length<25)
      issues.push("Summarize complete-version coverage and exclusions");
    return {passed:issues.length===0,issues,release:input.release,
      expectedStages:expected,stageCount:stages.length,plannedFeatures:completeFeatures,
      workItemCount:workItems.length,sourceHash,
      reviewSubjectHash:releaseReviewSubjectHash(input)};
  }

  stageReleaseWork(input: ReleaseWorkPlan, actor:string, expectedPreviousHash?:string): Row {
    if(!actor?.trim())fail("ACTOR_REQUIRED","Planning agent identity required");
    const review=this.reviewReleaseWork(input);
    const raw=JSON.stringify({plan:input,review});
    if(raw.length>3_000_000)fail("PLAN_TOO_LARGE","Release work roster exceeds limit");
    const hash=createHash("sha256").update(raw).digest("hex");
    return this.inTransaction(()=>{
      const pending=this.db.prepare("SELECT hash FROM dc_release_work_proposals WHERE release=?").get(input.release);
      if(pending?.hash!==hash && pending && pending.hash!==expectedPreviousHash)
        fail("PROPOSAL_PENDING","Use exact previous hash to revise the version work roster");
      if(!pending&&expectedPreviousHash)fail("STALE_DRAFT","Previous release proposal not found");
      this.db.prepare(`INSERT INTO dc_release_work_proposals
        (release,hash,snapshot_json,proposed_by,proposed_at) VALUES(?,?,?,?,?)
        ON CONFLICT(release) DO UPDATE SET hash=excluded.hash,snapshot_json=excluded.snapshot_json,
        proposed_by=excluded.proposed_by,proposed_at=excluded.proposed_at`)
        .run(input.release,hash,raw,actor.trim(),utc());
      this.audit(null,"release_work_staged",actor,{release:input.release,hash,
        plannedFeatures:review.plannedFeatures,issues:review.issues.length});
      return {release:input.release,hash,status:review.passed?"review_pending":"needs_revision",
        review,executableTasksCreated:0};
    });
  }

  approveReleaseWork(release:string, expectedHash:string):Row {
    if(!/^[a-f0-9]{64}$/.test(expectedHash))
      fail("PLAN_APPROVAL_REQUIRED","Exact whole-release proposal hash required");
    return this.inTransaction(()=>{
      const row=this.db.prepare("SELECT * FROM dc_release_work_proposals WHERE release=?").get(release);
      if(!row||row.hash!==expectedHash)fail("PLAN_REVIEW_MISMATCH","Version proposal changed");
      if(this.db.prepare("SELECT task_id FROM dc_leases WHERE singleton=1").get())
        fail("ACTIVE_TASK","Wait until the active task is reviewed");
      const {plan,review:original}=JSON.parse(row.snapshot_json) as {plan:ReleaseWorkPlan;review:Row};
      const review=this.reviewReleaseWork(plan);
      if(!review.passed||review.sourceHash!==original.sourceHash)
        fail("INCOMPLETE_RELEASE_WORK",review.issues.join("; ")||"Release source changed");
      if(this.db.prepare("SELECT release FROM dc_release_work_plans WHERE release=?").get(release))
        fail("RELEASE_CHANGE_REVIEW_REQUIRED","Frozen release amendments need a separate revision review");
      const approver=String(this.localDeveloper().name||this.localDeveloper().device||"local-computer");
      // Every record below is one independent task row. Feature Specs are source
      // references, not another layer of multi-step executable tasks.
      const added:string[]=[];
      for(const item of plan.workItems) {
        this.create({id:item.id,title:item.title,release,track:"product",
          dependsOn:[],allowedPaths:item.allowedPaths,requiredGates:item.requiredGates,
          priority:item.priority,planId:"release-work:"+release,
          specId:item.featureName?"feature:"+item.featureName:"#release-work:"+release},approver);
        this.db.prepare("UPDATE dc_tasks SET status='ready',approved_by=?,updated_at=? WHERE id=?")
          .run(approver,utc(),item.id);
        this.db.prepare("UPDATE dc_task_assignments SET owner=?,assigned_by=?,decision_ref=?,identity_source=? WHERE task_id=?")
          .run(item.owner??"",approver,"release-work:"+row.hash,"release-planning",item.id);
        this.db.prepare(`INSERT INTO dc_task_specs
          (task_id,requirement_ids_json,acceptance,design_ref,positive_tests_json,
           negative_cases_json,out_of_scope_json,deliverables_json,estimated_hours,plan_revision)
           VALUES(?,?,?,?,?,?,?,?,?,?)`).run(item.id,
            JSON.stringify(item.requirementIds??[]),item.acceptance,
            item.featureName?"feature:"+item.featureName+"#design":"release:"+release,
            "[]","[]","[]",JSON.stringify([item.title]),item.estimatedHours??null,1);
        added.push(item.id);
      }
      for(const item of plan.workItems)for(const dep of item.dependsOn??[]) {
        this.db.prepare("INSERT INTO dc_dependencies(task_id,depends_on) VALUES(?,?)").run(item.id,dep);
      }
      const snapshot=JSON.stringify({plan,sourceHash:review.sourceHash,
        features:plan.stages.flatMap(s=>(s.features??[]).map(name=>this.featureBinding(name)))});
      const now=utc();
      this.db.prepare(`INSERT INTO dc_release_work_plans
        (release,revision,hash,snapshot_json,approved_by,approved_at) VALUES(?,?,?,?,?,?)`)
        .run(release,1,row.hash,snapshot,approver,now);
      this.db.prepare(`INSERT INTO dc_release_work_history
        (release,revision,hash,snapshot_json,approved_by,approved_at) VALUES(?,?,?,?,?,?)`)
        .run(release,1,row.hash,snapshot,approver,now);
      this.db.prepare("DELETE FROM dc_release_work_proposals WHERE release=?").run(release);
      this.audit(null,"release_work_approved",approver,{release,hash:row.hash,added});
      return {release,status:"frozen",hash:row.hash,added,approvedBy:approver};
    });
  }

  /** Track the machine that created or claimed a task, not a permission role. */
  private recordLocalDeveloper(id:string,event:"created"|"claimed"):void {
    const local=this.localDeveloper();
    const device=actorInfo(this.root).device;
    const owner=String(local.name||device).slice(0,120);
    const prior=this.db.prepare(
      "SELECT owner,device FROM dc_task_assignments WHERE task_id=?",
    ).get(id);
    // Same workstation reclaims should not generate redundant owner history.
    if(prior?.owner===owner&&prior.device===device)return;
    this.db.prepare(`INSERT INTO dc_task_assignments
      (task_id,owner,assigned_by,decision_ref,assigned_at,device,identity_source)
      VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(task_id) DO UPDATE SET owner=excluded.owner,
      assigned_by=excluded.assigned_by,decision_ref=excluded.decision_ref,
      assigned_at=excluded.assigned_at,device=excluded.device,
      identity_source=excluded.identity_source`).run(
      id,owner,owner,"local-git:"+event,utc(),device,String(local.source));
    this.audit(id,prior?"developer_changed":"developer_recorded",owner,{
      event,previousOwner:prior?.owner??null,previousDevice:prior?.device??null,
      owner,device,source:local.source,
    });
  }

  /** A reviewable, frozen execution brief, not an invitation to redesign. */
  taskDetailAudit(id:string):Row {
    const task=this.get(id);
    const roster=this.releaseWorkPlan(String(task.release));
    const item=(roster.status==="frozen"?roster.frozen?.plan?.workItems:
      roster.proposal?.plan?.workItems)?.find((entry:{id:string})=>entry.id===id);
    if(!item)return {taskId:id,scope:"not-in-release-work-plan",audit:null};
    const audit=auditAtomicWorkItemDetail(item);
    return {scope:roster.status,release:task.release,
      planHash:roster.frozenHash??roster.proposalHash??null,
      qualityProfile:(roster.status==="frozen"?roster.frozen?.plan:roster.proposal?.plan)?.qualityProfile??"legacy",
      ...audit,retroactiveGateApplied:false};
  }

  /** A reviewable, frozen execution brief, not an invitation to redesign. */
  executionContract(id:string):Row {
    const task=this.get(id);
    const gateScopeIssues=missingGatePrerequisiteScope(
      this.root,task.requiredGates,task.allowedPaths);
    if(String(task.planId??"").startsWith("release-work:")) {
      const release=String(task.release);
      const frozen=this.releaseWorkPlan(release);
      const item=frozen.frozen?.plan?.workItems?.find((entry:{id:string})=>entry.id===id);
      const frozenEligible=!!item&&this.isApprovedForExecution(this.requireTask(id));
      const eligible=frozenEligible&&gateScopeIssues.length===0;
      return {taskId:id,eligible,
        issues:[...(!frozenEligible?["Whole-release task roster has not been frozen or source changed"]:[]),
          ...gateScopeIssues],
        profile:"atomic-work-item",release,planHash:frozen.frozenHash,
        spec:item??null,owner:task.owner,dependencies:task.dependsOn,
        deliveryModes:item?.type==="decision"?["sqlite-decision","legacy-git"]:["git"],
        allowedPaths:task.allowedPaths,requiredGates:task.requiredGates,
        limits:"Complete ONE assigned work item and its single acceptance condition; new scope requires release change review."};
    }
    if (task.planId?.startsWith("feature:")) {
      const name=String(task.planId).slice("feature:".length).replace(/:v\d+$/,"");
      const approved=this.featureTaskPlan(name);
      const snapshot=approved.frozen as Row|null;
      const node=(snapshot?.plan?.nodes as ReleasePlanNode[]|undefined)?.find(item=>item.id===id);
      const issues:string[]=[];
      if(!snapshot||!node||node.kind!=="leaf")issues.push("No frozen Feature leaf execution contract");
      if(approved.sourceDrift)issues.push("start_feature source revision changed after Owner approval");
      if(node?.openQuestions?.length)issues.push("Unresolved design choices in Feature task");
      if(task.status==="draft"||task.status==="cancelled")issues.push("Task is not approved for development");
      issues.push(...gateScopeIssues);
      return {taskId:id,eligible:issues.length===0,issues,
        profile:"spec-depth-v3",planHash:approved.hash,featureName:name,
        featureRevision:snapshot?.sourceFeature?.revision??null,
        owner:task.owner??this.localDeveloper().name,assignment:task.ownerAssignment,
        spec:node??null,allowedPaths:task.allowedPaths,requiredGates:task.requiredGates,
        dependencies:task.dependsOn,approvedBy:task.approvedBy,
        limits:"Only this approved Feature leaf, exact files and tests. New ideas return to planning.",
      };
    }
    const frozen=this.releasePlan(task.release);
    const plan=frozen.frozen as ReleasePlanProposal|null;
    const node=plan?.nodes.find((item:ReleasePlanNode)=>item.id===id);
    const strict=(plan?.qualityProfile==="spec-depth-v2"||
      plan?.qualityProfile==="spec-depth-v3")&&!node?.existing;
    const issues:string[]=[];
    if(strict){
      if(!node||node.kind!=="leaf")issues.push("Missing reviewed leaf execution contract");
      if(node?.openQuestions?.length)issues.push("Unresolved design decisions: "+node.openQuestions.join("; "));
      if(frozen.sourceDrift)issues.push("Canonical requirements have changed");
      if(!node?.scenario||!node.workflow?.length||!node.businessRules?.length)
        issues.push("Incomplete frozen trigger, workflow or business invariants");
    }
    issues.push(...gateScopeIssues);
    return {taskId:id,eligible:issues.length===0,issues,
      profile:plan?.qualityProfile??null,planHash:frozen.frozenHash,
      owner:task.owner??this.localDeveloper().name,
      assignment:task.ownerAssignment,
      spec:strict?node:task.spec,
      allowedPaths:task.allowedPaths,requiredGates:task.requiredGates,
      dependencies:task.dependsOn,approvedBy:task.approvedBy,
      limits:"Implement only the reviewed contract and allowed paths. Route changes to planning review.",
    };
  }

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
      draftHistory: this.db.prepare(
        "SELECT old_hash,next_hash,revised_by,revised_at FROM dc_release_proposal_drafts WHERE release=? ORDER BY revised_at",
      ).all(release).map(row=>({
        previousHash:row.old_hash,nextHash:row.next_hash,
        revisedBy:row.revised_by,revisedAt:row.revised_at,
      })),
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
  proposeReleasePlan(input: ReleasePlanProposal, actor: string, expectedPreviousHash?: string): Row {
    if (typeof actor !== "string" || !actor.trim()) fail("ACTOR_REQUIRED", "Actor required");
    const review = reviewReleasePlan(input);
    if (!review.passed) fail("INCOMPLETE_PLAN", review.issues.join("; "));
    const referencedFeatures = new Set(input.nodes.filter(node => node.kind === "leaf" &&
      !node.existing && node.designRef?.startsWith("feature:"))
      .map(node => node.designRef!.slice("feature:".length).replace(/#design$/, "")));
    if (referencedFeatures.size && (!input.sourceFeature ||
        referencedFeatures.size !== 1 || !referencedFeatures.has(input.sourceFeature.name))) {
      fail("FEATURE_BINDING_REQUIRED", "Feature-backed leaves must use one revision-bound feature-task-propose workflow");
    }
    if (input.sourceFeature && (!this.featureBindingMatches(input.sourceFeature) ||
        !this.reviewFeatureTasks(input.sourceFeature.name, input.sourceFeature.revision, input).passed)) {
      fail("FEATURE_SOURCE_DRIFT", "Feature revision or task coverage is not valid: rerun feature-task-review");
    }
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
        if (!expectedPreviousHash || existing.hash !== expectedPreviousHash) {
          fail("PROPOSAL_PENDING", "Pending proposal differs: supply exact prior hash through explicit plan-revise, not plan-propose");
        }
        const old = JSON.parse(existing.snapshot_json) as ReleasePlanProposal;
        if (old.release !== input.release || old.baseRevision !== input.baseRevision ||
            old.scopeSource !== input.scopeSource ||
            JSON.stringify(old.requirementIds) !== JSON.stringify(input.requirementIds)) {
          fail("DRAFT_SCOPE_CHANGED", "Requirements and release identity cannot change in a content-only pending revision");
        }
        const preserved = new Map(input.nodes.map(node=>[node.id,node]));
        for (const before of old.nodes.filter(node=>node.existing)) {
          if (JSON.stringify(preserved.get(before.id)) !== JSON.stringify(before)) {
            fail("HISTORICAL_TASK_CHANGED", "Historical approved or verified task cannot be rewritten");
          }
        }
        this.db.prepare(`INSERT INTO dc_release_proposal_drafts
          (release,old_hash,next_hash,old_snapshot_json,revised_by,revised_at)
          VALUES(?,?,?,?,?,?)`).run(input.release,existing.hash,hash,
            existing.snapshot_json,actor.trim(),utc());
        this.audit(null,"release_plan_draft_revised",actor,{
          release:input.release,oldHash:existing.hash,newHash:hash,
          oldNodes:old.nodes.length,newNodes:input.nodes.length,
        });
      } else if (expectedPreviousHash && (!existing || existing.hash !== expectedPreviousHash)) {
        fail("STALE_DRAFT", "Pending plan is missing or no longer matches reviewed previous hash");
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
      // Legacy spec-heavy ReleasePlan cannot be a second way to approve
      // executable tasks after an atomic whole-release roster is in use.
      if(this.db.prepare("SELECT release FROM dc_release_work_proposals WHERE release=?").get(release)||
        this.db.prepare("SELECT release FROM dc_release_work_plans WHERE release=?").get(release))
        fail("WHOLE_RELEASE_APPROVAL_REQUIRED",
          "Use release-work-review and release-work-approve; legacy ReleasePlan cannot bypass the independent Agent review");
      const pending = this.db.prepare("SELECT * FROM dc_release_proposals WHERE release=?").get(release);
      if (!pending || pending.hash !== expectedHash) {
        fail("PLAN_REVIEW_MISMATCH", "No matching proposed version is awaiting review");
      }
      const active = this.db.prepare("SELECT task_id FROM dc_leases WHERE singleton=1").get();
      if (active) fail("ACTIVE_TASK", "Wait for the active lease before freezing the plan");
      const plan = JSON.parse(pending.snapshot_json) as ReleasePlanProposal;
      if (plan.sourceFeature && (!this.featureBindingMatches(plan.sourceFeature) ||
          !this.reviewFeatureTasks(plan.sourceFeature.name,plan.sourceFeature.revision,plan).passed)) {
        fail("FEATURE_SOURCE_DRIFT", "SQLite feature changed or no longer meets task-planning requirements");
      }
      if (plan.nodes.some(node=>node.kind==="leaf"&&!node.existing) &&
          plan.qualityProfile !== "spec-depth-v2" &&
          plan.qualityProfile !== "spec-depth-v3") {
        fail("SPEC_DEPTH_REQUIRED", "Detailed trigger, workflow, source, cases and evidence required before owner approval");
      }
      const minimum=this.db.prepare("SELECT value FROM dc_meta WHERE key='minimumReleaseProfile'").get();
      if(minimum?.value==="spec-depth-v3"&&plan.qualityProfile!=="spec-depth-v3")
        fail("SPEC_V3_REQUIRED","New project releases require an exact, reviewed v3 execution contract");
      if(plan.qualityProfile==="spec-depth-v3"&&plan.nodes.some(node=>
        node.kind==="leaf"&&!node.existing&&(node.openQuestions?.length??0)>0))
        fail("UNRESOLVED_PRODUCT_DECISION","Resolve open v3 decisions before freezing an execution plan");
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
    const draft=JSON.parse(row.draft_json);
    // Existing SQLite Features may have been created while start_feature
    // embedded legacy add_feature file templates. They remain historical
    // data, not actionable instructions for the current project workflow.
    // Normalize read projections without rewriting approved source history.
    const normalizedDraft=draft&&typeof draft==="object"&&
      Array.isArray(draft.specOutputs)&&draft.specOutputs.some(
        (file:unknown)=>typeof file==="string"&&file.includes("/specs/"))
      ? {...draft, specOutputs:[],
        guidance:"SQLite Feature：使用 DevControl feature-save/feature-validate；不生成需求、设计、任务 Spec Markdown。",
        structuredContent:null}
      : draft;
    return {
      name: row.name, description: row.description, layout: row.layout,
      status: row.status, plan: JSON.parse(row.plan_json),
      draft: normalizedDraft, sections: JSON.parse(row.sections_json),
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

  private featureBinding(name: string): { name: string; revision: number; hash: string } {
    const feature = this.getFeature(name);
    // Hash the actual reviewed SQLite content rather than the start_feature
    // input fingerprint (which does not include revised requirements/design).
    const content = {
      name: feature.name, revision: feature.revision, status: feature.status,
      description: feature.description, layout: feature.layout,
      draft: feature.draft, sections: feature.sections,
    };
    return { name, revision: feature.revision,
      hash: createHash("sha256").update(JSON.stringify(content)).digest("hex") };
  }

  private featureBindingMatches(binding: ReleasePlanProposal["sourceFeature"]): boolean {
    if (!binding || typeof binding.name !== "string" ||
        !Number.isSafeInteger(binding.revision) ||
        typeof binding.hash !== "string") return false;
    try {
      const feature = this.getFeature(binding.name);
      const current = this.featureBinding(binding.name);
      return feature.status === "specified" && current.revision === binding.revision &&
        current.hash === binding.hash;
    } catch { return false; }
  }

  /** The structured handoff to an AI planner: no generated code or Markdown. */
  featureTaskBrief(name: string): Row {
    const feature = this.getFeature(name);
    const requirements = String(feature.sections?.requirements ?? "");
    const requirementIds = [...new Set(requirements.match(/\b(?:FR|NFR)-\d{3,}\b/g) ?? [])].sort();
    const subspecs = Array.isArray(feature.draft?.subspecs) ? feature.draft.subspecs : [];
    const binding = this.featureBinding(name);
    return {
      feature: { description: feature.description, layout: feature.layout,
        sections: feature.sections, draft: feature.draft, plan: feature.plan,
        ...binding, status: feature.status },
      readyForPlanning: feature.status === "specified" && requirementIds.length > 0,
      issues: [...(feature.status !== "specified" ?
        ["Feature is not validated: call feature-save and feature-validate first"] : []),
        ...(!requirementIds.length ? ["Feature requirements need canonical FR-001 / NFR-001 IDs"] : [])],
      requirementIds, subspecs,
      approvedPlan: this.featureTaskPlan(name),
      requiredQualityProfile: "feature-task-v1 (spec-depth-v3 leaf requirements)",
      instructions: [
        "Research the current Git project and all relevant product/architecture decisions; never invent file paths, tests or verified outcomes.",
        "Using start_feature requirements, design, tasks and subspecs, propose only this Feature's group/leaf work, not an entire release tree or local Spec files.",
        "Link every feature FR/NFR and each subspec to at least one concrete leaf; add missing edge cases and dependencies during PLANNING.",
        "Every leaf supplies a real trigger/outcome, workflow, business rules, inputs/outputs, preconditions/state transitions, exact files, prohibitions/stops, positive/negative tests, evidence, deliverables and <=8h estimate.",
        "Use feature:"+name+"#design as designRef, feature:"+name+"#requirements in sourceRefs and feature:"+name+"#subspec:<id> for any parent-child coverage.",
        "All IDs, code paths and tests must be grounded in the Git project. Unresolved decisions are blockers, not work left for the coding Agent.",
        "Run feature-task-review and feature-task-propose. Only explicit Owner feature-task-approve creates executable SQLite tasks; coding requires claim and eligible execution-contract.",
      ],
      outputContract: {
        operation: "feature-task-review / feature-task-propose",
        arguments: { name, expectedFeatureRevision: binding.revision, actor: "planning-agent",
          plan: { release: "<feature delivery release>",
            rationale: "Detailed functional coverage, design decisions and non-goals",
            nodes: "Only this Feature's full ReleasePlanNode[] (groups and detailed leaves), no release scopeSource" } },
      },
    };
  }

  /** Native Feature plans are independent of whole-release scope manifests. */
  featureTaskPlan(name: string): Row {
    this.getFeature(name);
    const approved = this.db.prepare("SELECT * FROM dc_feature_task_plans WHERE feature_name=?").get(name);
    const pending = this.db.prepare("SELECT * FROM dc_feature_task_proposals WHERE feature_name=?").get(name);
    const frozen = approved ? JSON.parse(approved.snapshot_json) as Row : null;
    const proposal = pending ? JSON.parse(pending.snapshot_json) as Row : null;
    const review = proposal?.review ?? null;
    return { featureName:name, status:pending?(review && !review.passed?"needs_revision":"review_pending"):approved?"frozen":"missing",
      revision:approved?.revision??0, hash:approved?.hash??null,
      frozen, proposal, proposalHash:pending?.hash??null, review,
      sourceDrift: frozen ? !this.featureBindingMatches(frozen.sourceFeature) : false };
  }

  listFeatureTaskPlans(): Row[] {
    const names=this.db.prepare(`SELECT feature_name FROM dc_feature_task_proposals
      UNION SELECT feature_name FROM dc_feature_task_plans ORDER BY feature_name`).all();
    return names.map(row=>this.featureTaskPlan(String(row.feature_name)));
  }

  /** Rich, feature-scoped quality check before any task is made executable. */
  reviewFeatureTasks(name: string, expectedFeatureRevision: number,
    plan: FeatureTaskPlan): Row {
    const brief = this.featureTaskBrief(name);
    const binding = brief.feature as { name:string; revision:number; hash:string;
      status:string; layout:string };
    const issues: string[] = [...brief.issues];
    if (expectedFeatureRevision !== binding.revision) issues.push("Stale Feature revision: reload feature-task-brief");
    const source = { ...binding, requirements:brief.requirementIds as string[],
      subspecs:brief.subspecs as {id:string;fr?:string[];dependsOn?:string[]}[] };
    // A single Feature can depend on previously approved project tasks.
    // Never force the Agent to copy the entire release just to model F1 -> F2.
    const approvedExternalDependencies=new Set<string>(this.db.prepare(
      "SELECT id FROM dc_tasks WHERE status NOT IN ('draft','cancelled') AND approved_by IS NOT NULL",
    ).all().map(row=>String(row.id)));
    const inspected = reviewFeatureTaskPlan(source,plan,approvedExternalDependencies);
    issues.push(...inspected.issues);
    const previous = this.featureTaskPlan(name).frozen as Row|null;
    const oldNodes: ReleasePlanNode[] = previous?.plan?.nodes??[];
    const nodes = Array.isArray(plan?.nodes)?plan.nodes:[];
    const byId = new Map(nodes.map(node => [node.id,node]));
    for (const old of oldNodes) {
      if (JSON.stringify(old) !== JSON.stringify(byId.get(old.id))) {
        issues.push(`Previously approved Feature task ${old.id} is immutable`);
      }
    }
    const newNodes = nodes.filter(node => !oldNodes.some(old => old.id === node.id));
    if (!newNodes.some(node=>node.kind==="leaf")) {
      issues.push("At least one new independently testable leaf task is required");
    }
    for (const node of newNodes) {
      if (this.db.prepare("SELECT id FROM dc_tasks WHERE id=?").get(node.id)) {
        issues.push(`${node.id}: task ID is already used by another project task`);
      }
    }
    if (previous && plan.release !== previous.plan.release) {
      issues.push("An approved Feature release cannot be silently reassigned");
    }
    return { passed:issues.length===0, issues, featureName:name,
      featureRevision:binding.revision, sourceHash:binding.hash,
      total:nodes.length, generatedLeaves:newNodes.filter(n=>n.kind==="leaf").length,
      coveredFeatureRequirements:inspected.coveredRequirements,
      uncoveredRequirements:inspected.uncoveredRequirements };
  }

  /** Agent only proposes. No task rows or implicit Owner authority. */
  stageFeatureTasks(name: string, expectedFeatureRevision: number,
    plan: FeatureTaskPlan, actor: string, expectedPreviousHash?: string): Row {
    if (!actor?.trim()) fail("ACTOR_REQUIRED", "Planning Agent identity required");
    if (!plan || !Array.isArray(plan.nodes) || plan.nodes.length === 0 || plan.nodes.length > 150 ||
      !plan.nodes.some(n => n?.kind === "leaf")) {
      fail("INVALID_FEATURE_TASK_DRAFT", "Feature task draft needs a bounded nonempty leaf tree");
    }
    const review = this.reviewFeatureTasks(name, expectedFeatureRevision, plan);
    if (review.featureRevision !== expectedFeatureRevision) {
      fail("STALE_FEATURE_DRAFT", "Feature source changed: reload feature-task-brief");
    }
    const snapshot = {sourceFeature:{name,revision:review.featureRevision,hash:review.sourceHash},
      plan, review};
    const raw = JSON.stringify(snapshot);
    if (raw.length > 1_500_000) fail("PLAN_TOO_LARGE", "Feature task draft exceeds storage limit");
    const hash = createHash("sha256").update(raw).digest("hex");
    return this.inTransaction(() => {
      const pending = this.db.prepare("SELECT hash FROM dc_feature_task_proposals WHERE feature_name=?").get(name);
      if (pending && pending.hash !== hash && pending.hash !== expectedPreviousHash) {
        fail("PROPOSAL_PENDING", "To replace staged planning, supply the exact previous hash");
      }
      if (!pending && expectedPreviousHash) fail("STALE_DRAFT", "Previous Feature plan was removed");
      const revision = this.featureTaskPlan(name).revision + 1;
      this.db.prepare(`INSERT INTO dc_feature_task_proposals
        (feature_name,revision,hash,snapshot_json,proposed_by,proposed_at)
        VALUES(?,?,?,?,?,?) ON CONFLICT(feature_name) DO UPDATE SET
        revision=excluded.revision,hash=excluded.hash,snapshot_json=excluded.snapshot_json,
        proposed_by=excluded.proposed_by,proposed_at=excluded.proposed_at`)
        .run(name,revision,hash,raw,actor.trim(),utc());
      this.audit(null,"feature_task_plan_staged",actor,{name,revision,hash,
        reviewPassed:review.passed,issues:review.issues.length});
      return {featureName:name,revision,hash,
        status:review.passed?"review_pending":"needs_revision",review,
        executableTasksCreated:0};
    });
  }

  /** Agent only proposes. No task rows or implicit Owner authority. */
  proposeFeatureTasks(name: string, expectedFeatureRevision: number,
    plan: FeatureTaskPlan, actor: string, expectedPreviousHash?: string): Row {
    if (!actor?.trim()) fail("ACTOR_REQUIRED","Planning Agent identity required");
    const review=this.reviewFeatureTasks(name,expectedFeatureRevision,plan);
    if (!review.passed) fail("INCOMPLETE_FEATURE_TASKS",review.issues.join("; "));
    const snapshot={sourceFeature:{name,revision:review.featureRevision,hash:review.sourceHash},plan};
    const raw=JSON.stringify(snapshot);
    if (raw.length>1_500_000) fail("PLAN_TOO_LARGE","Feature task plan exceeds storage limit");
    const hash=createHash("sha256").update(raw).digest("hex");
    return this.inTransaction(()=>{
      const pending=this.db.prepare("SELECT hash FROM dc_feature_task_proposals WHERE feature_name=?").get(name);
      if(pending && pending.hash!==hash && pending.hash!==expectedPreviousHash)
        fail("PROPOSAL_PENDING","Pending Feature plan differs: provide exact previous hash to revise");
      if(!pending && expectedPreviousHash) fail("STALE_DRAFT","Previous Feature proposal no longer exists");
      const revision=this.featureTaskPlan(name).revision+1;
      this.db.prepare(`INSERT INTO dc_feature_task_proposals
        (feature_name,revision,hash,snapshot_json,proposed_by,proposed_at)
        VALUES(?,?,?,?,?,?) ON CONFLICT(feature_name) DO UPDATE SET
        revision=excluded.revision,hash=excluded.hash,snapshot_json=excluded.snapshot_json,
        proposed_by=excluded.proposed_by,proposed_at=excluded.proposed_at`)
        .run(name,revision,hash,raw,actor.trim(),utc());
      this.audit(null,"feature_task_plan_proposed",actor,{name,revision,hash,leaves:review.generatedLeaves});
      return { featureName:name,revision,hash,status:"review_pending",review };
    });
  }

  /** Explicit approval action; approvedBy is a local Git/device audit label, not authentication. */
  approveFeatureTasks(name:string, _approvedBy:string, expectedHash:string):Row {
    if (!/^[a-f0-9]{64}$/.test(expectedHash))
      fail("PLAN_APPROVAL_REQUIRED","Exact reviewed Feature plan hash required");
    const developer=this.localDeveloper();
    const approvedBy=developer.name?.trim()||developer.device.trim()||"local-computer";
    return this.inTransaction(()=>{
      const row=this.db.prepare("SELECT * FROM dc_feature_task_proposals WHERE feature_name=?").get(name);
      if(!row||row.hash!==expectedHash)fail("PLAN_REVIEW_MISMATCH","No matching Feature proposal pending");
      if(this.db.prepare("SELECT task_id FROM dc_leases WHERE singleton=1").get())
        fail("ACTIVE_TASK","Cannot freeze Feature tasks during an active task lease");
      const snapshot=JSON.parse(row.snapshot_json) as {
        sourceFeature:{name:string;revision:number;hash:string};plan:FeatureTaskPlan };
      const release=snapshot.plan.release;
      if(!this.releaseWorkApprovalInProgress &&
        (this.db.prepare("SELECT release FROM dc_release_work_proposals WHERE release=?").get(release) ||
          this.db.prepare("SELECT release FROM dc_release_work_plans WHERE release=?").get(release))) {
        fail("WHOLE_RELEASE_APPROVAL_REQUIRED","Feature cannot be approved independently once whole-release planning begins");
      }
      if (!this.featureBindingMatches(snapshot.sourceFeature))
        fail("FEATURE_SOURCE_DRIFT","start_feature specifications changed since planning");
      const review=this.reviewFeatureTasks(name,snapshot.sourceFeature.revision,snapshot.plan);
      if(!review.passed)fail("INCOMPLETE_FEATURE_TASKS",review.issues.join("; "));
      const previous=this.featureTaskPlan(name).frozen as Row|null;
      const oldIds=new Set<string>((previous?.plan?.nodes??[]).map((node:ReleasePlanNode)=>node.id));
      const remaining=snapshot.plan.nodes.filter(node=>!oldIds.has(node.id));
      const added:string[]=[];
      const present=new Set<string>(oldIds);
      while(remaining.length){
        let progress=false;
        for(let i=0;i<remaining.length;i++){
          const node=remaining[i];
          if(node.parentId&&!present.has(node.parentId))continue;
          const created=this.create({id:node.id,title:node.title,
            parentId:node.parentId,allowedPaths:node.allowedPaths??["docs/**"],
            requiredGates:node.requiredGates??["docs"],release:snapshot.plan.release,
            track:"product",specId:`feature:${name}#${node.id}`,
            planId:`feature:${name}:v${row.revision}`},`feature-plan:${approvedBy}`);
          if(created.status!=="draft")fail("PLAN_IMPORT_FAILED","Task was not created as draft");
          this.db.prepare("UPDATE dc_tasks SET status='ready',approved_by=?,updated_at=? WHERE id=?")
            .run(approvedBy.trim(),utc(),node.id);
          if(node.kind==="leaf")this.db.prepare(`INSERT INTO dc_task_specs
            (task_id,requirement_ids_json,acceptance,design_ref,positive_tests_json,
             negative_cases_json,out_of_scope_json,deliverables_json,estimated_hours,plan_revision)
             VALUES(?,?,?,?,?,?,?,?,?,?)`).run(node.id,JSON.stringify(node.requirementIds),
            node.acceptance??"",node.designRef??"",JSON.stringify(node.testCases??[]),
            JSON.stringify(node.negativeCases??[]),JSON.stringify(node.outOfScope??[]),
            JSON.stringify(node.deliverables??[]),node.estimatedHours??null,row.revision);
          this.audit(node.id,"approved_by_feature_plan",approvedBy,{name,hash:row.hash});
          present.add(node.id);added.push(node.id);remaining.splice(i,1);i--;progress=true;
        }
        if(!progress)fail("PARENT_CYCLE","Task group hierarchy cannot be imported");
      }
      for(const node of snapshot.plan.nodes.filter(node=>added.includes(node.id))){
        for(const dep of node.dependsOn??[]){
          this.db.prepare("INSERT INTO dc_dependencies(task_id,depends_on) VALUES(?,?)").run(node.id,dep);
        }
      }
      this.db.prepare(`INSERT INTO dc_feature_task_plans
        (feature_name,revision,hash,snapshot_json,approved_by,approved_at)
        VALUES(?,?,?,?,?,?) ON CONFLICT(feature_name) DO UPDATE SET
        revision=excluded.revision,hash=excluded.hash,snapshot_json=excluded.snapshot_json,
        approved_by=excluded.approved_by,approved_at=excluded.approved_at`)
        .run(name,row.revision,row.hash,row.snapshot_json,approvedBy.trim(),utc());
      this.db.prepare(`INSERT INTO dc_feature_task_plan_revisions
        (feature_name,revision,hash,snapshot_json,approved_by,approved_at)
        VALUES(?,?,?,?,?,?)`).run(name,row.revision,row.hash,row.snapshot_json,approvedBy.trim(),utc());
      this.db.prepare("DELETE FROM dc_feature_task_proposals WHERE feature_name=?").run(name);
      this.audit(null,"feature_task_plan_approved",approvedBy,{name,hash:row.hash,added});
      return {featureName:name,revision:row.revision,hash:row.hash,status:"frozen",added,review};
    });
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

  /** Structured SRC-8 evidence lives in SQLite; no new per-Bug Spec files. */
  bugDetail(id: string): Row {
    const bug = this.db.prepare("SELECT * FROM dc_work_items WHERE id=? AND kind='bug'").get(id);
    if (!bug) fail("BUG_NOT_FOUND", "Unknown Bug");
    const steps = this.db.prepare("SELECT * FROM dc_bug_steps WHERE item_id=? ORDER BY step").all(id);
    const byStep = new Map(steps.map(row => [Number(row.step), row]));
    const links = this.db.prepare(`SELECT l.task_id,l.role,t.title,t.status
      FROM dc_bug_task_links l JOIN dc_tasks t ON t.id=l.task_id
      WHERE l.item_id=? ORDER BY l.role,l.task_id`).all(id);
    return {
      id: bug.id, title: bug.title, description: bug.description,
      status: bug.status, sourceRef: bug.source_ref, featureName: bug.feature_name,
      createdAt: bug.created_at, updatedAt: bug.updated_at,
      steps: SRC8_STEPS.map((title, index) => {
        const step = index + 1, row = byStep.get(step);
        return { step, title, status: row?.status ?? "pending",
          summary: row?.summary ?? "", evidence: row ? JSON.parse(row.evidence_json) : [],
          revision: row?.revision ?? 0, updatedBy: row?.updated_by ?? null,
          updatedAt: row?.updated_at ?? null };
      }),
      links: links.map(row => ({ taskId: row.task_id, role: row.role,
        title: row.title, status: row.status })),
    };
  }

  updateBugStep(input: BugStepUpdate): Row {
    if (!Number.isInteger(input.step) || input.step < 1 || input.step > 8) {
      fail("INVALID_BUG_STEP", "SRC-8 step must be 1..8");
    }
    if (!["pending", "in_progress", "blocked", "completed"].includes(input.status)) {
      fail("INVALID_BUG_STATUS", "Unsupported SRC-8 step state");
    }
    if (typeof input.summary !== "string" || input.summary.length > 64_000 ||
      !Array.isArray(input.evidence) || input.evidence.length > 40 ||
      input.evidence.some(value => typeof value !== "string" || !value.trim() || value.length > 2048) ||
      typeof input.actor !== "string" || !input.actor.trim() ||
      !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) {
      fail("INVALID_BUG_EVIDENCE", "Provide bounded summary, evidence, actor and exact revision");
    }
    if (input.status === "completed" && (!input.summary.trim() || !input.evidence.length)) {
      fail("BUG_EVIDENCE_REQUIRED", "Completed SRC-8 steps require analysis and evidence");
    }
    return this.inTransaction(() => {
      const detail = this.bugDetail(input.id);
      const prior = detail.steps[input.step - 1];
      if (prior.revision !== input.expectedRevision) {
        fail("STALE_BUG_STEP", "SRC-8 step changed: reload before updating");
      }
      if (detail.steps[7].status === "completed") {
        fail("BUG_FROZEN", "Verified Bug is immutable; reopen through a reviewed workflow");
      }
      if (input.status === "completed") {
        const missing = detail.steps.slice(0,input.step - 1).filter((step: Row) => step.status !== "completed");
        if (missing.length) fail("SRC8_ORDER_REQUIRED", "Complete preceding SRC-8 evidence first");
        if (input.step === 6 || input.step === 7 || input.step === 8) {
          const repair = detail.links.filter((link: Row) => link.role === "repair");
          const tests = detail.links.filter((link: Row) => link.role === "test");
          if (!repair.length || repair.some((link: Row) => link.status !== "verified") ||
            (input.step >= 7 && (!tests.length || tests.some((link: Row) => link.status !== "verified")))) {
            fail("BUG_TASK_GATE", "Verified repair and regression-test tasks are required");
          }
        }
      }
      const revision = prior.revision + 1, now = utc();
      const snapshot = { ...prior, status: input.status, summary: input.summary,
        evidence: [...input.evidence], revision, updatedBy: input.actor.trim(), updatedAt: now };
      this.db.prepare(`INSERT INTO dc_bug_steps(item_id,step,status,summary,evidence_json,revision,updated_by,updated_at)
        VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(item_id,step) DO UPDATE SET
        status=excluded.status,summary=excluded.summary,evidence_json=excluded.evidence_json,
        revision=excluded.revision,updated_by=excluded.updated_by,updated_at=excluded.updated_at`
      ).run(input.id,input.step,input.status,input.summary,JSON.stringify(input.evidence),
        revision,input.actor.trim(),now);
      this.db.prepare(`INSERT INTO dc_bug_step_revisions(item_id,step,revision,snapshot_json,created_at)
        VALUES(?,?,?,?,?)`).run(input.id,input.step,revision,JSON.stringify(snapshot),now);
      const bugStatus = input.step === 8 && input.status === "completed" ? "verified" :
        input.step >= 7 ? "testing" : input.step >= 6 ? "fixing" :
        input.step >= 5 ? "pending_review" : "investigating";
      this.db.prepare("UPDATE dc_work_items SET status=?,updated_at=? WHERE id=?")
        .run(bugStatus, now, input.id);
      this.db.prepare(`INSERT INTO dc_work_item_audit(item_id,event,details_json,created_at) VALUES(?,?,?,?)`)
        .run(input.id,"src8_step_updated",JSON.stringify({step:input.step,status:input.status,
          revision,actor:input.actor.trim()}),now);
      return { id: input.id, step: snapshot, bugStatus };
    });
  }

  linkBugTask(id: string, taskId: string, role: "repair" | "test", actor: string): Row {
    if (!["repair", "test"].includes(role) || !actor?.trim()) {
      fail("INVALID_BUG_LINK", "Role must be repair/test with an actor");
    }
    return this.inTransaction(() => {
      const detail = this.bugDetail(id);
      if (detail.status === "verified") fail("BUG_FROZEN", "Cannot change verified Bug links");
      this.requireTask(taskId);
      const result = this.db.prepare(`INSERT OR IGNORE INTO dc_bug_task_links(item_id,task_id,role)
        VALUES(?,?,?)`).run(id,taskId,role);
      if (result.changes) this.db.prepare(`INSERT INTO dc_work_item_audit
        (item_id,event,details_json,created_at) VALUES(?,?,?,?)`).run(id,
          "task_linked",JSON.stringify({taskId,role,actor:actor.trim()}),utc());
      return { id, taskId, role, reused: result.changes === 0 };
    });
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
        owner:task.owner,
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
    if(task.track==="product"){
      const pending=this.db.prepare("SELECT release FROM dc_release_work_proposals WHERE release=?")
        .get(task.release);
      const releaseRow=this.db.prepare("SELECT * FROM dc_release_work_plans WHERE release=?")
        .get(task.release);
      if(pending&&!releaseRow)return false;
      if(releaseRow){
        try{
          const roster=JSON.parse(releaseRow.snapshot_json) as {
            plan:ReleaseWorkPlan;sourceHash:string;
            features:{name:string;revision:number;hash:string}[];
          };
          const real=fs.readFileSync(path.resolve(this.root,roster.plan.scopeSource));
          if(createHash("sha256").update(real).digest("hex")!==roster.sourceHash)return false;
          for(const f of roster.features)if(!this.featureBindingMatches(f))return false;
          // A row is executable only if it was independently reviewed in the
          // entire roster, not because it appeared inside a heavy Feature Spec.
          return roster.plan.workItems.some(n=>n.id===task.id)&&
            String(task.plan_id)==="release-work:"+task.release;
        }catch{return false;}
      }
    }
    if (String(task.plan_id??"").startsWith("feature:")) {
      const name=String(task.plan_id).slice("feature:".length).replace(/:v\d+$/,"");
      const approved=this.db.prepare("SELECT snapshot_json FROM dc_feature_task_plans WHERE feature_name=?").get(name);
      if(!approved)return false;
      try {
        const snapshot=JSON.parse(approved.snapshot_json) as {
          sourceFeature:{name:string;revision:number;hash:string};plan:FeatureTaskPlan };
        return this.featureBindingMatches(snapshot.sourceFeature)&&
          snapshot.plan.nodes.some(node=>node.id===task.id && node.kind==="leaf");
      }catch{return false;}
    }
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
      this.isApprovedForExecution(task) &&
      this.executionContract(task.id).eligible;
  }

  next(): Row {
    const tasks = this.list();
    const active = this.db.prepare("SELECT task_id,agent,expires_at FROM dc_leases WHERE singleton=1").get();
    const activeLease = active && active.expires_at > Date.now()
      ? { taskId: active.task_id, agent: active.agent, expiresAt: active.expires_at } : null;
    // A review requirement is ACTIONABLE agent work, not a background MCP
    // operation. Surface it even if unrelated already-approved tasks remain
    // Ready: otherwise a lone agent sees only an apparently passive wait.
    const pendingAgentActions:ReviewAgentAction[]=[];
    for(const row of this.db.prepare(
      "SELECT release FROM dc_release_work_incrementals ORDER BY release").all()){
      const action=this.releaseWorkIncrementalAmendment(String(row.release))
        ?.requiredAgentAction as ReviewAgentAction|undefined;
      if(action)pendingAgentActions.push(action);
    }
    for(const row of this.db.prepare(
      "SELECT release FROM dc_release_work_amendments ORDER BY release").all()){
      const action=this.releaseWorkScopeAmendment(String(row.release))
        ?.requiredAgentAction as ReviewAgentAction|undefined;
      if(action)pendingAgentActions.push(action);
    }
    pendingAgentActions.sort((a,b)=>Number(a.status!=="agent_review_required")-
      Number(b.status!=="agent_review_required"));
    const ready = tasks.filter((t) =>
      (t.status === "ready" || t.status === "in_progress" || t.status === "in_review") &&
      !(t.status === "ready" && (this.taskAwaitsScopeReview(t.id,t.release)||
        this.taskAwaitsIncrementalReview(t.id,t.release))) &&
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
      pendingAgentActions,
      // A claimed task is finished first; pending reviews never steal leases.
      nextAgentAction:activeLease?null:pendingAgentActions[0]??null,
      blocked: tasks.filter((t) => t.status !== "verified" && (
        this.blockers(t.id).length ||
        t.childIds.some((id: string) => this.requireTask(id).status !== "verified") ||
        (t.status === "ready" && (this.taskAwaitsScopeReview(t.id,t.release)||
          this.taskAwaitsIncrementalReview(t.id,t.release)))
      )).map((t) => ({
        id: t.id, blockedBy: this.blockers(t.id),
        unverifiedChildren: t.childIds.filter((id: string) => this.requireTask(id).status !== "verified"),
        ...(t.status==="ready"&&this.taskAwaitsScopeReview(t.id,t.release)?
          {pendingScopeReview:true}:{}),
        ...(t.status==="ready"&&this.taskAwaitsIncrementalReview(t.id,t.release)?
          {pendingIncrementalReview:true}:{}),
        ...(t.status==="ready"&&this.taskAwaitsIncrementalReview(t.id,t.release)?
          {requiredAgentAction:pendingAgentActions.find(action=>
            action.kind==="incremental_work"&&action.release===t.release)}:{}),
      })),
    };
  }

  create(input: CreateWorkItem, actor: string): Row {
    if (!idPattern.test(input.id)) fail("INVALID_ID", "Task ID must be an uppercase stable identifier");
    if (!input.title?.trim()) fail("TITLE_REQUIRED", "Task title is required");
    const sqliteDecision=input.requiredGates?.length===1&&input.requiredGates[0]==="sqlite_decision";
    const allowedPaths = safePaths(input.allowedPaths,sqliteDecision);
    if (!Array.isArray(input.requiredGates) ||
        input.requiredGates.some((gate) => !allowedGates.has(gate))) {
      fail("UNKNOWN_GATE", "Use only approved fixed acceptance gates");
    }
    if (!input.requiredGates.length) fail("GATE_REQUIRED", "A task cannot be verified without gates");
    if(input.requiredGates.includes("sqlite_decision")&&!sqliteDecision)
      fail("INVALID_GATE", "SQLite decision cannot mix code/docs gates");
    if(sqliteDecision && !String(input.planId??"").startsWith("release-work:"))
      fail("RELEASE_PLAN_REQUIRED", "SQLite-only decisions must belong to a reviewed whole-release work roster");
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
      this.recordLocalDeveloper(input.id,"created");
      for (const dep of dependsOn) {
        this.db.prepare("INSERT INTO dc_dependencies(task_id,depends_on) VALUES(?,?)").run(input.id, dep);
      }
      this.audit(input.id, "created_proposal", actor, {
        parentId: input.parentId ?? null, dependsOn, specId: input.specId, planId: input.planId,
        device: actorInfo(this.root).device,developer:this.localDeveloper().name,
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
      const pending=this.taskAwaitsScopeReview(id,task.release);
      if(task.status==="ready"&&pending)
        fail("SCOPE_AMENDMENT_PENDING",
          "Scope amendment for this task awaits independent review and exact Owner approval; do not claim it");
      if(task.status==="ready"&&this.taskAwaitsIncrementalReview(id,task.release))
        fail("INCREMENTAL_REVIEW_PENDING",
          "New prerequisite for this task awaits independent review and Owner hash approval; host development Agent must actively inspect the original code, arrange an actual independent reviewer, submit evidence through release-work-incremental-independent-review, then obtain Owner authorization. Do not wait for MCP to review.");
      if (this.db.prepare("SELECT id FROM dc_tasks WHERE parent_id=? LIMIT 1").get(id) &&
          (String(task.plan_id??"").startsWith("feature:") ||
            !!this.db.prepare("SELECT release FROM dc_release_plans WHERE release=?").get(task.release))) {
        fail("PARENT_NOT_EXECUTABLE", "Only leaf tasks can be claimed; group progress aggregates verified children");
      }
      if (!this.isApprovedForExecution(task)) {
        fail("RELEASE_PLAN_REQUIRED", "Release tasks must belong to an approved, frozen plan");
      }
      const contract=this.executionContract(id);
      if(!contract.eligible)fail("EXECUTION_CONTRACT_BLOCKED",contract.issues.join("; "));
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
      const paused=this.db.prepare(
        "SELECT * FROM dc_scope_pauses WHERE task_id=? AND resumed_at IS NULL",
      ).get(id);
      let claimBase=originalBase;
      if(paused){
        if(task.status!=="ready"||pending)
          fail("SCOPE_PAUSE_PENDING","A paused task requires a reviewed scope amendment before resuming");
        const current=this.db.prepare(
          "SELECT snapshot_json FROM dc_release_work_plans WHERE release=?",
        ).get(task.release);
        const approved=current?JSON.parse(current.snapshot_json) as {
          scopeAmendment?:{proposalHash?:string}
        }:null;
        if(approved?.scopeAmendment?.proposalHash!==paused.proposal_hash)
          fail("SCOPE_AMENDMENT_NOT_APPROVED",
            "Only the exact independently reviewed scope amendment may resume this task");
        if(base!==paused.paused_head)
          fail("SCOPE_PAUSE_HEAD_CHANGED",
            "Git HEAD changed since the task was safely paused; reconcile the original commits first");
        claimBase=String(paused.base_head);
      }
      if (lease?.task_id === id) {
        const ancestor = run(this.root, "git", ["merge-base", "--is-ancestor", claimBase, base]);
        if (!ancestor.passed) fail("GIT_HISTORY_CHANGED", "Cannot resume: prior task baseline is not an ancestor of HEAD");
      }
      if(paused && !run(this.root,"git",["merge-base","--is-ancestor",claimBase,base]).passed)
        fail("GIT_HISTORY_CHANGED","Paused task baseline is not an ancestor of HEAD");
      const token = randomUUID();
      this.recordLocalDeveloper(id,"claimed");
      this.db.prepare(`
        INSERT OR REPLACE INTO dc_leases(singleton,task_id,agent,token,base_head,expires_at)
        VALUES(1,?,?,?,?,?)
      `).run(id, agent.trim(), token, claimBase, Date.now() + ttlSeconds * 1000);
      if(paused){
        this.db.prepare("UPDATE dc_scope_pauses SET resumed_at=? WHERE task_id=?")
          .run(utc(),id);
        this.audit(id,"scope_pause_resumed",agent.trim(),{
          baseHead:claimBase,pausedHead:paused.paused_head,proposalHash:paused.proposal_hash,
        });
      }
      if (task.status !== "in_review") {
        this.db.prepare(
          "UPDATE dc_tasks SET status='in_progress',updated_at=? WHERE id=?",
        ).run(utc(), id);
      }
      this.audit(id, lease?.task_id === id ? "reclaimed" : "claimed", agent, {
        base: claimBase, ttlSeconds,
      });
      return { task: this.get(id), executionContract:this.executionContract(id),
        leaseToken: token, baseHead: claimBase };
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

  /**
   * Repair a mistaken claim of a task whose frozen scope expansion was
   * already staged. Preserve the complete original Git baseline and commits:
   * no cherry-pick, reset, deleted lease history or silent verification.
   * This only restores the task to Ready so genuine independent review and
   * exact Owner approval can proceed. It grants ZERO extra file permissions.
   */
  pauseForScopeAmendment(id:string,token:string,reason:string):Row {
    if(typeof reason!=="string"||reason.trim().length<20)
      fail("PAUSE_REASON_REQUIRED","Document why the claimed task must pause for a scoped amendment");
    return this.inTransaction(()=>{
      const lease=this.requireLease(id,token);
      const task=this.requireTask(id);
      if(task.status!=="in_progress")
        fail("TASK_NOT_IN_PROGRESS","Only an actively claimed, unreviewed task may pause for scope");
      const pending=this.db.prepare(
        "SELECT * FROM dc_release_work_amendments WHERE release=?",
      ).get(task.release);
      if(!pending)fail("SCOPE_AMENDMENT_NOT_FOUND","No staged amendment affects this release");
      const proposal=JSON.parse(pending.snapshot_json) as ReleaseWorkScopeAmendment;
      if(!proposal.changes.some(change=>change.taskId===id))
        fail("SCOPE_AMENDMENT_NOT_FOUND","The staged amendment does not include this task");
      const frozen=this.db.prepare(
        "SELECT revision,hash FROM dc_release_work_plans WHERE release=?",
      ).get(task.release);
      if(!frozen||frozen.revision!==proposal.baseRevision||frozen.hash!==proposal.baseHash)
        fail("STALE_AMENDMENT","Frozen release changed; cannot pause against an old scope");
      if(this.db.prepare("SELECT task_id FROM dc_scope_pauses WHERE task_id=? AND resumed_at IS NULL")
        .get(id))
        fail("SCOPE_ALREADY_PAUSED","Task is already paused awaiting a reviewed amendment");
      if(this.latestCompletion(id)||
        this.db.prepare("SELECT id FROM dc_evidence WHERE task_id=? LIMIT 1").get(id)||
        this.db.prepare("SELECT task_id FROM dc_task_decisions WHERE task_id=?").get(id))
        fail("TASK_EVIDENCE_EXISTS",
          "Resolve recorded completion/evidence/decisions before pausing; do not discard verified provenance");
      const head=git(this.root,["rev-parse","HEAD"]);
      if(git(this.root,["status","--porcelain"]))
        fail("DIRTY_WORKTREE","Commit or revert local changes before pausing");
      if(!run(this.root,"git",["merge-base","--is-ancestor",lease.base_head,head]).passed)
        fail("GIT_HISTORY_CHANGED","Original claimed base is not an ancestor of current HEAD");
      const files=changedFiles(this.root,lease.base_head);
      const allowed=JSON.parse(task.allowed_paths) as string[];
      const denied=files.filter(file=>!allowed.some(pattern=>pathAllowed(file,pattern)));
      if(denied.length)fail("PAUSE_SCOPE_VIOLATION",
        "Already committed files exceed frozen scope: "+denied.join(", "));
      const governed=this.checkGovernedArtifacts();
      if(!governed.passed)
        fail("GOVERNED_ARTIFACT_CHANGED",
          "Original governed architecture artifact baseline must remain intact");
      const now=utc();
      this.db.prepare(`INSERT INTO dc_scope_pauses
        (task_id,release,proposal_hash,base_head,paused_head,
         changed_files_json,reason,paused_by,paused_at)
         VALUES(?,?,?,?,?,?,?,?,?)`).run(id,task.release,pending.proposal_hash,
        lease.base_head,head,JSON.stringify(files),reason.trim(),lease.agent,now);
      this.db.prepare("DELETE FROM dc_leases WHERE singleton=1").run();
      this.db.prepare("UPDATE dc_tasks SET status='ready',updated_at=? WHERE id=?")
        .run(now,id);
      this.audit(id,"scope_paused_for_review",lease.agent,{
        release:task.release,proposalHash:pending.proposal_hash,
        originalBaseHead:lease.base_head,pausedHead:head,
        changedFiles:files,reason:reason.trim(),
        originalLeaseAgent:lease.agent,
      });
      return {taskId:id,status:"ready",paused:true,reviewRequired:true,
        release:task.release,proposalHash:pending.proposal_hash,
        originalBaseHead:lease.base_head,pausedHead:head,changedFiles:files};
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
      if (typeof evidence?.kind!=="string"||typeof evidence?.reference!=="string"||
        !evidence.kind.trim()||!evidence.reference.trim()||
        ["undefined","null"].includes(evidence.kind.trim().toLowerCase())||
        ["undefined","null"].includes(evidence.reference.trim().toLowerCase())) {
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

  private gate(name: string, allowedPaths: string[] = []): Row {
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
    if (name === "go_http_integration") {
      const core = path.join(this.root, "services/core");
      if (!fs.existsSync(path.join(core, "go.mod"))) {
        return { passed: false, error: "Real Go Core module missing; contract fixtures do not satisfy this gate" };
      }
      const integration = path.join(core, "internal/http_integration_test.go");
      if (!fs.existsSync(integration) ||
          !/^func TestHTTP\w*\s*\(/m.test(fs.readFileSync(integration, "utf8"))) {
        return { passed: false, error: "Executable Go Core HTTP integration tests missing" };
      }
      return run(core, "go", ["test", "-tags=integration", "./..."]);
    }
    if (name === "go_postgres_live")return runLivePostgresGate(this.root);
    if (name === "flutter_test") {
      const target = resolveFlutterTestTarget(this.root, allowedPaths);
      if (!target.passed) return target;
      // The host may keep its SDK outside PATH; never fall back to a mocked
      // Flutter runner. Explicit configuration must be an existing executable.
      const sdkRoot = process.env.FLUTTER_ROOT?.trim();
      const configured = process.env.FLUTTER_BIN?.trim() ||
        (sdkRoot ? path.join(sdkRoot, "bin", "flutter") : "");
      if (configured && (!path.isAbsolute(configured) || !fs.existsSync(configured))) {
        return { passed: false, error: "FLUTTER_BIN/FLUTTER_ROOT must resolve to a real absolute Flutter launcher" };
      }
      return {
        ...run(target.appRoot, configured || "flutter", ["test"], 300_000),
        appRoot: target.relativeRoot,
        testFiles: target.testFiles,
      };
    }
    if (name === "ios_device_e2e") {
      return { passed: false, error: "Physical iPhone/VAD evidence runner not configured; simulator screenshots cannot pass" };
    }
    if (name === "v01_release_e2e") {
      return { passed: false, error: "Real multi-input iPhone→Core→memory acceptance gate not configured" };
    }
    return { passed: false, error: `Unknown gate ${name}` };
  }

  verify(id: string, token: string): Row {
    const lease = this.requireLease(id, token);
    const task = this.requireTask(id);
    if (task.status !== "in_review") fail("NOT_IN_REVIEW", "Submit evidence and request review first");
    const contract=this.executionContract(id);
    if(!contract.eligible)return {taskId:id,passed:false,
      reason:"Execution contract no longer valid",issues:contract.issues};
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
    const governed=this.checkGovernedArtifacts();
    if(!governed.passed)return {taskId:id,passed:false,
      reason:"Governed architecture artifacts differ from approved revision",
      governedArtifactIssues:governed.issues};
    const plannedGates = JSON.parse(task.required_gates) as string[];
    const recorded=this.db.prepare("SELECT * FROM dc_task_decisions WHERE task_id=?").get(id);
    const frozenDecision=(contract.profile==="atomic-work-item"&&
      (contract.spec as {type?:string}|null)?.type==="decision");
    const sqliteOnly=plannedGates.length===1&&plannedGates[0]==="sqlite_decision";
    // Frozen pre-migration decision work may still have ['docs'] and
    // docs/** in its immutable roster. Only a separately submitted,
    // lease-bound SQLite record explicitly opts into the new workflow.
    const sqliteDelivery=sqliteOnly||(frozenDecision&&!!recorded);
    if(sqliteDelivery){
      if(!frozenDecision)return {taskId:id,passed:false,reason:"Not a frozen decision task"};
      if(files.length||startHead!==lease.base_head)return {taskId:id,passed:false,
        reason:"SQLite decision must not contain any Git commits",files};
      const tokenHash=createHash("sha256").update(token).digest("hex");
      if(!recorded||recorded.lease_token_hash!==tokenHash||
        recorded.git_head!==startHead||recorded.actor!==lease.agent)
        return {taskId:id,passed:false,reason:"No decision saved under current lease"};
      if(!["proposed","decided"].includes(recorded.status)||
        !recorded.verification_plan?.trim())
        return {taskId:id,passed:false,reason:"SQLite decision record invalid"};
    }
    const allowedPaths = JSON.parse(task.allowed_paths) as string[];
    const exact=(contract.profile==="spec-depth-v3"?
      (contract.spec as ReleasePlanNode)?.allowedChangedFiles:undefined);
    const denied = files.filter((f) =>
      !allowedPaths.some((p) => pathAllowed(f, p))||(exact&&!exact.includes(f)));
    const unapprovedDocs = undocumentedMarkdown(addedFiles(this.root, lease.base_head), allowedPaths);
    if ((!files.length&&!sqliteDelivery) || denied.length || unapprovedDocs.length) {
      return {
        taskId: id, passed: false,
        reason: !files.length ? "No committed task diff" :
          denied.length ? "Out-of-scope files" : "Unapproved new Markdown documents",
        denied, unapprovedDocs, files,
      };
    }
    // Legacy docs gates are replaced by a *stronger*, actual SQLite decision
    // record when an existing frozen decision explicitly opts in. New rosters
    // must declare sqlite_decision and zero allowedPaths from the start.
    const gates = sqliteDelivery?["sqlite_decision"]:plannedGates;
    if (!gates.length) return { taskId: id, passed: false, reason: "Missing gate definition" };
    const results = Object.fromEntries(gates.map((name) =>
      [name,name==="sqlite_decision"?{passed:true,taskId:id,
        revision:recorded!.revision,status:recorded!.status,
        productApproval:"not_implied"}:this.gate(name, allowedPaths)]));
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
      sqliteDecision: this.getDecision(id).decision,
      sqliteDecisionHistory:this.getDecision(id).history,
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
