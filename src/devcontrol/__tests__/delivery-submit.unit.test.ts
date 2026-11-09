import {afterEach,describe,expect,it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {dispatchDevControl} from '../command.js';
import {ProjectTaskLedger} from '../task-ledger.js';

const fixtures:Array<{root:string;ledger:ProjectTaskLedger}>=[];
function runGit(root:string,...args:string[]):string {
  return execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:10000}).trim();
}
function setup(withGit:boolean){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'devcontrol-submit-'));
  if(withGit){
    runGit(root,'init','-q');
    runGit(root,'config','user.name','Submit Fixture');
    runGit(root,'config','user.email','submit@example.invalid');
    fs.writeFileSync(path.join(root,'README.md'),'# Approved project\n');
    runGit(root,'add','README.md');runGit(root,'commit','-qm','original source');
  }
  const ledger=new ProjectTaskLedger(root);
  fixtures.push({root,ledger});
  const Db=createRequire(import.meta.url)('node:sqlite').DatabaseSync;
  const db=new Db(ledger.databasePath);
  try{db.prepare("INSERT OR REPLACE INTO dc_meta(key,value) VALUES('bootstrap',?)")
    .run(JSON.stringify({importedTasks:1}));}finally{db.close();}
  ledger.create({id:'SUBMIT-1',title:'Implement approved source',
    track:'governance',allowedPaths:['src/**'],requiredGates:['docs']},'agent');
  ledger.approve('SUBMIT-1','owner');
  const claim=ledger.claim('SUBMIT-1','developer');
  return {root,ledger,token:String(claim.leaseToken)};
}
function source(root:string,content='export const feature = true;\n'){
  fs.mkdirSync(path.join(root,'src'),{recursive:true});
  fs.writeFileSync(path.join(root,'src','feature.ts'),content);
}
const input=(token:string)=>({id:'SUBMIT-1',leaseToken:token,
  summary:'Implemented approved feature',
  implementation:'Reviewed committed source change in exact frozen scope',
  verification:'Ran the project documentation test against the delivered source',
  kind:'docs',reference:'Original project test log for this exact tested source'});
const acceptance={
  evidenceReference:'Original project test log for this exact tested source',
  findings:'Reviewed the exact source revision, changed files and actual test evidence; no unrelated source was credited.',
  gates:[{gate:'docs',evidenceReference:'Original project test log for this exact tested source',
    findings:'Compared actual documentation test output with the submitted source and frozen acceptance.'}],
};
afterEach(()=>{for(const fixture of fixtures.splice(0)){
  fixture.ledger.close();fs.rmSync(fixture.root,{recursive:true,force:true});
}});

describe('single-action delivery submission without weaker Gate checks',()=>{
  it('atomically records committed Git completion and evidence, but never verifies the task',()=>{
    const {root,ledger,token}=setup(true);
    source(root);runGit(root,'add','src/feature.ts');
    runGit(root,'commit','-qm','real implementation');
    const head=runGit(root,'rev-parse','HEAD');
    const submitted=dispatchDevControl(ledger,'submit',input(token));
    expect(submitted).toMatchObject({taskId:'SUBMIT-1',status:'in_review',
      evidenceRecorded:true,completionRecorded:true,verified:false,
      passedGates:[],nextAction:'verify'});
    expect(ledger.get('SUBMIT-1').status).toBe('in_review');
    expect(ledger.trace('SUBMIT-1').completion.git_head).toBe(head);
    expect(ledger.trace('SUBMIT-1').evidence).toHaveLength(1);
    expect(runGit(root,'rev-parse','HEAD')).toBe(head);
    expect(()=>dispatchDevControl(ledger,'submit',input(token)))
      .toThrow(/Only an unfinished developing task/);
    expect(ledger.get('SUBMIT-1').status).toBe('in_review');
    expect(ledger.trace('SUBMIT-1').evidence).toHaveLength(1);
    expect(ledger.verify('SUBMIT-1',token,acceptance))
      .toMatchObject({passed:true});
  },30000);

  it('rolls back evidence, completion and audit if the committed Git scope is unapproved',()=>{
    const {root,ledger,token}=setup(true);
    source(root);
    fs.writeFileSync(path.join(root,'unapproved.txt'),'out of scope\n');
    runGit(root,'add','src/feature.ts','unapproved.txt');
    runGit(root,'commit','-qm','unapproved mixed commit');
    expect(()=>dispatchDevControl(ledger,'submit',input(token)))
      .toThrow(/scope|Scope|SCOPE|out.of.scope/);
    const trace=ledger.trace('SUBMIT-1');
    expect(ledger.get('SUBMIT-1').status).toBe('in_progress');
    expect(trace.evidence).toEqual([]);
    expect(trace.completion).toBeNull();
    expect(trace.audit.some((entry:{event:string})=>
      entry.event==='evidence_reported'||entry.event==='delivery_submitted')).toBe(false);
  },30000);

  it('freezes a Gitless SHA-256 source first, then reports real evidence in the same transaction',()=>{
    const {root,ledger,token}=setup(false);
    source(root);
    const submitted=dispatchDevControl(ledger,'submit',input(token));
    expect(submitted).toMatchObject({status:'in_review',verified:false,
      evidenceRecorded:true,completionRecorded:true});
    expect(ledger.trace('SUBMIT-1').evidence).toHaveLength(1);
    expect(ledger.trace('SUBMIT-1').completion.git_head).toMatch(/^files-sha256:/);
    expect(ledger.verify('SUBMIT-1',token,acceptance))
      .toMatchObject({passed:true,evidenceKind:'files-sha256-v1'});
  },30000);

  it('rejects missing test evidence without changing SQLite lifecycle',()=>{
    const {root,ledger,token}=setup(false);
    source(root);
    expect(()=>ledger.submit('SUBMIT-1',token,{...input(token),reference:' '}))
      .toThrow(/concrete test evidence/);
    expect(ledger.get('SUBMIT-1').status).toBe('in_progress');
    expect(ledger.trace('SUBMIT-1').completion).toBeNull();
    expect(ledger.trace('SUBMIT-1').evidence).toEqual([]);
  },30000);
});
