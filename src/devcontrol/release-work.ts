/** A real team task is ONE independently assignable and verifiable row. */
import { createHash } from "node:crypto";
export type WorkType =
  "analysis"|"decision"|"coordination"|"development"|"testing"|"integration"|"bugfix"|"release";
export interface AtomicWorkItem {
  id:string;
  title:string;
  stageId:string;
  featureName?:string;
  type:WorkType;
  platform:string;
  owner?:string;
  /** Planning responsibility; never masquerades as an assigned person/Agent. */
  ownerRole?:string;
  plannedStartAt?:string;
  plannedEndAt?:string;
  priority?:number;
  dependsOn?:string[];
  requirementIds?:string[];
  /** ONE observable outcome. No long embedded implementation document. */
  acceptance:string;
  /** Reviewed task-specific context, distinct from the single acceptance outcome. */
  purpose?:string;
  scenario?:string;
  inputs?:string[];
  outputs?:string[];
  workflow?:string[];
  businessRules?:string[];
  negativeCases?:string[];
  testCases?:string[];
  verificationEvidence?:string[];
  outOfScope?:string[];
  sourceRefs?:string[];
  remark?:string;
  blockingReason?:string;
  checklist?:string[];
  allowedPaths:string[];
  requiredGates:string[];
  estimatedHours?:number;
}

/** The host reviewer must explain EACH item, not rubber-stamp an 11-field form. */
export function reviewTaskQualityJudgments(plan:ReleaseWorkPlan):string[] {
  if(plan.qualityProfile!=="task-detail-v1")return [];
  const checks=plan.agentReview?.taskChecks;
  if(!Array.isArray(checks))return ["Independent task-level quality review missing"];
  const issues:string[]=[];
  const seen=new Set<string>();
  const known=new Map(plan.workItems.map(item=>[item.id,item]));
  const judgments=new Map<string,string>();
  for(const check of checks){
    if(!check||!known.has(check.workItemId)||seen.has(check.workItemId)){
      issues.push("Independent task quality review has unknown or duplicate work item");
      continue;
    }
    seen.add(check.workItemId);
    const item=known.get(check.workItemId)!;
    if(check.outcome!=="ready")issues.push(item.id+": independent quality reviewer requested revision");
    if(typeof check.rationale!=="string"||check.rationale.trim().length<32||
      placeholder.test(check.rationale.trim())||
      [item.title,item.acceptance].some(v=>normalizedDetail(v)===normalizedDetail(check.rationale??"")))
      issues.push(item.id+": independent task review needs a specific reason");
    const refs=Array.isArray(check.sourceRefs)?check.sourceRefs:[];
    if(!refs.length||refs.some(ref=>!item.sourceRefs?.includes(ref)))
      issues.push(item.id+": task review must cite source references from that work item");
    const normalized=normalizedDetail(check.rationale??"");
    if(judgments.has(normalized))
      issues.push(item.id+": independent task review repeats the rationale for "+judgments.get(normalized));
    else judgments.set(normalized,item.id);
  }
  for(const id of known.keys())if(!seen.has(id))
    issues.push(id+": independent task quality review missing");
  return issues;
}

export const TASK_DETAIL_FIELDS=[
  "purpose","scenario","inputs","outputs","workflow","businessRules",
  "negativeCases","testCases","verificationEvidence","outOfScope","sourceRefs",
] as const;

