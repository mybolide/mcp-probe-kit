/**
 * Enforce one independently verifiable leaf outcome. Development + testing of
 * that SAME outcome is fine; unrelated objectives require separate tasks.
 * Structural checks complement, but never replace, independent Agent review.
 */
export function reviewAtomicOutcome(input: {
  id:string; title?:string; acceptance?:string;
  estimatedHours?:number; maxHours?:number;
  /** New micro-task planning only: target 30–60m, exceptions <=2h need reason. */
  preferredHours?:number; granularityJustification?:string; requireEstimate?:boolean;
}):string[] {
  const issues:string[]=[];
  const title=typeof input.title==="string"?input.title.trim():"";
  const acceptance=typeof input.acceptance==="string"?input.acceptance.trim():"";
  if (/(?:整个(?:版本|系统|平台|项目)|所有(?:模块|功能|接口)|全部(?:模块|功能|需求)|全栈(?:开发|改造)|complete (?:the )?(?:whole|entire) (?:project|system|platform)|implement all (?:features|modules))/i.test(title+" "+acceptance))
    issues.push(input.id+": whole-product objective is not atomic; decompose by separately verifiable outcomes");
  // Three explicitly independent engineering concerns are a review signal,
  // not a mandate to split implementation and tests of the SAME outcome.
  const compound=title+" "+acceptance;
  if (/(?:资格校验|数据资格|资格审查|接入资格).*(?:业务实现|业务逻辑实现|业务处理).*(?:验收材料|验收证据|测试报告)/.test(compound))
    issues.push(input.id+": eligibility, business implementation and evidence are bundled; split separately verifiable responsibilities");
  if (/\r?\n\s*(?:[-*]|\d+[.)]|[一二三四][、.])/.test(acceptance) ||
      /[；;]\s*(?:并(?:且|完成|实现)|同时(?:完成|实现)|另(?:外|需)|再(?:实现|开发))/.test(acceptance))
    issues.push(input.id+": acceptance bundles independent objectives; split into separate leaf tasks");
  if(input.requireEstimate&&input.estimatedHours===undefined)
    issues.push(input.id+": micro-task plan requires estimatedHours; target 0.5–1h");
  if(input.preferredHours!==undefined&&input.estimatedHours!==undefined&&
      input.estimatedHours>input.preferredHours&&
      (!input.granularityJustification||input.granularityJustification.trim().length<24))
    issues.push(input.id+": exceeds preferred "+input.preferredHours+
      "h; split it or explain why this single outcome cannot be split safely");
  if (input.maxHours!==undefined&&input.estimatedHours!==undefined&&
      (!Number.isFinite(input.estimatedHours)||input.estimatedHours<=0||
       input.estimatedHours>input.maxHours))
    issues.push(input.id+": atomic task exceeds "+input.maxHours+"h; split before approval");
  return issues;
}
