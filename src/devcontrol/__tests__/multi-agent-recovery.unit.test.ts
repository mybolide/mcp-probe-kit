import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {ProjectTaskLedger,DevControlError} from '../task-ledger.js';

let root:string;
let ledger:ProjectTaskLedger;
const git=(...args:string[])=>execFileSync('git',args,{
  cwd:root,encoding:'utf8',timeout:15000,windowsHide:true,
}).trim();
const write=(relative:string,body:string)=>{
  const filename=path.join(root,relative);
  fs.mkdirSync(path.dirname(filename),{recursive:true});
  fs.writeFileSync(filename,body);
};
const create=(id:string,scope:string[])=>{
  ledger.create({id,title:'A separately approved scope for '+id,
    track:'governance',allowedPaths:scope,requiredGates:['docs']},'owner');
  ledger.approve(id,'owner');
};
const recover=(id:string)=>ledger.recoverTaskLease(id,{
  actor:'gp-owner-agent',ttlSeconds:3600,explicitAuthorization:true,
  reason:'Recover the original approved task while protecting every other Agent file and retaining the original frozen Git claim.',
});
const approval={
  actor:'gp-owner-agent',explicitAuthorization:true,
  reason:'Reviewed the exact original task boundary and competing approved Agent scope. All listed files are preserved byte for byte and no Gate, test or task delivery is approved.',
};

