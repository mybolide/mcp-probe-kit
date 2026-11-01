import {describe,it,expect,afterEach} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {ProjectTaskLedger} from '../task-ledger.js';
import {dispatchDevControl} from '../command.js';
import {taskReadability} from '../task-readability.js';
import {validateProposal,proposalHash} from '../task-spec-supplement.js';

const cleanups:string[]=[];
function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'dc-task-spec-supplement-'));
  cleanups.push(root);
  execFileSync('git',['init','-q',root]);
  execFileSync('git',['-C',root,'config','user.name','Source Fixture']);
  execFileSync('git',['-C',root,'config','user.email','fixture@example.invalid']);
  fs.writeFileSync(path.join(root,'README.md'),'initial');
  execFileSync('git',['-C',root,'add','README.md']);
  execFileSync('git',['-C',root,'commit','-qm','initial']);
  const ledger=new ProjectTaskLedger(root);
  ledger.create({id:'SPEC-01',title:'Implement original scoped audio metadata',
    track:'product',release:'V0.1',allowedPaths:['src/audio/**'],
    requiredGates:['flutter_test']},'planner');
  // Minimal approved release snapshot fixture, bypassing the unrelated full
  // planning validation. The production path only reads genuine plan history.
  const db=(ledger as unknown as {db:any}).db;
  const item={id:'SPEC-01',title:'Implement original scoped audio metadata',
    type:'development',acceptance:'Persist timestamp metadata',
    requirementIds:['FR-011'],allowedPaths:['src/audio/**'],
    requiredGates:['flutter_test'],dependsOn:[]};
  const snapshot=JSON.stringify({plan:{release:'V0.1',workItems:[item]}});
  const hash='original-frozen-hash-56789';
  db.prepare('UPDATE dc_tasks SET plan_id=?,status=? WHERE id=?')
    .run('release-work:V0.1','ready','SPEC-01');
  db.prepare('INSERT INTO dc_release_work_history '+
    '(release,revision,hash,snapshot_json,approved_by,approved_at) VALUES (?,?,?,?,?,?)')
    .run('V0.1',1,hash,snapshot,'owner','2026-01-01');
  db.prepare('INSERT INTO dc_release_work_plans '+
    '(release,revision,hash,snapshot_json,approved_by,approved_at) VALUES (?,?,?,?,?,?)')
    .run('V0.1',1,hash,snapshot,'owner','2026-01-01');
  return {ledger,db,hash};
}
afterEach(()=>{for(const root of cleanups.splice(0))fs.rmSync(root,{recursive:true,force:true});});
const fields={purpose:'Give every authorised audio item timestamp context for safe later processing',
  testCases:['Verify metadata timestamp persists on a real client audio fragment'],
  sourceRefs:['FR-011 original agreed audio metadata requirement']};
function makeProposal(hash:string){
  return {taskId:'SPEC-01',expectedPlanHash:hash,expectedPlanRevision:1,
    fields,reason:'Improve the missing human context and specify evidence for existing timestamps.'};
}
const review={reviewer:'independent-spec-reviewer',outcome:'approved' as const,
  findings:'Checked the exact original approved task, compared proposed purpose with FR-011 and confirmed timestamp verification fits the frozen acceptance without extending scope or Gates.',
  sourceRefs:['FR-011 original agreed audio metadata requirement']};

