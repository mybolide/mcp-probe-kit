/**
 * Narrow, project-independent changes to frozen release work-file scopes.
 * Approval is separate from proposal and independent review; an assessment
 * alone never changes executable work or the historical frozen snapshot.
 */
import { createHash } from "node:crypto";

export interface ReleaseWorkScopeAmendment {
  release:string;
  baseRevision:number;
  baseHash:string;
  changes:{taskId:string;addAllowedPaths:string[]}[];
  rationale:string;
  alternatives:string;
  verificationPlan:string;
  sourceRefs:string[];
}

export interface ReleaseWorkAmendmentReview {
  reviewer:string;
  method:"independent-agent-pass";
  subjectHash:string;
  affectedTaskIds:string[];
  scopeAssessment:string;
  dependencyAssessment:string;
  securityAndTestAssessment:string;
  sourceRefs:string[];
}

export function amendmentSubjectHash(input:ReleaseWorkScopeAmendment):string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export function checkAmendmentShape(input:ReleaseWorkScopeAmendment):string[] {
  const issues:string[]=[];
  const text=(value:unknown,min:number,max=5000)=>
    typeof value==="string"&&value.trim().length>=min&&value.length<=max;
  if(!input||!text(input.release,1,40)||!Number.isSafeInteger(input.baseRevision)||
    input.baseRevision<1||!(/^[a-f0-9]{64}$/.test(input.baseHash??"")))
    return ["Frozen release, positive base revision and exact 64-character base hash required"];
  for(const k of ["rationale","alternatives","verificationPlan"] as const)
    if(!text(input[k],30))issues.push(k+" requires a specific reasoned explanation");
  if(!Array.isArray(input.sourceRefs)||!input.sourceRefs.length||
    input.sourceRefs.some(ref=>!text(ref,5,400)))
    issues.push("Amendment must cite concrete tracked task, requirement or source references");
  if(!Array.isArray(input.changes)||!input.changes.length||input.changes.length>50)
    issues.push("Specify 1 to 50 affected work items");
  else {
    const seen=new Set<string>();
    for(const change of input.changes){
      if(!change||!text(change.taskId,2,120)||seen.has(change.taskId)){
        issues.push("Work-item IDs must be unique and nonempty");
        continue;
      }
      seen.add(change.taskId);
      if(!Array.isArray(change.addAllowedPaths)||!change.addAllowedPaths.length||
        change.addAllowedPaths.length>20||
        new Set(change.addAllowedPaths).size!==change.addAllowedPaths.length||
        change.addAllowedPaths.some(path=>typeof path!=="string"||path.length>240||
          !/^[a-zA-Z0-9_.\-/]+(?:\/\*\*)?$/.test(path)||
          path.startsWith("/")||path.split("/").some(p=>p===".."||p==="."||p===".git"||!p)||
          path.includes("//")))
        issues.push(change.taskId+": provide unique, safe project-relative file paths");
    }
  }
  return issues;
}

export function checkAmendmentReview(review:ReleaseWorkAmendmentReview,
  proposer:string,subjectHash:string,affectedTaskIds:string[]):string[]{
  const issues:string[]=[];
  if(!review||review.method!=="independent-agent-pass"||
    typeof review.reviewer!=="string"||review.reviewer.trim().length<3||
    review.reviewer===proposer)
    issues.push("Distinct independent reviewer label required");
  if(review?.subjectHash!==subjectHash)issues.push("Independent review refers to a stale amendment");
  if(!Array.isArray(review?.affectedTaskIds)||
    review.affectedTaskIds.length!==affectedTaskIds.length||
    !affectedTaskIds.every(id=>review.affectedTaskIds.includes(id)))
    issues.push("Independent review must consider every affected task");
  for(const field of ["scopeAssessment","dependencyAssessment","securityAndTestAssessment"] as const)
    if(typeof review?.[field]!=="string"||review[field].trim().length<40)
      issues.push(field+" needs concrete independent reasoning");
  if(!Array.isArray(review?.sourceRefs)||!review.sourceRefs.length||
    review.sourceRefs.some(ref=>typeof ref!=="string"||ref.trim().length<5))
    issues.push("Independent review must cite actual source references");
  return issues;
}
