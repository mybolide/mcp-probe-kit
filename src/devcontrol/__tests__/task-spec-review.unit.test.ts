import {describe,it,expect} from 'vitest';
import {taskSpecReviewQueue,type ReviewCandidate} from '../task-spec-review.js';
import {taskReadability} from '../task-readability.js';

const requirements=[{id:'FR-011',title:'实际录音需求',acceptance:'保持有声片段'}];
function candidate(id:string,status='ready',dependsOn:string[]=[],
  options:Record<string,unknown>={}):ReviewCandidate {
  const contract={
    authoritative:true,type:'development',title:id,acceptance:'保存片段；失败必须报告',
    allowedPaths:['apps/audio/**'],requiredGates:['ios_device_e2e'],
    requirementIds:['FR-011'],
    source:{planId:'release-work:V0.1',revision:3,planHash:'approved-hash'},
    ...options,
  };
  return {id,title:'实施 '+id,status,dependencies:dependsOn,priority:2,
    contract,readability:taskReadability(contract,requirements)};
}
describe('read-only prioritized frozen task specification review queue',()=>{
  it('keeps only unstarted and frozen tasks with missing explanations/specs',()=>{
    const current=[candidate('A-01'),candidate('B-01','verified'),
      candidate('C-01','in_review'),
      candidate('D-01','ready',[],{authoritative:false}),
      candidate('E-01','draft')];
    const queue=taskSpecReviewQueue(current,new Map(),12);
    expect(queue.items.map(x=>x.id)).toEqual(['A-01','E-01']);
    expect(queue.totalCandidates).toBe(2);
    expect(queue.policy).toBe('review-draft-no-mutation');
  });
  it('separates frozen source, staged proposal and owner-authorized supplement status',()=>{
    const staged=candidate('F4-08');
    staged.supplement={pending:{proposalHash:'exact-proposal-hash',review:null}};
    const reviewed=candidate('F4-09');
    reviewed.supplement={pending:{proposalHash:'reviewed-hash',review:{outcome:'approved'}}};
    const rejected=candidate('F4-27');
    rejected.supplement={pending:{proposalHash:'rejected-hash',review:{outcome:'rejected'}}};
    const queue=taskSpecReviewQueue([staged,reviewed,rejected],new Map());
    expect(queue.items.map(x=>x.supplement)).toEqual([
      {status:'awaiting_independent_review',proposalHash:'exact-proposal-hash'},
      {status:'awaiting_owner_approval',proposalHash:'reviewed-hash'},
      {status:'review_rejected',proposalHash:'rejected-hash'},
    ]);
    expect(queue.items[0].approval.planHash).toBe('approved-hash');
    expect(queue.items[0].supplement.proposalHash).not.toBe(queue.items[0].approval.planHash);
  });
  it('does not mistake verified dependencies for approval when an owner scope review is pending',()=>{
    const hold=candidate('F5-16','ready',['V-01']);
    hold.approvalHold='scope_amendment';
    const normal=candidate('F4-08','ready',['P-01']);
    const queue=taskSpecReviewQueue([hold,normal],
      new Map([['V-01','verified'],['P-01','in_review']]));
    expect(queue.items.map(x=>x.id)).toEqual(['F4-08','F5-16']);
    expect(queue.items[1].readiness).toBe('dependencies_verified');
    expect(queue.items[1].approvalHold).toBe('scope_amendment');
    expect(queue.items[1].recommendation).toContain('Owner 授权');
  });
  it('prioritizes truly verified dependency sets before blocked and unknown',()=>{
    const status=new Map([['V-01','verified'],['P-01','in_review'],['V-02','verified']]);
    const queue=taskSpecReviewQueue([
      candidate('F-03','ready',['X-00']),
      candidate('F-02','ready',['P-01']),
      candidate('F-01','ready',['V-01','V-02']),
      candidate('F-04','ready',[]),
    ],status);
    expect(queue.items.map(x=>x.id)).toEqual(['F-04','F-01','F-02','F-03']);
    expect(queue.items[2].readiness).toBe('dependencies_pending');
    expect(queue.items[2].dependencies).toEqual([{id:'P-01',status:'in_review'}]);
    expect(queue.items[3].readiness).toBe('dependencies_unknown');
    expect(queue.items[2].recommendation).toContain('不得视为可执行');
  });
  it('never generates guessed acceptance or test claims, retaining frozen provenance',()=>{
    const source=candidate('F-06','ready',[],{
      acceptance:'在隔离目录保存音频并保存时间戳',
    });
    const original=JSON.stringify(source);
    const queue=taskSpecReviewQueue([source],new Map());
    const [task]=queue.items;
    expect(task.frozenFacts).toMatchObject({
      acceptance:'在隔离目录保存音频并保存时间戳',
      allowedPaths:['apps/audio/**'],gates:['ios_device_e2e'],
      requirements:[requirements[0]],
    });
    expect(task.approval).toEqual({
      planId:'release-work:V0.1',revision:3,planHash:'approved-hash',
    });
    expect(task.reviewQuestions.map(x=>x.field)).toEqual(
      ['purpose','scenario','workflow','testCases','negativeCases','sourceRefs']);
    expect(task.reviewQuestions[3].question).toContain('哪些实际测试');
    expect(JSON.stringify(source)).toBe(original);
    expect(JSON.stringify(queue)).not.toContain('已通过 Gate');
  });
  it('selects exactly one deterministic batch of twelve, never all 100',()=>{
    const all=Array.from({length:100},(_,i)=>candidate('F-'+String(i+1).padStart(3,'0')));
    const queue=taskSpecReviewQueue([...all].reverse(),new Map(),12);
    expect(queue.totalCandidates).toBe(100);
    expect(queue.batchSize).toBe(12);
    expect(queue.items).toHaveLength(12);
    expect(queue.items[0].id).toBe('F-001');
    expect(queue.items[11].id).toBe('F-012');
  });
  it('does not misclassify intentionally complete decision contracts',()=>{
    const original=candidate('D-20','ready',[],{type:'decision',
      purpose:'选择批准的存储方案'});
    expect(original.readability.status).toBe('complete');
    expect(taskSpecReviewQueue([original],new Map()).items).toHaveLength(0);
  });
});
