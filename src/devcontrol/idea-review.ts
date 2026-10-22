/** New ideas are planning candidates, NEVER executable work orders. */
import { createHash } from "node:crypto";

export type IdeaRecommendation = "adopt"|"defer"|"reject";
export type IdeaPlacement = "within_task"|"after_task"|"future_release"|"none";
export interface IdeaAssessment {
  recommendation:IdeaRecommendation;
  placement:IdeaPlacement;
  targetStageId:string;
  targetTaskId?:string;
  affectedTaskIds:string[];
  rationale:string;
  alternatives:string;
  dependencyImpact:string;
  securityAndTestImpact:string;
  versionImpact:string;
  evidenceRefs:string[];
  assessedBy:string;
}
export type IdeaReviewDimension =
  "product_fit"|"dependency_integrity"|"timing_priority"|"security_and_testing";
export const IDEA_REVIEW_DIMENSIONS:readonly IdeaReviewDimension[]=[
  "product_fit","dependency_integrity","timing_priority","security_and_testing",
];
export interface IdeaIndependentReview {
  reviewer:string;
  method:"independent-agent-pass";
  subjectHash:string;
  checks:{dimension:IdeaReviewDimension;conclusion:string;taskIds:string[]}[];
}

export function ideaSubjectHash(idea:{
  id:string;release:string;title:string;description:string;sourceRef:string;
  baselineHash:string;assessment:IdeaAssessment;
}):string {
  return createHash("sha256").update(JSON.stringify(idea)).digest("hex");
}

const sufficient=(v:unknown,min=12,max=16000):v is string=>
  typeof v==="string"&&v.trim().length>=min&&v.length<=max;
export function assessIdeaShape(
  assessment:IdeaAssessment,knownStages:ReadonlySet<string>,
  knownTasks:ReadonlySet<string>,
):string[]{
  const issues:string[]=[];
  if(!assessment||!["adopt","defer","reject"].includes(assessment.recommendation))
    return ["recommendation must be adopt, defer or reject"];
  if(!["within_task","after_task","future_release","none"].includes(assessment.placement))
    issues.push("placement must identify a real insertion strategy");
  if(!sufficient(assessment.assessedBy,2,120))issues.push("assessedBy label required");
  for(const key of ["rationale","alternatives","dependencyImpact",
    "securityAndTestImpact","versionImpact"] as const)
    if(!sufficient(assessment[key]))issues.push(key+" requires a reasoned analysis");
  if(!Array.isArray(assessment.evidenceRefs)||!assessment.evidenceRefs.length||
    assessment.evidenceRefs.some(ref=>!sufficient(ref,3,400)))
    issues.push("cite concrete original requirement/task/code evidence");
  if(!Array.isArray(assessment.affectedTaskIds)||
    new Set(assessment.affectedTaskIds).size!==assessment.affectedTaskIds.length||
    assessment.affectedTaskIds.some(id=>!knownTasks.has(id)))
    issues.push("affectedTaskIds must only reference actual frozen tasks");
  if(assessment.recommendation==="reject"&&assessment.placement!=="none")
    issues.push("rejected idea cannot be scheduled");
  if(assessment.recommendation!=="reject"&&assessment.placement==="none")
    issues.push("adopted/deferred ideas need a concrete timing recommendation");
  if(["within_task","after_task"].includes(assessment.placement)){
    if(!assessment.targetTaskId||!knownTasks.has(assessment.targetTaskId))
      issues.push("insertion targetTaskId must exist in frozen release");
    if(!assessment.affectedTaskIds?.includes(assessment.targetTaskId??""))
      issues.push("targetTaskId must be included among affected work items");
    if(!knownStages.has(assessment.targetStageId))
      issues.push("targetStageId must be an existing release stage");
  }else if(assessment.placement==="future_release"){
    if(!sufficient(assessment.targetStageId,2,120))
      issues.push("name a proposed future release/stage");
    if(assessment.targetTaskId)issues.push("future release cannot claim a current task");
  }else if(assessment.placement==="none"&&
    (assessment.targetStageId||assessment.targetTaskId))
    issues.push("rejected ideas cannot claim an insertion stage");
  return issues;
}
export function reviewIdeaShape(review:IdeaIndependentReview,assessor:string,
  subjectHash:string,knownTasks:ReadonlySet<string>):string[]{
  const issues:string[]=[];
  if(!review||review.method!=="independent-agent-pass"||
    !sufficient(review.reviewer,2,120)||review.reviewer===assessor)
    issues.push("separate independent Agent review label required");
  if(review?.subjectHash!==subjectHash)issues.push("stale idea impact assessment hash");
  if(!Array.isArray(review?.checks))return [...issues,"four independent review checks required"];
  if(review.checks.length!==IDEA_REVIEW_DIMENSIONS.length)
    issues.push("exactly four separate review dimensions required");
  for(const dimension of IDEA_REVIEW_DIMENSIONS){
    const matches=review.checks.filter(c=>c?.dimension===dimension);
    if(matches.length!==1)issues.push(dimension+" review missing or duplicated");
    for(const check of matches){
      if(!sufficient(check.conclusion)||!Array.isArray(check.taskIds)||
        check.taskIds.some(id=>!knownTasks.has(id)))
        issues.push(dimension+" needs concrete reasoning and valid task IDs");
    }
  }
  return issues;
}
