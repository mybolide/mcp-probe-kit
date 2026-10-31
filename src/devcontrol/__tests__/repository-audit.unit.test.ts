import {afterEach,describe,expect,it} from 'vitest';
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
function fixture(){
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
  createRepo(child);createRepo(app);
  return {root,child,app};
}
afterEach(()=>{for(const root of cleanups.splice(0))fs.rmSync(root,{force:true,recursive:true});});

describe('multi-repository file identity and source audit',()=>{
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