export type TaskDetailField=typeof TASK_DETAIL_FIELDS[number];
// Different jobs need different explanations. For example, a decision needs
// the constraints and proof of its choice, not fictional implementation steps
// or tests which cannot run until later implementation tasks.
const BASE_FIELDS:readonly TaskDetailField[]=[
  "purpose","outputs","verificationEvidence","sourceRefs",
];
const TASK_FIELDS_BY_TYPE:Record<WorkType,readonly TaskDetailField[]>={
  analysis:["scenario","inputs","businessRules","outOfScope"],
  decision:["scenario","inputs","businessRules","outOfScope"],
  coordination:["scenario","inputs","workflow","outOfScope"],
  development:["scenario","inputs","workflow","businessRules","negativeCases","testCases","outOfScope"],
  testing:["scenario","inputs","negativeCases","testCases","outOfScope"],
  integration:["scenario","inputs","workflow","businessRules","negativeCases","testCases","outOfScope"],
  bugfix:["scenario","inputs","workflow","businessRules","negativeCases","testCases","outOfScope"],
  release:["inputs","workflow","businessRules","negativeCases","testCases","outOfScope"],
};

export function requiredTaskDetailFields(type:WorkType):readonly TaskDetailField[]{
  return [...BASE_FIELDS,...(TASK_FIELDS_BY_TYPE[type]??[])];
}

const placeholder=/^(?:n\/?a|tbd|todo|无|暂无|待定|待补充|不适用|同上|按需求|按需实现|完成即可|做完即可|后续补充|参见上文)[。.!！]*$/i;
function normalizedDetail(value:string):string {
  return value.trim().toLowerCase().replace(/[\s，。,.、;；:：!！?？\-]/g,"");
}
/** Read-only depth audit. A field is not meaningful just because it is filled. */
export function auditAtomicWorkItemDetail(item:AtomicWorkItem):{
  taskId:string;passed:boolean;missing:TaskDetailField[];
  suggested:TaskDetailField[];issues:string[];
} {
  const missing:TaskDetailField[]=[];
  const suggested:TaskDetailField[]=[];
  const issues:string[]=[];
  const mandatory=new Set(requiredTaskDetailFields(item.type));
  const seen=new Map<string,string>();
  for(const field of TASK_DETAIL_FIELDS){
    const value=item[field];
    const values=typeof value==="string"?[value]:Array.isArray(value)?value:null;
    if(!values?.length||values.some(v=>typeof v!=="string"||!v.trim())){
      (mandatory.has(field)?missing:suggested).push(field);
      continue;
    }
    if((field==="purpose"||field==="scenario")&&typeof value!=="string"){
      issues.push(item.id+": "+field+" must be a specific explanation");
      continue;
    }
    if(field!=="purpose"&&field!=="scenario"&&!Array.isArray(value)){
      issues.push(item.id+": "+field+" must be a list of concrete facts");
      continue;
    }
    if(values.length>8||values.some(v=>v.length>1200)){
      issues.push(item.id+": "+field+" is too broad for one atomic task");
    }
    for(const raw of values){
      if(placeholder.test(raw.trim())){
        issues.push(item.id+": "+field+" is a placeholder, omit it if not applicable");
        continue;
      }
      const text=normalizedDetail(raw);
      if(field!=="sourceRefs"&&text===normalizedDetail(item.title))
        issues.push(item.id+": "+field+" repeats the title instead of explaining it");
      if(field!=="sourceRefs"&&text===normalizedDetail(item.acceptance))
        issues.push(item.id+": "+field+" repeats acceptance instead of explaining it");
      if(field!=="sourceRefs"&&seen.has(text))
        issues.push(item.id+": "+field+" duplicates "+seen.get(text));
      else if(field!=="sourceRefs")seen.set(text,field);
    }
    if(field==="workflow"&&mandatory.has(field)&&values.length<2)
      issues.push(item.id+": workflow must identify implementation and verification actions");
  }
  return {taskId:item.id,passed:missing.length===0&&issues.length===0,missing,suggested,issues};
}

export function reviewDetailedWorkItems(items:AtomicWorkItem[]):string[] {
  return items.flatMap(item=>{
    const audit=auditAtomicWorkItemDetail(item);
    return [...audit.missing.map(field=>item.id+": detailed task brief missing "+field),...audit.issues];
  });
}

/** Evidence of independent Agent reasoning, NOT proof that business coverage is correct. */
export type ReleaseReviewDimension =
  "scope_completeness"|"happy_path"|"failure_recovery"|
  "cross_component"|"security_privacy"|"test_release";
