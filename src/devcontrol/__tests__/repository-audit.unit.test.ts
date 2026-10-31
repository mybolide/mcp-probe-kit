import {afterEach,describe,expect,it,vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {ProjectTaskLedger} from '../task-ledger.js';
import {discoverRepositories,currentRevisions,updateRevisions,revisionDigest,
  stagedChanges,committedChanges,assertRepositoryTopology} from '../repository-audit.js';

const cleanups:string[]=[];
function cmd(root:string,...args:string[]):string {
  return execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:12_000}).trim();
}
function createRepo(root:string):void{
  fs.mkdirSync(root,{recursive:true});
  cmd(root,'init','-q');
  cmd(root,'config','user.name','Audit Fixture');
  cmd(root,'config','user.email','audit@example.invalid');
  fs.writeFileSync(path.join(root,'README.md'),'initial\n');
  cmd(root,'add','README.md');
  cmd(root,'commit','-qm','initial');
}
function fixture(withChildren=true){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'devcontrol-multi-git-'));
  cleanups.push(root);
  createRepo(root);
  fs.writeFileSync(path.join(root,'.gitignore'),'apw-life/\napw-life-app/\n');
  // Exercise the existing project-ledger compatibility profile; planning
  // authorization is tested separately from the multi-Git audit contract.
  fs.mkdirSync(path.join(root,'.neyna'));
  fs.writeFileSync(path.join(root,'.neyna','devcontrol-plan.json'),
    JSON.stringify({schema_version:1,project_id:'fixture',tasks:[{
      id:'FIXTURE-ROOT',title:'Existing legacy setup',track:'governance',release:'V0.1',
      allowed_paths:['docs/**'],required_gates:['docs'],depends_on:[],
      bootstrap:{status:'verified'},
    }]}));
  cmd(root,'add','.gitignore','.neyna/devcontrol-plan.json');
  cmd(root,'commit','-qm','ignore independent projects');
  const child=path.join(root,'apw-life');
  const app=path.join(root,'apw-life-app');
  if(withChildren){createRepo(child);createRepo(app);}
  return {root,child,app};
}
afterEach(()=>{
  vi.restoreAllMocks();
  delete process.env.DEVCONTROL_OWNER_RECOVERY_KEY;
  for(const root of cleanups.splice(0))fs.rmSync(root,{force:true,recursive:true});
});