describe('GP shared-checkout expired task recovery and audited writer handoff',()=>{
  beforeEach(()=>{
    root=fs.mkdtempSync(path.join(os.tmpdir(),'gp-multi-agent-'));
    git('init','-q');
    git('config','user.email','gp.fixture@example.invalid');
    git('config','user.name','GP Test');
    write('.gitignore','/.mcp-probe-kit/\n');
    write('README.md','original GP project\n');
    git('add','README.md','.gitignore');
    git('commit','-qm','initial GP fixture');
    ledger=new ProjectTaskLedger(root);
    // Model a GP workspace which imported existing approved release tasks.
    // Only this disposable fixture DB is initialized; no product SQLite or
    // task status is altered, and no Neyna-specific state path is required.
    const db=new (createRequire(import.meta.url)('node:sqlite').DatabaseSync)(
      ledger.databasePath);
    db.prepare(`INSERT OR REPLACE INTO dc_meta(key,value)
      VALUES('bootstrap',?)`).run(JSON.stringify({importedTasks:2}));
    db.close();
  });
  afterEach(()=>{
    vi.restoreAllMocks();
    ledger?.close();
    fs.rmSync(root,{recursive:true,force:true});
  });

  it('reports the exact changed paths and restores T1 only after approved disjoint T2 WIP is attributed',()=>{
    create('GP-T1',['src/t1/**']);
    create('GP-T2',['src/t2/**']);
    write('local-owner.txt','original local owner data');
    const old=ledger.claim('GP-T1','agent-a',60);
    write('src/t1/unfinished.ts','T1 unfinished original implementation\n');
    write('src/t2/agent-b.ts','T2 actual uncommitted work\n');
    const now=Date.now();
    vi.spyOn(Date,'now').mockReturnValue(now+61_000);
    let details:any;
    try{recover('GP-T1');}
    catch(error){
      expect(error).toBeInstanceOf(DevControlError);
      expect((error as DevControlError).code).toBe('WORKTREE_CHANGED');
      details=(error as DevControlError).details;
    }
    expect(details?.conflicts).toEqual([expect.objectContaining({
      path:'src/t2/agent-b.ts',type:'added',inFrozenScope:false,
      expected:null,observed:expect.objectContaining({
        kind:'untracked',sha256:expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    })]);
    expect(()=>ledger.reviewRecoveryWorktree('GP-T1',{
      ...approval,sourceTaskId:'GP-T2',reviewedPaths:['src/t1/unfinished.ts'],
    })).toThrow(/Every changed file/);
    const reviewed=ledger.reviewRecoveryWorktree('GP-T1',{
      ...approval,sourceTaskId:'GP-T2',reviewedPaths:['src/t2/agent-b.ts'],
    });
    expect(reviewed).toMatchObject({filesModifiedByMcp:false,
      gateApproved:false,reviewedPaths:['src/t2/agent-b.ts']});
    const restored=recover('GP-T1');
    expect(restored).toMatchObject({status:'in_progress',
      originalBaseHead:old.baseHead});
    expect(restored).not.toHaveProperty('testsPassedByRecovery',true);
    expect(fs.readFileSync(path.join(root,'src/t1/unfinished.ts'),'utf8'))
      .toBe('T1 unfinished original implementation\n');
    expect(fs.readFileSync(path.join(root,'src/t2/agent-b.ts'),'utf8'))
      .toBe('T2 actual uncommitted work\n');
    expect(fs.readFileSync(path.join(root,'local-owner.txt'),'utf8'))
      .toBe('original local owner data');
    const trace=ledger.trace('GP-T1');
    expect(trace.audit.map((row:{event:string})=>row.event))
      .toContain('recovery_external_wip_reviewed');
    expect(ledger.get('GP-T1').status).toBe('in_progress');
  });

  it('refuses changed protected owner bytes, invented provenance, overlapping scopes and staged work',()=>{
    create('GP-T1',['src/t1/**']);
    create('GP-T2',['src/t2/**']);
    create('GP-OVERLAP',['src/t1/shared.ts']);
    write('local-owner.txt','original protected local text');
    ledger.claim('GP-T1','agent-a',60);
    write('local-owner.txt','changed original owner bytes');
    write('src/t2/new.ts','other task bytes');
    const now=Date.now();
    vi.spyOn(Date,'now').mockReturnValue(now+61_000);
    expect(()=>recover('GP-T1')).toThrow(/protected|Unapproved/);
    expect(()=>ledger.reviewRecoveryWorktree('GP-T1',{
      ...approval,sourceTaskId:'GP-T2',
      reviewedPaths:['local-owner.txt','src/t2/new.ts'],
    })).toThrow(/Every changed file/);
    expect(()=>ledger.reviewRecoveryWorktree('GP-T1',{
      ...approval,sourceTaskId:'GP-OVERLAP',
      reviewedPaths:['src/t2/new.ts'],
    })).toThrow(/overlaps original scope/);
    write('local-owner.txt','original protected local text');
    git('add','src/t2/new.ts');
    expect(()=>ledger.reviewRecoveryWorktree('GP-T1',{
      ...approval,sourceTaskId:'GP-T2',reviewedPaths:['src/t2/new.ts'],
    })).toThrow(/Staged content|staged Git index/);
  });

  it('parks only an expired original writer, lets an approved disjoint T2 finish and then safely resumes T1',()=>{
    create('GP-T1',['src/t1/**']);
    create('GP-T2',['src/t2/**']);
    const a=ledger.claim('GP-T1','agent-a',60);
    write('src/t1/unfinished.ts','T1 implementation waiting for completion\n');
    const now=Date.now();
    vi.spyOn(Date,'now').mockReturnValue(now+61_000);
    expect(ledger.executionContract('GP-T2')).toMatchObject({
      eligible:true,claimableNow:false,
      writerBlocker:{code:'ABANDONED_TASK',taskId:'GP-T1',
        writerExpired:true},
    });
    expect(ledger.next().selectedTaskWriterStatus).toMatchObject({
      claimableNow:false,writerBlocker:{code:'ABANDONED_TASK',taskId:'GP-T1'},
    });
    expect(()=>ledger.claim('GP-T2','agent-b',1800))
      .toThrow(/Expired task GP-T1 must be resumed or reviewed/);
    expect(ledger.parkExpiredWriter('GP-T1',{
      ...approval,nextTaskId:'GP-T2',
    })).toMatchObject({taskId:'GP-T1',nextTaskId:'GP-T2',
      parked:true,filesModifiedByMcp:false,gateApproved:false});
    expect(ledger.get('GP-T1').status).toBe('in_progress');
    expect(ledger.executionContract('GP-T2')).toMatchObject({
      eligible:true,claimableNow:true,writerBlocker:null,
    });
    const b=ledger.claim('GP-T2','agent-b',1800);
    expect(b.leaseToken).toMatch(/^[0-9a-f-]{36}$/);
    expect(ledger.get('GP-T2').status).toBe('in_progress');
    expect(fs.readFileSync(path.join(root,'src/t1/unfinished.ts'),'utf8'))
      .toContain('T1 implementation');
    write('src/t2/test.ts','T2 approved independent test implementation\n');
    git('add','src/t2/test.ts');
    expect(ledger.checkStaged()).toMatchObject({passed:true,
      taskId:'GP-T2',deniedFiles:[]});
    git('commit','-qm','T2 valid independent implementation');
    ledger.report('GP-T2',b.leaseToken,{kind:'docs',
      reference:'Actual GP fixture command and observed docs test output for T2'},true);
    ledger.complete('GP-T2',b.leaseToken,{
      summary:'Independent T2 implementation is committed and scoped',
      implementation:'T2 changes only src/t2 and preserved T1 WIP exactly',
      verification:'GP fixture verified frozen Git test source in T2 scope',
    });
    const verified=ledger.verify('GP-T2',b.leaseToken,{
      evidenceReference:'Actual GP fixture command and observed docs test output for T2',
      findings:'Verified the committed T2 test fixture source and original frozen scope while keeping preexisting T1 unfinished source unchanged, including the path and actual Git HEAD.',
      gates:[{gate:'docs',evidenceReference:'Actual GP fixture command and observed docs test output for T2',
        findings:'Inspected actual T2 fixture output, commit and frozen source independently from T1 unfinished work.'}],
    });
    expect(verified).toMatchObject({passed:true});
    expect(ledger.get('GP-T1').status).toBe('in_progress');
    const resumed=ledger.claim('GP-T1','agent-a',1800);
    expect(resumed.baseHead).toBe(a.baseHead);
    expect(resumed.leaseToken).not.toBe(a.leaseToken);
    git('add','src/t1/unfinished.ts');
    expect(ledger.checkStaged()).toMatchObject({passed:true,
      taskId:'GP-T1',deniedFiles:[]});
    git('commit','-qm','T1 original unfinished code safely delivered');
    ledger.report('GP-T1',resumed.leaseToken,{kind:'docs',
      reference:'Actual GP fixture command and observed docs test output for T1'},true);
    ledger.complete('GP-T1',resumed.leaseToken,{
      summary:'Original T1 source delivered without T2 cross-contamination',
      implementation:'Only T1 originally approved code was committed',
      verification:'Verified exact original T1 approved diff and preserved unrelated T2 commit',
    });
    const result=ledger.verify('GP-T1',resumed.leaseToken,{
      evidenceReference:'Actual GP fixture command and observed docs test output for T1',
      findings:'Inspected actual original T1 scoped source and evidence against the immutable claim while excluding intervening T2 committed code from T1 delivery.',
      gates:[{gate:'docs',evidenceReference:'Actual GP fixture command and observed docs test output for T1',
        findings:'Reviewed actual original scoped T1 commit and protected T2 code; no Gate inherited from another task.'}],
    });
    expect(result).toMatchObject({passed:true});
    expect(result.files).toContain('src/t1/unfinished.ts');
    expect(result.files).not.toContain('src/t2/test.ts');
    expect(fs.readFileSync(path.join(root,'src/t2/test.ts'),'utf8'))
      .toContain('T2 approved independent');
    expect(ledger.trace('GP-T1').audit.map((row:{event:string})=>row.event))
      .toEqual(expect.arrayContaining(['expired_writer_safely_parked',
        'original_parked_task_resumed']));
  });

  it('rejects parking an active, overlapping, staged or changed expired writer',()=>{
    create('GP-T1',['src/t1/**']);
    create('GP-T2',['src/t2/**']);
    create('GP-OVERLAP',['src/t1/shared.ts']);
    ledger.claim('GP-T1','agent-a',60);
    write('src/t1/draft.ts','original unfinished code');
    expect(()=>ledger.parkExpiredWriter('GP-T1',{
      ...approval,nextTaskId:'GP-T2',
    })).toThrow(/Only an expired/);
    const now=Date.now();
    vi.spyOn(Date,'now').mockReturnValue(now+61_000);
    expect(()=>ledger.parkExpiredWriter('GP-T1',{
      ...approval,nextTaskId:'GP-OVERLAP',
    })).toThrow(/overlaps unfinished/);
    git('add','src/t1/draft.ts');
    expect(()=>ledger.parkExpiredWriter('GP-T1',{
      ...approval,nextTaskId:'GP-T2',
    })).toThrow(/Staged content/);
  });
});
