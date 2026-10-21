import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { ProjectTaskLedger } from "../task-ledger.js";
import { reviewReleasePlan, type ReleasePlanProposal, type ReleasePlanNode } from "../release-plan.js";
import { createDevControlBoardServer } from "../board-server.js";
import { dispatchDevControl } from "../command.js";

const cleanup: { root: string; ledger: ProjectTaskLedger }[] = [];
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "devcontrol-release-plan-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  save(root, "docs/product/requirements.md",
    "# Release scope\nFR-001 has source provenance.\nNFR-002 requires idempotent storage.\n");
  save(root, "docs/architecture/overview.md",
    "# Event contract design\nGo owns the canonical event, contract and provenance checks.\n");
  save(root, "docs/architecture/overview.md",
    "# Event contract\nThe scoped Core endpoint owns canonical ingest provenance.\n");
  commit(root);
  const ledger = new ProjectTaskLedger(root);
  cleanup.push({ root, ledger });
  return { root, ledger };
}
function save(root: string, file: string, data: string) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, data);
}
function commit(root: string) {
  execFileSync("git", ["add", "-A"], { cwd: root });
  execFileSync("git", ["-c", "user.name=Test", "-c",
    "user.email=test@example.invalid", "commit", "-qm", "baseline"], { cwd: root });
}
function leaf(id: string, requirements: string[], parentId = "REL-CORE"): ReleasePlanNode {
  return {
    id, title: "Verify " + id, kind: "leaf", parentId,
    requirementIds: requirements, estimatedHours: 2.5,
    acceptance: "A real observable successful response is accompanied by an inspectable source ID.",
    designRef: "docs/architecture/overview.md#event-contract",
    testCases: [
      "Given a valid source, persist the canonical event without losing provenance.",
      "After process restart, lookup by event ID retrieves the original source and timestamp.",
    ],
    negativeCases: [
      "Malformed or unauthorized event must be rejected without writing a valid record.",
      "A source ID from another identity is rejected without disclosing private text.",
    ],
    scenario: "A user submits a note during a meeting and queries the event again the following day.",
    workflow: ["Validate source and caller before accepting the event.",
      "Create canonical event with one Core-assigned ID in a transaction.",
      "Restart the service and confirm source and time identity are preserved."],
    businessRules: ["Only Core owns event data and received time.",
      "Client retries must not create duplicate user facts."],
    sourceRefs: ["docs/product/requirements.md#FR-001",
      "docs/architecture/overview.md"],
    reviewNotes: ["Storage choice is still proposed and must be reviewed before implementation."],
    verificationEvidence: ["HTTP request/response with source ID and version.",
      "Actual persistent record count and restart test logs."],
    inputs:["Caller identity plus validated note payload with a stable origin reference."],
    outputs:["Persisted event ID and immutable source provenance in the API response."],
    preconditions:["Reviewed Core contract is present and the required project gates are configured."],
    stateTransitions:["Validated intake moves from unrecorded to stored exactly once per source key."],
    forbiddenChanges:["Do not redefine source ownership, event timestamps, or the public HTTP contract."],
    stopConditions:["Stop execution and request design review when a required storage decision is missing."],
    allowedChangedFiles:["services/core/contracts.go","services/core/contracts_test.go"],
    outOfScope: ["No external cloud provider installation."],
    deliverables: ["services/core/contracts.go", "services/core/contracts_test.go"],
    allowedPaths: ["services/core/**"], requiredGates: ["docs"],
  };
}
function plan(): ReleasePlanProposal {
  return {
    release: "V0.1", scopeSource: "docs/product/requirements.md",
    requirementIds: ["FR-001", "NFR-002"],
    rationale: "This approved version includes a small provenance flow and idempotent contract; all other work is deferred.",
    baseRevision: 0,
    qualityProfile: "spec-depth-v3",
    nodes: [
      { id: "REL-CORE", title: "Canonical core event delivery", kind: "group" },
      leaf("REL-INGEST", ["FR-001"]),
      { ...leaf("REL-RETRY", ["NFR-002"]), dependsOn: ["REL-INGEST"] },
    ],
  };
}
afterEach(() => {
  cleanup.splice(0).forEach(({ ledger, root }) => {
    ledger.close();fs.rmSync(root, { recursive: true, force: true });
  });
});

