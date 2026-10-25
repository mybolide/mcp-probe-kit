/** Append-only, version-pinned work additions for an already frozen release.
 * Existing accepted outcomes, paths and gates cannot be rewritten here.
 */
import { createHash } from "node:crypto";
import type { AtomicWorkItem } from "./release-work.js";

export interface ReleaseWorkIncrementalAmendment {
  release:string;
  baseRevision:number;
  baseHash:string;
  addWorkItems:AtomicWorkItem[];
  addDependencies:{taskId:string;dependsOn:string[]}[];
  rationale:string;
  alternatives:string;
  verificationPlan:string;
  sourceRefs:string[];
}

export interface ReleaseWorkIncrementalReview {
  reviewer:string;
  method:"independent-agent-pass";
  subjectHash:string;
  affectedTaskIds:string[];
  scopeAssessment:string;
  dependencyAssessment:string;
  securityAndTestAssessment:string;
  sourceRefs:string[];
}

export function incrementalSubjectHash(input:ReleaseWorkIncrementalAmendment):string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

const clean=(value:unknown,min:number,max=5000):boolean=>
  typeof value==="string"&&value.trim().length>=min&&value.length<=max;

/** Pure shape validation. Database consistency is checked by the ledger. */
export function checkIncrementalShape(input:ReleaseWorkIncrementalAmendment):string[] {
  if(!input||!clean(input.release,1,40)||!Number.isSafeInteger(input.baseRevision)||
    input.baseRevision<1||!/^[a-f0-9]{64}$/.test(input.baseHash??""))
    return ["Frozen release, positive base revision and exact base hash required"];
  const issues:string[]=[];
  for(const key of ["rationale","alternatives","verificationPlan"] as const)
    if(!clean(input[key],30))issues.push(key+" requires concrete reasoning");
  if(!Array.isArray(input.sourceRefs)||!input.sourceRefs.length||
    input.sourceRefs.some(ref=>!clean(ref,5,400)))
    issues.push("Cite real source references for this amendment");
  if(!Array.isArray(input.addWorkItems)||input.addWorkItems.length<1||
    input.addWorkItems.length>20)
    issues.push("Add 1–20 independently bounded atomic work items");
  if(!Array.isArray(input.addDependencies)||input.addDependencies.length>40)
    issues.push("Provide a bounded dependency augmentation list");
  return issues;
}

export function checkIncrementalIndependentReview(review:ReleaseWorkIncrementalReview,
  proposer:string,subjectHash:string,taskIds:string[],refs:string[]):string[] {
  const issues:string[]=[];
  if(!review||review.method!=="independent-agent-pass"||
    !clean(review.reviewer,3,120)||review.reviewer===proposer)
    issues.push("A distinct independent reviewer is required");
  if(review?.subjectHash!==subjectHash)
    issues.push("Independent review hash does not match the staged proposal");
  if(!Array.isArray(review?.affectedTaskIds)||
    review.affectedTaskIds.length!==taskIds.length||
    new Set(review.affectedTaskIds).size!==taskIds.length||
    !taskIds.every(id=>review.affectedTaskIds.includes(id)))
    issues.push("Independent review must cover each new and affected task");
  for(const key of ["scopeAssessment","dependencyAssessment","securityAndTestAssessment"] as const)
    if(!clean(review?.[key],40))issues.push(key+" requires specific independent reasoning");
  if(!Array.isArray(review?.sourceRefs)||!review.sourceRefs.some(ref=>refs.includes(ref)))
    issues.push("Independent reviewer must cite a staged source reference");
  return issues;
}
