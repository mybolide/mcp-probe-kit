import {createHash} from 'node:crypto';
import type {ReviewQueue,ReviewItem} from './task-spec-review.js';

/** Read-only evidence packet. It is not a review decision or Owner approval. */
export interface IndependentReviewPacket {
  kind:'task-spec-review-packet';
  policy:'read-only-not-owner-approved';
  packetHash:string;
  count:number;
  items:Array<{
    id:string;title:string;proposalHash:string;reviewHash:string|null;
    reviewMode:string|null;
    original:ReviewItem['approval']&ReviewItem['frozenFacts'];
    dependencies:ReviewItem['dependencies'];
    draft:NonNullable<ReviewItem['supplement']['draftFields']>;
  }>;
}

export function makeIndependentReviewPacket(queue:ReviewQueue):IndependentReviewPacket {
  const items=queue.items.filter(item=>
    ['awaiting_developer_review','awaiting_owner_approval'].includes(item.supplement.status)&&
    !!item.supplement.proposalHash&&!!item.supplement.draftFields&&
    Object.keys(item.supplement.draftFields).length>0).map(item=>({
      id:item.id,title:item.title,proposalHash:item.supplement.proposalHash!,
      reviewHash:item.supplement.reviewHash,reviewMode:item.supplement.reviewMode,
      original:{...item.approval,...item.frozenFacts},
      dependencies:item.dependencies,draft:item.supplement.draftFields!,
    }));
  const packetHash=createHash('sha256').update(JSON.stringify(items)).digest('hex');
  return {kind:'task-spec-review-packet',policy:'read-only-not-owner-approved',
    packetHash,count:items.length,items};
}

export function independentReviewPacketMarkdown(p:IndependentReviewPacket):string {
  const lines=[
    '# DevControl 任务规格审核核对材料','',
    '> 本材料是实质自审核对与 Owner 授权用的只读快照，未获得 Owner 批准。','',
    '批次 SHA-256：'+p.packetHash,
    '待审核草案数量：'+p.count,'',
    '请审核者独立核查每个来源的实际内容，而不只是判断文件路径存在。','',
    '开发者须实质核对冻结验收、文件范围、Gate、依赖与六项新增说明是否冲突。','',
    '如风险要求额外独立复审，可由不同审核者核查；不强制每项寻找第二人。','',
  ];
  const sections=[
    ['purpose','业务目的'],['scenario','使用场景'],['workflow','实施和核对步骤'],
    ['testCases','正向测试'],['negativeCases','异常与失败验证'],
    ['sourceRefs','需求与设计来源'],
  ] as const;
  for(const item of p.items){
    lines.push('## '+item.id+' '+item.title,'',
      '原冻结计划：'+(item.original.planId??'未记录')+
        ' 修订 '+(item.original.revision??'未记录'),
      '原冻结 Hash：'+(item.original.planHash??'未记录'),
      '本次待审提案 Hash：'+item.proposalHash,'',
      '实际审核方式：'+(item.reviewMode??'尚未提交自审'),
      '已记录的审核 Hash：'+(item.reviewHash??'尚未提交自审'),'',
      '### 原批准内容','',
      '验收目标：'+item.original.acceptance,
      '允许文件：'+item.original.allowedPaths.join('、'),
      '原 Gate：'+item.original.gates.join('、'),
      '前置依赖：'+(item.dependencies.map(d=>d.id+' ['+d.status+']').join('、')||'无'),
      '','### 待审补充（未生效）','');
    for(const [key,label] of sections){
      const value=item.draft[key];
      const content=Array.isArray(value)?
        value.map((v,i)=>String(i+1)+'. '+v).join('\n'):String(value??'未记录');
      lines.push('#### '+label,'',content,'');
    }
    lines.push('### 审核者核对事项','',
      '- [ ] 对照冻结验收与原始计划 Hash，确保没有变更开发范围',
      '- [ ] 逐项打开源文档，核对引用内容是否真正支持提案',
      '- [ ] 核对业务目的、场景、步骤和正反测试的可执行性及边界',
      '- [ ] 确认未提前声称真机 Gate、依赖或测试已通过',
      '- [ ] 在正式系统中用本人身份对准确提案 Hash 实质审核',
      '','### 审核者填写（留空，不代表已审）','',
      '审核者身份：','核对来源：','逐项审核意见：',
      '结论：','真实 Review Hash：','','---','');
  }
  return lines.join('\n');
}