describe("Task ownership and frozen execution contract",()=>{
  it("adds device attribution columns to existing SQLite without discarding old owner rows",()=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),"devcontrol-legacy-owner-"));
    execFileSync("git",["init","-q"],{cwd:root});
    save(root,"README.md","Initial project");
    commit(root);
    const databasePath=path.join(root,"old-devcontrol.sqlite3");
    const {DatabaseSync}=createRequire(import.meta.url)("node:sqlite") as {
      DatabaseSync:new(file:string)=>{exec(sql:string):void;
        prepare(sql:string):{get(...args:string[]):Record<string,any>|undefined};
        close():void};
    };
    const old=new DatabaseSync(databasePath);
    old.exec("CREATE TABLE dc_task_assignments (task_id TEXT PRIMARY KEY, owner TEXT NOT NULL,"+
      "assigned_by TEXT NOT NULL,decision_ref TEXT NOT NULL,assigned_at TEXT NOT NULL);"+
      "INSERT INTO dc_task_assignments VALUES('LEGACY-1','Old Engineer','legacy-review',"+
      "'old-record','2026-01-01T00:00:00Z');");
    old.close();
    const ledger=new ProjectTaskLedger(root,databasePath);
    cleanup.push({root,ledger});
    const upgraded=new DatabaseSync(databasePath);
    expect(upgraded.prepare("SELECT owner,decision_ref,device,identity_source "+
      "FROM dc_task_assignments WHERE task_id='LEGACY-1'").get()).toMatchObject({
        owner:"Old Engineer",decision_ref:"old-record",device:"",identity_source:"",
      });
    upgraded.close();
  });

  it("records the local Git developer on creation, then the claiming machine; ownership does not block a reviewed task", () => {
    const {ledger,root}=fixture();
    execFileSync("git",["config","--local","user.name","Warehouse Engineer"],{cwd:root});
    execFileSync("git",["config","--local","user.email","local@example.invalid"],{cwd:root});
    expect(dispatchDevControl(ledger,"local-developer",{})).toMatchObject({
      name:"Warehouse Engineer",source:"repository",configured:true,
      assignmentPolicy:"on-task-create-or-claim",
    });
    const candidate=plan();
    candidate.nodes[1].openQuestions=["Decide migration lifetime and data retention before implementation."];
    const proposal=ledger.proposeReleasePlan(candidate,"planner");
    expect(()=>ledger.approveReleasePlan("V0.1","reviewer",String(proposal.hash)))
      .toThrow(/UNRESOLVED_PRODUCT_DECISION|Resolve open v3 decisions/);
    expect(ledger.list()).toHaveLength(0);
    const resolved=structuredClone(candidate);
    resolved.nodes[1].openQuestions=[];
    const revised=ledger.proposeReleasePlan(resolved,"planner",String(proposal.hash));
    ledger.approveReleasePlan("V0.1","reviewer",String(revised.hash));
    expect(ledger.get("REL-INGEST")).toMatchObject({
      owner:"Warehouse Engineer",ownerAssignment:{
        assignedBy:"Warehouse Engineer",identitySource:"repository",
        decisionRef:"local-git:created",device:expect.any(String),
      },
    });
    expect(ledger.executionContract("REL-INGEST")).toMatchObject({
      eligible:true,issues:[],owner:"Warehouse Engineer",
      spec:{scenario:expect.any(String),inputs:expect.any(Array),
        outputs:expect.any(Array),allowedChangedFiles:expect.any(Array)},
    });
    expect(ledger.next().nextTask.id).toBe("REL-INGEST");
    execFileSync("git",["config","--local","user.name","Research Engineer"],{cwd:root});
    const oldDevice=process.env.DEVCONTROL_DEVICE_NAME;
    process.env.DEVCONTROL_DEVICE_NAME="Research Laptop";
    const running=ledger.claim("REL-INGEST","coding-agent");
    if(oldDevice===undefined)delete process.env.DEVCONTROL_DEVICE_NAME;
    else process.env.DEVCONTROL_DEVICE_NAME=oldDevice;
    expect(running.task).toMatchObject({owner:"Research Engineer",
      ownerAssignment:{device:"Research Laptop",decisionRef:"local-git:claimed"}});
    expect(ledger.trace("REL-INGEST").audit.some(
      (event:{event:string})=>event.event==="developer_changed")).toBe(true);
    expect(running.executionContract.spec.allowedChangedFiles).toContain("services/core/contracts.go");
    expect(ledger.checkStaged().passed).toBe(false);
    save(root,"services/core/contracts.go","package core\n");
    execFileSync("git",["add","services/core/contracts.go"],{cwd:root});
    expect(ledger.checkStaged()).toMatchObject({passed:true,deniedFiles:[]});
    save(root,"services/core/arbitrary.go","package core\n");
    execFileSync("git",["add","services/core/arbitrary.go"],{cwd:root});
    expect(ledger.checkStaged()).toMatchObject({passed:false,
      deniedFiles:["services/core/arbitrary.go"]});
  });
});