describe('Owner-authorized migration of a pre-v5 expired active task',()=>{
  const key='unit-test-legacy-recovery-secret-very-long';
  const reason='Owner verified unchanged original configuration, new unrelated Cursor rules and child repository task scope';
  function oldTask(){
    const {root,child,app}=fixture(false);
    const cursor=path.join(root,'.cursor');
    fs.mkdirSync(cursor);
    fs.writeFileSync(path.join(cursor,'mcp.json'),'{"original":"configured"}');
    cmd(root,'add','.cursor/mcp.json');
    cmd(root,'commit','-qm','tracked user config');
    fs.writeFileSync(path.join(cursor,'mcp.json'),'{"original":"modified before claim"}');
    const ledger=new ProjectTaskLedger(root);
    ledger.create({id:'AUDIT-LEGACY',title:'Recover original legacy project task',
      track:'governance',allowedPaths:['apw-life/src/**','apw-life-app/lib/**'],
      requiredGates:['docs']},'agent');
    ledger.approve('AUDIT-LEGACY','owner');
    const lease=ledger.claim('AUDIT-LEGACY','old-developer',60);
    // The originally claimed Git root did not have visible independent repos.
    createRepo(child);createRepo(app);
    const rules=path.join(cursor,'rules');
    fs.mkdirSync(rules);
    fs.writeFileSync(path.join(rules,'mcp-probe-kit.mdc'),'new unrelated guidance');
    fs.mkdirSync(path.join(child,'src'));
    fs.writeFileSync(path.join(child,'src','implementation.ts'),'export const feature=true;');
    const current=Date.now();
    vi.spyOn(Date,'now').mockReturnValue(current+61_000);
    process.env.DEVCONTROL_OWNER_RECOVERY_KEY=key;
    const request={
      actor:'owner',ownerRecoveryKey:key,reason,ttlSeconds:3600,
      preserveExistingWorktree:true,rebaselineLegacyRepositories:true,
    };
    return {root,child,app,ledger,lease,request};
  }

  it('refreshes only HEAD-restored tracked files in root and child, then lets scoped work complete',()=>{
    const f=oldTask();
    try{
      fs.writeFileSync(path.join(f.child,'README.md'),'protected child tracked WIP');
      fs.writeFileSync(path.join(f.app,'draft.txt'),'protected unrelated untracked WIP');
      const migrated=f.ledger.recoverTaskLease('AUDIT-LEGACY',f.request);
      cmd(f.root,'restore','--','.cursor/mcp.json');
      cmd(f.child,'restore','--','README.md');
      cmd(f.child,'add','src/implementation.ts');
      cmd(f.child,'commit','-qm','real child task delivery');
      f.ledger.report('AUDIT-LEGACY',migrated.leaseToken,{
        kind:'project_test',reference:'real project verification for committed task code',
      },true);
      const submission={
        summary:'Completed task after restoring unrelated Owner edits',
        implementation:'Committed only the approved child file',
        verification:'Project-owned tests executed and report attached to Git commits',
      };
      expect(()=>f.ledger.complete('AUDIT-LEGACY',migrated.leaseToken,submission))
        .toThrow(/read-only snapshot|WORKTREE_CHANGED|unrelated pre-existing/i);
      const refresh=f.ledger.refreshProtectedWorktree('AUDIT-LEGACY',{
        actor:'owner',ownerRecoveryKey:key,reason:
          'Checked that two unrelated original tracked files returned to exact Git HEAD, retain other protected files unchanged',
      });
      expect(refresh.refreshed).toEqual(expect.arrayContaining([
        expect.objectContaining({prefix:'',removedPaths:['.cursor/mcp.json']}),
        expect.objectContaining({prefix:'apw-life',removedPaths:['README.md']}),
      ]));
      expect(refresh.refreshed).toHaveLength(2);
      expect(fs.readFileSync(path.join(f.root,'.cursor/rules/mcp-probe-kit.mdc'),'utf8'))
        .toBe('new unrelated guidance');
      expect(fs.readFileSync(path.join(f.app,'draft.txt'),'utf8')).toBe('protected unrelated untracked WIP');
      expect(()=>f.ledger.refreshProtectedWorktree('AUDIT-LEGACY',{
        actor:'owner',ownerRecoveryKey:key,reason:
          'Repeated review of identical HEAD-restored Owner files cannot create duplicate snapshot records',
      })).toThrow(/No previously protected tracked files/);
      f.ledger.complete('AUDIT-LEGACY',migrated.leaseToken,submission);
      f.ledger.reviewExternalGate('AUDIT-LEGACY',migrated.leaseToken,{
        gate:'docs',evidenceReference:'real project verification for committed task code',
        runner:'old-developer',reviewer:'reviewer',outcome:'passed',
        reviewNotes:'Inspected real project test results and the exact committed task-scope child file.',
      });
      expect(f.ledger.verify('AUDIT-LEGACY',migrated.leaseToken)).toMatchObject({passed:true});
      const trace=JSON.stringify(f.ledger.trace('AUDIT-LEGACY'));
      expect(trace).toContain('owner_protected_worktree_refreshed');
      expect(trace).not.toContain(key);
    }finally{f.ledger.close();}
  });

  it('cannot mistake a Git assume-unchanged protected file for an actual HEAD restoration',()=>{
    const f=oldTask();
    try{
      fs.writeFileSync(path.join(f.child,'README.md'),'real protected data not at HEAD');
      f.ledger.recoverTaskLease('AUDIT-LEGACY',f.request);
      cmd(f.child,'update-index','--assume-unchanged','README.md');
      expect(()=>f.ledger.refreshProtectedWorktree('AUDIT-LEGACY',{
        actor:'owner',ownerRecoveryKey:key,
        reason:'A misleading Git index cannot certify protected worktree bytes as the original HEAD blob',
      })).toThrow(/exact Git HEAD bytes/i);
      cmd(f.child,'update-index','--no-assume-unchanged','README.md');
      expect(f.ledger.get('AUDIT-LEGACY').status).toBe('in_progress');
    }finally{f.ledger.close();}
  });

  it('rejects missing Owner key, staged content and missing untracked protection without writes',()=>{
    const f=oldTask();
    try{
      fs.writeFileSync(path.join(f.child,'README.md'),'original tracked WIP');
      fs.writeFileSync(path.join(f.app,'owner-draft.txt'),'protected untracked data');
      f.ledger.recoverTaskLease('AUDIT-LEGACY',f.request);
      cmd(f.child,'restore','--','README.md');
      const request={actor:'owner',ownerRecoveryKey:key,reason:
        'Owner reviewed tracked file restoration without allowing unrelated new files or untracked deletion'};
      expect(()=>f.ledger.refreshProtectedWorktree('AUDIT-LEGACY',{
        ...request,ownerRecoveryKey:'wrong',
      })).toThrow(/Owner recovery credential required|Owner recovery credential/i);
      cmd(f.child,'add','src/implementation.ts');
      expect(()=>f.ledger.refreshProtectedWorktree('AUDIT-LEGACY',request))
        .toThrow(/staged/i);
      cmd(f.child,'reset','-q','HEAD','--','src/implementation.ts');
      fs.unlinkSync(path.join(f.app,'owner-draft.txt'));
      expect(()=>f.ledger.refreshProtectedWorktree('AUDIT-LEGACY',request))
        .toThrow(/Only tracked files restored|Only tracked files/i);
      fs.writeFileSync(path.join(f.app,'owner-draft.txt'),'protected untracked data');
      fs.writeFileSync(path.join(f.app,'unauthorized.txt'),'new unrelated data');
      expect(()=>f.ledger.refreshProtectedWorktree('AUDIT-LEGACY',request))
        .toThrow(/New out-of-scope WIP/i);
      expect(f.ledger.get('AUDIT-LEGACY').status).toBe('in_progress');
      expect(JSON.stringify(f.ledger.trace('AUDIT-LEGACY')))
        .not.toContain('owner_protected_worktree_refreshed');
    }finally{f.ledger.close();}
  });

  it('rejects symlinks and changed HEAD history while reconciling restored files',()=>{
    const f=oldTask();
    try{
      fs.writeFileSync(path.join(f.child,'README.md'),'protected tracked bytes');
      f.ledger.recoverTaskLease('AUDIT-LEGACY',f.request);
      cmd(f.child,'restore','--','README.md');
      fs.symlinkSync(path.join(f.root,'README.md'),path.join(f.child,'invalid-link'));
      const request={actor:'owner',ownerRecoveryKey:key,reason:
        'Explicit Owner restoration of protected child Git HEAD file with no unauthorized changes'};
      expect(()=>f.ledger.refreshProtectedWorktree('AUDIT-LEGACY',request))
        .toThrow(/non-regular|unsafe/i);
      fs.unlinkSync(path.join(f.child,'invalid-link'));
      cmd(f.child,'checkout','--orphan','unexpected');
      cmd(f.child,'add','-A');
      cmd(f.child,'commit','-qm','new rewritten history');
      expect(()=>f.ledger.refreshProtectedWorktree('AUDIT-LEGACY',request))
        .toThrow(/history changed/i);
    }finally{f.ledger.close();}
  });

  it('migrates only under Owner key, protects unrelated dirty files, and still requires real child delivery',()=>{
    const f=oldTask();
    try{
      fs.writeFileSync(path.join(f.child,'README.md'),'unrelated tracked child WIP');
      fs.writeFileSync(path.join(f.app,'unrelated-draft.txt'),'unrelated untracked child WIP');
      expect(()=>f.ledger.recoverTaskLease('AUDIT-LEGACY',{
        ...f.request,ownerRecoveryKey:'invalid',
      })).toThrow(/Owner recovery credential required/i);
      const migrated=f.ledger.recoverTaskLease('AUDIT-LEGACY',f.request);
      expect(migrated).toMatchObject({
        migration:true,status:'in_progress',
        protectedRootPaths:['.cursor/mcp.json','.cursor/rules/mcp-probe-kit.mdc'],
        protectedChildPaths:['apw-life/README.md','apw-life-app/unrelated-draft.txt'],
        childTaskScopeWip:['apw-life/src/implementation.ts'],
      });
      expect(migrated.repositories.map((r:{prefix:string})=>r.prefix))
        .toEqual(['','apw-life','apw-life-app']);
      expect(migrated.repositories[0].baseHead).toBe(f.lease.baseHead);
      expect(migrated.repositories[1].baseHead).toBe(migrated.repositories[1].head);
      expect(JSON.stringify(f.ledger.trace('AUDIT-LEGACY'))).not.toContain(key);
      expect(f.ledger.get('AUDIT-LEGACY').status).toBe('in_progress');
      expect(fs.readFileSync(path.join(f.root,'.cursor/rules/mcp-probe-kit.mdc'),'utf8'))
        .toBe('new unrelated guidance');
      expect(()=>f.ledger.recoverTaskLease('AUDIT-LEGACY',f.request))
        .toThrow(/still active|already|lease/i);
      cmd(f.child,'add','src/implementation.ts');
      expect(f.ledger.checkStaged()).toMatchObject({
        passed:true,stagedFiles:['apw-life/src/implementation.ts'],
      });
      cmd(f.child,'commit','-qm','task source implemented after Owner migration');
      f.ledger.report('AUDIT-LEGACY',migrated.leaseToken,{
        kind:'project_test',reference:'Actual child task tests at migrated commit',
      },true);
      f.ledger.complete('AUDIT-LEGACY',migrated.leaseToken,{
        summary:'Work completed after scoped Owner migration',
        implementation:'Child src/implementation.ts committed under approved task scope',
        verification:'Child project tests passed, independent Gate review still required',
      });
      expect(f.ledger.get('AUDIT-LEGACY').status).toBe('in_review');
      f.ledger.reviewExternalGate('AUDIT-LEGACY',migrated.leaseToken,{
        gate:'docs',evidenceReference:'Actual child task tests at migrated commit',
        runner:'old-developer',reviewer:'independent-reviewer',outcome:'passed',
        reviewNotes:'Reviewed the new child commit and real task test evidence.',
      });
      expect(f.ledger.verify('AUDIT-LEGACY',migrated.leaseToken).passed).toBe(true);
      expect(fs.readFileSync(path.join(f.child,'README.md'),'utf8')).toBe('unrelated tracked child WIP');
      expect(fs.readFileSync(path.join(f.app,'unrelated-draft.txt'),'utf8'))
        .toBe('unrelated untracked child WIP');
      vi.spyOn(Date,'now').mockReturnValue(Date.now()+3_601_000);
      expect(()=>f.ledger.recoverTaskLease('AUDIT-LEGACY',f.request))
        .toThrow(/No original task lease|Only unfinished|already|active/i);
    }finally{f.ledger.close();}
  });

  it('does not let protected unrelated child WIP change, disappear or become staged after recovery',()=>{
    const f=oldTask();
    try{
      fs.writeFileSync(path.join(f.child,'README.md'),'original unrelated tracked change');
      fs.writeFileSync(path.join(f.app,'owner-draft.txt'),'original unrelated untracked change');
      const recovered=f.ledger.recoverTaskLease('AUDIT-LEGACY',f.request);
      cmd(f.child,'add','src/implementation.ts');
      cmd(f.child,'commit','-qm','scoped delivery after migration');
      f.ledger.report('AUDIT-LEGACY',recovered.leaseToken,{
        kind:'unit_test',reference:'real scoped unit tests after recovery',
      },true);
      fs.writeFileSync(path.join(f.app,'owner-draft.txt'),'tampered untracked bytes');
      expect(()=>f.ledger.complete('AUDIT-LEGACY',recovered.leaseToken,{
        summary:'Scoped real delivery',implementation:'Child source committed',
        verification:'Project tests completed',
      })).toThrow(/read-only snapshot/i);
      fs.writeFileSync(path.join(f.app,'owner-draft.txt'),'original unrelated untracked change');
      cmd(f.app,'add','owner-draft.txt');
      expect(()=>f.ledger.complete('AUDIT-LEGACY',recovered.leaseToken,{
        summary:'Scoped real delivery',implementation:'Child source committed',
        verification:'Project tests completed',
      })).toThrow(/staged/i);
      cmd(f.app,'reset','-q','HEAD','--','owner-draft.txt');
      fs.writeFileSync(path.join(f.app,'new-unrelated-file.txt'),'not authorized during migration');
      expect(()=>f.ledger.complete('AUDIT-LEGACY',recovered.leaseToken,{
        summary:'Scoped real delivery',implementation:'Child source committed',
        verification:'Project tests completed',
      })).toThrow(/read-only snapshot/i);
      fs.unlinkSync(path.join(f.app,'new-unrelated-file.txt'));
      f.ledger.complete('AUDIT-LEGACY',recovered.leaseToken,{
        summary:'Scoped real delivery',implementation:'Child source committed',
        verification:'Project tests completed',
      });
      f.ledger.reviewExternalGate('AUDIT-LEGACY',recovered.leaseToken,{
        gate:'docs',evidenceReference:'real scoped unit tests after recovery',
        runner:'old-developer',reviewer:'independent-reviewer',outcome:'passed',
        reviewNotes:'Reviewed child task source at the recorded Git revisions.',
      });
      fs.unlinkSync(path.join(f.app,'owner-draft.txt'));
      expect(f.ledger.verify('AUDIT-LEGACY',recovered.leaseToken)).toMatchObject({
        passed:false,reason:expect.stringMatching(/uncommitted|child/i),
      });
      expect(f.ledger.get('AUDIT-LEGACY').status).toBe('in_review');
    }finally{f.ledger.close();}
  });

  it('fails without migration flags or when original protected bytes changed',()=>{
    const f=oldTask();
    try{
      expect(()=>f.ledger.recoverTaskLease('AUDIT-LEGACY',{
        ...f.request,rebaselineLegacyRepositories:false,
      })).toThrow(/both explicit Owner/i);
      fs.writeFileSync(path.join(f.root,'.cursor/mcp.json'),'tampered original claim bytes');
      expect(()=>f.ledger.recoverTaskLease('AUDIT-LEGACY',f.request))
        .toThrow(/Protected claim-time file changed/);
      expect(f.ledger.get('AUDIT-LEGACY').status).toBe('in_progress');
    }finally{f.ledger.close();}
  });

  it('protects out-of-scope child WIP but refuses staged, symlink and unsafe child content',()=>{
    const f=oldTask();
    try{
      cmd(f.child,'add','src/implementation.ts');
      expect(()=>f.ledger.recoverTaskLease('AUDIT-LEGACY',f.request))
        .toThrow(/staged/i);
      cmd(f.child,'reset','-q','HEAD','--','src/implementation.ts');
      fs.writeFileSync(path.join(f.app,'unapproved.txt'),'outside task');
      cmd(f.app,'add','unapproved.txt');
      expect(()=>f.ledger.recoverTaskLease('AUDIT-LEGACY',f.request))
        .toThrow(/staged/i);
      cmd(f.app,'reset','-q','HEAD','--','unapproved.txt');
      fs.symlinkSync(path.join(f.root,'README.md'),path.join(f.app,'lib-link'));
      expect(()=>f.ledger.recoverTaskLease('AUDIT-LEGACY',f.request))
        .toThrow(/non-regular|unsafe/i);
      expect(fs.existsSync(path.join(f.child,'src/implementation.ts'))).toBe(true);
    }finally{f.ledger.close();}
  });

  it('rejects a child commit-history rewrite after migration and never approves old task evidence',()=>{
    const f=oldTask();
    try{
      const migrated=f.ledger.recoverTaskLease('AUDIT-LEGACY',f.request);
      expect(migrated.migration).toBe(true);
      expect(f.ledger.get('AUDIT-LEGACY').status).toBe('in_progress');
      cmd(f.child,'checkout','--orphan','replacement-history');
      cmd(f.child,'add','-A');
      cmd(f.child,'commit','-qm','rewritten unauthorized child history');
      expect(()=>f.ledger.report('AUDIT-LEGACY',migrated.leaseToken,{
        kind:'unit_test',reference:'old unverifiable evidence',
      },true)).toThrow(/history changed/i);
      expect(f.ledger.get('AUDIT-LEGACY').status).toBe('in_progress');
    }finally{f.ledger.close();}
  });

  it('allows in-review legacy migration without treating old evidence as an accepted multi-Git delivery',()=>{
    const {root,child,app}=fixture(false);
    const ledger=new ProjectTaskLedger(root);
    const secret='review-ready-recovery-secret-longer-than-24';
    const previous=process.env.DEVCONTROL_OWNER_RECOVERY_KEY;
    try{
      ledger.create({id:'AUDIT-REVIEW',title:'Legacy review pending rebaseline',
        track:'governance',allowedPaths:['apw-life/src/**'],
        requiredGates:['docs']},'agent');
      ledger.approve('AUDIT-REVIEW','owner');
      const lease=ledger.claim('AUDIT-REVIEW','old-agent',60);
      ledger.report('AUDIT-REVIEW',lease.leaseToken,{
        kind:'project_test',reference:'Old root Git only test',
      },true);
      createRepo(child);createRepo(app);
      process.env.DEVCONTROL_OWNER_RECOVERY_KEY=secret;
      const now=Date.now();
      vi.spyOn(Date,'now').mockReturnValue(now+61_000);
      const migrated=ledger.recoverTaskLease('AUDIT-REVIEW',{
        actor:'owner',ownerRecoveryKey:secret,reason,
        preserveExistingWorktree:true,rebaselineLegacyRepositories:true,
      });
      expect(migrated.status).toBe('in_review');
      expect(ledger.verify('AUDIT-REVIEW',migrated.leaseToken).passed).toBe(false);
      expect(ledger.get('AUDIT-REVIEW').status).toBe('in_review');
    }finally{
      ledger.close();
      if(previous===undefined)delete process.env.DEVCONTROL_OWNER_RECOVERY_KEY;
      else process.env.DEVCONTROL_OWNER_RECOVERY_KEY=previous;
    }
  });
});

