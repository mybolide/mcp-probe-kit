import { describe,expect,it } from "vitest";
import {
  auditAtomicWorkItemDetail,reviewDetailedWorkItems,reviewTaskQualityJudgments,
  requiredTaskDetailFields,releaseReviewSubjectHash,
  type AtomicWorkItem,type ReleaseWorkPlan,
} from "../release-work.js";

const shallow:AtomicWorkItem={
  id:"F2-24",title:"确认身份失效后的拒绝行为",stageId:"F2",
  type:"decision",platform:"Go Core",ownerRole:"技术架构",
  requirementIds:["FR-004","NFR-002"],
  acceptance:"本地会话失效的 API 响应可明确复现",
  allowedPaths:["docs/architecture/**"],requiredGates:["docs"],
};
const detailed:AtomicWorkItem={
  ...shallow,
  purpose:"确认失效的本地会话始终不能访问受保护的用户信息",
  scenario:"本地会话已经撤销，设备继续请求受保护的API资源",
  inputs:["已过期或者被撤销的设备访问凭据"],
  outputs:["明确的拒绝响应与可审计的决策结论"],
  workflow:["检查服务端真实会话状态", "执行拒绝并核对响应与日志"],
  businessRules:["无有效权限时不返回任何受保护的业务数据"],
  negativeCases:["已撤销但缓存仍可读取凭据的情况仍应拒绝"],
  testCases:["合法会话可访问而撤销会话必须收到拒绝结果"],
  verificationEvidence:["保留真实请求响应及服务端拒绝审计证据"],
  outOfScope:["不包含新用户创建或身份注册业务"],
  sourceRefs:["docs/architecture/decisions/ADR-0006-device-security.md"],
};

describe("reviewed atomic task description depth",()=>{
  it("separates decision-critical fields from optional implementation fields",()=>{
    const audit=auditAtomicWorkItemDetail(shallow);
    expect(audit.taskId).toBe("F2-24");
    expect(audit.passed).toBe(false);
    expect(audit.missing).toEqual([
      "purpose","scenario","inputs","outputs","businessRules",
      "verificationEvidence","outOfScope","sourceRefs",
    ]);
    expect(audit.suggested).toEqual(["workflow","negativeCases","testCases"]);
    expect(reviewDetailedWorkItems([shallow])).toContain("F2-24: detailed task brief missing purpose");
    expect(requiredTaskDetailFields("development")).toContain("testCases");
    expect(requiredTaskDetailFields("decision")).not.toContain("testCases");
  });

  it("accepts a bounded, source-backed task specification and rejects filler",()=>{
    expect(auditAtomicWorkItemDetail(detailed)).toEqual({
      taskId:"F2-24",passed:true,missing:[],suggested:[],issues:[],
    });
    expect(auditAtomicWorkItemDetail({...detailed,workflow:["做完即可"]}).issues)
      .toContain("F2-24: workflow is a placeholder, omit it if not applicable");
    expect(auditAtomicWorkItemDetail({...detailed,testCases:[" "]}).suggested).toContain("testCases");
    expect(auditAtomicWorkItemDetail({...detailed,purpose:"x".repeat(1201)}).issues)
      .toContain("F2-24: purpose is too broad for one atomic task");
    expect(auditAtomicWorkItemDetail({...detailed,purpose:detailed.acceptance}).issues)
      .toContain("F2-24: purpose repeats acceptance instead of explaining it");
    const noIrrelevantImplementation={
      ...detailed,workflow:undefined,negativeCases:undefined,testCases:undefined,
    };
    expect(auditAtomicWorkItemDetail(noIrrelevantImplementation)).toMatchObject({
      passed:true,missing:[],suggested:["workflow","negativeCases","testCases"],
    });
    const development={...noIrrelevantImplementation,type:"development" as const};
    expect(auditAtomicWorkItemDetail(development).missing)
      .toEqual(expect.arrayContaining(["workflow","negativeCases","testCases"]));
  });

  it("requires per-task independent judgment with sources and rejects copy-paste review",()=>{
    const other={...detailed,id:"F2-25",title:"验证无效身份会话的拒绝响应"};
    const basic={release:"V0.2",scopeSource:"docs/roadmap/releases.md",
      stages:[{id:"F2"}],workItems:[detailed,other],rationale:"Single task quality review",
      qualityProfile:"task-detail-v1" as const} satisfies ReleaseWorkPlan;
    expect(reviewTaskQualityJudgments(basic)).toContain("Independent task-level quality review missing");
    const review={
      reviewer:"separate-quality-reviewer",method:"independent-agent-pass" as const,
      subjectHash:releaseReviewSubjectHash(basic),sourceRefs:["docs/roadmap/releases.md"],
      reviewedStageIds:["F2"],checks:[],
      taskChecks:[{
        workItemId:"F2-24",outcome:"ready" as const,
        rationale:"The task resolves one authorization decision, and downstream HTTP testing remains separate.",
        sourceRefs:[detailed.sourceRefs![0]],
      },{
        workItemId:"F2-25",outcome:"ready" as const,
        rationale:"This separate task establishes a deterministic rejection test without implementing token issuance.",
        sourceRefs:[other.sourceRefs![0]],
      }],
    };
    expect(reviewTaskQualityJudgments({...basic,agentReview:review})).toEqual([]);
    const copied={...review,taskChecks:review.taskChecks.map(check=>({
      ...check,rationale:"The task contains detailed information and appears to be complete with good quality.",
    }))};
    expect(reviewTaskQualityJudgments({...basic,agentReview:copied}).some(issue=>
      issue.includes("repeats the rationale"))).toBe(true);
    const unsupported={...review,taskChecks:[{...review.taskChecks[0],sourceRefs:["docs/fake.md"]}]};
    expect(reviewTaskQualityJudgments({...basic,agentReview:unsupported})).toContain(
      "F2-24: task review must cite source references from that work item");
    expect(reviewTaskQualityJudgments({...basic,agentReview:{...review,taskChecks:review.taskChecks.slice(0,1)}}))
      .toContain("F2-25: independent task quality review missing");
  });

  it("binds opt-in strict profile and exact work detail to independent review hash",()=>{
    const legacy={release:"V0.1",scopeSource:"docs/roadmap/releases.md",
      stages:[{id:"F2"}],workItems:[shallow],rationale:"Minimum legacy rationale"} satisfies ReleaseWorkPlan;
    const strict={...legacy,qualityProfile:"task-detail-v1" as const};
    expect(releaseReviewSubjectHash(legacy)).not.toBe(releaseReviewSubjectHash(strict));
    expect(releaseReviewSubjectHash(strict)).not.toBe(releaseReviewSubjectHash({
      ...strict,workItems:[detailed],
    }));
  });
});
