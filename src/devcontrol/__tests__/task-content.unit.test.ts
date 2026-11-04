import {afterEach,describe,it,expect} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {ProjectTaskLedger} from '../task-ledger.js';
import {dispatchDevControl} from '../command.js';
import {createDevControlBoardServer} from '../board-server.js';
import {checkTaskContent,checkContentPair,
  type HumanTaskOverview,type AiExecutionBrief,type TaskContentReview} from '../task-content.js';

const roots:string[]=[];
function fixture(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'dc-dual-task-content-'));
  roots.push(root);
  execFileSync('git',['init','-q',root]);
  execFileSync('git',['-C',root,'config','user.name','Fixture Author']);
  execFileSync('git',['-C',root,'config','user.email','fixture@example.invalid']);
  fs.writeFileSync(path.join(root,'README.md'),'Frozen project scope\n');
  execFileSync('git',['-C',root,'add','README.md']);
  execFileSync('git',['-C',root,'commit','-qm','Initial project']);
  const ledger=new ProjectTaskLedger(root);
  ledger.create({id:'CONTENT-01',title:'Preserve unlocked weekly result',
    track:'product',release:'V1',allowedPaths:['src/sleep/**'],
    requiredGates:['flutter_test']},'planner');
  const db=(ledger as unknown as {db:any}).db;
  const item={id:'CONTENT-01',title:'Preserve unlocked weekly result',
    purpose:'Avoid losing a previously unlocked result on a weak data week',
    acceptance:'Previously unlocked score remains when a new week is insufficient',
    type:'development',requirementIds:['FR-SLEEP-1'],
    allowedPaths:['src/sleep/**'],requiredGates:['flutter_test'],dependsOn:[]};
  const frozen={plan:{release:'V1',workItems:[item]}};
  const hash='original-frozen-task-version-20261104';
  db.prepare('UPDATE dc_tasks SET plan_id=?,status=?,approved_by=? WHERE id=?')
    .run('release-work:V1','ready','fixture-owner','CONTENT-01');
  for(const table of ['dc_release_work_history','dc_release_work_plans'])
    db.prepare('INSERT INTO '+table+' '+
      '(release,revision,hash,snapshot_json,approved_by,approved_at) '+
      'VALUES(?,?,?,?,?,?)').run('V1',1,hash,JSON.stringify(frozen),'fixture-owner','2026-01-01');
  return {ledger,db,hash,root};
}
afterEach(()=>{
  for(const root of roots.splice(0))fs.rmSync(root,{force:true,recursive:true});
});

const human:HumanTaskOverview={
  why:'Previously unlocked customers must keep their valid historical results when a new week has insufficient data.',
  work:['Keep the last unlocked weekly result visible during a data shortage'],
  effects:['Show the last score and its original date rather than showing a new score'],
  scenarios:['A customer unlocked last week but this week has insufficient activity'],
  businessAcceptance:['The customer still sees the original score and date after refresh'],
  exclusions:['Do not erase an existing unlock when the current network request fails'],
};
const ai:AiExecutionBrief={
  context:['Frozen requirement FR-SLEEP-1 and its approved immutable task source'],
  prerequisites:['Read the original unlocked-result persistence model'],
  inputs:['Account identity and effective weekly data sufficiency'],
  outputs:['Previously unlocked result and original timestamp'],
  invariants:['Insufficient data must not update the original result date'],
  steps:['Keep the prior result in the state model when new data is insufficient'],
  failureRecovery:['A network timeout is not a request to clear an earlier unlock'],
  tests:['Refresh an insufficient week and verify original score and timestamp'],
  evidence:['Record flutter_test output for the persistent result test'],
  stopConditions:['Stop when a request would erase the earlier unlock on failure'],
};
function coverage():TaskContentReview['coverage']{
  const rows:[TaskContentReview['coverage'][number]['humanField'],
    TaskContentReview['coverage'][number]['aiField']][]=[
    ['work','steps'],['effects','invariants'],
    ['businessAcceptance','tests'],['exclusions','stopConditions'],
  ];
  return rows.map(([humanField,aiField])=>({humanField,humanIndex:0,
    aiField,aiIndex:0,
    rationale:'Checked the exact original approved result-persistence requirement and its corresponding implementation or verification clause.'}));
}
function review(editorial=false):TaskContentReview{
  return {reviewer:'responsible-reviewer',outcome:'aligned',
    rationale:'Compared each business promise, the historical unlock date, the explicit exclusions, the original frozen scope and the AI tests; no requirement was added or left out.',
    sourceReviewed:true,noOmittedCommitments:true,noAddedBusinessScope:true,
    coverage:coverage(),...(editorial?{editorialMeaningUnchanged:true}:{})};
}
const author='responsible-planning-agent';
const reason='Separate the customer-facing promise from the exact AI implementation and verification details.';
function stage(ledger:ProjectTaskLedger,hash:string,audience:'human'|'ai',
  content:HumanTaskOverview|AiExecutionBrief,expectedRevision=0,
  changeKind:'clarification'|'editorial'|'material'='clarification'){
  return ledger.stageTaskContent({id:'CONTENT-01',audience,content,
    expectedRevision,expectedSourceHash:hash,actor:author,reason,changeKind});
}
function establish(ledger:ProjectTaskLedger,hash:string){
  const h=stage(ledger,hash,'human',human);
  const a=stage(ledger,hash,'ai',ai);
  const checked=ledger.checkTaskContentPair({id:'CONTENT-01',
    expectedSourceHash:hash,expectedHumanHash:h.contentHash,
    expectedAiHash:a.contentHash,review:review()});
  expect(checked).toMatchObject({passed:true,reviewMode:'substantive'});
  const reviewed=ledger.reviewTaskContentPair({id:'CONTENT-01',
    expectedSourceHash:hash,expectedHumanHash:h.contentHash,
    expectedAiHash:a.contentHash,review:review()});
  expect(reviewed.status).toBe('awaiting_owner_authorization');
  const request={id:'CONTENT-01',expectedSourceHash:hash,
    expectedHumanHash:h.contentHash,expectedAiHash:a.contentHash,
    expectedReviewHash:reviewed.reviewHash,approvedBy:'fixture-owner',
    reason:'Owner authorizes exactly this reviewed pair without expanding original source scope',
    explicitAuthorization:true};
  return {request,result:ledger.approveTaskContentPair(request)};
}