describe('multi-repository file identity and source audit',()=>{
  it('refreshes a single root protected tracked file without accepting any new unrelated dirty file',()=>{
    const {root}=fixture(false);
    fs.writeFileSync(path.join(root,'README.md'),'local Owner notes predating the claim');
    const ledger=new ProjectTaskLedger(root);
    const key='single-root-refresh-owner-recovery-key-long';
    process.env.DEVCONTROL_OWNER_RECOVERY_KEY=key;
    try{
      ledger.create({id:'AUDIT-ROOT-REFRESH',title:'Audit owner restored root Git file',
        track:'governance',allowedPaths:['docs/implementation.md'],requiredGates:['docs']},'agent');
      ledger.approve('AUDIT-ROOT-REFRESH','owner');
      const lease=ledger.claim('AUDIT-ROOT-REFRESH','developer');
      fs.mkdirSync(path.join(root,'docs'));
      fs.writeFileSync(path.join(root,'docs','implementation.md'),'Actual approved task implementation');
      cmd(root,'add','docs/implementation.md');
      cmd(root,'commit','-qm','approved task delivery');
      const evidence='Actual docs acceptance test evidence at task root Git revision';
      ledger.report('AUDIT-ROOT-REFRESH',lease.leaseToken,{kind:'docs',reference:evidence},true);
      cmd(root,'restore','--','README.md');
      const reason='Owner checked original protected README bytes were restored exactly to committed HEAD';
      expect(ledger.refreshProtectedWorktree('AUDIT-ROOT-REFRESH',{
        actor:'owner',ownerRecoveryKey:key,reason,
      })).toMatchObject({refreshed:[
        {prefix:'',removedPaths:['README.md']},
      ]});
      fs.writeFileSync(path.join(root,'new-untracked.txt'),'not previously protected');
      expect(()=>ledger.complete('AUDIT-ROOT-REFRESH',lease.leaseToken,{
        summary:'Implement docs task',implementation:'Committed the required docs file',
        verification:'Real docs test result reported separately',
      })).toThrow(/unrelated pre-existing file changed|WORKTREE_CHANGED/i);
      fs.unlinkSync(path.join(root,'new-untracked.txt'));
      ledger.complete('AUDIT-ROOT-REFRESH',lease.leaseToken,{
        summary:'Implement docs task',implementation:'Committed the required docs file',
        verification:'Real docs test result reported separately',
      });
      ledger.reviewOwnTask('AUDIT-ROOT-REFRESH',lease.leaseToken,{
        outcome:'passed',evidenceReference:evidence,
        findings:'Checked real docs tests, exact source commit, positive and negative cases and frozen scope.',
      });
      ledger.reviewExternalGate('AUDIT-ROOT-REFRESH',lease.leaseToken,{
        gate:'docs',runner:'developer',reviewer:'developer',reviewMode:'self',
        outcome:'passed',evidenceReference:evidence,
        reviewNotes:'Reviewed actual docs test receipt, exact code commit and scoped acceptance criteria.',
      });
      const verified=ledger.verify('AUDIT-ROOT-REFRESH',lease.leaseToken);
      expect(verified.passed,JSON.stringify(verified)).toBe(true);
    }finally{ledger.close();}
  });

  it('lets the same developer self-review actual multi-Git commits and real Gates without an external reviewer',()=>{
    const {root,child}=fixture();
    const ledger=new ProjectTaskLedger(root);
    try{
      ledger.create({id:'AUDIT-SELF',title:'Multi-repository task with responsible Agent self-review',
        track:'governance',allowedPaths:['apw-life/src/**'],requiredGates:['docs']},'agent');
      ledger.approve('AUDIT-SELF','owner');
      const claimed=ledger.claim('AUDIT-SELF','one-developer');
      fs.mkdirSync(path.join(child,'src'));
      fs.writeFileSync(path.join(child,'src','checked.ts'),'export const checked=true;\n');
      cmd(child,'add','src/checked.ts');
      cmd(child,'commit','-qm','implement frozen child scope');
      const reference='Actual multi-repository unit test results, reviewed at the exact child commit';
      ledger.report('AUDIT-SELF',claimed.leaseToken,{kind:'project_test',reference},true);
      ledger.complete('AUDIT-SELF',claimed.leaseToken,{
        summary:'Implemented scoped child delivery',
        implementation:'Committed apw-life/src/checked.ts with its own Git HEAD',
        verification:'Actual project-owned unit tests completed and tied to commit',
      });
      expect(ledger.taskClosureStatus('AUDIT-SELF').nextAction).toBe('self-review');
      expect(()=>ledger.reviewOwnTask('AUDIT-SELF',claimed.leaseToken,{
        outcome:'passed',evidenceReference:'unreported',findings:
          'Inspected actual unit results and exact child Git HEAD, scoped files, and negative cases.',
      })).toThrow(/evidence/i);
      const reviewed=ledger.reviewOwnTask('AUDIT-SELF',claimed.leaseToken,{
        outcome:'passed',evidenceReference:reference,findings:
          'Inspected both repository revisions, exact changed source and committed child file, project test evidence, negative paths and the frozen task acceptance criteria.',
      });
      expect(reviewed).toMatchObject({reviewMode:'developer_self_review',outcome:'passed'});
      expect(ledger.taskClosureStatus('AUDIT-SELF').nextAction).toBe('gate-review');
      expect(()=>ledger.reviewExternalGate('AUDIT-SELF',claimed.leaseToken,{
        gate:'docs',runner:'one-developer',reviewer:'one-developer',
        outcome:'passed',evidenceReference:reference,
        reviewNotes:'I inspected the real tests and source against the frozen acceptance criteria.',
      })).toThrow(/review/i);
      ledger.reviewExternalGate('AUDIT-SELF',claimed.leaseToken,{
        gate:'docs',runner:'one-developer',reviewer:'one-developer',
        reviewMode:'self',outcome:'passed',evidenceReference:reference,
        reviewNotes:'I inspected real test receipts and the exact approved multi-Git source, checked failure behavior and acceptance scope.',
      });
      expect(ledger.verify('AUDIT-SELF',claimed.leaseToken)).toMatchObject({
        passed:true,files:['apw-life/src/checked.ts'],
      });
      expect(ledger.get('AUDIT-SELF').status).toBe('verified');
    }finally{ledger.close();}
  });

  it('rejects developer self-review if child HEAD changes after completed evidence',()=>{
    const {root,child}=fixture();
    const ledger=new ProjectTaskLedger(root);
    try{
      ledger.create({id:'AUDIT-SELF-STALE',title:'Cannot self-review stale child evidence',
        track:'governance',allowedPaths:['apw-life/src/**'],requiredGates:['docs']},'agent');
      ledger.approve('AUDIT-SELF-STALE','owner');
      const claimed=ledger.claim('AUDIT-SELF-STALE','developer');
      fs.mkdirSync(path.join(child,'src'));
      fs.writeFileSync(path.join(child,'src','source.ts'),'export const version=1;');
      cmd(child,'add','src/source.ts');
      cmd(child,'commit','-qm','reviewed candidate');
      const evidence='Actual tests originally collected at child commit v1';
      ledger.report('AUDIT-SELF-STALE',claimed.leaseToken,{kind:'unit_test',reference:evidence},true);
      ledger.complete('AUDIT-SELF-STALE',claimed.leaseToken,{
        summary:'Candidate committed',implementation:'Created child source file',
        verification:'Collected project test evidence for initial commit',
      });
      fs.writeFileSync(path.join(child,'src','source.ts'),'export const version=2;');
      cmd(child,'add','src/source.ts');
      cmd(child,'commit','-qm','new child version without new tests');
      expect(()=>ledger.reviewOwnTask('AUDIT-SELF-STALE',claimed.leaseToken,{
        outcome:'passed',evidenceReference:evidence,
        findings:'Reviewed changed source and original testing results, but the latest child commit was not tested again.',
      })).toThrow(/committed revision|evidence/i);
      expect(ledger.get('AUDIT-SELF-STALE').status).toBe('in_review');
    }finally{ledger.close();}
  });

  it('inspects ignored independent child indexes and maps to frozen workspace paths',()=>{
    const {root,child,app}=fixture();
    const scope=['apw-life/src/**','apw-life-app/lib/**'];
    const repos=discoverRepositories(root,scope);
    expect(repos.map(repo=>repo.prefix)).toEqual(['','apw-life','apw-life-app']);
    const baseline=currentRevisions(repos);
    fs.mkdirSync(path.join(child,'src'));
    fs.writeFileSync(path.join(child,'src','auth.ts'),'export const secure=true;\n');
    cmd(child,'add','src/auth.ts');
    expect(stagedChanges(repos)).toEqual(['apw-life/src/auth.ts']);
    cmd(child,'commit','-qm','approved child file');
    fs.mkdirSync(path.join(app,'lib'));
    fs.writeFileSync(path.join(app,'lib','main.dart'),'void main() {}\n');
    cmd(app,'add','lib/main.dart');
    cmd(app,'commit','-qm','approved mobile file');
    const observed=updateRevisions(root,baseline);
    expect(committedChanges(root,observed)).toEqual(['apw-life-app/lib/main.dart','apw-life/src/auth.ts']);
    expect(revisionDigest(observed)).not.toEqual(revisionDigest(baseline));
    expect(()=>assertRepositoryTopology(root,scope,baseline)).not.toThrow();
    expect(cmd(root,'diff','--name-only','HEAD')).toBe('');
  });

  it('rejects child Git history rewrites and deleted repository identities',()=>{
    const {root,child,app}=fixture();
    const scope=['apw-life/src/**'];
    const revisions=currentRevisions(discoverRepositories(root,scope));
    cmd(child,'checkout','--orphan','replacement');
    fs.writeFileSync(path.join(child,'unrelated.txt'),'replacement');
    cmd(child,'add','-A');cmd(child,'commit','-qm','unrelated orphan commit');
    expect(()=>updateRevisions(root,revisions)).toThrow(/history changed/i);
    fs.renameSync(path.join(child,'.git'),path.join(child,'.git-old'));
    expect(()=>assertRepositoryTopology(root,scope,revisions)).toThrow(/topology changed/i);
  });

  it('enforces child staged-file scope with one parent SQLite ledger',()=>{
    const {root,child,app}=fixture();
    const ledger=new ProjectTaskLedger(root);
    try{
      ledger.create({id:'AUDIT-101',title:'Independent repository scoped task',
        track:'governance',allowedPaths:['apw-life/src/**'],requiredGates:['docs']},'agent');
      ledger.approve('AUDIT-101','owner');
      const claim=ledger.claim('AUDIT-101','agent');
      fs.mkdirSync(path.join(child,'src'));
      fs.writeFileSync(path.join(child,'src','approved.ts'),'export const x=1;');
      cmd(child,'add','src/approved.ts');
      expect(ledger.checkStaged()).toMatchObject({
        passed:true,taskId:'AUDIT-101',stagedFiles:['apw-life/src/approved.ts'],
      });
      fs.writeFileSync(path.join(app,'foreign.ts'),'unapproved sibling repo edit');
      cmd(app,'add','foreign.ts');
      expect(ledger.checkStaged()).toMatchObject({
        passed:false,deniedFiles:['apw-life-app/foreign.ts'],
      });
      cmd(app,'reset','-q','HEAD','--','foreign.ts');
      fs.unlinkSync(path.join(app,'foreign.ts'));
      fs.writeFileSync(path.join(child,'offscope.txt'),'not approved');
      cmd(child,'add','offscope.txt');
      expect(ledger.checkStaged()).toMatchObject({
        passed:false,deniedFiles:['apw-life/offscope.txt'],
      });
      cmd(child,'reset','-q','HEAD','--','offscope.txt');
      fs.unlinkSync(path.join(child,'offscope.txt'));
      cmd(child,'commit','-qm','in scope child commit');
      ledger.report('AUDIT-101',claim.leaseToken,{
        kind:'unit_test',reference:'Independent child repository tests and source review',
      },true);
      ledger.complete('AUDIT-101',claim.leaseToken,{
        summary:'Scoped child Git change committed',
        implementation:'Only child src/approved.ts changed',
        verification:'Task source independently inspected and verified',
      });
      ledger.reviewExternalGate('AUDIT-101',claim.leaseToken,{
        gate:'docs',evidenceReference:'Independent child repository tests and source review',
        runner:'agent',reviewer:'other-reviewer',outcome:'passed',
        reviewNotes:'Reviewed the exact child Git commit, scope and real verification evidence.',
      });
      expect(ledger.verify('AUDIT-101',claim.leaseToken)).toMatchObject({
        passed:true,files:['apw-life/src/approved.ts'],
      });
    }finally{ledger.close();}
  });

  it('rejects a reviewed child delivery if a different child HEAD supersedes the recorded evidence',()=>{
    const {root,child}=fixture();
    const ledger=new ProjectTaskLedger(root);
    try{
      ledger.create({id:'AUDIT-102',title:'Scoped Git revision cannot be reused',
        track:'governance',allowedPaths:['apw-life/src/**'],requiredGates:['docs']},'agent');
      ledger.approve('AUDIT-102','owner');
      const lease=ledger.claim('AUDIT-102','developer');
      fs.mkdirSync(path.join(child,'src'));
      fs.writeFileSync(path.join(child,'src','code.ts'),'export const a=1;');
      cmd(child,'add','src/code.ts');
      cmd(child,'commit','-qm','original task change');
      ledger.report('AUDIT-102',lease.leaseToken,{
        kind:'project_test',reference:'Actual child-specific test at initial Git HEAD',
      },true);
      ledger.complete('AUDIT-102',lease.leaseToken,{
        summary:'Initial committed child revision',implementation:'Source file committed',
        verification:'Actual recorded source tests',
      });
      ledger.reviewExternalGate('AUDIT-102',lease.leaseToken,{
        gate:'docs',evidenceReference:'Actual child-specific test at initial Git HEAD',
        runner:'developer',reviewer:'independent-reviewer',outcome:'passed',
        reviewNotes:'Inspected the first exact child Git revision and its test log.',
      });
      fs.writeFileSync(path.join(child,'src','code.ts'),'export const a=2;');
      cmd(child,'add','src/code.ts');
      cmd(child,'commit','-qm','unreviewed later child revision');
      expect(ledger.verify('AUDIT-102',lease.leaseToken)).toMatchObject({
        passed:false,reason:expect.stringMatching(/child Git HEAD.*changed/i),
      });
      expect(ledger.get('AUDIT-102').status).not.toBe('verified');
    }finally{ledger.close();}
  });
});
