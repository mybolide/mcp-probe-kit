import { describe,expect,it } from "vitest";
import {
  auditAtomicWorkItemDetail,reviewDetailedWorkItems,releaseReviewSubjectHash,
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
  it("reveals every missing source field in a legacy frozen task without inventing details",()=>{
    const audit=auditAtomicWorkItemDetail(shallow);
    expect(audit.taskId).toBe("F2-24");
    expect(audit.passed).toBe(false);
    expect(audit.missing).toEqual([
      "purpose","scenario","inputs","outputs","workflow","businessRules",
      "negativeCases","testCases","verificationEvidence","outOfScope","sourceRefs",
    ]);
    expect(reviewDetailedWorkItems([shallow])).toContain("F2-24: detailed task brief missing purpose");
  });

  it("accepts a bounded, source-backed task specification and rejects filler",()=>{
    expect(auditAtomicWorkItemDetail(detailed)).toEqual({
      taskId:"F2-24",passed:true,missing:[],issues:[],
    });
    expect(auditAtomicWorkItemDetail({...detailed,workflow:["做完即可"]}).missing).toContain("workflow");
    expect(auditAtomicWorkItemDetail({...detailed,testCases:[" "]}).missing).toContain("testCases");
    expect(auditAtomicWorkItemDetail({...detailed,purpose:"x".repeat(1201)}).issues)
      .toContain("F2-24: purpose too long for one atomic task");
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