describe("Pending release plan content revision", () => {
  it("blocks approval of legacy one-test-line task plans before Spec-depth revision", () => {
    const {ledger}=fixture();
    const shallow=structuredClone(plan());
    delete shallow.qualityProfile;
    const old=ledger.proposeReleasePlan(shallow,"agent");
    expect(() => ledger.approveReleasePlan("V0.1","owner",String(old.hash)))
      .toThrow(/trigger.*workflow.*source|Spec.depth|Detailed trigger/i);
    expect(ledger.list()).toHaveLength(0);
    expect(ledger.releasePlan("V0.1").status).toBe("review_pending");
  });

  it("safely revises an unapproved draft by CAS hash and archives the previous snapshot", () => {
    const {ledger}=fixture();
    const first=ledger.proposeReleasePlan(plan(),"planning-agent");
    const oldPlan=ledger.releasePlan("V0.1").proposal;
    const changed=structuredClone(plan());
    changed.nodes[1].scenario =
      "The user changes the text import location, and the Core must preserve source ownership.";
    changed.nodes[1].workflow?.push("Verify the evidence ID after rereading the source event.");
    changed.nodes[1].negativeCases?.push(
      "An unauthorized client may not revise an immutable received timestamp.");
    expect(() => ledger.proposeReleasePlan(changed,"agent")).toThrow(/PROPOSAL_PENDING|Pending proposal/i);
    expect(() => ledger.proposeReleasePlan(changed,"agent","0".repeat(64))).toThrow(/prior hash/i);
    const revised=dispatchDevControl(ledger,"plan-revise",{
      plan:changed,actor:"agent",expectedPreviousHash:first.hash,
    });
    expect(revised.hash).not.toBe(first.hash);
    expect(ledger.list()).toHaveLength(0);
    expect(ledger.releasePlan("V0.1")).toMatchObject({
      revision:0,status:"review_pending",proposal:{
        hash:revised.hash,qualityProfile:"spec-depth-v3",
      },
    });
    expect(ledger.releasePlan("V0.1").proposal.nodes[1].scenario).not.toBe(oldPlan.nodes[1].scenario);
    expect(() => ledger.proposeReleasePlan(changed,"agent",String(first.hash))).toThrow(/STALE_DRAFT|no longer matches/i);
    const audit=ledger as unknown as { db:{prepare:(sql:string)=>{get:(...args:unknown[])=>any}} };
    expect(audit.db.prepare("SELECT old_hash,next_hash FROM dc_release_proposal_drafts WHERE release=?")
      .get("V0.1")).toMatchObject({old_hash:first.hash,next_hash:revised.hash});
  });
});

