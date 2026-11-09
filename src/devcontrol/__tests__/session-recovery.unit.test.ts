import {afterEach,describe,expect,it,vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {ProjectTaskLedger} from '../task-ledger.js';

let root:string,ledger:ProjectTaskLedger;
const git=(...args:string[])=>execFileSync('git',args,{
  cwd:root,encoding:'utf8',windowsHide:true,timeout:12000}).trim();
const source=(name:string,contents:string)=>{
  const absolute=path.join(root,'src',name);
  fs.mkdirSync(path.dirname(absolute),{recursive:true});
  fs.writeFileSync(absolute,contents);
  git('add','src/'+name);
  git('commit','-qm','Test-only committed source '+name);
};
const setup=()=>{
  root=fs.mkdtempSync(path.join(os.tmpdir(),'review-session-recovery-'));
  git('init','-q');
  git('config','user.name','Test DevControl');
  git('config','user.email','test@example.invalid');
  fs.writeFileSync(path.join(root,'README.md'),'baseline\n');
  git('add','README.md');
  git('commit','-qm','baseline');
  ledger=new ProjectTaskLedger(root);
  const sqlite=new (createRequire(import.meta.url)('node:sqlite').DatabaseSync)(
    ledger.databasePath);
  sqlite.prepare(`INSERT OR REPLACE INTO dc_meta(key,value)
    VALUES('bootstrap',?)`).run(JSON.stringify({importedTasks:2}));
  sqlite.close();
  for(const name of ['A','B']){
    ledger.create({id:'TASK-'+name,title:'Test '+name,track:'governance',
      allowedPaths:['src/'+name.toLowerCase()+'.ts'],
      requiredGates:['docs']},'owner');
    ledger.approve('TASK-'+name,'owner');
  }
};
const submitA=()=>{
  const claim=ledger.claim('TASK-A','agent-a',1800);
  source('a.ts','export const answer = 1;\n');
  const sent=ledger.submit('TASK-A',claim.leaseToken,{
    summary:'Completed approved source',
    implementation:'Added tested source a.ts',
    verification:'Test-only fixture source evidence was inspected',
    kind:'docs',reference:'test-fixture://task-a-proof',
  });
  expect(sent.status).toBe('in_review');
  expect(sent.gitWriterReleased).toBe(true);
  expect(typeof sent.reviewToken).toBe('string');
  return {claim,sent};
};
const acceptance=(reference:string)=>({
  evidenceReference:reference,
  findings:'The developer reviewed the original frozen source commit, confirmed the fixture output is bound to that version, and inspected the scope and negative conditions.',
  gates:[{gate:'docs',evidenceReference:reference,
    findings:'This unit test asserts the evidence-to-commit contract using a disposable local Git fixture.'}],
});

describe('review permissions, session recovery, and immutable rework',()=>{
  afterEach(()=>{
    vi.restoreAllMocks();
    ledger?.close();
    if(root)fs.rmSync(root,{recursive:true,force:true});
  });

  it('releases the shared Git writer on submit but keeps frozen review permission',()=>{
    setup();
    const {sent}=submitA();
    expect(ledger.next().activeLease).toBeNull();
    expect(ledger.next().sessionRecoveryCandidates)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        taskId:'TASK-A',status:'in_review',gitWriterReleased:true,
      })]));
    const next=ledger.claim('TASK-B','agent-b',1800);
    expect(next.leaseToken).toBeTruthy();
    const review=ledger.verify('TASK-A',sent.reviewToken,
      acceptance('test-fixture://task-a-proof'));
    expect(review.passed).toBe(true);
    expect(ledger.get('TASK-A').status).toBe('verified');
    expect(ledger.get('TASK-B').status).toBe('in_progress');
  });

  it('recovers an expired review session without reclaiming another writer',()=>{
    setup();
    const {sent}=submitA();
    ledger.claim('TASK-B','agent-b',1800);
    const now=Date.now();
    vi.spyOn(Date,'now').mockReturnValue(now+25*60*60*1000);
    expect(()=>ledger.verify('TASK-A',sent.reviewToken,
      acceptance('test-fixture://task-a-proof'))).toThrow(/lease token/i);
    const restored=ledger.resumeSession('TASK-A',{
      actor:'agent-returned',reason:'The previous review conversation ended and its token expired'});
    expect(restored).toMatchObject({status:'in_review',writerAcquired:false,
      completionRevision:1});
    expect(restored.reviewToken).not.toBe(sent.reviewToken);
    const review=ledger.verify('TASK-A',restored.reviewToken,
      acceptance('test-fixture://task-a-proof'));
    expect(review.passed).toBe(true);
  });

  it('never turns a review-only release into permission to claim overlapping files',()=>{
    setup();
    submitA();
    ledger.create({id:'TASK-OVERLAP',title:'Unverified overlapping scope',
      track:'governance',allowedPaths:['src/a.ts'],
      requiredGates:['docs']},'owner');
    ledger.approve('TASK-OVERLAP','owner');
    expect(ledger.executionContract('TASK-OVERLAP')).toMatchObject({
      claimableNow:false});
    expect(()=>ledger.claim('TASK-OVERLAP','agent-other',1800))
      .toThrow(/overlap|index|scope|writer|unfinished/i);
    expect(ledger.get('TASK-A').status).toBe('in_review');
  });

  it('rejects silent Session takeover while the original writer is active',()=>{
    setup();
    ledger.claim('TASK-A','agent-live',1800);
    expect(()=>ledger.resumeSession('TASK-A',{
      actor:'agent-other',
      reason:'A different session attempted to take over an active coding writer without handoff'}))
      .toThrow(/active developer lease/i);
    expect(ledger.get('TASK-A').status).toBe('in_progress');
  });

  it('does not reopen a healthy review merely because time passed',()=>{
    setup();
    const {sent}=submitA();
    expect(()=>ledger.reopenForRework('TASK-A',{
      actor:'agent-a',reviewToken:sent.reviewToken,
      reason:'The user only reopened a ChatGPT conversation and wants to continue ordinary review.'}))
      .toThrow(/Healthy review/i);
    expect(ledger.get('TASK-A').status).toBe('in_review');
  });

  it('opens a new development base and preserves original completion and evidence',()=>{
    setup();
    const {sent}=submitA();
    const newAttempt=ledger.reopenForRework('TASK-A',{
      actor:'owner',explicitAuthorization:true,reviewToken:sent.reviewToken,
      reason:'The submitted behavior must be revised after concrete functional review; keep all previous evidence for audit.'});
    expect(newAttempt).toMatchObject({status:'in_progress',
      previousCompletionRevision:1,originalEvidencePreserved:true});
    expect(newAttempt.baseHead).toBe(git('rev-parse','HEAD'));
    source('a.ts','export const answer = 2;\n');
    const revised=ledger.submit('TASK-A',newAttempt.leaseToken,{
      summary:'Corrected approved source behavior',
      implementation:'Updated a.ts after review findings',
      verification:'Executed new revision fixture verification',
      kind:'docs',reference:'test-fixture://task-a-revision-two',
    });
    expect(revised).toMatchObject({status:'in_review',completionRevision:2,
      gitWriterReleased:true});
    const trace=ledger.trace('TASK-A');
    expect(JSON.stringify(trace)).toContain('test-fixture://task-a-proof');
    expect(JSON.stringify(trace)).toContain('test-fixture://task-a-revision-two');
    expect(ledger.verify('TASK-A',revised.reviewToken,
      acceptance('test-fixture://task-a-revision-two')).passed).toBe(true);
  });

  it('recovers an expired developing task without automatically passing its gate',()=>{
    setup();
    ledger.claim('TASK-A','agent-original',60);
    const now=Date.now();
    vi.spyOn(Date,'now').mockReturnValue(now+61_000);
    const resumed=ledger.resumeSession('TASK-A',{
      actor:'agent-returned',
      reason:'The developer conversation was interrupted before committing its original code.'});
    expect(resumed).toMatchObject({taskId:'TASK-A',status:'in_progress',
      testsPassedByRecovery:false});
    expect(ledger.get('TASK-A').status).toBe('in_progress');
  });
});
