import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import http from "node:http";
import vm from "node:vm";
import { ProjectTaskLedger, DevControlError } from "../task-ledger.js";
import { releaseReviewSubjectHash, REVIEW_DIMENSIONS } from "../release-work.js";
import { IDEA_REVIEW_DIMENSIONS } from "../idea-review.js";
import { createDevControlBoardServer, WORKSPACE_SCHEMA_VERSION } from "../board-server.js";
import { projectContext, readProjectDoc, safeProjectDocument } from "../project-catalog.js";
import { projectHtml } from "../project-html.js";
import { bootstrapHistorySession, checkpointHistorySession } from "../../lib/history-session/index.js";

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
  it("holds chat ideas in SQLite until impact assessment, separate review and explicit planning disposition",()=>{
    const dbPath=path.join(root,".neyna/state/devcontrol.sqlite3");
    const sqlite=createRequire(import.meta.url)("node:sqlite") as {
      DatabaseSync:new(path:string)=>{prepare(sql:string):{
        run(...args:unknown[]):unknown;get(...args:unknown[]):Record<string,any>|undefined
      };close():void};
    };
    const store=new sqlite.DatabaseSync(dbPath);
    const frozen={plan:{release:"V0.1",stages:[{id:"F1"}],
      workItems:[{id:"F1",stageId:"F1"}]}};
    const frozenHash="f".repeat(64);
    store.prepare(`INSERT INTO dc_release_work_plans
      (release,revision,hash,snapshot_json,approved_by,approved_at)
      VALUES(?,?,?,?,?,?)`).run("V0.1",1,frozenHash,
        JSON.stringify(frozen),"test-owner",new Date().toISOString());
    store.close();
    const captured=ledger!.captureIdea({release:"V0.1",
      title:"Switch Neyna product business storage to PostgreSQL",
      description:"New owner proposal should be evaluated, not trigger immediate code changes.",
      sourceRef:"user-conversation-2026-10-22",submittedBy:"host-agent"});
    expect(captured).toMatchObject({status:"captured",revision:1,executableTaskCreated:false});
    expect(ledger!.get("F1").status).toBe("ready");
    expect(()=>ledger!.decideIdea(captured.id,{disposition:"adopt",
      expectedRevision:1,expectedReviewHash:"x",approvedBy:"Owner",reason:"New storage direction",
      explicitAuthorization:true}))
      .toThrow(/Review/);
    const assessment={recommendation:"adopt" as const,placement:"after_task" as const,
      targetStageId:"F1",targetTaskId:"F1",affectedTaskIds:["F1"],
      rationale:"PostgreSQL provides the product storage boundary requested by the Owner.",
      alternatives:"Separate code changes into staged and independently tested PostgreSQL tasks.",
      dependencyImpact:"Go module bootstrapping and integration tests must be ready before DB migration.",
      securityAndTestImpact:"Connection loss and least-privilege negative tests become mandatory.",
      versionImpact:"Propose a revised frozen release roster with a new atomic testing task.",
      evidenceRefs:["source:user-owner-proposal","task:F1"],
      assessedBy:"analysis-agent"};
    expect(()=>ledger!.assessIdea(captured.id,{
      ...assessment,targetTaskId:"UNKNOWN"
    },1)).toThrow(/insertion/i);
    const assessed=ledger!.assessIdea(captured.id,assessment,1);
    expect(assessed).toMatchObject({status:"assessed",revision:2,executableTaskCreated:false});
    const checks=["product_fit","dependency_integrity","timing_priority",
      "security_and_testing"].map(dimension=>({dimension,
        conclusion:"Independent evidence and task dependency review for "+dimension,
        taskIds:["F1"]}));
    expect(()=>ledger!.reviewIdea(captured.id,{reviewer:"analysis-agent",
      method:"independent-agent-pass",subjectHash:assessed.assessmentHash,checks} as never,2))
      .toThrow(/independent/i);
    expect(()=>ledger!.reviewIdea(captured.id,{reviewer:"second-reviewer",
      method:"independent-agent-pass",subjectHash:"a".repeat(64),checks} as never,2))
      .toThrow(/stale/i);
    const reviewed=ledger!.reviewIdea(captured.id,{reviewer:"second-reviewer",
      method:"independent-agent-pass",subjectHash:assessed.assessmentHash,checks} as never,2);
    expect(reviewed).toMatchObject({status:"reviewed",revision:3});
    expect(()=>ledger!.decideIdea(captured.id,{disposition:"adopt",
      expectedRevision:3,expectedReviewHash:"b".repeat(64),approvedBy:"Owner",
      reason:"Plan current integration",explicitAuthorization:true})).toThrow(/hash/i);
    const decided=ledger!.decideIdea(captured.id,{disposition:"adopt",
      expectedRevision:3,expectedReviewHash:reviewed.reviewHash,
      approvedBy:"Owner",reason:"Add to reviewed planning queue, not implementation",
      explicitAuthorization:true});
    expect(decided).toMatchObject({status:"approved_for_planning",
      executableTaskCreated:false,frozenPlanChanged:false});
    expect(ledger!.getIdea(captured.id).history).toHaveLength(4);
    expect(ledger!.get("F1").status).toBe("ready");
    expect(ledger!.releaseWorkPlan("V0.1").frozenHash).toBe(frozenHash);
    expect(git("status","--porcelain")).toBe("");
    expect(()=>ledger!.assessIdea(captured.id,assessment,4)).toThrow(/Only/);
  });
  it("keeps a user idea as a non-executable candidate until reasoned impact, separate review and explicit authorization",()=>{
    save("docs/roadmap/idea-version.md",
      "# Approved scope\n\n| 阶段 | 说明 |\n| --- | --- |\n| F0 | Verified baseline |\n| F2 | Go Core and validation |\n");
    commit("freeze idea review baseline");
    const workItems=[
      {id:"IDEA-CORE",title:"Build the Go Core entrypoint",stageId:"F2",
        type:"development",ownerRole:"Core Agent",platform:"Go",
        dependsOn:["F0"],acceptance:"Core starts under real integration checks",
        allowedPaths:["services/core/cmd/**"],requiredGates:["docs"]},
      {id:"IDEA-QA",title:"Test Core API behavior",stageId:"F2",
        type:"testing",ownerRole:"QA Agent",platform:"Go",
        dependsOn:["IDEA-CORE"],acceptance:"Actual restart and invalid token tests pass",
        allowedPaths:["tests/**"],requiredGates:["docs"]},
      {id:"IDEA-INT",title:"Test client to Core integration",stageId:"F2",
        type:"integration",ownerRole:"Integration Agent",platform:"iOS",
        dependsOn:["IDEA-QA"],acceptance:"Physical device integration evidence is recorded",
        allowedPaths:["tests/**"],requiredGates:["docs"]},
      {id:"IDEA-REL",title:"Evaluate actual release evidence",stageId:"F2",
        type:"release",ownerRole:"Release Agent",platform:"Release",
        dependsOn:["IDEA-INT"],acceptance:"Go, privacy and device release checks are independently verified",
        allowedPaths:["docs/**"],requiredGates:["docs"]},
    ] as any[];
    const base={release:"V0.1",scopeSource:"docs/roadmap/idea-version.md",
      stages:[{id:"F0",verifiedTaskIds:["F0"]},{id:"F2"}],
      workItems,rationale:"Independent version review covers code, QA, integration and release phases."};
    const plan={...base,agentReview:{
      reviewer:"independent-planning-agent",method:"independent-agent-pass",
      subjectHash:releaseReviewSubjectHash(base as any),
      sourceRefs:["docs/roadmap/idea-version.md"],reviewedStageIds:["F0","F2"],
      checks:REVIEW_DIMENSIONS.map(dimension=>({dimension,
        conclusion:"Independently assessed original product scope and risks: "+dimension,
        workItemIds:["IDEA-CORE","IDEA-QA"]})),
    }};
    const staged=ledger!.stageReleaseWork(plan as any,"planner");
    expect(staged.status).toBe("review_pending");
    ledger!.approveReleaseWork("V0.1",staged.hash);
    const frozenHash=ledger!.releaseWorkPlan("V0.1").frozenHash;
    const baseline=git("rev-parse","HEAD");
    const candidate=ledger!.captureIdea({release:"V0.1",
      title:"Owner suggests PostgreSQL in place of the early SQLite candidate",
      description:"Assess whether to switch user-data persistence without modifying the active Core task.",
      sourceRef:"owner-conversation:new-direction",submittedBy:"conversation-agent"});
    expect(candidate.status).toBe("captured");
    expect(candidate.executableTaskCreated).toBe(false);
    expect(ledger!.get("IDEA-CORE").status).toBe("ready");
    const impact={
      recommendation:"adopt" as const,placement:"after_task" as const,
      targetStageId:"F2",targetTaskId:"IDEA-CORE",
      affectedTaskIds:["IDEA-CORE","IDEA-QA","IDEA-INT"],
      assessedBy:"planning-agent",
      rationale:"The owner explicitly chooses PostgreSQL for Neyna business data, not DevControl SQLite.",
      alternatives:"Defer the provider selection or use a dedicated PostgreSQL Store Port after Go bootstrap.",
      dependencyImpact:"PostgreSQL integration needs module scaffolding and database-specific tests after bootstrap.",
      securityAndTestImpact:"Test credentials, migration failure, deletion restoration and unavailable database handling.",
      versionImpact:"Propose inserting a separate task after the Core bootstrap and before dependent API integration.",
      evidenceRefs:["docs/roadmap/idea-version.md","IDEA-CORE","IDEA-QA"],
    };
    expect(()=>ledger!.assessIdea(candidate.id,{
      ...impact,targetTaskId:"NONEXISTENT"},candidate.revision))
      .toThrow(/targetTaskId|existing|insertion/i);
    const assessed=ledger!.assessIdea(candidate.id,impact,candidate.revision);
    expect(assessed.status).toBe("assessed");
    expect(assessed.assessmentHash).toMatch(/^[a-f0-9]{64}$/);
    const review={
      reviewer:"separate-review-agent",method:"independent-agent-pass" as const,
      subjectHash:assessed.assessmentHash,
      checks:IDEA_REVIEW_DIMENSIONS.map(dimension=>({
        dimension,conclusion:"Independently checked exact baseline, dependencies and regression risk for "+dimension,
        taskIds:["IDEA-CORE","IDEA-QA"],
      })),
    };
    expect(()=>ledger!.reviewIdea(candidate.id,{
      ...review,reviewer:"planning-agent"},assessed.revision))
      .toThrow(/separate/i);
    expect(()=>ledger!.reviewIdea(candidate.id,{
      ...review,subjectHash:"f".repeat(64)},assessed.revision))
      .toThrow(/stale/i);
    const reviewed=ledger!.reviewIdea(candidate.id,review as any,assessed.revision);
    expect(reviewed.status).toBe("reviewed");
    expect(()=>ledger!.decideIdea(candidate.id,{
      disposition:"adopt",approvedBy:"owner-audit-label",
      expectedReviewHash:reviewed.reviewHash,expectedRevision:reviewed.revision,
      reason:"Keep the suggested architecture change for a separately approved release amendment.",
      explicitAuthorization:false,
    })).toThrow(/explicitly authorize/i);
    expect(()=>ledger!.decideIdea(candidate.id,{
      disposition:"adopt",approvedBy:"owner-audit-label",
      expectedReviewHash:"f".repeat(64),expectedRevision:reviewed.revision,
      reason:"Owner approved this change for a later separate version planning pass.",
      explicitAuthorization:true,
    })).toThrow(/Exact independent review hash/);
    const authorized=ledger!.decideIdea(candidate.id,{
      disposition:"adopt",approvedBy:"owner-audit-label",
      expectedReviewHash:reviewed.reviewHash,expectedRevision:reviewed.revision,
      reason:"Owner approved a separate proposal, not direct coding or immediate reordering.",
      explicitAuthorization:true,
    });
    expect(authorized).toMatchObject({status:"approved_for_planning",
      executableTaskCreated:false,frozenPlanChanged:false});
    expect(authorized.history).toHaveLength(4);
    expect(ledger!.listIdeas("V0.1").ideas).toHaveLength(1);
    expect(ledger!.releaseWorkPlan("V0.1").frozenHash).toBe(frozenHash);
    expect(ledger!.get("IDEA-CORE").status).toBe("ready");
    expect(ledger!.get("IDEA-QA").dependsOn).toEqual(["IDEA-CORE"]);
    expect(git("rev-parse","HEAD")).toBe(baseline);
    expect(git("status","--porcelain")).toBe("");
    // A justified new idea CAN be admitted into the currently claimed task
    // when that task's original contract already covers it. The idea alone
    // creates no lease, new scope, dependency or executable work item.
    const claim=ledger!.claim("IDEA-CORE","core-implementation-agent");
    const inside=ledger!.captureIdea({release:"V0.1",
      title:"Strengthen the already approved Core startup health behavior",
      description:"The existing entrypoint should correctly reject unhealthy startup without changing its acceptance or file scope.",
      sourceRef:"owner-feedback:current-task",submittedBy:"current-conversation-agent"});
    const insideAssessment=ledger!.assessIdea(inside.id,{
      ...impact,recommendation:"adopt",placement:"within_task",
      rationale:"The claimed Core entrypoint can enforce its original startup health acceptance inside the unchanged allowed paths.",
      alternatives:"Add a later separate task, but it would repeat the same approved scope and acceptance.",
      versionImpact:"No change to the frozen workload, dependencies or acceptance is needed; execute during the claimed work.",
    },inside.revision);
    const insideReview=ledger!.reviewIdea(inside.id,{
      ...review,subjectHash:insideAssessment.assessmentHash,
    } as any,insideAssessment.revision);
    const insideDecision=ledger!.decideIdea(inside.id,{
      disposition:"adopt",approvedBy:"owner-explicit-current-task",
      expectedRevision:insideReview.revision,
      expectedReviewHash:insideReview.reviewHash,
      reason:"This evaluated improvement fits the existing approved task and should be included now.",
      explicitAuthorization:true,
    });
    expect(insideDecision).toMatchObject({
      status:"approved_for_planning",canProceedWithinExistingTask:true,
      releaseAmendmentRequired:false,executableTaskCreated:false,
      frozenPlanChanged:false,
    });
    expect(insideDecision.nextGate).toMatch(/Existing task contract/);
    expect(ledger!.get("IDEA-CORE").status).toBe("in_progress");
    expect(ledger!.releaseWorkPlan("V0.1").frozenHash).toBe(frozenHash);
    ledger!.release("IDEA-CORE",claim.leaseToken);
    // Deferral without a known insertion stage is a valid assessment result,
    // not a reason to invent a task or force an artificial future date.
    const uncertain=ledger!.captureIdea({release:"V0.1",
      title:"Explore optional future telemetry export",
      description:"No committed customer or runtime need; feasibility and risk remain uncertain.",
      sourceRef:"owner-feedback:optional-research",submittedBy:"analysis-agent"});
    const deferred=ledger!.assessIdea(uncertain.id,{
      ...impact,recommendation:"defer",placement:"none",
      targetStageId:"",targetTaskId:undefined,affectedTaskIds:[],
      rationale:"No direct requirement justifies insertion in this release yet; revisit once usage is observed.",
      versionImpact:"No target version is chosen until measurable demand supports a planning slot.",
    },uncertain.revision);
    expect(deferred).toMatchObject({status:"assessed"});
  });
  it("does not turn a new idea into executable work or change the frozen release without reviewed planning",()=>{
    save("docs/roadmap/idea-release.md",
      "# Scope\n\n| 阶段 | 内容 |\n| --- | --- |\n| F0 | 已验证基础 |\n| F2 | Core 实现与验收 |\n");
    commit("scope baseline");
    const items=[
      {id:"ID-DEC",title:"确定鉴权方案",type:"decision",stageId:"F2",
        ownerRole:"Security",platform:"Go",dependsOn:["F0"],
        acceptance:"清楚记录安全选择和风险",allowedPaths:[],requiredGates:["sqlite_decision"]},
      {id:"ID-DEV",title:"实现HTTP接口",type:"development",stageId:"F2",
        ownerRole:"Core",platform:"Go",dependsOn:["ID-DEC"],
        acceptance:"运行端到端 Go HTTP 测试",allowedPaths:["services/core/**"],requiredGates:["docs"]},
      {id:"ID-QA",title:"测试安全拒绝行为",type:"testing",stageId:"F2",
        ownerRole:"QA",platform:"Go",dependsOn:["ID-DEV"],
        acceptance:"真实拒绝请求测试通过",allowedPaths:["tests/**"],requiredGates:["docs"]},
      {id:"ID-INT",title:"完成接口集成验证",type:"integration",stageId:"F2",
        ownerRole:"Integration",platform:"Go",dependsOn:["ID-QA"],
        acceptance:"跨模块真实集成验证通过",allowedPaths:["tests/**"],requiredGates:["docs"]},
      {id:"ID-REL",title:"确认发布门禁",type:"release",stageId:"F2",
        ownerRole:"Release",platform:"Go",dependsOn:["ID-INT"],
        acceptance:"发布测试证据完整有效",allowedPaths:["docs/**"],requiredGates:["docs"]},
    ] as any[];
    const base={release:"V0.1",scopeSource:"docs/roadmap/idea-release.md",
      stages:[{id:"F0",verifiedTaskIds:["F0"]},{id:"F2"}],workItems:items,
      rationale:"Fully review the security design, real implementation, test and release chain before freeze."};
    const plan={...base,agentReview:{reviewer:"separate-planning-reviewer",
      method:"independent-agent-pass" as const,
      subjectHash:releaseReviewSubjectHash(base as any),
      sourceRefs:["docs/roadmap/idea-release.md"],reviewedStageIds:["F0","F2"],
      checks:REVIEW_DIMENSIONS.map(dimension=>({dimension,
        conclusion:"Inspected the original design risks and proper timing for "+dimension,
        workItemIds:["ID-DEC","ID-DEV"]})),
    }};
    expect(ledger!.reviewReleaseWork(plan as any).passed).toBe(true);
    const proposal=ledger!.stageReleaseWork(plan as any,"planning-agent");
    ledger!.approveReleaseWork("V0.1",proposal.hash);
    const baseline=ledger!.releaseWorkPlan("V0.1").frozenHash;
    const initialCount=ledger!.list().length,head=git("rev-parse","HEAD");
    const idea=ledger!.captureIdea({release:"V0.1",title:"考虑支持 PostgreSQL",
      description:"User proposed changing the production database; analyze risks and schedule before changing any tasks.",
      sourceRef:"user-request:database-2026-10-22",submittedBy:"idea-capture-agent"});
    expect(idea).toMatchObject({status:"captured",revision:1,executableTaskCreated:false});
    expect(ledger!.list()).toHaveLength(initialCount);
    const assessment={
      recommendation:"adopt" as const,placement:"after_task" as const,
      targetStageId:"F2",targetTaskId:"ID-DEC",affectedTaskIds:["ID-DEC","ID-DEV"],
      rationale:"The new provider changes production storage semantics and must be assessed before HTTP implementation.",
      alternatives:"Retain the initial proposed provider versus schedule a reviewed PostgreSQL implementation.",
      dependencyImpact:"Database driver and migration design must precede Core endpoint persistence work.",
      securityAndTestImpact:"Introduce real PostgreSQL integration, backup recovery and deletion regression tests.",
      versionImpact:"A frozen release amendment is required before additional product tasks can execute.",
      evidenceRefs:["docs/roadmap/idea-release.md","frozen-task:ID-DEC"],
      assessedBy:"business-analysis-agent",
    };
    expect(()=>ledger!.assessIdea(idea.id,{...assessment,targetTaskId:"NOT-IN-PLAN"},1))
      .toThrow(/affectedTaskIds|targetTaskId/);
    const assessed=ledger!.assessIdea(idea.id,assessment,1);
    expect(assessed).toMatchObject({status:"assessed",revision:2});
    expect(()=>ledger!.assessIdea(idea.id,assessment,1)).toThrow(/revision changed/);
    const checks=IDEA_REVIEW_DIMENSIONS.map(dimension=>({dimension,
      conclusion:"Independent assessment of requirements, timing and test impact for "+dimension,
      taskIds:["ID-DEC","ID-DEV"]}));
    expect(()=>ledger!.reviewIdea(idea.id,{reviewer:assessment.assessedBy,
      method:"independent-agent-pass",subjectHash:assessed.assessmentHash,checks},2))
      .toThrow(/separate independent/);
    const reviewed=ledger!.reviewIdea(idea.id,{
      reviewer:"separate-review-agent",method:"independent-agent-pass",
      subjectHash:assessed.assessmentHash,checks},2);
    expect(reviewed).toMatchObject({status:"reviewed",revision:3});
    expect(()=>ledger!.decideIdea(idea.id,{
      disposition:"adopt",approvedBy:"user-explicit-authorization",
      expectedRevision:3,expectedReviewHash:"0".repeat(64),
      reason:"Accept after evaluating product needs and rollback risk.",
      explicitAuthorization:true}))
      .toThrow(/review hash/);
    const decided=ledger!.decideIdea(idea.id,{
      disposition:"adopt",approvedBy:"user-explicit-authorization",
      expectedRevision:3,expectedReviewHash:reviewed.reviewHash,
      reason:"Accept for subsequent formal release amendment planning, not immediate coding.",
      explicitAuthorization:true});
    expect(decided).toMatchObject({
      status:"approved_for_planning",revision:4,
      frozenPlanChanged:false,executableTaskCreated:false});
    expect(ledger!.getIdea(idea.id).history).toHaveLength(4);
    expect(ledger!.listIdeas("V0.1").ideas).toHaveLength(1);
    expect(ledger!.releaseWorkPlan("V0.1").frozenHash).toBe(baseline);
    expect(ledger!.list()).toHaveLength(initialCount);
    expect(ledger!.get("ID-DEV").status).toBe("ready");
    expect(git("rev-parse","HEAD")).toBe(head);
    expect(git("status","--porcelain")).toBe("");
    expect(()=>ledger!.decideIdea(idea.id,{
      disposition:"adopt",approvedBy:"someone",expectedRevision:3,
      expectedReviewHash:reviewed.reviewHash,reason:"Try to approve twice without new review.",
      explicitAuthorization:true}))
      .toThrow(/Review the idea first/);
  });
  it("records frozen architecture decisions solely in SQLite without ADR Markdown or Git commits",()=>{
    save("docs/roadmap/decision-version.md",
      "# Test scope\n\n| 阶段 | 说明 |\n| --- | --- |\n| F0 | 基线 |\n| F2 | 设计与验收 |\n");
    commit("freeze baseline scope");
    const rows=[
      {id:"WORK-DEC1",title:"确定一致性备份语义",stageId:"F2",type:"decision",
        ownerRole:"Core Architect",platform:"Go",dependsOn:["F0"],
        acceptance:"记录恢复失败处理及风险权衡",allowedPaths:[],requiredGates:["sqlite_decision"]},
      {id:"WORK-DEC2",title:"审核设备令牌设计",stageId:"F2",type:"decision",
        ownerRole:"Security Architect",platform:"Go",dependsOn:["WORK-DEC1"],
        acceptance:"形成设备鉴权选择及回滚意见",
        allowedPaths:["docs/architecture/**"],requiredGates:["docs"]},
      {id:"WORK-DEV1",title:"实现存储服务代码",stageId:"F2",type:"development",
        ownerRole:"Go Core Agent",platform:"Go",dependsOn:["WORK-DEC2"],
        acceptance:"真实Go测试展示正确持久写入",
        allowedPaths:["services/core/**"],requiredGates:["docs"]},
      {id:"WORK-TEST",title:"测试Core集成结果",stageId:"F2",type:"testing",
        ownerRole:"QA Agent",platform:"Go",dependsOn:["WORK-DEV1"],
        acceptance:"真实重启测试及故障注入可复现",
        allowedPaths:["tests/**"],requiredGates:["docs"]},
      {id:"WORK-INT1",title:"确认跨端联调结果",stageId:"F2",type:"integration",
        ownerRole:"Integration Agent",platform:"iOS/Go",dependsOn:["WORK-TEST"],
        acceptance:"记录完整双端测试与失败回退",
        allowedPaths:["tests/**"],requiredGates:["docs"]},
      {id:"WORK-REL1",title:"复核最终版本验收",stageId:"F2",type:"release",
        ownerRole:"Release Agent",platform:"Release",dependsOn:["WORK-INT1"],
        acceptance:"发布前实际测试结果全部核实",
        allowedPaths:["docs/**"],requiredGates:["docs"]},
    ] as any[];
    const base={release:"V0.1",scopeSource:"docs/roadmap/decision-version.md",
      stages:[{id:"F0",verifiedTaskIds:["F0"]},{id:"F2"}],workItems:rows,
      rationale:"The reviewed full roster preserves verified baseline, independent decisions and all required test/release dependencies."};
    const plan={...base,agentReview:{
      reviewer:"independent-reviewer",method:"independent-agent-pass" as const,
      subjectHash:releaseReviewSubjectHash(base as any),
      sourceRefs:["docs/roadmap/decision-version.md"],
      reviewedStageIds:["F0","F2"],
      checks:REVIEW_DIMENSIONS.map(dimension=>({
        dimension,conclusion:"Independently inspected original requirements and risks for "+dimension,
        workItemIds:["WORK-DEC1","WORK-DEC2"]})),
    }};
    const wrong={...plan,workItems:rows.map((row,i)=>i===2?
      {...row,allowedPaths:[],requiredGates:["sqlite_decision"]}:row)};
    expect(ledger!.reviewReleaseWork(wrong as any).issues.some((s:string)=>
      s.includes("SQLite-only decision"))).toBe(true);
    expect(ledger!.reviewReleaseWork(plan as any).passed).toBe(true);
    const stage=ledger!.stageReleaseWork(plan as any,"planner");
    expect(stage.status).toBe("review_pending");
    ledger!.approveReleaseWork("V0.1",stage.hash);
    const head=git("rev-parse","HEAD");
    const first=ledger!.claim("WORK-DEC1","decision-agent");
    expect(ledger!.executionContract("WORK-DEC1").deliveryModes).toEqual(
      ["sqlite-decision","legacy-git"]);
    expect(ledger!.checkStaged()).toMatchObject({passed:false});
    expect(ledger!.getDecision("WORK-DEC1").decision).toBeNull();
    expect(()=>ledger!.recordDecision("WORK-DEV1",first.leaseToken,{} as never))
      .toThrow(/lease/i);
    const fields={
      status:"proposed" as const,
      question:"How should Go Core recover from an interrupted SQLite backup?",
      decision:"Use the online backup API and fail closed before enabling queries.",
      rationale:"Raw WAL file copying can omit committed transactions and expose stale deletion snapshots.",
      alternatives:"Raw file copy is rejected; external PostgreSQL is deferred pending real workload tests.",
      consequences:"Recovery must verify external deletion ledger before exposing any remembered content.",
      verificationPlan:"Execute online backup, interrupted migration and deleted-history restoration fixtures.",
    };
    expect(()=>ledger!.recordDecision("WORK-DEC1",first.leaseToken,{
      ...fields,decision:"short"})).toThrow(/substantial/);
    const recorded=ledger!.recordDecision("WORK-DEC1",first.leaseToken,fields);
    expect(recorded).toMatchObject({revision:1,status:"proposed"});
    expect(()=>ledger!.recordDecision("WORK-DEC1",first.leaseToken,{
      ...fields,expectedRevision:0})).toThrow(/current decision revision/);
    expect(ledger!.recordDecision("WORK-DEC1",first.leaseToken,{
      ...fields,expectedRevision:1,status:"decided"})).toMatchObject({revision:2});
    const history=ledger!.getDecision("WORK-DEC1");
    expect(history.history).toHaveLength(2);
    expect(history.decision.status).toBe("decided");
    ledger!.complete("WORK-DEC1",first.leaseToken,{
      summary:"A standalone SQLite backup decision is recorded for this task.",
      implementation:"Only DevControl decision-save changed local SQLite with versioned audit.",
      verification:"The record has complete alternatives and negative recovery tests.",
      remaining:"Production encryption and real recovery still need G2 and implementation.",
    });
    ledger!.report("WORK-DEC1",first.leaseToken,{kind:"sqlite_decision",
      reference:"decision:WORK-DEC1#revision=2"},true);
    expect(ledger!.verify("WORK-DEC1",first.leaseToken)).toMatchObject({
      passed:true,files:[],results:{sqlite_decision:{passed:true}}});
    expect(git("rev-parse","HEAD")).toBe(head);
    expect(git("status","--porcelain")).toBe("");
    expect(fs.existsSync(path.join(root,"docs/architecture/decisions"))).toBe(false);
    // The already frozen legacy docs-gated decision can *explicitly* opt in;
    // its frozen plan hash, file scope and gates are not silently rewritten.
    const second=ledger!.claim("WORK-DEC2","security-agent");
    expect(second.task.requiredGates).toEqual(["docs"]);
    ledger!.recordDecision("WORK-DEC2",second.leaseToken,{
      ...fields,question:"How can the iPhone authenticate against the local Go Core?",
      decision:"Use per-device revocable bearer credentials and server-verified TLS connections.",
    });
    ledger!.complete("WORK-DEC2",second.leaseToken,{
      summary:"Device authentication choice saved to SQLite, no Markdown was created.",
      implementation:"Existing frozen docs gate is replaced only for this explicitly recorded decision.",
      verification:"Reviewed offline and expired-token failure behavior without claiming product tests.",
    });
    ledger!.report("WORK-DEC2",second.leaseToken,{kind:"sqlite_decision",
      reference:"decision:WORK-DEC2#revision=1"},true);
    expect(ledger!.verify("WORK-DEC2",second.leaseToken)).toMatchObject({
      passed:true,files:[],results:{sqlite_decision:{passed:true}}});
    expect(ledger!.get("WORK-DEV1").status).toBe("ready");
    expect(ledger!.executionContract("WORK-DEC2").requiredGates).toEqual(["docs"]);
    expect(git("rev-parse","HEAD")).toBe(head);
  });
  it("normalizes old SQLite draft file-template hints without rewriting historical rows",()=>{
    ledger!.saveFeature({name:"old-guidance",description:"Legacy feature stored SQLite with file hints",
      layout:"flat",plan:{},draft:{specOutputs:["docs/specs/old-guidance/tasks.md"],
        guidance:"Agent 必须创建三个文件 requirements.md / design.md / tasks.md",
        structuredContent:{obsolete:true}}});
    const f=ledger!.getFeature("old-guidance");
    expect(f.draft.specOutputs).toEqual([]);
    expect(f.draft.guidance).toContain("不生成");
    expect(f.draft.structuredContent).toBeNull();
  });
  it("plans an entire version as simple single-action rows, blocks early coding, then atomically approves", async () => {
    save("docs/roadmap/test-version.md",
      "# Version\n\n| 阶段 | 描述 |\n| --- | --- |\n| F0 | 已验证基线 |\n| F1 | 接口准备 |\n| F2 | 联调发布 |\n");
    commit("freeze release scope");
    const items = [
      {id:"WORK-101",title:"实现本地事件创建接口",stageId:"F1",type:"development",
        owner:"Core Agent",platform:"Go",requirementIds:["FR-101"],
        dependsOn:["F0"],acceptance:"首次写入返回稳定事件编号",
        allowedPaths:["services/core/**"],requiredGates:["docs"]},
      {id:"WORK-102",title:"验证事件写入接口",stageId:"F1",type:"testing",
        owner:"QA Agent",platform:"Go",dependsOn:["WORK-101"],acceptance:"测试用例通过且附带执行日志",
        allowedPaths:["tests/contracts/**"],requiredGates:["docs"]},
      {id:"WORK-103",title:"执行跨端联调",stageId:"F2",type:"integration",
        owner:"Integration Agent",platform:"iOS/Go",dependsOn:["WORK-102"],acceptance:"联调请求正确生成持久事件",
        allowedPaths:["tests/contracts/**"],requiredGates:["docs"]},
      {id:"WORK-104",title:"验证版本发布清单",stageId:"F2",type:"release",
        owner:"Release Agent",platform:"Release",dependsOn:["WORK-103"],acceptance:"版本发布检查表逐项通过",
        allowedPaths:["docs/**"],requiredGates:["docs"]},
    ] as const;
    const plan={release:"V0.1",scopeSource:"docs/roadmap/test-version.md",
      rationale:"All current-version stages, independent development, testing, integration and final release evidence are included.",
      stages:[{id:"F0",verifiedTaskIds:["F0"]},{id:"F1"},{id:"F2"}],
      workItems:items.map(x=>({...x,dependsOn:[...x.dependsOn],
        allowedPaths:[...x.allowedPaths],requiredGates:[...x.requiredGates]}))};
    const withReview=(roster:any)=>({...roster,agentReview:{
      reviewer:"independent-quality-review-agent",
      method:"independent-agent-pass" as const,
      subjectHash:releaseReviewSubjectHash(roster as any),
      sourceRefs:["docs/roadmap/test-version.md"],
      reviewedStageIds:["F0","F1","F2"],
      checks:REVIEW_DIMENSIONS.map(dimension=>({
        dimension,conclusion:"Independently checked original scope and task evidence for "+dimension,
        workItemIds:["WORK-101","WORK-102","WORK-103","WORK-104"],
      })),
    }});
    const largeTitle={...plan,workItems:plan.workItems.map((item,index)=>index===0?
      {...item,title:"完成接口以及测试以及前后端全部功能"}:item)};
    const vague={...plan,workItems:plan.workItems.map((item,index)=>index===0?
      {...item,acceptance:"以真实证据证明：实现本地事件创建接口已按需求完成。"}:item)};
    expect(ledger!.reviewReleaseWork(vague as any).issues).toContain(
      "WORK-101: generic self-referential acceptance is not independently verifiable");
    expect(ledger!.reviewReleaseWork(largeTitle as any).passed).toBe(false);
    const draft=ledger!.stageReleaseWork(largeTitle as any,"planner");
    expect(draft.status).toBe("needs_revision");
    expect(()=>ledger!.approveReleasePlan("V0.1","owner","a".repeat(64)))
      .toThrow(/Use release-work-review and release-work-approve/);
    const web=createDevControlBoardServer(ledger!);
    await new Promise<void>(resolve=>web.listen(0,"127.0.0.1",resolve));
    try {
      const addr=web.address();
      const port=addr&&typeof addr==="object"?addr.port:0;
      const response=await fetch("http://127.0.0.1:"+port+"/api/release-work-plan");
      expect(response.status).toBe(200);
      const version=await response.json();
      expect(version.status).toBe("needs_revision");
      expect(version.proposal.plan.workItems[0].acceptance).toBe("首次写入返回稳定事件编号");
    } finally {await new Promise<void>(resolve=>web.close(()=>resolve()));}
    expect(ledger!.get("F0").status).toBe("verified");
    expect(()=>ledger!.approveReleaseWork("V0.1",draft.hash)).toThrow(/title must describe one bounded action/);
    expect(()=>ledger!.get("WORK-101")).toThrow();
    expect(ledger!.reviewReleaseWork(plan as any).issues)
      .toContain("Independent Agent semantic review missing: submit agentReview before version approval");
    const complete=withReview(plan);
    const review=ledger!.reviewReleaseWork(complete as any);
    expect(review).toMatchObject({passed:true,workItemCount:4});
    const strictPlan={...plan,qualityProfile:"task-detail-v1"};
    const strictReview=ledger!.reviewReleaseWork(withReview(strictPlan) as any);
    expect(strictReview.passed).toBe(false);
    expect(strictReview.issues).toContain("WORK-101: detailed task brief missing purpose");
    expect(strictReview.issues).toContain("WORK-101: detailed task brief missing testCases");
    expect(review.reviewSubjectHash).toBe(complete.agentReview.subjectHash);
    const stale={...complete,workItems:complete.workItems.map((item:any,index:number)=>index===0?
      {...item,acceptance:"首次写入后得到可持久查询的编号"}:item)};
    expect(ledger!.reviewReleaseWork(stale as any).issues)
      .toContain("Agent semantic review is stale: task/requirements/stage roster changed");
    const fakeReview={...complete,agentReview:{...complete.agentReview,
      checks:complete.agentReview.checks.map((check:any,index:number)=>index===0?{
        ...check,workItemIds:["MISSING-FAKE-TASK"]}:check)}};
    expect(ledger!.reviewReleaseWork(fakeReview as any).issues.some((issue:string)=>
      issue.includes("needs a reasoned conclusion and existing work-item examples"))).toBe(true);
    const uncovered={...plan,requiredRequirementIds:["FR-101","NFR-006"],
      requirementsSource:"docs/roadmap/test-version.md"};
    const missing=ledger!.reviewReleaseWork(uncovered as any);
    expect(missing.issues).toContain("Whole-version requirement NFR-006 has no independent work item");
    const manual={...plan,reviewFindings:[{id:"RISK-01",title:"Authorization policy not approved",
      detail:"Requires Owner architecture review before implementation",severity:"blocker",status:"open"}]};
    expect(ledger!.reviewReleaseWork(manual as any).issues.some((value:string)=>
      value.includes("Version review blocker RISK-01"))).toBe(true);
    const autonomousPlan={...plan,workItems:plan.workItems.map(item=>
      ({...item,owner:undefined,ownerRole:"Implementation Agent"})),
      reviewFindings:[{id:"RISK-01",title:"Authorization enforcement pending",
        detail:"Design decided; implementation and actual tests must follow",
        decision:"Keep all Core reads and writes behind a server-verified device credential.",
        nextAction:"Implement Core guard and confirm unauthorized requests cannot read user data.",
        decisionStatus:"decided",verificationStatus:"pending",status:"open",
        affectedIds:["WORK-101"],severity:"blocker"}]};
    const autonomous={...withReview(autonomousPlan),reviewFindings:autonomousPlan.reviewFindings};
    expect(ledger!.reviewReleaseWork(autonomous as any).passed).toBe(true);
    const fakePassed={...autonomous,reviewFindings:[{
      ...autonomous.reviewFindings[0],status:"resolved",verificationStatus:"passed"}]};
    expect(ledger!.reviewReleaseWork(fakePassed as any).issues).toContain(
      "Verification cannot pass without evidence and resolution: RISK-01");
    const fakeClosed={...autonomous,reviewFindings:[{
      ...autonomous.reviewFindings[0],status:"resolved"}]};
    expect(ledger!.reviewReleaseWork(fakeClosed as any).issues).toContain(
      "Unverified product outcome cannot be closed: RISK-01");
    const bypassed={...plan,workItems:plan.workItems.map(item=>
      item.id==="WORK-104"?{...item,dependsOn:["WORK-101"]}:item)};
    expect(ledger!.reviewReleaseWork(bypassed as any).issues.some((value:string)=>
      value.includes("Final release acceptance has no dependency chain"))).toBe(true);
    const pending=ledger!.stageReleaseWork(complete as any,"planner",draft.hash);
    expect(pending.status).toBe("review_pending");
    expect(()=>ledger!.claim("F1","agent")).toThrow();
    const approved=ledger!.approveReleaseWork("V0.1",pending.hash);
    expect(approved.added).toEqual(items.map(item=>item.id));
    const contract=ledger!.executionContract("WORK-101");
    expect(contract).toMatchObject({eligible:true,profile:"atomic-work-item"});
    const audit=ledger!.taskDetailAudit("WORK-101");
    expect(audit).toMatchObject({taskId:"WORK-101",passed:false,
      scope:"frozen",qualityProfile:"legacy",retroactiveGateApplied:false});
    expect(audit.missing).toContain("purpose");
    expect(ledger!.executionContract("WORK-101").eligible).toBe(true);
    expect(contract.spec).toMatchObject({title:"实现本地事件创建接口",
      acceptance:"首次写入返回稳定事件编号"});
    expect(ledger!.get("WORK-101").owner).toBe("Core Agent");
    expect(ledger!.claim("WORK-101","coding-agent").task.id).toBe("WORK-101");
  });
  it("turns a start_feature SQLite specification into a reviewed Feature task plan without release-wide files", async () => {
    ledger!.saveFeature({name:"event-ingest",description:"Persist auditable event messages with idempotency",layout:"flat",
      plan:{steps:[{id:"write-spec"}]},draft:{specLayout:"flat"}});
    ledger!.reviseFeature("event-ingest",{
      requirements:"FR-101: Authenticated requests are recorded once and can be replayed safely after restart.",
      design:"Use an isolated Core event handler backed by durable SQLite transactions and validated input shapes.",
      tasks:"Implement API ingestion, idempotency conflict handling, restart persistence and integration evidence.",
    },"planner",false);
    expect(ledger!.validateFeature("event-ingest").passed).toBe(true);
    const brief=ledger!.featureTaskBrief("event-ingest");
    expect(brief.readyForPlanning).toBe(true);
    expect(brief.requirementIds).toContain("FR-101");
    const node={
      id:"INGEST-LEAF",title:"Persist idempotent event payload using approved Core handler",kind:"leaf" as const,
      parentId:"INGEST-GROUP",dependsOn:["F0"],requirementIds:["FR-101"],
      scenario:"When a logged-in user retries a valid event, the server responds with one persistent record.",
      workflow:["Validate the caller's identity and canonicalize the input event body.",
        "Read the transaction-scoped idempotency key and detect a prior receipt.",
        "Write the event once and return the persisted identifier with provenance."],
      businessRules:["Never persist two records for the same caller and canonical request key.",
        "Conflicting payloads with a reused key must return a stable conflict response."],
      sourceRefs:["feature:event-ingest#requirements","feature:event-ingest#design"],
      reviewNotes:["The Core persistence decision must be already approved before coding begins."],
      verificationEvidence:["Run the real HTTP event ingestion integration test with recorded exit code.",
        "Run the persistent store restart test and attach the resulting Git HEAD."],
      inputs:["Authenticated user identity and canonical event payload with request key."],
      outputs:["A durable event identifier and a stable HTTP result containing provenance."],
      preconditions:["Storage migration and authentication contract have passed their gates."],
      stateTransitions:["Unseen request key becomes committed event, while retries return its identifier."],
      forbiddenChanges:["Do not modify Flutter clients, authentication design, or event protocol contracts."],
      stopConditions:["Stop and request approval if the storage layout or identity contract is not decided."],
      allowedChangedFiles:["services/core/ingest.go"],
      designRef:"feature:event-ingest#design",
      acceptance:"The initial event is persisted and exact retries cannot create duplicates after restart.",
      negativeCases:["A reused request key with different content produces conflict without writes.",
        "Unauthenticated requests must not create any durable event or idempotency entry."],
      testCases:["POST a valid first event and assert one durable event is created.",
        "Restart Core and repeat the event with matching identity and key."],
      outOfScope:["Client-side event rendering"],deliverables:["services/core/ingest.go","Core integration test evidence"],
      allowedPaths:["services/core/**"],requiredGates:["docs"],estimatedHours:4,
    };
    const plan={release:"V0.1",rationale:"Deliver one auditable event ingestion feature with clear restart semantics and no client-facing changes.",
      nodes:[{id:"INGEST-GROUP",title:"Core event ingestion",kind:"group" as const},node]};
    const weak={...plan,nodes:[plan.nodes[0],{...node,negativeCases:[]}]};
    expect(ledger!.reviewFeatureTasks("event-ingest",brief.feature.revision,weak).passed).toBe(false);
    const savedDraft=ledger!.stageFeatureTasks("event-ingest",brief.feature.revision,weak,"planning-agent");
    expect(savedDraft).toMatchObject({status:"needs_revision",executableTasksCreated:0});
    expect(ledger!.featureTaskPlan("event-ingest").review.issues.length).toBeGreaterThan(0);
    expect(ledger!.list().some(task=>task.id==="INGEST-LEAF")).toBe(false);
    expect(()=>ledger!.approveFeatureTasks("event-ingest","owner",savedDraft.hash))
      .toThrow(/INCOMPLETE_FEATURE_TASKS|specific negativeCases/);
    expect(ledger!.reviewFeatureTasks("event-ingest",brief.feature.revision-1,plan).passed).toBe(false);
    const reviewed=ledger!.reviewFeatureTasks("event-ingest",brief.feature.revision,plan);
    expect(reviewed).toMatchObject({passed:true,generatedLeaves:1,coveredFeatureRequirements:["FR-101"]});
    const before=ledger!.list().length;
    const pending=ledger!.proposeFeatureTasks("event-ingest",brief.feature.revision,plan,
      "planning-agent",savedDraft.hash);
    expect(pending.status).toBe("review_pending");
    expect(ledger!.list()).toHaveLength(before);
    expect(ledger!.listFeatureTaskPlans()).toHaveLength(1);
    expect(ledger!.listFeatureTaskPlans()[0].proposal.plan.nodes[1].scenario).toContain("logged-in user");
    const web=createDevControlBoardServer(ledger!);
    await new Promise<void>(resolve=>web.listen(0,"127.0.0.1",resolve));
    try {
      const address=web.address();
      const base="http://127.0.0.1:"+(address&&typeof address==="object"?address.port:0);
      const plans=await (await fetch(base+"/api/feature-task-plans")).json();
      expect(plans.plans[0].status).toBe("review_pending");
      expect(plans.plans[0].proposal.plan.nodes[1].id).toBe("INGEST-LEAF");
      expect(await (await fetch(base+"/")).text()).toContain("/api/feature-task-plans");
      expect((await fetch(base+"/api/feature-task-plans",{method:"POST"})).status).toBe(405);
    } finally { await new Promise<void>(resolve=>web.close(()=>resolve())); }
    expect(()=>ledger!.proposeFeatureTasks("event-ingest",brief.feature.revision,
      {...plan,rationale:"A different full proposed scope that was not explicitly revised by the Owner."},
      "planning-agent")).toThrow(/Pending Feature plan differs/);
    expect(ledger!.featureTaskPlan("event-ingest").proposalHash).toBe(pending.hash);
    expect(()=>ledger!.approveFeatureTasks("event-ingest","owner","0".repeat(64))).toThrow(/matching Feature proposal/);
    const expectedLocalApprover=ledger!.localDeveloper().name||ledger!.localDeveloper().device;
    const approved=ledger!.approveFeatureTasks("event-ingest","untrusted caller text",pending.hash);
    expect(approved.added).toEqual(["INGEST-GROUP","INGEST-LEAF"]);
    expect(ledger!.get("INGEST-LEAF").approvedBy).toBe(expectedLocalApprover);
    expect(ledger!.get("INGEST-LEAF").status).toBe("ready");
    expect(ledger!.get("INGEST-LEAF").dependsOn).toEqual(["F0"]);
    expect(ledger!.executionContract("INGEST-LEAF")).toMatchObject({eligible:true,profile:"spec-depth-v3"});
    expect(()=>ledger!.claim("INGEST-GROUP","agent")).toThrow(/leaf|group/i);
    const claimed=ledger!.claim("INGEST-LEAF","agent");
    expect(claimed.task.id).toBe("INGEST-LEAF");
    expect(ledger!.featureTaskPlan("event-ingest").status).toBe("frozen");
    expect(ledger!.release("INGEST-LEAF",claimed.leaseToken).released).toBe(true);
    ledger!.reviseFeature("event-ingest",{tasks:
      "Implement updated Core ingest and a new event idempotency conflict branch with additional state coverage."},
      "planner",false);
    expect(ledger!.executionContract("INGEST-LEAF").eligible).toBe(false);
    expect(()=>ledger!.claim("INGEST-LEAF","agent")).toThrow(/frozen plan/i);
    expect(fs.existsSync(path.join(root,"docs/specs/event-ingest/tasks.md"))).toBe(false);
  });
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

  it("stores all eight SRC-8 sections with revisions, evidence, task links and strict completion gates", () => {
    const bug = ledger!.recordWorkItem({ kind: "bug", title: "API restarts lose events",
      description: "Restart the service and the event disappears" });
    const initial = ledger!.bugDetail(bug.id);
    expect(initial.steps).toHaveLength(8);
    expect(initial.steps.every((step: any) => step.status === "pending" && step.revision === 0)).toBe(true);
    const update = (step: number, expectedRevision = 0, status: any = "completed") =>
      ledger!.updateBugStep({ id: bug.id, step, expectedRevision, status,
        summary: `Validated SRC-8 step ${step} with a reproducible observation`,
        evidence: [`tests/bug-regression.test.ts#step-${step}`], actor: "test-agent" });
    expect(() => update(2)).toThrow(/preceding SRC-8/);
    expect(() => ledger!.updateBugStep({ id: bug.id, step: 1, expectedRevision: 0,
      status: "completed", summary: "root cause", evidence: [], actor: "test-agent" }))
      .toThrow(/evidence/i);
    expect(update(1).step.revision).toBe(1);
    expect(() => update(1)).toThrow(/reload/);
    for (let step = 2; step <= 5; step++) update(step);
    expect(() => update(6)).toThrow(/repair and regression-test tasks/);
    expect(ledger!.linkBugTask(bug.id, "F1", "repair", "test-agent").role).toBe("repair");
    expect(() => update(6)).toThrow(/repair and regression-test tasks/);
    // The fixture's F0 is an existing, historically verified task.
    ledger!.linkBugTask(bug.id, "F0", "repair", "test-agent");
    ledger!.linkBugTask(bug.id, "F0", "test", "test-agent");
    expect(ledger!.linkBugTask(bug.id, "F0", "test", "test-agent").reused).toBe(true);
    // A linked, unverified repair task must still block closure.
    expect(() => update(6)).toThrow(/repair and regression-test tasks/);
    // A different Bug with only the verified fixture task may finish, after all SRC-8 evidence.
    const finished = ledger!.recordWorkItem({kind:"bug",title:"Missing warning on retry",description:"Reproduction and evidence"});
    ledger!.linkBugTask(finished.id,"F0","repair","test-agent");
    ledger!.linkBugTask(finished.id,"F0","test","test-agent");
    for (let step=1; step<=8; step++) {
      ledger!.updateBugStep({id:finished.id,step,status:"completed",expectedRevision:0,
        summary:`Verified step ${step}`,evidence:[`evidence#${step}`],actor:"test-agent"});
    }
    expect(ledger!.bugDetail(finished.id).status).toBe("verified");
    expect(() => ledger!.updateBugStep({id:finished.id,step:1,status:"blocked",
      summary:"Need reopening",evidence:[],expectedRevision:1,actor:"test-agent"}))
      .toThrow(/immutable/);
    const require = createRequire(import.meta.url);
    const {DatabaseSync} = require("node:sqlite") as {DatabaseSync:new(file:string)=>any};
    const db=new DatabaseSync(ledger!.databasePath);
    try {
      const revisions=db.prepare("SELECT count(*) AS total FROM dc_bug_step_revisions WHERE item_id=?")
        .get(finished.id);
      expect(revisions.total).toBe(8);
    } finally { db.close(); }
  });

  it("creates database-native feature drafts without Markdown and handles stable revisions", () => {
    const initial = ledger!.saveFeature({
      name: "personal-insights", description: "Provide evidence-backed insight cards",
      layout: "flat", plan: { planId: "feature-personal-insights", steps: [{ id: "design" }] },
      draft: { specLayout: "flat" },
    });
    expect(initial.revision).toBe(1);
    expect(ledger!.saveFeature({
      name: "personal-insights", description: "Provide evidence-backed insight cards",
      layout: "flat", plan: { planId: "feature-personal-insights", steps: [{ id: "other" }] },
      draft: { specLayout: "flat" },
    }).revision).toBe(1);
    expect(ledger!.validateFeature("personal-insights").passed).toBe(false);
    const result = ledger!.reviseFeature("personal-insights", {
      requirements: "FR-1: The client should surface meaningful evidence-backed insights for the user.",
      design: "An existing feature module renders the summary, without changing top-level architecture.",
      tasks: "1. Implement the existing feature widget. 2. Execute contract and acceptance tests.",
    }, "engineer", false);
    expect(result.revision).toBe(2);
    expect(ledger!.validateFeature("personal-insights").passed).toBe(true);
    expect(ledger!.getFeature("personal-insights").status).toBe("specified");
    const exported = ledger!.exportFeature("personal-insights");
    expect(exported).toContain("FR-1:");
    expect(JSON.parse(ledger!.exportFeature("personal-insights", "json")).revision).toBe(2);
    expect(fs.existsSync(path.join(root, "docs/specs/personal-insights/tasks.md"))).toBe(false);
    expect(ledger!.listFeatures()).toContainEqual(expect.objectContaining({ name: "personal-insights" }));
    expect(() => ledger!.saveFeature({
      name: "personal-insights", description: "Incompatible replacement", layout: "flat",
      plan: {}, draft: null,
    })).toThrow(/cannot be silently replaced/i);
  });

  it("deduplicates project Bugs and rejects semantically identical new tasks", () => {
    const first = ledger!.recordWorkItem({
      kind: "bug", title: "后台蓝牙同步 停止！", description: "First diagnosis",
    });
    const again = ledger!.recordWorkItem({
      kind: "bug", title: "后台蓝牙同步停止", description: "Duplicate report",
    });
    expect(first.id).toBe(again.id);
    expect(again.reused).toBe(true);
    expect(first.device).toBeTruthy();
    expect(first.creator).toBeTruthy();
    expect(ledger!.listWorkItems("bug")).toHaveLength(1);
    expect(() => ledger!.recordWorkItem({
      kind: "memory" as never, title: "BLE battery optimization", description: "Wrong subsystem",
    })).toThrow(/History Session/);
    create({ id: "NEYNA-290", title: "Implement X" });
    expect(() => create({ id: "NEYNA-291", title: "Implement   X!!!" })).toThrow(/matching task already exists/i);
    expect(create({ id: "NEYNA-292", title: "Implement X", dependsOn: ["F1"] }).id).toBe("NEYNA-292");
  });

  it("requires top-level architecture reconciliation and a real Git commit before design approval", () => {
    save("docs/architecture/overview.md", "# Overview\nInitial architecture baseline\n");
    commit("architecture baseline");
    ledger!.saveFeature({
      name: "watch-sensors", description: "Add sensor ingestion with new ownership boundary",
      layout: "flat", plan: {}, draft: {},
    });
    expect(() => ledger!.reviseFeature("watch-sensors", {
      design: "A native watch receiver becomes a new architectural component serving sensor data.",
    })).toThrow(/architectureImpact/);
    ledger!.reviseFeature("watch-sensors", {
      requirements: "FR-1: Collect real foreground sensor events and attach provenance in records.",
      design: "Introduce a native watch collector behind the Core ingestion API and preserve provenance.",
      tasks: "Implement watch ingestion and execute provenance contract and interruption tests.",
    }, "developer", true, "docs/architecture/overview.md");
    const outstanding = ledger!.listWorkItems("architecture_change");
    expect(outstanding).toHaveLength(1);
    expect(ledger!.validateFeature("watch-sensors")).toMatchObject({ passed: false });
    expect(() => ledger!.syncArchitecture(outstanding[0].id, "reviewer")).toThrow(/not changed/i);
    save("docs/architecture/overview.md",
      "# Overview\nWatch collector is a separate module owned by Core ingestion contracts.\n");
    commit("sync approved top-level architecture");
    expect(ledger!.syncArchitecture(outstanding[0].id, "reviewer").status).toBe("synced");
    expect(ledger!.validateFeature("watch-sensors").passed).toBe(true);
    expect(ledger!.getFeature("watch-sensors").status).toBe("specified");
  });

  it("isolates a new project's database inside its own Git root without adding tracked files", () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), "isolated-devcontrol-"));
    execFileSync("git", ["init", "-q"], { cwd: other });
    let otherLedger: ProjectTaskLedger | undefined;
    try {
      otherLedger = new ProjectTaskLedger(other);
      expect(otherLedger.databasePath).toBe(path.join(other, ".mcp-probe-kit/state/devcontrol.sqlite3"));
      expect(otherLedger.listFeatures()).toEqual([]);
      expect(otherLedger.listWorkItems()).toEqual([]);
      expect(execFileSync("git", ["status", "--porcelain"], { cwd: other, encoding: "utf8" })).toBe("");
      expect(otherLedger.databasePath).not.toBe(ledger!.databasePath);
      otherLedger.saveFeature({ name: "independent", description: "Independent project",
        layout: "flat", plan: {}, draft: null });
      expect(ledger!.listFeatures().find((item: any) => item.name === "independent")).toBeUndefined();
    } finally {
      otherLedger?.close(); fs.rmSync(other, { recursive: true, force: true });
    }
  });

  it("renders a valid zero-dependency workspace client with all required sections", () => {
    const output = projectHtml("safe-nonce");
    for (const section of [
      "view-overview", "view-product", "view-requirements",
      "view-architecture", "view-tasks", "view-docs",
    ]) {
      expect(output).toContain('id="' + section + '"');
    }
    expect(output).toContain('data-tasktab="not_started"');
    expect(output).toContain('data-tasktab="in_progress"');
    expect(output).toContain('data-tasktab="completed"');
    expect(output).not.toContain("/board?embedded=1");
    expect(output).toContain("工程治理");
    expect(output).toContain("任务总数（含待审核）");
    expect(output).toContain('nonce="safe-nonce"');
    const inlineScript = /<script nonce="safe-nonce">([\s\S]*?)<\/script>/.exec(output)?.[1];
    expect(inlineScript).toBeTruthy();
    expect(() => new vm.Script(inlineScript!)).not.toThrow();
    expect(output).not.toContain("<script src=");
  });

  it("builds newcomer project context from canonical docs with live task data", async () => {
    save("docs/README.md", [
      "# 项目文档索引",
      "| 主题 | 源文件 |",
      "| --- | --- |",
      "| 目标 | [愿景](product/vision.md) |",
      "| 需求 | [PRD](product/requirements.md) |",
      "| 架构 | [技术分层](architecture/overview.md) |",
      "| 路线图 | [版本](roadmap/releases.md) |",
    ].join("\n"));
    save("docs/product/vision.md",
      "# Neyna 长期愿景\n\n系统希望让用户拥有可信、可追溯的个人记忆与行动智能，而不是展示更多无证据功能。\n");
    save("docs/product/requirements.md", [
      "# 产品需求", "",
      "| ID | 需求 | 阶段 | 验收重点 | 对应 KR |",
      "| --- | --- | --- | --- | --- |",
      "| FR-001 | 来源可追溯 | P0 | 核验原始记录 | KR1.1 |",
      "| FR-002 | 记忆查询 | P0 | 引用支持 | KR1.3 |",
      "| NFR-001 | 隐私隔离 | 权限检查 |",
      "FR-001 重复说明不应重复计数。",
    ].join("\n"));
    save("docs/architecture/overview.md",
      "# 总体技术架构\n\nFlutter 前端接 Go Core，Desktop Agent Host 负责授权执行，不重复业务状态。\n");
    save("docs/roadmap/releases.md",
      "# 发布路线\n\nV0.1 先构建可验证的最小记忆输入与来源闭环。\n");
    save("docs/specs/memory/spec.md", "# 事件契约\n\n具体功能验收由 Spec 定义。\n");
    save("docs/architecture/decisions/README.md",
      "# 架构决策\n\n[ADR-0001](ADR-0001-example.md)\n");
    save("docs/architecture/decisions/ADR-0001-example.md",
      "# ADR-0001\n\n可追溯工程边界示例。\n");
    save("docs/README.md", fs.readFileSync(path.join(root, "docs/README.md"), "utf8") +
      "\n[关键设计决策](architecture/decisions/README.md)\n");
    const project = projectContext(root);
    expect(project.name).toBe(path.basename(root));
    expect(project.projectStatus).toBe("documented");
    expect(project.vision.title).toBe("Neyna 长期愿景");
    expect(project.vision.summary).toContain("可信、可追溯");
    expect(project.requirements.frCount).toBe(2);
    expect(project.requirements.nfrCount).toBe(1);
    expect(project.requirements.items).toEqual([
      { id: "FR-001", title: "来源可追溯", stage: "P0", acceptance: "核验原始记录" },
      { id: "FR-002", title: "记忆查询", stage: "P0", acceptance: "引用支持" },
      { id: "NFR-001", title: "隐私隔离", stage: "NFR", acceptance: "权限检查" },
    ]);
    expect(project.documents.some((d) => d.path === "docs/specs/memory/spec.md")).toBe(true);
    expect(project.documents.some((d) => d.path === "docs/architecture/decisions/ADR-0001-example.md"))
      .toBe(true);
    expect(readProjectDoc(root, "docs/product/vision.md").markdown).toContain("个人记忆");
    const server = createDevControlBoardServer(ledger!);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const bound = server.address();
      const base = "http://127.0.0.1:" + (bound && typeof bound === "object" ? bound.port : 0);
      const context = await (await fetch(base + "/api/project")).json();
      expect(context.vision.title).toBe("Neyna 长期愿景");
      const document = await (await fetch(base +
        "/api/docs?path=docs%2Farchitecture%2Foverview.md")).json();
      expect(document.markdown).toContain("Go Core");
      expect((await fetch(base + "/api/docs?path=docs%2Fhistory-session%2Fprivate.md")).status).toBe(404);
      expect((await fetch(base + "/api/docs?path=docs%2Fproduct%2Fmissing.md")).status).toBe(404);
      save("docs/product/vision.md", "# 最新愿景\n\n根据 Owner 变更后的单一源文件内容实时更新。\n");
      expect((await (await fetch(base + "/api/project")).json()).vision.title).toBe("最新愿景");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("disallows path traversal, symlink escapes and private session docs", () => {
    save("docs/README.md", "# 索引\n\n[安全](engineering/quality-gates.md)");
    save("docs/engineering/quality-gates.md", "# 门禁\n\n正常的工程规范。");
    save("docs/history-session/private.md", "# private");
    expect(() => safeProjectDocument(root, "../README.md")).toThrow();
    expect(() => safeProjectDocument(root, "docs/../../.neyna/devcontrol-plan.json")).toThrow();
    expect(() => safeProjectDocument(root, "docs/history-session/private.md")).toThrow();
    expect(() => readProjectDoc(root, "docs/history-session/private.md")).toThrow();
    save("private.md", "sensitive");
    fs.symlinkSync(path.join(root, "private.md"), path.join(root, "docs/engineering/leak.md"));
    expect(() => safeProjectDocument(root, "docs/engineering/leak.md")).toThrow();
    expect(() => readProjectDoc(root, "docs/engineering/leak.md")).toThrow();
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
      const meta = await (await fetch(base + "/api/meta")).json();
      expect(meta.version).toBe(WORKSPACE_SCHEMA_VERSION);
      expect(meta.root).toBe(root);
      expect(await page.text()).toContain("DevControl · 项目工作台");
      expect(page.headers.get("content-security-policy")).toContain("script-src 'nonce-");
      expect(page.headers.get("content-security-policy")).toContain("frame-src 'self'");
      expect(page.headers.get("x-frame-options")).toBe("DENY");
      const legacyPage = await fetch(base + "/board");
      expect(await legacyPage.text()).toContain("研发任务看板");
      expect(legacyPage.headers.get("x-frame-options")).toBe("SAMEORIGIN");
      const embedded = await fetch(base + "/board?embedded=1");
      expect(await embedded.text()).toContain('class="embedded"');
      const boardResponse = await fetch(base + "/api/board");
      expect(boardResponse.status).toBe(200);
      expect((await boardResponse.json()).columns.done[0].id).toBe("F0");
      const detailResponse = await fetch(base + "/api/tasks/F1");
      expect((await detailResponse.json()).task.id).toBe("F1");
      const proposal = ledger!.saveFeature({
        name: "ui-session", description: "Record project history in its native subsystem",
        layout: "flat", plan: {}, draft: null,
      });
      expect(proposal.revision).toBe(1);
      const featureList = await (await fetch(base + "/api/features")).json();
      expect(featureList.features.some((f: any) => f.name === "ui-session")).toBe(true);
      const exported = await fetch(base + "/api/features/ui-session/export?format=markdown");
      expect(exported.headers.get("content-disposition")).toContain("feature-ui-session.md");
      expect(await exported.text()).toContain("Record project history");
      const boot = bootstrapHistorySession(root, {
        session_key: "board-history", initial_user_input: "History Session project decision",
      });
      checkpointHistorySession(root, {
        session_key: "board-history", expected_path: boot.current_path, turn_id: "note",
        decisions: ["Keep History Session separate from global memory"],
      });
      const sessions = await (await fetch(base + "/api/history?q=History")).json();
      expect(sessions.total).toBeGreaterThan(0);
      const historyPage = await (await fetch(base + "/api/history/1?max_bytes=512")).json();
      expect(historyPage.content).toContain("History Session");
      expect((await fetch(base + "/api/history/99")).status).toBe(404);
      expect((await (await fetch(base + "/api/work-items")).json()).items).toEqual([]);
      const bug = ledger!.recordWorkItem({kind:"bug",title:"Board fetch fails",description:"Reproduce broken board read"});
      const bugResponse = await fetch(base + "/api/bugs/" + bug.id);
      expect(bugResponse.status).toBe(200);
      const bugDetails = await bugResponse.json();
      expect(bugDetails.steps).toHaveLength(8);
      expect(bugDetails.steps[0].title).toContain("现象");
      expect(bugDetails.steps[0].status).toBe("pending");
      expect((await fetch(base + "/api/bugs/BUG-AAAAAAAAAAAAAAA")).status).toBe(404);
      expect((await fetch(base + "/api/bugs/" + bug.id, {method:"POST"})).status).toBe(405);
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
