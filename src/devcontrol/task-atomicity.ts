/**
 * Enforce one independently verifiable leaf outcome. Development + testing of
 * that SAME outcome is fine; unrelated objectives require separate tasks.
 * Structural checks complement, but never replace, independent Agent review.
 */
export function reviewAtomicOutcome(input: {
  id:string; title?:string; acceptance?:string;
  estimatedHours?:number; maxHours?:number;
}):string[] {
  const issues:string[]=[];
  const title=typeof input.title==="string"?input.title.trim():"";
  const acceptance=typeof input.acceptance==="string"?input.acceptance.trim():"";
  if (/(?:整个(?:版本|系统|平台|项目)|所有(?:模块|功能|接口)|全部(?:模块|功能|需求)|全栈(?:开发|改造)|complete (?:the )?(?:whole|entire) (?:project|system|platform)|implement all (?:features|modules))/i.test(title+" "+acceptance))
    issues.push(input.id+": whole-product objective is not atomic; decompose by separately verifiable outcomes");
  if (/\r?\n\s*(?:[-*]|\d+[.)]|[一二三四][、.])/.test(acceptance) ||
      /[；;]\s*(?:并(?:且|完成|实现)|同时(?:完成|实现)|另(?:外|需)|再(?:实现|开发))/.test(acceptance))
    issues.push(input.id+": acceptance bundles independent objectives; split into separate leaf tasks");
  if (input.maxHours!==undefined&&input.estimatedHours!==undefined&&
      (!Number.isFinite(input.estimatedHours)||input.estimatedHours<=0||
       input.estimatedHours>input.maxHours))
    issues.push(input.id+": atomic task exceeds "+input.maxHours+"h; split before approval");
  return issues;
}