describe("DevControl full-version planning", () => {
  it("defaults new project databases to v3 while preserving pending v2 proposals for review", () => {
    const {ledger}=fixture();
    const legacy=structuredClone(plan());legacy.qualityProfile="spec-depth-v2";
    expect(reviewReleasePlan(legacy).passed).toBe(true);
    const proposal=ledger.proposeReleasePlan(legacy,"planning-agent");
    expect(()=>ledger.approveReleasePlan("V0.1","owner",String(proposal.hash)))
      .toThrow(/SPEC_V3_REQUIRED|v3 execution contract/i);
    expect(ledger.releasePlan("V0.1")).toMatchObject({
      status:"review_pending",revision:0,
    });
    expect(ledger.list()).toHaveLength(0);
  });

  it("rejects incomplete v3 execution contracts, forbidden placeholders and out-of-scope exact files",()=>{
    const candidate=plan();
    candidate.nodes[1].inputs=[];
    candidate.nodes[1].forbiddenChanges=["TODO"];
    candidate.nodes[1].allowedChangedFiles=["outside/rogue.go"];
    const reviewed=reviewReleasePlan(candidate);
    expect(reviewed.passed).toBe(false);
    expect(reviewed.issues.join("; ")).toMatch(/v3 requires concrete inputs/);
    expect(reviewed.issues.join("; ")).toMatch(/forbiddenChanges/);
    expect(reviewed.issues.join("; ")).toMatch(/exact allowedChangedFiles/);
  });
  it("rejects an uncommitted or symlink-escaped design source without writing a proposal", () => {
    const {root,ledger}=fixture();
    save(root,"docs/architecture/overview.md","# Unapproved new design\nChanges are not yet in Git.\n");
    expect(() => ledger.proposeReleasePlan(plan(),"agent")).toThrow(/design reference/i);
    expect(ledger.releasePlan("V0.1").status).toBe("missing");
    const outside=fs.mkdtempSync(path.join(os.tmpdir(),"devcontrol-outside-"));
    try {
      const external=path.join(outside,"external.md");
      fs.writeFileSync(external,"# Outside private design\nMust not be included.");
      fs.symlinkSync(external,path.join(root,"docs","architecture","external.md"));
      execFileSync("git",["add","docs/architecture/external.md"],{cwd:root});
      commit(root);
      const item=plan();
      item.nodes[1].designRef="docs/architecture/external.md";
      expect(() => ledger.proposeReleasePlan(item,"agent")).toThrow(/design reference/i);
      expect(ledger.list()).toHaveLength(0);
    } finally {
      fs.rmSync(outside,{recursive:true,force:true});
    }
  });
  it("enforces the full plan on a completely new Git project, including invalid legacy-style approvals", () => {
    const {ledger}=fixture();
    ledger.create({id:"REL-UNPLANNED",title:"A one-off task",
      release:"V0.1",allowedPaths:["services/core/**"],requiredGates:["docs"]},"agent");
    expect(ledger.releasePlan("V0.1").status).toBe("missing");
    expect(() => ledger.approve("REL-UNPLANNED","owner")).toThrow(/release plan/i);
    expect(() => ledger.proposeReleasePlan(plan(),"agent")).toThrow(/include every existing/i);
    expect(ledger.get("REL-UNPLANNED").status).toBe("draft");
    expect(ledger.next().nextTask).toBeNull();
  });
  it("rejects incomplete plan, placeholders, uncovered FR, oversized leaves and cycles", () => {
    const { ledger } = fixture();
    const candidate = plan();
    expect(reviewReleasePlan(candidate)).toMatchObject({
      passed: true, total: 3, leafCount: 2, groupCount: 1, uncoveredRequirements: [],
    });
    candidate.nodes[1].acceptance = "TODO";
    candidate.nodes[2].estimatedHours = 15;
    candidate.nodes[2].requirementIds = ["FR-001"];
    candidate.nodes[1].dependsOn = ["REL-RETRY"];
    const review = reviewReleasePlan(candidate);
    expect(review.passed).toBe(false);
    expect(review.issues.join("; ")).toMatch(/hours|workday/);
    expect(review.issues.join("; ")).toMatch(/Cycle/);
    expect(review.uncoveredRequirements).toEqual(["NFR-002"]);
    expect(() => dispatchDevControl(ledger,"plan-propose",{plan:candidate,actor:"agent"}))
      .toThrow(/INCOMPLETE_PLAN|Uncovered requirements|Cycle/);
    expect(ledger.list()).toHaveLength(0);
    expect(ledger.releasePlan("V0.1").status).toBe("missing");
  });

  it("creates no task until exact Owner-reviewed hash is approved, then executes only leaves", () => {
    const { ledger } = fixture();
    const candidate = plan();
    const proposal = ledger.proposeReleasePlan(candidate, "agent");
    expect(proposal.status).toBe("review_pending");
    expect(ledger.list()).toHaveLength(0);
    expect(ledger.releasePlan("V0.1").revision).toBe(0);
    expect(() => ledger.approveReleasePlan("V0.1","owner","0".repeat(64)))
      .toThrow(/matching proposed/i);
    const approved = ledger.approveReleasePlan("V0.1","owner",String(proposal.hash));
    expect(approved).toMatchObject({ revision: 1, status:"frozen",
      added: ["REL-CORE","REL-INGEST","REL-RETRY"] });
    expect(ledger.list()).toHaveLength(3);
    expect(ledger.hasReviewedProductPlan()).toBe(true);
    expect(ledger.get("REL-INGEST")).toMatchObject({
      parentId:"REL-CORE", status:"ready", spec:{
        requirementIds:["FR-001"], estimatedHours:2.5, planRevision:1,
        designRef:"docs/architecture/overview.md#event-contract",
      },
    });
    expect(ledger.get("REL-INGEST").owner).toBeTruthy();
    expect(ledger.board().columns.todo.find((t: {id:string;owner?:string})=>t.id==="REL-INGEST")
      ?.owner).toBe(ledger.localDeveloper().name);
    expect(ledger.next().nextTask.id).toBe("REL-INGEST");
    const approvedContract=dispatchDevControl(ledger,"execution-contract",{id:"REL-INGEST"});
    expect(approvedContract).toMatchObject({eligible:true,
      owner:expect.any(String),spec:{workflow:expect.arrayContaining([expect.any(String)])}});
    expect(() => ledger.claim("REL-CORE","agent")).toThrow(/leaf/);
    expect(() => ledger.claim("REL-RETRY","agent")).toThrow(/depends/);
    expect(ledger.releasePlan("V0.1").sourceDrift).toBe(false);
    expect(ledger.board().columns.todo.find((t: {id:string;spec?:{testCases:string[]}}) =>
      t.id === "REL-INGEST")?.spec?.testCases)
      .toHaveLength(2);
    ledger.create({id:"REL-ADHOC",title:"Unreviewed task",allowedPaths:["src/**"],
      requiredGates:["docs"],release:"V0.1"},"agent");
    expect(() => ledger.approve("REL-ADHOC","owner")).toThrow(/complete.*release plan/i);
    expect(ledger.releasePlan("V0.1").status).toBe("frozen");
  });

  it("only appends new leaves via reviewed revision, preserving all old task IDs and definitions", () => {
    const { root, ledger } = fixture();
    const initial = plan();
    const first = ledger.proposeReleasePlan(initial,"agent");
    ledger.approveReleasePlan("V0.1","owner",String(first.hash));
    const changed = structuredClone(initial);
    changed.baseRevision = 1;
    changed.nodes[1].title = "Retitled after approval";
    expect(() => ledger.proposeReleasePlan(changed,"agent")).toThrow(/definition changed/);
    const revision = structuredClone(initial);
    revision.baseRevision = 1;
    revision.requirementIds.push("FR-002");
    revision.nodes.push({ ...leaf("REL-QUERY",["FR-002"]), dependsOn:["REL-RETRY"] });
    expect(() => ledger.proposeReleasePlan(revision,"agent")).toThrow(/FR-002 not present/);
    save(root,"docs/product/requirements.md",
      "# Release scope\nFR-001 provenance.\nNFR-002 retries.\nFR-002 lookup requirement.\n");
    expect(ledger.releasePlan("V0.1").sourceDrift).toBe(true);
    expect(ledger.hasReviewedProductPlan()).toBe(false);
    expect(ledger.next().nextTask).toBeNull();
    expect(() => ledger.claim("REL-INGEST","agent")).toThrow(/frozen plan/i);
    commit(root);
    const second = ledger.proposeReleasePlan(revision,"agent");
    expect(ledger.releasePlan("V0.1").status).toBe("review_pending");
    expect(ledger.list()).toHaveLength(3);
    const approved = ledger.approveReleasePlan("V0.1","owner",String(second.hash));
    expect(approved.added).toEqual(["REL-QUERY"]);
    expect(ledger.get("REL-INGEST").spec.planRevision).toBe(1);
    expect(ledger.get("REL-QUERY").spec.planRevision).toBe(2);
    expect(ledger.releasePlan("V0.1").revision).toBe(2);
    expect(ledger.releasePlan("V0.1").history.map((row: {revision:number})=>row.revision))
      .toEqual([1,2]);
    expect(ledger.list()).toHaveLength(4);
  });

  it("does not approve when the reviewed requirements change, and keeps HTTP read only", async () => {
    const { root, ledger } = fixture();
    const proposal = ledger.proposeReleasePlan(plan(),"agent");
    save(root,"docs/product/requirements.md",
      "# Changed before approval\nFR-001 now different.\nNFR-002 still relevant.\n");
    expect(() => ledger.approveReleasePlan("V0.1","owner",String(proposal.hash)))
      .toThrow(/changed since proposal/i);
    expect(ledger.list()).toHaveLength(0);
    const server=createDevControlBoardServer(ledger);
    await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
    try{
      const address=server.address();
      const base="http://127.0.0.1:"+(
        typeof address==="object" && address ? address.port : 0);
      const response=await fetch(base+"/api/release-plan?release=V0.1");
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({status:"review_pending",revision:0});
      expect((await fetch(base+"/api/release-plan",{method:"POST"})).status).toBe(405);
    }finally{
      await new Promise<void>(resolve=>server.close(()=>resolve()));
    }
  });

  it("rejects release claims if product-specific gates are not actually executable", () => {
    const {ledger}=fixture();
    const candidate=plan();
    candidate.nodes[1].requiredGates=["go_http_integration"];
    candidate.nodes[2].requiredGates=["ios_device_e2e","v01_release_e2e"];
    expect(reviewReleasePlan(candidate).passed).toBe(true);
    const inspect=ledger as unknown as {gate:(name:string)=>{passed:boolean,error:string}};
    expect(inspect.gate("go_http_integration")).toMatchObject({passed:false});
    expect(inspect.gate("flutter_test")).toMatchObject({passed:false});
    expect(inspect.gate("ios_device_e2e")).toMatchObject({passed:false});
    expect(inspect.gate("v01_release_e2e")).toMatchObject({passed:false});
  });
});