describe('one authoritative task, two separately versioned contents',()=>{
  it('rejects placeholders, invented fields, omitted mappings and extra-scope attestation failures',()=>{
    expect(checkTaskContent('human',{...human,work:['TBD']})).toMatchObject({passed:false});
    expect(checkTaskContent('ai',{...ai,humanWork:['not a valid AI field']}))
      .toMatchObject({passed:false});
    expect(checkContentPair(human,ai,{...review(),noAddedBusinessScope:false}))
      .toContain('Extra business scope was not ruled out');
    expect(checkContentPair(human,ai,{...review(),coverage:coverage().slice(0,2)})
      .join(' ')).toContain('businessAcceptance');
    expect(checkContentPair(human,ai,{...review(),coverage:coverage().map(row=>
      row.humanField==='businessAcceptance'?{...row,aiField:'steps'}:row)}).join(' '))
      .toContain('Business acceptance must map to AI tests');
  });

  it('creates a formally bound H1/E1 pair without rewriting approval, frozen scope, Gate or acceptance',()=>{
    const {ledger,db,hash}=fixture();
    try{
      const initial=ledger.taskContent('CONTENT-01');
      expect(initial).toMatchObject({status:'legacy-unpaired',approved:null});
      const frozen=JSON.stringify(ledger.frozenTaskContract('CONTENT-01'));
      const stageHuman=stage(ledger,hash,'human',human);
      expect(ledger.taskContent('CONTENT-01').status).toBe('initial-pair-pending');
      expect(ledger.executionContract('CONTENT-01').audiencePair)
        .toMatchObject({status:'initial-pair-pending',aiBrief:null});
      expect(()=>ledger.stageTaskContent({id:'CONTENT-01',audience:'human',
        content:human,expectedRevision:0,expectedSourceHash:hash,actor:author,
        reason,changeKind:'clarification'})).toThrow(/current audience draft/i);
      const missing=ledger.checkTaskContentPair({id:'CONTENT-01',
        expectedSourceHash:hash,expectedHumanHash:stageHuman.contentHash,
        expectedAiHash:'none',review:review()});
      expect(missing.passed).toBe(false);
      const stageAi=stage(ledger,hash,'ai',ai);
      expect(()=>ledger.approveTaskContentPair({id:'CONTENT-01',
        expectedSourceHash:hash,expectedHumanHash:stageHuman.contentHash,
        expectedAiHash:stageAi.contentHash,expectedReviewHash:'unreviewed',
        approvedBy:'fixture-owner',reason,explicitAuthorization:true}))
        .toThrow(/Exact current reviewed pair/i);
      expect(()=>ledger.reviewTaskContentPair({id:'CONTENT-01',
        expectedSourceHash:hash,expectedHumanHash:stageHuman.contentHash,
        expectedAiHash:stageAi.contentHash,review:{...review(),noOmittedCommitments:false}}))
        .toThrow(/Missing business commitment/i);
      const reviewed=dispatchDevControl(ledger,'task-content-review',{
        id:'CONTENT-01',expectedSourceHash:hash,
        expectedHumanHash:stageHuman.contentHash,
        expectedAiHash:stageAi.contentHash,review:review()}) as {reviewHash:string};
      expect(()=>ledger.approveTaskContentPair({id:'CONTENT-01',
        expectedSourceHash:hash,expectedHumanHash:stageHuman.contentHash,
        expectedAiHash:stageAi.contentHash,expectedReviewHash:reviewed.reviewHash,
        approvedBy:'fixture-owner',reason,explicitAuthorization:false}))
        .toThrow(/Owner authorization/i);
      const approved=dispatchDevControl(ledger,'task-content-approve',{
        id:'CONTENT-01',expectedSourceHash:hash,
        expectedHumanHash:stageHuman.contentHash,
        expectedAiHash:stageAi.contentHash,expectedReviewHash:reviewed.reviewHash,
        approvedBy:'fixture-owner',reason,explicitAuthorization:true});
      expect(approved).toMatchObject({pairRevision:1,humanRevision:1,
        aiRevision:1,frozenPlanUnchanged:true,taskLifecycleUnchanged:true});
      expect(JSON.stringify(ledger.frozenTaskContract('CONTENT-01'))).toBe(frozen);
      expect(ledger.get('CONTENT-01')).toMatchObject({status:'ready',
        allowedPaths:['src/sleep/**'],requiredGates:['flutter_test']});
      const linked=ledger.executionContract('CONTENT-01');
      expect(linked.audiencePair).toMatchObject({status:'reviewed',
        humanRevision:1,aiRevision:1,aiBrief:ai,
        frozenScopeRemainsAuthoritative:true});
      expect(linked.spec.acceptance).toBe('Previously unlocked score remains when a new week is insufficient');
      expect(dispatchDevControl(ledger,'task-content-get',{id:'CONTENT-01'}))
        .toMatchObject({schema:'task-content-v1',status:'reviewed',
          approved:{human:{revision:1,content:human},ai:{revision:1,content:ai}}});
      expect(ledger.taskContent('CONTENT-01').history).toHaveLength(1);
      const approvedRows=db.prepare('SELECT COUNT(*) AS n FROM dc_task_content_revisions').get();
      expect(approvedRows.n).toBe(2);
    }finally{ledger.close();}
  });

  it('keeps the old paired H1/E1 immutable until H2 is reviewed, and allows editorial-only rebind',()=>{
    const {ledger,hash}=fixture();
    try{
      establish(ledger,hash);
      const newHuman={...human,why:human.why+' This clarifies the same customer promise.'};
      const staged=stage(ledger,hash,'human',newHuman,1,'editorial');
      expect(ledger.executionContract('CONTENT-01').audiencePair)
        .toMatchObject({status:'reviewed',humanRevision:1,aiRevision:1});
      const read=ledger.taskContent('CONTENT-01');
      expect(read.status).toBe('revision-pending');
      expect(read.drafts.human.revision).toBe(2);
      expect(()=>ledger.approveTaskContentPair({id:'CONTENT-01',
        expectedSourceHash:hash,expectedHumanHash:staged.contentHash,
        expectedAiHash:read.approved.ai.hash,expectedReviewHash:'no',
        approvedBy:'responsible-reviewer',reason}))
        .toThrow(/reviewed pair/i);
      expect(()=>ledger.reviewTaskContentPair({id:'CONTENT-01',
        expectedSourceHash:hash,expectedHumanHash:staged.contentHash,
        expectedAiHash:read.approved.ai.hash,review:review()}))
        .toThrow(/Editorial edits need/i);
      const reviewed=ledger.reviewTaskContentPair({id:'CONTENT-01',
        expectedSourceHash:hash,expectedHumanHash:staged.contentHash,
        expectedAiHash:read.approved.ai.hash,review:review(true)});
      expect(reviewed.reviewMode).toBe('editorial');
      const updated=ledger.approveTaskContentPair({id:'CONTENT-01',
        expectedSourceHash:hash,expectedHumanHash:staged.contentHash,
        expectedAiHash:read.approved.ai.hash,expectedReviewHash:reviewed.reviewHash,
        approvedBy:'responsible-reviewer',reason});
      expect(updated).toMatchObject({pairRevision:2,humanRevision:2,
        aiRevision:1,approvalMode:'editorial-reviewed'});
      expect(ledger.taskContent('CONTENT-01').history).toHaveLength(2);
      expect(ledger.executionContract('CONTENT-01').audiencePair)
        .toMatchObject({status:'reviewed',humanRevision:2,aiRevision:1});
      expect(ledger.get('CONTENT-01').status).toBe('ready');
    }finally{ledger.close();}
  });

  it('rejects stale source, material changes and post-claim/Verified edits without historical rewrites',()=>{
    const {ledger,db,hash}=fixture();
    try{
      expect(()=>stage(ledger,'wrong-hash','human',human))
        .toThrow(/source plan hash/i);
      expect(()=>stage(ledger,hash,'human',human,0,'material'))
        .toThrow(/formal scope/i);
      const original=JSON.stringify(ledger.frozenTaskContract('CONTENT-01'));
      const draft=stage(ledger,hash,'human',human);
      expect(()=>ledger.withdrawTaskContent({id:'CONTENT-01',audience:'human',
        expectedContentHash:'wrong',actor:author,reason}))
        .toThrow(/current audience draft/i);
      expect(ledger.withdrawTaskContent({id:'CONTENT-01',audience:'human',
        expectedContentHash:draft.contentHash,actor:author,reason}))
        .toMatchObject({withdrawn:true,approvedVersionsUnaffected:true});
      db.prepare("UPDATE dc_tasks SET status='verified',verified_at='2026-11-04' WHERE id='CONTENT-01'")
        .run();
      expect(()=>stage(ledger,hash,'human',human)).toThrow(/Ready/i);
      expect(ledger.taskContent('CONTENT-01')).toMatchObject({
        status:'legacy-unpaired',approved:null});
      expect(JSON.stringify(ledger.frozenTaskContract('CONTENT-01')))
        .not.toBe(original); // Only the genuine task status changed, not its frozen source.
      expect(ledger.frozenTaskContract('CONTENT-01').acceptance)
        .toBe('Previously unlocked score remains when a new week is insufficient');
    }finally{ledger.close();}
  });

  it('fails closed if a merged or edited SQLite revision no longer matches the bound hashes',()=>{
    const {ledger,db,hash}=fixture();
    try{
      establish(ledger,hash);
      expect(ledger.taskContent('CONTENT-01').status).toBe('reviewed');
      db.prepare(`UPDATE dc_task_content_revisions SET content_json=?
        WHERE task_id='CONTENT-01' AND audience='ai' AND revision=1`)
        .run(JSON.stringify({...ai,steps:['Unexpected and never approved feature scope']}));
      expect(ledger.taskContent('CONTENT-01')).toMatchObject({
        status:'integrity-invalid',approved:null,
      });
      expect(ledger.executionContract('CONTENT-01').audiencePair)
        .toMatchObject({status:'integrity-invalid',aiBrief:null});
      expect(ledger.executionContract('CONTENT-01').spec.acceptance)
        .toBe('Previously unlocked score remains when a new week is insufficient');
    }finally{ledger.close();}
  });

  it('serves one authoritative read-only task API with separate H/E content and original proof',async()=>{
    const {ledger,hash}=fixture();
    const server=createDevControlBoardServer(ledger,{lanEnabled:false});
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    try{
      const info=server.address();
      if(!info||typeof info==='string')throw Error('No test port');
      const base='http://127.0.0.1:'+info.port;
      const legacy=await (await fetch(base+'/api/tasks/CONTENT-01')).json() as any;
      expect(legacy.content).toMatchObject({status:'legacy-unpaired',approved:null});
      expect(legacy.readability).toMatchObject({
        outcomes:[],outcomesSource:'missing',
      });
      const frozenBefore=JSON.stringify(ledger.frozenTaskContract('CONTENT-01'));
      establish(ledger,hash);
      const response=await fetch(base+'/api/tasks/CONTENT-01');
      expect(response.status).toBe(200);
      const detail=await response.json() as any;
      expect(detail.content.approved).toMatchObject({
        human:{revision:1,content:human},ai:{revision:1,content:ai},
        sourcePlanHash:hash,
      });
      expect(detail.readability).toMatchObject({
        outcomes:human.work,outcomesSource:'reviewed-human-overview',
      });
      expect(detail.executionContract.audiencePair).toMatchObject({
        status:'reviewed',aiBrief:ai,sourcePlanHash:hash,
      });
      expect(detail.contract.acceptance)
        .toBe('Previously unlocked score remains when a new week is insufficient');
      expect(JSON.stringify(ledger.frozenTaskContract('CONTENT-01'))).toBe(frozenBefore);
    }finally{
      await new Promise<void>(resolve=>server.close(()=>resolve()));
      ledger.close();
    }
  });
});
