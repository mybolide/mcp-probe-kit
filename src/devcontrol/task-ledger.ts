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
import { resolveGitWorktreeContext } from './git-worktree-context.js';
import os from "node:os";
import { spawnSync } from "node:child_process";
import { parseParentChildManifest } from "../lib/parent-child-spec.js";
import { makeReviewAgentAction, type ReviewAgentAction } from "./review-actions.js";
import { reviewReleasePlan, type ReleasePlanProposal, type ReleasePlanNode } from "./release-plan.js";
import { localDeveloper } from "./local-developer.js";
import { SRC8_STEPS, type BugStepUpdate } from "./bug-analysis.js";
import { reviewFeatureTaskPlan, type FeatureTaskPlan } from "./feature-task-plan.js";
import { checkManagedGuidanceCommit, isManagedGuidancePath, trustedCommittedGuidance, trustedUncommittedGuidance } from "./managed-guidance-gate.js";
import { amendmentSubjectHash, checkAmendmentShape, checkAmendmentReview,
  type ReleaseWorkScopeAmendment, type ReleaseWorkAmendmentReview,
} from "./release-work-amendment.js";
import { incrementalSubjectHash, checkIncrementalShape, checkIncrementalIndependentReview,
  type ReleaseWorkIncrementalAmendment, type ReleaseWorkIncrementalReview,
} from "./release-work-incremental.js";
import { artifactIsCovered, manifestSubjectHash, reviewArtifactChange, reviewManifest,
  type GovernedArtifactManifest, type GovernedArtifactReview,
} from "./governed-artifacts.js";
import { reviewAtomicOutcome } from './task-atomicity.js';
import { releaseReviewSubjectHash, reviewAgentReview, reviewAtomicWorkItems, reviewDetailedWorkItems, reviewTaskQualityJudgments, auditAtomicWorkItemDetail, scopeStages, type ReleaseWorkPlan } from "./release-work.js";
import { assessIdeaShape, ideaSubjectHash, reviewIdeaShape,
  type IdeaAssessment, type IdeaIndependentReview } from "./idea-review.js";
import { extractRequirementRefs } from './requirement-ids.js';
import { validGateRequirements, isEvidenceGate } from './gate-policy.js';
import { normalizeFrozenTaskContract, auditNormalizedTaskContract,
  reviewSharedTaskPlanningFields, type TaskContractSource } from './task-contract.js';
import { discoverRepositories, currentRevisions, updateRevisions, stagedChanges,
  committedChanges, revisionDigest, assertRepositoryTopology, assertDeliveryStillPresent,
  portableGitDir, type RepositoryRevision } from './repository-audit.js';
import { auditedUntrackedFiles, localWorktreeExemptedFiles } from './worktree-ignore.js';
import {captureFileEvidence,compareFileEvidence,
  type FileEvidenceSnapshot} from './file-evidence.js';
import {previewManagedGuidanceSync} from '../lib/workflow-skill-installer.js';
import {MCP_PROBE_SKILL_REL_PATH} from '../lib/workflow-skill-template.js';
import {proposalHash as supplementHash, reviewHash as supplementReviewHash,
  validateProposal as validateTaskSupplement,validateReview as validateSupplementReview,
  type TaskSpecSupplementProposal,type TaskSpecSupplementReview,
} from './task-spec-supplement.js';

type Value = string | number | null;
type Row = Record<string, any>;
/** One responsible developer decision for one immutable task delivery.
 * The developer runs the project tests; DevControl only validates and stores
 * the declared evidence against the original committed Git revision.
 */
export type TaskAcceptance = {
  evidenceReference:string;
  findings:string;
  gates:Array<{gate:string;evidenceReference:string;findings:string}>;
};
class AcceptanceRejected extends Error{
  constructor(readonly result:Row){super('Task acceptance did not pass');}
}
interface SqlStmt {
  get(...args: Value[]): Row | undefined;
  all(...args: Value[]): Row[];
  run(...args: Value[]): { changes: number };
}

/** Two frozen scopes cannot be edited in the same shared checkout while
 * one submitted delivery is awaiting review. Exact paths and folder globs
 * are compared without depending on the machine's absolute location.
 */
function taskScopesOverlap(left:string[],right:string[]):boolean{
  return left.some(a=>right.some(b=>
    a===b||a.endsWith('/**')&&
      (pathAllowed(b,a)||b.startsWith(a.slice(0,-3)+'/'))||
    b.endsWith('/**')&&
      (pathAllowed(a,b)||a.startsWith(b.slice(0,-3)+'/'))));
}

/** Prove that the original frozen patch still exists verbatim in HEAD's
 * tracked files even if a later, unrelated delivery appended to those files.
 * `--cached` inspects committed index content only, never unrelated WIP.
 * This is Git integrity checking, NOT a project test or Gate decision.
 */
function frozenPatchStillPresent(root:string,base:string,completion:string):boolean {
  const diff=spawnSync('git',['diff','--no-renames','--binary','--full-index',base,completion],{
    cwd:root,encoding:'buffer',timeout:12000,maxBuffer:4_000_000,windowsHide:true,
  });
  if(diff.status!==0||!Buffer.isBuffer(diff.stdout)||diff.stdout.length===0||
    diff.stdout.length>4_000_000)return false;
  const check=spawnSync('git',['apply','--cached','--reverse','--check'],{
    cwd:root,input:diff.stdout,timeout:12000,maxBuffer:400_000,windowsHide:true,
  });
  return check.status===0&&!check.error;
}

/** For an already committed task, subsequent uncommitted work is not delivery
 * evidence. An explicit Owner-authorized preservation mode fingerprints it
 * without staging, stashing, resetting, overwriting or claiming ownership.
 */
function preservedWorktreeSnapshot(root:string,
  taskPaths:string[]=[],prefix=''):Array<{
  path:string;kind:"tracked"|"untracked";sha256:string;size:number;
}> {
  const readGitPaths=(args:string[]):string[]=>{
    const result=spawnSync("git",[...args,"-z"],{
      cwd:root,windowsHide:true,encoding:"buffer",timeout:12_000,
    });
    if(result.status!==0||!Buffer.isBuffer(result.stdout))
      fail("GIT_ERROR","Cannot fingerprint existing uncommitted work");
    return result.stdout.toString("utf8").split("\0").filter(Boolean).sort();
  };
  const inScope=(file:string)=>taskPaths.some(scope=>
    pathAllowed(prefix?prefix+'/'+file:file,scope));
  const staged=readGitPaths(["diff","--cached","--name-only"]);
  const exemptStaged=new Set(localWorktreeExemptedFiles(root,staged,inScope));
  if(staged.some(file=>!exemptStaged.has(file)))
    fail("STAGED_WORKTREE",
      "Staged content not explicitly exempted must be reviewed and committed before protecting unrelated work");
  const tracked=readGitPaths(["diff","--name-only","--no-ext-diff"]);
  const exemptTracked=new Set(localWorktreeExemptedFiles(root,tracked,file=>
    inScope(file)));
  const untracked=auditedUntrackedFiles(root,file=>taskPaths.some(scope=>
    pathAllowed(prefix?prefix+'/'+file:file,scope)));
  const paths=[
    ...tracked.filter(file=>!exemptTracked.has(file))
      .map(file=>({path:file,kind:"tracked" as const})),
    ...untracked.map(file=>({path:file,kind:"untracked" as const})),
  ];
  if(paths.length>256)fail("WORKTREE_TOO_LARGE",
    "More than 256 uncommitted files; reconcile their provenance before deferring");
  const realRoot=fs.realpathSync(root);
  const entries=paths.map(item=>{
    if(!item.path||path.isAbsolute(item.path)||item.path.split("/").includes(".."))
      fail("INVALID_WORKTREE_PATH","Cannot protect non-project working files");
    const target=path.join(root,item.path);
    const meta=fs.lstatSync(target);
    if(!meta.isFile()||meta.size>64*1024*1024)
      fail("UNSAFE_WORKTREE_ENTRY",
        "Cannot defer with non-regular or oversized uncommitted source files");
    const real=fs.realpathSync(target);
    if(!real.startsWith(realRoot+path.sep))
      fail("UNSAFE_WORKTREE_ENTRY","Cannot fingerprint a file outside the Git project");
    return {...item,size:meta.size,
      sha256:createHash("sha256").update(fs.readFileSync(target)).digest("hex")};
  });
  // Only the tool's EXACT generator output is maintenance, not unrelated
  // developer work. A forged marker, custom AGENTS user-rule change, or a
  // modified Skill stays in the protected snapshot. Child repositories and
  // task-scoped files never receive this exception.
  if(prefix)return entries;
  const trusted=new Set(trustedUncommittedGuidance(root,
    entries.filter(entry=>!taskPaths.some(pattern=>pathAllowed(entry.path,pattern)))
      .map(entry=>entry.path)));
  return entries.filter(entry=>!trusted.has(entry.path));
}

/** Historical SQLite migrations sometimes stored one extra JSON envelope:
 *   [{"snapshot_json":"[]"}] instead of [].
 * Accept ONLY that exact single-entry shape (or its direct equivalent).
 * Crucially, an invalid or nonempty inner manifest never becomes [].
 * Interpretation is read-only: the original SQLite bytes remain immutable.
 */
function parseProtectedWorktreeSnapshot(raw:unknown,source:string):
  ReturnType<typeof preservedWorktreeSnapshot>{
  const invalid=(reason:string):never=>
    fail('PROTECTED_SNAPSHOT_INVALID',
      source+' has an invalid protected-worktree snapshot: '+reason);
  const parse=(value:string):unknown=>{
    try{return JSON.parse(value);}
    catch{return invalid('invalid JSON');}
  };
  let data:unknown=typeof raw==='string'?parse(raw):raw;
  const isEnvelope=(value:unknown):value is {snapshot_json:string}=>{
    if(!value||typeof value!=='object'||Array.isArray(value))return false;
    const fields=Object.keys(value);
    return fields.length===1&&fields[0]==='snapshot_json'&&
      typeof (value as Record<string,unknown>).snapshot_json==='string';
  };
  if(Array.isArray(data)&&data.length===1&&isEnvelope(data[0]))
    data=parse(data[0].snapshot_json);
  else if(isEnvelope(data))data=parse(data.snapshot_json);
  if(!Array.isArray(data)||data.length>256)
    return invalid('expected an array of at most 256 exact file fingerprints');
  const seen=new Set<string>();
  for(const entry of data){
    if(!entry||typeof entry!=='object'||Array.isArray(entry))
      return invalid('every entry must be a complete file fingerprint');
    const fields=Object.keys(entry).sort();
    if(JSON.stringify(fields)!==
      JSON.stringify(['kind','path','sha256','size']))
      return invalid('a file fingerprint must have exactly path, kind, size and sha256');
    const file=entry as Record<string,unknown>;
    const name=file.path;
    if(typeof name!=='string'||!name||name.length>2048||
      path.isAbsolute(name)||path.win32.isAbsolute(name)||
      name.includes('\\')||name.includes('\0')||
      name.split('/').some(part=>!part||part==='.'||part==='..')||
      seen.has(name))
      return invalid('unsafe or repeated file path');
    seen.add(name);
    if(file.kind!=='tracked'&&file.kind!=='untracked')
      return invalid('invalid tracked/untracked file kind');
    if(!Number.isSafeInteger(file.size)||Number(file.size)<0||
      Number(file.size)>64*1024*1024)
      return invalid('invalid file byte count');
    if(typeof file.sha256!=='string'||!/^[a-f0-9]{64}$/.test(file.sha256))
      return invalid('invalid SHA-256 fingerprint');
  }
  return data as ReturnType<typeof preservedWorktreeSnapshot>;
}

/** A local exception entered after a claim also applies to the comparison
 * view of the original Owner snapshot. Never rewrite that audit snapshot;
 * frozen task paths cannot be made exempt through a later pattern change.
 */
function worktreeSnapshotWithLocalExemptions(root:string,
  original:ReturnType<typeof preservedWorktreeSnapshot>,
  scope:string[]=[],prefix=''):ReturnType<typeof preservedWorktreeSnapshot>{
  const exempt=new Set(localWorktreeExemptedFiles(root,original.map(x=>x.path),
    file=>scope.some(pattern=>pathAllowed(prefix?prefix+'/'+file:file,pattern))));
  return original.filter(entry=>!exempt.has(entry.path));
}

/** An immutable task submission must retain its own diff after other tasks
 * advance HEAD. Never credit subsequent commits to the deferred task.
 */
function committedFilesBetween(root: string, base: string, end: string,
  filter = "ACMRTD"): string[] {
  const result = spawnSync("git", [
    "diff", "--no-renames", "--name-only", "-z", "--diff-filter=" + filter, base, end,
  ], { windowsHide:true, cwd:root, encoding:"buffer", timeout:12_000 });
  if (result.status!==0 || !Buffer.isBuffer(result.stdout)) {
    fail("GIT_ERROR","Cannot inspect frozen task Git revision");
  }

  return [...new Set(result.stdout.toString("utf8").split("\0").filter(Boolean))].sort();
}

/** Preflight only: an impossible frozen file scope must not be claimable.
 * Existing fixtures may satisfy a gate; otherwise this task must be allowed
 * to create or repair the actual files used by that gate. Do not weaken it.
 */

// Session memory has its own History Session subsystem. This table must not
// masquerade as the global Qdrant memory asset system or the session archive.
type WorkItemKind = 'bug' | 'architecture_change';

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
      windowsHide: true, cwd: projectRoot, encoding: "utf8", timeout: 2_000,
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
    { windowsHide: true, cwd: root, encoding: "buffer", timeout: 12_000 },
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
  constructor(public readonly code: string, message: string,
    public readonly details?:Row) {
    super(message);
  }

}

function fail(code: string, message: string, details?:Row): never {
  throw new DevControlError(code, message, details);
}

