/** Read-only human presentation of an approved, structured task contract.
 *
 * No persistence, guessed intent, generated acceptance or lifecycle changes.
 * The frozen task node and the project's explicitly referenced requirements
 * are separate sources. A missing field remains missing.
 */
export interface RequirementReference {
  id:string; title:string; acceptance?:string;
}

export interface ReadabilityIssue {
  field:string;
  label:string;
  severity:'explanation'|'contract';
}

export interface TaskReadability {
  status:'complete'|'needs_explanation'|'needs_contract_review'|'source_missing';
  authoritative:boolean;
  purpose:{text:string;source:'frozen-task'|'approved-supplement'|'requirement-reference'|'missing'};
  outcomes:string[];
  requirementRefs:RequirementReference[];
  issues:ReadabilityIssue[];
  nextAction:string;
  policy:'read-only-advisory';
}

const labels:Record<string,string>={
  purpose:'业务目的',scenario:'使用场景',workflow:'实施步骤',
  testCases:'正向测试',negativeCases:'异常与边界测试',sourceRefs:'设计与需求依据',
  acceptance:'验收条件',requirementIds:'关联需求',allowedPaths:'文件范围',
  requiredGates:'验收 Gate',
};
function has(value:unknown):boolean{
  if(Array.isArray(value))return value.some(item=>typeof item==='string'&&item.trim().length>0);
  return typeof value==='string'&&value.trim().length>0;
}
function text(value:unknown):string{return typeof value==='string'?value.trim():'';}
function values(value:unknown):string[]{
  return Array.isArray(value)?value.filter((v):v is string=>typeof v==='string'&&!!v.trim()).map(v=>v.trim()):[];
}

/** Extract verifiable statements rather than asking AI to reword the scope.
 * Splitting only at unambiguous sentence boundaries preserves the semantics.
 */
export function taskReadability(contract:Record<string,unknown>,
  requirements:RequirementReference[]=[],approvedFields:Record<string,unknown>={}):TaskReadability {
  const authoritative=contract.authoritative===true;
  const ids=values(contract.requirementIds);
  const refs=ids.map(id=>{
    const original=requirements.find(req=>req.id===id&&has(req.title));
    return original?{id,title:original.title,acceptance:original.acceptance}:
      {id,title:'未找到对应的需求说明'};
  });
  // A trigger/scenario is not a reason for the task to exist.
  const approvedPurpose=text(approvedFields.purpose);
  const explicitPurpose=text(contract.purpose)||text(contract.description)||approvedPurpose;
  const purpose:TaskReadability['purpose']=explicitPurpose?
    {text:explicitPurpose,source:approvedPurpose&&!text(contract.purpose)&&
      !text(contract.description)?'approved-supplement':'frozen-task'}:
    refs.some(ref=>ref.title!=='未找到对应的需求说明')?
      {text:'对应产品需求：'+refs.filter(ref=>ref.title!=='未找到对应的需求说明')
        .map(ref=>ref.id+' '+ref.title).join('；'),source:'requirement-reference'}:
      {text:'原始任务没有单独记录业务目的，且没有可核对的需求描述。',source:'missing'};
  const outcomes=text(contract.acceptance).split(/[；;。\n]+/).map(v=>v.trim()).filter(Boolean);
  const issues:ReadabilityIssue[]=[];
  if(!authoritative)issues.push({field:'frozenSource',label:'原始冻结合同来源',severity:'contract'});
  if(!explicitPurpose)issues.push({field:'purpose',label:labels.purpose,severity:'explanation'});
  const type=contract.type??(
    (contract.source as {kind?:string}|undefined)?.kind==='feature'?'development':null);
  const detailed=['development','integration','bugfix','testing'].includes(String(type));
  for(const field of ['acceptance','requirementIds','allowedPaths','requiredGates',
    ...(detailed?['scenario','workflow','testCases','negativeCases','sourceRefs']:[])]){
    if(!has(contract[field])&&!has(approvedFields[field]))
      issues.push({field,label:labels[field],severity:'contract'});
  }
  const contractGaps=issues.some(issue=>issue.severity==='contract');
  const status=!authoritative?'source_missing':
    contractGaps?'needs_contract_review':
    issues.length?'needs_explanation':'complete';
  return {
    status,authoritative,purpose,outcomes,requirementRefs:refs,issues,
    nextAction:status==='source_missing'?
      '先核对原始审批版本和任务来源，不得从其他摘要补造冻结合同。':
      status==='needs_contract_review'?
        '评估缺失的执行和验收要求；如需改变冻结范围或合同，走正式变更审批。':
        status==='needs_explanation'?
          '根据已批准的需求和合同补充可核对的业务说明，不改变原始验收条件。':
          '现有说明已较完整；继续按正式合同及实际 Gate 执行。',
    policy:'read-only-advisory',
  };
}