export const REVIEW_DIMENSIONS:readonly ReleaseReviewDimension[]=[
  "scope_completeness","happy_path","failure_recovery",
  "cross_component","security_privacy","test_release",
];
export interface ReleaseAgentReview {
  /** Audit label supplied by the host; not identity authentication. */
  reviewer:string;
  method:"independent-agent-pass";
  /** Hash binds the review to the exact stage, requirement and task roster. */
  subjectHash:string;
  /** Referenced canonical Git sources used in the independent read. */
  sourceRefs:string[];
  /** All version stages (including previously verified ones) were considered. */
  reviewedStageIds:string[];
  checks:{
    dimension:ReleaseReviewDimension;
    conclusion:string;
    /** Specific work-item examples, not just an unsupported 'passed' flag. */
    workItemIds:string[];
  }[];
  /** Required for task-detail-v1. Labels do not authenticate reviewers. */
  taskChecks?:{
    workItemId:string;
    outcome:"ready"|"needs_revision";
    rationale:string;
    sourceRefs:string[];
  }[];
}

export function releaseReviewSubjectHash(input:ReleaseWorkPlan):string {
  // Omit review itself to avoid a circular hash. Any reordered or modified
  // work item or changed requirement/stage scope invalidates the old review.
  return createHash("sha256").update(JSON.stringify({
    release:input.release,scopeSource:input.scopeSource,stages:input.stages,
    requiredRequirementIds:input.requiredRequirementIds??[],
    requirementsSource:input.requirementsSource??null,workItems:input.workItems,
    ...(input.qualityProfile?{qualityProfile:input.qualityProfile}:{}),
  })).digest("hex");
}

export function reviewAgentReview(plan:ReleaseWorkPlan):string[] {
  const review=plan.agentReview;
  if(!review)return ["Independent Agent semantic review missing: submit agentReview before version approval"];
  const issues:string[]=[];
  if(review.method!=="independent-agent-pass"||
    typeof review.reviewer!=="string"||!review.reviewer.trim())
    issues.push("Independent Agent reviewer label and separate review pass required");
  if(review.subjectHash!==releaseReviewSubjectHash(plan))
    issues.push("Agent semantic review is stale: task/requirements/stage roster changed");
  if(!Array.isArray(review.sourceRefs)||!review.sourceRefs.includes(plan.scopeSource)||
    (plan.requirementsSource&&!review.sourceRefs.includes(plan.requirementsSource))||
    review.sourceRefs.some(ref=>typeof ref!=="string"||
      !/^docs\/[\w.\-/]+\.md$/.test(ref)||ref.includes("..")))
    issues.push("Agent review must cite the current canonical Git scope and PRD sources");
  const stages=plan.stages?.map(x=>x.id)??[];
  if(!Array.isArray(review.reviewedStageIds)||new Set(review.reviewedStageIds).size!==stages.length||
    !stages.every(stage=>review.reviewedStageIds.includes(stage)))
    issues.push("Agent review must consider EVERY release stage, including verified history");
  if(!Array.isArray(review.checks))return [...issues,"Agent review checks missing"];
  const ids=new Set((plan.workItems??[]).map(item=>item.id));
  for(const dimension of REVIEW_DIMENSIONS){
    const matches=review.checks.filter(check=>check?.dimension===dimension);
    if(matches.length!==1)issues.push("Agent review must contain exactly one "+dimension+" check");
    for(const check of matches)if(typeof check.conclusion!=="string"||
      check.conclusion.trim().length<12||!Array.isArray(check.workItemIds)||
      !check.workItemIds.length||check.workItemIds.some(id=>!ids.has(id)))
      issues.push("Agent review "+dimension+" needs a reasoned conclusion and existing work-item examples");
  }
  if(review.checks.length!==REVIEW_DIMENSIONS.length)
    issues.push("Agent review has unexpected or duplicated dimensions");
  return issues;
}
export interface ReleaseWorkStage {
  id:string;
  features?:string[];
  verifiedTaskIds?:string[];
}
export interface ReleaseWorkPlan {
  release:string;
  /** Opt-in strict depth for new, separately reviewed plans. Existing frozen plans stay valid. */
  qualityProfile?:"task-detail-v1";
  scopeSource:string;
  stages:ReleaseWorkStage[];
  workItems:AtomicWorkItem[];
  rationale:string;
  /** Authored by a host Agent in a separate review pass, never generated by MCP. */
  agentReview?:ReleaseAgentReview;
  /** Version-scoped requirement coverage, distinct from the full future PRD. */
  requiredRequirementIds?:string[];
  requirementsSource?:string;
  /** Review findings live in SQLite, never as separate task Spec documents. */
  reviewFindings?:{
    id:string;title:string;detail:string;
    /** Architecture/product decision selected by the implementation reviewer. */
    decision?:string;
    /** Concrete acceptance work, not another request to ask the user. */
    nextAction?:string;
    /** Distinguish an unmade design decision from an unimplemented outcome. */
    decisionStatus?:"pending"|"decided";
    /** Product verification is separate from planning approval. */
    verificationStatus?:"pending"|"passed"|"not_required";
    verificationEvidenceRefs?:string[];
    severity:"blocker"|"warning";
    status:"open"|"resolved";
    affectedIds?:string[];
  }[];
}

