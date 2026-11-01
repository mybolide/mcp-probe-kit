/** Human-review preparation only. Never writes to a plan, task or Gate.
 *
 * This prioritizes real, not-yet-started tasks with incomplete specifications.
 * All statements are extracted from the actual frozen task and its linked
 * project requirements. Unknown answers remain review questions.
 */
import type {TaskReadability,RequirementReference} from './task-readability.js';

export interface ReviewCandidate {
  id:string;title:string;status:string;
  dependencies?:string[];
  priority?:number|null;
  approvalHold?:'scope_amendment'|'incremental_review'|null;
  supplement?:{
    pending?:{proposalHash:string;review?:{outcome?:string}|null}|null;
    approved?:{proposalHash:string}|null;
  };
  contract:Record<string,unknown>;
  readability:TaskReadability;
}
export interface ReviewItem {
  id:string;title:string;taskStatus:string;
  priority:number|null;
  approvalHold:'scope_amendment'|'incremental_review'|null;
  supplement:{
    status:'not_submitted'|'awaiting_independent_review'|
      'awaiting_owner_approval'|'review_rejected'|'approved';
    proposalHash:string|null;
  };
  approval:{planId:string|null;revision:number|null;planHash:string|null};
  readiness:'dependencies_verified'|'dependencies_pending'|'dependencies_unknown';
  dependencies:Array<{id:string;status:string}>;
  frozenFacts:{
    acceptance:string;
    allowedPaths:string[];
    gates:string[];
    requirements:RequirementReference[];
  };
  missingFields:string[];
  reviewQuestions:Array<{field:string;question:string}>;
  recommendation:string;
}
export interface ReviewQueue{
  policy:'review-draft-no-mutation';
  totalCandidates:number;
  batchSize:number;
  items:ReviewItem[];
}
const questions:Record<string,string>={
  purpose:'结合已批准的产品需求，说明本任务解决的具体问题，并核对是否改变原目标。',
  scenario:'在什么真实条件下触发这项任务？请引用现有产品需求或设计依据。',
  workflow:'在已有冻结文件范围内，需要哪些可执行步骤？请核对依赖和设计。',
  testCases:'哪些实际测试能证明现有验收条件？请明确运行环境和真实结果。',
  negativeCases:'应验证哪些已有合同涵盖的失败或边界情况？不能新增未批准的业务要求。',
  sourceRefs:'哪些批准的需求、设计决策或接口规格能证明本任务的实施依据？',
  acceptance:'请补充独立可验证的验收目标，作为正式合同变更送审。',
  requirementIds:'请确认这项任务对应哪些已批准的需求编号。',
  allowedPaths:'请通过正式范围审批确定允许修改的实际文件。',
  requiredGates:'请通过正式审核确认本项必须通过哪些真实 Gate。',
};
function stringList(value:unknown):string[]{
  return Array.isArray(value)?value.filter((v):v is string=>
    typeof v==='string'&&v.trim().length>0).map(v=>v.trim()):[];
}
function safePriority(p:unknown):number|null{
  return typeof p==='number'&&Number.isFinite(p)&&p>=0?p:null;
}
export function taskSpecReviewQueue(candidates:ReviewCandidate[],
  statusById:ReadonlyMap<string,string>,limit=12):ReviewQueue{
  const available=candidates.filter(candidate=>
    ['ready','draft'].includes(candidate.status)&&
    candidate.contract.authoritative===true&&
    ['needs_contract_review','needs_explanation'].includes(candidate.readability.status));
  const result=available.map(candidate=>{
    const source=candidate.contract.source as {
      planId?:string|null;revision?:number|null;planHash?:string|null
    }|undefined;
    const dependencies=(candidate.dependencies??stringList(candidate.contract.dependsOn))
      .map(id=>({id,status:statusById.get(id)??'unknown'}));
    const unknown=dependencies.some(x=>x.status==='unknown');
    const waiting=dependencies.some(x=>x.status!=='verified');
    const readiness:ReviewItem['readiness']=unknown?'dependencies_unknown':
      waiting?'dependencies_pending':'dependencies_verified';
    const acceptance=typeof candidate.contract.acceptance==='string'?
      candidate.contract.acceptance.trim():'';
    return {
      id:candidate.id,title:candidate.title,taskStatus:candidate.status,
      priority:safePriority(candidate.priority),
      approvalHold:candidate.approvalHold??null,
      supplement:candidate.supplement?.pending?{
        status:candidate.supplement.pending.review?.outcome==='rejected'?
          'review_rejected' as const:
          candidate.supplement.pending.review?.outcome==='approved'?
            'awaiting_owner_approval' as const:'awaiting_independent_review' as const,
        proposalHash:candidate.supplement.pending.proposalHash,
      }:candidate.supplement?.approved?{
        status:'approved' as const,proposalHash:candidate.supplement.approved.proposalHash,
      }:{status:'not_submitted' as const,proposalHash:null},
      approval:{planId:source?.planId??null,revision:source?.revision??null,
        planHash:source?.planHash??null},
      readiness,dependencies,
      frozenFacts:{
        acceptance,allowedPaths:stringList(candidate.contract.allowedPaths),
        gates:stringList(candidate.contract.requiredGates),
        requirements:candidate.readability.requirementRefs,
      },
      missingFields:candidate.readability.issues.map(issue=>issue.field),
      reviewQuestions:candidate.readability.issues.map(issue=>({
        field:issue.field,
        question:questions[issue.field]??'请核对已批准来源，并通过正式审批补充缺失内容。',
      })),
      recommendation:candidate.approvalHold==='scope_amendment'?
        '当前任务存在待审批的范围变更，须先完成正式范围复审和 Owner 授权；本批仅供规格说明核对。':
        candidate.approvalHold==='incremental_review'?
          '存在待审核的新增工作提案，须先处理正式审查；不能提前使用旧任务范围开发。':
        readiness==='dependencies_verified'?
        '前置依赖已 Verified；仍须确认范围、审批及领取条件，再按正式流程补充新合同。':
        readiness==='dependencies_unknown'?
          '依赖任务在当前台账中不可确认，先核对任务来源，不能直接进入开发。':
          '存在未 Verified 的前置任务，先完成真实依赖验收；规格可先整理但不得视为可执行。',
    } satisfies ReviewItem;
  });
  const ranks={dependencies_verified:0,dependencies_pending:1,dependencies_unknown:2};
  result.sort((a,b)=>Number(!!a.approvalHold)-Number(!!b.approvalHold)||
    ranks[a.readiness]-ranks[b.readiness]||
    a.dependencies.filter(x=>x.status!=='verified').length-
      b.dependencies.filter(x=>x.status!=='verified').length||
    a.dependencies.length-b.dependencies.length||
    (a.priority??Number.MAX_SAFE_INTEGER)-(b.priority??Number.MAX_SAFE_INTEGER)||
    a.id.localeCompare(b.id,'en',{numeric:true}));
  return {
    policy:'review-draft-no-mutation',
    totalCandidates:result.length,
    batchSize:Math.min(result.length,Math.max(0,Math.trunc(limit))),
    items:result.slice(0,Math.max(0,Math.trunc(limit))),
  };
}
