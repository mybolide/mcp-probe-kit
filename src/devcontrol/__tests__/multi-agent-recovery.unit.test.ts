import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
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

  it('recovers an archived auxiliary worktree baseline without modifying or claiming other Agent bytes',()=>{
    // Before same-common-Git worktrees were excluded from discovery, an old
    // claim could freeze those checkouts as independent repositories. Model
    // the immutable historical SQLite records, not a new downgraded claim.
    const auxPrefix='.worktrees/other-agent';
    const aux=path.join(root,auxPrefix);
    fs.appendFileSync(path.join(root,'.git','info','exclude'),'\n/.worktrees/\n');
    git('worktree','add','-q','-b','test/other-agent',aux,'HEAD');
    write('src/t1/.keep','frozen task local file\n');
    // Do not include the in-scope path in the unrelated protected snapshot.
    git('add','src/t1/.keep');
    git('commit','-qm','fixture initial approved task scope');
    create('GP-T1',['src/t1/**']);
    const original=ledger.claim('GP-T1','agent-a',60);
    fs.writeFileSync(path.join(aux,'README.md'),'other Agent historical WIP\n');
    const bytes=fs.readFileSync(path.join(aux,'README.md'));
    const childFiles=[{path:'README.md',kind:'tracked',
      sha256:createHash('sha256').update(bytes).digest('hex'),size:bytes.length}];
    const db=new (createRequire(import.meta.url)('node:sqlite').DatabaseSync)(
      ledger.databasePath);
    const childGit=execFileSync('git',['rev-parse','--absolute-git-dir'],{
      cwd:aux,encoding:'utf8',windowsHide:true}).trim();
    const childHead=execFileSync('git',['rev-parse','HEAD'],{
      cwd:aux,encoding:'utf8',windowsHide:true}).trim();
    const claimHead=String(original.baseHead);
    const at='2026-11-03T00:00:00.000Z';
    const store=db.prepare(`INSERT INTO dc_task_repository_baselines
      (task_id,prefix,git_dir,base_head,captured_at) VALUES(?,?,?,?,?)`);
    store.run('GP-T1','',path.join(root,'.git'),claimHead,at);
    store.run('GP-T1',auxPrefix,childGit,childHead,at);
    const snapshot=JSON.stringify(childFiles);
    db.prepare(`INSERT INTO dc_legacy_child_worktree_snapshots
      (task_id,prefix,git_dir,snapshot_json,digest,captured_at)
      VALUES(?,?,?,?,?,?)`).run('GP-T1',auxPrefix,childGit,snapshot,
        createHash('sha256').update(snapshot).digest('hex'),at);
    db.close();
    const now=Date.now();
    vi.spyOn(Date,'now').mockReturnValue(now+61_000);
    const recovery=recover('GP-T1');
    expect(recovery).toMatchObject({status:'in_progress',originalBaseHead:claimHead});
    expect(fs.readFileSync(path.join(aux,'README.md'),'utf8'))
      .toBe('other Agent historical WIP\n');
    // The extra record is never deleted or silently rewritten.
    const check=new (createRequire(import.meta.url)('node:sqlite').DatabaseSync)(
      ledger.databasePath);
    const stored=check.prepare(`SELECT COUNT(*) n FROM
      dc_task_repository_baselines WHERE task_id=?`).get('GP-T1');
    expect(stored.n).toBe(2);
    check.close();
    // Every subsequent ledger read must protect the WIP, not merely the
    // original recover action.
    fs.writeFileSync(path.join(aux,'README.md'),'unauthorized change\n');
    expect(()=>ledger.complete('GP-T1',recovery.leaseToken,{
      summary:'frozen exact scope',implementation:'frozen exact source',
      verification:'real project tests',remaining:'',
    })).toThrow(/Historical auxiliary checkout has staged or changed protected Agent files/);
  });

  it('keeps Owner quarantine and later approved-task provenance in one checked append-only chain',()=>{
    create('GP-T1',['src/t1/**']);
    create('GP-T2',['src/t2/**']);
    ledger.claim('GP-T1','agent-a',60);
    write('misc/unassigned.txt','unknown isolated file\n');
    const now=Date.now();
    vi.spyOn(Date,'now').mockReturnValue(now+61_000);
    const sha=createHash('sha256').update(fs.readFileSync(
      path.join(root,'misc/unassigned.txt'))).digest('hex');
    ledger.reviewRecoveryWorktree('GP-T1',{
      ...approval,sourceTaskId:'',quarantineUnknown:true,
      reviewedHead:git('rev-parse','HEAD'),reviewedPaths:['misc/unassigned.txt'],
      reviewedHashes:{'misc/unassigned.txt':sha},
      reason:'Owner explicitly quarantines an unknown newly introduced file, without assigning it to the original task or claiming any test or Gate status.',
    });
    write('src/t2/approved-wip.ts','other separately approved Agent WIP\n');
    ledger.reviewRecoveryWorktree('GP-T1',{
      ...approval,sourceTaskId:'GP-T2',reviewedPaths:['src/t2/approved-wip.ts'],
    });
    expect(recover('GP-T1')).toMatchObject({status:'in_progress'});
    const db=new (createRequire(import.meta.url)('node:sqlite').DatabaseSync)(
      ledger.databasePath);
    db.prepare(`UPDATE dc_recovery_worktree_checkpoints
      SET prior_digest=? WHERE task_id=? AND source_kind='owner_quarantine'`)
      .run('f'.repeat(64),'GP-T1');
    db.close();
    vi.spyOn(Date,'now').mockReturnValue(now+61_000+3_601_000);
    // Internal state reads must reject a tampered predecessor, even when
    // original code and all protected file bytes are unchanged.
    expect(()=>recover('GP-T1'))
      .toThrow(/First recovery checkpoint has no valid original predecessor|recovery checkpoint or predecessor digest changed/);
  });

  it('quarantines only exact new unknown Agent files after explicit Owner authorization, then recovers without attribution',()=>{
    create('GP-T1',['src/t1/**']);
    write('owner-existing.txt','immutable Owner WIP at claim');
    const original=ledger.claim('GP-T1','agent-a',60);
    write('src/t1/task.ts','original task unfinished implementation\n');
    write('agents/unassigned.txt','unknown Agent work that Owner must preserve\n');
    const now=Date.now();
    vi.spyOn(Date,'now').mockReturnValue(now+61_000);
    let errorDetails:any;
    try{recover('GP-T1');}
    catch(error){
      expect((error as DevControlError).code).toBe('WORKTREE_CHANGED');
      errorDetails=(error as DevControlError).details;
    }
    const conflict=errorDetails?.conflicts?.[0];
    expect(conflict).toMatchObject({path:'agents/unassigned.txt',type:'added',
      observed:{kind:'untracked',sha256:expect.any(String)}});
    const reviewedHead=git('rev-parse','HEAD');
    const request={...approval,sourceTaskId:'',quarantineUnknown:true,
      reviewedHead,reviewedPaths:['agents/unassigned.txt'],
      reviewedHashes:{'agents/unassigned.txt':conflict.observed.sha256},
      reason:'Owner reviewed an unattributed file introduced after the original task claim. It is not an approved delivery, must retain the exact bytes, and the developer may only work within the old frozen task scope.'};
    expect(()=>ledger.reviewRecoveryWorktree('GP-T1',{
      ...request,reviewedHashes:{'agents/unassigned.txt':'0'.repeat(64)},
    })).toThrow(/Only exact newly added/);
    expect(()=>ledger.reviewRecoveryWorktree('GP-T1',{
      ...request,explicitAuthorization:false,
    })).toThrow(/Owner must explicitly approve/);
    expect(ledger.reviewRecoveryWorktree('GP-T1',request)).toMatchObject({
      taskId:'GP-T1',sourceTaskId:null,attribution:'unknown_not_approved',
      quarantinedPaths:['agents/unassigned.txt'],filesModifiedByMcp:false,
      testsPassed:false,gateApproved:false,
    });
    const renewed=recover('GP-T1');
    expect(renewed).toMatchObject({status:'in_progress',originalBaseHead:original.baseHead});
    expect(fs.readFileSync(path.join(root,'agents/unassigned.txt'),'utf8'))
      .toBe('unknown Agent work that Owner must preserve\n');
    expect(ledger.trace('GP-T1').audit.map((row:{event:string})=>row.event))
      .toContain('owner_unknown_wip_quarantined');
    git('add','src/t1/task.ts');
    git('commit','-qm','only the original T1 code, never unknown Agent bytes');
    const evidence='T1 independent fixture test results bound to its original code delivery';
    ledger.report('GP-T1',renewed.leaseToken,{kind:'docs',reference:evidence},true);
    ledger.complete('GP-T1',renewed.leaseToken,{
      summary:'Original task delivered while Owner retained unknown Agent files',
      implementation:'Only original frozen T1 implementation was committed',
      verification:'Examined the original task source and separate fixture acceptance requirements',
    });
    const outcome=ledger.verify('GP-T1',renewed.leaseToken,{
      evidenceReference:evidence,
      findings:'The original T1 test fixture was reviewed using its own exact committed source and evidence; the quarantined unknown Agent file remained untouched and did not count as delivery.',
      gates:[{gate:'docs',evidenceReference:evidence,
        findings:'Checked T1 source and separate fixture evidence, without claiming a quarantined Agent file.'}],
    });
    expect(outcome).toMatchObject({passed:true});
    expect(outcome.files).not.toContain('agents/unassigned.txt');
    expect(fs.readFileSync(path.join(root,'agents/unassigned.txt'),'utf8'))
      .toBe('unknown Agent work that Owner must preserve\n');
  });

  it('rejects unknown-file quarantine for mutated protected bytes, frozen scope and later drift',()=>{
    create('GP-T1',['src/t1/**']);
    write('owner-original.txt','preclaim Owner byte-for-byte baseline');
    ledger.claim('GP-T1','agent-a',60);
    write('owner-original.txt','changed prior Owner data');
    write('src/t1/foreign.ts','unknown new file inside original frozen scope');
    const now=Date.now();
    vi.spyOn(Date,'now').mockReturnValue(now+61_000);
    const base={...approval,sourceTaskId:'',quarantineUnknown:true,
      reviewedHead:git('rev-parse','HEAD'),reviewedPaths:['owner-original.txt'],
      reviewedHashes:{'owner-original.txt':'0'.repeat(64)},
      reason:'Owner is reviewing every changed file to protect original WIP, but cannot waive the original immutable scope or overwrite preexisting bytes.'};
    expect(()=>ledger.reviewRecoveryWorktree('GP-T1',base))
      .toThrow(/Only exact newly added/);
    write('owner-original.txt','preclaim Owner byte-for-byte baseline');
    fs.rmSync(path.join(root,'src/t1/foreign.ts'));
    write('unknown.txt','unknown at first review\n');
    const content=fs.readFileSync(path.join(root,'unknown.txt'));
    const sha=createHash('sha256').update(content).digest('hex');
    ledger.reviewRecoveryWorktree('GP-T1',{
      ...base,reviewedPaths:['unknown.txt'],reviewedHashes:{'unknown.txt':sha},
    });
    write('unknown.txt','changed after exact Owner fingerprint\n');
    expect(()=>recover('GP-T1')).toThrow(/unrelated pre-existing file changed/);
  });

  it('resumes an expired original writer after a genuinely Verified disjoint delivery and never claims the foreign commit',()=>{
    create('GP-T1',['src/t1/**']);
    create('GP-T2',['src/t2/**']);
    const first=ledger.claim('GP-T1','agent-a',60);
    write('src/t1/draft.ts','original task remains unfinished\n');
    const now=Date.now();
    vi.spyOn(Date,'now').mockReturnValue(now+61_000);
    ledger.parkExpiredWriter('GP-T1',{
      ...approval,nextTaskId:'GP-T2',
    });
    const other=ledger.claim('GP-T2','agent-b',1800);
    write('src/t2/feature.ts','T2 independent verified source\n');
    git('add','src/t2/feature.ts');
    git('commit','-qm','T2 own approved implementation commit');
    write('src/t2/negative.ts','T2 separately committed regression test\n');
    git('add','src/t2/negative.ts');
    git('commit','-qm','T2 own approved second test commit');
    const verifiedHead=git('rev-parse','HEAD');
    const proof='GP-T2 fixture test source and separate actual test inspection';
    ledger.report('GP-T2',other.leaseToken,{kind:'docs',reference:proof},true);
    ledger.complete('GP-T2',other.leaseToken,{
      summary:'T2 independently delivered its exact frozen source',
      implementation:'Only src/t2/feature.ts was committed as the T2 result',
      verification:'Confirmed separate T2 checked source and relevant test requirements',
    });
    expect(ledger.verify('GP-T2',other.leaseToken,{
      evidenceReference:proof,
      findings:'Independent T2 fixture was inspected against the approved frozen scope, checked source and reported test evidence, without using the original T1 task code.',
      gates:[{gate:'docs',evidenceReference:proof,
        findings:'Reviewed original T2 fixture source, proof and resulting Git commit independently.'}],
    })).toMatchObject({passed:true});
    const returned=recover('GP-T1');
    expect(returned).toMatchObject({status:'in_progress',
      originalBaseHead:first.baseHead,
      verifiedIndependentDeliveries:[{taskId:'GP-T2',baseHead:first.baseHead,
        completionHead:verifiedHead,files:['src/t2/feature.ts','src/t2/negative.ts']}],
    });
    git('add','src/t1/draft.ts');
    expect(ledger.checkStaged()).toMatchObject({passed:true,taskId:'GP-T1'});
    git('commit','-qm','T1 original approved delivery after verified T2');
    const proof1='T1 own separate fixture test evidence tied to final T1 commit';
    ledger.report('GP-T1',returned.leaseToken,{kind:'docs',reference:proof1},true);
    ledger.complete('GP-T1',returned.leaseToken,{
      summary:'T1 resumed work and delivered only its original frozen scope',
      implementation:'Committed T1 original code without claiming the Verified T2 source',
      verification:'Checked the isolated original T1 requirements and evidence',
    });
    const outcome=ledger.verify('GP-T1',returned.leaseToken,{
      evidenceReference:proof1,
      findings:'The original task code and its own test evidence were inspected independently of the Verified T2 commit, which was retained unchanged and excluded from this acceptance.',
      gates:[{gate:'docs',evidenceReference:proof1,
        findings:'Checked the original T1 fixture and its own Git commit, not the separate verified T2 result.'}],
    });
    expect(outcome).toMatchObject({passed:true});
    expect(outcome.files).toContain('src/t1/draft.ts');
    expect(outcome.files).not.toContain('src/t2/feature.ts');
    expect(outcome.files).not.toContain('src/t2/negative.ts');
  });

  it('does not treat an unverified foreign Git commit as an independent approved delivery',()=>{
    create('GP-T1',['src/t1/**']);
    ledger.claim('GP-T1','agent-a',60);
    write('src/t2/not-approved.ts','another Agent committed outside the frozen scope\n');
    git('add','src/t2/not-approved.ts');
    git('commit','-qm','unverified independent-looking commit');
    const now=Date.now();
    vi.spyOn(Date,'now').mockReturnValue(now+61_000);
    expect(()=>recover('GP-T1')).toThrow(/Unverified or unprovable out-of-scope/);
    expect(fs.readFileSync(path.join(root,'src/t2/not-approved.ts'),'utf8'))
      .toBe('another Agent committed outside the frozen scope\n');
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
      writerBlocker:{code:'REPOSITORY_WRITER_CONFLICT',taskId:'GP-T1',
        writerExpired:true},
    });
    expect(ledger.next()).toMatchObject({
      nextTask:{id:'GP-T1'},
      selectedTaskWriterStatus:{claimableNow:true,writerBlocker:null},
    });
    expect(()=>ledger.claim('GP-T2','agent-b',1800))
      .toThrow(/shared Git repository or overlapping frozen file scope/);
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