export function scopeStages(source:string):string[] {
  return [...new Set([...source.matchAll(/^\|\s*([A-Z][A-Z0-9-]{1,19})\s*\|/gm)]
    .map(m=>m[1]).filter(id=>/^[A-Z]+\d+$/.test(id)))];
}

const idPattern=/^[A-Z][A-Z0-9-]{1,39}$/;
const types=new Set<WorkType>(["analysis","decision","coordination","development","testing",
  "integration","bugfix","release"]);
const knownGates=new Set(["docs","sqlite_decision","go_contract","devcontrol_tests","go_http_integration","go_postgres_live",
  "flutter_test","ios_device_e2e","v01_release_e2e"]);

export function reviewAtomicWorkItems(items:AtomicWorkItem[],stages:string[],
  existingIds:ReadonlySet<string>):string[] {
  const issues:string[]=[];
  if(!Array.isArray(items)||!items.length||items.length>1000)
    return ["Current version requires a complete list of 1–1000 independent work items"];
  const names=new Set<string>(),ids=new Set<string>();
  for(const item of items) {
    if(!item||!idPattern.test(item.id??"")||existingIds.has(item.id)||ids.has(item.id))
      issues.push((item?.id??"?")+": work item ID must be unique and unused");
    ids.add(item.id);
    if(typeof item.title!=="string"||item.title.trim().length<4||item.title.length>65||
      /[；;\n]|(?:以及|同时完成|全部功能|整个版本)/.test(item.title))
      issues.push(item.id+": title must describe one bounded action, not a bundle");
    if(names.has(item.stageId+"|"+item.title?.trim()))
      issues.push(item.id+": duplicate task objective in "+item.stageId);
    names.add(item.stageId+"|"+item.title?.trim());
    if(!stages.includes(item.stageId))issues.push(item.id+": stage not part of this version");
    if(!types.has(item.type))issues.push(item.id+": choose an actionable work type");
    if(!item.platform?.trim())issues.push(item.id+": platform required");
    // Planning assigns one accountable engineering role. The concrete agent
    // identity is captured when a task is actually claimed, not fabricated
    // hundreds of times before the team starts executing.
    if(!item.owner?.trim()&&!item.ownerRole?.trim())
      issues.push(item.id+": assign a responsible person/agent or engineering role before approval");
    if(!item.acceptance?.trim()||item.acceptance.trim().length<8)
      issues.push(item.id+": one verifiable completion condition required");
    else if(/^(?:以真实证据证明[:：]|(?:完成|通过|符合)需求(?:即可|就算)?$)/.test(item.acceptance.trim())||
      /已按需求完成[。.]?$/.test(item.acceptance.trim()))
      issues.push(item.id+": generic self-referential acceptance is not independently verifiable");
    if(item.checklist&&(!Array.isArray(item.checklist)||item.checklist.length>3))
      issues.push(item.id+": keep checklist small; split independent steps into their own rows");
    if(item.plannedStartAt&&!/^\d{4}-\d\d-\d\d$/.test(item.plannedStartAt))
      issues.push(item.id+": invalid planned start date");
    if(item.plannedEndAt&&!/^\d{4}-\d\d-\d\d$/.test(item.plannedEndAt))
      issues.push(item.id+": invalid planned end date");
    if(item.plannedStartAt&&item.plannedEndAt&&item.plannedStartAt>item.plannedEndAt)
      issues.push(item.id+": completion date precedes start");
    const sqliteDecision=item.type==="decision"&&
      item.requiredGates?.length===1&&item.requiredGates[0]==="sqlite_decision";
    if(!Array.isArray(item.allowedPaths)||(!item.allowedPaths.length&&!sqliteDecision)||
      item.allowedPaths.some(p=>typeof p!=="string"||p.startsWith("/")||p.split("/").includes("..")))
      issues.push(item.id+": safe bounded file scope required");
    if(!Array.isArray(item.requiredGates)||!item.requiredGates.length||
      item.requiredGates.some(g=>!knownGates.has(g)))
      issues.push(item.id+": real acceptance gate required");
    if(item.requiredGates?.includes("sqlite_decision")&&
      (!sqliteDecision||item.allowedPaths?.length))
      issues.push(item.id+": SQLite-only decision must have no Git file scope and only sqlite_decision gate");
    if(item.estimatedHours!==undefined&&(!Number.isFinite(item.estimatedHours)||
      item.estimatedHours<=0||item.estimatedHours>8))
      issues.push(item.id+": split any work over 8 hours");
  }
  const all=new Set([...ids,...existingIds]);
  const graph=new Map<string,string[]>();
  for(const item of items) {
    const deps=item.dependsOn??[];
    if(!Array.isArray(deps)) {issues.push(item.id+": invalid dependencies");continue;}
    for(const dep of deps) if(!all.has(dep)||dep===item.id)
      issues.push(item.id+": unknown/self dependency "+dep);
    graph.set(item.id,deps.filter(d=>ids.has(d)));
  }
  const seen=new Set<string>(),visiting=new Set<string>();
  const visit=(id:string):void=>{
    if(visiting.has(id)){issues.push(id+": circular dependency");return;}
    if(seen.has(id))return;
    visiting.add(id);
    for(const dep of graph.get(id)??[])visit(dep);
    visiting.delete(id);seen.add(id);
  };
  for(const id of ids)visit(id);
  for(const type of ["testing","integration","release"])
    if(!items.some(item=>item.type===type))issues.push("Version lacks independent "+type+" work item");
  // Final release approval must be downstream of every actual QA/integration
  // row. Otherwise a version may be released while its detailed tests remain undone.
  const releaseIds=items.filter(item=>item.type==="release").map(item=>item.id);
  const reachable=new Set<string>();
  const walk=(id:string):void=>{
    if(reachable.has(id))return;
    reachable.add(id);
    for(const dep of graph.get(id)??[])walk(dep);
  };
  for(const id of releaseIds)walk(id);
  const unlinked=items.filter(item=>["testing","integration"].includes(item.type)&&
    !reachable.has(item.id)).map(item=>item.id);
  if(unlinked.length)issues.push("Final release acceptance has no dependency chain from "+
    unlinked.length+" testing/integration work items: "+unlinked.slice(0,12).join(", ")+
    (unlinked.length>12?" …":""));
  return issues;
}