function run(root: string, command: string, args: string[], timeout = 90_000) {
  const result = spawnSync(command, args, {
    windowsHide: true, cwd: root, encoding: "utf8", timeout, maxBuffer: 4_000_000,
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
    { windowsHide: true, cwd: root, encoding: "buffer", timeout: 12_000 },
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
  /** Explicit Owner-preserved tracked edits outside this task's frozen scope. */
  existingDirtyFiles?: Array<{path:string;sha256:string}>;
  /** Explicit audit-only snapshot of unrelated pre-existing WIP. It never
   * counts as task delivery, passed Gate, or permission to rewrite any file.
   */
  preserveExistingWorktree?: boolean;
  /** Exact delivery SHA per Git prefix, root prefix is "". Required for
   * explicitly freezing a delivery before later unrelated merge commits.
   */
  deliveryHeads?:Record<string,string>;
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
  root: string;
  readonly projectRoot: string;
  readonly databasePath: string;
  private readonly linkedWorktree:boolean;
  private readonly hasRootGit:boolean;

  constructor(root: string, dbPath?: string) {
    this.root = path.resolve(root);
    this.hasRootGit=fs.existsSync(path.join(this.root,'.git'));
    const gitContext=this.hasRootGit?resolveGitWorktreeContext(this.root):null;
    this.linkedWorktree=gitContext?.isLinked??false;
    // Keep legacy project-visible paths byte-for-byte unchanged. Only linked
    // checkouts resolve their shared DB through the canonical main checkout.
    this.projectRoot=this.linkedWorktree?gitContext!.mainRoot:this.root;
    this.databasePath = dbPath ?? resolveProjectDatabase(this.projectRoot);
    ensureDatabaseIgnored(this.projectRoot, this.databasePath);
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

  /** File snapshots are a distinct, Git-free delivery format, not fake commits. */
  private fileDelivery(id:string):{
    baseline:FileEvidenceSnapshot&{managedAgentsText?:string|null};
    submitted:FileEvidenceSnapshot|null;
    revision:number|null;
  }|null{
    const row=this.db.prepare("SELECT baseline_json,submitted_json,completion_revision FROM dc_file_deliveries WHERE task_id=?").get(id);
    return row?{
      baseline:JSON.parse(String(row.baseline_json)) as
        FileEvidenceSnapshot&{managedAgentsText?:string|null},
      submitted:row.submitted_json?
        JSON.parse(String(row.submitted_json)) as FileEvidenceSnapshot:null,
      revision:row.completion_revision===null?null:Number(row.completion_revision),
    }:null;
  }

  /** Only exact MCP generator output derived from ORIGINAL AGENTS bytes is
   * maintenance. Unknown historical baselines get no exemption.
   */
  private fileTaskChanges(
    before:FileEvidenceSnapshot&{managedAgentsText?:string|null},
    after:FileEvidenceSnapshot,
  ):ReturnType<typeof compareFileEvidence>{
    const diff=compareFileEvidence(before,after);
    if(before.managedAgentsText===undefined)return diff;
    const changed=new Set(diff.changed);
    if(!changed.has('AGENTS.md')&&!changed.has(MCP_PROBE_SKILL_REL_PATH))
      return diff;
    const exempt=new Set<string>();
    try{
      const expected=previewManagedGuidanceSync(this.root,before.managedAgentsText);
      for(const [name,content] of [
        ['AGENTS.md',expected.agents],
        [MCP_PROBE_SKILL_REL_PATH,expected.skill],
      ] as const){
        if(!changed.has(name))continue;
        const absolute=path.join(this.root,name);
        if(fs.existsSync(absolute)&&fs.lstatSync(absolute).isFile()&&
            !fs.lstatSync(absolute).isSymbolicLink()&&
            fs.readFileSync(absolute,'utf8')===content)
          exempt.add(name);
      }
    }catch{/* noncanonical maintenance is never exempt */}
    const filter=(files:string[])=>files.filter(file=>!exempt.has(file));
    return {added:filter(diff.added),modified:filter(diff.modified),
      deleted:filter(diff.deleted),changed:filter(diff.changed)};
  }

  private fileTaskSubmittedUnchanged(
    submitted:FileEvidenceSnapshot,
    claim:FileEvidenceSnapshot&{managedAgentsText?:string|null},
    observed:FileEvidenceSnapshot,
  ):boolean{
    return this.fileTaskChanges({...submitted,managedAgentsText:claim.managedAgentsText},observed)
      .changed.length===0;
  }

  private claimFileTask(id:string,agent:string,ttlSeconds:number,
    resumedFrozenBase?:string):Row{
    if(resumedFrozenBase)fail('FILE_DELIVERY_RESUME_UNSUPPORTED',
      'File-backed task recovery cannot accept a Git baseline override');
    const observed=captureFileEvidence(this.root);
    return this.inTransaction(()=>{
      const task=this.requireTask(id);
      if(!['ready','in_progress'].includes(task.status))
        fail('TASK_NOT_READY','Only a Ready or already developing file-backed task can be claimed');
      if(!this.isApprovedForExecution(task)||!this.executionContract(id).eligible)
        fail('EXECUTION_CONTRACT_BLOCKED','Task needs an approved frozen execution contract');
      if(this.blockers(id).length)
        fail('TASK_BLOCKED','Unverified prerequisites prevent claiming this task');
      if(this.db.prepare('SELECT id FROM dc_tasks WHERE parent_id=? LIMIT 1').get(id))
        fail('PARENT_NOT_EXECUTABLE','Only atomic leaf tasks can be claimed');
      if(this.db.prepare('SELECT task_id FROM dc_verification_deferrals WHERE task_id=? AND resumed_at IS NULL').get(id))
        fail('VERIFICATION_DEFERRED','Finish the deferred review before claiming again');
      const previous=this.checkoutWriter();
      if(previous?.task_id!==id&&previous?.expires_at>Date.now())
        fail('LEASE_CONFLICT','Another task owns this file workspace');
      if(previous?.task_id!==id&&previous&&
          ['in_progress','in_review'].includes(this.requireTask(String(previous.task_id)).status))
        fail('ABANDONED_TASK','Review or recover the previous task before switching the writer');
      this.checkOtherCheckoutScopes(task);
      const record=this.fileDelivery(id);
      if(task.status==='in_progress'&&!record)
        fail('FILE_BASELINE_MISSING','Cannot resume a file-backed task without its original baseline');
      if(record?.submitted)
        fail('FILE_DELIVERY_ALREADY_SUBMITTED','Cannot silently replace completed source evidence');
      const managed=path.join(this.root,'AGENTS.md');
      const originalAgents=!record&&fs.existsSync(managed)&&
        fs.lstatSync(managed).isFile()&&fs.statSync(managed).size<=512_000?
          fs.readFileSync(managed,'utf8'):null;
      const baseline=record?.baseline??{
        ...observed,managedAgentsText:originalAgents,
      };
      if(captureFileEvidence(this.root).digest!==observed.digest)
        fail('FILE_SOURCE_CHANGED','Source changed while acquiring a file-backed task');
      if(!record)this.db.prepare("INSERT INTO dc_file_deliveries (task_id,baseline_json,captured_at) VALUES(?,?,?)")
        .run(id,JSON.stringify(baseline),utc());
      const token=randomUUID(),source='files-sha256:'+baseline.digest;
      const expiry=Date.now()+ttlSeconds*1000;
      this.db.prepare("INSERT OR REPLACE INTO dc_leases (singleton,task_id,agent,token,base_head,expires_at) VALUES(1,?,?,?,?,?)")
        .run(id,agent.trim(),token,source,expiry);
      this.db.prepare("INSERT INTO dc_task_leases (task_id,agent,token,base_head,expires_at,worktree_path) VALUES(?,?,?,?,?,'') ON CONFLICT(task_id) DO UPDATE SET agent=excluded.agent,token=excluded.token,base_head=excluded.base_head,expires_at=excluded.expires_at,worktree_path=''")
        .run(id,agent.trim(),token,source,expiry);
      this.recordLocalDeveloper(id,'claimed');
      this.db.prepare("UPDATE dc_tasks SET status='in_progress',updated_at=? WHERE id=?")
        .run(utc(),id);
      this.audit(id,record?'file_task_reclaimed':'file_task_claimed',agent,{
        evidenceKind:'files-sha256-v1',baselineDigest:baseline.digest,
        noGitRequired:true,ttlSeconds,
      });
      return {task:this.get(id),executionContract:this.executionContract(id),
        leaseToken:token,baseHead:source,evidenceKind:'files-sha256-v1'};
    });
  }

  /** Explicitly park an expired in_progress writer while preserving its
   * unfinished files, original Git base, exact dirty-file hashes and scope.
   * A successor must be a different approved, ready, DISJOINT task. Merely
   * expiring a lease never grants this permission.
   */
  parkExpiredWriter(id:string,input:{actor:string;reason:string;
    explicitAuthorization?:boolean;nextTaskId:string}):Row{
    const actor=String(input?.actor??'').trim();
    const reason=String(input?.reason??'').trim();
    if(actor.length<2||reason.length<50||reason.length>2000||
      input?.explicitAuthorization!==true)
      fail('PARK_REVIEW_REQUIRED',
        'Owner must explicitly approve and explain the preserved WIP, old task scope and chosen disjoint next task');
    if(!this.hasRootGit)
      fail('PARK_GIT_REQUIRED','The file-backed writer has a separate recovery contract');
    const task=this.requireTask(id);
    const next=this.requireTask(String(input.nextTaskId??''));
    const original=this.checkoutWriter();
    if(!original||original.task_id!==id||original.expires_at>Date.now()||
      task.status!=='in_progress'||next.status!=='ready')
      fail('PARK_STATE_INVALID',
        'Only an expired in_progress Git writer can be parked for an approved ready task');
    if(this.db.prepare('SELECT task_id FROM dc_parked_writers WHERE task_id=?')
      .get(id))
      fail('PARK_ALREADY_RECORDED','This task already has an audited writer handoff');
    if(this.blockers(next.id).length||!this.isApprovedForExecution(next)||
      !this.executionContract(next.id).eligible||!next.approved_by)
      fail('PARK_NEXT_TASK_BLOCKED',
        'Successor task must have its own frozen approved contract and Verified dependencies');
    const oldScope=JSON.parse(task.allowed_paths) as string[];
    const newScope=JSON.parse(next.allowed_paths) as string[];
    if(taskScopesOverlap(oldScope,newScope))
      fail('PARALLEL_SCOPE_CONFLICT',
        'The next task overlaps unfinished source. Do not share its Git index');
    if(discoverRepositories(this.root,[...oldScope,...newScope]).length!==1)
      fail('MULTI_REPO_PARK_UNSUPPORTED',
        'A shared-index handoff cannot move a multi-repository task without full child repository checkpoints');
    this.protectedClaimWorktree(id,task,String(original.base_head));
    const dirty=preservedWorktreeSnapshot(this.root,[]);
    const outsideOld=dirty.filter(file=>
      !oldScope.some(pattern=>pathAllowed(file.path,pattern)));
    const protectedOriginal=this.protectedClaimWorktree(id,task,String(original.base_head));
    if(outsideOld.length&&!protectedOriginal)
      fail('PARK_UNREVIEWED_EXTERNAL_WIP',
        'New unrelated work after a clean claim needs explicit source-task attribution before parking',
        this.worktreeConflictDetails(task,[],outsideOld));
    if(dirty.some(file=>newScope.some(pattern=>pathAllowed(file.path,pattern))))
      fail('PARK_NEXT_SCOPE_DIRTY',
        'Successor has existing uncommitted files in its frozen scope; do not misattribute them');
    const head=git(this.root,['rev-parse','HEAD']);
    if(!run(this.root,'git',['merge-base','--is-ancestor',
      String(original.base_head),head]).passed)
      fail('PARK_HISTORY_CHANGED','Original claim Git head is no longer an ancestor');
    const oldCommits=committedFilesBetween(this.root,String(original.base_head),head);
    const outOfScope=oldCommits.filter(file=>
      !oldScope.some(pattern=>pathAllowed(file,pattern)));
    if(outOfScope.length)
      fail('PARK_COMMITTED_SCOPE_CONFLICT',
        'Cannot prove which Agent committed the intervening paths; review provenance before parking',
        {paths:outOfScope,originalBaseHead:original.base_head,currentHead:head});
    const snapshot=JSON.stringify(dirty);
    const digest=createHash('sha256').update(snapshot).digest('hex');
    return this.inTransaction(()=>{
      const live=this.checkoutWriter();
      if(!live||live.token!==original.token||live.expires_at>Date.now()||
        git(this.root,['rev-parse','HEAD'])!==head||
        JSON.stringify(preservedWorktreeSnapshot(this.root,[]))!==snapshot)
        fail('PARK_RACE','Writer, Git HEAD or tracked local work changed during Owner review');
      this.db.prepare(`INSERT INTO dc_parked_writers
        (task_id,successor_task_id,original_base_head,parked_head,
         preserved_snapshot_json,preserved_digest,actor,reason,parked_at)
         VALUES(?,?,?,?,?,?,?,?,?)`).run(id,next.id,String(original.base_head),
        head,snapshot,digest,actor,reason,utc());
      this.audit(id,'expired_writer_safely_parked',actor,{
        successorTaskId:next.id,originalBaseHead:original.base_head,
        parkedHead:head,preservedDigest:digest,
        preservedPaths:dirty.map(file=>({path:file.path,sha256:file.sha256,
          size:file.size,kind:file.kind})),
        oldScope,newScope,reason,leaseExpired:true,
        writerTransferred:false,filesModifiedByMcp:false,
        testsPassed:false,gateApproved:false,
      });
      return {taskId:id,nextTaskId:next.id,originalBaseHead:original.base_head,
        parkedHead:head,preservedDigest:digest,parked:true,
        filesModifiedByMcp:false,gateApproved:false,
        nextAction:'claim '+next.id};
    });
  }

  private parkedWriterForClaim(previous:Row,task:Row):boolean{
    if(previous.expires_at>Date.now())return false;
    const park=this.db.prepare(`SELECT * FROM dc_parked_writers
      WHERE task_id=? AND successor_task_id=? AND resumed_head IS NULL`)
      .get(previous.task_id,task.id);
    if(!park||this.requireTask(previous.task_id).status!=='in_progress'||
      task.status!=='ready')return false;
    const old=JSON.parse(this.requireTask(previous.task_id).allowed_paths) as string[];
    const next=JSON.parse(task.allowed_paths) as string[];
    if(taskScopesOverlap(old,next))return false;
    const value=String(park.preserved_snapshot_json);
    if(createHash('sha256').update(value).digest('hex')!==park.preserved_digest)
      fail('PARK_RECORD_CORRUPT','The original protected Agent WIP digest was modified');
    if(git(this.root,['rev-parse','HEAD'])!==park.parked_head||
      JSON.stringify(preservedWorktreeSnapshot(this.root,[]))!==value)
      fail('PARK_SOURCE_CHANGED',
        'Git HEAD or protected source changed since Owner-approved handoff; preserve files and review the exact differences',
        this.worktreeConflictDetails(this.requireTask(previous.task_id),
          JSON.parse(value),preservedWorktreeSnapshot(this.root,[])));
    this.protectedClaimWorktree(previous.task_id,
      this.requireTask(previous.task_id),String(previous.base_head));
    return true;
  }

  /** After parked work resumes, distinguish its real Git delivery from the
   * intervening successor task's committed scope. Never credit that task's
   * commit as the original task's code or approval evidence.
   */
  private parkedDeliveryFiles(id:string,base:string,head:string,
    filter='ACMRTD'):string[]|null{
    const park=this.db.prepare(`SELECT * FROM dc_parked_writers
      WHERE task_id=? AND resumed_head IS NOT NULL`).get(id);
    if(!park)return null;
    if(park.original_base_head!==base||!run(this.root,'git',
      ['merge-base','--is-ancestor',base,String(park.parked_head)]).passed||
      !run(this.root,'git',['merge-base','--is-ancestor',
        String(park.parked_head),String(park.resumed_head)]).passed||
      !run(this.root,'git',['merge-base','--is-ancestor',
        String(park.resumed_head),head]).passed)
      fail('PARK_DELIVERY_HISTORY_CHANGED',
        'A parked task may continue only from its exact immutable Git delivery checkpoints');
    const first=committedFilesBetween(this.root,base,String(park.parked_head),filter);
    const middle=committedFilesBetween(this.root,
      String(park.parked_head),String(park.resumed_head));
    const successor=this.requireTask(String(park.successor_task_id));
    const task=this.requireTask(id);
    const own=JSON.parse(task.allowed_paths) as string[];
    const other=JSON.parse(successor.allowed_paths) as string[];
    if(first.some(file=>!own.some(pattern=>pathAllowed(file,pattern)))||
      middle.some(file=>!other.some(pattern=>pathAllowed(file,pattern)))||
      taskScopesOverlap(own,other)||
      !['in_review','verified'].includes(successor.status)||
      !this.latestCompletion(successor.id))
      fail('PARK_INTERVENING_SCOPE_CHANGED',
        'Intervening commits are not demonstrably the disjoint, submitted successor delivery');
    const resumed=committedFilesBetween(this.root,String(park.resumed_head),head,filter);
    return [...new Set([...first,...resumed])].sort();
  }

  private completeFileTask(id:string,token:string,input:CompletionReport):Row{
    if(input.deliveryHeads!==undefined||input.existingDirtyFiles!==undefined||
        input.preserveExistingWorktree===true)
      fail('FILE_DELIVERY_MODE','File-backed delivery uses immutable manifests, not Git options');
    const after=captureFileEvidence(this.root);
    return this.inTransaction(()=>{
      const lease=this.requireLease(id,token);
      this.requireGitWriter(id); // The shared writer is also enforced without Git.
      const task=this.requireTask(id);
      if(task.status!=='in_progress')fail('INVALID_STATE','Task is not developing');
      const record=this.fileDelivery(id);
      if(!record||record.submitted)
        fail('FILE_BASELINE_MISSING','A file delivery needs its original claim snapshot');
      const diff=this.fileTaskChanges(record.baseline,after);
      const allowed=JSON.parse(task.allowed_paths) as string[];
      const contract=this.executionContract(id);
      const exact=contract.profile==='spec-depth-v3'?
        (contract.spec as ReleasePlanNode)?.allowedChangedFiles:undefined;
      const denied=diff.changed.filter(file=>!allowed.some(pattern=>pathAllowed(file,pattern))||
        (exact&&!exact.includes(file)));
      const unexpectedDocs=undocumentedMarkdown(diff.added,allowed);
      if(!diff.changed.length||denied.length||unexpectedDocs.length)
        fail('FILE_DELIVERY_SCOPE_INVALID',
          !diff.changed.length?'No changed source files were observed':
          denied.length?'Changes outside approved scope: '+denied.join(', '):
          'Unapproved Markdown files: '+unexpectedDocs.join(', '));
      if(!this.fileTaskSubmittedUnchanged(after,record.baseline,captureFileEvidence(this.root)))
        fail('FILE_SOURCE_CHANGED','Files changed while recording completion');
      const previous=this.latestCompletion(id);
      const revision=(previous?.revision??0)+1;
      const source='files-sha256:'+after.digest;
      this.db.prepare("UPDATE dc_file_deliveries SET submitted_json=?,completion_revision=?,submitted_at=? WHERE task_id=?")
        .run(JSON.stringify(after),revision,utc(),id);
      this.db.prepare("INSERT INTO dc_completion_notes (task_id,revision,summary,implementation,verification,remaining,preserved_dirty_json,preserved_worktree_json,git_head,agent,created_at) VALUES(?,?,?,?,?,?,'[]','[]',?,?,?)")
        .run(id,revision,input.summary.trim(),input.implementation.trim(),
          input.verification.trim(),(input.remaining??'').trim(),source,lease.agent,utc());
      this.audit(id,'file_completion_recorded',lease.agent,{
        evidenceKind:'files-sha256-v1',sourceDigest:after.digest,
        baselineDigest:record.baseline.digest,revision,files:diff.changed,
      });
      return {taskId:id,revision,summary:input.summary.trim(),
        implementation:input.implementation.trim(),
        verification:input.verification.trim(),
        remaining:(input.remaining??'').trim(),evidenceKind:'files-sha256-v1',
        sourceDigest:after.digest,files:diff.changed,agent:lease.agent};
    });
  }

  private reportFileTask(id:string,token:string,evidence:{
    kind:string;reference:string;deliveryHeads?:Record<string,string>;
  },readyForReview:boolean):Row{
    return this.inTransaction(()=>{
      const lease=this.requireLease(id,token);
      const task=this.requireTask(id);
      const completion=this.latestCompletion(id);
      const delivery=this.fileDelivery(id);
      const resumed=task.status==='in_review'&&
        !!this.db.prepare("SELECT task_id FROM dc_verification_deferrals WHERE task_id=? AND resumed_at IS NOT NULL").get(id);
      if((task.status!=='in_progress'&&!resumed)||!completion||!delivery?.submitted)
        fail('FILE_DELIVERY_REQUIRED','Complete the scoped file delivery before reporting test evidence');
      this.requireGitWriter(id);
      if(evidence.deliveryHeads!==undefined)
        fail('FILE_DELIVERY_MODE','File evidence has no Git deliveryHeads');
      if(typeof evidence.kind!=='string'||!evidence.kind.trim()||
          typeof evidence.reference!=='string'||!evidence.reference.trim())
        fail('EVIDENCE_REQUIRED','Actual test evidence kind and reference are required');
      if(!this.fileTaskSubmittedUnchanged(delivery.submitted,delivery.baseline,
        captureFileEvidence(this.root)))
        fail('FILE_SOURCE_CHANGED','Test evidence must match the completed source snapshot');
      this.db.prepare("INSERT INTO dc_evidence (task_id,kind,reference,git_head,created_at) VALUES(?,?,?,?,?)")
        .run(id,evidence.kind.trim(),evidence.reference.trim(),
          'files-sha256:'+delivery.submitted.digest,utc());
      if(readyForReview)this.db.prepare("UPDATE dc_tasks SET status='in_review',updated_at=? WHERE id=?")
        .run(utc(),id);
      this.audit(id,'file_evidence_reported',lease.agent,{
        evidenceKind:'files-sha256-v1',sourceDigest:delivery.submitted.digest,
        kind:evidence.kind,reference:evidence.reference,readyForReview,
      });
      return this.get(id);
    });
  }

  private verifyFileTask(id:string,token:string,acceptance?:TaskAcceptance):Row{
    return this.inTransaction(()=>{
      const lease=this.requireLease(id,token,'review');
      const task=this.requireTask(id);
      if(task.status!=='in_review')fail('NOT_IN_REVIEW','Report real test evidence before verification');
      const completed=this.latestCompletion(id);
      const delivery=this.fileDelivery(id);
      if(!completed||!delivery?.submitted||delivery.revision!==completed.revision)
        return {taskId:id,passed:false,reason:'FILE_DELIVERY_REQUIRED'};
      const frozen=delivery.submitted;
      const current=captureFileEvidence(this.root);
      if(!this.fileTaskSubmittedUnchanged(frozen,delivery.baseline,current))
        return {taskId:id,passed:false,reason:'FILE_SOURCE_CHANGED',
          detail:'Completed source differs from the tested file manifest'};
      const diff=this.fileTaskChanges(delivery.baseline,frozen);
      const allowed=JSON.parse(task.allowed_paths) as string[];
      const contract=this.executionContract(id);
      if(!contract.eligible)
        return {taskId:id,passed:false,reason:'EXECUTION_CONTRACT_BLOCKED'};
      const exact=contract.profile==='spec-depth-v3'?
        (contract.spec as ReleasePlanNode)?.allowedChangedFiles:undefined;
      if(!diff.changed.length||diff.changed.some(file=>
          !allowed.some(pattern=>pathAllowed(file,pattern))||
          (exact&&!exact.includes(file))))
        return {taskId:id,passed:false,reason:'FILE_DELIVERY_SCOPE_INVALID'};
      if(this.blockers(id).length)
        return {taskId:id,passed:false,reason:'TASK_BLOCKED'};
      if(this.db.prepare("SELECT id FROM dc_tasks WHERE parent_id=? AND status!='verified' LIMIT 1").get(id))
        return {taskId:id,passed:false,reason:'CHILDREN_NOT_VERIFIED'};
      const gates=JSON.parse(task.required_gates) as string[];
      if(!acceptance||typeof acceptance.findings!=='string'||
          acceptance.findings.trim().length<60||
          typeof acceptance.evidenceReference!=='string'||
          !Array.isArray(acceptance.gates)||!gates.length||
          gates.some(g=>!isEvidenceGate(g))||
          acceptance.gates.length!==gates.length||
          acceptance.gates.some(item=>!item||typeof item.gate!=='string')||
          gates.some(g=>acceptance.gates.filter(item=>item.gate===g).length!==1))
        return {taskId:id,passed:false,reason:'TASK_ACCEPTANCE_REQUIRED',
          detail:'A substantive developer review of every frozen real Gate is required'};
      const source='files-sha256:'+frozen.digest;
      const reported=this.db.prepare("SELECT reference FROM dc_evidence WHERE task_id=? AND git_head=?").all(id,source);
      const references=new Set(reported.map(row=>String(row.reference)));
      if(!references.has(acceptance.evidenceReference.trim())||
          acceptance.gates.some(item=>!item||typeof item.findings!=='string'||
            item.findings.trim().length<30||typeof item.evidenceReference!=='string'||
            !references.has(item.evidenceReference.trim())))
        return {taskId:id,passed:false,reason:'TASK_ACCEPTANCE_EVIDENCE_MISSING',
          detail:'Each project Gate needs actual reported test evidence for this exact snapshot'};
      const tokenHash=createHash('sha256').update(token).digest('hex');
      this.db.prepare("INSERT INTO dc_task_acceptances (task_id,completion_revision,completion_head,lease_token_hash,reviewer,findings,evidence_reference,gates_json,accepted_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(task_id) DO UPDATE SET completion_revision=excluded.completion_revision,completion_head=excluded.completion_head,lease_token_hash=excluded.lease_token_hash,reviewer=excluded.reviewer,findings=excluded.findings,evidence_reference=excluded.evidence_reference,gates_json=excluded.gates_json,accepted_at=excluded.accepted_at")
        .run(id,completed.revision,source,tokenHash,lease.agent,
          acceptance.findings.trim(),acceptance.evidenceReference.trim(),
          JSON.stringify(acceptance.gates),utc());
      if(!this.fileTaskSubmittedUnchanged(frozen,delivery.baseline,
        captureFileEvidence(this.root)))
        fail('FILE_SOURCE_CHANGED','Files changed during verification');
      this.db.prepare("UPDATE dc_tasks SET status='verified',verified_at=?,updated_at=? WHERE id=?")
        .run(utc(),utc(),id);
      this.audit(id,'file_task_verified',lease.agent,{
        evidenceKind:'files-sha256-v1',sourceDigest:frozen.digest,
        changedFiles:diff.changed,testsReviewed:gates,
        independentGitHistory:false,
      });
      let ancestor=task.parent_id as string|null;
      while(ancestor){
        const parent=this.requireTask(ancestor);
        const incomplete=this.db.prepare("SELECT id FROM dc_tasks WHERE parent_id=? AND status!='verified' LIMIT 1")
          .get(ancestor);
        if(incomplete||parent.status==='verified')break;
        this.db.prepare("UPDATE dc_tasks SET status='verified',verified_at=?,updated_at=? WHERE id=?")
          .run(utc(),utc(),ancestor);
        this.audit(ancestor,'group_verified_by_children','devcontrol',{lastVerifiedChild:id});
        ancestor=parent.parent_id;
      }
      this.clearTaskLease(id);
      return {taskId:id,passed:true,files:diff.changed,
        evidenceKind:'files-sha256-v1',sourceDigest:frozen.digest,
        gatesReviewed:gates};
    });
  }

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

  /** Audit only SHA-256 of explicit machine-local rules and file bytes.
   * The contents may contain secrets and are never copied into task SQLite.
   */
  private auditLocalExemptions(taskId:string|null,actor:string,phase:string,
    matches:Array<{repoRoot:string;prefix:string;files:string[]}>):void{
    const evidence=matches.filter(m=>m.files.length).map(({repoRoot,prefix,files})=>{
      const rules=fs.readFileSync(
        path.join(fs.realpathSync(git(repoRoot,['rev-parse','--absolute-git-dir'])),
          'info','devcontrol-worktree-ignore'));
      return {repository:prefix||'.',
        rulesSha256:createHash('sha256').update(rules).digest('hex'),
        files:files.map(file=>{
          const absolute=path.join(repoRoot,file),stat=fs.lstatSync(absolute);
          if(!stat.isFile()||stat.isSymbolicLink()||stat.size>16*1024*1024)
            fail('EXEMPTION_CHANGED','Local configuration changed while recording audit');
          return {path:prefix?prefix+'/'+file:file,
            sha256:createHash('sha256').update(fs.readFileSync(absolute)).digest('hex')};
        })};
    });
    if(!evidence.length)return;
    const details={phase,evidence,gitTrackingUnchanged:true,
      frozenScopeUnchanged:true,gitDeliveryUnchanged:true,
      testsOrGatesApproved:false};
    const prior=this.db.prepare(`SELECT details_json FROM dc_audit
      WHERE task_id IS ? AND event='local_worktree_exemption_applied'
      ORDER BY id DESC LIMIT 1`).get(taskId);
    if(prior?.details_json===JSON.stringify(details))return;
    this.audit(taskId,'local_worktree_exemption_applied',actor,details);
  }

  /** Inspect actual tracked/staged and untracked local exceptions at claim
   * and completion, so a checkStaged call is not required to get audit data.
   */
  private auditCurrentLocalExemptions(taskId:string,actor:string,phase:string,
    scopes:string[]):void{
    if(!this.hasRootGit)return;
    const matches=discoverRepositories(this.root,scopes).map(repo=>{
      const changed=new Set<string>();
      for(const args of [
        ['diff','--cached','--name-only','-z'],
        ['diff','--name-only','-z'],
        ['ls-files','--others','--exclude-standard','-z'],
      ]){
        const r=spawnSync('git',args,{cwd:repo.root,encoding:'buffer',
          timeout:12_000,windowsHide:true});
        if(r.status!==0||!Buffer.isBuffer(r.stdout))
          fail('GIT_ERROR','Cannot audit current local worktree exceptions');
        for(const file of r.stdout.toString('utf8').split('\0').filter(Boolean))
          changed.add(file);
      }
      return {repoRoot:repo.root,prefix:repo.prefix,
        files:localWorktreeExemptedFiles(repo.root,[...changed],
          file=>scopes.some(scope=>pathAllowed(
            repo.prefix?repo.prefix+'/'+file:file,scope)))};
    });
    this.auditLocalExemptions(taskId,actor,phase,matches);
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
      -- Additive clarification is append-only. It NEVER edits the original
      -- frozen plan or dc_task_specs, and cannot add paths/Gates/acceptance.
      CREATE TABLE IF NOT EXISTS dc_task_spec_supplement_proposals (
        task_id TEXT PRIMARY KEY REFERENCES dc_tasks(id),
        proposal_hash TEXT NOT NULL,proposal_json TEXT NOT NULL,
        proposed_by TEXT NOT NULL,proposed_at TEXT NOT NULL,
        reviewed_json TEXT,review_hash TEXT,reviewed_at TEXT
      );
      CREATE TABLE IF NOT EXISTS dc_task_spec_supplements (
        task_id TEXT NOT NULL REFERENCES dc_tasks(id),
        revision INTEGER NOT NULL,proposal_hash TEXT NOT NULL,
        review_hash TEXT NOT NULL,proposal_json TEXT NOT NULL,
        reviewed_json TEXT NOT NULL,approved_by TEXT NOT NULL,
        approved_at TEXT NOT NULL,PRIMARY KEY(task_id,revision)
      );
      -- A workspace can contain independently committed, ignored Git roots.
      -- Bind every repository identity and its original base at claim time.
      CREATE TABLE IF NOT EXISTS dc_task_repository_baselines (
        task_id TEXT NOT NULL REFERENCES dc_tasks(id),
        prefix TEXT NOT NULL, git_dir TEXT NOT NULL, base_head TEXT NOT NULL,
        captured_at TEXT NOT NULL, PRIMARY KEY(task_id,prefix)
      );
      -- The original claim-time Git location is immutable. An Owner-approved
      -- workspace move appends location changes instead of rewriting it.
      CREATE TABLE IF NOT EXISTS dc_task_repository_baseline_relocations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id TEXT NOT NULL,
        task_id TEXT NOT NULL REFERENCES dc_tasks(id),
        prefix TEXT NOT NULL,
        from_git_dir TEXT NOT NULL,
        to_git_dir TEXT NOT NULL,
        base_head TEXT NOT NULL,
        actor TEXT NOT NULL,
        reason TEXT NOT NULL,
        relocated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS dc_completion_repository_revisions (
        task_id TEXT NOT NULL REFERENCES dc_tasks(id),
        revision INTEGER NOT NULL, snapshot_json TEXT NOT NULL,
        digest TEXT NOT NULL, PRIMARY KEY(task_id,revision)
      );
      CREATE TABLE IF NOT EXISTS dc_evidence_repository_digests (
        evidence_id INTEGER PRIMARY KEY REFERENCES dc_evidence(id), digest TEXT NOT NULL
      );
      -- Append-only proven migration to a frozen repository vector.
      -- Original evidence and existing Gate results are never rewritten.
      CREATE TABLE IF NOT EXISTS dc_legacy_evidence_rebindings (
        derived_evidence_id INTEGER PRIMARY KEY REFERENCES dc_evidence(id),
        source_evidence_id INTEGER NOT NULL REFERENCES dc_evidence(id),
        task_id TEXT NOT NULL REFERENCES dc_tasks(id),
        completion_revision INTEGER NOT NULL,
        repository_digest TEXT NOT NULL,
        previous_digest TEXT,
        artifact_path TEXT NOT NULL,
        artifact_sha256 TEXT NOT NULL,
        reviewer TEXT NOT NULL,
        findings TEXT NOT NULL,
        reason TEXT NOT NULL,
        bound_at TEXT NOT NULL,
        UNIQUE(source_evidence_id,completion_revision)
      );
      -- Rerun a real test against the ORIGINAL frozen Git checkouts when an
      -- old receipt has lost its output. Failures are recorded here but are
      -- deliberately not eligible as passed evidence in dc_evidence.
      CREATE TABLE IF NOT EXISTS dc_rerun_test_receipts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL REFERENCES dc_tasks(id),
        completion_revision INTEGER NOT NULL,
        supersedes_evidence_id INTEGER NOT NULL REFERENCES dc_evidence(id),
        new_evidence_id INTEGER UNIQUE REFERENCES dc_evidence(id),
        repository_digest TEXT NOT NULL,
        command TEXT NOT NULL,
        command_cwd TEXT NOT NULL,
        tested_checkouts_json TEXT NOT NULL,
        exit_code INTEGER NOT NULL,
        artifact_path TEXT NOT NULL,
        artifact_sha256 TEXT NOT NULL,
        actor TEXT NOT NULL,
        reason TEXT NOT NULL,
        findings TEXT NOT NULL,
        recorded_at TEXT NOT NULL,
        UNIQUE(task_id,completion_revision,supersedes_evidence_id,
          artifact_sha256,command)
      );
      CREATE TABLE IF NOT EXISTS dc_external_gate_repository_digests (
        task_id TEXT NOT NULL REFERENCES dc_tasks(id),
        gate_name TEXT NOT NULL, digest TEXT NOT NULL,
        PRIMARY KEY(task_id,gate_name)
      );
      CREATE TABLE IF NOT EXISTS dc_task_worktree_baselines (
        task_id TEXT PRIMARY KEY REFERENCES dc_tasks(id),
        base_head TEXT NOT NULL, snapshot_json TEXT NOT NULL,
        captured_at TEXT NOT NULL
      );
      -- Only an explicitly approved, task-attributed, append-only review
      -- can recognize unrelated Agent WIP created after another task claimed.
      -- The immutable claim snapshot is never overwritten.
      CREATE TABLE IF NOT EXISTS dc_recovery_worktree_reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL REFERENCES dc_tasks(id),
        source_task_id TEXT NOT NULL REFERENCES dc_tasks(id),
        original_digest TEXT NOT NULL,
        reviewed_snapshot_json TEXT NOT NULL,
        reviewed_digest TEXT NOT NULL,
        reviewed_head TEXT NOT NULL,
        actor TEXT NOT NULL,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      -- One explicitly inspected handoff of an EXPIRED coding writer. The
      -- original task remains in_progress with its original claim baseline.
      -- Never silently transfer an index containing staged changes.
      CREATE TABLE IF NOT EXISTS dc_parked_writers (
        task_id TEXT PRIMARY KEY REFERENCES dc_tasks(id),
        successor_task_id TEXT NOT NULL REFERENCES dc_tasks(id),
        original_base_head TEXT NOT NULL,
        parked_head TEXT NOT NULL,
        preserved_snapshot_json TEXT NOT NULL,
        preserved_digest TEXT NOT NULL,
        actor TEXT NOT NULL,
        reason TEXT NOT NULL,
        parked_at TEXT NOT NULL,
        resumed_head TEXT,
        resumed_at TEXT
      );
      -- Non-Git projects have first-class source evidence. This is NOT a
      -- synthetic Git commit. Capture both the immutable claim baseline and
      -- the exact completed source manifest, bound to reported tests.
      CREATE TABLE IF NOT EXISTS dc_file_deliveries (
        task_id TEXT PRIMARY KEY REFERENCES dc_tasks(id),
        baseline_json TEXT NOT NULL,
        submitted_json TEXT,
        completion_revision INTEGER,
        captured_at TEXT NOT NULL,
        submitted_at TEXT
      );
      -- Immutable authorized upgrade record; the claim-time snapshot is not
      -- overwritten. Child HEADs captured here are migration checkpoints,
      -- never retroactively described as the original task's Git baseline.
      CREATE TABLE IF NOT EXISTS dc_legacy_active_migrations (
        task_id TEXT PRIMARY KEY REFERENCES dc_tasks(id),
        original_root_base TEXT NOT NULL,
        original_worktree_json TEXT NOT NULL,
        protected_worktree_json TEXT NOT NULL,
        repositories_json TEXT NOT NULL,
        repository_digest TEXT NOT NULL,
        migration_reason TEXT NOT NULL,
        actor TEXT NOT NULL,
        migrated_at TEXT NOT NULL
      );
      -- Each child repository may have unrelated, unstaged Owner work. Store
      -- only its out-of-scope SHA-256 snapshot and preserve the original
      -- migration record; this is never Git delivery evidence.
      CREATE TABLE IF NOT EXISTS dc_legacy_child_worktree_snapshots (
        task_id TEXT NOT NULL REFERENCES dc_tasks(id),
        prefix TEXT NOT NULL,
        git_dir TEXT NOT NULL,
        snapshot_json TEXT NOT NULL,
        digest TEXT NOT NULL,
        captured_at TEXT NOT NULL,
        PRIMARY KEY(task_id,prefix)
      );
      -- Append-only Owner-authorized reductions of existing protection.
      -- The claim/migration snapshots are never rewritten. Only a tracked
      -- file proven byte-identical to the current Git HEAD may disappear.
      CREATE TABLE IF NOT EXISTS dc_protected_worktree_refreshes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL REFERENCES dc_tasks(id),
        prefix TEXT NOT NULL,
        git_dir TEXT NOT NULL,
        repo_head TEXT NOT NULL,
        previous_digest TEXT NOT NULL,
        next_snapshot_json TEXT NOT NULL,
        next_digest TEXT NOT NULL,
        removed_paths_json TEXT NOT NULL,
        actor TEXT NOT NULL,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS dc_task_review_handoffs (
        task_id TEXT PRIMARY KEY REFERENCES dc_tasks(id),
        completion_revision INTEGER NOT NULL, completion_head TEXT NOT NULL,
        developer TEXT NOT NULL, ticket_hash TEXT NOT NULL UNIQUE,
        issued_at TEXT NOT NULL, expires_at INTEGER NOT NULL,
        reviewer TEXT, outcome TEXT, findings TEXT, reviewed_at TEXT
      );
      -- Current single-AI acceptance contract. Unlike the legacy multi-step
      -- reviewer/Gate workflow, this is ONE version-bound atomic declaration.
      -- Existing review and gate rows remain readable without migrations.
      CREATE TABLE IF NOT EXISTS dc_task_acceptances (
        task_id TEXT PRIMARY KEY REFERENCES dc_tasks(id),
        completion_revision INTEGER NOT NULL, completion_head TEXT NOT NULL,
        lease_token_hash TEXT NOT NULL, reviewer TEXT NOT NULL,
        findings TEXT NOT NULL, evidence_reference TEXT NOT NULL,
        gates_json TEXT NOT NULL, accepted_at TEXT NOT NULL
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
      -- Non-destructive v5 upgrade: retain the original singleton table as
      -- legacy history. New claims use a per-task lease and isolated checkout.
      CREATE TABLE IF NOT EXISTS dc_task_leases (
        task_id TEXT PRIMARY KEY REFERENCES dc_tasks(id),
        agent TEXT NOT NULL, token TEXT NOT NULL UNIQUE,
        base_head TEXT NOT NULL, expires_at INTEGER NOT NULL,
        worktree_path TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE IF NOT EXISTS dc_task_integration_ready (
        task_id TEXT PRIMARY KEY REFERENCES dc_tasks(id),
        commit_head TEXT NOT NULL, token_hash TEXT NOT NULL,
        reviewed_at TEXT NOT NULL, review_json TEXT NOT NULL
      );
      -- A deferred Gate is NOT a passed Gate or a new task state. Preserve
      -- the original task submission and Git baseline, releasing only the
      -- singleton worktree lease. Its original acceptance remains required.
      CREATE TABLE IF NOT EXISTS dc_verification_deferrals (
        task_id TEXT PRIMARY KEY REFERENCES dc_tasks(id),
        gate_name TEXT NOT NULL, reason TEXT NOT NULL,
        base_head TEXT NOT NULL, completion_head TEXT NOT NULL,
        completion_revision INTEGER NOT NULL,
        deferred_by TEXT NOT NULL, deferred_at TEXT NOT NULL,
        preserved_worktree_json TEXT NOT NULL DEFAULT '[]',
        resumed_at TEXT
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
      -- Preserve each prior completed pause before the same task enters a
      -- later independently reviewed amendment. Never discard Git provenance.
      CREATE TABLE IF NOT EXISTS dc_scope_pause_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL REFERENCES dc_tasks(id),
        prior_record_json TEXT NOT NULL,
        archived_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS dc_evidence (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL REFERENCES dc_tasks(id), kind TEXT NOT NULL,
        reference TEXT NOT NULL, git_head TEXT, created_at TEXT NOT NULL
      );
      -- External project tests are run by the Agent, not by MCP. Evidence
      -- alone never passes a Gate: an independent outcome review is required.
      CREATE TABLE IF NOT EXISTS dc_external_gate_reviews (
        task_id TEXT NOT NULL REFERENCES dc_tasks(id),
        gate_name TEXT NOT NULL,
        lease_token_hash TEXT NOT NULL,
        git_head TEXT NOT NULL,
        evidence_reference TEXT NOT NULL,
        runner TEXT NOT NULL,
        reviewer TEXT NOT NULL,
        outcome TEXT NOT NULL CHECK(outcome IN ('passed','failed')),
        review_notes TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(task_id,gate_name)
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
        preserved_dirty_json TEXT NOT NULL DEFAULT '[]',
        preserved_worktree_json TEXT NOT NULL DEFAULT '[]',
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
      CREATE TABLE IF NOT EXISTS dc_feature_task_second_reviews (
        feature_name TEXT NOT NULL REFERENCES dc_features(name),
        proposal_hash TEXT NOT NULL,
        review_json TEXT NOT NULL,
        review_hash TEXT NOT NULL,
        reviewed_by TEXT NOT NULL,
        reviewed_at TEXT NOT NULL,
        PRIMARY KEY(feature_name,proposal_hash)
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
    const completionColumns = new Set(
      this.db.prepare("PRAGMA table_info(dc_completion_notes)").all().map(row=>row.name),
    );
    if(!completionColumns.has("preserved_dirty_json"))
      this.db.exec("ALTER TABLE dc_completion_notes ADD COLUMN preserved_dirty_json TEXT NOT NULL DEFAULT '[]'");
    if(!completionColumns.has("preserved_worktree_json"))
      this.db.exec("ALTER TABLE dc_completion_notes ADD COLUMN preserved_worktree_json TEXT NOT NULL DEFAULT '[]'");
    const deferralColumns=new Set(
      this.db.prepare("PRAGMA table_info(dc_verification_deferrals)").all().map(row=>row.name),
    );
    if(!deferralColumns.has("preserved_worktree_json"))
      this.db.exec("ALTER TABLE dc_verification_deferrals ADD COLUMN preserved_worktree_json TEXT NOT NULL DEFAULT '[]'");
    // Existing active, expired or crash-recoverable lease rows are copied
    // in place. No approval, audit, evidence or original lease row is deleted.
    this.db.prepare(`INSERT OR IGNORE INTO dc_task_leases
      (task_id,agent,token,base_head,expires_at,worktree_path)
      SELECT task_id,agent,token,base_head,expires_at,'' FROM dc_leases`).run();
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

  /** Recover an abandoned in-progress or in-review task with explicit Owner
   * authorization. Does NOT mark complete, approve tests, or modify Git.
   * The original claim HEAD remains the immutable comparison baseline.
   */
  recoverTaskLease(id:string,input:{actor:string;
    reason:string;ttlSeconds?:number;preserveExistingWorktree?:boolean;
    rebaselineLegacyRepositories?:boolean;explicitAuthorization?:boolean}):Row {
    const actor=String(input?.actor??'').trim(),reason=String(input?.reason??'').trim();
    const ttl=input.ttlSeconds??1800;
    if(actor.length<2||reason.length<30||!Number.isSafeInteger(ttl)||ttl<60||ttl>3600)
      fail('RECOVERY_EVIDENCE_REQUIRED','Provide responsible actor, concrete reason, and 60–3600s TTL');
    const writer=this.db.prepare('SELECT * FROM dc_leases WHERE task_id=?').get(id);
    const lease=writer??this.db.prepare('SELECT * FROM dc_task_leases WHERE task_id=?').get(id);
    if(!lease)fail('LEASE_REQUIRED','No original task lease to restore');
    if(lease.expires_at>Date.now())fail('LEASE_STILL_ACTIVE',
      'An active developer lease cannot be taken without a deliberate handoff');
    const task=this.requireTask(id);
    if(!['in_progress','in_review'].includes(task.status))
      fail('TASK_NOT_ACTIVE','Only unfinished or review-ready tasks can be resumed');
    const currentWriter=this.checkoutWriter();
    if(currentWriter&&currentWriter.task_id!==id)
      fail('RECOVERY_WRITER_CONFLICT',
        'Another task owns this Git index. Do not recover a second writer over its source; finish or safely yield that task first',
        {blockedTask:id,writerTaskId:currentWriter.task_id,
          writerExpired:currentWriter.expires_at<=Date.now(),
          safeAction:'Use claim for an explicitly parked original task only after the disjoint successor has completed or safely yielded its writer'});
    if(!this.hasRootGit){
      if(input.preserveExistingWorktree||input.rebaselineLegacyRepositories)
        fail('FILE_DELIVERY_MODE','A Git-free project has no Git worktree to migrate');
      const delivery=this.fileDelivery(id);
      if(!delivery)fail('FILE_BASELINE_MISSING','Cannot recover without the recorded original file baseline');
      const current=captureFileEvidence(this.root);
      const observed=this.fileTaskChanges(delivery.baseline,current);
      const allowed=JSON.parse(task.allowed_paths) as string[];
      if(observed.changed.some(file=>!allowed.some(p=>pathAllowed(file,p))))
        fail('RECOVERY_SCOPE_CONFLICT','Source changed outside the frozen task scope');
      if(task.status==='in_review'&&
        (!delivery.submitted||
          !this.fileTaskSubmittedUnchanged(delivery.submitted,delivery.baseline,current)))
        fail('FILE_SOURCE_CHANGED','The submitted source no longer matches the review snapshot');
      const token=randomUUID(),expiresAt=Date.now()+ttl*1000;
      return this.inTransaction(()=>{
        const changed=this.db.prepare(`UPDATE dc_task_leases
          SET agent=?,token=?,expires_at=? WHERE task_id=? AND token=? AND expires_at<=?`)
          .run(actor,token,expiresAt,id,String(lease.token),Date.now());
        if(changed.changes!==1)fail('RECOVERY_RACE','The original task lease changed');
        const owner=this.db.prepare('SELECT task_id FROM dc_leases WHERE singleton=1').get();
        if(owner&&owner.task_id!==id)
          fail('LEASE_CONFLICT','Another project task owns the file workspace');
        this.db.prepare(`INSERT OR REPLACE INTO dc_leases
          (singleton,task_id,agent,token,base_head,expires_at)
          VALUES(1,?,?,?,?,?)`).run(id,actor,token,String(lease.base_head),expiresAt);
        this.audit(id,'file_task_lease_recovered',actor,{
          reason,originalBase:lease.base_head,currentDigest:current.digest,
          originalTaskStatus:task.status,taskScope:allowed,
        });
        return {taskId:id,status:task.status,leaseToken:token,expiresAt,
          evidenceKind:'files-sha256-v1',testsPassedByRecovery:false};
      });
    }
    const head=git(this.root,['rev-parse','HEAD']);
    if(!run(this.root,'git',['merge-base','--is-ancestor',String(lease.base_head),head]).passed)
      fail('GIT_HISTORY_CHANGED','Original task baseline is no longer an ancestor of HEAD');
    if(input.preserveExistingWorktree===true||
      input.rebaselineLegacyRepositories===true){
      if(input.preserveExistingWorktree!==true||
        input.rebaselineLegacyRepositories!==true)
        fail('MIGRATION_FLAGS_REQUIRED',
          'Legacy migration requires both explicit Owner preservation and repository rebaseline flags');
      if(input.explicitAuthorization!==true)
        fail('OWNER_AUTHORIZATION_REQUIRED',
          'Legacy repository migration requires an explicit Owner decision, actor, and concrete reason; no credential is required');
      return this.migrateLegacyActiveTask(id,task,lease,input.actor,reason,ttl,head);
    }
    this.protectedClaimWorktree(id,task,String(lease.base_head));
    const note=!writer&&task.status==='in_review'?this.latestCompletion(id):null;
    if(note)this.checkReviewDeliveryHead(id,String(lease.base_head),String(note.git_head));
    const changed=committedFilesBetween(this.root,String(lease.base_head),
      note?String(note.git_head):head);
    const allowed=JSON.parse(task.allowed_paths) as string[];
    if(changed.some(file=>!allowed.some(pattern=>pathAllowed(file,pattern))))
      fail('RECOVERY_SCOPE_CONFLICT','Git commits since the original claim exceed the approved task scope');
    const newToken=randomUUID(),expiresAt=Date.now()+ttl*1000;
    return this.inTransaction(()=>{
      // Defensive compare-and-swap to avoid an interleaving claim or renewal.
      const updated=this.db.prepare(`UPDATE ${writer?'dc_leases':'dc_task_leases'}
        SET agent=?,token=?,expires_at=?
        WHERE task_id=? AND token=? AND expires_at<=?`).run(
        actor,newToken,expiresAt,id,String(lease.token),Date.now());
      if(updated.changes!==1)fail('RECOVERY_RACE','Lease changed while Owner was inspecting it');
      if(writer)this.db.prepare(`UPDATE dc_task_leases
        SET agent=?,token=?,expires_at=? WHERE task_id=?`)
        .run(actor,newToken,expiresAt,id);
      this.audit(id,'owner_task_lease_recovered',actor,{
        previousAgent:lease.agent,originalBaseHead:lease.base_head,
        currentHead:head,reason,ttlSeconds:ttl,previousStatus:task.status,
        committedFiles:changed});
      return {taskId:id,status:task.status,leaseToken:newToken,
        originalBaseHead:lease.base_head,currentHead:head,expiresAt,
        nextActions:['complete','report','review-handoff'],
        warning:'Recovery restores processing rights only; no tests, review or Gate passed'};
    });
  }

  /** One-time migration for a pre-v5 lease. Child HEADs are explicitly
   * migration checkpoints; commits before this checkpoint do not qualify as
   * newly delivered task code. The original root lease base is immutable.
   */
  private migrateLegacyActiveTask(id:string,task:Row,lease:Row,actor:string,
    reason:string,ttl:number,rootHead:string):Row {
    if(this.db.prepare('SELECT task_id FROM dc_legacy_active_migrations WHERE task_id=?').get(id))
      fail('MIGRATION_ALREADY_APPLIED','Owner migration has already been recorded for this task');
    if(this.db.prepare('SELECT task_id FROM dc_task_repository_baselines WHERE task_id=? LIMIT 1').get(id))
      fail('MIGRATION_ALREADY_BOUND','Task already has immutable repository baselines');
    const paths=JSON.parse(task.allowed_paths) as string[];
    const repos=discoverRepositories(this.root,paths);
    if(repos.length<2)fail('MULTI_REPO_NOT_FOUND','No independent Git repositories to migrate');
    if(this.db.prepare('SELECT task_id FROM dc_verification_deferrals WHERE task_id=? AND resumed_at IS NULL').get(id))
      fail('MIGRATION_DEFERRED','Deferred verification requires separate version-vector review');
    const prior=this.db.prepare(`SELECT base_head,snapshot_json
      FROM dc_task_worktree_baselines WHERE task_id=?`).get(id);
    const original=parseProtectedWorktreeSnapshot(
      prior?.snapshot_json??'[]','dc_task_worktree_baselines.snapshot_json');
    if(prior&&prior.base_head!==lease.base_head&&
      !run(this.root,'git',['merge-base','--is-ancestor',
        String(prior.base_head),String(lease.base_head)]).passed)
      fail('CLAIM_BASE_CHANGED','Original worktree baseline cannot be proven');
    const protectedNow=preservedWorktreeSnapshot(this.root,paths);
    const currentByPath=new Map(protectedNow.map(file=>[file.path,file]));
    for(const old of original){
      const current=currentByPath.get(old.path);
      if(!current||current.kind!==old.kind||current.sha256!==old.sha256||
        current.size!==old.size)
        fail('ORIGINAL_WORKTREE_CHANGED','Protected claim-time file changed; Owner migration cannot overwrite it');
    }
    if(protectedNow.some(file=>paths.some(p=>pathAllowed(file.path,p))))
      fail('MIGRATION_SCOPE_DIRTY','Root task-scope dirty files cannot be protected as unrelated work');
    const rootCommits=committedFilesBetween(this.root,String(lease.base_head),rootHead);
    if(rootCommits.some(file=>!paths.some(p=>pathAllowed(file,p))))
      fail('RECOVERY_SCOPE_CONFLICT','Root commits since claim exceed the task scope');
    const childWip:Array<{path:string;kind:string;size:number;sha256:string}>=[];
    const childProtected:Array<{prefix:string;gitDir:string;
      files:ReturnType<typeof preservedWorktreeSnapshot>}>=[];
    for(const repo of repos.filter(r=>!!r.prefix)){
      const unrelated:ReturnType<typeof preservedWorktreeSnapshot>=[];
      for(const item of preservedWorktreeSnapshot(repo.root,paths,repo.prefix)){
        const file=repo.prefix+'/'+item.path;
        if(paths.some(p=>pathAllowed(file,p))){
          childWip.push({...item,path:file});
        }else{
          unrelated.push(item);
        }
      }
      childProtected.push({prefix:repo.prefix,gitDir:repo.gitDir,files:unrelated});
    }
    const baselines=currentRevisions(repos).map(repo=>repo.prefix===''?
      {...repo,baseHead:String(lease.base_head)}:repo);
    const digest=revisionDigest(baselines);
    const sha=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
    const token=randomUUID(),expiresAt=Date.now()+ttl*1000;
    return this.inTransaction(()=>{
      if(this.db.prepare('SELECT task_id FROM dc_legacy_active_migrations WHERE task_id=?').get(id))
        fail('MIGRATION_ALREADY_APPLIED','Concurrent migration already recorded');
      const observed=currentRevisions(discoverRepositories(this.root,paths));
      if(observed.length!==baselines.length||observed.some((repo,i)=>
        repo.prefix!==baselines[i].prefix||repo.gitDir!==baselines[i].gitDir||
        repo.head!==baselines[i].head)||
        JSON.stringify(preservedWorktreeSnapshot(this.root,paths))!==JSON.stringify(protectedNow))
        fail('MIGRATION_STATE_CHANGED','Git identity, HEAD or protected root worktree changed during review');
      for(const repo of repos.filter(r=>!!r.prefix)){
        const dirty=preservedWorktreeSnapshot(repo.root,paths,repo.prefix).map(file=>({
          ...file,path:repo.prefix+'/'+file.path,
        }));
        const protectedFiles=childProtected.find(entry=>entry.prefix===repo.prefix)!.files
          .map(file=>({...file,path:repo.prefix+'/'+file.path}));
        if(JSON.stringify(dirty.slice().sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0))!==
          JSON.stringify([
          ...childWip.filter(file=>file.path.startsWith(repo.prefix+'/')),
          ...protectedFiles,
        ].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0)))
          fail('MIGRATION_STATE_CHANGED','Child repository worktree changed during review');
      }
      const updated=this.db.prepare(`UPDATE dc_leases SET agent=?,token=?,expires_at=?
        WHERE task_id=? AND token=? AND expires_at<=?`)
        .run(actor.trim(),token,expiresAt,id,String(lease.token),Date.now());
      if(updated.changes!==1)fail('RECOVERY_RACE','Original lease changed during Owner recovery');
      this.db.prepare(`UPDATE dc_task_leases
        SET agent=?,token=?,expires_at=? WHERE task_id=?`)
        .run(actor.trim(),token,expiresAt,id);
      for(const repo of baselines)this.db.prepare(`INSERT INTO dc_task_repository_baselines
        (task_id,prefix,git_dir,base_head,captured_at) VALUES(?,?,?,?,?)`)
        .run(id,repo.prefix,repo.gitDir,repo.baseHead,utc());
      for(const item of childProtected)this.db.prepare(`INSERT INTO dc_legacy_child_worktree_snapshots
        (task_id,prefix,git_dir,snapshot_json,digest,captured_at)
        VALUES(?,?,?,?,?,?)`).run(id,item.prefix,item.gitDir,
        JSON.stringify(item.files),sha(item.files),utc());
      this.db.prepare(`INSERT INTO dc_legacy_active_migrations
        (task_id,original_root_base,original_worktree_json,protected_worktree_json,
         repositories_json,repository_digest,migration_reason,actor,migrated_at)
        VALUES(?,?,?,?,?,?,?,?,?)`).run(id,String(lease.base_head),
          JSON.stringify(original),JSON.stringify(protectedNow),
          JSON.stringify(baselines),digest,reason,actor.trim(),utc());
      this.audit(id,'owner_legacy_active_repositories_migrated',actor.trim(),{
        reason,previousAgent:lease.agent,originalRootBase:lease.base_head,
        currentRootHead:rootHead,originalWorktreeDigest:sha(original),
        protectedWorktreeDigest:sha(protectedNow),
        repositoryDigest:digest,repositories:baselines,
        protectedRootPaths:protectedNow.map(file=>file.path),
        protectedChildWorktrees:childProtected.map(item=>({
          prefix:item.prefix,gitDir:item.gitDir,digest:sha(item.files),
          files:item.files.map(file=>file.path),
        })),
        childTaskScopeWip:childWip.map(file=>file.path),
        childBaselinesAreMigrationCheckpoints:true,testsOrGatesApproved:false,
      });
      return {taskId:id,status:task.status,leaseToken:token,expiresAt,
        originalBaseHead:lease.base_head,currentHead:rootHead,
        migration:true,repositories:baselines,repositoryDigest:digest,
        protectedRootPaths:protectedNow.map(file=>file.path),
        protectedChildPaths:childProtected.flatMap(item=>item.files.map(file=>
          item.prefix+'/'+file.path)),
        childTaskScopeWip:childWip.map(file=>file.path),
        nextActions:['check','commit','report','complete','review-handoff'],
        warning:'Only commits after migration checkpoints count as new child delivery. No tests, reviews or Gates passed.'};
    });
  }

  /** Optional legacy reviewer handoff. A reviewer never receives the
   * developer lease or gains permission to edit source. An expired lease
   * can be recovered by an explicit, audited decision without a password.
   */
  handoffReview(id:string,input:{leaseToken?:string;
    actor:string;reason:string;rotatePendingTicket?:boolean;
    explicitAuthorization?:boolean}):Row {
    if(typeof input?.actor!=="string"||input.actor.trim().length<2||
      typeof input.reason!=="string"||input.reason.trim().length<20)
      fail("HANDOFF_EVIDENCE_REQUIRED","Provide actor and concrete handoff reason");
    const lease=this.db.prepare("SELECT * FROM dc_task_leases WHERE task_id=?").get(id)??
      this.db.prepare("SELECT * FROM dc_leases WHERE task_id=?").get(id);
    if(!lease)fail("LEASE_REQUIRED","Task has no retained lease for audited handoff");
    const writer=this.db.prepare('SELECT expires_at,token FROM dc_leases WHERE task_id=?').get(id);
    const normal=typeof input.leaseToken==="string"&&
      input.leaseToken===lease.token&&
      (writer?writer.token===lease.token&&writer.expires_at>Date.now():
        lease.expires_at>Date.now());
    const authorizedRecovery=!!input.explicitAuthorization&&
      lease.expires_at<=Date.now()&&(!writer||writer.expires_at<=Date.now());
    if(!normal&&!authorizedRecovery)
      fail("HANDOFF_AUTH_REQUIRED",
        "Use the active developer lease, or explicitly approve recovery after the original lease expires; no secret is required");
    const task=this.requireTask(id),note=this.latestCompletion(id);
    if(task.status!=="in_review"||!note||!this.db.prepare(
      "SELECT id FROM dc_evidence WHERE task_id=? LIMIT 1").get(id))
      fail("REVIEW_NOT_READY","Completion report and task evidence are required before handoff");
    const head=this.checkReviewDeliveryHead(id,String(lease.base_head),String(note.git_head));
    // Do not move or discard dirty files while changing the workflow actor.
    this.protectedClaimWorktree(id,task,lease.base_head);
    const token=randomUUID()+randomUUID();
    const ticketHash=createHash('sha256').update(token).digest('hex');
    const expiresAt=Date.now()+24*60*60*1000;
    return this.inTransaction(()=>{
      const existing=this.db.prepare(`SELECT developer,completion_revision,completion_head,
        outcome FROM dc_task_review_handoffs WHERE task_id=?`).get(id);
      if(existing){
        // A lost one-time ticket must not strand a completed task for 24h.
        // Rotation requires the SAME currently authenticated developer lease;
        // neither an arbitrary reviewer nor Owner recovery may silently
        // invalidate a ticket that an independent reviewer already holds.
        if(input.rotatePendingTicket!==true)fail('HANDOFF_EXISTS',
          'An existing review handoff requires explicit pending-ticket rotation');
        if(!normal||existing.developer!==lease.agent||existing.outcome||
          existing.completion_revision!==note.revision||
          existing.completion_head!==note.git_head)
          fail('HANDOFF_ROTATION_DENIED',
            'Only the original active developer may rotate an unreviewed ticket for the identical committed completion');
        this.db.prepare(`UPDATE dc_task_review_handoffs SET ticket_hash=?,issued_at=?,expires_at=?
          WHERE task_id=?`).run(ticketHash,utc(),expiresAt,id);
        this.audit(id,'review_ticket_rotated',input.actor.trim(),{
          developer:lease.agent,revision:note.revision,head:note.git_head,
          observedHead:head,reason:input.reason,expiresAt,
        });
      }else{
        this.db.prepare(`INSERT INTO dc_task_review_handoffs
          (task_id,completion_revision,completion_head,developer,ticket_hash,issued_at,expires_at)
          VALUES(?,?,?,?,?,?,?)`).run(id,note.revision,note.git_head,lease.agent,ticketHash,utc(),expiresAt);
      }
      this.db.prepare("UPDATE dc_leases SET expires_at=? WHERE task_id=?")
        .run(expiresAt,id);
      this.db.prepare("UPDATE dc_task_leases SET expires_at=? WHERE task_id=?")
        .run(expiresAt,id);
      if(!existing)this.audit(id,"review_handed_off",input.actor.trim(),{
        developer:lease.agent,revision:note.revision,head:note.git_head,
        observedHead:head,reason:input.reason,
        via:normal?'developer_lease':'explicit_expired_lease_recovery',expiresAt});
      return {taskId:id,status:'awaiting_independent_review',ticket:token,
        completionRevision:note.revision,completionHead:note.git_head,
        currentHead:head,expiresAt,rotated:!!existing,
        nextAction:'review-submit: a different Reviewer inspects this delivery and cites its recorded evidence'};
    });
  }

  independentTaskReview(id:string,ticket:string,input:{reviewer:string;
    outcome:'passed'|'failed';findings:string;evidenceReference:string}):Row {
    if(!input||!['passed','failed'].includes(input.outcome)||
      typeof input.reviewer!=="string"||input.reviewer.trim().length<2||
      typeof input.findings!=="string"||input.findings.trim().length<40||
      typeof input.evidenceReference!=="string"||!input.evidenceReference.trim())
      fail("REVIEW_EVIDENCE_REQUIRED","Reviewer must provide decision, findings and actual evidence reference");
    return this.inTransaction(()=>{
      const handoff=this.requireReviewTicket(id,ticket);
      if(input.reviewer.trim()===handoff.developer)
        fail("REVIEWER_NOT_INDEPENDENT","Reviewer must differ from the delivering Agent");
      if(handoff.outcome)fail("REVIEW_ALREADY_DECIDED","Previous independent review is immutable");
      const note=this.latestCompletion(id);
      if(!note||note.revision!==handoff.completion_revision||
        note.git_head!==handoff.completion_head)
        fail("REVIEW_BASE_CHANGED","Completion or Git HEAD changed; begin a new handoff");
      const lease=this.db.prepare('SELECT base_head FROM dc_task_leases WHERE task_id=?').get(id);
      if(!lease)fail('LEASE_REQUIRED','Reviewer needs the retained delivery lease baseline');
      this.checkReviewDeliveryHead(id,String(lease.base_head),String(note.git_head));
      const evidence=this.db.prepare(
        "SELECT id FROM dc_evidence WHERE task_id=? AND reference=? AND git_head=?",
      ).get(id,input.evidenceReference,handoff.completion_head);
      if(!evidence)fail("REVIEW_EVIDENCE_MISSING","Review must cite actual task evidence at the completion commit");
      this.db.prepare(`UPDATE dc_task_review_handoffs
        SET reviewer=?,outcome=?,findings=?,reviewed_at=? WHERE task_id=?`)
        .run(input.reviewer.trim(),input.outcome,input.findings.trim(),utc(),id);
      this.audit(id,"independent_task_reviewed",input.reviewer.trim(),{
        outcome:input.outcome,completionRevision:note.revision,head:note.git_head,
        evidenceReference:input.evidenceReference,findings:input.findings});
      if(input.outcome==='failed'){
        this.db.prepare("UPDATE dc_tasks SET status='in_progress',updated_at=? WHERE id=?")
          .run(utc(),id);
        this.db.prepare("DELETE FROM dc_task_review_handoffs WHERE task_id=?").run(id);
        this.audit(id,"review_returned_for_rework",input.reviewer.trim(),{
          completionRevision:note.revision,reason:input.findings});
      }
      return {taskId:id,outcome:input.outcome,status:input.outcome==='passed'?
        'reviewed_for_gate_verification':'returned_for_rework',head:note.git_head,
        nextAction:input.outcome==='passed'?'reviewed-verify: execute the unchanged real Gate requirements':
          'correct the reviewed findings, then complete and start a new handoff'};
    });
  }

  /** The responsible developer may inspect and accept their own submitted
   * work in a separate, explicit, auditable review action. A second Agent is
   * optional for ordinary tasks, not an implicit dependency of DevControl.
   * This is NOT an automatic pass: original commit and evidence must match.
   */
  reviewOwnTask(id:string,token:string,input:{
    outcome:'passed'|'failed';findings:string;evidenceReference:string;
  }):Row {
    if(!input||!['passed','failed'].includes(input.outcome)||
      typeof input.findings!=='string'||input.findings.trim().length<60||
      typeof input.evidenceReference!=='string'||!input.evidenceReference.trim())
      fail('SELF_REVIEW_EVIDENCE_REQUIRED',
        'Record a substantive review of actual code and tests, an outcome and the exact evidence reference');
    return this.inTransaction(()=>{
      const lease=this.requireLease(id,token,'review');
      const task=this.requireTask(id);
      if(task.status!=='in_review')fail('NOT_IN_REVIEW','Complete and report real evidence first');
      const note=this.latestCompletion(id);
      if(!note)fail('COMPLETION_REVISION_REQUIRED','Self-review requires a committed delivery');
      const currentHead=this.checkReviewDeliveryHead(id,String(lease.base_head),String(note.git_head));
      // Self-review is permitted for both single- and multi-repository tasks.
      // It must bind to the same committed repository version vector as the
      // completion and its actual evidence; it is not a scope-pause operation.
      const observed=this.observedTaskRepositories(id,task);
      const multiRepo=observed.some(repo=>!!repo.prefix);
      const repositories=multiRepo?this.frozenDeliveryRepositories(id,task):observed;
      if(multiRepo){
        this.requireChildReposClean(observed,id,task);
        const snapshot=this.db.prepare(`SELECT snapshot_json,digest
          FROM dc_completion_repository_revisions WHERE task_id=? AND revision=?`)
          .get(id,note.revision);
        if(!snapshot||snapshot.digest!==this.repositoryEvidenceDigest(id,repositories)||
          JSON.stringify(this.relocatedRepositories(id,JSON.parse(String(snapshot.snapshot_json))))
            !==JSON.stringify(repositories))
          fail('REPOSITORY_EVIDENCE_STALE',
            'Self-review must inspect the exact committed revision of every Git repository');
      }
      const evidence=this.db.prepare(`SELECT id FROM dc_evidence
        WHERE task_id=? AND reference=? AND git_head=? ORDER BY id DESC LIMIT 1`)
        .get(id,input.evidenceReference.trim(),note.git_head);
      if(!evidence)fail('REVIEW_EVIDENCE_MISSING',
        'Self-review must cite actual task evidence at the committed delivery');
      if(multiRepo){
        const bound=this.db.prepare(`SELECT digest FROM dc_evidence_repository_digests
          WHERE evidence_id=?`).get(evidence.id);
        if(bound?.digest!==this.repositoryEvidenceDigest(id,repositories))
          fail('REPOSITORY_EVIDENCE_STALE',
            'Self-review must cite real evidence for the full Git repository version vector');
      }
      const previous=this.db.prepare(`SELECT * FROM dc_task_review_handoffs WHERE task_id=?`).get(id);
      if(previous&&(previous.outcome||previous.developer!==lease.agent||
        previous.completion_revision!==note.revision||
        previous.completion_head!==note.git_head))
        fail('REVIEW_ALREADY_DECIDED',
          'A decided review or a review for another delivery cannot be overwritten');
      if(!previous){
        const randomHash=createHash('sha256').update(randomUUID()+randomUUID()).digest('hex');
        this.db.prepare(`INSERT INTO dc_task_review_handoffs
          (task_id,completion_revision,completion_head,developer,ticket_hash,issued_at,expires_at)
          VALUES(?,?,?,?,?,?,?)`).run(id,note.revision,note.git_head,lease.agent,
            randomHash,utc(),Date.now()+24*60*60*1000);
      }
      // Invalidate an optional pending independent-review ticket, if one was
      // created before the Owner chose the single-Agent review policy.
      const invalidatedTicket=createHash('sha256').update(randomUUID()+randomUUID()).digest('hex');
      this.db.prepare(`UPDATE dc_task_review_handoffs SET
        ticket_hash=?,reviewer=?,outcome=?,findings=?,reviewed_at=? WHERE task_id=?`)
        .run(invalidatedTicket,lease.agent,input.outcome,input.findings.trim(),utc(),id);
      this.audit(id,'developer_task_self_reviewed',lease.agent,{
        outcome:input.outcome,completionRevision:note.revision,
        completionHead:note.git_head,observedHead:currentHead,
        evidenceReference:input.evidenceReference,findings:input.findings.trim(),
        independentReviewer:false,
      });
      if(input.outcome==='failed'){
        this.db.prepare("UPDATE dc_tasks SET status='in_progress',updated_at=? WHERE id=?")
          .run(utc(),id);
        this.db.prepare('DELETE FROM dc_task_review_handoffs WHERE task_id=?').run(id);
      }
      return {taskId:id,outcome:input.outcome,reviewMode:'developer_self_review',
        completionHead:note.git_head,taskStatus:input.outcome==='passed'?'in_review':'in_progress',
        nextAction:input.outcome==='passed'?'gate-review':'correct findings and record a new completion'};
    });
  }

  /** Review the submitted commit, not whichever HEAD unrelated developers
   * reached later. An advanced HEAD may not replace the submitted delivery.
   * Ordinary descendant commits that do not touch its delivered files are
   * project collaboration, NOT an amendment to this task or its evidence.
   */
  private checkReviewDeliveryHead(id:string,baseHead:string,completionHead:string):string {
    const current=git(this.root,['rev-parse','HEAD']);
    if(!run(this.root,'git',['merge-base','--is-ancestor',baseHead,current]).passed)
      fail('REVIEW_BASE_CHANGED','Original task claim is no longer in Git history');
    if(current===completionHead)return current;
    const task=this.requireTask(id);
    if(this.taskRepositories(id,task).some(repo=>!!repo.prefix)){
      const frozen=this.frozenDeliveryRepositories(id,task);
      if(frozen.find(repo=>repo.prefix==='')?.head!==completionHead)
        fail('REVIEW_BASE_CHANGED','Root delivery SHA does not match frozen multi-Git delivery');
      return current;
    }
    if(!run(this.root,'git',['merge-base','--is-ancestor',completionHead,current]).passed)
      fail('REVIEW_BASE_CHANGED','The submitted task commit is no longer in Git history');
    const submitted=new Set(committedFilesBetween(this.root,baseHead,completionHead));
    const allowed=JSON.parse(task.allowed_paths) as string[];
    const intervening=committedFilesBetween(this.root,completionHead,current);
    const collisions=intervening.filter(file=>submitted.has(file)||
      allowed.some(pattern=>pathAllowed(file,pattern)));
    if(!collisions.length)return current;
    const deferral=this.db.prepare(`SELECT base_head,completion_head,resumed_at
      FROM dc_verification_deferrals WHERE task_id=?`).get(id);
    if(!deferral||!deferral.resumed_at||deferral.base_head!==baseHead||
      deferral.completion_head!==completionHead)
      fail('DELIVERY_SCOPE_CHANGED',
        'Later commits changed files in the submitted task. Recheck and record a new scoped delivery before marking it accepted: '+collisions.join(', '));
    if(!frozenPatchStillPresent(this.root,baseHead,completionHead)&&
      !this.hasReviewedDeferredOverlap(id,baseHead,completionHead,current,collisions))
      fail('DEFERRED_CODE_CHANGED',
      'Later commits touched the deferred delivery: '+collisions.join(', ')+
      '. Inspect changes and record a new scoped completion before reviewing');
    return current;
  }

  /** Explicit Agent code-diff reconciliation, recorded against an exact later
   * Git HEAD. This is an audit/authorization record, NOT a business test.
   * A subsequent commit or changed overlapping file list invalidates it.
   */
  private hasReviewedDeferredOverlap(id:string,base:string,completion:string,
    current:string,overlaps:string[]):boolean {
    const rows=this.db.prepare(`SELECT details_json FROM dc_audit WHERE task_id=?
      AND event='deferred_overlap_reconciled' ORDER BY id DESC LIMIT 3`).all(id);
    return rows.some(row=>{
      try{
        const a=JSON.parse(String(row.details_json));
        return a.baseHead===base&&a.completionHead===completion&&
          a.currentHead===current&&
          JSON.stringify(a.overlappingPaths)===JSON.stringify([...overlaps].sort())&&
          typeof a.findings==='string'&&a.findings.length>=100&&
          typeof a.evidenceReference==='string'&&a.evidenceReference.length>=15;
      }catch{return false;}
    });
  }

  /** Rebind old protected worktree provenance to the exact reviewed Git HEAD.
   * In-scope WIP is eligible ONLY if its prior deferral SHA and byte count
   * match. Newly staged files or changed original scoped WIP never qualify.
   * This action is not evidence that any project Gate passed.
   */
  reviewDeferredWorktree(id:string,token:string,input:{
    reviewedHead:string;findings:string;
  }):Row {
    if(!input||typeof input.findings!=='string'||input.findings.trim().length<100)
      fail('WORKTREE_REVIEW_REQUIRED','Explain the originally frozen WIP and subsequent approved changes');
    return this.inTransaction(()=>{
      const lease=this.requireLease(id,token);
      const task=this.requireTask(id);
      const note=this.latestCompletion(id);
      const deferred=this.db.prepare(`SELECT * FROM dc_verification_deferrals
        WHERE task_id=? AND resumed_at IS NOT NULL`).get(id);
      const currentHead=git(this.root,['rev-parse','HEAD']);
      const resumedOriginal=!!deferred&&note?.git_head===deferred.completion_head;
      const freshCompletion=!deferred&&note?.git_head===currentHead;
      if(!note||task.status!=='in_review'||
        !(resumedOriginal||freshCompletion)||input.reviewedHead!==currentHead)
        fail('WORKTREE_REVIEW_BASE_CHANGED',
          'Only the original resumed delivery or newly completed task at its exact reviewed HEAD may rebind protected WIP');
      this.checkReviewDeliveryHead(id,String(lease.base_head),String(note.git_head));
      const original=JSON.parse(String((resumedOriginal?
        deferred.preserved_worktree_json:note.preserved_worktree_json)??'[]')) as
        Array<{path:string;kind:string;sha256:string;size:number}>;
      const baseline=new Map(original.map(row=>[row.path,row]));
      const current=preservedWorktreeSnapshot(this.root,JSON.parse(task.allowed_paths));
      const allowed=JSON.parse(task.allowed_paths) as string[];
      if(git(this.root,['diff','--cached','--name-only']).trim())
        fail('WORKTREE_REVIEW_STAGED','A reviewed protected worktree must not contain staged edits');
      const scoped=current.filter(row=>allowed.some(p=>pathAllowed(row.path,p)));
      const originalScoped=original.filter(row=>allowed.some(p=>pathAllowed(row.path,p)));
      const scopedByPath=new Map(scoped.map(row=>[row.path,row]));
      if(originalScoped.some(old=>{
        const actual=scopedByPath.get(old.path);
        return !actual||actual.kind!==old.kind||actual.sha256!==old.sha256||
          actual.size!==old.size;
      })||scoped.some(row=>{
        const old=baseline.get(row.path);
        return !old||old.kind!==row.kind||old.sha256!==row.sha256||old.size!==row.size;
      }))fail('WORKTREE_REVIEW_SCOPE_CHANGED',
        'Current in-scope uncommitted files must exactly match the earlier captured deferral fingerprints');
      this.audit(id,resumedOriginal?'deferred_protected_worktree_reviewed':
        'completed_protected_worktree_reviewed',lease.agent,{
        originalCompletionHead:note.git_head,currentHead,
        snapshot:current,scopedUnmodifiedFiles:scoped.map(row=>row.path),
        findings:input.findings.trim(),gatePassed:false,
      });
      return {taskId:id,reviewedHead:currentHead,scopedUnmodifiedFiles:scoped.length,
        protectedFiles:current.length,gatePassed:false};
    });
  }

  private hasReviewedDeferredWorktree(id:string,completion:string,head:string):boolean {
    const row=this.db.prepare(`SELECT details_json FROM dc_audit WHERE task_id=?
      AND event='deferred_protected_worktree_reviewed' ORDER BY id DESC LIMIT 1`).get(id);
    if(!row)return false;
    try{
      const recorded=JSON.parse(String(row.details_json));
      return recorded.originalCompletionHead===completion&&
        recorded.currentHead===head&&
        JSON.stringify(recorded.snapshot)===JSON.stringify(preservedWorktreeSnapshot(this.root,
          JSON.parse(this.requireTask(id).allowed_paths)));
    }catch{return false;}
  }


  private hasReviewedCompletedWorktree(id:string,completion:string,head:string):boolean {
    const row=this.db.prepare(`SELECT details_json FROM dc_audit WHERE task_id=?
      AND event='completed_protected_worktree_reviewed' ORDER BY id DESC LIMIT 1`).get(id);
    if(!row)return false;
    try{
      const review=JSON.parse(String(row.details_json));
      return review.originalCompletionHead===completion&&review.currentHead===head&&
        JSON.stringify(review.snapshot)===JSON.stringify(preservedWorktreeSnapshot(this.root,
          JSON.parse(this.requireTask(id).allowed_paths)));
    }catch{return false;}
  }

  private requireReviewTicket(id:string,ticket:string):Row {
    if(typeof ticket!=="string"||ticket.length<50)
      fail("REVIEW_TICKET_REQUIRED","Valid handoff ticket required");
    const hash=createHash('sha256').update(ticket).digest('hex');
    const row=this.db.prepare("SELECT * FROM dc_task_review_handoffs WHERE task_id=? AND ticket_hash=?")
      .get(id,hash);
    if(!row||row.expires_at<=Date.now())fail("REVIEW_TICKET_EXPIRED",
      "Missing or expired handoff ticket; recover via authorized Owner action");
    return row;
  }

  verifyReviewedTask(id:string,ticket:string):Row {
    const row=this.requireReviewTicket(id,ticket);
    if(row.outcome!=='passed')fail("TASK_REVIEW_REQUIRED",
      "A recorded developer self-review or optional independent review must pass before acceptance");
    const lease=this.db.prepare("SELECT * FROM dc_task_leases WHERE task_id=?").get(id);
    if(!lease||lease.agent!==row.developer)
      fail("LEASE_CHANGED","Original developer's task lease is no longer available");
    const result=this.verify(id,String(lease.token));
    return {...result,reviewer:row.reviewer,
      ...(!result.passed?{nextAction:'task-closure-status',
        nextActionHint:'Read the failed Gate and required evidence; keep the task in review'}:{})};
  }

  /** Read-only, explicit closeout checklist. Never impersonates a reviewer,
   * manufactures evidence, or initiates tests on behalf of the host Agent.
   */
  taskClosureStatus(id:string):Row {
    const task=this.requireTask(id);
    const lease=this.db.prepare('SELECT agent,token,base_head,expires_at FROM dc_task_leases WHERE task_id=?').get(id);
    const deferred=this.db.prepare('SELECT gate_name,completion_head,resumed_at FROM dc_verification_deferrals WHERE task_id=?').get(id);
    const note=this.latestCompletion(id);
    const evidence=this.db.prepare('SELECT reference,git_head,kind FROM dc_evidence WHERE task_id=? ORDER BY id').all(id);
    const frozenRow=note?this.db.prepare(`SELECT snapshot_json,digest
      FROM dc_completion_repository_revisions
      WHERE task_id=? AND revision=?`).get(id,note.revision):null;
    const frozenDeliveryHeads:Record<string,string>|null=frozenRow
      ?Object.fromEntries((JSON.parse(String(frozenRow.snapshot_json)) as
        RepositoryRevision[]).map(repo=>[repo.prefix,repo.head])):null;
    const latestEvidenceByRef=new Map<string,Row>();
    if(frozenRow&&note){
      for(const row of this.db.prepare(`SELECT e.id,e.reference,d.digest
        FROM dc_evidence e LEFT JOIN dc_evidence_repository_digests d
          ON d.evidence_id=e.id
        WHERE e.task_id=? AND e.git_head=? ORDER BY e.id DESC`)
        .all(id,String(note.git_head))){
        const ref=String(row.reference);
        if(!latestEvidenceByRef.has(ref))latestEvidenceByRef.set(ref,row);
      }
    }
    const staleLegacyEvidence=[...latestEvidenceByRef.values()]
      .filter(row=>row.digest!==frozenRow?.digest&&
        !this.db.prepare(`SELECT r.id FROM dc_rerun_test_receipts r
          WHERE r.task_id=? AND r.completion_revision=?
            AND r.supersedes_evidence_id=? AND r.new_evidence_id IS NOT NULL
          LIMIT 1`).get(id,note?.revision??-1,row.id))
      .map(row=>({reference:row.reference,evidenceId:row.id,
        recordedDigest:row.digest??null}));
    const handoff=this.db.prepare(`SELECT reviewer,outcome,completion_head,completion_revision,
      issued_at,expires_at FROM dc_task_review_handoffs WHERE task_id=?`).get(id);
    const gates=JSON.parse(task.required_gates) as string[];
    const decisionRecord=this.db.prepare('SELECT task_id FROM dc_task_decisions WHERE task_id=?')
      .get(id);
    const contract=this.executionContract(id);
    const internalDecision=gates.length===1&&gates[0]==='sqlite_decision'||
      (!!decisionRecord&&contract.profile==='atomic-work-item'&&
        (contract.spec as {type?:string}|null)?.type==='decision');
    const acceptanceGates=internalDecision?[]:gates.filter(name=>isEvidenceGate(name));
    const reviewHead=note?.git_head??null;
    const pendingGates=acceptanceGates.filter(name=>{
      const record=this.db.prepare(`SELECT outcome,git_head,evidence_reference,
        reviewer,runner,lease_token_hash FROM dc_external_gate_reviews WHERE task_id=? AND gate_name=?`).get(id,name);
      const ownGateReview=!!lease&&handoff?.outcome==='passed'&&
        handoff.reviewer===lease.agent&&record?.reviewer===lease.agent;
      return !record||record.outcome!=='passed'||record.git_head!==reviewHead||
        (!ownGateReview&&(record.reviewer===record.runner||record.reviewer===lease?.agent))||
        !lease||record.lease_token_hash!==createHash('sha256').update(String(lease.token)).digest('hex')||
        !this.db.prepare(
          'SELECT id FROM dc_evidence WHERE task_id=? AND reference=? AND git_head=?',
        ).get(id,String(record.evidence_reference),String(reviewHead));
    });
    const steps:{action:string;condition:string;instructions:string}[]=[];
    const add=(action:string,condition:string,instructions:string)=>steps.push({action,condition,instructions});
    if(task.status==='verified'){
      return {taskId:id,status:'verified',readyForReview:false,completed:true,
        nextAction:null,steps:[],completionHead:note?.git_head??null};
    }
    if(deferred&&!deferred.resumed_at){
      return {taskId:id,status:task.status,completed:false,leaseActive:false,
        nextAction:'resume-verification',deferredGate:deferred.gate_name,
        completionHead:note?.git_head??null,steps:[{
          action:'resume-verification',condition:'external acceptance evidence pending',
          instructions:'Run the required project-owned acceptance test; resume this frozen delivery when evidence exists. If the real retry still fails or is unavailable, re-defer with an honest reason. Never mark the Gate passed without proof',
        }],note:'Deferral preserves the original code and evidence; no Verified yet'};
    }
    if(!lease){
      add('recover-task','task has no retained identity token',
        'Recover the original task without changing its frozen delivery or test evidence');
    }else if(lease.expires_at<=Date.now()&&task.status!=='in_review'){
      add('recover-task','writer lease expired',
        'Restore the original coding task after checking its files and Git history');
    }
    if(!note){
      add('complete','structured delivery missing',
        'Record the approved Git commit or file snapshot delivery and actual tests under the valid task lease; do not redevelop');
    }
    if(!evidence.length){
      add('report','task evidence missing',
        'Record actual test output or commit-bound evidence already produced by the Agent');
    }
    if(task.status==='in_progress'&&note&&evidence.length){
      add('report','developer has not requested review yet',
        'Use report with existing real evidence and readyForReview=true before the Agent review');
    }
    if(note&&evidence.length&&task.status==='in_review'&&
      staleLegacyEvidence.length>0&&!internalDecision){
      add('rebind-legacy-evidence','existing multi-Git test receipt lacks the frozen delivery vector',
        'If the ORIGINAL test log exists, inspect its SHA-256 and use rebind-legacy-evidence. If that log was lost, run genuine project tests again from clean, exact frozen Git worktrees for ALL repositories; then use record-rerun-evidence with supersedesEvidenceId, testedCheckouts, commandCwd, exitCode and new log SHA-256. Neither action runs a test or passes a Gate; the original review token works even after writer expiry.');
      add('record-rerun-evidence','original test output is missing but actual frozen-code tests can be rerun',
        'Run the original project tests in exact detached frozen checkouts, independently verify all checkout HEADs, keep the new output and SHA-256, record the true exitCode. Review still needs a separate verify covering every frozen Gate.');
    }
    if(note&&evidence.length&&task.status==='in_review'&&!internalDecision){
      add('verify','ready for one developer acceptance',
        'Use verify with acceptance={evidenceReference,findings,gates:[{gate,evidenceReference,findings}]} referencing real tests for EVERY frozen Gate. Review the original Git commit or immutable SHA-256 file snapshot. DevControl records ONE atomic acceptance. No separate reviewer is required.');
    }else if(note&&evidence.length){
      if(!handoff){
        if(task.status==='in_review')add('self-review','developer review not recorded',
          'The responsible Agent reviews the exact committed delivery and real project test evidence');
      }else if(!handoff.outcome){
        add('self-review','developer review not recorded',
          'A second Reviewer is optional; the original developer may review using the valid lease and the frozen task evidence');
      }else if(handoff.outcome==='passed'){
        if(pendingGates.length)add('gate-review','required acceptance evidence review missing',
          'Agent runs project tests and reports evidence for '+pendingGates.join(', ')+
          '; the responsible Agent records findings with reviewMode=self or an optional separate reviewer');
        add(handoff.reviewer===lease?.agent?'verify':'reviewed-verify',
          'task review passed but Verified not recorded',
          'Validate scope, original commit, bound evidence and explicit Agent Gate review; MCP runs no tests');
      }else{
        add('complete','independent review rejected delivery',
          'Fix the concrete reviewer findings and submit a new completion revision before arranging another handoff');
      }
    }
    return {taskId:id,status:task.status,completed:false,
      nextAction:steps[0]?.action??'trace',steps,
      completionHead:note?.git_head??null,
      currentHead:this.hasRootGit?git(this.root,['rev-parse','HEAD']):
        'files-sha256:'+captureFileEvidence(this.root).digest,
      deferredGate:deferred&&!deferred.resumed_at?deferred.gate_name:null,
      leaseActive:!!lease&&lease.expires_at>Date.now(),
      reviewTokenUsable:!!lease&&task.status==='in_review'&&!!note,
      staleLegacyEvidence,frozenDeliveryHeads,
      recordedEvidence:evidence.map(item=>({reference:item.reference,kind:item.kind,head:item.git_head})),
      reviewStatus:handoff?.outcome??(handoff?'awaiting_review':'not_started'),
      reviewCompletionHead:handoff?.completion_head??null,requiredGates:gates,
      note:'This checklist does not assert passing tests or authorization; follow the current action and inspect real Gate results'};
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

  reviewIdea(id:string,review:IdeaIndependentReview,expectedRevision:number,
    mode:'developer'|'independent'='independent'):Row {
    return this.inTransaction(()=>{
      const row=this.ideaRow(id);
      if(row.status!=="assessed")fail("IDEA_NOT_ASSESSED","Assess before substantive review");
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
      const issues=reviewIdeaShape(review,assessment.assessedBy,expected,context.tasks,mode);
      if(assessment.targetTaskId){
        const task=this.db.prepare("SELECT status,plan_id FROM dc_tasks WHERE id=?")
          .get(assessment.targetTaskId);
        const inScopeCurrentTask=assessment.placement==="within_task"&&
          task?.status==="in_progress"&&
          task?.plan_id==="release-work:"+row.release;
        if(task?.status!=="ready"&&!inScopeCurrentTask)
          issues.push("Insertion anchor changed; re-assess placement or use an authorized current task");
        if(review.checks?.some(check=>!check.taskIds?.includes(assessment.targetTaskId!)))
          issues.push("Every review dimension must consider the insertion anchor");
      }
      if(issues.length)fail("IDEA_REVIEW_INVALID",issues.join("; "));
      const reviewHash=createHash("sha256").update(JSON.stringify(review)).digest("hex");
      const revision=row.revision+1;
      this.db.prepare(`UPDATE dc_ideas SET status='reviewed',revision=?,review_json=?,
        review_hash=?,updated_at=? WHERE id=?`)
        .run(revision,JSON.stringify(review),reviewHash,utc(),id);
      this.appendIdeaRevision(id,revision,"reviewed",
        {review,reviewHash,reviewMode:mode,actor:review.reviewer});
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
        fail("IDEA_REVIEW_MISMATCH","Exact substantive review hash required");
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
          {windowsHide: true, cwd:this.root,encoding:"buffer",timeout:12_000});
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
            spawnSync("git",["show",":"+file],{windowsHide: true, cwd:this.root,encoding:"buffer",
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
      return {id:manifest.id,status:"awaiting_review",proposalHash:hash,
        baselineChanged:false};
    });
  }

  independentlyReviewGovernedArtifact(id:string,review:GovernedArtifactReview,
    expectedProposalHash:string,mode:'developer'|'independent'='independent'):Row {
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
        manifest.sourceRefs,mode);
      if(issues.length)fail("ARTIFACT_REVIEW_REQUIRED",issues.join("; "));
      const hash=createHash("sha256").update(JSON.stringify(review)).digest("hex");
      this.db.prepare(`UPDATE dc_governed_artifact_proposals
        SET review_json=?,review_hash=? WHERE id=?`).run(JSON.stringify(review),hash,id);
      this.audit(null,"governed_artifact_reviewed",review.reviewer,
        {id,proposalHash:expectedProposalHash,reviewHash:hash,reviewMode:mode});
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
            {windowsHide: true, cwd:this.root,encoding:"utf8",timeout:5_000});
          if(tracked.status!==0)
            fail("INITIAL_ARTIFACT_UNTRACKED",
              "Initial frozen baseline requires committed/otherwise Git-tracked file "+file.path);
          const dirty=spawnSync("git",["status","--porcelain","--",file.path],
            {windowsHide: true, cwd:this.root,encoding:"utf8",timeout:5_000});
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
  /** The claim-time location never changes. Every later physical location
   * must be linked by an unbroken, Owner-authorized append-only history.
   * Old completion/evidence hashes continue to bind the ORIGINAL locations.
   */
  private repositoryLocations(id:string):Map<string,{
    original:string;current:string;baseHead:string;known:Set<string>;
  }> {
    const originals=this.db.prepare(`SELECT prefix,git_dir,base_head FROM
      dc_task_repository_baselines WHERE task_id=? ORDER BY prefix`).all(id);
    const locations=new Map(originals.map(row=>{
      const original=String(row.git_dir);
      return [String(row.prefix),{original,current:original,
        baseHead:String(row.base_head),known:new Set([original])}] as const;
    }));
    const history=this.db.prepare(`SELECT prefix,from_git_dir,to_git_dir,base_head
      FROM dc_task_repository_baseline_relocations WHERE task_id=? ORDER BY id`).all(id);
    for(const row of history){
      const location=locations.get(String(row.prefix));
      if(!location||location.baseHead!==row.base_head||
        location.current!==row.from_git_dir||
        typeof row.to_git_dir!=='string'||!path.isAbsolute(row.to_git_dir)||
        row.to_git_dir===row.from_git_dir||location.known.has(row.to_git_dir))
        fail('REPOSITORY_RELOCATION_HISTORY_INVALID',
          'Owner relocation history does not match immutable claim-time repository identities');
      const next=String(row.to_git_dir);
      location.known.add(next);
      locations.set(String(row.prefix),{...location,current:next});
    }
    return locations;
  }

  private relocatedRepositories(id:string,revisions:RepositoryRevision[]):RepositoryRevision[]{
    const locations=this.repositoryLocations(id);
    return revisions.map(repo=>{
      const location=locations.get(repo.prefix);
      if(!location||!(location.known.has(repo.gitDir)||
        repo.gitDir===portableGitDir(repo.prefix))||
        repo.baseHead!==location.baseHead)
        fail('REPOSITORY_RELOCATION_MISMATCH',
          'Frozen repository version references an unknown location or original base');
      return {...repo,gitDir:portableGitDir(repo.prefix)};
    });
  }

  private repositoryEvidenceDigest(id:string,revisions:RepositoryRevision[]):string{
    const locations=this.repositoryLocations(id);
    return revisionDigest(revisions.map(repo=>{
      const location=locations.get(repo.prefix);
      if(!location||!(location.known.has(repo.gitDir)||
        repo.gitDir===portableGitDir(repo.prefix))||
        repo.baseHead!==location.baseHead)
        fail('REPOSITORY_RELOCATION_MISMATCH',
          'Evidence cannot be rebound to an unknown repository location or base');
      return {...repo,gitDir:location.original};
    }));
  }

  /** Rebind only the machine-local Git directory location. This does not
   * change frozen task scope, commit baselines, completion snapshots, evidence,
   * review/Gate results or previously Verified tasks. All supplied mappings
   * are checked as one atomic, explicitly recorded Owner decision. The
   * project manager does not require or authenticate any recovery password.
   */
  relocateRepositoryBaselines(input:{
    actor:string;explicitAuthorization?:boolean;
    reason:string;taskIds:string[];
    mappings:Array<{taskId:string;prefix:string;fromGitDir:string;
      toGitDir:string;expectedBaseHead:string}>;
  }):Row {
    const actor=typeof input?.actor==='string'?input.actor.trim():'';
    const reason=typeof input?.reason==='string'?input.reason.trim():'';
    if(actor.length<2||reason.length<30||reason.length>1200)
      fail('RELOCATION_EVIDENCE_REQUIRED',
        'Provide an Owner actor and a concrete workspace relocation reason');
    if(input.explicitAuthorization!==true)
      fail('OWNER_AUTHORIZATION_REQUIRED',
        'Repository baseline relocation requires an explicit Owner decision and audited reason, not a recovery credential');
    const ids=input.taskIds, mappings=input.mappings;
    if(!Array.isArray(ids)||!ids.length||ids.length>10000||
      ids.some(id=>typeof id!=='string'||!id.trim())||
      new Set(ids).size!==ids.length||!Array.isArray(mappings)||
      mappings.length<ids.length||mappings.length>30000)
      fail('RELOCATION_BATCH_INVALID','Provide unique taskIds and complete repository mappings');
    return this.inTransaction(()=>{
      const submitted=new Map<string,typeof mappings>();
      for(const item of mappings){
        if(!item||typeof item.taskId!=='string'||
          typeof item.prefix!=='string'||typeof item.fromGitDir!=='string'||
          typeof item.toGitDir!=='string'||typeof item.expectedBaseHead!=='string'||
          !ids.includes(item.taskId)||!path.isAbsolute(item.fromGitDir)||
          !path.isAbsolute(item.toGitDir)||
          !/^[0-9a-f]{40,64}$/.test(item.expectedBaseHead))
          fail('RELOCATION_MAPPING_INVALID','Every mapping needs exact old/new absolute Git directories and original base SHA');
        const entries=submitted.get(item.taskId)??[];
        if(entries.some(entry=>entry.prefix===item.prefix))
          fail('RELOCATION_MAPPING_DUPLICATE','Duplicate repository prefix in Owner relocation request');
        entries.push(item);
        submitted.set(item.taskId,entries);
      }
      const plans:Array<{taskId:string;prefix:string;fromGitDir:string;
        toGitDir:string;baseHead:string}>=[];
      for(const id of ids){
        const task=this.requireTask(id);
        const baselines=this.db.prepare(`SELECT prefix,git_dir,base_head FROM
          dc_task_repository_baselines WHERE task_id=? ORDER BY prefix`).all(id);
        const expected=submitted.get(id)??[];
        if(!baselines.length||expected.length!==baselines.length)
          fail('RELOCATION_MAPPING_INCOMPLETE',
            'Owner must supply every root/child repository baseline for each selected task');
        const locations=this.repositoryLocations(id);
        const repos=discoverRepositories(this.root,JSON.parse(task.allowed_paths));
        if(repos.length!==baselines.length||repos.some((repo,i)=>repo.prefix!==baselines[i].prefix))
          fail('REPOSITORY_TOPOLOGY_CHANGED','Frozen repository prefixes are missing or have changed');
        if(stagedChanges(repos).length)
          fail('RELOCATION_STAGED_WORKTREE','No Git index may contain staged changes during Owner relocation');
        for(const row of baselines){
          const prefix=String(row.prefix);
          const found=expected.find(item=>item.prefix===prefix);
          const location=locations.get(prefix)!;
          const repo=repos.find(item=>item.prefix===prefix)!;
          if(!found||found.expectedBaseHead!==row.base_head||
            found.fromGitDir!==location.current||found.toGitDir!==repo.absoluteGitDir||
            found.fromGitDir===found.toGitDir||
            location.known.has(found.toGitDir))
            fail('RELOCATION_MAPPING_MISMATCH',
              'Owner mapping is stale, repeated, ambiguous or differs from the verified Git root');
          if(!run(repo.root,'git',['merge-base','--is-ancestor',
            String(row.base_head),git(repo.root,['rev-parse','HEAD'])]).passed)
            fail('RELOCATION_BASE_CHANGED','Original immutable Git commit is not an ancestor of the relocated repository HEAD');
          plans.push({taskId:id,prefix,fromGitDir:found.fromGitDir,
            toGitDir:found.toGitDir,baseHead:found.expectedBaseHead});
        }
        if(task.status==='in_progress'||task.status==='in_review'){
          const childRows=this.db.prepare(`SELECT prefix,git_dir,snapshot_json,digest
            FROM dc_legacy_child_worktree_snapshots WHERE task_id=?`).all(id);
          for(const repo of repos.filter(repo=>repo.prefix)){
            const protectedRow=childRows.find(row=>row.prefix===repo.prefix);
            if(!protectedRow||!locations.get(repo.prefix)?.known.has(String(protectedRow.git_dir))||
              createHash('sha256').update(String(protectedRow.snapshot_json)).digest('hex')!==protectedRow.digest)
              fail('RELOCATION_CHILD_PROTECTION_INVALID',
                'Active task child protection is missing or its original SHA-256 snapshot was altered');
            const scoped=JSON.parse(task.allowed_paths) as string[];
            const current=preservedWorktreeSnapshot(repo.root,scoped,repo.prefix);
            const expectedWip=this.effectiveOwnerSnapshot(id,repo.prefix,
              JSON.parse(String(protectedRow.snapshot_json)));
            if(JSON.stringify(current)!==JSON.stringify(expectedWip))
              fail('PROTECTED_CHILD_WORKTREE_CHANGED',
                'Protected child worktree bytes have changed during workspace relocation');
          }
        }
      }
      // Revalidate the exact original baseline and current relocation path
      // inside this single BEGIN IMMEDIATE transaction before any insert.
      for(const plan of plans){
        const row=this.db.prepare(`SELECT git_dir,base_head FROM
          dc_task_repository_baselines WHERE task_id=? AND prefix=?`)
          .get(plan.taskId,plan.prefix);
        if(!row||row.base_head!==plan.baseHead||
          this.repositoryLocations(plan.taskId).get(plan.prefix)?.current!==plan.fromGitDir)
          fail('RELOCATION_RACE','Repository baseline changed during Owner relocation');
      }
      const batchId=randomUUID(),at=utc();
      for(const plan of plans)this.db.prepare(`INSERT INTO
        dc_task_repository_baseline_relocations
        (batch_id,task_id,prefix,from_git_dir,to_git_dir,base_head,actor,reason,relocated_at)
        VALUES(?,?,?,?,?,?,?,?,?)`).run(batchId,plan.taskId,plan.prefix,
          plan.fromGitDir,plan.toGitDir,plan.baseHead,actor,reason,at);
      for(const id of ids)this.audit(id,'owner_repository_baselines_relocated',actor,{
        batchId,reason,repositoryMappings:plans.filter(p=>p.taskId===id),
        taskStatusUnchanged:true,originalBaseHeadsUnchanged:true,
        completionAndEvidenceUnchanged:true,gatePassed:false,
      });
      return {relocated:true,batchId,taskCount:ids.length,
        repositoryCount:plans.length,taskIds:[...ids],
        originalBaselinesPreserved:true,completionAndEvidencePreserved:true,
        gatesUnchanged:true,warning:'Only approved machine-local Git locations were rebound; no Gate or verification was granted'};
    });
  }

  /** Frozen repo baselines are immutable for the duration of a task.
   * Legacy single-repo tasks keep their existing Git and SQLite semantics.
   */
  private taskRepositories(id:string,task:Row):RepositoryRevision[] {
    const rows=this.db.prepare(`SELECT prefix,git_dir,base_head
      FROM dc_task_repository_baselines WHERE task_id=? ORDER BY prefix`).all(id);
    const paths=JSON.parse(task.allowed_paths) as string[];
    const discovered=discoverRepositories(this.root,paths);
    if(!rows.length){
      if(discovered.length>1)fail("MULTI_REPO_BASE_UNBOUND",
        "Task has independent Git repositories without a frozen claim-time baseline; re-review and reclaim it before verification");
      return [];
    }
    this.repositoryLocations(id); // Validate the entire append-only historical audit.
    const records=rows.map(row=>({
      prefix:String(row.prefix),gitDir:portableGitDir(String(row.prefix)),
      baseHead:String(row.base_head),head:String(row.base_head),
    }));
    try{
      assertRepositoryTopology(this.root,paths,records);
      // A new machine and later normal merges are fine, but the actual
      // repository must still contain the original immutable base commit.
      updateRevisions(this.root,records);
    }
    catch(error){fail("REPOSITORY_TOPOLOGY_CHANGED",String(error));}
    return records;
  }

  private captureTaskRepositories(id:string,task:Row,baseHead:string):RepositoryRevision[] {
    const paths=JSON.parse(task.allowed_paths) as string[];
    const discovered=discoverRepositories(this.root,paths);
    const existing=this.db.prepare(`SELECT prefix FROM dc_task_repository_baselines
      WHERE task_id=? LIMIT 1`).get(id);
    if(existing)return this.taskRepositories(id,task);
    // Do not replace any of the mature single-Git recovery and resumption
    // semantics with a new snapshot. The additional ledger is mandatory only
    // when multiple independent Git histories actually exist.
    if(discovered.length===1)return [];
    // An already active legacy claim cannot retroactively pretend its child
    // repo HEAD at upgrade time was the original approved baseline.
    if(task.status!=='ready'&&discovered.length>1)
      fail("MULTI_REPO_BASE_UNBOUND","Existing active task needs reviewed repository baselines");
    const snapshots=currentRevisions(discovered);
    if(snapshots[0]?.baseHead!==baseHead && snapshots.some(r=>r.prefix===''))
      fail("ROOT_BASE_CHANGED","Root Git HEAD changed while capturing task repositories");
    // Unrelated child repositories may already contain another Agent's
    // unstaged work. Freeze its exact bytes at claim instead of requiring the
    // other Agent to stash/commit/reset. The same immutable child snapshots
    // must be checked again during report, completion and verification.
    const childSnapshots=snapshots.filter(repo=>!!repo.prefix).map(repo=>{
      const files=preservedWorktreeSnapshot(path.join(this.root,repo.prefix),
        paths,repo.prefix);
      if(files.some(file=>paths.some(pattern=>pathAllowed(
        repo.prefix+'/'+file.path,pattern))))
        fail('CHILD_REPOSITORY_DIRTY',
          'Uncommitted frozen task files in a child repository cannot be protected');
      const snapshot=JSON.stringify(files);
      return {prefix:repo.prefix,gitDir:repo.gitDir,snapshot,
        digest:createHash('sha256').update(snapshot).digest('hex')};
    });
    for(const revision of snapshots)
      this.db.prepare(`INSERT INTO dc_task_repository_baselines
        (task_id,prefix,git_dir,base_head,captured_at) VALUES(?,?,?,?,?)`)
        .run(id,revision.prefix,revision.gitDir,revision.baseHead,utc());
    for(const item of childSnapshots)
      this.db.prepare(`INSERT INTO dc_legacy_child_worktree_snapshots
        (task_id,prefix,git_dir,snapshot_json,digest,captured_at)
        VALUES(?,?,?,?,?,?)`).run(id,item.prefix,item.gitDir,
        item.snapshot,item.digest,utc());
    return snapshots;
  }

  private observedTaskRepositories(id:string,task:Row):RepositoryRevision[] {
    const originals=this.taskRepositories(id,task);
    if(!originals.length)return [];
    try{return updateRevisions(this.root,originals);}
    catch(error){fail("REPOSITORY_HISTORY_CHANGED",String(error));}
  }

  private frozenDeliveryRepositories(id:string,task:Row,revision?:number):
    RepositoryRevision[] {
    const note=this.latestCompletion(id);
    const row=this.db.prepare(`SELECT snapshot_json,digest FROM
      dc_completion_repository_revisions WHERE task_id=? AND revision=?`)
      .get(id,revision??note?.revision??-1);
    if(!row)fail('DELIVERY_REPOSITORIES_REQUIRED',
      'Multi-repository task requires exact persisted delivery HEADs');
    const saved=JSON.parse(String(row.snapshot_json)) as RepositoryRevision[];
    if(this.repositoryEvidenceDigest(id,saved)!==row.digest)
      fail('DELIVERY_REPOSITORIES_TAMPERED','Delivery snapshot digest differs');
    const relocated=this.relocatedRepositories(id,saved);
    try{
      assertDeliveryStillPresent(this.root,relocated,
        this.observedTaskRepositories(id,task),JSON.parse(task.allowed_paths));
    }catch(error){fail('DELIVERY_HEAD_CHANGED',String(error));}
    if(note&&revision===undefined&&relocated.find(x=>x.prefix==='')?.head!==note.git_head)
      fail('DELIVERY_HEAD_CHANGED','Root completion and multi-Git delivery SHA differ');
    return relocated;
  }

  /** A nested Git repository is not automatically part of a task delivery.
   * Root-only external Gate deferrals may use the existing immutable root
   * completion when every child repository is demonstrably out of scope,
   * unchanged since claim and still byte-identical to its protected WIP.
   * Actual multi-Git deliveries still require their own deferral protocol.
   */
  private requireRootOnlyDeferral(id:string,task:Row):void {
    const baselines=this.taskRepositories(id,task);
    const children=baselines.filter(repo=>repo.prefix);
    if(!children.length)return;
    const denied=()=>fail('MULTI_REPO_DEFERRAL_UNSUPPORTED',
      'A task delivering or permitting child Git source needs an immutable multi-repository deferral version vector');
    const scope=JSON.parse(task.allowed_paths) as string[];
    if(children.some(repo=>scope.some(pattern=>
      pattern===repo.prefix||pattern.startsWith(repo.prefix+'/')||
      (pattern.endsWith('/**')&&(
        repo.prefix===pattern.slice(0,-3)||
        repo.prefix.startsWith(pattern.slice(0,-3)+'/'))))))denied();
    const observed=this.observedTaskRepositories(id,task);
    this.requireChildReposClean(observed,id,task);
    const frozen=this.frozenDeliveryRepositories(id,task);
    const original=this.latestCompletion(id);
    if(!original||frozen.find(repo=>repo.prefix==='')?.head!==original.git_head||
      children.some(child=>{
        const saved=frozen.find(repo=>repo.prefix===child.prefix);
        const current=observed.find(repo=>repo.prefix===child.prefix);
        return !saved||!current||saved.baseHead!==child.baseHead||
          saved.head!==child.baseHead||current.head!==saved.head;
      }))denied();
    const changed=committedChanges(this.root,frozen);
    if(!changed.length||changed.some(file=>!scope.some(p=>pathAllowed(file,p))))denied();
  }

  private selectDeliveryRepositories(task:Row,observed:RepositoryRevision[],
    requested?:Record<string,string>):RepositoryRevision[]{
    if(requested===undefined)return observed;
    if(!requested||Array.isArray(requested)||typeof requested!=='object'||
      Object.keys(requested).length!==observed.length||
      observed.some(r=>typeof requested[r.prefix]!=='string'||
        !/^[a-f0-9]{40,64}$/.test(requested[r.prefix])))
      fail('DELIVERY_HEADS_REQUIRED',
        'deliveryHeads must specify exact SHA for every Git repository including root prefix ""');
    const frozen=observed.map(r=>({...r,head:requested[r.prefix]}));
    try{assertDeliveryStillPresent(this.root,frozen,observed,
      JSON.parse(task.allowed_paths));}
    catch(error){fail('DELIVERY_HEAD_CHANGED',String(error));}
    return frozen;
  }

  private deliveryTaskFiles(files:string[],base:string,head:string):string[]{
    if(!files.some(isManagedGuidancePath))return files;
    const trusted=trustedCommittedGuidance(this.root,base,head);
    const exempt=new Set(trusted);
    if(files.some(file=>isManagedGuidancePath(file)&&!exempt.has(file)))
      fail('MANAGED_GUIDANCE_INTEGRITY','Guidance was modified outside the canonical generator');
    return files.filter(file=>!exempt.has(file));
  }

  private effectiveOwnerSnapshot(id:string,prefix:string,
    original:ReturnType<typeof preservedWorktreeSnapshot>):
    ReturnType<typeof preservedWorktreeSnapshot> {
    const refreshed=this.db.prepare(`SELECT next_snapshot_json,next_digest FROM
      dc_protected_worktree_refreshes WHERE task_id=? AND prefix=?
      ORDER BY id DESC LIMIT 1`).get(id,prefix);
    if(!refreshed)return original;
    const value=String(refreshed.next_snapshot_json);
    if(createHash('sha256').update(value).digest('hex')!==refreshed.next_digest)
      fail('PROTECTED_SNAPSHOT_CORRUPT',
        'Owner-authorized protected snapshot digest no longer matches');
    return parseProtectedWorktreeSnapshot(value,
      'dc_protected_worktree_refreshes.next_snapshot_json');
  }

  /** Detailed, bounded conflict report. Paths come only from Git's checked
   * project-local snapshot and never expose file contents or secrets.
   */
  private worktreeConflictDetails(task:Row,
    expected:ReturnType<typeof preservedWorktreeSnapshot>,
    current:ReturnType<typeof preservedWorktreeSnapshot>):Row{
    const scope=JSON.parse(task.allowed_paths) as string[];
    const oldByPath=new Map(expected.map(x=>[x.path,x]));
    const nowByPath=new Map(current.map(x=>[x.path,x]));
    const conflicts=[...new Set([...oldByPath.keys(),...nowByPath.keys()])]
      .sort().filter(file=>JSON.stringify(oldByPath.get(file))!==
        JSON.stringify(nowByPath.get(file)))
      .map(file=>{
        const before=oldByPath.get(file)??null,after=nowByPath.get(file)??null;
        return {path:file,type:!before?'added':!after?'removed':
          before.kind!==after.kind?'kind_changed':'content_changed',
          inFrozenScope:scope.some(pattern=>pathAllowed(file,pattern)),
          expected:before,observed:after,
          safeAction:'Review this specific file against an approved other-task scope, or restore the prior protected bytes without deleting someone else\'s work'};
      });
    return {taskId:task.id,conflicts,
      originalProtectedFileCount:expected.length,
      currentProtectedFileCount:current.length,
      safeActions:['review-recovery-worktree for files attributable to a separate approved disjoint task',
        'Keep unresolved files untouched and report the exact conflicts to the responsible Agent',
        'Never reset, stash or rebaseline the original frozen task scope']};
  }

  /** Audited recognition of other Agents' WIP only when every changed file
   * belongs to a different approved task's disjoint frozen scope. This does
   * not edit a byte, move a Git index, modify original claim evidence or
   * infer attribution from an arbitrary Owner assertion alone.
   */
  reviewRecoveryWorktree(id:string,input:{actor:string;reason:string;
    explicitAuthorization?:boolean;sourceTaskId:string;
    reviewedPaths:string[]}):Row{
    const actor=String(input?.actor??'').trim();
    const reason=String(input?.reason??'').trim();
    if(actor.length<2||reason.length<50||reason.length>2000||
      input?.explicitAuthorization!==true||
      !Array.isArray(input?.reviewedPaths)||!input.reviewedPaths.length||
      input.reviewedPaths.length>256)
      fail('RECOVERY_WORKTREE_REVIEW_REQUIRED',
        'Provide explicit Owner approval, actor, detailed reason, source task ID and all exact conflict paths');
    const target=this.requireTask(id);
    const source=this.requireTask(String(input.sourceTaskId??''));
    if(target.status!=='in_progress'||source.id===id||
      !['ready','in_progress','in_review','verified'].includes(source.status)||
      !source.approved_by)
      fail('RECOVERY_SOURCE_TASK_INVALID',
        'Recognize only a different approved task, without changing the unfinished original');
    const lease=this.db.prepare('SELECT * FROM dc_task_leases WHERE task_id=?').get(id)??
      this.db.prepare('SELECT * FROM dc_leases WHERE task_id=?').get(id);
    if(!lease||lease.expires_at>Date.now())
      fail('RECOVERY_LEASE_ACTIVE',
        'A protected-writer review requires the original development lease to be expired');
    const own=JSON.parse(target.allowed_paths) as string[];
    const external=JSON.parse(source.allowed_paths) as string[];
    if(taskScopesOverlap(own,external))
      fail('RECOVERY_SCOPE_OVERLAP',
        'Source task overlaps original scope; no cross-Agent provenance shortcut is safe');
    const originalRow=this.db.prepare(`SELECT snapshot_json FROM
      dc_task_worktree_baselines WHERE task_id=?`).get(id);
    const migration=this.db.prepare(`SELECT protected_worktree_json
      FROM dc_legacy_active_migrations WHERE task_id=?`).get(id);
    if(!originalRow&&!migration)
      fail('RECOVERY_BASELINE_MISSING','No original task claim worktree baseline to protect');
    const original=parseProtectedWorktreeSnapshot(
      migration?.protected_worktree_json??originalRow!.snapshot_json,
      'dc_task_worktree_baselines.snapshot_json');
    const base=this.effectiveOwnerSnapshot(id,'',original);
    const prior=this.db.prepare(`SELECT original_digest,reviewed_snapshot_json,
      reviewed_digest FROM dc_recovery_worktree_reviews
      WHERE task_id=? ORDER BY id DESC LIMIT 1`).get(id);
    const previous=prior?
      JSON.parse(String(prior.reviewed_snapshot_json)) as
        ReturnType<typeof preservedWorktreeSnapshot>:base;
    if(prior&&createHash('sha256').update(JSON.stringify(previous)).digest('hex')!==
      prior.reviewed_digest)
      fail('RECOVERY_REVIEW_CORRUPT','Previous authorized worktree record was modified');
    const expected=worktreeSnapshotWithLocalExemptions(this.root,previous,own);
    const current=preservedWorktreeSnapshot(this.root,own).filter(file=>
      !own.some(pattern=>pathAllowed(file.path,pattern)));
    const details=this.worktreeConflictDetails(target,expected,current);
    const changes=details.conflicts as Array<{path:string;type:string;
      inFrozenScope:boolean}>;
    const reviewed=[...new Set(input.reviewedPaths)];
    if(!changes.length||reviewed.length!==changes.length||
      changes.some(change=>!reviewed.includes(change.path)||change.inFrozenScope||
        !external.some(pattern=>pathAllowed(change.path,pattern)))||
      reviewed.some(file=>!changes.some(change=>change.path===file)))
      fail('RECOVERY_ATTRIBUTION_REJECTED',
        'Every changed file must be named and fall only inside the other approved task scope',details);
    if(stagedChanges(discoverRepositories(this.root,own)).length)
      fail('RECOVERY_STAGED_INDEX','A staged Git index cannot be reconciled as other Agent WIP');
    const beforeDigest=createHash('sha256').update(JSON.stringify(expected)).digest('hex');
    const afterJson=JSON.stringify(current);
    const afterDigest=createHash('sha256').update(afterJson).digest('hex');
    const head=git(this.root,['rev-parse','HEAD']);
    return this.inTransaction(()=>{
      const race=this.db.prepare(`SELECT agent,token,expires_at FROM dc_task_leases
        WHERE task_id=?`).get(id);
      if(race&&race.expires_at>Date.now())
        fail('RECOVERY_RACE','Original task was recovered during external worktree review');
      if(JSON.stringify(preservedWorktreeSnapshot(this.root,own).filter(file=>
        !own.some(pattern=>pathAllowed(file.path,pattern))))!==afterJson||
        git(this.root,['rev-parse','HEAD'])!==head)
        fail('RECOVERY_RACE','Git or unrelated worktree changed during evidence review');
      this.db.prepare(`INSERT INTO dc_recovery_worktree_reviews
        (task_id,source_task_id,original_digest,reviewed_snapshot_json,
        reviewed_digest,reviewed_head,actor,reason,created_at)
        VALUES(?,?,?,?,?,?,?,?,?)`).run(id,source.id,beforeDigest,
        afterJson,afterDigest,head,actor,reason,utc());
      this.audit(id,'recovery_external_wip_reviewed',actor,{
        sourceTaskId:source.id,sourceScope:external,originalDigest:beforeDigest,
        reviewedDigest:afterDigest,head,changes:details.conflicts,reason,
        originalClaimUnmodified:true,testsPassed:false,gateApproved:false,
      });
      return {taskId:id,sourceTaskId:source.id,reviewedPaths:reviewed,
        reviewedDigest:afterDigest,filesModifiedByMcp:false,
        testsPassed:false,gateApproved:false,nextAction:'recover-task'};
    });
  }

  /** Never silently rebaseline an Owner file. Only a known tracked file
   * returned to its exact HEAD bytes can be removed from protection. Every
   * other protected path must remain byte-identical to the prior snapshot.
   */
  refreshProtectedWorktree(id:string,input:{actor:string;
    explicitAuthorization?:boolean;reason:string}):Row {
    const actor=String(input?.actor??'').trim(),reason=String(input?.reason??'').trim();
    if(actor.length<2||reason.length<30)
      fail('REFRESH_EVIDENCE_REQUIRED',
        'Provide the responsible Owner actor and concrete reconciliation reason');
    if(input.explicitAuthorization!==true)
      fail('OWNER_AUTHORIZATION_REQUIRED',
        'Protected file reconciliation requires an explicit Owner decision, actor and reason; no key is needed');
    const task=this.requireTask(id);
    if(!['in_progress','in_review'].includes(task.status)||this.latestCompletion(id))
      fail('REFRESH_STATE_REQUIRED',
        'Only unfinished tasks without a committed completion report may refresh protected WIP');
    const lease=this.db.prepare('SELECT * FROM dc_task_leases WHERE task_id=?').get(id);
    if(!lease)fail('LEASE_REQUIRED','Refresh requires the original task lease');
    const allowed=JSON.parse(task.allowed_paths) as string[];
    const frozen=this.taskRepositories(id,task);
    const repos=discoverRepositories(this.root,allowed);
    const revisions=frozen.length?this.observedTaskRepositories(id,task):
      currentRevisions(repos);
    if(repos.length!==revisions.length||repos.some((repo,i)=>
      repo.prefix!==revisions[i].prefix||repo.gitDir!==revisions[i].gitDir))
      fail('REPOSITORY_TOPOLOGY_CHANGED','The frozen Git repository layout has changed');
    if(!run(this.root,'git',['merge-base','--is-ancestor',String(lease.base_head),
      git(this.root,['rev-parse','HEAD'])]).passed)
      fail('GIT_HISTORY_CHANGED','The original task root Git baseline was rewritten');
    const migration=this.db.prepare(`SELECT protected_worktree_json FROM
      dc_legacy_active_migrations WHERE task_id=?`).get(id);
    const rootBase=this.db.prepare(`SELECT snapshot_json FROM
      dc_task_worktree_baselines WHERE task_id=?`).get(id);
    const childRows=this.db.prepare(`SELECT prefix,git_dir,snapshot_json,digest FROM
      dc_legacy_child_worktree_snapshots WHERE task_id=?`).all(id);
    const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
    const plans:Array<{prefix:string;gitDir:string;head:string;previous:string;
      next:string;removed:string[]}>= [];
    for(const repo of repos){
      const revision=revisions.find(r=>r.prefix===repo.prefix)!;
      const child=childRows.find(row=>row.prefix===repo.prefix);
      if(repo.prefix&&child&&
        !this.repositoryLocations(id).get(repo.prefix)?.known.has(String(child.git_dir)))
        fail('CHILD_REPOSITORY_IDENTITY_CHANGED','Protected child repository was replaced');
      if(repo.prefix&&child&&sha(String(child.snapshot_json))!==child.digest)
        fail('PROTECTED_SNAPSHOT_CORRUPT','Stored original child protection was changed');
      const originalJson=repo.prefix?child?.snapshot_json:
        (migration?.protected_worktree_json??rootBase?.snapshot_json);
      const original=(originalJson?JSON.parse(String(originalJson)):[]) as ReturnType<typeof preservedWorktreeSnapshot>;
      const expected=this.effectiveOwnerSnapshot(id,repo.prefix,original);
      const current=preservedWorktreeSnapshot(repo.root,allowed,repo.prefix).filter(file=>
        !allowed.some(pattern=>pathAllowed(
          repo.prefix?repo.prefix+'/'+file.path:file.path,pattern)));
      const byPath=new Map(current.map(file=>[file.path,file]));
      const expectedPaths=new Set(expected.map(file=>file.path));
      if(current.some(file=>!expectedPaths.has(file.path)))
        fail('UNAPPROVED_WORKTREE_ADDED',
          'New out-of-scope WIP cannot be authorized by restoring another protected file');
      const committed=committedFilesBetween(repo.root,revision.baseHead,revision.head);
      const removed:string[]=[];
      for(const item of expected){
        const now=byPath.get(item.path);
        if(now){
          if(now.kind!==item.kind||now.size!==item.size||now.sha256!==item.sha256)
            fail('PROTECTED_WORKTREE_CHANGED',
              'Existing protected WIP changed bytes or type; cannot refresh');
          continue;
        }
        if(item.kind!=='tracked'||committed.includes(item.path))
          fail('PROTECTED_WORKTREE_CHANGED',
            'Only tracked files restored to an unchanged Git HEAD may leave protection');
        const location=path.resolve(repo.root,item.path);
        const realRoot=fs.realpathSync(repo.root);
        if(!location.startsWith(realRoot+path.sep)||!fs.existsSync(location))
          fail('UNSAFE_WORKTREE_ENTRY','Protected tracked file is missing or outside Git root');
        for(let cursor=path.dirname(location);cursor!==realRoot;
          cursor=path.dirname(cursor)){
          if(!cursor.startsWith(realRoot+path.sep)||fs.lstatSync(cursor).isSymbolicLink())
            fail('UNSAFE_WORKTREE_ENTRY','Symlinked parent of protected file');
        }
        if(!fs.lstatSync(location).isFile()||
          !fs.realpathSync(location).startsWith(realRoot+path.sep))
          fail('UNSAFE_WORKTREE_ENTRY','Restored protected file must be a regular in-root file');
        const blob=spawnSync('git',['show','HEAD:'+item.path],{
          cwd:repo.root,encoding:'buffer',timeout:12_000,maxBuffer:67*1024*1024,
          windowsHide:true,
        });
        if(blob.status!==0||!Buffer.isBuffer(blob.stdout)||
          !blob.stdout.equals(fs.readFileSync(location)))
          fail('NOT_RESTORED_TO_HEAD',
            'Protected tracked file must match exact Git HEAD bytes before refresh');
        removed.push(item.path);
      }
      if(removed.length)
        plans.push({prefix:repo.prefix,gitDir:repo.gitDir,head:revision.head,
          previous:sha(JSON.stringify(expected)),
          next:JSON.stringify(current),removed});
    }
    if(!plans.length)fail('NO_RESTORED_PROTECTED_FILES',
      'No previously protected tracked files were restored to Git HEAD');
    return this.inTransaction(()=>{
      const active=this.db.prepare('SELECT token FROM dc_task_leases WHERE task_id=?').get(id);
      if(active?.token!==lease.token||
        !['in_progress','in_review'].includes(this.requireTask(id).status)||
        this.latestCompletion(id))
        fail('REFRESH_STATE_CHANGED','Task lease or status changed during Owner review');
      const currentRepos=frozen.length?this.observedTaskRepositories(id,task):
        currentRevisions(discoverRepositories(this.root,allowed));
      if(JSON.stringify(currentRepos)!==JSON.stringify(revisions))
        fail('REFRESH_STATE_CHANGED','Git revisions or repository identities changed during review');
      for(const plan of plans){
        const currentOriginal=plan.prefix?
          childRows.find(row=>row.prefix===plan.prefix)?.snapshot_json:
          (migration?.protected_worktree_json??rootBase?.snapshot_json);
        const before=this.effectiveOwnerSnapshot(id,plan.prefix,currentOriginal?
          JSON.parse(String(currentOriginal)) as ReturnType<typeof preservedWorktreeSnapshot>:[]);
        if(sha(JSON.stringify(before))!==plan.previous)
          fail('REFRESH_STATE_CHANGED','Another Owner refreshed the snapshot first');
        const files=preservedWorktreeSnapshot(
          plan.prefix?path.join(this.root,plan.prefix):this.root,allowed,plan.prefix);
        const actual=files.filter(file=>!allowed.some(pattern=>pathAllowed(
          plan.prefix?plan.prefix+'/'+file.path:file.path,pattern)));
        if(JSON.stringify(actual)!==plan.next)
          fail('REFRESH_STATE_CHANGED','Protected files changed during Owner review');
        for(const removed of plan.removed){
          const file=path.join(this.root,plan.prefix,removed);
          const blob=spawnSync('git',['show','HEAD:'+removed],{
            cwd:plan.prefix?path.join(this.root,plan.prefix):this.root,
            encoding:'buffer',timeout:12_000,maxBuffer:67*1024*1024,windowsHide:true});
          if(blob.status!==0||!Buffer.isBuffer(blob.stdout)||
            !fs.lstatSync(file).isFile()||!blob.stdout.equals(fs.readFileSync(file)))
            fail('REFRESH_STATE_CHANGED','Restored HEAD bytes changed before snapshot write');
        }
        const digest=sha(plan.next);
        this.db.prepare(`INSERT INTO dc_protected_worktree_refreshes
          (task_id,prefix,git_dir,repo_head,previous_digest,next_snapshot_json,
            next_digest,removed_paths_json,actor,reason,created_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(id,plan.prefix,plan.gitDir,
          plan.head,plan.previous,plan.next,digest,
          JSON.stringify(plan.removed),actor,reason,utc());
        this.audit(id,'owner_protected_worktree_refreshed',actor,{
          reason,prefix:plan.prefix,gitDir:plan.gitDir,gitHead:plan.head,
          previousDigest:plan.previous,nextDigest:digest,removedPaths:plan.removed,
          noGitOrTaskStateChanges:true,noTestsOrGatesApproved:true});
      }
      return {taskId:id,status:task.status,
        refreshed:plans.map(plan=>({prefix:plan.prefix,gitHead:plan.head,
          removedPaths:plan.removed,previousDigest:plan.previous,
          nextDigest:sha(plan.next)})),
        warning:'Only tracked files restored to the exact Git HEAD were removed from protection; no Git files, Gate results, or task status were modified'};
    });
  }

  /** A claim or legacy Owner migration may preserve exact out-of-scope child
   * WIP. No staged, changed or newly untracked file is exempt after claim;
   * a clean child is also snapshotted so later dirty work cannot slip through.
   */
  private requireChildReposClean(revisions:RepositoryRevision[],
    id?:string,task?:Row):void {
    const scope=id&&task?JSON.parse(task.allowed_paths) as string[]:[];
    const protectedRows=id?this.db.prepare(`SELECT prefix,git_dir,snapshot_json,digest
      FROM dc_legacy_child_worktree_snapshots WHERE task_id=?`).all(id):[];
    const childRepos=revisions.filter(repo=>!!repo.prefix);
    if(protectedRows.length&&protectedRows.length!==childRepos.length)
      fail('CHILD_WORKTREE_PROTECTION_INCOMPLETE',
        'Missing a protected child snapshot; cannot accept unreviewed worktree changes');
    for(const revision of revisions.filter(r=>!!r.prefix)){
      const protectedRow=protectedRows.find(row=>row.prefix===revision.prefix);
      if(protectedRows.length&&!protectedRow)
        fail('CHILD_WORKTREE_PROTECTION_INCOMPLETE',
          'Child repository protection record does not match frozen repository identity');
      if(protectedRow&&
        !this.repositoryLocations(id!).get(revision.prefix)?.known.has(String(protectedRow.git_dir)))
        fail('CHILD_REPOSITORY_IDENTITY_CHANGED','Protected child Git metadata changed');
      const dirty=preservedWorktreeSnapshot(path.join(this.root,revision.prefix),
        scope,revision.prefix);
      const allowedDirty=dirty.filter(file=>
        scope.some(pattern=>pathAllowed(revision.prefix+'/'+file.path,pattern)));
      if(allowedDirty.length)fail('CHILD_REPOSITORY_DIRTY',
        'Uncommitted task-scope child files must be committed before completion or verification');
      const unrelated=dirty.filter(file=>!scope.some(pattern=>
        pathAllowed(revision.prefix+'/'+file.path,pattern)));
      if(!protectedRow){
        if(dirty.length)fail('CHILD_REPOSITORY_DIRTY',
          `Commit or reconcile all changes in child repository ${revision.prefix} before task completion or verification`);
        continue;
      }
      const initial=JSON.parse(String(protectedRow.snapshot_json)) as ReturnType<typeof preservedWorktreeSnapshot>;
      const recorded=this.effectiveOwnerSnapshot(id!,revision.prefix,initial);
      const digest=createHash('sha256').update(JSON.stringify(initial)).digest('hex');
      if(digest!==protectedRow.digest||
        recorded.some(file=>scope.some(pattern=>
          pathAllowed(revision.prefix+'/'+file.path,pattern)))||
        JSON.stringify(unrelated)!==JSON.stringify(recorded))
        fail('PROTECTED_CHILD_WORKTREE_CHANGED',
          'Out-of-scope child files differ from the Owner-authorized read-only snapshot');
    }
  }

  checkStaged(): Row {
    if(!this.hasRootGit){
      const active=this.checkoutWriter();
      if(!active||active.expires_at<=Date.now())
        return {passed:false,reason:'No active approved file-backed task',
          evidenceKind:'files-sha256-v1',gitIndex:'not_applicable'};
      const task=this.requireTask(String(active.task_id));
      const delivery=this.fileDelivery(task.id);
      if(!delivery)return {passed:false,taskId:task.id,
        reason:'Missing claim-time file baseline',evidenceKind:'files-sha256-v1'};
      const current=captureFileEvidence(this.root);
      const changes=this.fileTaskChanges(delivery.baseline,current);
      const allowed=JSON.parse(task.allowed_paths) as string[];
      const contract=this.executionContract(task.id);
      const exact=contract.profile==='spec-depth-v3'?
        (contract.spec as ReleasePlanNode)?.allowedChangedFiles:undefined;
      const denied=changes.changed.filter(file=>
        !allowed.some(pattern=>pathAllowed(file,pattern))||
        (exact&&!exact.includes(file)));
      const unapprovedDocs=undocumentedMarkdown(changes.added,allowed);
      return {passed:changes.changed.length>0&&!denied.length&&!unapprovedDocs.length,
        taskId:task.id,evidenceKind:'files-sha256-v1',gitIndex:'not_applicable',
        changedFiles:changes.changed,deniedFiles:denied,
        unapprovedDocs,sourceDigest:current.digest,
        ...(changes.changed.length?{}:{reason:'No source changes since claim'})};
    }
    const active=this.checkoutWriter();
    const task=active?this.requireTask(active.task_id):null;
    if(task)this.taskRepositories(task.id,task);
    const roots=task?discoverRepositories(this.root,JSON.parse(task.allowed_paths)):discoverRepositories(this.root,[]);
    const allStaged=stagedChanges(roots);
    const frozenScope=task?JSON.parse(task.allowed_paths) as string[]:[];
    // The local exception is a DevControl rule, not Git's untracked-only
    // .gitignore. Explicitly exempted tracked/staged local files are not
    // frozen task delivery. Never exempt MCP guidance or frozen task paths.
    const exemptedStagedFiles=roots.flatMap(repo=>{
      const local=allStaged.filter(file=>repo.prefix?
        file.startsWith(repo.prefix+'/'):!roots.some(child=>child.prefix&&
          file.startsWith(child.prefix+'/')));
      const relative=local.map(file=>repo.prefix?
        file.slice(repo.prefix.length+1):file);
      return localWorktreeExemptedFiles(repo.root,relative,file=>{
        const full=repo.prefix?repo.prefix+'/'+file:file;
        return frozenScope.some(pattern=>pathAllowed(full,pattern));
      }).map(file=>repo.prefix?repo.prefix+'/'+file:file);
    });
    const exemptedSet=new Set(exemptedStagedFiles);
    const files=allStaged.filter(file=>!exemptedSet.has(file));
    if(exemptedStagedFiles.length)
      this.auditLocalExemptions(task?.id??null,
        active?.agent??'devcontrol','check-staged',
        roots.map(repo=>({repoRoot:repo.root,prefix:repo.prefix,
          files:exemptedStagedFiles.filter(file=>repo.prefix?
            file.startsWith(repo.prefix+'/'):!roots.some(child=>
              !!child.prefix&&file.startsWith(child.prefix+'/')))
            .map(file=>repo.prefix?file.slice(repo.prefix.length+1):file)})));
    const managed=files.filter(isManagedGuidancePath);
    const scopedFiles=files.filter(file=>!isManagedGuidancePath(file));
    const guidance=managed.length?checkManagedGuidanceCommit(this.root,managed):null;
    if(guidance&&!guidance.passed){
      if(!active||active.expires_at<=Date.now())
        fail('LEASE_REQUIRED','No active approved task lease; managed guidance validation: '+
          guidance.issues.join('; '));
      return {passed:false,reason:'Generated Skill/AGENTS content differs from the canonical MCP generator',
        stagedFiles:files,managedIssues:guidance.issues};
    }
    const artifactGate=this.checkGovernedArtifacts(files,true);
    if(!artifactGate.passed)
      return {passed:false,reason:"Frozen governed artifact changed without reviewed approval",
        ...artifactGate,stagedFiles:files};
    // No implicit approval for arbitrary edits to AGENTS.md or the Skill.
    // This exception requires only canonical generator output and no other files.
    if(managed.length&&!scopedFiles.length&&guidance?.passed)
      return {passed:true,taskId:null,scope:"managed-guidance-sync",
        stagedFiles:files,deniedFiles:[],unapprovedDocs:[],managedFiles:guidance.managedFiles};
    if(!files.length&&exemptedStagedFiles.length)
      return {passed:true,taskId:null,scope:"local-worktree-exemption",
        stagedFiles:[],exemptedStagedFiles,deniedFiles:[],unapprovedDocs:[],
        note:"Only locally exempt working files are staged; no task delivery or tests are approved."};
    const lease = active;
    if (!lease || lease.expires_at <= Date.now()) {
      fail("LEASE_REQUIRED", "No active approved task lease; refusing Git commit"+
        (guidance?.issues.length?"; managed guidance validation: "+guidance.issues.join("; "):""));
    }
    const claimedTask = this.requireTask(lease.task_id);
    if((claimedTask.required_gates as string).includes('"sqlite_decision"'))
      return {passed:false,taskId:claimedTask.id,reason:
        "SQLite-only decisions do not create Git commits; use decision-save, complete, report and verify"};
    if (claimedTask.status !== "in_progress" && claimedTask.status !== "in_review") {
      fail("TASK_NOT_ACTIVE", "Only active work may be committed");
    }
    if (this.blockers(claimedTask.id).length) fail("TASK_BLOCKED", "A prerequisite is no longer verified");
    const patterns = JSON.parse(claimedTask.allowed_paths) as string[];
    const contract=this.executionContract(claimedTask.id);
    const spec=contract.profile==="spec-depth-v3"?
      contract.spec as ReleasePlanNode:null;
    const exact=spec?.allowedChangedFiles;
    const denied = scopedFiles.filter((file) =>
      !patterns.some((pattern) => pathAllowed(file, pattern)) ||
      (exact && !exact.includes(file)));
    const newFiles=[...new Set(roots.flatMap(repo=> {
      const created=spawnSync("git",
        ["diff","--cached","--no-renames","--name-only","-z","--diff-filter=A"],
        {windowsHide:true,cwd:repo.root,encoding:"buffer",timeout:12_000});
      if(created.status!==0||!Buffer.isBuffer(created.stdout))
        fail("GIT_ERROR","Cannot inspect newly staged files in "+repo.prefix);
      return created.stdout.toString("utf8").split("\0").filter(Boolean).map(name=>
        repo.prefix?repo.prefix+"/"+name:name);
    }))].sort();
    const unapprovedDocs = undocumentedMarkdown(newFiles.filter(file=>
      !isManagedGuidancePath(file)), patterns);
    return {
      passed: files.length>0 && denied.length === 0 && unapprovedDocs.length === 0,
      taskId: claimedTask.id, stagedFiles: files, deniedFiles: denied,
      exemptedStagedFiles,
      managedFiles:managed,
      unapprovedDocs,exactFileScope:exact??null,
      ...(files.length?{}:{reason:"No staged task changes"}),
    };
  }

  private task(row: Row): Row {
    const detail = this.db.prepare("SELECT * FROM dc_task_specs WHERE task_id=?").get(row.id);
    const assignment=this.db.prepare(
      "SELECT owner,assigned_by,decision_ref,assigned_at,device,identity_source FROM dc_task_assignments WHERE task_id=?",
    ).get(row.id);
    const deferred=this.db.prepare(
      "SELECT gate_name,reason,completion_head,deferred_by,deferred_at "+
      "FROM dc_verification_deferrals WHERE task_id=? AND resumed_at IS NULL",
    ).get(row.id);
    return {
      id: row.id, title: row.title, parentId: row.parent_id ?? null,
      track: row.track, release: row.release, priority: row.priority, status: row.status,
      pendingVerification: deferred ? {
        gate:deferred.gate_name,reason:deferred.reason,
        completionHead:deferred.completion_head,
        deferredBy:deferred.deferred_by,deferredAt:deferred.deferred_at,
      } : null,
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
      status:row.reviewed_json?"reviewed":"awaiting_review",
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
        "SELECT * FROM dc_task_leases WHERE task_id=? AND expires_at>?",
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
      return {release:input.release,status:"awaiting_review",
        proposalHash:review.subjectHash,review,executableScopeChanged:false,
        requiredAgentAction:makeReviewAgentAction({kind:"scope_amendment",
          release:input.release,proposalHash:review.subjectHash,reviewHash:null,
          affectedTaskIds:review.affectedTaskIds})};
    });
  }

  reviewStagedReleaseWorkScopeAmendment(release:string,
    review:ReleaseWorkAmendmentReview,expectedProposalHash:string,
    mode:'developer'|'independent'='independent'):Row {
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
        proposal.changes.map(c=>c.taskId),mode);
      if(!review?.sourceRefs?.some(ref=>proposal.sourceRefs.includes(ref)))
        issues.push("Reviewer must cite a source from the staged amendment");
      if(issues.length)fail("SUBSTANTIVE_REVIEW_REQUIRED",issues.join("; "));
      const reviewHash=createHash("sha256").update(JSON.stringify(review)).digest("hex");
      this.db.prepare(`UPDATE dc_release_work_amendments SET reviewed_json=?,review_hash=?,
        reviewed_at=? WHERE release=?`).run(JSON.stringify(review),reviewHash,utc(),release);
      this.audit(null,"release_scope_amendment_reviewed",review.reviewer,{release,
        proposalHash:row.proposal_hash,reviewHash,reviewMode:mode,
        taskIds:proposal.changes.map(c=>c.taskId)});
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
        fail("AMENDMENT_REVIEW_REQUIRED","Exact staged proposal and substantive review hashes required");
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
      status:row.reviewed_json?"reviewed":"awaiting_review",
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
      if(!validGateRequirements(item.requiredGates))
        issues.push(item.id+": project-specific test/evidence requirements required");
      if(item.requiredGates?.includes("sqlite_decision")&&
        (item.type!=="decision"||item.requiredGates.length!==1||item.allowedPaths.length))
        issues.push(item.id+": cannot mix SQLite-only decision with code gates");
      if(item.estimatedHours!==undefined&&
        (!Number.isFinite(item.estimatedHours)||item.estimatedHours<=0||item.estimatedHours>8))
        issues.push(item.id+": split work greater than eight hours");
      if(approved.plan.qualityProfile==="task-detail-v1"||
          approved.plan.qualityProfile==="task-detail-v2")
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
      return {release:input.release,status:"awaiting_review",
        proposalHash:review.subjectHash,review,executableTasksChanged:false,
        requiredAgentAction:makeReviewAgentAction({kind:"incremental_work",
          release:input.release,proposalHash:review.subjectHash,reviewHash:null,
          affectedTaskIds:review.affectedTaskIds})};
    });
  }

  reviewStagedReleaseWorkIncremental(release:string,review:ReleaseWorkIncrementalReview,
    expectedProposalHash:string,mode:'developer'|'independent'='independent'):Row {
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
        checked.affectedTaskIds,input.sourceRefs,mode);
      if(issues.length)fail("SUBSTANTIVE_REVIEW_REQUIRED",issues.join("; "));
      const reviewHash=createHash("sha256").update(JSON.stringify(review)).digest("hex");
      this.db.prepare(`UPDATE dc_release_work_incrementals SET reviewed_json=?,review_hash=?,
        reviewed_at=? WHERE release=?`).run(JSON.stringify(review),reviewHash,utc(),release);
      this.audit(null,"release_incremental_reviewed",review.reviewer,{release,
        proposalHash:row.proposal_hash,reviewHash,reviewMode:mode});
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
        fail("INCREMENTAL_REVIEW_REQUIRED","Exact reviewed amendment hashes required");
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
      if(this.hasRootGit&&
        (!run(this.root,"git",["ls-files","--error-unmatch","--",scope],12_000).passed ||
         !run(this.root,"git",["diff","--quiet","HEAD","--",scope],12_000).passed))
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
    if(input.qualityProfile==="task-detail-v1"||input.qualityProfile==="task-detail-v2")
      issues.push(...reviewDetailedWorkItems(workItems),...reviewTaskQualityJudgments(input));
    if(input.qualityProfile==="task-detail-v2")
      for(const item of workItems){
        issues.push(...reviewSharedTaskPlanningFields(item));
        issues.push(...reviewAtomicOutcome({
        id:item.id,title:item.title,acceptance:item.acceptance,
        estimatedHours:item.estimatedHours,maxHours:2,preferredHours:1,
        granularityJustification:item.granularityJustification,requireEstimate:true,
        }));
      }
    if(input.qualityProfile!==undefined&&
        input.qualityProfile!=="task-detail-v1"&&input.qualityProfile!=="task-detail-v2")
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
        const candidate=fs.realpathSync(path.resolve(this.root,source));
        const relative=path.relative(fs.realpathSync(this.root),candidate);
        if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||
            path.isAbsolute(relative))throw Error('Requirements source escapes workspace');
        if(this.hasRootGit&&
          (!run(this.root,'git',['ls-files','--error-unmatch','--',source],12_000).passed||
           !run(this.root,'git',['diff','--quiet','HEAD','--',source],12_000).passed))
          throw Error('Git PRD source must be committed and clean');
        const body=fs.readFileSync(candidate,"utf8");
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
      if(!row){
        const frozen=this.db.prepare("SELECT revision,hash FROM dc_release_work_plans WHERE release=?").get(release);
        if(frozen?.hash===expectedHash)return {release,status:'frozen',hash:frozen.hash,
          revision:frozen.revision,alreadyApplied:true,
          note:'Exact approved version is already frozen; no duplicate tasks imported'};
      }
      if(!row||row.hash!==expectedHash)fail("PLAN_REVIEW_MISMATCH",
        "Version proposal changed; query release-work-plan before retrying");
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
      const developerInfo=this.localDeveloper() as {name:string;device:string;source:string};
      const added:string[]=[];
      for(const item of plan.workItems) {
        this.insertApprovedPlanTask({id:item.id,title:item.title,release,track:"product",
          dependsOn:[],allowedPaths:item.allowedPaths,requiredGates:item.requiredGates,
          priority:item.priority,planId:"release-work:"+release,
          specId:item.featureName?"feature:"+item.featureName:"#release-work:"+release},
          approver,developerInfo);
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

  /** The original approved plan is immutable; approved clarifications only
   * append and are separately identifiable to both human and AI readers.
   */
  taskSpecSupplement(id:string):Row {
    this.requireTask(id);
    const staged=this.db.prepare(
      'SELECT * FROM dc_task_spec_supplement_proposals WHERE task_id=?').get(id);
    const history=this.db.prepare(
      'SELECT * FROM dc_task_spec_supplements WHERE task_id=? ORDER BY revision').all(id);
    const convert=(r:Row|undefined)=>r?{
      proposalHash:r.proposal_hash,reviewHash:r.review_hash??null,
      proposal:JSON.parse(r.proposal_json),review:r.reviewed_json?
        JSON.parse(r.reviewed_json):null,
      proposedBy:r.proposed_by??null,approvedBy:r.approved_by??null,
      revision:r.revision??null,
    }:null;
    return {taskId:id,pending:convert(staged),
      approved:convert(history[history.length-1]),
      history:history.map(r=>({revision:r.revision,proposalHash:r.proposal_hash,
        reviewHash:r.review_hash,approvedBy:r.approved_by,approvedAt:r.approved_at}))};
  }

  private checkTaskSpecSupplement(proposal:TaskSpecSupplementProposal):Row {
    const task=this.get(proposal.taskId);
    const original=this.frozenTaskContract(proposal.taskId);
    const history=this.db.prepare(
      'SELECT proposal_json FROM dc_task_spec_supplements WHERE task_id=? ORDER BY revision')
      .all(proposal.taskId);
    const previous:Record<string,unknown>={};
    for(const row of history)
      Object.assign(previous,(JSON.parse(row.proposal_json) as TaskSpecSupplementProposal).fields);
    const issues=validateTaskSupplement(proposal,{...original,...previous});
    if(!original.authoritative||original.source?.frozen!==true)
      issues.push('Original approved source must be frozen');
    if(original.source?.planHash!==proposal.expectedPlanHash||
      original.source?.revision!==proposal.expectedPlanRevision)
      issues.push('Exact original approved hash/revision mismatch');
    if(JSON.stringify(task.allowedPaths)!==JSON.stringify(original.allowedPaths)||
      JSON.stringify(task.requiredGates)!==JSON.stringify(original.requiredGates))
      issues.push('Effective task file scope or Gates drifted from the referenced frozen revision');
    if(task.status!=='ready')issues.push('Only Ready tasks can receive new addenda');
    if(this.db.prepare('SELECT task_id FROM dc_task_leases WHERE task_id=?').get(proposal.taskId))
      issues.push('Existing task lease prevents amendment');
    if(this.taskAwaitsScopeReview(proposal.taskId,task.release)||
      this.taskAwaitsIncrementalReview(proposal.taskId,task.release))
      issues.push('Pending scope or incremental work amendment must be resolved first');
    return {passed:issues.length===0,issues,
      proposalHash:supplementHash(proposal),source:original.source,
      executableContractChanged:false};
  }

  reviewTaskSpecSupplement(proposal:TaskSpecSupplementProposal):Row {
    return this.checkTaskSpecSupplement(proposal);
  }

  stageTaskSpecSupplement(proposal:TaskSpecSupplementProposal,actor:string):Row {
    if(typeof actor!=='string'||actor.trim().length<2)
      fail('ACTOR_REQUIRED','Real proposer label required');
    return this.inTransaction(()=>{
      const check=this.checkTaskSpecSupplement(proposal);
      if(!check.passed)fail('TASK_SPEC_SUPPLEMENT_INVALID',check.issues.join('; '));
      if(this.db.prepare('SELECT task_id FROM dc_task_spec_supplement_proposals WHERE task_id=?')
        .get(proposal.taskId))
        fail('TASK_SPEC_SUPPLEMENT_PENDING','Resolve existing proposal before another');
      this.db.prepare('INSERT INTO dc_task_spec_supplement_proposals '+
        '(task_id,proposal_hash,proposal_json,proposed_by,proposed_at) VALUES (?,?,?,?,?)')
        .run(proposal.taskId,check.proposalHash,JSON.stringify(proposal),actor.trim(),utc());
      this.audit(proposal.taskId,'task_spec_supplement_proposed',actor.trim(),{
        proposalHash:check.proposalHash,fields:Object.keys(proposal.fields)});
      return {taskId:proposal.taskId,status:'awaiting_review',
        proposalHash:check.proposalHash,executableContractChanged:false};
    });
  }

  reviewStagedTaskSpecSupplement(id:string,expectedProposalHash:string,
    review:TaskSpecSupplementReview,mode:'developer'|'independent'='independent'):Row {
    return this.inTransaction(()=>{
      const row=this.db.prepare(
        'SELECT * FROM dc_task_spec_supplement_proposals WHERE task_id=?').get(id);
      if(!row||row.proposal_hash!==expectedProposalHash||row.reviewed_json)
        fail('TASK_SPEC_SUPPLEMENT_REVIEW_REQUIRED','Exact unreviewed staged proposal required');
      const proposal=JSON.parse(row.proposal_json) as TaskSpecSupplementProposal;
      const check=this.checkTaskSpecSupplement(proposal);
      if(!check.passed||check.proposalHash!==expectedProposalHash)
        fail('STALE_TASK_SPEC_SUPPLEMENT','Original frozen contract changed');
      const sources=proposal.fields.sourceRefs??this.frozenTaskContract(id).sourceRefs;
      const issues=validateSupplementReview(review,row.proposed_by,
        Array.isArray(sources)?sources:[],mode);
      if(issues.length)fail('SUBSTANTIVE_REVIEW_REQUIRED',issues.join('; '));
      const hash=supplementReviewHash(review,expectedProposalHash,mode);
      this.db.prepare('UPDATE dc_task_spec_supplement_proposals '+
        'SET reviewed_json=?,review_hash=?,reviewed_at=? WHERE task_id=?')
        .run(JSON.stringify({...review,reviewMode:mode}),hash,utc(),id);
      this.audit(id,'task_spec_supplement_reviewed',review.reviewer,{
        proposalHash:expectedProposalHash,reviewHash:hash,
        reviewMode:mode,outcome:review.outcome});
      return {taskId:id,proposalHash:expectedProposalHash,reviewHash:hash,
        status:review.outcome==='approved'?'awaiting_owner_approval':'rejected',
        executableContractChanged:false};
    });
  }

  approveTaskSpecSupplement(input:{id:string;expectedProposalHash:string;
    expectedReviewHash:string;approvedBy:string;reason:string;
    explicitAuthorization:boolean}):Row {
    if(input?.explicitAuthorization!==true||
      typeof input.approvedBy!=='string'||input.approvedBy.trim().length<2||
      typeof input.reason!=='string'||input.reason.trim().length<20)
      fail('OWNER_AUTHORIZATION_REQUIRED','Explicit Owner authorization and specific reason required');
    return this.inTransaction(()=>{
      const row=this.db.prepare(
        'SELECT * FROM dc_task_spec_supplement_proposals WHERE task_id=?').get(input.id);
      if(!row||row.proposal_hash!==input.expectedProposalHash||
        !row.reviewed_json||row.review_hash!==input.expectedReviewHash)
        fail('TASK_SPEC_SUPPLEMENT_REVIEW_REQUIRED','Exact proposal and review hashes required');
      const review=JSON.parse(row.reviewed_json) as TaskSpecSupplementReview;
      if(review.outcome!=='approved')fail('REVIEW_REJECTED','Review rejected the supplement');
      const reviewMode=(review as TaskSpecSupplementReview&{reviewMode?:string}).reviewMode;
      const {reviewMode:_,...reviewBody}=review as TaskSpecSupplementReview&{reviewMode?:string};
      if(supplementReviewHash(reviewBody,row.proposal_hash,
        reviewMode==='developer'?'developer':'independent')!==row.review_hash &&
        // Keep old independently reviewed records readable and approvable.
        !(reviewMode===undefined&&
          createHash('sha256').update(JSON.stringify({
            hash:row.proposal_hash,review,
          })).digest('hex')===row.review_hash))
        fail('REVIEW_HASH_MISMATCH','Recorded independent review digest was changed');
      const proposal=JSON.parse(row.proposal_json) as TaskSpecSupplementProposal;
      const check=this.checkTaskSpecSupplement(proposal);
      if(!check.passed||check.proposalHash!==row.proposal_hash)
        fail('STALE_TASK_SPEC_SUPPLEMENT','Original task is no longer eligible');
      const last=this.db.prepare(
        'SELECT MAX(revision) AS n FROM dc_task_spec_supplements WHERE task_id=?').get(input.id);
      const revision=Number(last?.n??0)+1;
      this.db.prepare('INSERT INTO dc_task_spec_supplements '+
        '(task_id,revision,proposal_hash,review_hash,proposal_json,reviewed_json,'+
        'approved_by,approved_at) VALUES(?,?,?,?,?,?,?,?)').run(input.id,revision,
          row.proposal_hash,row.review_hash,row.proposal_json,row.reviewed_json,
          input.approvedBy.trim(),utc());
      this.db.prepare('DELETE FROM dc_task_spec_supplement_proposals WHERE task_id=?')
        .run(input.id);
      this.audit(input.id,'task_spec_supplement_approved',input.approvedBy.trim(),{
        proposalHash:row.proposal_hash,reviewHash:row.review_hash,revision,
        reason:input.reason,originalFrozenPlanUnchanged:true});
      return {taskId:input.id,status:'approved',revision,proposalHash:row.proposal_hash,
        reviewHash:row.review_hash,frozenPlanUnchanged:true,scopeAndGatesUnchanged:true};
    });
  }

  withdrawTaskSpecSupplement(input:{id:string;expectedProposalHash:string;
    actor:string;reason:string}):Row {
    if(typeof input?.actor!=='string'||input.actor.trim().length<2||
      typeof input.reason!=='string'||input.reason.trim().length<20)
      fail('WITHDRAWAL_REASON_REQUIRED','Named actor and concrete reason required');
    return this.inTransaction(()=>{
      const row=this.db.prepare(
        'SELECT * FROM dc_task_spec_supplement_proposals WHERE task_id=?').get(input.id);
      if(!row||row.proposal_hash!==input.expectedProposalHash)
        fail('TASK_SPEC_SUPPLEMENT_NOT_FOUND','Exact pending proposal required');
      this.db.prepare('DELETE FROM dc_task_spec_supplement_proposals WHERE task_id=?')
        .run(input.id);
      this.audit(input.id,'task_spec_supplement_withdrawn',input.actor.trim(),{
        proposalHash:row.proposal_hash,reason:input.reason});
      return {taskId:input.id,withdrawn:true,frozenPlanUnchanged:true};
    });
  }

  /** Resolve the approved snapshot revision that introduced this task.
   * Later plan revisions may add work but cannot redefine frozen ancestors.
   */
  frozenTaskContract(id:string):Row {
    const task=this.get(id),planId=String(task.planId??"");
    let node:Row|null=null;
    let source:TaskContractSource={kind:"legacy",planId:task.planId??null,
      planHash:null,revision:null,approvedBy:null,approvedAt:null,
      frozen:false,qualityProfile:null};
    if(planId.startsWith("feature:")){
      const match=/^feature:([a-z0-9-]+):v(\d+)$/.exec(planId);
      if(match){
        const revision=Number(match[2]);
        const row=this.db.prepare(`SELECT * FROM dc_feature_task_plan_revisions
          WHERE feature_name=? AND revision=?`).get(match[1],revision);
        if(row){
          const frozen=JSON.parse(String(row.snapshot_json)) as Row;
          node=(frozen.plan?.nodes??[]).find((item:Row)=>item.id===id)??null;
          source={kind:"feature",planId,revision,planHash:row.hash,
            approvedBy:row.approved_by,approvedAt:row.approved_at,
            frozen:!!node,qualityProfile:"spec-depth-v3"};
        }
      }
    }else if(planId.startsWith("release-work:")){
      const release=planId.slice("release-work:".length);
      const revisions=this.db.prepare(`SELECT * FROM dc_release_work_history
        WHERE release=? ORDER BY revision ASC`).all(release);
      for(const row of revisions){
        const frozen=JSON.parse(String(row.snapshot_json)) as Row;
        const item=(frozen.plan?.workItems??[]).find((entry:Row)=>entry.id===id);
        if(item){
          node=item;source={kind:"release-work",planId,revision:row.revision,
            planHash:row.hash,approvedBy:row.approved_by,
            approvedAt:row.approved_at,frozen:true,
            qualityProfile:frozen.plan?.qualityProfile??"legacy"};
          break;
        }
      }
    }else if(planId){
      const revisions=this.db.prepare(`SELECT * FROM dc_release_plan_revisions
        WHERE release=? ORDER BY revision ASC`).all(String(task.release));
      for(const entry of revisions){
        const frozen=JSON.parse(String(entry.snapshot_json)) as Row;
        const item=(frozen.nodes??[]).find((candidate:Row)=>candidate.id===id);
        if(item){
          node=item;source={kind:"release-plan",planId,revision:entry.revision,
            planHash:entry.hash,approvedBy:entry.approved_by,
            approvedAt:entry.approved_at,frozen:true,
            qualityProfile:frozen.qualityProfile??null};
          break;
        }
      }
    }
    const contract=normalizeFrozenTaskContract(task,node,source);
    return {...contract,source,audit:auditNormalizedTaskContract(contract)};
  }

  /** Advisory audit never modifies historical approval or Verified. */
  taskDetailAudit(id:string):Row {
    const task=this.get(id);
    const normalized=this.frozenTaskContract(id);
    if(normalized.source.kind==="feature"||normalized.source.kind==="release-plan"){
      return {taskId:id,scope:normalized.source.frozen?"frozen":"missing",
        release:task.release,planHash:normalized.source.planHash,
        revision:normalized.source.revision,
        qualityProfile:normalized.source.qualityProfile,
        ...normalized.audit};
    }
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
    const approvedSupplement=this.taskSpecSupplement(id).approved;

    if(String(task.planId??"").startsWith("release-work:")) {
      const release=String(task.release);
      const frozen=this.releaseWorkPlan(release);
      const item=frozen.frozen?.plan?.workItems?.find((entry:{id:string})=>entry.id===id);
      const frozenEligible=!!item&&this.isApprovedForExecution(this.requireTask(id));
      const eligible=frozenEligible;
      return {taskId:id,eligible,approvedSupplement,
        ...this.claimAvailability(this.requireTask(id)),
        issues:!frozenEligible?["Whole-release task roster has not been frozen or source changed"]:[],
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
        return {taskId:id,eligible:issues.length===0,issues,approvedSupplement,
          ...this.claimAvailability(this.requireTask(id)),
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
    return {taskId:id,eligible:issues.length===0,issues,approvedSupplement,
      ...this.claimAvailability(this.requireTask(id)),
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
    // Without Git the same approved scope is content-hashed in SQLite.
    // For Git workspaces also require a tracked, clean source as before.
    if(this.hasRootGit&&
        (!run(this.root,"git",["ls-files","--error-unmatch","--",input.scopeSource],12_000).passed ||
         !run(this.root,"git",["diff","--quiet","HEAD","--",input.scopeSource],12_000).passed))
      fail("UNCOMMITTED_SCOPE", "Commit the canonical requirements source before plan review");
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
          (this.hasRootGit&&
            (!run(this.root,"git",["ls-files","--error-unmatch","--",designFile],12_000).passed ||
             !run(this.root,"git",["diff","--quiet","HEAD","--",designFile],12_000).passed))) {
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
          (this.hasRootGit&&
            !run(this.root,"git",["diff","--quiet","HEAD","--",plan.scopeSource],12_000).passed)) {
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
    const requirementRefs = extractRequirementRefs(requirements);
    const requirementIds = requirementRefs.map((ref) => ref.id);
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
      requirementIds, requirementRefs, subspecs,
      approvedPlan: this.featureTaskPlan(name),
      requiredQualityProfile: "feature-task-v1 (spec-depth-v3 leaf requirements)",
      instructions: [
        "Research the current Git project and all relevant product/architecture decisions; never invent file paths, tests or verified outcomes.",
        "Using the SQLite Feature requirements, design, tasks and subspecs, propose this Feature's group/leaf work, not separate local Spec files.",
        "Link every feature FR/NFR and each subspec to at least one concrete leaf; add missing edge cases and dependencies during PLANNING.",
        "Every leaf supplies a real trigger/outcome, workflow, business rules, inputs/outputs, preconditions/state transitions, exact files, prohibitions/stops, positive/negative tests, evidence, deliverables and <=8h estimate.",
        "Use feature:"+name+"#design as designRef, feature:"+name+"#requirements in sourceRefs and feature:"+name+"#subspec:<id> for any parent-child coverage.",
        "All IDs, code paths and tests must be grounded in the Git project. Unresolved decisions are blockers, not work left for the coding Agent.",
        "First planning round: feature-task-review and feature-task-propose. Stop this round after recording the proposal hash. In a later work round, re-read the stored proposal, perform feature-task-second-review with five concrete findings and known leaf IDs; the same Agent is allowed, but not a one-pass rubber stamp. Then feature-task-approve confirms the exact reviewed hash. No per-leaf Owner approval; material frozen-scope changes still need explicit Owner consent.",
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
    const secondReview=(pending||approved)?this.db.prepare(
      "SELECT review_hash,reviewed_by,reviewed_at FROM dc_feature_task_second_reviews WHERE feature_name=? AND proposal_hash=?",
    ).get(name,(pending??approved)?.hash??''):null;
    const frozen = approved ? JSON.parse(approved.snapshot_json) as Row : null;
    const proposal = pending ? JSON.parse(pending.snapshot_json) as Row : null;
    const review = proposal?.review ?? null;
    return { featureName:name, status:pending?(review && !review.passed?"needs_revision":
      secondReview?"review_pending":"awaiting_second_review"):approved?"frozen":"missing",
      revision:approved?.revision??0, hash:approved?.hash??null,
      frozen, proposal, proposalHash:pending?.hash??null, review,
      secondReview:secondReview??null,
      sourceDrift: frozen ? !this.featureBindingMatches(frozen.sourceFeature) : false };
  }

  listFeatureTaskPlans(): Row[] {
    const names=this.db.prepare(`SELECT feature_name FROM dc_feature_task_proposals
      UNION SELECT feature_name FROM dc_feature_task_plans ORDER BY feature_name`).all();
    return names.map(row=>this.featureTaskPlan(String(row.feature_name)));
  }

  /** A second explicit host action AFTER the proposal has been persisted.
   * The same Agent may perform this review, but it cannot be bundled into the
   * planning call. Source evidence and known task IDs are checked, not identity
   * labels. Hosts should run this in a separate conversational work round.
   */
  recordFeatureSecondReview(name:string,expectedHash:string,input:{
    reviewer:string;coverage:string;dependencies:string;failureCases:string;
    fileScope:string;verification:string;checkedTaskIds:string[];
  }):Row {
    if(!/^[a-f0-9]{64}$/.test(expectedHash))fail("REVIEW_HASH_REQUIRED","Exact staged Feature hash required");
    return this.inTransaction(()=>{
      const staged=this.db.prepare("SELECT * FROM dc_feature_task_proposals WHERE feature_name=?").get(name);
      if(!staged||staged.hash!==expectedHash)fail("REVIEW_PROPOSAL_CHANGED","Re-open staged Feature plan before the second review");
      if(this.db.prepare("SELECT review_hash FROM dc_feature_task_second_reviews WHERE feature_name=? AND proposal_hash=?")
        .get(name,expectedHash))fail("SECOND_REVIEW_ALREADY_RECORDED","Second review is immutable; stage a revised plan for a new review");
      const snapshot=JSON.parse(staged.snapshot_json) as {plan:FeatureTaskPlan;sourceFeature:{revision:number}};
      const evaluated=this.reviewFeatureTasks(name,snapshot.sourceFeature.revision,snapshot.plan);
      if(!evaluated.passed)fail("PLAN_NOT_REVIEWABLE",evaluated.issues.join('; '));
      if(typeof input?.reviewer!=="string"||input.reviewer.trim().length<2)
        fail("SECOND_REVIEW_INCOMPLETE","Record the inspecting Agent label");
      const fields=['coverage','dependencies','failureCases','fileScope','verification'] as const;
      const assessments=fields.map(key=>input?.[key]);
      if(assessments.some(value=>typeof value!=="string"||value.trim().length<42)||
        new Set(assessments.map(value=>String(value).trim())).size!==fields.length)
        fail("SECOND_REVIEW_INCOMPLETE","Separate review round needs five distinct concrete coverage, dependency, failure, file and verification findings");
      const leaves=snapshot.plan.nodes.filter(item=>item.kind==='leaf');
      const known=new Set(leaves.map(item=>item.id));
      const ids=input.checkedTaskIds;
      if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length||
        ids.some(id=>!known.has(id)))
        fail("SECOND_REVIEW_INCOMPLETE","Second review must cite real leaf task IDs from the staged plan");
      const reviewedAt=utc(),hash=createHash('sha256').update(JSON.stringify({
        proposalHash:expectedHash,reviewer:input.reviewer,assessments,checkedTaskIds:ids,
      })).digest('hex');
      this.db.prepare(`INSERT INTO dc_feature_task_second_reviews
        (feature_name,proposal_hash,review_json,review_hash,reviewed_by,reviewed_at)
        VALUES(?,?,?,?,?,?)`).run(name,expectedHash,JSON.stringify(input),hash,input.reviewer.trim(),reviewedAt);
      this.audit(null,'feature_task_second_reviewed',input.reviewer.trim(),{
        name,proposalHash:expectedHash,reviewHash:hash,checkedTaskIds:ids});
      return {featureName:name,status:'reviewed',proposalHash:expectedHash,reviewHash:hash,
        reviewedAt,checkedTaskCount:ids.length};
    });
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
    if (!plan || !Array.isArray(plan.nodes) || plan.nodes.length === 0 || plan.nodes.length > 1000 ||
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
    if (raw.length > 8_000_000) fail("PLAN_TOO_LARGE", "Feature task draft exceeds 8 MB safety limit");
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
        status:review.passed?"awaiting_second_review":"needs_revision",review,
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
    if (raw.length>8_000_000) fail("PLAN_TOO_LARGE","Feature task plan exceeds 8 MB safety limit");
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
      return { featureName:name,revision,hash,status:"awaiting_second_review",review,
        nextAction:'feature-task-second-review in a separate work round'};
    });
  }

  /** Fast transaction-local insertion of an exact hash-bound approved plan.
   * Avoids a Git process and an O(ledger size) duplicate scan per task.
   */
  private insertApprovedPlanTask(input:CreateWorkItem,actor:string,
    developer:{name:string;device:string;source:string}):void {
    if(!idPattern.test(input.id)||!input.title?.trim())
      fail("INVALID_PLAN_TASK","Reviewed plan has invalid task identity");
    const sqlDecision=input.requiredGates.length===1&&input.requiredGates[0]==="sqlite_decision";
    const paths=safePaths(input.allowedPaths,sqlDecision);
    if(!validGateRequirements(input.requiredGates)||
        (input.requiredGates.includes("sqlite_decision")&&(!sqlDecision||
        !String(input.planId??"").startsWith("release-work:"))))
      fail("INVALID_PLAN_GATE","Reviewed plan requires valid acceptance Gates");
    if(this.db.prepare("SELECT id FROM dc_tasks WHERE id=?").get(input.id))
      fail("DUPLICATE_TASK","Already imported plan task: "+input.id);
    if(input.parentId&&!this.db.prepare(
      "SELECT id FROM dc_tasks WHERE id=? AND status NOT IN ('verified','cancelled')",
    ).get(input.parentId))fail("PARENT_CLOSED","Reviewed parent missing or closed");
    const now=utc(),owner=String(developer.name||developer.device).slice(0,120);
    this.db.prepare(`INSERT INTO dc_tasks
      (id,title,parent_id,track,release,priority,status,allowed_paths,
       required_gates,spec_id,plan_id,created_at,updated_at)
       VALUES(?,?,?,?,?,?,'draft',?,?,?,?,?,?)`).run(
      input.id,input.title.trim(),input.parentId??null,input.track??"product",
      input.release??"V0.1",input.priority??50,
      JSON.stringify(paths),JSON.stringify(input.requiredGates),
      input.specId??null,input.planId??null,now,now);
    this.db.prepare(`INSERT INTO dc_task_assignments
      (task_id,owner,assigned_by,decision_ref,assigned_at,device,identity_source)
      VALUES(?,?,?,?,?,?,?)`).run(input.id,owner,owner,"local-git:created",
      now,developer.device,developer.source);
    this.audit(input.id,"developer_recorded",owner,{event:"created",
      owner,device:developer.device,source:developer.source});
    this.audit(input.id,"created_proposal",actor,{
      parentId:input.parentId??null,dependsOn:input.dependsOn??[],
      specId:input.specId,planId:input.planId,
      device:developer.device,developer:developer.name,
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
      if(!row){
        const frozen=this.db.prepare("SELECT revision,hash FROM dc_feature_task_plans WHERE feature_name=?").get(name);
        if(frozen?.hash===expectedHash)return {featureName:name,revision:frozen.revision,
          hash:frozen.hash,status:'frozen',alreadyApplied:true,
          note:'Exact proposal already committed; no tasks imported again'};
      }
      if(!row||row.hash!==expectedHash)fail("PLAN_REVIEW_MISMATCH","No matching Feature proposal pending; query feature-task-plan before retrying");
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
      if(!this.db.prepare("SELECT review_hash FROM dc_feature_task_second_reviews WHERE feature_name=? AND proposal_hash=?")
        .get(name,expectedHash))fail("SECOND_REVIEW_REQUIRED",
          "Staged Feature plan requires a separate feature-task-second-review call before activation");
      const previous=this.featureTaskPlan(name).frozen as Row|null;
      const oldIds=new Set<string>((previous?.plan?.nodes??[]).map((node:ReleasePlanNode)=>node.id));
      const remaining=snapshot.plan.nodes.filter(node=>!oldIds.has(node.id));
      const added:string[]=[];
      const developerInfo=this.localDeveloper() as {name:string;device:string;source:string};
      const present=new Set<string>(oldIds);
      while(remaining.length){
        let progress=false;
        for(let i=0;i<remaining.length;i++){
          const node=remaining[i];
          if(node.parentId&&!present.has(node.parentId))continue;
          this.insertApprovedPlanTask({id:node.id,title:node.title,
            parentId:node.parentId,allowedPaths:node.allowedPaths??["docs/**"],
            requiredGates:node.requiredGates??["docs"],release:snapshot.plan.release,
            track:"product",specId:`feature:${name}#${node.id}`,
            planId:`feature:${name}:v${row.revision}`},`feature-plan:${approvedBy}`,
            developerInfo);
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
      // Preserve the exact separate-round review forever as SQLite evidence.
      // Deleting it here would make a timed-out approval unauditable.
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
      const head=git(this.root,['rev-parse','HEAD']);
      if (!base || !run(this.root, "git", ["merge-base", "--is-ancestor", base, head]).passed) {
        fail("ARCHITECTURE_BASE_MISSING", "Architecture change requires original Git base");
      }
      // Other Agents' existing WIP is not the architecture artifact. Inspect
      // the exact document in BOTH index and worktree; a staged or unstaged
      // change of the document still blocks sync even if HEAD was updated.
      if (git(this.root, ["status", "--porcelain", "--",
        String(row.top_level_document)])) {
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
        pendingVerification:task.pendingVerification,
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
        pendingVerification:tasks.filter(task=>!!task.pendingVerification).length,
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
  private checkPreservedOwnerEdits(
    task: Row, declarations: Array<{path:string;sha256:string}>|undefined,
    baseHead: string,
  ): Array<{path:string;sha256:string}> {
    const manifest=declarations??[];
    if(!Array.isArray(manifest)||manifest.length>128||manifest.some(item=>
      !item||typeof item.path!=="string"||typeof item.sha256!=="string"||
      !/^[0-9a-f]{64}$/.test(item.sha256)||
      !item.path||path.isAbsolute(item.path)||
      item.path.split("/").includes("..")||item.path.includes("\\")||
      item.path.includes("\0")))
      fail("DIRTY_MANIFEST_INVALID","Exact relative tracked paths and SHA-256 are required");
    // Explicit local rules apply to tracked and untracked working files.
    // The frozen task scope is never exempt, and exempt changes never count
    // as the actual committed delivery for this task.
    const allowed=JSON.parse(task.allowed_paths) as string[];
    const inScope=(file:string)=>allowed.some(p=>pathAllowed(file,p));
    const trusted=new Set(trustedUncommittedGuidance(this.root,
      ["AGENTS.md",".agents/skills/mcp-probe-kit/SKILL.md"]
        .filter(file=>!inScope(file))));
    const staged=git(this.root,["diff","--cached","--name-only","-z"])
      .split("\0").filter(Boolean);
    const exemptStaged=new Set(localWorktreeExemptedFiles(this.root,staged,inScope));
    if(staged.some(file=>!exemptStaged.has(file))||
      auditedUntrackedFiles(this.root,file=>
        inScope(file))
        .some(file=>!trusted.has(file)))
      fail("DIRTY_WORKTREE","Staged and untracked files not explicitly exempted must be committed before completion");
    const dirty=git(this.root,["diff","--name-only","-z"]).split("\0")
      .filter(Boolean);
    const exemptDirty=new Set(localWorktreeExemptedFiles(this.root,dirty,inScope));
    const actual=dirty.filter(file=>!trusted.has(file)&&!exemptDirty.has(file)).sort();
    const names=manifest.map(entry=>entry.path).sort();
    if(JSON.stringify(actual)!==JSON.stringify(names))
      fail("DIRTY_MANIFEST_MISMATCH","Unstaged edits differ from the explicitly protected Owner manifest");
    // Reject deletions, type changes, unmerged entries, and dirty submodules.
    // Only ordinary unstaged tracked file modifications are exemptible.
    // The generic git() wrapper trims output, which would remove the first
    // porcelain entry's leading index-space. Read the raw NUL stream instead.
    // Without -uall Git collapses an untracked Skill into "?? .agents/".
    // The scope checker needs exact individual file identities to match
    // only canonical generator bytes, not an uninspected directory.
    const status=spawnSync("git",["status","--porcelain=v1","--untracked-files=all","-z"],{
      windowsHide: true, cwd:this.root,encoding:"utf8",timeout:12_000,
    });
    if(status.status!==0||typeof status.stdout!=="string")
      fail("GIT_ERROR","Cannot read Git index and worktree status");
    const porcelain=status.stdout.split("\0").filter(line=>
      line&&!trusted.has(line.slice(3))&&!exemptDirty.has(line.slice(3))&&
        !exemptStaged.has(line.slice(3)));
    if(porcelain.length!==actual.length||porcelain.some(line=>
      !line.startsWith(" M ")||!actual.includes(line.slice(3))))
      fail("DIRTY_WORKTREE","Only unchanged-index tracked file edits may be preserved");
    const taskCommits=changedFiles(this.root,baseHead);
    for(const item of manifest){
      if(allowed.some(p=>pathAllowed(item.path,p))||taskCommits.includes(item.path))
        fail("DIRTY_SCOPE_VIOLATION","Current task and previously committed task files cannot be exempted");
      const file=path.resolve(this.root,item.path);
      if(!file.startsWith(this.root+path.sep)||!fs.existsSync(file)||
        !fs.statSync(file).isFile()||
        createHash("sha256").update(fs.readFileSync(file)).digest("hex")!==item.sha256)
        fail("DIRTY_MANIFEST_MISMATCH","Protected Owner edits differ from the exact expected bytes");
    }
    this.auditCurrentLocalExemptions(String(task.id),'devcontrol',
      'completion-or-verification',allowed);
    return manifest.slice().sort((a,b)=>a.path.localeCompare(b.path));
  }

  /** A claim-time immutable snapshot proves that unrelated local files were
   * already present before task work. It is never a blanket dirty-file waiver.
   */
  private protectedClaimWorktree(id:string,task:Row,baseHead:string):
    Array<{path:string;kind:"tracked"|"untracked";sha256:string;size:number}>|null {
    const migration=this.db.prepare(`SELECT original_root_base,protected_worktree_json
      FROM dc_legacy_active_migrations WHERE task_id=?`).get(id);
    const row=this.db.prepare(
      "SELECT base_head,snapshot_json FROM dc_task_worktree_baselines WHERE task_id=?",
    ).get(id);
    if(!row&&!migration)return null; // old leases require explicit audited legacy mode
    const snapshotBase=String(migration?.original_root_base??row!.base_head);
    if(snapshotBase!==baseHead&&
        !run(this.root,'git',['merge-base','--is-ancestor',
          snapshotBase,baseHead]).passed)
      fail("CLAIM_BASE_CHANGED",
        "Claim baseline changed; protected local files require reviewed recovery");
    const original=parseProtectedWorktreeSnapshot(
      migration?.protected_worktree_json??row!.snapshot_json,
      'dc_task_worktree_baselines.snapshot_json');
    const snapshot=this.effectiveOwnerSnapshot(id,'',original);
    const refreshed=!!this.db.prepare(`SELECT id FROM dc_protected_worktree_refreshes
      WHERE task_id=? AND prefix='' LIMIT 1`).get(id);
    const reviewed=this.db.prepare(`SELECT reviewed_snapshot_json,reviewed_digest,
      original_digest FROM dc_recovery_worktree_reviews
      WHERE task_id=? ORDER BY id DESC LIMIT 1`).get(id);
    if(!snapshot.length&&!refreshed&&!reviewed)return null; // original clean-claim compatibility
    const allowed=JSON.parse(task.allowed_paths) as string[];
    if(snapshot.some(file=>allowed.some(pattern=>pathAllowed(file.path,pattern))))
      fail("DIRTY_SCOPE_VIOLATION","An already dirty file overlaps this task's approved scope");
    // Older claim-time snapshots included MCP-generated guidance as Owner WIP.
    // New snapshots omit *only* exact canonical, unstaged guidance. Compare
    // both sides under the same rule without rewriting the historical row or
    // relaxing protection for any other file (including MCP launch wrappers).
    // Original developer's own unfinished in-scope WIP is NOT unrelated
    // Owner work and must not count as an extra protected-path conflict.
    const current=preservedWorktreeSnapshot(this.root,allowed).filter(file=>
      !allowed.some(pattern=>pathAllowed(file.path,pattern)));
    const legacyGuidance=snapshot.filter(file=>file.kind==='tracked'&&
      isManagedGuidancePath(file.path)&&
      !allowed.some(pattern=>pathAllowed(file.path,pattern))).map(file=>file.path);
    const dirtyGuidance=legacyGuidance.length?
      new Set(git(this.root,['diff','--name-only','--no-ext-diff','--',
        ...legacyGuidance]).split('\n').filter(Boolean)):new Set<string>();
    const trustedLegacy=new Set(trustedUncommittedGuidance(this.root,
      legacyGuidance.filter(file=>dirtyGuidance.has(file))));
    const comparable=worktreeSnapshotWithLocalExemptions(this.root,
      snapshot.filter(file=>!trustedLegacy.has(file.path)),allowed);
    let reviewedExpected:ReturnType<typeof preservedWorktreeSnapshot>|null=null;
    if(reviewed){
      reviewedExpected=JSON.parse(String(reviewed.reviewed_snapshot_json));
    }
    if(reviewedExpected){
      const originalDigest=createHash('sha256').update(JSON.stringify(comparable)).digest('hex');
      const reviewedDigest=createHash('sha256').update(JSON.stringify(reviewedExpected)).digest('hex');
      if(reviewedDigest!==reviewed!.reviewed_digest)
        fail('RECOVERY_REVIEW_CORRUPT','An approved external Agent file fingerprint was altered');
      // Earlier reviews can be incremental; their source SHA belongs in the
      // immutable audit record, never as a reason to rewrite claim baseline.
      if(!originalDigest||!reviewed!.original_digest)
        fail('RECOVERY_REVIEW_CORRUPT','Original protected claim digest unavailable');
    }
    const expected=reviewedExpected??
      comparable;
    if(JSON.stringify(current)!==JSON.stringify(expected))
      fail("WORKTREE_CHANGED",
        "An unrelated pre-existing file changed or an unapproved new file appeared after claim; see details for exact protected file differences",
        this.worktreeConflictDetails(task,expected,current));
    return expected;
  }

  /** Separate this task's renewed commit slice from legitimately intervening
   * tasks. The resume event is immutable and recorded before new work; a
   * changed Git graph or missing event fails closed to the strict baseline.
   */
  private resumedDeliveryBase(id:string,baseHead:string,head:string):string|null {
    const deferred=this.db.prepare(`SELECT base_head,completion_head,resumed_at
      FROM dc_verification_deferrals WHERE task_id=? AND resumed_at IS NOT NULL`).get(id);
    if(!deferred||deferred.base_head!==baseHead)return null;
    const record=this.db.prepare(`SELECT details_json FROM dc_audit
      WHERE task_id=? AND event='verification_resumed' ORDER BY id DESC LIMIT 1`).get(id);
    if(!record)return null;
    try{
      const event=JSON.parse(String(record.details_json));
      const resume=String(event.currentHead??'');
      if(event.originalBaseHead!==baseHead||
          event.originalCompletionHead!==deferred.completion_head||
          !/^[a-f0-9]{40}$/.test(resume)||
          !run(this.root,'git',['merge-base','--is-ancestor',
            deferred.completion_head,resume]).passed||
          !run(this.root,'git',['merge-base','--is-ancestor',resume,head]).passed)
        return null;
      return resume;
    }catch{return null;}
  }

  /** Legacy/in-flight claim recovery: when another project created an
   * unrelated untracked file after the original claim, capture its bytes as
   * non-delivery data instead of demanding removal or committing it.
   * This path never exempts a staged file or a file inside approved scope.
   */
  private unrelatedCompletionWorktree(task:Row,baseHead:string):
    ReturnType<typeof preservedWorktreeSnapshot> {
    const snapshot=preservedWorktreeSnapshot(this.root,JSON.parse(task.allowed_paths));
    if(snapshot.some(file=>isManagedGuidancePath(file.path)))
      fail('MANAGED_GUIDANCE_INTEGRITY',
        'A post-claim Skill or AGENTS change does not match the exact MCP generator; do not treat it as unrelated Owner WIP');
    const allowed=JSON.parse(task.allowed_paths) as string[];
    const committed=committedFilesBetween(this.root,baseHead,git(this.root,['rev-parse','HEAD']));
    if(snapshot.some(file=>allowed.some(pattern=>pathAllowed(file.path,pattern))||
      committed.includes(file.path)))
      fail('DIRTY_SCOPE_VIOLATION',
        'Dirty task-scope or already committed task files cannot be exempted');
    return snapshot;
  }

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
    if(!this.hasRootGit)return this.completeFileTask(id,token,input);
    let head = git(this.root, ["rev-parse", "HEAD"]);
    return this.inTransaction(() => {
      const lease = this.requireLease(id, token);
      this.requireGitWriter(id);
      const task = this.requireTask(id);
      if (!["in_progress", "in_review"].includes(task.status)) {
        fail("INVALID_STATE", "Only a claimed task can record completion before verification");
      }
      const observed=this.observedTaskRepositories(id,task);
      const multiRepo=observed.some(repo=>!!repo.prefix);
      if(input.deliveryHeads!==undefined&&!multiRepo)
        fail('DELIVERY_HEADS_INVALID','Explicit deliveryHeads need multiple independent Git repositories');
      const repositories=multiRepo?
        this.selectDeliveryRepositories(task,observed,input.deliveryHeads):observed;
      if(multiRepo)head=repositories.find(repo=>repo.prefix==='')!.head;
      if(multiRepo){
        this.requireChildReposClean(observed,id,task);
        const rootRepo=repositories.find(repo=>repo.prefix==='')!;
        const changed=this.deliveryTaskFiles(committedChanges(this.root,repositories),
          rootRepo.baseHead,rootRepo.head);
        const allowed=JSON.parse(task.allowed_paths) as string[];
        const exact=(this.executionContract(id).profile==='spec-depth-v3'
          ?(this.executionContract(id).spec as ReleasePlanNode)?.allowedChangedFiles:undefined);
        if(!changed.length||changed.some(file=>!allowed.some(p=>pathAllowed(file,p))||
          (exact&&!exact.includes(file))))
          fail('DELIVERY_SCOPE_INVALID',
            'Every child repository must have real committed changes within its frozen task scope');
      }
      if(input.preserveExistingWorktree===true&&input.existingDirtyFiles!==undefined)
        fail("DIRTY_MODE_CONFLICT","Choose either legacy protected tracked edits or audited worktree snapshot");
      const protectedAtClaim=this.protectedClaimWorktree(id,task,lease.base_head);
      const autoCandidate=protectedAtClaim??(
        input.preserveExistingWorktree===true?preservedWorktreeSnapshot(this.root,
          JSON.parse(task.allowed_paths)):
        input.existingDirtyFiles===undefined?
          this.unrelatedCompletionWorktree(task,lease.base_head):[]);
      const autoUntracked=autoCandidate.length>0&&
        autoCandidate.every(item=>item.kind==='untracked');
      const protectedSnapshot=!!protectedAtClaim||input.preserveExistingWorktree===true||
        (input.existingDirtyFiles===undefined&&autoUntracked);
      const preservedWorktree=protectedSnapshot?autoCandidate:[];
      const preserved=protectedSnapshot?[]:
        this.checkPreservedOwnerEdits(task,input.existingDirtyFiles,lease.base_head);
      // A worktree snapshot cannot stand in for an actual committed task diff.
      if(protectedSnapshot){
        const resumedBase=this.resumedDeliveryBase(id,String(lease.base_head),head);
        const rawChanges=multiRepo?committedChanges(this.root,repositories):
          this.parkedDeliveryFiles(id,String(lease.base_head),head)??
          committedFilesBetween(this.root,resumedBase??lease.base_head,head);
        const changed=this.deliveryTaskFiles(rawChanges,
          multiRepo?repositories.find(repo=>repo.prefix==='')!.baseHead:resumedBase??lease.base_head,head);
        const allowed=JSON.parse(task.allowed_paths) as string[];
        if(!changed.length||changed.some(file=>!allowed.some(p=>pathAllowed(file,p))))
          fail("DELIVERY_SCOPE_INVALID","Only committed, in-scope task work can record completion");
        if(JSON.stringify(preservedWorktree)!==
            JSON.stringify(preservedWorktreeSnapshot(this.root,allowed)))
          fail("WORKTREE_CHANGED","Pre-existing uncommitted source changed during completion");
      }
      if(!this.checkGovernedArtifacts().passed)
        fail("GOVERNED_ARTIFACT_CHANGED","Frozen architecture artifacts cannot be exempted");
      const previous = this.latestCompletion(id);
      const revision = (previous?.revision ?? 0) + 1;
      const record = {
        taskId: id, revision,
        summary: input.summary.trim(),
        implementation: input.implementation.trim(),
        verification: input.verification.trim(),
        remaining: (input.remaining ?? "").trim(),
        preservedDirtyFiles: preserved,
        preservedUncommittedFiles:preservedWorktree.length,
        gitHead: head, agent: lease.agent, createdAt: utc(),
      };
      this.db.prepare(`
        INSERT INTO dc_completion_notes
        (task_id,revision,summary,implementation,verification,remaining,preserved_dirty_json,preserved_worktree_json,git_head,agent,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
      `).run(id, revision, record.summary, record.implementation,
        record.verification, record.remaining, JSON.stringify(preserved),
        JSON.stringify(preservedWorktree),
        head, lease.agent, record.createdAt);
      if(multiRepo){
        this.db.prepare(`INSERT INTO dc_completion_repository_revisions
          (task_id,revision,snapshot_json,digest) VALUES(?,?,?,?)`)
          .run(id,revision,JSON.stringify(repositories),this.repositoryEvidenceDigest(id,repositories));
      }
      this.audit(id, "completion_recorded", lease.agent, {
        revision, gitHead: head,
        resumedIncrementalBase:this.resumedDeliveryBase(id,String(lease.base_head),head),
        preservedUncommittedFiles:preservedWorktree.length,
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
  /** A fully submitted review can yield the one shared Git index to a
   * disjoint, ready task while retaining its own lease and original evidence.
   * Never yield uncommitted coding, overlapping scope or staged changes.
   */
  private canYieldReviewWriter(lease:Row,nextTask:Row):boolean{
    if(lease.task_id===nextTask.id)return false;
    const parkedResumption=nextTask.status==='in_progress'&&
      !!this.db.prepare(`SELECT task_id FROM dc_parked_writers WHERE
        task_id=? AND successor_task_id=? AND resumed_head IS NULL`)
        .get(nextTask.id,lease.task_id);
    if(nextTask.status!=='ready'&&!parkedResumption)return false;
    const previous=this.requireTask(String(lease.task_id));
    if(previous.status!=='in_review'||!this.latestCompletion(previous.id)||
      !this.db.prepare('SELECT id FROM dc_evidence WHERE task_id=? LIMIT 1')
        .get(previous.id))return false;
    const nextPaths=JSON.parse(this.requireTask(nextTask.id).allowed_paths) as string[];
    if(taskScopesOverlap(JSON.parse(previous.allowed_paths),nextPaths))return false;
    const outstanding=this.db.prepare(`SELECT l.task_id FROM dc_task_leases l
      JOIN dc_tasks t ON t.id=l.task_id
      WHERE t.status='in_review' AND l.task_id!=?`).all(nextTask.id);
    if(outstanding.some(row=>
      taskScopesOverlap(JSON.parse(this.requireTask(String(row.task_id)).allowed_paths),
        nextPaths)))return false;
    try{
      if(stagedChanges(discoverRepositories(this.root,
        JSON.parse(previous.allowed_paths))).length)return false;
      const note=this.latestCompletion(previous.id)!;
      this.checkReviewDeliveryHead(previous.id,String(lease.base_head),
        String(note.git_head));
      this.protectedClaimWorktree(previous.id,previous,String(lease.base_head));
      if(parkedResumption){
        const row=this.db.prepare(`SELECT preserved_snapshot_json,preserved_digest
          FROM dc_parked_writers WHERE task_id=?`).get(nextTask.id);
        if(!row||createHash('sha256').update(String(row.preserved_snapshot_json))
          .digest('hex')!==row.preserved_digest||
          JSON.stringify(preservedWorktreeSnapshot(this.root,[]))!==
            row.preserved_snapshot_json)return false;
        this.protectedClaimWorktree(nextTask.id,nextTask,
          String(this.db.prepare('SELECT base_head FROM dc_task_leases WHERE task_id=?')
            .get(nextTask.id)?.base_head??''));
      }
      this.requireChildReposClean(this.observedTaskRepositories(previous.id,previous),
        previous.id,previous);
      return true;
    }catch{return false;}
  }
  /** The current Git index belongs to exactly one writable task per
   * checkout. Linked worktrees share the project SQLite, NOT its index.
   */
  private checkoutWriter():Row|undefined{
    if(!this.linkedWorktree)
      return this.db.prepare('SELECT * FROM dc_leases WHERE singleton=1').get();
    return this.db.prepare(`SELECT l.* FROM dc_task_leases l
      JOIN dc_tasks t ON t.id=l.task_id
      WHERE l.worktree_path=? AND t.status IN ('in_progress','in_review')
      ORDER BY l.expires_at DESC LIMIT 1`).get(fs.realpathSync(this.root));
  }

  /** Report runtime Writer readiness separately from frozen contract
   * eligibility. This preflight has no side effects. Claim rechecks all
   * conditions in the same SQLite transaction before rotating any token.
   */
  private claimAvailability(task:Row):Row{
    if(!['ready','in_progress'].includes(task.status))
      return {claimableNow:false,writerBlocker:{
        code:'TASK_NOT_READY',taskId:task.id,action:'complete the prior review'}};
    try{this.checkOtherCheckoutScopes(task);}
    catch(error){
      return {claimableNow:false,writerBlocker:{
        code:error instanceof DevControlError?error.code:'PARALLEL_SCOPE_CONFLICT',
        taskId:task.id,action:'Use an independent non-overlapping Git checkout'}};
    }
    const writer=this.checkoutWriter();
    if(!writer)return {claimableNow:true,writerBlocker:null};
    if(writer.task_id===task.id){
      if(writer.expires_at>Date.now())
        return {claimableNow:false,writerBlocker:{
          code:'LEASE_STILL_ACTIVE',taskId:task.id,action:'renew existing lease'}};
      return {claimableNow:true,writerBlocker:null};
    }
    try{
      if(this.canYieldReviewWriter(writer,task))
        return {claimableNow:true,writerBlocker:null};
      if(writer.expires_at<=Date.now()&&this.parkedWriterForClaim(writer,task))
        return {claimableNow:true,writerBlocker:null};
    }catch(error){
      return {claimableNow:false,writerBlocker:{
        code:error instanceof DevControlError?error.code:'WORKTREE_CHANGED',
        taskId:writer.task_id,writerExpired:writer.expires_at<=Date.now(),
        details:error instanceof DevControlError?error.details:undefined,
        action:'Inspect the recorded frozen and protected file differences before claim'}};
    }
    const previous=this.requireTask(String(writer.task_id));
    if(previous.status==='verified'&&writer.expires_at<=Date.now())
      return {claimableNow:true,writerBlocker:null};
    return {claimableNow:false,writerBlocker:{
      code:writer.expires_at>Date.now()?'LEASE_CONFLICT':'ABANDONED_TASK',
      taskId:writer.task_id,previousStatus:previous.status,
      writerExpired:writer.expires_at<=Date.now(),
      frozenScope:JSON.parse(previous.allowed_paths),
      overlaps:taskScopesOverlap(JSON.parse(previous.allowed_paths),
        JSON.parse(task.allowed_paths)),
      action:writer.expires_at>Date.now()?
        'Finish or explicitly yield the existing task writer':
        previous.status==='in_progress'?
          'Review external worktree conflicts, then use park-expired-writer with the exact approved disjoint successor':
          'Complete the existing review or recover only if actual source rework is required',
    }};
  }

  /** Separate Git indexes cannot safely overlap an unverified task's
   * approved file scope, even if they use different worktree branches.
   */
  private checkOtherCheckoutScopes(task:Row):void{
    const scope=JSON.parse(task.allowed_paths) as string[];
    const ownPath=this.linkedWorktree?fs.realpathSync(this.root):'';
    const others=this.db.prepare(`SELECT l.task_id,l.worktree_path
      FROM dc_task_leases l JOIN dc_tasks t ON t.id=l.task_id
      WHERE l.task_id!=? AND t.status IN ('in_progress','in_review')`)
      .all(task.id).filter(row=>row.worktree_path!==ownPath);
    for(const other of others){
      if(taskScopesOverlap(scope,JSON.parse(this.requireTask(String(other.task_id)).allowed_paths)))
        fail('PARALLEL_SCOPE_CONFLICT',
          'Unverified task '+String(other.task_id)+
          ' owns overlapping files. Finish its real acceptance before claiming this task');
    }
    const legacy=this.db.prepare('SELECT task_id FROM dc_leases WHERE singleton=1').get();
    if(this.linkedWorktree&&legacy&&legacy.task_id!==task.id&&
      !others.some(r=>r.task_id===legacy.task_id)){
      const old=this.requireTask(String(legacy.task_id));
      if(['in_progress','in_review'].includes(old.status)&&
        taskScopesOverlap(scope,JSON.parse(old.allowed_paths)))
        fail('PARALLEL_SCOPE_CONFLICT',
          'The original Git writer has overlapping unverified task scope');
    }
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
    const active = this.checkoutWriter();
    const activeLease = active && active.expires_at > Date.now()
      ? { taskId: active.task_id, agent: active.agent, expiresAt: active.expires_at } : null;
    // Review tasks retain their own lease but must not masquerade as current
    // Git writers. Present them as actionable project work, not a new Gate.
    const parkedReviews=this.db.prepare(`SELECT l.task_id,l.agent,l.expires_at
      FROM dc_task_leases l JOIN dc_tasks t ON t.id=l.task_id
      WHERE t.status='in_review' AND l.task_id!=?
      ORDER BY l.task_id`).all(String(active?.task_id??'')).map(item=>({
      taskId:item.task_id,agent:item.agent,expiresAt:item.expires_at,
      completionHead:this.latestCompletion(String(item.task_id))?.git_head??null,
    }));
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
      !t.pendingVerification &&
      !(t.status === "ready" && (this.taskAwaitsScopeReview(t.id,t.release)||
        this.taskAwaitsIncrementalReview(t.id,t.release))) &&
      this.executable(this.requireTask(t.id)) &&
      this.blockers(t.id).length === 0 &&
      !t.childIds.some((id: string) => this.requireTask(id).status !== "verified"),
    );
    // Coding still has one shared Git writer. A completed review does NOT
    // need to hold it while an unrelated, non-overlapping task is developed.
    const availableAfterReview=active&&activeLease?
      ready.filter(t=>t.status==='ready'&&this.canYieldReviewWriter(active,t)): [];
    const selected = availableAfterReview.find(t=>t.track==='product')??
      availableAfterReview[0]??(activeLease ? this.get(activeLease.taskId)
      : ready.find((t) => t.status==='ready'&&t.track==='product')??
        ready.find(t=>t.status==='ready')??ready[0]??null);
    return {
      projectRoot: this.root, nextTask: selected,
      activeLease,
      selectedTaskWriterStatus:selected?
        this.claimAvailability(this.requireTask(selected.id)):null,
      parkedReviews,
      reviewWriterCanYield:availableAfterReview.length>0,
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
    if (!validGateRequirements(input.requiredGates))
      fail("GATE_REQUIRED", "Declare nonempty named project-specific acceptance requirements; MCP does not execute them");
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
    if (!validGateRequirements(input.requiredGates))
      fail("GATE_REQUIRED", "Declare test/evidence requirements for imported drafts");
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

  claim(id: string, agent: string, ttlSeconds = 1800,
    resumedFrozenBase?:string): Row {
    if (!agent?.trim()) fail("AGENT_REQUIRED", "Agent identity required");
    if (ttlSeconds < 60 || ttlSeconds > 3600) fail("INVALID_TTL", "Lease must be 60–3600 seconds");
    if(!this.hasRootGit)return this.claimFileTask(id,agent,ttlSeconds,resumedFrozenBase);
    const base = git(this.root, ["rev-parse", "HEAD"]);
    return this.inTransaction(() => {
      const task = this.requireTask(id);
      if(this.db.prepare(
        "SELECT task_id FROM dc_verification_deferrals "+
        "WHERE task_id=? AND resumed_at IS NULL",
      ).get(id)) {
        fail("VERIFICATION_DEFERRED",
          "Task retains its unpassed Gate; use resume-verification to reopen it");
      }
      if (task.status !== "ready" && task.status !== "in_progress" && task.status !== "in_review") {
        fail("TASK_NOT_READY", `Task ${id} is ${task.status}`);
      }
      const pending=this.taskAwaitsScopeReview(id,task.release);
      if(task.status==="ready"&&pending)
        fail("SCOPE_AMENDMENT_PENDING",
          "Scope amendment for this task awaits substantive developer self-review (independent review optional) and exact Owner approval; do not claim it");
      if(task.status==="ready"&&this.taskAwaitsIncrementalReview(id,task.release))
        fail("INCREMENTAL_REVIEW_PENDING",
          "New prerequisite for this task awaits substantive developer review and Owner hash approval; host development Agent must inspect the original code and submit real evidence through release-work-incremental-self-review (independent review optional), then obtain Owner authorization. Do not wait for MCP to review.");
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
      this.checkOtherCheckoutScopes(task);
      if(this.linkedWorktree){
        // Multi-repo deliveries require an independent repository checkout
        // vector. A root-only worktree cannot magically include child .git
        // histories, so keep that case fail-closed pending full support.
        const mainRepos=discoverRepositories(this.projectRoot,
          JSON.parse(task.allowed_paths));
        if(mainRepos.length!==1)fail('MULTI_REPO_WORKTREE_UNSUPPORTED',
          'Use the canonical checkout for tasks touching a multi-Git workspace');
      }
      const lease = this.checkoutWriter();
      const parked=this.db.prepare('SELECT * FROM dc_task_leases WHERE task_id=?').get(id);
      if(parked&&parked.worktree_path!==(this.linkedWorktree?fs.realpathSync(this.root):'')&&
        ['in_progress','in_review'].includes(task.status))
        fail('TASK_CHECKOUT_CONFLICT',
          'A task with existing work must be resumed in its original checkout; never replace its Git delivery from another worktree');
      const restoringParkedWork=!!parked&&task.status==='in_progress'&&
        (!lease||lease.task_id!==id);
      if(parked&&(!lease||lease.task_id!==id)&&parked.expires_at>Date.now()&&
        !restoringParkedWork)
        fail('REVIEW_LEASE_ACTIVE',
          'This task already has a retained review lease; renew or finish its existing review instead of replacing the evidence token');
      const yielding=!!lease&&lease.task_id!==id&&
        (this.canYieldReviewWriter(lease,task)||
          this.parkedWriterForClaim(lease,task));
      if (lease && lease.expires_at > Date.now() && !yielding) {
        fail("LEASE_CONFLICT", `Task ${lease.task_id} is already claimed by ${lease.agent}`);
      }
      // A crashed agent may have committed files before its lease expired.
      // Reclaiming that *same* task must not discard its original Git base.
      if (lease && lease.task_id !== id && !yielding &&
          ["in_progress", "in_review"].includes(this.requireTask(lease.task_id).status)) {
        fail("ABANDONED_TASK", `Expired task ${lease.task_id} must be resumed or reviewed before switching tasks`);
      }
      // Internal resume-verification reclaims the ORIGINAL submitted Git base,
      // not the current HEAD after unrelated tasks have legitimately committed.
      // The public claim CLI cannot supply this optional argument.
      if(resumedFrozenBase&&
          !run(this.root,"git",["merge-base","--is-ancestor",resumedFrozenBase,base]).passed)
        fail("GIT_HISTORY_CHANGED",
          "Original deferred task baseline must remain an ancestor of HEAD");
      const originalBase=resumedFrozenBase??
        (lease?.task_id===id?String(lease.base_head):
          restoringParkedWork?String(parked.base_head):base);
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
          scopeAmendment?:{proposalHash?:string},
          incrementalWorkAmendment?:{proposalHash?:string}
        }:null;
        if(approved?.scopeAmendment?.proposalHash!==paused.proposal_hash&&
          approved?.incrementalWorkAmendment?.proposalHash!==paused.proposal_hash)
          fail("SCOPE_AMENDMENT_NOT_APPROVED",
            "Only the exact approved scope or incremental amendment may resume this task");
        if(base!==paused.paused_head)
          fail("SCOPE_PAUSE_HEAD_CHANGED",
            "Git HEAD changed since the task was safely paused; reconcile the original commits first");
        claimBase=String(paused.base_head);
      }
      if (lease?.task_id === id||restoringParkedWork) {
        const ancestor = run(this.root, "git", ["merge-base", "--is-ancestor", claimBase, base]);
        if (!ancestor.passed) fail("GIT_HISTORY_CHANGED", "Cannot resume: prior task baseline is not an ancestor of HEAD");
      }
      if(paused && !run(this.root,"git",["merge-base","--is-ancestor",claimBase,base]).passed)
        fail("GIT_HISTORY_CHANGED","Paused task baseline is not an ancestor of HEAD");
      const token = randomUUID();
      const previousSnapshot=this.db.prepare(
        "SELECT base_head,snapshot_json FROM dc_task_worktree_baselines WHERE task_id=?",
      ).get(id);
      if(!previousSnapshot){
        const files=preservedWorktreeSnapshot(this.root,JSON.parse(task.allowed_paths));
        const allowed=JSON.parse(task.allowed_paths) as string[];
        if(!files.some(file=>allowed.some(pattern=>pathAllowed(file.path,pattern)))){
          this.db.prepare(`INSERT INTO dc_task_worktree_baselines
            (task_id,base_head,snapshot_json,captured_at) VALUES(?,?,?,?)`)
            .run(id,claimBase,JSON.stringify(files),utc());
        } // ambiguous in-scope dirty claims retain the original strict checker
      }else if(previousSnapshot.base_head!==claimBase&&
        parseProtectedWorktreeSnapshot(previousSnapshot.snapshot_json,
          'dc_task_worktree_baselines.snapshot_json').length>0){
        // After a legitimate new deferred delivery revision, its frozen Git
        // base may advance past the initial claim. Do not reject unchanged
        // Owner WIP simply because that audited revision advanced the base.
        // Require both ancestry and byte-identical prior protected worktree.
        const previousFiles=parseProtectedWorktreeSnapshot(
          previousSnapshot.snapshot_json,'dc_task_worktree_baselines.snapshot_json');
        if(!run(this.root,'git',['merge-base','--is-ancestor',
          String(previousSnapshot.base_head),claimBase]).passed||
          JSON.stringify(previousFiles)!==JSON.stringify(preservedWorktreeSnapshot(this.root,
            JSON.parse(task.allowed_paths))))
          fail("CLAIM_BASE_CHANGED",
            "Original task worktree baseline must be preserved during reclaim");
      }
      const claimedRepositories=this.captureTaskRepositories(id,task,claimBase);
      // A child index may contain unrelated WIP at claim time. Unlike the
      // single-root legacy snapshot, it cannot safely be exempted without a
      // per-repository signed manifest, so stop instead of silently trusting it.
      this.requireChildReposClean(claimedRepositories,id,task);
      this.recordLocalDeveloper(id,"claimed");
      this.auditCurrentLocalExemptions(id,agent.trim(),'claim',
        JSON.parse(task.allowed_paths) as string[]);
      if(yielding){
        // Legacy SQLite may still have only the old singleton; preserve its
        // real token before changing shared writer ownership.
        this.db.prepare(`INSERT OR IGNORE INTO dc_task_leases
          (task_id,agent,token,base_head,expires_at,worktree_path)
          SELECT task_id,agent,token,base_head,expires_at,''
          FROM dc_leases WHERE task_id=?`).run(String(lease.task_id));
        this.audit(String(lease.task_id),
          this.requireTask(String(lease.task_id)).status==='in_review'?
            'review_writer_yielded':'parked_expired_writer_transferred',
          String(lease.agent),{
            nextTask:id,originalBaseHead:lease.base_head,
            writerLeaseRetainedForReview:true,originalTestEvidenceUnchanged:true,
          });
      }
      if(restoringParkedWork&&(yielding||!lease)){
        const park=this.db.prepare(`SELECT task_id,successor_task_id FROM
          dc_parked_writers WHERE task_id=? AND resumed_head IS NULL`)
          .get(id);
        const successor=park?this.requireTask(String(park.successor_task_id)):null;
        if(park&&((lease&&park.successor_task_id===lease.task_id&&
          successor?.status==='in_review')||
          (!lease&&successor?.status==='verified'))){
          this.db.prepare(`UPDATE dc_parked_writers
            SET resumed_head=?,resumed_at=? WHERE task_id=? AND resumed_head IS NULL`)
            .run(base,utc(),id);
          this.audit(id,'original_parked_task_resumed',agent.trim(),{
            successorTaskId:park.successor_task_id,resumedHead:base,
            originalBaseHead:claimBase,originalEvidencePreserved:true,
            writerReacquired:true,testsOrGatesPassed:false,
          });
        }
      }
      if(!this.linkedWorktree)this.db.prepare(`
        INSERT OR REPLACE INTO dc_leases(singleton,task_id,agent,token,base_head,expires_at)
        VALUES(1,?,?,?,?,?)
      `).run(id, agent.trim(), token, claimBase, Date.now() + ttlSeconds * 1000);
      this.db.prepare(`INSERT INTO dc_task_leases
        (task_id,agent,token,base_head,expires_at,worktree_path)
        VALUES(?,?,?,?,?,?)
        ON CONFLICT(task_id) DO UPDATE SET agent=excluded.agent,
        token=excluded.token,base_head=excluded.base_head,
        expires_at=excluded.expires_at,worktree_path=excluded.worktree_path`)
        .run(id,agent.trim(),token,claimBase,Date.now()+ttlSeconds*1000,
          this.linkedWorktree?fs.realpathSync(this.root):'');
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
      this.db.prepare("UPDATE dc_task_leases SET expires_at=? WHERE task_id=?").run(expiresAt,id);
      this.db.prepare("UPDATE dc_leases SET expires_at=? WHERE task_id=?").run(expiresAt,id);
      this.audit(id, "lease_renewed", current.agent, { ttlSeconds, expiresAt });
      return { taskId: id, agent: current.agent, baseHead: current.base_head, expiresAt };
    });
  }

  /**
   * A genuinely unavailable external acceptance dependency may postpone
   * verification, never waive it. The committed task, completion note and
   * original Git base are immutable while unrelated tasks move forward.
   * A review task without submitted code must not use this escape hatch.
   */
  deferVerification(input: {
    id:string; leaseToken:string; gate:string; reason:string;
    preserveExistingWorktree?:boolean;
  }): Row {
    if(typeof input.reason!=="string"||input.reason.trim().length<20||
        input.reason.length>1200) {
      fail("DEFERRAL_REASON_REQUIRED",
        "Document the unavailable gate and concrete revalidation condition");
    }
    if(!this.hasRootGit){
      return this.inTransaction(()=>{
        const lease=this.requireLease(input.id,input.leaseToken);
        const task=this.requireTask(input.id),delivery=this.fileDelivery(input.id);
        const note=this.latestCompletion(input.id);
        if(task.status!=='in_review'||!delivery?.submitted||!note)
          fail('DELIVERY_NOT_RECORDED','A completed and reported file delivery is required');
        const gates=JSON.parse(task.required_gates) as string[];
        if(!gates.includes(input.gate)||!isEvidenceGate(input.gate))
          fail('GATE_NOT_DEFERRABLE','Only a frozen external Gate can be deferred');
        if(!this.db.prepare('SELECT id FROM dc_evidence WHERE task_id=? LIMIT 1').get(input.id))
          fail('EVIDENCE_REQUIRED','Report actual source-bound test evidence before deferral');
        if(!this.fileTaskSubmittedUnchanged(delivery.submitted,delivery.baseline,
          captureFileEvidence(this.root)))
          fail('FILE_SOURCE_CHANGED','Submitted file source changed before deferral');
        if(this.db.prepare('SELECT task_id FROM dc_verification_deferrals WHERE task_id=?').get(input.id))
          fail('ALREADY_DEFERRED','An existing deferral requires its original review');
        this.db.prepare(`INSERT INTO dc_verification_deferrals
          (task_id,gate_name,reason,base_head,completion_head,completion_revision,
            deferred_by,deferred_at,preserved_worktree_json)
          VALUES(?,?,?,?,?,?,?,?,'[]')`).run(input.id,input.gate,input.reason.trim(),
          String(lease.base_head),String(note.git_head),note.revision,lease.agent,utc());
        this.clearTaskLease(input.id);
        this.audit(input.id,'file_verification_deferred',lease.agent,{
          gate:input.gate,sourceDigest:delivery.submitted.digest,gatePassed:false,
          reason:input.reason.trim(),
        });
        return {taskId:input.id,status:'in_review',pendingVerification:true,
          gatePassed:false,leaseReleased:true,evidenceKind:'files-sha256-v1'};
      });
    }
    return this.inTransaction(()=>{
      const lease=this.requireLease(input.id,input.leaseToken);
      const task=this.requireTask(input.id);
      this.requireRootOnlyDeferral(input.id,task);
      if(task.status!=="in_review")
        fail("NOT_IN_REVIEW","Only completed and reported tasks may defer verification");
      const gates=JSON.parse(task.required_gates) as string[];
      if(!gates.includes(input.gate)||!isEvidenceGate(input.gate)) {
        fail("GATE_NOT_DEFERRABLE",
          "Only a declared, still-unmet project acceptance Gate may be deferred; an internal SQLite decision cannot be deferred");
      }
      if(this.db.prepare(
        "SELECT task_id FROM dc_verification_deferrals WHERE task_id=? AND resumed_at IS NULL"
      ).get(input.id)) fail("ALREADY_DEFERRED","Task is already awaiting verification");
      const note=this.latestCompletion(input.id);
      if(!note||!this.db.prepare(
        "SELECT id FROM dc_evidence WHERE task_id=? LIMIT 1"
      ).get(input.id)) {
        fail("DELIVERY_NOT_RECORDED",
          "A committed completion and task evidence must exist before deferral");
      }
      const head=git(this.root,["rev-parse","HEAD"]);
      const resumed=this.db.prepare(`SELECT * FROM dc_verification_deferrals
        WHERE task_id=? AND resumed_at IS NOT NULL`).get(input.id);
      if(resumed){
        // A real developer may legitimately finish more scoped code after an
        // external test is deferred. That is a NEW completion revision, never
        // a retroactive claim that the old frozen code or Gate was sufficient.
        if(note.revision>resumed.completion_revision&&
            note.git_head===head&&
            resumed.gate_name===input.gate&&resumed.base_head===lease.base_head&&
            run(this.root,'git',['merge-base','--is-ancestor',
              resumed.completion_head,head]).passed){
          const resumeBase=this.resumedDeliveryBase(input.id,
            String(lease.base_head),head);
          if(!resumeBase)fail('REDEFERRAL_BASE_CHANGED',
            'Missing immutable Git resume baseline for revised task completion');
          const delivered=committedFilesBetween(this.root,resumeBase,head);
          const allowed=JSON.parse(task.allowed_paths) as string[];
          if(!delivered.length||delivered.some(file=>
            !allowed.some(pattern=>pathAllowed(file,pattern))))
            fail('DELIVERY_SCOPE_INVALID','New deferred revision must contain only approved committed files');
          const current=preservedWorktreeSnapshot(this.root,JSON.parse(task.allowed_paths));
          if(input.preserveExistingWorktree!==true||
              JSON.stringify(current)!==String(note.preserved_worktree_json??'[]'))
            fail('WORKTREE_CHANGED','Updated completion must preserve its exact existing worktree snapshot');
          if(!this.db.prepare(`SELECT id FROM dc_evidence WHERE task_id=? AND git_head=?
              LIMIT 1`).get(input.id,head))
            fail('CURRENT_REVISION_EVIDENCE_REQUIRED',
              'New completion needs its own actual local evidence before renewed external deferral');
          this.db.prepare(`UPDATE dc_verification_deferrals SET
            reason=?,base_head=?,completion_head=?,completion_revision=?,
            deferred_by=?,deferred_at=?,preserved_worktree_json=?,resumed_at=NULL
            WHERE task_id=?`).run(input.reason.trim(),resumeBase,head,
              note.revision,lease.agent,utc(),JSON.stringify(current),input.id);
          this.clearTaskLease(input.id);
          this.audit(input.id,'verification_redeferred_new_revision',lease.agent,{
            gate:input.gate,previousCompletionHead:resumed.completion_head,
            currentCompletionHead:head,completionRevision:note.revision,
            originalBaseHead:resumed.base_head,resumedIncrementalBase:resumeBase,
            scopeFiles:delivered,gatePassed:false,leaseReleased:true,
            preservedUncommittedFiles:current.length,
          });
          return {taskId:input.id,status:'in_review',pendingVerification:true,
            gate:input.gate,gatePassed:false,leaseReleased:true,
            originalHead:head,redeferred:true,newCompletionRevision:true};
        }
        // The original submitted delivery stays immutable when a genuinely
        // unavailable external Gate is deferred again after an actual retry.
        if(resumed.gate_name!==input.gate||resumed.base_head!==lease.base_head||
          resumed.completion_head!==note.git_head||
          resumed.completion_revision!==note.revision||
          !run(this.root,'git',['merge-base','--is-ancestor',note.git_head,head]).passed)
          fail('REDEFERRAL_BASE_CHANGED',
            'The original submitted revision must remain in Git history');
        const delivered=committedFilesBetween(this.root,
          resumed.base_head,resumed.completion_head);
        const later=committedFilesBetween(this.root,resumed.completion_head,head);
        const overlaps=later.filter(file=>delivered.includes(file));
        if(overlaps.length&&
          !frozenPatchStillPresent(this.root,resumed.base_head,resumed.completion_head)&&
          !this.hasReviewedDeferredOverlap(input.id,resumed.base_head,
            resumed.completion_head,head,overlaps))
          fail('DEFERRED_CODE_CHANGED',
            'Later commits changed the original delivery; record a fresh reviewed completion');
        const dirty=preservedWorktreeSnapshot(this.root,JSON.parse(task.allowed_paths));
        const allowed=JSON.parse(task.allowed_paths) as string[];
        const oldSnapshot=JSON.parse(String(resumed.preserved_worktree_json??'[]')) as
          Array<{path:string;kind:string;size:number;sha256:string}>;
        const protectedWip=new Map(oldSnapshot.map(item=>[item.path,item]));
        const inScope=dirty.filter(file=>allowed.some(p=>pathAllowed(file.path,p)));
        const newlyDirty=inScope.filter(file=>{
          const original=protectedWip.get(file.path);
          return !original||original.kind!==file.kind||
            original.size!==file.size||original.sha256!==file.sha256;
        });
        if(newlyDirty.length||git(this.root,['diff','--cached','--name-only']).trim())
          fail('REDEFERRAL_WORKTREE_CHANGED',
            'Staged or newly changed in-scope work cannot be re-deferred. Only the exact previously fingerprinted WIP is protected');
        this.db.prepare(`UPDATE dc_verification_deferrals SET
          reason=?,deferred_by=?,deferred_at=?,preserved_worktree_json=?,resumed_at=NULL
          WHERE task_id=?`).run(input.reason.trim(),lease.agent,utc(),JSON.stringify(dirty),input.id);
        this.clearTaskLease(input.id);
        this.audit(input.id,'verification_redeferred',lease.agent,{
          gate:input.gate,completionHead:note.git_head,currentHead:head,
          reason:input.reason,gatePassed:false,leaseReleased:true,
          preservedUncommittedFiles:dirty.length,
          byteIdenticalPreexistingScopeWip:inScope.length,
        });
        return {taskId:input.id,status:'in_review',pendingVerification:true,
          gate:input.gate,gatePassed:false,leaseReleased:true,
          originalHead:note.git_head,redeferred:true};
      }
      if(head!==note.git_head||
          !run(this.root,"git",["merge-base","--is-ancestor",lease.base_head,head]).passed) {
        fail("DELIVERY_HEAD_CHANGED",
          "The last completed task revision must be HEAD when freezing verification");
      }
      // Ordinary path is strict. The explicit opt-in path only *fingerprints*
      // already existing later work; it cannot relax any future verify Gate,
      // change the index or count current changes as this task's delivery.
      let preserved:Array<{path:string;kind:"tracked"|"untracked";
        sha256:string;size:number}>=[];
      if(input.preserveExistingWorktree===true){
        preserved=preservedWorktreeSnapshot(this.root,JSON.parse(task.allowed_paths));
        const completionWorktree=JSON.parse(
          String(note.preserved_worktree_json??"[]"),
        ) as Array<{path:string;kind:string;sha256:string;size:number}>;
        if(completionWorktree.length>0&&
            JSON.stringify(preserved)!==JSON.stringify(completionWorktree)&&
            !this.hasReviewedCompletedWorktree(input.id,note.git_head,head))
          fail("WORKTREE_CHANGED",
            "Later WIP differs from the protected completion snapshot; explicitly review unrelated WIP changes before deferral");
      }else{
        this.checkPreservedOwnerEdits(task,JSON.parse(note.preserved_dirty_json??"[]"),
          lease.base_head);
      }
      const files=committedFilesBetween(this.root,lease.base_head,head);
      const allowed=JSON.parse(task.allowed_paths) as string[];
      if(!files.length||files.some(file=>!allowed.some(p=>pathAllowed(file,p)))) {
        fail("DELIVERY_SCOPE_INVALID",
          "Only committed, in-scope source can await later physical verification");
      }
      if(input.preserveExistingWorktree===true&&
          JSON.stringify(preserved)!==JSON.stringify(preservedWorktreeSnapshot(this.root,
            JSON.parse(task.allowed_paths))))
        fail("WORKTREE_CHANGED","Uncommitted source changed during deferral preparation");
      this.db.prepare(`
        INSERT INTO dc_verification_deferrals
          (task_id,gate_name,reason,base_head,completion_head,
           completion_revision,deferred_by,deferred_at,preserved_worktree_json,resumed_at)
        VALUES(?,?,?,?,?,?,?,?,?,NULL)
        ON CONFLICT(task_id) DO UPDATE SET
          gate_name=excluded.gate_name,reason=excluded.reason,
          base_head=excluded.base_head,completion_head=excluded.completion_head,
          completion_revision=excluded.completion_revision,
          deferred_by=excluded.deferred_by,deferred_at=excluded.deferred_at,
          preserved_worktree_json=excluded.preserved_worktree_json,
          resumed_at=NULL
      `).run(input.id,input.gate,input.reason.trim(),lease.base_head,head,
        note.revision,lease.agent,utc(),JSON.stringify(preserved));
      this.clearTaskLease(input.id);
      this.audit(input.id,"verification_deferred",lease.agent,{
        gate:input.gate,reason:input.reason.trim(),baseHead:lease.base_head,
        completionHead:head,completionRevision:note.revision,
        gatePassed:false,leaseReleased:true,
        preservedUncommittedFiles:preserved.length,
      });
      return {taskId:input.id,status:"in_review",
        pendingVerification:true,gate:input.gate,gatePassed:false,
        leaseReleased:true,originalHead:head,
        preservedUncommittedFiles:preserved.length};
    });
  }

  /** Explicitly reclaim a deferred task when the real device/runner exists.
   * Verify the original Git diff cannot be rewritten by intervening work.
   */
  resumeVerification(id:string,agent:string,ttlSeconds=1800,
    reconciliation?:{reviewedHead:string;overlappingPaths:string[];
      findings:string;evidenceReference:string}):Row {
    if(!this.hasRootGit){
      if(!agent?.trim()||!Number.isSafeInteger(ttlSeconds)||ttlSeconds<60||ttlSeconds>3600)
        fail('INVALID_TTL','A responsible agent and 60–3600 second renewal are required');
      return this.inTransaction(()=>{
        const pending=this.db.prepare('SELECT * FROM dc_verification_deferrals WHERE task_id=? AND resumed_at IS NULL').get(id);
        if(!pending)fail('NOT_DEFERRED','No pending file-backed verification');
        const task=this.requireTask(id),delivery=this.fileDelivery(id),note=this.latestCompletion(id);
        if(task.status!=='in_review'||!delivery?.submitted||!note||
            note.revision!==pending.completion_revision||
            note.git_head!==pending.completion_head)
          fail('FILE_DELIVERY_CHANGED','The original completed review is no longer available');
        if(!this.fileTaskSubmittedUnchanged(delivery.submitted,delivery.baseline,
          captureFileEvidence(this.root)))
          fail('FILE_SOURCE_CHANGED','Cannot resume a changed submitted source');
        if(this.checkoutWriter())fail('LEASE_CONFLICT','Another task owns this workspace');
        const token=randomUUID(),expiry=Date.now()+ttlSeconds*1000;
        this.db.prepare("UPDATE dc_verification_deferrals SET resumed_at=? WHERE task_id=?")
          .run(utc(),id);
        this.db.prepare("INSERT OR REPLACE INTO dc_leases(singleton,task_id,agent,token,base_head,expires_at) VALUES(1,?,?,?,?,?)")
          .run(id,agent.trim(),token,String(pending.base_head),expiry);
        this.db.prepare("INSERT INTO dc_task_leases(task_id,agent,token,base_head,expires_at,worktree_path) VALUES(?,?,?,?,?,'') ON CONFLICT(task_id) DO UPDATE SET agent=excluded.agent,token=excluded.token,base_head=excluded.base_head,expires_at=excluded.expires_at,worktree_path=''")
          .run(id,agent.trim(),token,String(pending.base_head),expiry);
        this.audit(id,'file_verification_resumed',agent,{
          sourceDigest:delivery.submitted.digest,gate:pending.gate_name,gatePassed:false,
        });
        return {taskId:id,status:'in_review',leaseToken:token,
          originalCompletionHead:note.git_head,resumedVerification:true,
          evidenceKind:'files-sha256-v1'};
      });
    }
    return this.inTransaction(()=>{
      const pending=this.db.prepare(
        "SELECT * FROM dc_verification_deferrals WHERE task_id=? AND resumed_at IS NULL"
      ).get(id);
      if(!pending)fail("NOT_DEFERRED","Task has no pending verification");
      const task=this.requireTask(id);
      if(task.status!=="in_review")fail("NOT_IN_REVIEW","Task is no longer awaiting review");
      this.requireRootOnlyDeferral(id,task);
      if(this.db.prepare("SELECT task_id FROM dc_leases WHERE singleton=1").get())
        fail("LEASE_CONFLICT","Another task must release its lease before verification resumes");
      const head=git(this.root,["rev-parse","HEAD"]);
      if(!run(this.root,"git",["merge-base","--is-ancestor",pending.completion_head,head]).passed)
        fail("GIT_HISTORY_CHANGED","Deferred completion is no longer an ancestor of HEAD");
      const originals=committedFilesBetween(this.root,
        pending.base_head,pending.completion_head);
      const changed=committedFilesBetween(this.root,pending.completion_head,head);
      const overlaps=changed.filter(file=>originals.includes(file));
      const preservedPatch=overlaps.length>0&&
        frozenPatchStillPresent(this.root,pending.base_head,pending.completion_head);
      const needsReconciliation=overlaps.length>0&&!preservedPatch;
      if(needsReconciliation){
        if(!reconciliation||reconciliation.reviewedHead!==head||
          !Array.isArray(reconciliation.overlappingPaths)||
          JSON.stringify([...reconciliation.overlappingPaths].sort())!==
            JSON.stringify([...overlaps].sort())||
          typeof reconciliation.findings!=='string'||
          reconciliation.findings.trim().length<100||
          typeof reconciliation.evidenceReference!=='string'||
          reconciliation.evidenceReference.trim().length<15)
          fail('DEFERRED_CODE_CHANGED',
            'Overlapping committed code requires an exact current-HEAD Agent diff review, actual evidence reference and every affected file; frozen Gate is unchanged');
      }
      this.db.prepare(
        "UPDATE dc_verification_deferrals SET resumed_at=? WHERE task_id=?"
      ).run(utc(),id);
      const resumed=this.claim(id,agent,ttlSeconds,String(pending.base_head));
      if(needsReconciliation)this.audit(id,'deferred_overlap_reconciled',agent,{
        baseHead:pending.base_head,completionHead:pending.completion_head,
        currentHead:head,overlappingPaths:[...overlaps].sort(),
        findings:reconciliation!.findings.trim(),
        evidenceReference:reconciliation!.evidenceReference.trim(),
        gatePassed:false,
      });
      this.audit(id,"verification_resumed",agent,{
        originalBaseHead:pending.base_head,originalCompletionHead:pending.completion_head,
        currentHead:head,originalGate:pending.gate_name,
        originalPatchVerifiedOnSharedFiles:preservedPatch,
        explicitOverlapReconciliation:needsReconciliation,
      });
      return {...resumed,baseHead:pending.base_head,
        resumedVerification:true,originalCompletionHead:pending.completion_head};
    });
  }
  release(id: string, token: string): Row {
    return this.inTransaction(() => {
      const current = this.requireLease(id, token);
      this.requireGitWriter(id);
      const task = this.requireTask(id);
      if (task.status !== "in_progress") {
        fail("TASK_IN_REVIEW", "Task in review cannot be released without review resolution");
      }
      // Releasing discards the lease's base revision. Only permit it when no
      // Git commits or uncommitted changes could be orphaned.
      if(this.hasRootGit?
          git(this.root, ["rev-parse", "HEAD"]) !== current.base_head ||
            !!git(this.root, ["status", "--porcelain"]):
          !(this.fileDelivery(id)&&this.fileTaskChanges(
            this.fileDelivery(id)!.baseline,captureFileEvidence(this.root))
            .changed.length===0)) {
        fail("UNFINISHED_WORK", "Do not release after code changes; renew or reclaim this task instead");
      }
      this.clearTaskLease(id);
      this.db.prepare("UPDATE dc_tasks SET status='ready',updated_at=? WHERE id=?").run(utc(), id);
      this.audit(id, "lease_released", current.agent, { baseHead: current.base_head });
      return { taskId: id, status: "ready", released: true };
    });
  }

  /**
   * Preserve a previously committed task before approving a different,
   * already reviewed release-work incremental. This only pauses the task;
   * it neither approves new tasks nor widens its frozen file permissions.
   * All pre-existing tracked owner edits must be reported by exact path and
   * SHA-256; no staged/untracked files may be present. Git is not modified.
   */
  pauseForReviewedIncremental(input:{id:string;leaseToken:string;reason:string;
    expectedProposalHash:string;expectedReviewHash:string;
    existingDirtyFiles:{path:string;sha256:string}[]}):Row {
    if(typeof input.reason!=="string"||input.reason.trim().length<30)
      fail("PAUSE_REASON_REQUIRED","A substantial reason for preserving the partial work is required");
    return this.inTransaction(()=>{
      const lease=this.requireLease(input.id,input.leaseToken);
      this.requireGitWriter(input.id);
      const task=this.requireTask(input.id);
      if(task.status!=="in_progress")
        fail("TASK_NOT_IN_PROGRESS","Only an active unfinished task can pause");
      const pending=this.db.prepare(
        "SELECT * FROM dc_release_work_incrementals WHERE release=?",
      ).get(task.release);
      if(!pending||!pending.reviewed_json||
        pending.proposal_hash!==input.expectedProposalHash||
        pending.review_hash!==input.expectedReviewHash)
        fail("INCREMENTAL_REVIEW_REQUIRED","Exact reviewed incremental hashes required before pause");
      if(this.db.prepare("SELECT task_id FROM dc_scope_pauses WHERE task_id=? AND resumed_at IS NULL")
        .get(input.id))fail("SCOPE_ALREADY_PAUSED","Task already has a preserved Git base");
      if(this.latestCompletion(input.id)||
        this.db.prepare("SELECT id FROM dc_evidence WHERE task_id=? LIMIT 1").get(input.id)||
        this.db.prepare("SELECT task_id FROM dc_task_decisions WHERE task_id=?").get(input.id))
        fail("TASK_EVIDENCE_EXISTS","Resolve recorded completion/evidence before pause");
      const head=git(this.root,["rev-parse","HEAD"]);
      if(!run(this.root,"git",["merge-base","--is-ancestor",lease.base_head,head]).passed)
        fail("GIT_HISTORY_CHANGED","Original claimed base is not an ancestor of HEAD");
      const files=changedFiles(this.root,lease.base_head);
      const allowed=JSON.parse(task.allowed_paths) as string[];
      const denied=files.filter(file=>!allowed.some(pattern=>pathAllowed(file,pattern)));
      if(denied.length)fail("PAUSE_SCOPE_VIOLATION","Committed changes exceed original scope: "+denied.join(", "));
      if(git(this.root,["diff","--cached","--name-only"])||
        git(this.root,["ls-files","--others","--exclude-standard"]))
        fail("DIRTY_WORKTREE","No staged or untracked files may exist during an audited pause");
      const dirty=git(this.root,["diff","--name-only"]).split("\n").filter(Boolean).sort();
      const declarations=input.existingDirtyFiles;
      if(!Array.isArray(declarations)||declarations.some(item=>
        !item||typeof item.path!=="string"||typeof item.sha256!=="string"||
        !/^[0-9a-f]{64}$/.test(item.sha256)||path.isAbsolute(item.path)||
        item.path.split("/").includes("..")))
        fail("DIRTY_MANIFEST_REQUIRED","Complete safe relative paths and SHA-256 required");
      const declared=declarations.map(item=>item.path).sort();
      if(JSON.stringify(dirty)!==JSON.stringify(declared))
        fail("DIRTY_MANIFEST_MISMATCH","Exact dirty-file list differs from supplied owner-edit manifest");
      for(const item of declarations){
        const absolute=path.resolve(this.root,item.path);
        if(!absolute.startsWith(this.root+path.sep)||!fs.existsSync(absolute)||
          !fs.statSync(absolute).isFile()||
          createHash("sha256").update(fs.readFileSync(absolute)).digest("hex")!==item.sha256)
          fail("DIRTY_MANIFEST_MISMATCH","An existing uncommitted file changed since manifest capture");
      }
      if(!this.checkGovernedArtifacts().passed)
        fail("GOVERNED_ARTIFACT_CHANGED","An immutable architecture artifact changed");
      const now=utc();
      this.archiveResumedScopePause(input.id,lease.agent);
      this.db.prepare(`INSERT INTO dc_scope_pauses
        (task_id,release,proposal_hash,base_head,paused_head,
         changed_files_json,reason,paused_by,paused_at)
         VALUES(?,?,?,?,?,?,?,?,?)`).run(input.id,task.release,pending.proposal_hash,
        lease.base_head,head,JSON.stringify(files),input.reason.trim(),lease.agent,now);
      this.clearTaskLease(input.id);
      this.db.prepare("UPDATE dc_tasks SET status='ready',updated_at=? WHERE id=?")
        .run(now,input.id);
      this.audit(input.id,"incremental_review_pause",lease.agent,{
        proposalHash:pending.proposal_hash,reviewHash:pending.review_hash,
        originalBaseHead:lease.base_head,pausedHead:head,changedFiles:files,
        preservedDirtyFiles:declarations,reason:input.reason.trim(),
      });
      return {taskId:input.id,status:"ready",paused:true,reviewRequired:false,
        originalBaseHead:lease.base_head,pausedHead:head,
        proposalHash:pending.proposal_hash,changedFiles:files,
        untouchedExistingDirtyFiles:declarations.map(item=>item.path)};
    });
  }

  /**
   * Repair a mistaken claim of a task whose frozen scope expansion was
   * already staged. Preserve the complete original Git baseline and commits:
   * no cherry-pick, reset, deleted lease history or silent verification.
   * This only restores the task to Ready so genuine independent review and
   * exact Owner approval can proceed. It grants ZERO extra file permissions.
   */
  /** Archive the prior *resumed* row before another legitimate pause. */
  private archiveResumedScopePause(id:string,actor:string):void {
    const prior=this.db.prepare("SELECT * FROM dc_scope_pauses WHERE task_id=?")
      .get(id);
    if(!prior)return;
    if(!prior.resumed_at)
      fail("SCOPE_ALREADY_PAUSED","Cannot overwrite an unfinished scope pause");
    this.db.prepare(`INSERT INTO dc_scope_pause_history
      (task_id,prior_record_json,archived_at) VALUES(?,?,?)`)
      .run(id,JSON.stringify(prior),utc());
    this.db.prepare("DELETE FROM dc_scope_pauses WHERE task_id=? AND resumed_at IS NOT NULL")
      .run(id);
    this.audit(id,"previous_scope_pause_archived",actor,{
      priorProposalHash:prior.proposal_hash,
      priorBaseHead:prior.base_head,
      priorPausedHead:prior.paused_head,
      priorResumedAt:prior.resumed_at,
    });
  }

  pauseForScopeAmendment(id:string,token:string,reason:string,
    existingDirtyFiles?:{path:string;sha256:string}[]):Row {
    if(typeof reason!=="string"||reason.trim().length<20)
      fail("PAUSE_REASON_REQUIRED","Document why the claimed task must pause for a scoped amendment");
    return this.inTransaction(()=>{
      const lease=this.requireLease(id,token);
      this.requireGitWriter(id);
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
      const dirtyStatus=git(this.root,["status","--porcelain"]);
      if(dirtyStatus&&existingDirtyFiles===undefined)
        fail("DIRTY_WORKTREE","Commit or revert local changes before pausing");
      if(existingDirtyFiles!==undefined){
        // Reviewed scope alone grants ZERO authority to touch pre-existing
        // Owner edits. An exact, immutable tracked-file manifest may preserve
        // them without staging, stashing, resetting or changing the Git base.
        if(git(this.root,["diff","--cached","--name-only"])||
          git(this.root,["ls-files","--others","--exclude-standard"]))
          fail("DIRTY_WORKTREE","No staged/untracked files allowed with owner-edit manifest");
        if(!Array.isArray(existingDirtyFiles)||existingDirtyFiles.some(item=>
          !item||typeof item.path!=="string"||typeof item.sha256!=="string"||
          !/^[0-9a-f]{64}$/.test(item.sha256)||path.isAbsolute(item.path)||
          item.path.split("/").includes("..")))
          fail("DIRTY_MANIFEST_REQUIRED","Exact relative paths and SHA-256 hashes are required");
        const actual=git(this.root,["diff","--name-only"]).split("\n")
          .filter(Boolean).sort();
        const declared=existingDirtyFiles.map(item=>item.path).sort();
        if(JSON.stringify(actual)!==JSON.stringify(declared))
          fail("DIRTY_MANIFEST_MISMATCH","Actual dirty files differ from preserved owner manifest");
        for(const item of existingDirtyFiles){
          const target=path.resolve(this.root,item.path);
          if(!target.startsWith(this.root+path.sep)||!fs.existsSync(target)||
            !fs.lstatSync(target).isFile()||
            createHash("sha256").update(fs.readFileSync(target)).digest("hex")!==item.sha256)
            fail("DIRTY_MANIFEST_MISMATCH","Preserved owner file changed since manifest capture");
        }
      }
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
      this.archiveResumedScopePause(id,lease.agent);
      this.db.prepare(`INSERT INTO dc_scope_pauses
        (task_id,release,proposal_hash,base_head,paused_head,
         changed_files_json,reason,paused_by,paused_at)
         VALUES(?,?,?,?,?,?,?,?,?)`).run(id,task.release,pending.proposal_hash,
        lease.base_head,head,JSON.stringify(files),reason.trim(),lease.agent,now);
      this.clearTaskLease(id);
      this.db.prepare("UPDATE dc_tasks SET status='ready',updated_at=? WHERE id=?")
        .run(now,id);
      this.audit(id,"scope_paused_for_review",lease.agent,{
        release:task.release,proposalHash:pending.proposal_hash,
        originalBaseHead:lease.base_head,pausedHead:head,
        changedFiles:files,reason:reason.trim(),
        originalLeaseAgent:lease.agent,
        preservedDirtyFiles:existingDirtyFiles??[],
      });
      return {taskId:id,status:"ready",paused:true,reviewRequired:true,
        release:task.release,proposalHash:pending.proposal_hash,
        originalBaseHead:lease.base_head,pausedHead:head,changedFiles:files};
    });
  }

  /** Clear only this task. Never release another task's Git writer when a
   * parked review finishes while the other task is still being developed.
   */
  private clearTaskLease(id:string):void{
    this.db.prepare('DELETE FROM dc_task_leases WHERE task_id=?').run(id);
    this.db.prepare('DELETE FROM dc_leases WHERE task_id=?').run(id);
  }

  private requireGitWriter(id:string):void{
    const writer=this.checkoutWriter();
    if(writer?.task_id!==id)fail('GIT_WRITER_REQUIRED',
      'This task retains a review lease while another task owns the shared Git checkout; reclaim the writer before submitting a new code revision');
  }

  private requireLease(id: string, token: string,
    purpose:'write'|'review'='write'): Row {
    const row = this.db.prepare("SELECT * FROM dc_task_leases WHERE task_id=?").get(id)??
      this.db.prepare("SELECT * FROM dc_leases WHERE task_id=?").get(id);
    if (!row || row.token !== token) {
      fail("LEASE_REQUIRED", "Active task lease token required");
    }
    if(row.expires_at<=Date.now()){
      // Review owns no Git writer privilege. Keep the original authenticated
      // token usable after TTL if and only if a committed delivery is already
      // awaiting review. No new evidence/report/complete operation can use it.
      const task=purpose==='review'?this.requireTask(id):null;
      if(task?.status!=='in_review'||!this.latestCompletion(id))
        fail("LEASE_REQUIRED","Active writer lease token required; recover the original unfinished work");
    }
    if(String(row.worktree_path??'')!==
      (this.linkedWorktree?fs.realpathSync(this.root):''))
      fail('LEASE_WORKTREE_MISMATCH',
        'Manage the task in the original registered Git checkout that owns its committed evidence, not another worktree');
    return row!;
  }

  report(id: string, token: string, evidence: {
    kind:string; reference:string; deliveryHeads?:Record<string,string>;
  }, readyForReview = false): Row {
    if(!this.hasRootGit)return this.reportFileTask(id,token,evidence,readyForReview);
    return this.inTransaction(() => {
      const lease = this.requireLease(id, token);
      const current = this.requireTask(id);
      if(current.status==='in_progress')this.requireGitWriter(id);
      const deferred=this.db.prepare(`SELECT completion_head,completion_revision,resumed_at FROM dc_verification_deferrals
        WHERE task_id=?`).get(id);
      const completion=this.latestCompletion(id);
      const observedHead=git(this.root,['rev-parse','HEAD']);
      const resumedFrozen=current.status==='in_review'&&!!deferred?.resumed_at&&
        completion?.git_head===deferred.completion_head;
      const resumedNewRevision=current.status==='in_review'&&!!deferred?.resumed_at&&
        completion?.revision>deferred.completion_revision&&
        completion?.git_head===observedHead&&
        run(this.root,'git',['merge-base','--is-ancestor',
          deferred.completion_head,observedHead]).passed;
      const resumedEvidence=resumedFrozen||resumedNewRevision;
      if(current.status!=='in_progress'&&!resumedEvidence)
        fail('INVALID_STATE','Report during development or after an explicitly resumed verification');
      if (typeof evidence?.kind!=="string"||typeof evidence?.reference!=="string"||
        !evidence.kind.trim()||!evidence.reference.trim()||
        ["undefined","null"].includes(evidence.kind.trim().toLowerCase())||
        ["undefined","null"].includes(evidence.reference.trim().toLowerCase())) {
        fail("EVIDENCE_REQUIRED", "Evidence kind and reference required");
      }
      if(resumedFrozen)this.checkReviewDeliveryHead(id,String(lease.base_head),String(completion!.git_head));
      const observed=this.observedTaskRepositories(id,current);
      const multiRepo=observed.some(repo=>!!repo.prefix);
      if(multiRepo&&completion&&evidence.deliveryHeads!==undefined){
        const selected=this.selectDeliveryRepositories(current,observed,evidence.deliveryHeads);
        const frozen=this.frozenDeliveryRepositories(id,current);
        if(this.repositoryEvidenceDigest(id,selected)!==this.repositoryEvidenceDigest(id,frozen))
          fail('EVIDENCE_DELIVERY_HEADS_MISMATCH',
            'Reported deliveryHeads must equal the exact already completed version vector');
      }
      const repositories=multiRepo?(completion?
        this.frozenDeliveryRepositories(id,current):
        this.selectDeliveryRepositories(current,observed,evidence.deliveryHeads)):observed;
      const head=multiRepo?repositories.find(repo=>repo.prefix==='')!.head:
        resumedFrozen?String(completion!.git_head):observedHead;
      this.db.prepare(
        "INSERT INTO dc_evidence(task_id,kind,reference,git_head,created_at) VALUES(?,?,?,?,?)",
      ).run(id, evidence.kind, evidence.reference, head, utc());
      if(multiRepo){
        const row=this.db.prepare("SELECT id FROM dc_evidence WHERE task_id=? ORDER BY id DESC LIMIT 1").get(id);
        this.db.prepare(`INSERT INTO dc_evidence_repository_digests(evidence_id,digest)
          VALUES(?,?)`).run(row!.id,this.repositoryEvidenceDigest(id,repositories));
      }
      if (readyForReview) {
        this.db.prepare(
          "UPDATE dc_tasks SET status='in_review',updated_at=? WHERE id=?",
        ).run(utc(), id);
      }
      this.audit(id, "evidence_reported", lease.agent, {
        kind:evidence.kind,reference:evidence.reference,readyForReview,
        gitHead:head,observedHead,resumedVerification:resumedEvidence,
      });
      return this.get(id);
    });
  }

  /**
   * One-time migration for genuine test receipts recorded before v5 started
   * binding multi-Git evidence to the frozen completion vector. Never change
   * the old row or a Gate result: append a derived, provenance-linked receipt
   * only after checking the original report, exact frozen Git commits and a
   * real, SHA-256-verified test artifact inspected by the responsible Agent.
   *
   * This is NOT a report, a test run, or a Gate approval. It does not confer
   * permission to add evidence or modify an in_review delivery.
   */
  rebindLegacyEvidence(input:{
    id:string;leaseToken:string;actor:string;reason:string;
    evidenceReference:string;deliveryHeads:Record<string,string>;
    artifactPath:string;artifactSha256:string;findings:string;
  }):Row {
    const actor=String(input?.actor??'').trim();
    const reason=String(input?.reason??'').trim();
    const findings=String(input?.findings??'').trim();
    const reference=String(input?.evidenceReference??'').trim();
    const relative=String(input?.artifactPath??'').trim();
    const sha=String(input?.artifactSha256??'').trim().toLowerCase();
    if(actor.length<2||reason.length<40||reason.length>1200||
      findings.length<100||findings.length>4000||
      !reference||relative.length<4||relative.length>512||
      !/^[a-f0-9]{64}$/.test(sha))
      fail('LEGACY_EVIDENCE_PROOF_REQUIRED',
        'Provide original evidence reference, SHA-256 test artifact, responsible actor, concrete reason and substantive findings about original test output and every frozen Git commit');
    if(path.isAbsolute(relative)||relative.includes('\\')||
      relative.split('/').some(part=>!part||part==='.'||part==='..')||
      relative==='.git'||relative.startsWith('.git/'))
      fail('LEGACY_EVIDENCE_ARTIFACT_UNSAFE','Use a regular project-relative test artifact outside Git metadata');
    if(!this.hasRootGit)
      fail('LEGACY_EVIDENCE_MULTI_GIT_ONLY','File-delivery tasks have a separate evidence contract');
    return this.inTransaction(()=>{
      const lease=this.requireLease(input.id,input.leaseToken,'review');
      if(actor!==lease.agent)
        fail('LEGACY_EVIDENCE_REVIEWER_MISMATCH',
          'The original responsible Agent must inspect the preserved receipt; no new Owner or independent reviewer is required');
      const task=this.requireTask(input.id);
      const note=this.latestCompletion(input.id);
      if(task.status!=='in_review'||!note)
        fail('LEGACY_EVIDENCE_REVIEW_ONLY',
          'Only an already committed multi-repository task awaiting review may rebind a legacy receipt');
      const observed=this.observedTaskRepositories(input.id,task);
      if(!observed.some(repo=>!!repo.prefix))
        fail('LEGACY_EVIDENCE_MULTI_GIT_ONLY','Only existing multi-repository deliveries can use this migration');
      if(!input.deliveryHeads||typeof input.deliveryHeads!=='object'||
        Array.isArray(input.deliveryHeads))
        fail('LEGACY_EVIDENCE_DELIVERY_MISMATCH',
          'Supply the full, explicit, already frozen Git deliveryHeads map');
      this.requireChildReposClean(observed,input.id,task);
      this.checkReviewDeliveryHead(input.id,String(lease.base_head),String(note.git_head));
      const frozen=this.frozenDeliveryRepositories(input.id,task);
      const supplied=this.selectDeliveryRepositories(task,observed,input.deliveryHeads);
      const digest=this.repositoryEvidenceDigest(input.id,frozen);
      if(digest!==this.repositoryEvidenceDigest(input.id,supplied)||
        JSON.stringify(frozen)!==JSON.stringify(supplied))
        fail('LEGACY_EVIDENCE_DELIVERY_MISMATCH',
          'The complete provided HEAD map must equal the immutable committed delivery, not the current Git HEAD');
      const original=this.db.prepare(`SELECT e.id,e.kind,e.reference,e.git_head,e.created_at,
        d.digest FROM dc_evidence e
        LEFT JOIN dc_evidence_repository_digests d ON d.evidence_id=e.id
        LEFT JOIN dc_legacy_evidence_rebindings r ON r.derived_evidence_id=e.id
        WHERE e.task_id=? AND e.reference=? AND e.git_head=?
          AND r.derived_evidence_id IS NULL
        ORDER BY e.id DESC LIMIT 1`).get(input.id,reference,note.git_head);
      if(!original||!String(original.kind??'').trim())
        fail('LEGACY_EVIDENCE_MISSING',
          'Original, real, pre-existing task test receipt must match this exact completion HEAD and reference');
      if(original.digest===digest)
        fail('LEGACY_EVIDENCE_ALREADY_BOUND',
          'This receipt already covers the frozen repository vector; no migration or new test claim needed');
      const existing=this.db.prepare(`SELECT derived_evidence_id,repository_digest
        FROM dc_legacy_evidence_rebindings
        WHERE source_evidence_id=? AND completion_revision=?`)
        .get(original.id,note.revision);
      if(existing)
        fail('LEGACY_EVIDENCE_ALREADY_REBOUND',
          'A prior audited binding exists; do not create another receipt or overwrite its provenance');

      const workspace=fs.realpathSync(this.root);
      const lexical=path.resolve(this.root,relative);
      if(!lexical.startsWith(path.resolve(this.root)+path.sep))
        fail('LEGACY_EVIDENCE_ARTIFACT_UNSAFE','Test artifact is outside the project workspace');
      let stat:fs.Stats,real:string;
      try{
        stat=fs.lstatSync(lexical);
        real=fs.realpathSync(lexical);
      }catch{
        fail('LEGACY_EVIDENCE_ARTIFACT_MISSING',
          'Original test output must be available as a real local artifact; otherwise rerun tests');
      }
      if(!stat!.isFile()||stat!.isSymbolicLink()||stat!.size<32||
        stat!.size>8*1024*1024||
        real!==path.resolve(workspace,relative)||
        !real.startsWith(workspace+path.sep))
        fail('LEGACY_EVIDENCE_ARTIFACT_UNSAFE',
          'Legacy test proof must be a regular, non-symlink file inside this workspace (32 bytes to 8 MiB)');
      const actual=createHash('sha256').update(fs.readFileSync(real)).digest('hex');
      if(actual!==sha)
        fail('LEGACY_EVIDENCE_ARTIFACT_CHANGED',
          'Original test artifact content does not match its independently supplied SHA-256');
      const now=utc();
      this.db.prepare(`INSERT INTO dc_evidence
        (task_id,kind,reference,git_head,created_at) VALUES(?,?,?,?,?)`)
        .run(input.id,original.kind,reference,note.git_head,original.created_at);
      const derived=this.db.prepare(`SELECT id FROM dc_evidence
        WHERE task_id=? ORDER BY id DESC LIMIT 1`).get(input.id);
      this.db.prepare(`INSERT INTO dc_evidence_repository_digests
        (evidence_id,digest) VALUES(?,?)`).run(derived!.id,digest);
      this.db.prepare(`INSERT INTO dc_legacy_evidence_rebindings
        (derived_evidence_id,source_evidence_id,task_id,completion_revision,
         repository_digest,previous_digest,artifact_path,artifact_sha256,
         reviewer,findings,reason,bound_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(derived!.id,original.id,input.id,note.revision,digest,
          original.digest??null,relative,sha,actor,findings,reason,now);
      this.audit(input.id,'legacy_test_evidence_repository_rebound',actor,{
        sourceEvidenceId:original.id,derivedEvidenceId:derived!.id,
        originalEvidenceKind:original.kind,originalEvidenceReference:reference,
        originalGitHead:note.git_head,originalDigest:original.digest??null,
        frozenDigest:digest,deliveryHeads:input.deliveryHeads,
        completionRevision:note.revision,artifactPath:relative,
        artifactSha256:sha,findings,reason,
        originalEvidenceUnchanged:true,testsExecuted:false,gateApproved:false,
      });
      return {taskId:input.id,derivedEvidenceId:derived!.id,
        sourceEvidenceId:original.id,repositoryDigest:digest,
        evidenceRebound:true,testsExecuted:false,gateApproved:false,
        nextAction:'verify with substantive acceptance and actual Gate findings'};
    });
  }

  /** Record NEW tests run by the host Agent against the unchanged frozen
   * multi-repository checkout vector. This does not execute tests, mutate
   * any Git checkout, re-open development or approve a Gate. In particular,
   * an expired writer TTL does not block the original review token here.
   *
   * Requiring each physical test checkout's exact HEAD and a clean tracked
   * index avoids mistaking a descendant checkout (with altered dependencies)
   * for the frozen code merely because the task's test file is unchanged.
   */
  recordRerunEvidence(input:{
    id:string;leaseToken:string;actor:string;reason:string;
    supersedesEvidenceId:number;deliveryHeads:Record<string,string>;
    testedCheckouts:Record<string,string>;commandCwd:string;
    command:string;exitCode:number;artifactPath:string;
    artifactSha256:string;findings:string;
  }):Row {
    const actor=String(input?.actor??'').trim();
    const reason=String(input?.reason??'').trim();
    const findings=String(input?.findings??'').trim();
    const command=String(input?.command??'').trim();
    const commandCwd=String(input?.commandCwd??'').trim();
    const artifactPath=String(input?.artifactPath??'').trim();
    const sha=String(input?.artifactSha256??'').trim().toLowerCase();
    const originalId=input?.supersedesEvidenceId;
    if(!Number.isSafeInteger(originalId)||originalId<1||
      actor.length<2||reason.length<40||reason.length>1200||
      findings.length<100||findings.length>4000||
      command.length<12||command.length>2000||
      !Number.isSafeInteger(input?.exitCode)||input.exitCode<0||
      input.exitCode>255||!/^[a-f0-9]{64}$/.test(sha))
      fail('RERUN_EVIDENCE_REQUIRED',
        'Provide an original evidence ID, responsible actor, concrete reason, real test command, 0–255 exit code, SHA-256 log and detailed findings');
    if(!this.hasRootGit)
      fail('RERUN_MULTI_GIT_ONLY','Use the immutable file manifest protocol in projects without Git');
    const validRelative=(value:unknown):value is string=>
      typeof value==='string'&&value.length>0&&value.length<=512&&
      !path.isAbsolute(value)&&!value.includes('\\')&&
      value.split('/').every(part=>!!part&&part!=='.'&&part!=='..')&&
      value!=='.git'&&!value.startsWith('.git/');
    if(!validRelative(commandCwd)||!validRelative(artifactPath))
      fail('RERUN_PATH_UNSAFE','Use real project-relative test checkout and artifact paths');
    if(!input.deliveryHeads||typeof input.deliveryHeads!=='object'||
      Array.isArray(input.deliveryHeads)||
      !input.testedCheckouts||typeof input.testedCheckouts!=='object'||
      Array.isArray(input.testedCheckouts))
      fail('RERUN_CHECKOUTS_REQUIRED',
        'Provide the complete frozen deliveryHeads and the physical checkout path for every Git repository');
    return this.inTransaction(()=>{
      const lease=this.requireLease(input.id,input.leaseToken,'review');
      if(actor!==lease.agent)
        fail('RERUN_AGENT_MISMATCH',
          'The existing responsible developer must inspect and register this test rerun');
      const task=this.requireTask(input.id);
      const note=this.latestCompletion(input.id);
      if(task.status!=='in_review'||!note)
        fail('RERUN_REVIEW_ONLY',
          'Only an already completed multi-Git delivery awaiting review can record rerun evidence');
      const observed=this.observedTaskRepositories(input.id,task);
      if(!observed.some(repo=>!!repo.prefix))
        fail('RERUN_MULTI_GIT_ONLY','Rerun replacement requires a frozen multi-repository delivery');
      this.checkReviewDeliveryHead(input.id,String(lease.base_head),String(note.git_head));
      const frozen=this.frozenDeliveryRepositories(input.id,task);
      const selected=this.selectDeliveryRepositories(task,observed,input.deliveryHeads);
      const digest=this.repositoryEvidenceDigest(input.id,frozen);
      if(digest!==this.repositoryEvidenceDigest(input.id,selected)||
        JSON.stringify(frozen)!==JSON.stringify(selected))
        fail('RERUN_DELIVERY_MISMATCH',
          'The full supplied Git vector differs from the frozen delivery; do not test descendant code and claim original evidence');
      const original=this.db.prepare(`SELECT e.id,e.kind,e.reference,e.git_head
        FROM dc_evidence e WHERE e.id=? AND e.task_id=?`)
        .get(originalId,input.id);
      if(!original||original.git_head!==note.git_head)
        fail('RERUN_SOURCE_EVIDENCE_MISSING',
          'supersedesEvidenceId must refer to an existing receipt from this exact completed task');
      const existing=this.db.prepare(`SELECT id FROM dc_rerun_test_receipts
        WHERE task_id=? AND completion_revision=? AND
          supersedes_evidence_id=? AND artifact_sha256=? AND command=?`)
        .get(input.id,note.revision,originalId,sha,command);
      if(existing)fail('RERUN_ALREADY_RECORDED',
        'This exact rerun output and command are already recorded against the frozen delivery');

      const workspace=fs.realpathSync(this.root);
      const safeFile=(relative:string):string=>{
        if(!validRelative(relative))
          fail('RERUN_PATH_UNSAFE','Test proof path contains unsafe segments');
        const lexical=path.resolve(this.root,relative);
        if(!lexical.startsWith(path.resolve(this.root)+path.sep))
          fail('RERUN_PATH_UNSAFE','Test proof escaped the project workspace');
        let stat:fs.Stats,real:string;
        try{stat=fs.lstatSync(lexical);real=fs.realpathSync(lexical);}
        catch{fail('RERUN_ARTIFACT_MISSING','Keep the actual rerun output on disk until it has been audited');}
        if(!stat!.isFile()||stat!.isSymbolicLink()||stat!.size<32||
          stat!.size>8*1024*1024||real!==path.resolve(workspace,relative)||
          !real.startsWith(workspace+path.sep))
          fail('RERUN_ARTIFACT_UNSAFE',
            'Rerun output must be a regular, non-symlink project file of 32 bytes to 8 MiB');
        return real;
      };
      const artifact=safeFile(artifactPath);
      const artifactDigest=createHash('sha256').update(fs.readFileSync(artifact)).digest('hex');
      if(artifactDigest!==sha)
        fail('RERUN_ARTIFACT_CHANGED','Rerun output SHA-256 differs from the supplied test log hash');

      if(Object.keys(input.testedCheckouts).length!==frozen.length||
        frozen.some(repo=>!validRelative(input.testedCheckouts[repo.prefix]??'')))
        fail('RERUN_CHECKOUTS_REQUIRED',
          'Supply one existing project-relative Git test checkout for every frozen repository, including root');
      const physical=new Set<string>();
      for(const repo of frozen){
        const relative=input.testedCheckouts[repo.prefix];
        const lexical=path.resolve(this.root,relative);
        let real:string,stat:fs.Stats;
        try{real=fs.realpathSync(lexical);stat=fs.lstatSync(lexical);}
        catch{fail('RERUN_CHECKOUT_MISSING',
          'Create an isolated detached Git worktree at the frozen commit before rerunning real project tests');}
        if(!stat!.isDirectory()||stat!.isSymbolicLink()||
          real!==path.resolve(workspace,relative)||
          !real.startsWith(workspace+path.sep)||physical.has(real))
          fail('RERUN_CHECKOUT_UNSAFE','Each Git test checkout must be a unique real directory within the project workspace');
        physical.add(real);
        const toplevel=git(real,['rev-parse','--show-toplevel']);
        if(fs.realpathSync(toplevel)!==real)
          fail('RERUN_CHECKOUT_NESTED',
            'The declared checkout must be the root of an independent Git repository or linked worktree');
        if(git(real,['rev-parse','HEAD'])!==repo.head)
          fail('RERUN_CHECKOUT_HEAD_CHANGED',
            'Test checkout HEAD differs from the immutable frozen delivery; use exact detached commits, not descendant code');
        const sourcePath=path.join(this.root,repo.prefix);
        const commonDir=(repoRoot:string)=>fs.realpathSync(path.resolve(repoRoot,
          git(repoRoot,['rev-parse','--git-common-dir'])));
        if(commonDir(real)!==commonDir(sourcePath))
          fail('RERUN_REPOSITORY_MISMATCH',
            'The frozen test checkout must belong to the original independent Git repository, not an unrelated clone with a matching SHA');
        if(git(real,['status','--porcelain','--untracked-files=normal']))
          fail('RERUN_CHECKOUT_DIRTY',
            'Test checkout has tracked, staged or untracked source changes; only ignored generated test output may differ from the frozen source');
      }
      if(!Object.values(input.testedCheckouts).includes(commandCwd))
        fail('RERUN_COMMAND_CWD_INVALID',
          'Actual test command working directory must be one of the frozen physical Git checkouts');
      const evidenceReference='rerun:'+createHash('sha256').update(
        JSON.stringify([input.id,note.revision,originalId,digest,command,sha]),
      ).digest('hex');
      const now=utc();
      let evidenceId:number|null=null;
      // A non-zero exit code is important historical test evidence, never
      // an eligible dc_evidence proof for a passing project Gate.
      if(input.exitCode===0){
        this.db.prepare(`INSERT INTO dc_evidence
          (task_id,kind,reference,git_head,created_at) VALUES(?,?,?,?,?)`)
          .run(input.id,original.kind,evidenceReference,note.git_head,now);
        const evidence=this.db.prepare(`SELECT id FROM dc_evidence
          WHERE task_id=? ORDER BY id DESC LIMIT 1`).get(input.id);
        evidenceId=Number(evidence!.id);
        this.db.prepare(`INSERT INTO dc_evidence_repository_digests
          (evidence_id,digest) VALUES(?,?)`).run(evidenceId,digest);
      }
      this.db.prepare(`INSERT INTO dc_rerun_test_receipts
        (task_id,completion_revision,supersedes_evidence_id,new_evidence_id,
         repository_digest,command,command_cwd,tested_checkouts_json,exit_code,
         artifact_path,artifact_sha256,actor,reason,findings,recorded_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(input.id,note.revision,
        originalId,evidenceId,digest,command,commandCwd,
        JSON.stringify(input.testedCheckouts),input.exitCode,
        artifactPath,sha,actor,reason,findings,now);
      this.audit(input.id,'real_test_rerun_recorded',actor,{
        sourceEvidenceId:originalId,newEvidenceId:evidenceId,
        evidenceReference:input.exitCode===0?evidenceReference:null,
        completionRevision:note.revision,frozenDeliveryHeads:input.deliveryHeads,
        repositoryDigest:digest,testedCheckouts:input.testedCheckouts,
        commandCwd,command,exitCode:input.exitCode,
        artifactPath,artifactSha256:sha,reason,findings,
        originalEvidenceUnchanged:true,testsExecutedByMcp:false,gateApproved:false,
      });
      return {taskId:input.id,supersedesEvidenceId:originalId,
        evidenceId,evidenceReference:evidenceId===null?null:evidenceReference,
        repositoryDigest:digest,exitCode:input.exitCode,passedTest:input.exitCode===0,
        testsExecutedByMcp:false,gateApproved:false,
        nextAction:input.exitCode===0?'verify with substantive original Gate acceptance':
          'Inspect failed test logs and rerun the real test; the failed receipt cannot approve a Gate'};
    });
  }

  /**
   * Agent executes business tests; MCP records the declared result and an
   * independent review tied to a reported artifact and exact Git revision.
   * An evidence reference without a reviewer conclusion is never a pass.
   */
  reviewExternalGate(id: string, token: string, input: {
    gate: string; evidenceReference: string; runner: string;
    reviewer: string; outcome: "passed" | "failed"; reviewNotes: string;
    reviewMode?:'self';
  }): Row {
    const lease = this.requireLease(id, token,'review');
    const task = this.requireTask(id);
    if (task.status !== "in_review") fail("NOT_IN_REVIEW", "Complete and report evidence before external review");
    const planned = JSON.parse(task.required_gates) as string[];
    if (!isEvidenceGate(input?.gate) || !planned.includes(input.gate)) {
      fail("GATE_NOT_DECLARED", "Gate review must match a frozen acceptance requirement; SQLite decision records use their own internal audit");
    }
    const completed=this.latestCompletion(id);
    const selfReview=this.db.prepare(`SELECT reviewer,outcome,completion_head
      FROM dc_task_review_handoffs WHERE task_id=?`).get(id);
    const isOwnReview=input.reviewMode==='self'&&input.reviewer===lease.agent&&
      selfReview?.outcome==='passed'&&selfReview?.reviewer===lease.agent&&
      selfReview?.completion_head===completed?.git_head;
    if (!["passed", "failed"].includes(input.outcome) ||
        !input.evidenceReference?.trim() ||
        !input.runner?.trim() ||
        !input.reviewer?.trim() ||
        (!isOwnReview&&(input.reviewer===input.runner||input.reviewer===lease.agent))||
        !input.reviewNotes?.trim() ||
        input.reviewNotes.trim().length < (isOwnReview?60:25)) {
      fail('GATE_REVIEW_REQUIRED',
        'Require an actual runner, an explicit developer self-review or separate reviewer, pass/fail, and substantive findings');
    }
    const completion = this.latestCompletion(id);
    if(!completion)fail('COMPLETION_REVISION_REQUIRED','Register the real completed delivery before Gate review');
    const observedHead=this.checkReviewDeliveryHead(id,String(lease.base_head),String(completion.git_head));
    const head=String(completion.git_head);
    const evidence = this.db.prepare(
      "SELECT id FROM dc_evidence WHERE task_id=? AND reference=? AND git_head=? ORDER BY id DESC LIMIT 1",
    ).get(id, input.evidenceReference.trim(), head);
    if (!evidence) fail("EVIDENCE_NOT_REPORTED", "Review must cite separately reported evidence for this exact Git revision");
    const observed=this.observedTaskRepositories(id,task);
    const multiRepo=observed.some(repo=>!!repo.prefix);
    const repositories=multiRepo?this.frozenDeliveryRepositories(id,task):observed;
    const snapshot=this.db.prepare(`SELECT digest FROM dc_completion_repository_revisions
      WHERE task_id=? AND revision=?`).get(id,completion.revision);
    if(multiRepo){
      const digest=this.repositoryEvidenceDigest(id,repositories);
      const reported=this.db.prepare(`SELECT digest FROM dc_evidence_repository_digests
        WHERE evidence_id=?`).get(evidence.id);
      if(!snapshot||snapshot.digest!==digest||reported?.digest!==digest)
        fail("REPOSITORY_EVIDENCE_STALE",
          "Reported Git evidence must match the exact committed HEAD of every scoped repository");
    }
    return this.inTransaction(() => {
      this.db.prepare(`INSERT INTO dc_external_gate_reviews
        (task_id,gate_name,lease_token_hash,git_head,evidence_reference,
         runner,reviewer,outcome,review_notes,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(task_id,gate_name) DO UPDATE SET
          lease_token_hash=excluded.lease_token_hash,git_head=excluded.git_head,
          evidence_reference=excluded.evidence_reference,runner=excluded.runner,
          reviewer=excluded.reviewer,outcome=excluded.outcome,
          review_notes=excluded.review_notes,created_at=excluded.created_at`
      ).run(id,input.gate,createHash("sha256").update(token).digest("hex"),head,
        input.evidenceReference.trim(),input.runner,input.reviewer,input.outcome,
        input.reviewNotes.trim(),utc());
      if(multiRepo)this.db.prepare(`INSERT INTO dc_external_gate_repository_digests
        (task_id,gate_name,digest) VALUES(?,?,?)
        ON CONFLICT(task_id,gate_name) DO UPDATE SET digest=excluded.digest`)
        .run(id,input.gate,String(snapshot!.digest));
      this.audit(id,isOwnReview?'developer_gate_self_reviewed':'external_gate_reviewed',input.reviewer,{
        gate:input.gate,outcome:input.outcome,gitHead:head,observedHead,
        evidenceReference:input.evidenceReference,runner:input.runner,
        reportedBy:lease.agent,reviewMode:isOwnReview?'developer_self_review':'independent',
      });
      return {taskId:id,gate:input.gate,outcome:input.outcome,gitHead:head,
        reviewer:input.reviewer,evidenceReference:input.evidenceReference,
        note:'Recorded an auditable project test review; no tests executed by MCP'};
    });
  }

  // Gate names are project acceptance requirements. No test executors
  // belong in DevControl; agents and the project's CI run their own tests.
  // DevControl verifies version-bound, substantively reviewed evidence.

  /** Validate one real, substantive developer acceptance against the exact
   * submitted delivery. This is the canonical new workflow; the old
   * self-review/gate-review records are backward-compatible input only.
   * Must be called within the same transaction as verify() so no partial
   * three-step review states can trap a different project.
   */
  private recordTaskAcceptance(id:string,token:string,input:TaskAcceptance):void{
    const lease=this.requireLease(id,token,'review');
    const task=this.requireTask(id);
    const note=this.latestCompletion(id);
    if(task.status!=='in_review'||!note)
      fail('TASK_DELIVERY_REQUIRED',
        'An atomic task needs its committed completion and real reported tests before acceptance');
    if(!input||typeof input.findings!=='string'||input.findings.trim().length<60||
      typeof input.evidenceReference!=='string'||!input.evidenceReference.trim()||
      !Array.isArray(input.gates))
      fail('TASK_ACCEPTANCE_REQUIRED',
        'Current developer must provide substantive technical findings, reported test reference and each declared Gate result');
    this.checkReviewDeliveryHead(id,String(lease.base_head),String(note.git_head));
    const planned=JSON.parse(task.required_gates) as string[];
    if(!planned.length||planned.some(g=>!isEvidenceGate(g))||
      input.gates.length!==planned.length||
      new Set(input.gates.map(g=>g.gate)).size!==planned.length||
      planned.some(g=>!input.gates.some(review=>review.gate===g)))
      fail('TASK_ACCEPTANCE_GATES_REQUIRED',
        'One acceptance report must account for every frozen project test Gate; internal decision tasks keep their existing contract');
    const observed=this.observedTaskRepositories(id,task);
    const multiRepo=observed.some(repo=>!!repo.prefix);
    const repositories=multiRepo?this.frozenDeliveryRepositories(id,task):observed;
    const expectedDigest=multiRepo?this.repositoryEvidenceDigest(id,repositories):null;
    if(multiRepo){
      this.requireChildReposClean(observed,id,task);
      const frozen=this.db.prepare(`SELECT digest FROM dc_completion_repository_revisions
        WHERE task_id=? AND revision=?`).get(id,note.revision);
      if(!frozen||frozen.digest!==expectedDigest)
        fail('REPOSITORY_EVIDENCE_STALE','Acceptance needs the exact committed child Git repository versions');
    }
    const requireEvidence=(reference:string)=>{
      if(typeof reference!=='string'||!reference.trim())
        fail('TASK_ACCEPTANCE_EVIDENCE_REQUIRED','Every test Gate needs a real reported evidence reference');
      const evidence=this.db.prepare(`SELECT id FROM dc_evidence
        WHERE task_id=? AND reference=? AND git_head=? ORDER BY id DESC LIMIT 1`)
        .get(id,reference.trim(),note.git_head);
      if(!evidence)fail('TASK_ACCEPTANCE_EVIDENCE_MISSING',
        'Run the real project tests and report evidence for the exact committed delivery before acceptance');
      if(multiRepo){
        const reported=this.db.prepare(`SELECT digest FROM dc_evidence_repository_digests
          WHERE evidence_id=?`).get(evidence.id);
        if(reported?.digest!==expectedDigest)
          fail('REPOSITORY_EVIDENCE_STALE',
            'The test receipt must cover every frozen Git repository in this atomic task');
      }
    };
    requireEvidence(input.evidenceReference);
    for(const review of input.gates){
      if(!review||typeof review.findings!=='string'||review.findings.trim().length<30)
        fail('TASK_ACCEPTANCE_FINDINGS_REQUIRED',
          'Each frozen Gate needs the developer\'s concrete findings about actual project test results');
      requireEvidence(review.evidenceReference);
    }
    const old=this.db.prepare('SELECT completion_revision,completion_head FROM dc_task_acceptances WHERE task_id=?')
      .get(id);
    if(old&&(old.completion_revision!==note.revision||old.completion_head!==note.git_head))
      fail('TASK_ACCEPTANCE_REVISION_CHANGED',
        'The original delivery was amended; its previous acceptance cannot be reused');
    const reviewed={
      evidenceReference:input.evidenceReference.trim(),findings:input.findings.trim(),
      gates:input.gates.map(g=>({
        gate:g.gate,evidenceReference:g.evidenceReference.trim(),findings:g.findings.trim(),
      })),
    };
    this.db.prepare(`INSERT INTO dc_task_acceptances
      (task_id,completion_revision,completion_head,lease_token_hash,reviewer,
        findings,evidence_reference,gates_json,accepted_at)
      VALUES(?,?,?,?,?,?,?,?,?)
      ON CONFLICT(task_id) DO UPDATE SET
        completion_revision=excluded.completion_revision,completion_head=excluded.completion_head,
        lease_token_hash=excluded.lease_token_hash,reviewer=excluded.reviewer,
        findings=excluded.findings,evidence_reference=excluded.evidence_reference,
        gates_json=excluded.gates_json,accepted_at=excluded.accepted_at`)
      .run(id,note.revision,note.git_head,createHash('sha256').update(token).digest('hex'),
        lease.agent,reviewed.findings,reviewed.evidenceReference,
        JSON.stringify(reviewed.gates),utc());
  }

  verify(id: string, token: string, acceptance?:TaskAcceptance): Row {
    if(!this.hasRootGit)return this.verifyFileTask(id,token,acceptance);
    if(acceptance!==undefined){
      try{
        return this.inTransaction(()=>{
          const actor=this.requireLease(id,token,'review').agent;
          this.recordTaskAcceptance(id,token,acceptance);
          const result=this.verify(id,token);
          if(!result.passed)throw new AcceptanceRejected(result);
          this.audit(id,'developer_atomic_acceptance',actor,{
            // Reviewer and exact version live in dc_task_acceptances. A
            // single acceptance does not pretend that MCP executed tests.
            reviewMode:'responsible_developer',passed:true,
          });
          return {...result,acceptanceMode:'single_developer_atomic',
            acceptanceRecorded:true};
        });
      }catch(error){
        if(error instanceof AcceptanceRejected)return error.result;
        throw error;
      }
    }
    const lease = this.requireLease(id, token,'review');
    const task = this.requireTask(id);
    if (task.status !== "in_review") fail("NOT_IN_REVIEW", "Submit evidence and request review first");
    // Plans imported through the v5 approval process need explicit substantive
    // review, but the developer may perform it; a second Agent is optional.
    const reviewedPlan=String(task.plan_id??'').startsWith('release-work:')||
      String(task.plan_id??'').startsWith('feature:');
    const noteForAcceptance=this.latestCompletion(id);
    const unified=this.db.prepare(`SELECT * FROM dc_task_acceptances
      WHERE task_id=?`).get(id);
    const tokenHash=createHash('sha256').update(token).digest('hex');
    const unifiedValid=!!unified&&!!noteForAcceptance&&
      unified.completion_revision===noteForAcceptance.revision&&
      unified.completion_head===noteForAcceptance.git_head&&
      unified.lease_token_hash===tokenHash&&unified.reviewer===lease.agent;
    if(reviewedPlan&&!unifiedValid){
      const review=this.db.prepare("SELECT outcome,completion_revision,completion_head FROM dc_task_review_handoffs WHERE task_id=?").get(id);
      const latest=this.latestCompletion(id);
      if(!review||review.outcome!=='passed'||!latest||
        review.completion_revision!==latest.revision||
        review.completion_head!==latest.git_head)
        return {taskId:id,passed:false,reason:'TASK_REVIEW_REQUIRED',
          detail:'The responsible Agent must review the exact committed delivery and real test evidence before acceptance'};
    }
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
    if(this.linkedWorktree&&
      !run(this.projectRoot,'git',['merge-base','--is-ancestor',
        String(note.git_head),'HEAD']).passed)
      return {taskId:id,passed:false,reason:'WORKTREE_DELIVERY_NOT_INTEGRATED',
        detail:'The current AI must integrate this exact committed task delivery into the canonical Git branch before DevControl can record Verified. This does not pass project tests.'};
    const observed=this.observedTaskRepositories(id,task);
    const multiRepo=observed.some(repo=>!!repo.prefix);
    let repositories=observed;
    if(multiRepo){
      try{repositories=this.frozenDeliveryRepositories(id,task);}
      catch(error){return {taskId:id,passed:false,
        reason:'Exact delivered Git versions no longer valid',error:String(error)};}
    }
    const completedRepos=this.db.prepare(`SELECT snapshot_json,digest
      FROM dc_completion_repository_revisions WHERE task_id=? AND revision=?`)
      .get(id,note.revision);
    const repoDigest=multiRepo?this.repositoryEvidenceDigest(id,repositories):'';
    if(multiRepo){
      if(!completedRepos||completedRepos.digest!==repoDigest||
        JSON.stringify(repositories)!==JSON.stringify(this.relocatedRepositories(id,
          JSON.parse(String(completedRepos.snapshot_json)))))
        return {taskId:id,passed:false,
          reason:"Scoped child Git HEAD or repository identity changed since task completion"};
      try{this.requireChildReposClean(observed,id,task);}
      catch(error){return {taskId:id,passed:false,
        reason:"Child Git repository contains uncommitted changes",error:String(error)};}
    }
    const deferred=this.db.prepare(
      "SELECT * FROM dc_verification_deferrals WHERE task_id=? AND resumed_at IS NOT NULL",
    ).get(id);
    const frozenReview=deferred&&note.git_head===deferred.completion_head;
    if(multiRepo&&frozenReview){
      try{this.requireRootOnlyDeferral(id,task);}
      catch(error){return {taskId:id,passed:false,
        reason:'Deferred delivery repository safety check failed',error:String(error)};}
    }
    if (note.git_head !== startHead && !frozenReview&&!multiRepo) {
      try{this.checkReviewDeliveryHead(id,String(lease.base_head),String(note.git_head));}
      catch(error){return {taskId:id,passed:false,
        reason:"Delivered task files changed or original commit is unavailable",
        error:String(error)};}
    }
    if(frozenReview){
      if(!run(this.root,"git",["merge-base","--is-ancestor",deferred.completion_head,startHead]).passed)
        return {taskId:id,passed:false,reason:"Frozen submitted code is not in Git history"};
      const previousFiles=committedFilesBetween(this.root,
        deferred.base_head,deferred.completion_head);
      const laterFiles=committedFilesBetween(this.root,deferred.completion_head,startHead);
      const overlaps=laterFiles.filter(file=>previousFiles.includes(file));
      if(overlaps.length&&
        !frozenPatchStillPresent(this.root,deferred.base_head,deferred.completion_head)&&
        !this.hasReviewedDeferredOverlap(id,deferred.base_head,
          deferred.completion_head,startHead,overlaps))
        return {taskId:id,passed:false,
          reason:"Deferred task files changed after the original delivery; new scoped review required"};
    }
    // Completion freezes one of two mutually exclusive Owner-edit manifests.
    // Do not re-apply the legacy tracked-only checker to a valid complete()
    // SHA-256 snapshot: it would reject every unrelated untracked file, even
    // though complete() and defer-verification already protected their bytes.
    const preserved=JSON.parse(note.preserved_dirty_json??"[]") as Array<{path:string;sha256:string}>;
    // Read-only normalization of one historical SQLite wrapper is necessary
    // both at claim and at completion. A malformed or nonempty manifest can
    // never be silently treated as an empty Owner snapshot.
    const preservedWorktree=parseProtectedWorktreeSnapshot(
      note.preserved_worktree_json??'[]',
      'dc_completion_notes.preserved_worktree_json');
    const protectedEditsAreStable=():boolean=>{
      try{
        if(frozenReview&&this.hasReviewedDeferredWorktree(id,note.git_head,startHead))
          return true;
        if(preservedWorktree.length){
          const allowed=JSON.parse(task.allowed_paths) as string[];
          const current=preservedWorktreeSnapshot(this.root,allowed);
          const expected=worktreeSnapshotWithLocalExemptions(
            this.root,preservedWorktree,allowed);
          if(!frozenReview&&
              JSON.stringify(current)!==JSON.stringify(expected))
            return false;
        }else{
          this.checkPreservedOwnerEdits(task,preserved,lease.base_head);
        }
        return true;
      }catch{return false;}
    };
    try{
      if(!protectedEditsAreStable())
        fail("WORKTREE_CHANGED",
          "Uncommitted source differs from the completion SHA-256 snapshot");
    }catch(error){
      return {taskId:id,passed:false,reason:
        "Uncommitted files differ from the recorded protected Owner edits",error:String(error)};
    }
    if (!run(this.root, "git", ["merge-base", "--is-ancestor", lease.base_head, startHead]).passed) {
      return { taskId: id, passed: false, reason: "Claim baseline is not an ancestor of HEAD" };
    }
    const incrementalBase=!frozenReview&&deferred&&
      note.revision>deferred.completion_revision?
      this.resumedDeliveryBase(id,String(lease.base_head),startHead):null;
    const parkedFiles=!multiRepo&&!frozenReview?
      this.parkedDeliveryFiles(id,String(lease.base_head),String(note.git_head)):null;
    const rawFiles = parkedFiles??(multiRepo?committedChanges(this.root,repositories):frozenReview ?
      committedFilesBetween(this.root,deferred.base_head,deferred.completion_head) :
      note.git_head!==startHead ?
        committedFilesBetween(this.root,incrementalBase??lease.base_head,String(note.git_head)):
        changedFiles(this.root,incrementalBase??lease.base_head));
    const files=this.deliveryTaskFiles(rawFiles,
      multiRepo?repositories.find(repo=>repo.prefix==='')!.baseHead:incrementalBase??lease.base_head,
      multiRepo?note.git_head:note.git_head!==startHead?String(note.git_head):startHead);
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
    const parkedAdded=!multiRepo&&!frozenReview?
      this.parkedDeliveryFiles(id,String(lease.base_head),String(note.git_head),'A'):null;
    const added=parkedAdded??(multiRepo?committedChanges(this.root,repositories,'A'):frozenReview ?
      committedFilesBetween(this.root,deferred.base_head,deferred.completion_head,"A") :
      note.git_head!==startHead ?
        committedFilesBetween(this.root,incrementalBase??lease.base_head,String(note.git_head),"A"):
        addedFiles(this.root, incrementalBase??lease.base_head));
    const unapprovedDocs = undocumentedMarkdown(added.filter(file=>files.includes(file)), allowedPaths);
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
    const results:Record<string,Row> = Object.fromEntries(gates.map((name) => {
      if (name === "sqlite_decision") return [name,{passed:true,taskId:id,
        revision:recorded!.revision,status:recorded!.status,productApproval:"not_implied"}];
      if (isEvidenceGate(name)) {
        if(unifiedValid){
          const reviewedGates=JSON.parse(String(unified.gates_json)) as Array<{
            gate:string;evidenceReference:string;findings:string}>;
          const found=reviewedGates.find(g=>g.gate===name);
          const valid=!!found&&found.findings.length>=30&&
            !!this.db.prepare(`SELECT id FROM dc_evidence
              WHERE task_id=? AND reference=? AND git_head=? LIMIT 1`)
              .get(id,found?.evidenceReference??'',note.git_head)&&
            (!multiRepo||!!this.db.prepare(`SELECT 1 FROM dc_evidence e
              JOIN dc_evidence_repository_digests rd ON rd.evidence_id=e.id
              WHERE e.task_id=? AND e.reference=? AND e.git_head=?
                AND rd.digest=? LIMIT 1`)
              .get(id,found?.evidenceReference??'',note.git_head,repoDigest));
          return [name,{passed:valid,evidenceBased:true,
            reason:valid?'Developer reviewed actual project evidence against frozen Gate and delivery':
              'Acceptance does not match the exact Gate test evidence'}];
        }
        const result = this.db.prepare(
          "SELECT * FROM dc_external_gate_reviews WHERE task_id=? AND gate_name=?",
        ).get(id,name);
        const targetHead=String(note.git_head);
        const taskReview=this.db.prepare(`SELECT reviewer,outcome,completion_head
          FROM dc_task_review_handoffs WHERE task_id=?`).get(id);
        const ownReview=!!result&&result.reviewer===lease.agent&&
          taskReview?.reviewer===lease.agent&&taskReview?.outcome==='passed'&&
          taskReview?.completion_head===targetHead;
        const repositoryReview=multiRepo?this.db.prepare(`SELECT digest
          FROM dc_external_gate_repository_digests WHERE task_id=? AND gate_name=?`)
          .get(id,name):null;
        const evidenceDigest=multiRepo?this.db.prepare(`SELECT rd.digest FROM dc_evidence e
          JOIN dc_evidence_repository_digests rd ON rd.evidence_id=e.id
          WHERE e.task_id=? AND e.reference=? AND e.git_head=?
          ORDER BY e.id DESC LIMIT 1`).get(id,result?.evidence_reference??"",targetHead):null;
        const reviewed=!!result && result.outcome==="passed" &&
          result.git_head===targetHead && result.lease_token_hash===tokenHash &&
          (ownReview||(result.reviewer!==result.runner&&result.reviewer!==lease.agent)) &&
          (!multiRepo||(repositoryReview?.digest===repoDigest&&
            evidenceDigest?.digest===repoDigest)) &&
          !!this.db.prepare("SELECT id FROM dc_evidence WHERE task_id=? AND reference=? AND git_head=?")
            .get(id,result?.evidence_reference??"",targetHead);
        return [name,{passed:reviewed,evidenceBased:true,
          reason:reviewed?'Version-bound test evidence and substantive Agent review recorded':
            'Missing passing project test evidence and version-bound Gate review; run project tests, report, then gate-review',
          ...(result?{reviewer:result.reviewer,outcome:result.outcome,
            evidenceReference:result.evidence_reference}:{})}];
      }
      return [name,{passed:false,reason:'Unrecognized acceptance requirement; inspect the approved plan and evidence policy'}];
    }));
    const stableHead = git(this.root, ["rev-parse", "HEAD"]);
    const protectedEditsStable=protectedEditsAreStable();
    const repoStable=():boolean=>{
      if(!multiRepo)return true;
      try{
        const current=this.observedTaskRepositories(id,task);
        this.requireChildReposClean(current,id,task);
        assertDeliveryStillPresent(this.root,repositories,current,
          JSON.parse(task.allowed_paths));
        return this.repositoryEvidenceDigest(id,repositories)===repoDigest;
      }catch{return false;}
    };
    const stable = startHead === stableHead && protectedEditsStable && repoStable();
    const passed = stable && Object.values(results).every((r) => r.passed);
    this.inTransaction(() => {
      const current = this.requireLease(id, token,'review');
      if (current.base_head !== lease.base_head) fail("LEASE_CHANGED", "Lease changed during validation");
      const editsStillMatch=protectedEditsAreStable();
      if (git(this.root, ["rev-parse", "HEAD"]) !== startHead ||
          !editsStillMatch || !repoStable()) {
        fail("GIT_CHANGED_DURING_VERIFY", "Git changed after gates; re-run verification");
      }
      this.audit(id, passed ? "verified" : "verify_failed", "devcontrol", {
        revision: startHead, completionRevision: note.revision, files, results, gitStable: stable,
      });
      if (passed) {
        const independentReview=this.db.prepare(`SELECT reviewer,reviewed_at,
          completion_head,completion_revision FROM dc_task_review_handoffs
          WHERE task_id=? AND outcome='passed'`).get(id);
        if(independentReview)this.audit(id,"reviewed_task_verified",
          String(independentReview.reviewer),{
            reviewHead:independentReview.completion_head,
            reviewedAt:independentReview.reviewed_at,
            completionRevision:independentReview.completion_revision});
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
        this.clearTaskLease(id);
        if(frozenReview){
          this.audit(id,"deferred_verification_passed","devcontrol",{
            originalHead:deferred.completion_head,verifiedAtHead:startHead,
            verifiedGateNames:gates,
          });
        }
      }
    });
    return { taskId: id, passed, files, results, gitStable: stable };
  }

  trace(id: string): Row {
    this.requireTask(id);
    return {
      task: this.get(id),
      verificationDeferral:this.db.prepare(
        "SELECT gate_name,reason,base_head,completion_head,completion_revision,"+
        "deferred_by,deferred_at,resumed_at,preserved_worktree_json "+
        "FROM dc_verification_deferrals WHERE task_id=?",
      ).get(id)??null,
      sqliteDecision: this.getDecision(id).decision,
      sqliteDecisionHistory:this.getDecision(id).history,
      evidence: this.db.prepare("SELECT * FROM dc_evidence WHERE task_id=? ORDER BY id").all(id),
      externalGateReviews: this.db.prepare(
        "SELECT gate_name,evidence_reference,runner,reviewer,outcome,review_notes,git_head,created_at FROM dc_external_gate_reviews WHERE task_id=? ORDER BY gate_name",
      ).all(id),
      unifiedAcceptance:(()=>{
        const record=this.db.prepare(`SELECT completion_revision,completion_head,
          reviewer,findings,evidence_reference,gates_json,accepted_at
          FROM dc_task_acceptances WHERE task_id=?`).get(id);
        return record?{...record,gates:JSON.parse(String(record.gates_json)),
          gates_json:undefined}:null;
      })(),
      completion: this.latestCompletion(id),
      completionHistory: this.db.prepare(
        "SELECT * FROM dc_completion_notes WHERE task_id=? ORDER BY revision",
      ).all(id),
      reviewHandoff:this.db.prepare(`SELECT completion_revision,completion_head,
        developer,issued_at,expires_at,reviewer,outcome,findings,reviewed_at
        FROM dc_task_review_handoffs WHERE task_id=?`).get(id)??null,
      claimWorktreeProtection:this.db.prepare(`SELECT base_head,captured_at
        FROM dc_task_worktree_baselines WHERE task_id=?`).get(id)??null,
      repositoryBaselines:this.db.prepare(`SELECT prefix,git_dir,base_head,captured_at
        FROM dc_task_repository_baselines WHERE task_id=? ORDER BY prefix`).all(id),
      repositoryBaselineRelocations:this.db.prepare(`SELECT batch_id,prefix,
        from_git_dir,to_git_dir,base_head,actor,reason,relocated_at
        FROM dc_task_repository_baseline_relocations WHERE task_id=? ORDER BY id`).all(id),
      audit: this.db.prepare("SELECT * FROM dc_audit WHERE task_id=? ORDER BY id").all(id)
        .map((r) => ({ ...r, details: JSON.parse(r.details_json), details_json: undefined })),
    };
  }
}
