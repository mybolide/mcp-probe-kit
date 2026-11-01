/** An actionable handoff to the HOST development agent.
 *
 * DevControl does not run an LLM, judge a proposal's technical correctness
 * or impersonate a second reviewer. It instructs the agent to do the work
 * and records the review and Owner's separate decision.
 */
export type ReviewKind = "incremental_work" | "scope_amendment";

export interface ReviewAgentAction {
  kind: ReviewKind;
  release: string;
  status: "agent_review_required" | "owner_authorization_required";
  responsible: "host_development_agent";
  proposalHash: string;
  reviewHash: string | null;
  affectedTaskIds: string[];
  nextTool: string;
  action: string;
  evidenceRequired: string[];
  ownerAuthorizationRequired: true;
  executableTasksChanged: false;
}

export function makeReviewAgentAction(input:{
  kind:ReviewKind;
  release:string;
  proposalHash:string;
  reviewHash:string|null;
  affectedTaskIds:string[];
}):ReviewAgentAction {
  const reviewPending=!input.reviewHash;
  const operation=input.kind==="incremental_work"
    ?"release-work-incremental":"release-work-scope";
  return {
    kind:input.kind,release:input.release,
    status:reviewPending?"agent_review_required":"owner_authorization_required",
    responsible:"host_development_agent",
    proposalHash:input.proposalHash,reviewHash:input.reviewHash,
    affectedTaskIds:input.affectedTaskIds,
    nextTool:reviewPending?operation+"-self-review":operation+"-approve",
    action:reviewPending
      ?"开发 Agent 现在必须从原始需求和代码实质复核范围、依赖、安全、成功及失败验收，提交与提案 Hash 绑定的开发者自审证据；独立复审按风险选用，不要等待第三方或 MCP 自行审核。"
      :"开发 Agent 现在必须向 Owner 呈交已完成的真实审核证据以及精确 proposalHash/reviewHash，取得 Owner 明确授权后才调用 approve；DevControl 不代替 Owner 批准。",
    evidenceRequired:reviewPending?[
      "原始需求、任务范围、依赖和原始源码的实质性审查结果",
      "成功、失败、权限和隐私验收的具体证据与引用",
      "开发者本人真实审查结论及与提案 Hash 匹配的证据；如实际采用独立复审，应记录其真实身份",
    ]:[
      "绑定 proposalHash 的真实实质审核结论（开发者自审或独立复审）",
      "Owner 对 proposalHash 与 reviewHash 两个精确哈希的明确授权",
    ],
    ownerAuthorizationRequired:true,executableTasksChanged:false,
  };
}