describe('approved additive task specification, never an in-place rewrite',()=>{
  it('requires exact frozen revision, independent reviewer and Owner dual hash; preserves original task and gate',()=>{
    const {ledger,hash}=fixture();
    try{
      const before=JSON.stringify(ledger.frozenTaskContract('SPEC-01'));
      const proposal=makeProposal(hash);
      expect(dispatchDevControl(ledger,'task-spec-supplement-review',{proposal}))
        .toMatchObject({passed:true,proposalHash:proposalHash(proposal)});
      const staged=dispatchDevControl(ledger,'task-spec-supplement-stage',{
        proposal,actor:'proposal-author'}) as {status:string;proposalHash:string};
      expect(staged.status).toBe('awaiting_review');
      expect(ledger.executionContract('SPEC-01').approvedSupplement).toBeNull();
      expect(()=>ledger.approveTaskSpecSupplement({
        id:'SPEC-01',expectedProposalHash:staged.proposalHash,
        expectedReviewHash:'not-reviewed',approvedBy:'owner',
        reason:'Explicitly authorise the bounded additive task explanation',
        explicitAuthorization:true,
      })).toThrow(/review/i);
      expect(()=>ledger.reviewStagedTaskSpecSupplement('SPEC-01',
        staged.proposalHash,{...review,reviewer:'proposal-author'}))
        .toThrow(/Independent|reviewer/i);
      const approvedReview=ledger.reviewStagedTaskSpecSupplement('SPEC-01',
        staged.proposalHash,review);
      expect(approvedReview.status).toBe('awaiting_owner_approval');
      expect(()=>ledger.approveTaskSpecSupplement({
        id:'SPEC-01',expectedProposalHash:staged.proposalHash,
        expectedReviewHash:'wrong',approvedBy:'owner',
        reason:'Explicitly authorise the bounded additive task explanation',
        explicitAuthorization:true,
      })).toThrow(/hash/i);
      expect(()=>ledger.approveTaskSpecSupplement({
        id:'SPEC-01',expectedProposalHash:staged.proposalHash,
        expectedReviewHash:approvedReview.reviewHash,approvedBy:'owner',
        reason:'Explicitly authorise the bounded additive task explanation',
        explicitAuthorization:false,
      })).toThrow(/Owner authorization/i);
      expect(ledger.approveTaskSpecSupplement({
        id:'SPEC-01',expectedProposalHash:staged.proposalHash,
        expectedReviewHash:approvedReview.reviewHash,approvedBy:'owner',
        reason:'Explicitly authorise the bounded additive task explanation',
        explicitAuthorization:true,
      })).toMatchObject({status:'approved',revision:1,frozenPlanUnchanged:true});
      expect(JSON.stringify(ledger.frozenTaskContract('SPEC-01'))).toBe(before);
      expect(ledger.get('SPEC-01')).toMatchObject({
        status:'ready',allowedPaths:['src/audio/**'],requiredGates:['flutter_test'],
      });
      const after=ledger.executionContract('SPEC-01');
      expect(after.approvedSupplement).toMatchObject({proposal:{fields},revision:1});
      expect(after.spec.acceptance).toBe('Persist timestamp metadata');
      expect(taskReadability(ledger.frozenTaskContract('SPEC-01'),[],
        after.approvedSupplement.proposal.fields).purpose.source).toBe('approved-supplement');
      expect(ledger.taskSpecSupplement('SPEC-01').history).toHaveLength(1);
    }finally{ledger.close();}
  });
  it('permits substantive developer self-review, but never forges independent review',()=>{
    const {ledger,hash}=fixture();
    try{
      const staged=ledger.stageTaskSpecSupplement(makeProposal(hash),'same-real-developer');
      expect(()=>ledger.reviewStagedTaskSpecSupplement('SPEC-01',staged.proposalHash,
        {...review,reviewer:'different-person'},'developer'))
        .toThrow(/proposer identity/);
      const reviewed=ledger.reviewStagedTaskSpecSupplement('SPEC-01',
        staged.proposalHash,{...review,reviewer:'same-real-developer'},'developer');
      expect(reviewed.status).toBe('awaiting_owner_approval');
      expect(ledger.taskSpecSupplement('SPEC-01').pending.review).toMatchObject({
        reviewer:'same-real-developer',reviewMode:'developer',
      });
      expect(ledger.executionContract('SPEC-01').approvedSupplement).toBeNull();
      const approved=ledger.approveTaskSpecSupplement({
        id:'SPEC-01',expectedProposalHash:staged.proposalHash,
        expectedReviewHash:reviewed.reviewHash,approvedBy:'test-owner',
        reason:'Explicitly authorise the exact developer-reviewed clarification',
        explicitAuthorization:true,
      });
      expect(approved.status).toBe('approved');
      expect(ledger.executionContract('SPEC-01').approvedSupplement.review)
        .toMatchObject({reviewMode:'developer'});
      expect(ledger.frozenTaskContract('SPEC-01').acceptance)
        .toBe('Persist timestamp metadata');
    }finally{ledger.close();}
  });
  it('rejects scope/Gate/acceptance replacement, preexisting text, stale hash and withdrawn drafts',()=>{
    const {ledger,hash}=fixture();
    try{
      const proposal=makeProposal(hash);
      for(const property of ['allowedPaths','acceptance','requiredGates','dependsOn']){
        expect(validateProposal({...proposal,fields:{...fields,[property]:'unreviewed change'}},
          ledger.frozenTaskContract('SPEC-01')).join(' ')).toContain(property);
      }
      expect(ledger.reviewTaskSpecSupplement({...proposal,
        expectedPlanHash:'wrong'}).passed).toBe(false);
      const staged=ledger.stageTaskSpecSupplement(proposal,'proposer');
      expect(ledger.withdrawTaskSpecSupplement({id:'SPEC-01',
        expectedProposalHash:staged.proposalHash,actor:'proposer',
        reason:'Return for more factual source verification before approval'}).withdrawn).toBe(true);
      expect(ledger.taskSpecSupplement('SPEC-01').pending).toBeNull();
      expect(ledger.taskSpecSupplement('SPEC-01').approved).toBeNull();
    }finally{ledger.close();}
  });
  it('does not allow rejected reviews or a second task claim to become approved',()=>{
    const {ledger,hash}=fixture();
    try{
      const staged=ledger.stageTaskSpecSupplement(makeProposal(hash),'proposer');
      const rejected=ledger.reviewStagedTaskSpecSupplement('SPEC-01',
        staged.proposalHash,{...review,outcome:'rejected'});
      expect(rejected.status).toBe('rejected');
      expect(()=>ledger.approveTaskSpecSupplement({id:'SPEC-01',
        expectedProposalHash:staged.proposalHash,
        expectedReviewHash:rejected.reviewHash,approvedBy:'owner',
        reason:'Reject means never approve the rejected supplemental document',
        explicitAuthorization:true})).toThrow(/rejected/i);
    }finally{ledger.close();}
  });
});
