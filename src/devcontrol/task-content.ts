/**
 * Two purpose-built descriptions for ONE task. These are append-only task
 * content, NEVER a second task ledger or a substitute for the frozen plan.
 * Approval, scope, Gates, actual blockers and delivery remain authoritative
 * only in the original SQLite task and frozen planning records.
 */
import {createHash} from 'node:crypto';

export type TaskContentAudience='human'|'ai';
export type TaskContentChange='editorial'|'clarification'|'material';

export interface HumanTaskOverview {
  why:string;
  work:string[];
  effects:string[];
  scenarios:string[];
  businessAcceptance:string[];
  exclusions:string[];
}

export interface AiExecutionBrief {
  context:string[];
  prerequisites:string[];
  inputs:string[];
  outputs:string[];
  invariants:string[];
  steps:string[];
  failureRecovery:string[];
  tests:string[];
  evidence:string[];
  stopConditions:string[];
}

export type TaskContentDocument=HumanTaskOverview|AiExecutionBrief;

const fields:{human:Record<keyof HumanTaskOverview,'text'|'list'>;
  ai:Record<keyof AiExecutionBrief,'list'>}={
  human:{why:'text',work:'list',effects:'list',scenarios:'list',
    businessAcceptance:'list',exclusions:'list'},
  ai:{context:'list',prerequisites:'list',inputs:'list',outputs:'list',
    invariants:'list',steps:'list',failureRecovery:'list',tests:'list',
    evidence:'list',stopConditions:'list'},
};
const mandatory={human:new Set(['why','work','effects','businessAcceptance']),
  ai:new Set(['context','invariants','steps','tests','evidence','stopConditions'])};
const placeholder=/^(?:tbd|todo|n\/?a|无|暂无|待补|待定|同上|按需|见合同|做完即可|参见上文)[。.!！]*$/i;

export function taskContentHash(audience:TaskContentAudience,content:TaskContentDocument):string{
  return createHash('sha256').update(JSON.stringify({schema:'task-content-v1',audience,content}))
    .digest('hex');
}

/** Canonical field order makes revisions independently addressable by hash. */
export function checkTaskContent(audience:TaskContentAudience,value:unknown):{
  passed:boolean;issues:string[];content:TaskContentDocument|null;hash:string|null;
}{
  const issues:string[]=[];
  if(!value||typeof value!=='object'||Array.isArray(value))
    return {passed:false,issues:['A structured '+audience+' document is required'],
      content:null,hash:null};
  const raw=value as Record<string,unknown>;
  const spec=fields[audience];
  const unknown=Object.keys(raw).filter(key=>!Object.hasOwn(spec,key));
  if(unknown.length)issues.push('Unknown content fields: '+unknown.join(', '));
  const result:Record<string,unknown>={};
  for(const [key,kind] of Object.entries(spec)){
    const field=raw[key];
    if(kind==='text'){
      if(typeof field!=='string'||!field.trim()||field.length>1800||placeholder.test(field.trim())){
        issues.push(key+': requires specific, non-placeholder prose (up to 1800 characters)');
        continue;
      }
      result[key]=field.trim();
    }else{
      if(!Array.isArray(field)||field.length>16||field.some(item=>
        typeof item!=='string'||!item.trim()||item.length>1200||placeholder.test(item.trim()))){
        issues.push(key+': requires a list of concise, specific statements');
        continue;
      }
      if(mandatory[audience].has(key)&&field.length===0)
        issues.push(key+': this audience requires at least one entry');
      result[key]=field.map(item=>(item as string).trim());
    }
  }
  const content=issues.length?null:result as unknown as TaskContentDocument;
  return {passed:issues.length===0,issues,content,
    hash:content?taskContentHash(audience,content):null};
}

export interface TaskContentCoverage {
  humanField:'work'|'effects'|'businessAcceptance'|'exclusions';
  humanIndex:number;
  aiField:keyof AiExecutionBrief;
  aiIndex:number;
  rationale:string;
}
export interface TaskContentReview {
  reviewer:string;
  outcome:'aligned'|'revise';
  rationale:string;
  sourceReviewed:boolean;
  noOmittedCommitments:boolean;
  noAddedBusinessScope:boolean;
  coverage:TaskContentCoverage[];
  editorialMeaningUnchanged?:boolean;
}

/** Mechanical coverage is necessary but NEVER sufficient for semantic proof.
 * A named reviewer must inspect frozen sources, exclusions and extra scope.
 */
export function checkContentPair(human:HumanTaskOverview,ai:AiExecutionBrief,
  review:TaskContentReview,kind:'substantive'|'editorial'='substantive'):string[]{
  const errors:string[]=[];
  if(!review||typeof review!=='object')return ['Substantive version-pair review required'];
  if(typeof review.reviewer!=='string'||review.reviewer.trim().length<2)
    errors.push('A named real reviewer is required');
  if(!['aligned','revise'].includes(review.outcome))errors.push('Review outcome is invalid');
  if(typeof review.rationale!=='string'||review.rationale.trim().length<35)
    errors.push('Review needs source-specific substantive findings');
  if(review.sourceReviewed!==true)errors.push('Frozen original source was not checked');
  if(review.noOmittedCommitments!==true)errors.push('Missing business commitment attestation');
  if(review.noAddedBusinessScope!==true)errors.push('Extra business scope was not ruled out');
  if(kind==='editorial'&&review.editorialMeaningUnchanged!==true)
    errors.push('Editorial edits need an explicit no-meaning-change review');
  if(!Array.isArray(review.coverage))return [...errors,'Version coverage must be a list'];
  const seen=new Set<string>();
  for(const row of review.coverage){
    if(!row||typeof row!=='object'||
      !['work','effects','businessAcceptance','exclusions'].includes(row.humanField)||
      !Object.hasOwn(ai,row.aiField)||!Array.isArray(ai[row.aiField])||
      !Number.isSafeInteger(row.humanIndex)||!Number.isSafeInteger(row.aiIndex)||
      row.humanIndex<0||row.aiIndex<0||
      row.humanIndex>=human[row.humanField]?.length||
      row.aiIndex>=(ai[row.aiField] as string[])?.length||
      typeof row.rationale!=='string'||row.rationale.trim().length<20){
      errors.push('Coverage has an invalid location or generic rationale');
      continue;
    }
    seen.add(row.humanField+':'+row.humanIndex);
    // Business acceptance must be backed by tests/evidence, and exclusions
    // must survive as AI constraints rather than becoming new behavior.
    if(row.humanField==='businessAcceptance'&&
      !['tests','evidence'].includes(row.aiField))
      errors.push('Business acceptance must map to AI tests or evidence');
    if(row.humanField==='exclusions'&&
      !['invariants','stopConditions'].includes(row.aiField))
      errors.push('Explicit exclusions must map to frozen limits/stop conditions');
  }
  for(const field of ['work','effects','businessAcceptance','exclusions'] as const){
    human[field].forEach((_,index)=>{
      if(!seen.has(field+':'+index))
        errors.push('Unmapped human commitment: '+field+'['+index+']');
    });
  }
  if(review.outcome!=='aligned')errors.push('Review requires revision before binding');
  return errors;
}

export function taskContentReviewHash(subject:{taskId:string;sourcePlanHash:string;
  humanHash:string;aiHash:string;humanRevision:number;aiRevision:number},
  review:TaskContentReview):string{
  return createHash('sha256').update(JSON.stringify({schema:'task-content-review-v1',
    subject,review})).digest('hex');
}
