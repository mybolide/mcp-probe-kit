/** Additive, reviewed task specification clarification, never a replacement
 * for the original immutable approved release plan. */
import {createHash} from 'node:crypto';

export const SUPPLEMENT_FIELDS = [
  'purpose','scenario','workflow','testCases','negativeCases','sourceRefs',
] as const;
export type SupplementField=typeof SUPPLEMENT_FIELDS[number];
export type SupplementFields=Partial<Record<SupplementField,string|string[]>>;
export interface TaskSpecSupplementProposal {
  taskId:string;
  expectedPlanHash:string;
  expectedPlanRevision:number;
  fields:SupplementFields;
  reason:string;
}
export interface TaskSpecSupplementReview {
  reviewer:string;
  findings:string;
  sourceRefs:string[];
  outcome:'approved'|'rejected';
}
export type SupplementReviewMode='developer'|'independent';
export function proposalHash(proposal:TaskSpecSupplementProposal):string {
  return createHash('sha256').update(JSON.stringify({
    taskId:proposal.taskId,expectedPlanHash:proposal.expectedPlanHash,
    expectedPlanRevision:proposal.expectedPlanRevision,
    fields:Object.fromEntries(SUPPLEMENT_FIELDS.filter(f=>f in proposal.fields)
      .map(f=>[f,proposal.fields[f]])),reason:proposal.reason,
  })).digest('hex');
}
export function reviewHash(review:TaskSpecSupplementReview,hash:string,
  mode:SupplementReviewMode='independent'):string {
  return createHash('sha256').update(JSON.stringify({hash,mode,review})).digest('hex');
}
export function validateProposal(proposal:unknown,
  original:Record<string,unknown>):string[] {
  const issues:string[]=[];
  if(!proposal||typeof proposal!=='object'||Array.isArray(proposal))return ['Invalid proposal'];
  const p=proposal as Record<string,any>;
  if(typeof p.taskId!=='string'||!p.taskId.trim())issues.push('Task ID required');
  if(typeof p.expectedPlanHash!=='string'||!p.expectedPlanHash.trim())
    issues.push('Exact original approved plan hash required');
  if(!Number.isInteger(p.expectedPlanRevision)||p.expectedPlanRevision<1)
    issues.push('Exact positive original plan revision required');
  if(typeof p.reason!=='string'||p.reason.trim().length<30)
    issues.push('A concrete reason of at least 30 characters is required');
  if(!p.fields||typeof p.fields!=='object'||Array.isArray(p.fields))
    return [...issues,'Fields must be a dictionary'];
  const keys=Object.keys(p.fields);
  if(!keys.length)issues.push('At least one clarification required');
  for(const key of keys){
    if(!(SUPPLEMENT_FIELDS as readonly string[]).includes(key)){
      issues.push('Frozen requirement or scope cannot be amended here: '+key);continue;
    }
    const value=p.fields[key];
    const items=typeof value==='string'?[value]:value;
    if(!Array.isArray(items)||!items.length||
      items.some(x=>typeof x!=='string'||x.trim().length<12||x.length>3000))
      issues.push('Clarification must contain concrete 12–3000 character text: '+key);
    if(['workflow','testCases','negativeCases','sourceRefs'].includes(key)&&
      !Array.isArray(value))issues.push(key+' must be an array');
    if(['purpose','scenario'].includes(key)&&typeof value!=='string')
      issues.push(key+' must be a string');
    const existing=original[key];
    if(typeof existing==='string'&&existing.trim()||
      Array.isArray(existing)&&existing.some(x=>typeof x==='string'&&x.trim()))
      issues.push('Previously approved text cannot be overwritten: '+key);
  }
  if((!Array.isArray(p.fields.sourceRefs)||!p.fields.sourceRefs.length)&&
    (!Array.isArray(original.sourceRefs)||!original.sourceRefs.length))
    issues.push('Reviewed sourceRefs must be supplied alongside the supplement');
  if(JSON.stringify(p).length>28000)issues.push('Supplement exceeds maximum size');
  return issues;
}
export function validateReview(review:unknown,proposer:string,
  originalRefs:string[],mode:SupplementReviewMode='independent'):string[] {
  if(!review||typeof review!=='object'||Array.isArray(review))return ['Invalid review'];
  const r=review as Record<string,any>,issues:string[]=[];
  if(typeof r.reviewer!=='string'||r.reviewer.trim().length<2)
    issues.push('Named reviewer is required');
  else if(mode==='independent'&&r.reviewer.trim()===proposer)
    issues.push('Independent reviewer must differ from proposal author');
  else if(mode==='developer'&&r.reviewer.trim()!==proposer)
    issues.push('Developer self-review must use the actual proposer identity');
  if(r.outcome!=='approved'&&r.outcome!=='rejected')issues.push('Review outcome required');
  if(typeof r.findings!=='string'||r.findings.trim().length<60)
    issues.push('Substantive review findings must be at least 60 characters');
  if(!Array.isArray(r.sourceRefs)||!r.sourceRefs.length||
    r.sourceRefs.some((s:unknown)=>typeof s!=='string'||s.length<3))
    issues.push('Specific source references are required');
  else if(!r.sourceRefs.some((s:string)=>originalRefs.includes(s)))
    issues.push('Review must cite a source included in the proposed supplement');
  return issues;
}
