import {afterEach,describe,expect,it,vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {ProjectTaskLedger,DevControlError} from '../task-ledger.js';

let root:string,ledger:ProjectTaskLedger;
const git=(cwd:string,...args:string[])=>execFileSync('git',args,
  {cwd,encoding:'utf8',windowsHide:true,timeout:12000}).trim();
const write=(filename:string,content:string)=>{
  fs.mkdirSync(path.dirname(path.join(root,filename)),{recursive:true});
  fs.writeFileSync(path.join(root,filename),content);
};
const repo=(folder:string)=>{
  const dir=path.join(root,folder);
  fs.mkdirSync(dir,{recursive:true});
  git(dir,'init','-q');
  git(dir,'config','user.name','Independent Git Fixture');
  git(dir,'config','user.email','fixture@example.invalid');
  fs.writeFileSync(path.join(dir,'README.md'),'initial\n');
  git(dir,'add','README.md');
  git(dir,'commit','-qm','initial');
  return dir;
};
const task=(id:string,scope:string[])=>{
  ledger.create({id,title:'Approved independent work '+id,
    track:'governance',allowedPaths:scope,requiredGates:['docs']},'owner');
  ledger.approve(id,'owner');
};

describe('independent repository writers and soft lease expiry',()=>{
  const setup=()=>{
    root=fs.mkdtempSync(path.join(os.tmpdir(),'writer-repositories-'));
    repo('');
    write('.gitignore','/service/\n/app/\n');
    git(root,'add','.gitignore');git(root,'commit','-qm','independent children');
    repo('service');repo('app');
    ledger=new ProjectTaskLedger(root);
    // Existing projects imported their approved worklist before the v5
    // release-plan contract became mandatory. This disposable fixture uses
    // the same recorded legacy compatibility mode as the recovery tests.
    const db=new (createRequire(import.meta.url)('node:sqlite').DatabaseSync)(
      ledger.databasePath);
    db.prepare(`INSERT OR REPLACE INTO dc_meta(key,value)
      VALUES('bootstrap',?)`).run(JSON.stringify({importedTasks:3}));
    db.close();
    task('OLD-APP',['app/src/**']);
    task('NEW-SERVICE',['service/src/**']);
    task('OVERLAP-APP',['app/src/shared.ts']);
  };
  afterEach(()=>{
    vi.restoreAllMocks();
    ledger?.close();
    if(root)fs.rmSync(root,{recursive:true,force:true});
  });

  it('allows two live independent repository writers and isolates staged indexes',()=>{
    setup();
    const app=ledger.claim('OLD-APP','agent-app',1800);
    expect(ledger.executionContract('NEW-SERVICE')).toMatchObject({
      eligible:true,claimableNow:true,writerBlocker:null});
    const service=ledger.claim('NEW-SERVICE','agent-service',1800);
    expect(service.leaseToken).not.toBe(app.leaseToken);
    write('app/src/unfinished.ts','app task WIP\n');
    write('service/src/feature.ts','service task code\n');
    git(path.join(root,'app'),'add','src/unfinished.ts');
    git(path.join(root,'service'),'add','src/feature.ts');
    expect(()=>ledger.checkStaged())
      .toThrow(/Staged files span multiple independent task indexes/);
    expect(ledger.checkStaged('OLD-APP')).toMatchObject({
      passed:true,taskId:'OLD-APP',deniedFiles:[]});
    expect(ledger.checkStaged('NEW-SERVICE')).toMatchObject({
      passed:true,taskId:'NEW-SERVICE',deniedFiles:[]});
  },30000);

  it('keeps a root planning-repository writer independent from active child writers',()=>{
    setup();
    task('ROOT-PLAN',['notes/**']);
    ledger.claim('OLD-APP','agent-app',1800);
    ledger.claim('NEW-SERVICE','agent-service',1800);
    expect(ledger.executionContract('ROOT-PLAN')).toMatchObject({
      eligible:true,claimableNow:true,writerBlocker:null});
    const parent=ledger.claim('ROOT-PLAN','agent-planning',1800);
    // This fixture tests Git index ownership, not Markdown documentation
    // approval. A new .md is correctly subject to the separate docs gate.
    write('notes/decision.json','{"approved":true}\n');
    git(root,'add','notes/decision.json');
    expect(ledger.checkStaged('ROOT-PLAN')).toMatchObject({
      passed:true,taskId:'ROOT-PLAN',deniedFiles:[]});
    expect(parent.baseHead).toBe(git(root,'rev-parse','HEAD'));
    expect(ledger.get('OLD-APP').status).toBe('in_progress');
    expect(ledger.get('NEW-SERVICE').status).toBe('in_progress');
  },30000);

  it('rejects staged root planning files instead of silently accepting an unknown writer',()=>{
    setup();
    ledger.claim('OLD-APP','agent-app',60);
    write('.gitignore','/service/\n/app/\n/.figma.local.json\n');
    git(root,'add','.gitignore');
    expect(()=>ledger.claim('NEW-SERVICE','agent-service',1800))
      .toThrow(/contains staged changes/);
  });

  it('reclaims an expired original child task with its immutable Git base while another child remains active',()=>{
    setup();
    const first=ledger.claim('OLD-APP','agent-app',60);
    write('app/src/unfinished.ts','original app code not yet committed\n');
    const time=Date.now();vi.spyOn(Date,'now').mockReturnValue(time+61_000);
    ledger.claim('NEW-SERVICE','agent-service',1800);
    const resume=ledger.claim('OLD-APP','agent-restored',1800);
    expect(resume.baseHead).toBe(first.baseHead);
    expect(resume.leaseToken).not.toBe(first.leaseToken);
    expect(fs.readFileSync(path.join(root,'app/src/unfinished.ts'),'utf8'))
      .toBe('original app code not yet committed\n');
    expect(ledger.get('NEW-SERVICE').status).toBe('in_progress');
  },30000);

  it('continues an expired task using its own token without an Owner lease-reset',()=>{
    setup();
    const claim=ledger.claim('OLD-APP','agent-app',60);
    const time=Date.now();vi.spyOn(Date,'now').mockReturnValue(time+61_000);
    expect(ledger.renew('OLD-APP',claim.leaseToken)).toMatchObject({taskId:'OLD-APP'});
    expect(ledger.get('OLD-APP').status).toBe('in_progress');
  });

  it('does not allow another writer to steal an overlapping expired child scope',()=>{
    setup();
    ledger.claim('OLD-APP','agent-app',60);
    const time=Date.now();vi.spyOn(Date,'now').mockReturnValue(time+61_000);
    expect(ledger.executionContract('OVERLAP-APP').claimableNow).toBe(false);
    expect(()=>ledger.claim('OVERLAP-APP','other-agent',1800))
      .toThrow(/shared Git repository|overlapping frozen file scope/);
  });

  it('allows independent child tasks despite a later root config edit and an expired unfinished writer',()=>{
    setup();
    const first=ledger.claim('OLD-APP','agent-app',60);
    write('app/src/unfinished.ts','original app Agent work\n');
    write('.gitignore','/service/\n/app/\n/.figma.local.json\n');
    const oldRoot=fs.readFileSync(path.join(root,'.gitignore'));
    const oldApp=fs.readFileSync(path.join(root,'app/src/unfinished.ts'));
    const time=Date.now();vi.spyOn(Date,'now').mockReturnValue(time+61_000);
    expect(ledger.executionContract('NEW-SERVICE')).toMatchObject({
      eligible:true,claimableNow:true,writerBlocker:null});
    const status=ledger.next();
    expect(status.selectedTaskWriterStatus?.claimableNow).toBe(true);
    const second=ledger.claim('NEW-SERVICE','agent-service',1800);
    expect(ledger.get('OLD-APP').status).toBe('in_progress');
    expect(ledger.get('NEW-SERVICE').status).toBe('in_progress');
    write('service/src/new.ts','separate service work\n');
    // The old Agent can still update its own WIP while service is active.
    write('app/src/unfinished.ts','original app Agent work\nmore app work\n');
    const changedApp=fs.readFileSync(path.join(root,'app/src/unfinished.ts'));
    git(path.join(root,'service'),'add','src/new.ts');
    git(path.join(root,'service'),'commit','-qm','only service scope');
    const reference='Independent child service real test evidence for the source';
    ledger.report('NEW-SERVICE',second.leaseToken,{kind:'docs',reference},true);
    ledger.complete('NEW-SERVICE',second.leaseToken,{
      summary:'Service implementation committed in its own Git repository',
      implementation:'Reviewed committed service code and frozen source',
      verification:'Checked isolated service task acceptance evidence',
    });
    expect(fs.readFileSync(path.join(root,'.gitignore')).equals(oldRoot)).toBe(true);
    expect(fs.readFileSync(path.join(root,'app/src/unfinished.ts')).equals(changedApp)).toBe(true);
    expect(oldApp.equals(changedApp)).toBe(false);
    expect(ledger.get('OLD-APP').status).toBe('in_progress');
    expect(first.baseHead).toBe(git(root,'rev-parse','HEAD'));
  },30000);
});
