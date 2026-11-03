import {afterEach,describe,expect,it,vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {ProjectTaskLedger} from '../task-ledger.js';
import {discoverRepositories,currentRevisions,updateRevisions,revisionDigest,
  stagedChanges,committedChanges,assertRepositoryTopology,assertDeliveryStillPresent} from '../repository-audit.js';
import {auditedUntrackedFiles,localWorktreeIgnoreFile,localWorktreeExemptedFiles} from '../worktree-ignore.js';
import {previewManagedGuidanceSync} from '../../lib/workflow-skill-installer.js';
import {MCP_PROBE_SKILL_REL_PATH} from '../../lib/workflow-skill-template.js';

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
function dbReadEvidence(databasePath:string,evidenceId:number):{
  kind:string;reference:string;digest:string;
}{
  const sqlite=createRequire(import.meta.url)('node:sqlite') as {
    DatabaseSync:new(filename:string)=>any;
  };
  const db=new sqlite.DatabaseSync(databasePath);
  try{
    return db.prepare(`SELECT e.kind,e.reference,d.digest
      FROM dc_evidence e JOIN dc_evidence_repository_digests d
        ON d.evidence_id=e.id WHERE e.id=?`).get(evidenceId);
  }finally{db.close();}
}
afterEach(()=>{
  vi.restoreAllMocks();
  for(const root of cleanups.splice(0))fs.rmSync(root,{force:true,recursive:true});
});

describe('canonical generated Skill and AGENTS are not task delivery',()=>{
  it('accepts mixed generated guidance and task changes, but excludes maintenance files from completion',()=>{
    const {root,child}=fixture();
    const ledger=new ProjectTaskLedger(root);
    try{
      ledger.create({id:'AUDIT-GUIDANCE',title:'Task files with auto-upgraded managed guidance',
        track:'governance',allowedPaths:['apw-life/src/**'],requiredGates:['docs']},'agent');
      ledger.approve('AUDIT-GUIDANCE','owner');
      const lease=ledger.claim('AUDIT-GUIDANCE','developer');
      const canonical=previewManagedGuidanceSync(root,null);
      fs.mkdirSync(path.dirname(path.join(root,MCP_PROBE_SKILL_REL_PATH)),{recursive:true});
      fs.writeFileSync(path.join(root,MCP_PROBE_SKILL_REL_PATH),canonical.skill);
      fs.writeFileSync(path.join(root,'AGENTS.md'),canonical.agents);
      fs.mkdirSync(path.join(child,'src'));
      fs.writeFileSync(path.join(child,'src','task.ts'),'export const task=true;');
      cmd(root,'add',MCP_PROBE_SKILL_REL_PATH,'AGENTS.md');
      cmd(child,'add','src/task.ts');
      expect(ledger.checkStaged()).toMatchObject({
        passed:true,managedFiles:expect.arrayContaining([MCP_PROBE_SKILL_REL_PATH,'AGENTS.md']),
        deniedFiles:[],
      });
      cmd(root,'commit','-qm','canonical generated MCP guidance');
      cmd(child,'commit','-qm','approved task implementation');
      const reference='Actual task tests for the exact source commit and canonical guidance upgrade';
      ledger.report('AUDIT-GUIDANCE',lease.leaseToken,{kind:'project_test',reference},true);
      ledger.complete('AUDIT-GUIDANCE',lease.leaseToken,{
        summary:'Task implementation without generated guidance ownership',
        implementation:'Only frozen child scope is task delivery',
        verification:'Actual tests executed against the committed child source',
      });
      ledger.reviewOwnTask('AUDIT-GUIDANCE',lease.leaseToken,{
        outcome:'passed',evidenceReference:reference,
        findings:'Checked source changes, canonical generator output, independent repository Git versions and real project test evidence.',
      });
      ledger.reviewExternalGate('AUDIT-GUIDANCE',lease.leaseToken,{
        gate:'docs',runner:'developer',reviewer:'developer',reviewMode:'self',
        outcome:'passed',evidenceReference:reference,
        reviewNotes:'Reviewed actual project test receipts and exact child delivery, with canonical tool guidance omitted from task files.',
      });
      expect(ledger.verify('AUDIT-GUIDANCE',lease.leaseToken)).toMatchObject({
        passed:true,files:['apw-life/src/task.ts'],
      });
    }finally{ledger.close();}
  });
  it('refuses to exempt business source even when the file is tracked and explicitly listed',()=>{
    const {root}=fixture(false);
    fs.mkdirSync(path.join(root,'src'));
    fs.writeFileSync(path.join(root,'src/app.ts'),'original business code');
    cmd(root,'add','src/app.ts');
    cmd(root,'commit','-qm','business source');
    fs.writeFileSync(path.join(root,'src/app.ts'),'changed business code');
    fs.writeFileSync(localWorktreeIgnoreFile(root),'/src/app.ts\n');
    expect(()=>localWorktreeExemptedFiles(root,['src/app.ts']))
      .toThrow(/business source/);
  });
  it('explicitly recognizes tracked AGENTS, MCP Skill and Cursor configuration',()=>{
    const {root}=fixture(false);
    const skill=MCP_PROBE_SKILL_REL_PATH;
    fs.mkdirSync(path.join(root,'.cursor'),{recursive:true});
    fs.mkdirSync(path.dirname(path.join(root,skill)),{recursive:true});
    for(const file of ['AGENTS.md',skill,'.cursor/mcp.json']){
      fs.writeFileSync(path.join(root,file),'initial instructions');
      cmd(root,'add',file);
    }
    cmd(root,'commit','-qm','baseline managed config');
    for(const file of ['AGENTS.md',skill,'.cursor/mcp.json'])
      fs.writeFileSync(path.join(root,file),'local machine instructions');
    fs.writeFileSync(localWorktreeIgnoreFile(root),
      '/AGENTS.md\n/'+skill+'\n/.cursor/mcp.json\n');
    expect(localWorktreeExemptedFiles(root,['AGENTS.md',skill,'.cursor/mcp.json']))
      .toEqual([skill,'.cursor/mcp.json','AGENTS.md']);
    expect(cmd(root,'diff','--name-only')).toContain('AGENTS.md');
    cmd(root,'add','AGENTS.md',skill,'.cursor/mcp.json');
    const ledger=new ProjectTaskLedger(root);
    try{
      expect(ledger.checkStaged()).toMatchObject({
        passed:true,scope:'local-worktree-exemption',
        stagedFiles:[],
        exemptedStagedFiles:['.agents/skills/mcp-probe-kit/SKILL.md',
          '.cursor/mcp.json','AGENTS.md'],
      });
      expect(cmd(root,'diff','--cached','--name-only')).toContain('AGENTS.md');
    }finally{ledger.close();}
  });

  it('portable baselines allow a workspace move without a key, but reject another Git history',()=>{
    const {root}=fixture();
    const id='AUDIT-RELOCATED-REJECT';
    const original=new ProjectTaskLedger(root);
    let baselines:any[]=[];
    try{
      original.create({id,title:'Original frozen three-Git identity',track:'governance',
        allowedPaths:['docs/approved.txt'],requiredGates:['docs']},'agent');
      original.approve(id,'owner');
      const claimed=original.claim(id,'developer');
      baselines=original.trace(id).repositoryBaselines;
      original.release(id,claimed.leaseToken);
    }finally{original.close();}
    const relocated=root+'-reject-move';fs.renameSync(root,relocated);cleanups.push(relocated);
    const child=path.join(relocated,'apw-life');
    const ledger=new ProjectTaskLedger(relocated);
    try{
      expect(baselines.map(row=>row.git_dir)).toEqual([
        '.git','apw-life/.git','apw-life-app/.git']);
      expect(ledger.trace(id).repositoryBaselineRelocations).toEqual([]);
      expect(ledger.get(id).status).toBe('ready');
      expect(()=>updateRevisions(relocated,baselines.map(row=>({
        prefix:row.prefix,gitDir:row.git_dir,baseHead:row.base_head,
        head:row.base_head,
      })))).not.toThrow();
      fs.writeFileSync(path.join(child,'unreviewed.txt'),'staged changes not permitted\n');
      cmd(child,'add','unreviewed.txt');
      expect(stagedChanges(discoverRepositories(relocated,[])))
        .toContain('apw-life/unreviewed.txt');
      expect(ledger.trace(id).repositoryBaselineRelocations).toEqual([]);
      cmd(child,'reset','-q','--','unreviewed.txt');
      fs.rmSync(path.join(child,'unreviewed.txt'));
      fs.rmSync(child,{recursive:true,force:true});
      fs.mkdirSync(child);
      cmd(child,'init','-q');
      cmd(child,'config','user.name','Other Git');
      cmd(child,'config','user.email','other@example.invalid');
      fs.writeFileSync(path.join(child,'README.md'),'Different repository with no ancestor relation\n');
      cmd(child,'add','README.md');cmd(child,'commit','-qm','unrelated independent history');
      expect(()=>updateRevisions(relocated,baselines.map(row=>({
        prefix:row.prefix,gitDir:row.git_dir,baseHead:row.base_head,
        head:row.base_head,
      })))).toThrow(/history changed/i);
      expect(ledger.trace(id).repositoryBaselineRelocations).toEqual([]);
      expect(ledger.get(id).status).toBe('ready');
    }finally{ledger.close();}
  });

  it('rejects staged manual changes posing as generated Skill or AGENTS',()=>{
    const {root}=fixture();
    const ledger=new ProjectTaskLedger(root);
    try{
      fs.writeFileSync(path.join(root,'AGENTS.md'),'user-authored content pretending to be MCP guidance');
      cmd(root,'add','AGENTS.md');
      expect(()=>ledger.checkStaged()).toThrow(/managed guidance validation/);
    }finally{ledger.close();}
  });

  it('accepts original Android layout delivery when a later merge only differs on its second parent',()=>{
    const {root,app}=fixture();
    const main=cmd(app,'branch','--show-current');
    const oldBase=cmd(app,'rev-parse','HEAD');
    cmd(app,'branch','older-unrelated',oldBase);
    const ledger=new ProjectTaskLedger(root);
    try{
      ledger.create({id:'AUDIT-ANDROID-MERGE',
        title:'Android and iOS layout regression tests remain reviewed after unrelated merge',
        track:'governance',
        allowedPaths:['apw-life-app/test/activity_android_ios_layout_test.dart'],
        requiredGates:['docs']},'agent');
      ledger.approve('AUDIT-ANDROID-MERGE','owner');
      const lease=ledger.claim('AUDIT-ANDROID-MERGE','developer');
      fs.mkdirSync(path.join(app,'test'),{recursive:true});
      fs.writeFileSync(path.join(app,'test/activity_android_ios_layout_test.dart'),
        'void main() { /* tested original layout */ }\n');
      cmd(app,'add','test/activity_android_ios_layout_test.dart');
      cmd(app,'commit','-qm','original Android layout delivery');
      const delivered=cmd(app,'rev-parse','HEAD');
      const receipt='Actual Android layout test output for delivered child commit';
      ledger.report('AUDIT-ANDROID-MERGE',lease.leaseToken,
        {kind:'unit_test',reference:receipt},true);
      ledger.complete('AUDIT-ANDROID-MERGE',lease.leaseToken,{
        summary:'Original tested Android and iOS layout',implementation:'Scoped test committed',
        verification:'Actual layout test evidence bound to delivered Git commit',
      });
      cmd(app,'switch','older-unrelated');
      fs.writeFileSync(path.join(app,'README.md'),'old unrelated branch changes\n');
      cmd(app,'add','README.md');
      cmd(app,'commit','-qm','old branch unrelated changes');
      cmd(app,'switch',main);
      cmd(app,'merge','--no-ff','-m','merge old unrelated branch','older-unrelated');
      const merged=cmd(app,'rev-parse','HEAD');
      const scoped='test/activity_android_ios_layout_test.dart';
      expect(cmd(app,'diff','--name-only',merged+'^1',merged,'--',scoped)).toBe('');
      expect(cmd(app,'diff','--name-only',merged+'^2',merged,'--',scoped)).toBe(scoped);
      expect(cmd(app,'diff','--name-only',delivered,'HEAD','--',scoped)).toBe('');
      ledger.reviewOwnTask('AUDIT-ANDROID-MERGE',lease.leaseToken,{
        outcome:'passed',evidenceReference:receipt,
        findings:'Reviewed the originally committed Android layout test, original test evidence, and later integration merge with no first-parent change in the frozen task file.',
      });
      ledger.reviewExternalGate('AUDIT-ANDROID-MERGE',lease.leaseToken,{
        gate:'docs',runner:'developer',reviewer:'developer',reviewMode:'self',
        outcome:'passed',evidenceReference:receipt,
        reviewNotes:'Reviewed the original test evidence and exact submitted file content; second-parent merge diff does not change the frozen delivery.',
      });
      expect(ledger.verify('AUDIT-ANDROID-MERGE',lease.leaseToken))
        .toMatchObject({passed:true});
    }finally{ledger.close();}
  });
});

describe('layered local worktree-ignore protection',()=>{
  it('accepts explicitly listed tracked and staged legacy History docs, but not broad docs sources',()=>{
    const {root}=fixture(false);
    fs.mkdirSync(path.join(root,'docs/history-session'),{recursive:true});
    fs.writeFileSync(path.join(root,'docs/history-session/26.md'),'old local history\n');
    fs.writeFileSync(path.join(root,'docs/history-session/index.json'),'{}\n');
    fs.writeFileSync(path.join(root,'docs/requirements.md'),'approved scope source\n');
    cmd(root,'add','docs/history-session/26.md',
      'docs/history-session/index.json','docs/requirements.md');
    cmd(root,'commit','-qm','baseline requirements and local history');
    fs.writeFileSync(path.join(root,'docs/history-session/26.md'),'updated local history\n');
    fs.writeFileSync(path.join(root,'docs/history-session/index.json'),'{"n":26}\n');
    cmd(root,'add','docs/history-session/index.json');
    fs.writeFileSync(path.join(root,'docs/requirements.md'),'tampered requirement source\n');
    fs.writeFileSync(localWorktreeIgnoreFile(root),'/docs/history-session/\n');
    const files=['docs/history-session/26.md',
      'docs/history-session/index.json','docs/requirements.md'];
    expect(localWorktreeExemptedFiles(root,files)).toEqual(files.slice(0,2));
    expect(cmd(root,'diff','--cached','--name-only'))
      .toContain('docs/history-session/index.json');
    expect(()=>localWorktreeExemptedFiles(root,files,
      file=>file==='docs/history-session/26.md'))
      .toThrow(/frozen task file/);
    fs.writeFileSync(localWorktreeIgnoreFile(root),'/docs/\n');
    expect(()=>localWorktreeExemptedFiles(root,files)).toThrow(/business source/);
    // A business code file under the archive tree is not archive output.
    fs.writeFileSync(path.join(root,'docs/history-session/hide.ts'),'business code');
    fs.writeFileSync(localWorktreeIgnoreFile(root),'/docs/history-session/\n');
    expect(()=>localWorktreeExemptedFiles(root,['docs/history-session/hide.ts']))
      .toThrow(/business source/);
  });

  it('does not block a task because an explicitly exempt tracked History file was staged',()=>{
    const {root}=fixture(false);
    fs.mkdirSync(path.join(root,'docs/history-session'),{recursive:true});
    fs.writeFileSync(path.join(root,'docs/history-session/27.md'),'previous archive');
    cmd(root,'add','docs/history-session/27.md');
    cmd(root,'commit','-qm','local history baseline');
    const ledger=new ProjectTaskLedger(root);
    try{
      ledger.create({id:'AUDIT-HISTORY-EXEMPT',
        title:'Deliver task without touching locally archived History',
        track:'governance',allowedPaths:['docs/task.txt'],requiredGates:['docs']},'agent');
      ledger.approve('AUDIT-HISTORY-EXEMPT','owner');
      const lease=ledger.claim('AUDIT-HISTORY-EXEMPT','developer');
      fs.writeFileSync(path.join(root,'docs/history-session/27.md'),'machine-specific archive');
      cmd(root,'add','docs/history-session/27.md');
      fs.writeFileSync(localWorktreeIgnoreFile(root),'/docs/history-session/\n');
      expect(ledger.checkStaged()).toMatchObject({
        passed:true,scope:'local-worktree-exemption',
        exemptedStagedFiles:['docs/history-session/27.md'],
      });
      fs.writeFileSync(path.join(root,'docs/task.txt'),'actual approved task file');
      cmd(root,'add','docs/task.txt');
      expect(ledger.checkStaged()).toMatchObject({
        passed:true,taskId:'AUDIT-HISTORY-EXEMPT',
        stagedFiles:['docs/task.txt'],deniedFiles:[],
        exemptedStagedFiles:['docs/history-session/27.md'],
      });
      cmd(root,'commit','-qm','approved scope only','--only','--','docs/task.txt');
      const reference='Real test receipt for actual task document';
      ledger.report('AUDIT-HISTORY-EXEMPT',lease.leaseToken,
        {kind:'docs',reference},true);
      ledger.complete('AUDIT-HISTORY-EXEMPT',lease.leaseToken,{
        summary:'Committed approved task document only',
        implementation:'Local tracked History is excluded from worktree checks',
        verification:'Actual task evidence checked against Git delivery',
      });
      expect(ledger.verify('AUDIT-HISTORY-EXEMPT',lease.leaseToken,{
        findings:'Verified actual committed task document against approved scope and real tests; local History remained outside task delivery.',
        evidenceReference:reference,
        gates:[{gate:'docs',evidenceReference:reference,
          findings:'Checked task-specific document tests and exact committed delivery.'}],
      })).toMatchObject({passed:true});
      const audit=ledger.trace('AUDIT-HISTORY-EXEMPT').audit.filter(
        (event:{event:string})=>event.event==='local_worktree_exemption_applied');
      expect(audit.length).toBeGreaterThan(0);
      expect(audit.at(-1).details.evidence[0].files[0]).toMatchObject({
        path:'docs/history-session/27.md',
        sha256:expect.stringMatching(/^[a-f0-9]{64}$/),
      });
    }finally{ledger.close();}
  });

  it('matches explicitly exempt tracked, staged and untracked paths without changing Git tracking',()=>{
    const {root}=fixture(false);
    fs.mkdirSync(path.join(root,'.cursor'),{recursive:true});
    fs.mkdirSync(path.join(root,'.vscode'),{recursive:true});
    fs.writeFileSync(path.join(root,'.cursor/mcp.json'),'baseline configuration');
    fs.writeFileSync(path.join(root,'.vscode/settings.json'),'baseline staged configuration');
    cmd(root,'add','.cursor/mcp.json','.vscode/settings.json');
    cmd(root,'commit','-qm','existing tracked files');
    fs.writeFileSync(path.join(root,'.cursor/mcp.json'),'local tracked override');
    fs.writeFileSync(path.join(root,'.vscode/settings.json'),'staged local override');
    cmd(root,'add','.vscode/settings.json');
    fs.writeFileSync(path.join(root,'local.tmp'),'local new file');
    fs.writeFileSync(localWorktreeIgnoreFile(root),
      '/.cursor/mcp.json\n/.vscode/settings.json\n/local.tmp\n');
    expect(localWorktreeExemptedFiles(root,
      ['.cursor/mcp.json','.vscode/settings.json','local.tmp','README.md']))
      .toEqual(['.cursor/mcp.json','.vscode/settings.json','local.tmp']);
    expect(auditedUntrackedFiles(root)).not.toContain('local.tmp');
    expect(cmd(root,'ls-files','.cursor/mcp.json','.vscode/settings.json'))
      .toContain('.cursor/mcp.json');
    expect(cmd(root,'diff','--cached','--name-only')).toContain('.vscode/settings.json');
    expect(()=>localWorktreeExemptedFiles(root,['.cursor/mcp.json'],
      name=>name==='.cursor/mcp.json')).toThrow(/frozen task file/);
  });
  it('DevControl check honors the ignore file for tracked/staged paths without adding them to task delivery',()=>{
    const {root}=fixture(false);
    fs.mkdirSync(path.join(root,'.cursor'),{recursive:true});
    fs.writeFileSync(path.join(root,'.cursor/mcp.json'),'original user settings');
    cmd(root,'add','.cursor/mcp.json');
    cmd(root,'commit','-qm','baseline tracked settings');
    const ledger=new ProjectTaskLedger(root);
    try{
      ledger.create({id:'AUDIT-IGNORED-TRACKED',
        title:'Deliver code alongside explicitly exempt local tracked settings',
        track:'governance',allowedPaths:['docs/task.txt'],requiredGates:['docs']},'agent');
      ledger.approve('AUDIT-IGNORED-TRACKED','owner');
      const claimed=ledger.claim('AUDIT-IGNORED-TRACKED','developer');
      fs.writeFileSync(path.join(root,'.cursor/mcp.json'),'local machine settings');
      cmd(root,'add','.cursor/mcp.json');
      fs.writeFileSync(localWorktreeIgnoreFile(root),'/.cursor/mcp.json\n');
      expect(ledger.checkStaged()).toMatchObject({
        passed:true,scope:'local-worktree-exemption',
        exemptedStagedFiles:['.cursor/mcp.json'],
      });
      const audited=ledger.trace('AUDIT-IGNORED-TRACKED').audit.filter(
        (event:{event:string})=>event.event==='local_worktree_exemption_applied');
      expect(audited.length).toBeGreaterThan(0);
      const details=audited.at(-1).details;
      expect(details).toMatchObject({
        phase:'check-staged',gitTrackingUnchanged:true,
        testsOrGatesApproved:false,
        evidence:[{repository:'.',rulesSha256:expect.stringMatching(/^[a-f0-9]{64}$/),
          files:[{path:'.cursor/mcp.json',sha256:expect.stringMatching(/^[a-f0-9]{64}$/)}]}],
      });
      fs.mkdirSync(path.join(root,'docs'),{recursive:true});
      fs.writeFileSync(path.join(root,'docs','task.txt'),'approved task code');
      cmd(root,'add','docs/task.txt');
      expect(ledger.checkStaged()).toMatchObject({
        passed:true,taskId:'AUDIT-IGNORED-TRACKED',
        stagedFiles:['docs/task.txt'],exemptedStagedFiles:['.cursor/mcp.json'],
        deniedFiles:[],
      });
      // Git's index is untouched by DevControl. Only the task source is
      // committed: the exempt local file remains staged on this computer.
      cmd(root,'commit','-qm','approved task code','--only','--','docs/task.txt');
      expect(cmd(root,'diff','--cached','--name-only')).toBe('.cursor/mcp.json');
      const reference='Actual test result for the committed task document';
      ledger.report('AUDIT-IGNORED-TRACKED',claimed.leaseToken,
        {kind:'docs',reference},true);
      expect(ledger.complete('AUDIT-IGNORED-TRACKED',claimed.leaseToken,{
        summary:'Committed approved source',implementation:'Only task path',
        verification:'Actual project-owned test was reviewed',
      })).toMatchObject({taskId:'AUDIT-IGNORED-TRACKED'});
      expect(ledger.verify('AUDIT-IGNORED-TRACKED',claimed.leaseToken,{
        findings:'Reviewed the exact committed task document, checked the approved path and actual test output; the local machine settings remain excluded from this delivery.',
        evidenceReference:reference,
        gates:[{gate:'docs',evidenceReference:reference,
          findings:'Confirmed actual project-owned test output for the exact approved Git revision.'}],
      })).toMatchObject({passed:true});
      expect(ledger.trace('AUDIT-IGNORED-TRACKED').audit
        .some((event:{event:string})=>event.event==='local_worktree_exemption_applied'))
        .toBe(true);
    }finally{ledger.close();}
  });
  it('a frozen task file cannot be hidden by adding its pattern to the ignore file',()=>{
    const {root}=fixture(false);
    const ledger=new ProjectTaskLedger(root);
    try{
      ledger.create({id:'AUDIT-IGNORED-SCOPE',title:'Never ignore approved code',
        track:'governance',allowedPaths:['docs/task.txt'],requiredGates:['docs']},'agent');
      ledger.approve('AUDIT-IGNORED-SCOPE','owner');
      ledger.claim('AUDIT-IGNORED-SCOPE','developer');
      fs.mkdirSync(path.join(root,'docs'),{recursive:true});
      fs.writeFileSync(path.join(root,'docs','task.txt'),'unfinished task');
      cmd(root,'add','docs/task.txt');
      fs.writeFileSync(localWorktreeIgnoreFile(root),'/docs/task.txt\n');
      expect(()=>ledger.checkStaged()).toThrow(/frozen task file/);
    }finally{ledger.close();}
  });
  it('adds Git-local untracked exceptions after standard ignores, without modifying Git ignore',()=>{
    const {root,child}=fixture();
    fs.writeFileSync(path.join(root,'.git','info','exclude'),'*.from-git\n');
    fs.writeFileSync(path.join(root,'normal.txt'),'must protect');
    fs.writeFileSync(path.join(root,'notes.from-git'),'standard Git exclusion');
    fs.writeFileSync(path.join(root,'local.tmp'),'local-only exemption');
    fs.writeFileSync(localWorktreeIgnoreFile(root),'/local.tmp\n');
    expect(auditedUntrackedFiles(root)).toContain('normal.txt');
    expect(auditedUntrackedFiles(root)).not.toContain('local.tmp');
    expect(auditedUntrackedFiles(root)).not.toContain('notes.from-git');
    expect(cmd(root,'ls-files','--others','--exclude-standard')).toContain('local.tmp');
    const childIgnore=localWorktreeIgnoreFile(child);
    fs.writeFileSync(path.join(child,'draft.tmp'),'child local-only');
    fs.writeFileSync(childIgnore,'/draft.tmp\n');
    expect(auditedUntrackedFiles(child)).not.toContain('draft.tmp');
    expect(cmd(child,'ls-files','--others','--exclude-standard')).toContain('draft.tmp');
    fs.mkdirSync(path.join(root,'docs'));
    fs.writeFileSync(path.join(root,'docs','scoped.ts'),'do not hide');
    fs.appendFileSync(localWorktreeIgnoreFile(root),'/docs/scoped.ts\n');
    expect(()=>auditedUntrackedFiles(root,name=>name==='docs/scoped.ts'))
      .toThrow(/frozen task file/);
  });

  it('rejects local worktree-ignore exceptions that hide symlinks',()=>{
    const {root}=fixture(false);
    fs.symlinkSync(path.join(root,'README.md'),path.join(root,'hidden-link'));
    fs.writeFileSync(localWorktreeIgnoreFile(root),'/hidden-link\n');
    expect(()=>auditedUntrackedFiles(root)).toThrow(/symlink|non-regular|linked/);
  });
});

describe('immutable multi-repository delivery commits',()=>{
  it('records a genuine frozen multi-Git test rerun after lost legacy logs without a new writer lease or Gate bypass',()=>{
    const {root,child,app}=fixture();
    const ledger=new ProjectTaskLedger(root);
    const id='AUDIT-LOST-RERUN';
    const oldReference='Original Flutter layout test was reported by the legacy runner; original output is lost';
    try{
      ledger.create({id,title:'Replace lost test output by truly testing the frozen Git delivery',
        track:'governance',allowedPaths:['apw-life/test/**'],
        requiredGates:['docs']},'agent');
      ledger.approve(id,'owner');
      const lease=ledger.claim(id,'developer',60);
      fs.mkdirSync(path.join(child,'test'),{recursive:true});
      fs.writeFileSync(path.join(child,'test/layout.test.cjs'),
        "const test = require('node:test');\nconst assert = require('node:assert/strict');\ntest('frozen layout test', () => assert.equal(2+2, 4));\n");
      cmd(child,'add','test/layout.test.cjs');
      cmd(child,'commit','-qm','verified layout source to be tested');
      const heads={'':cmd(root,'rev-parse','HEAD'),
        'apw-life':cmd(child,'rev-parse','HEAD'),
        'apw-life-app':cmd(app,'rev-parse','HEAD')};
      ledger.report(id,lease.leaseToken,{kind:'unit_test',
        reference:oldReference},true);
      ledger.complete(id,lease.leaseToken,{
        summary:'Original frozen layout test delivery',
        implementation:'Original child Git test committed',
        verification:'Original legacy test output was lost after its historical report was stored',
      });
      const sqlite=createRequire(import.meta.url)('node:sqlite') as {
        DatabaseSync:new(filename:string)=>any;
      };
      const db=new sqlite.DatabaseSync(ledger.databasePath);
      let oldId:number;
      try{
        oldId=db.prepare('SELECT id FROM dc_evidence WHERE task_id=? LIMIT 1')
          .get(id).id as number;
        // Simulate historical mismatched repository metadata ONLY in
        // disposable test SQLite, never in the actual Neyna database.
        db.prepare('UPDATE dc_evidence_repository_digests SET digest=? WHERE evidence_id=?')
          .run('0'.repeat(64),oldId);
      }finally{db.close();}
      // Another contributor may advance HEAD in an unrelated area. The
      // original scoped delivery is still intact, but testing that newer
      // checkout would wrongly include unrelated changed dependencies.
      fs.writeFileSync(path.join(child,'README.md'),'later unrelated code integration\n');
      cmd(child,'add','README.md');
      cmd(child,'commit','-qm','later unrelated integration');
      fs.appendFileSync(path.join(root,'.git/info/exclude'),'\n/.neyna/state/\n');
      fs.mkdirSync(path.join(root,'.neyna/state'),{recursive:true});
      const testedCheckouts={
        '':'.neyna/state/rerun-root',
        'apw-life':'.neyna/state/rerun-child',
        'apw-life-app':'.neyna/state/rerun-app',
      };
      for(const [prefix,checkout] of Object.entries(testedCheckouts)){
        const original=prefix===''?root:prefix==='apw-life'?child:app;
        cmd(original,'worktree','add','--detach',path.join(root,checkout),heads[prefix as keyof typeof heads]);
      }
      const cwd=testedCheckouts['apw-life'];
      const testDir=path.join(root,cwd);
      const runOriginal=(args:string[],name:string)=>{
        const result=spawnSync(process.execPath,args,{cwd:testDir,encoding:'utf8',timeout:12_000});
        const log='Actual frozen test command: node '+args.join(' ')+
          '\nActual frozen child HEAD: '+cmd(testDir,'rev-parse','HEAD')+
          '\nObserved exit: '+result.status+'\n'+result.stdout+'\n'+result.stderr;
        const relative='.neyna/state/'+name+'.log';
        fs.writeFileSync(path.join(root,relative),log);
        return {artifactPath:relative,artifactSha256:createHash('sha256').update(log).digest('hex'),
          exitCode:result.status??255};
      };
      const reason='The legacy test artifact was lost during cross-machine migration, so the real project tests were rerun from isolated checkouts at every exact frozen Git commit.';
      const findings='Inspected the actual Node test command output, real exit code and the detached Git commit of every frozen repository. The later child README change was not included in the test checkout. Re-running does not assert any Gate or replace the original historical report.';
      const makeRequest=(cmdline:string,output:ReturnType<typeof runOriginal>)=>({
        id,leaseToken:lease.leaseToken,actor:'developer',reason,
        supersedesEvidenceId:oldId,deliveryHeads:heads,testedCheckouts,
        commandCwd:cwd,command:cmdline,...output,findings,
      });
      const now=Date.now();
      vi.spyOn(Date,'now').mockReturnValue(now+61_000);
      expect(ledger.taskClosureStatus(id)).toMatchObject({
        nextAction:'rebind-legacy-evidence',reviewTokenUsable:true,
        staleLegacyEvidence:[{evidenceId:oldId}],frozenDeliveryHeads:heads,
      });
      expect(()=>ledger.report(id,lease.leaseToken,
        {kind:'unit_test',reference:'new test'},false))
        .toThrow(/Active writer lease/);
      const failedOutput=runOriginal(['--test','test/missing.test.cjs'],'rerun-failed');
      expect(failedOutput.exitCode).not.toBe(0);
      const failRun=ledger.recordRerunEvidence(makeRequest(
        'node --test test/missing.test.cjs',failedOutput));
      expect(failRun).toMatchObject({exitCode:failedOutput.exitCode,
        passedTest:false,evidenceId:null,gateApproved:false});
      expect(ledger.get(id).status).toBe('in_review');
      const passedOutput=runOriginal(['--test','test/layout.test.cjs'],'rerun-passed');
      expect(passedOutput.exitCode).toBe(0);
      const request=makeRequest('node --test test/layout.test.cjs',passedOutput);
      expect(()=>ledger.recordRerunEvidence({...request,
        exitCode:null as unknown as number}))
        .toThrow(/actual|exit code|0–255|Provide an original evidence ID/);
      expect(()=>ledger.recordRerunEvidence({...request,
        supersedesEvidenceId:999999}))
        .toThrow(/supersedesEvidenceId must refer/);
      fs.writeFileSync(path.join(testDir,'UNTRACKED-POLLUTION.txt'),
        'Untracked source outside the original frozen Git commit');
      expect(()=>ledger.recordRerunEvidence(request))
        .toThrow(/untracked source changes/);
      fs.unlinkSync(path.join(testDir,'UNTRACKED-POLLUTION.txt'));
      const link='.neyna/state/rerun-output-symlink.log';
      fs.symlinkSync(path.join(root,passedOutput.artifactPath),path.join(root,link));
      expect(()=>ledger.recordRerunEvidence({...request,
        artifactPath:link}))
        .toThrow(/regular, non-symlink/);
      expect(()=>ledger.recordRerunEvidence({...request,
        testedCheckouts:{...testedCheckouts,'apw-life':'apw-life'}}))
        .toThrow(/Test checkout HEAD differs|checkout must|unique real directory/);
      expect(()=>ledger.recordRerunEvidence({...request,
        deliveryHeads:{...heads,'apw-life':'0'.repeat(40)}}))
        .toThrow(/DELIVERY_HEAD_CHANGED|Git|ancestor|Mismatch|mismatch/i);
      expect(()=>ledger.recordRerunEvidence({...request,
        artifactSha256:'b'.repeat(64)}))
        .toThrow(/Rerun output SHA-256 differs/);
      const registered=ledger.recordRerunEvidence(request);
      expect(registered).toMatchObject({taskId:id,passedTest:true,
        gateApproved:false,testsExecutedByMcp:false,supersedesEvidenceId:oldId});
      expect(typeof registered.evidenceReference).toBe('string');
      expect(ledger.taskClosureStatus(id)).toMatchObject({
        nextAction:'verify',staleLegacyEvidence:[],reviewTokenUsable:true,
      });
      expect(()=>ledger.recordRerunEvidence(request))
        .toThrow(/already recorded/);
      expect(dbReadEvidence(ledger.databasePath,oldId)).toMatchObject({
        reference:oldReference,digest:'0'.repeat(64),
      });
      expect(ledger.verify(id,lease.leaseToken)).toMatchObject({passed:false});
      const accepted=ledger.verify(id,lease.leaseToken,{
        evidenceReference:registered.evidenceReference,
        findings:'I reviewed the real rerun output against the exact frozen multi-Git delivery, including the negative-case test and current descendant source, and found the recorded results supported the declared acceptance.',
        gates:[{gate:'docs',evidenceReference:registered.evidenceReference,
          findings:'I inspected the actual source test output and checked the exact original frozen revision of every repository.'}],
      });
      expect(accepted).toMatchObject({passed:true,acceptanceRecorded:true});
      expect(ledger.get(id).status).toBe('verified');
      const audit=ledger.trace(id).audit.filter((entry:{event:string})=>
        entry.event==='real_test_rerun_recorded');
      expect(audit).toHaveLength(2);
    }finally{ledger.close();}
  });

  it('audits legacy multi-Git evidence rebind without rewriting old receipts, approving Gates or renewing expired writers',()=>{
    const {root,child,app}=fixture();
    const ledger=new ProjectTaskLedger(root);
    const id='AUDIT-LEGACY-EVIDENCE';
    const receipt='Recorded original Flutter Android layout test output at verified task delivery';
    try{
      ledger.create({id,title:'Audit original multi-Git receipt binding without rerunning tests',
        track:'governance',allowedPaths:['apw-life/src/**'],
        requiredGates:['docs']},'agent');
      ledger.approve(id,'owner');
      const lease=ledger.claim(id,'developer',60);
      fs.mkdirSync(path.join(child,'src'),{recursive:true});
      fs.writeFileSync(path.join(child,'src/task.ts'),'export const tested=1;');
      cmd(child,'add','src/task.ts');cmd(child,'commit','-qm','original tested task');
      const heads={'':cmd(root,'rev-parse','HEAD'),
        'apw-life':cmd(child,'rev-parse','HEAD'),
        'apw-life-app':cmd(app,'rev-parse','HEAD')};
      ledger.report(id,lease.leaseToken,{kind:'flutter_test',reference:receipt},true);
      ledger.complete(id,lease.leaseToken,{
        summary:'Original tested task delivery',implementation:'Frozen scoped child commit',
        verification:'Original real Flutter test receipt predates version-vector migration',
      });
      const sqlite=createRequire(import.meta.url)('node:sqlite') as {
        DatabaseSync:new(filename:string)=>any;
      };
      const db=new sqlite.DatabaseSync(ledger.databasePath);
      let originalId:number;
      try{
        originalId=db.prepare('SELECT id FROM dc_evidence WHERE task_id=? LIMIT 1')
          .get(id).id as number;
        // Simulate a legacy v5 receipt that was recorded against stale child
        // metadata. Never change production SQLite directly.
        db.prepare('UPDATE dc_evidence_repository_digests SET digest=? WHERE evidence_id=?')
          .run('0'.repeat(64),originalId);
      }finally{db.close();}
      fs.appendFileSync(path.join(root,'.git/info/exclude'),'\n/test-artifacts/\n');
      fs.mkdirSync(path.join(root,'test-artifacts'),{recursive:true});
      const artifact='test-artifacts/original-flutter.log';
      const output='Original flutter test evidence: 27 Android and iOS layout test cases executed with exit 0; PASS. Reviewed the exact app and child commits, outputs and no untested change.\n';
      fs.writeFileSync(path.join(root,artifact),output);
      const sha=createHash('sha256').update(output).digest('hex');
      const request={
        id,leaseToken:lease.leaseToken,actor:'developer',
        reason:'Legacy v5 failed to bind the existing recorded test receipt to the actual frozen original multi-repository task delivery.',
        evidenceReference:receipt,deliveryHeads:heads,
        artifactPath:artifact,artifactSha256:sha,
        findings:'I inspected the original recorded Flutter test output and exit status, verified its provenance against the exact three frozen Git commits, and checked the immutable original code and all frozen test acceptance requirements. No new test or Gate is claimed.',
      };
      const acceptance={
        evidenceReference:receipt,
        findings:'The existing Flutter output and original frozen Git commits were inspected for actual functionality, negative cases and the unchanged approved code.',
        gates:[{gate:'docs',evidenceReference:receipt,
          findings:'Inspected the original actual Flutter test output and frozen docs acceptance.'}],
      };
      const now=Date.now();
      vi.spyOn(Date,'now').mockReturnValue(now+61_000);
      expect(ledger.taskClosureStatus(id)).toMatchObject({
        status:'in_review',nextAction:'rebind-legacy-evidence',
        reviewTokenUsable:true,frozenDeliveryHeads:heads,
        staleLegacyEvidence:[{reference:receipt,evidenceId:originalId}],
      });
      expect(()=>ledger.report(id,lease.leaseToken,{
        kind:'flutter_test',reference:'Cannot report invented new test',
      },false)).toThrow(/Active writer lease/);
      expect(()=>ledger.verify(id,lease.leaseToken,acceptance))
        .toThrow(/REPOSITORY_EVIDENCE_STALE|test receipt must cover/i);
      expect(ledger.get(id).status).toBe('in_review');
      expect(()=>ledger.rebindLegacyEvidence({...request,
        deliveryHeads:{...heads,'apw-life':'0'.repeat(40)}}))
        .toThrow(/DELIVERY_HEAD_CHANGED|Git|ancestor|Mismatch|mismatch/i);
      expect(()=>ledger.rebindLegacyEvidence({...request,
        artifactSha256:'a'.repeat(64)}))
        .toThrow(/artifact content does not match/i);
      const result=ledger.rebindLegacyEvidence(request);
      expect(result).toMatchObject({taskId:id,evidenceRebound:true,
        testsExecuted:false,gateApproved:false,sourceEvidenceId:originalId});
      expect(ledger.taskClosureStatus(id)).toMatchObject({
        nextAction:'verify',staleLegacyEvidence:[],
        reviewTokenUsable:true,
      });
      expect(ledger.verify(id,lease.leaseToken)).toMatchObject({passed:false});
      expect(()=>ledger.rebindLegacyEvidence(request))
        .toThrow(/ALREADY_REBOUND|prior audited binding/i);
      const original=dbReadEvidence(ledger.databasePath,originalId);
      expect(original).toMatchObject({kind:'flutter_test',reference:receipt,
        digest:'0'.repeat(64)});
      expect(ledger.trace(id).audit.some((event:{event:string})=>
        event.event==='legacy_test_evidence_repository_rebound')).toBe(true);
      expect(ledger.verify(id,lease.leaseToken,acceptance))
        .toMatchObject({passed:true,acceptanceRecorded:true});
      expect(ledger.get(id).status).toBe('verified');
    }finally{ledger.close();}
  });

  it('does not mistake a merge second-parent difference for a changed frozen delivery',()=>{
    const {root,child}=fixture();
    const initial=cmd(child,'rev-parse','HEAD');
    const main=cmd(child,'branch','--show-current');
    cmd(child,'branch','old-feature',initial);
    fs.mkdirSync(path.join(child,'src'),{recursive:true});
    fs.writeFileSync(path.join(child,'src','task.ts'),'export const task=1;\n');
    cmd(child,'add','src/task.ts');
    cmd(child,'commit','-qm','original verified task delivery');
    const delivered=cmd(child,'rev-parse','HEAD');
    cmd(child,'switch','old-feature');
    fs.writeFileSync(path.join(child,'README.md'),'unrelated old feature branch\n');
    cmd(child,'add','README.md');
    cmd(child,'commit','-qm','old unrelated feature');
    cmd(child,'switch',main);
    cmd(child,'merge','--no-ff','-m','integrate unrelated old feature','old-feature');
    const merged=cmd(child,'rev-parse','HEAD');
    expect(cmd(child,'diff','--name-only',merged+'^1',merged,'--','src/task.ts'))
      .toBe('');
    expect(cmd(child,'diff','--name-only',merged+'^2',merged,'--','src/task.ts'))
      .toBe('src/task.ts');
    const frozen=[{prefix:'apw-life',gitDir:'apw-life/.git',
      baseHead:initial,head:delivered}];
    const observed=[{...frozen[0],head:merged}];
    expect(()=>assertDeliveryStillPresent(root,frozen,observed,
      ['apw-life/src/**'])).not.toThrow();

    // A later first-parent scoped modification must still invalidate the
    // original approval even if a second commit reverts to identical bytes.
    fs.writeFileSync(path.join(child,'src/task.ts'),'export const task=2;\n');
    cmd(child,'add','src/task.ts');cmd(child,'commit','-qm','change reviewed code');
    fs.writeFileSync(path.join(child,'src/task.ts'),'export const task=1;\n');
    cmd(child,'add','src/task.ts');cmd(child,'commit','-qm','revert change');
    expect(cmd(child,'diff','--name-only',delivered,'HEAD','--','src/task.ts'))
      .toBe('');
    expect(()=>assertDeliveryStillPresent(root,frozen,[{...frozen[0],
      head:cmd(child,'rev-parse','HEAD')}],['apw-life/src/**']))
      .toThrow(/Later commit touched frozen task scope/);
  });

  it('rejects a merge that actually changes frozen source against its first parent',()=>{
    const {root,child}=fixture();
    const initial=cmd(child,'rev-parse','HEAD');
    const main=cmd(child,'branch','--show-current');
    fs.mkdirSync(path.join(child,'src'),{recursive:true});
    fs.writeFileSync(path.join(child,'src','task.ts'),'export const task=1;\n');
    cmd(child,'add','src/task.ts');cmd(child,'commit','-qm','original delivery');
    const delivered=cmd(child,'rev-parse','HEAD');
    cmd(child,'switch','-c','change-scope');
    fs.writeFileSync(path.join(child,'src/task.ts'),'export const task=2;\n');
    cmd(child,'add','src/task.ts');cmd(child,'commit','-qm','side branch changed source');
    cmd(child,'switch',main);
    cmd(child,'merge','--no-ff','-m','merge changed source','change-scope');
    const frozen=[{prefix:'apw-life',gitDir:'apw-life/.git',
      baseHead:initial,head:delivered}];
    expect(()=>assertDeliveryStillPresent(root,frozen,[{...frozen[0],
      head:cmd(child,'rev-parse','HEAD')}],['apw-life/src/**']))
      .toThrow(/Later commit touched frozen task scope/);
  });

  it('legacy absolute three-repository SQLite records survive a workspace move without Owner key or rewritten evidence',()=>{
    const {root,child}=fixture();
    fs.writeFileSync(path.join(child,'README.md'),'Original child Owner WIP preserved across copy\n');
    const ledger=new ProjectTaskLedger(root);
    const ids=['AUDIT-RELOCATED-VERIFIED','AUDIT-RELOCATED-PENDING'];
    const databasePath=ledger.databasePath;
    let original:ReturnType<typeof ledger.trace>[]=[];
    let pendingToken='';
    try{
      for(const id of ids){
        ledger.create({id,title:'Frozen source from original location '+id,
          track:'governance',allowedPaths:['docs/'+id+'.txt'],
          requiredGates:[id===ids[0]?'docs':'python_pytest']},'agent');
        ledger.approve(id,'owner');
      }
      const first=ledger.claim(ids[0],'developer');
      fs.mkdirSync(path.join(root,'docs'));
      fs.writeFileSync(path.join(root,'docs/'+ids[0]+'.txt'),'First committed revision\n');
      cmd(root,'add','docs/'+ids[0]+'.txt');cmd(root,'commit','-qm','first frozen task');
      const receipt='Fixture actual first task project file verification receipt';
      ledger.report(ids[0],first.leaseToken,{kind:'docs',reference:receipt},true);
      ledger.complete(ids[0],first.leaseToken,{
        summary:'Original verified source committed',implementation:'Root-only files committed',
        verification:'Fixture test receipt recorded',
      });
      ledger.reviewOwnTask(ids[0],first.leaseToken,{
        outcome:'passed',evidenceReference:receipt,
        findings:'Inspected exact first Git commit, preserved child Owner source and actual fixture test evidence.',
      });
      ledger.reviewExternalGate(ids[0],first.leaseToken,{
        gate:'docs',runner:'fixture-runner',reviewer:'developer',reviewMode:'self',
        outcome:'passed',evidenceReference:receipt,
        reviewNotes:'Checked the frozen approved root source, real fixture receipt and unchanged child snapshots.',
      });
      expect(ledger.verify(ids[0],first.leaseToken).passed).toBe(true);
      const second=ledger.claim(ids[1],'developer');
      pendingToken=second.leaseToken;
      fs.writeFileSync(path.join(root,'docs/'+ids[1]+'.txt'),'Pending original delivery\n');
      cmd(root,'add','docs/'+ids[1]+'.txt');cmd(root,'commit','-qm','second frozen task');
      ledger.report(ids[1],pendingToken,{
        kind:'python_pytest',reference:'Fixture external PostgreSQL Gate still not available',
      },true);
      ledger.complete(ids[1],pendingToken,{
        summary:'Pending root-only test',implementation:'Original committed Git SHA',
        verification:'External Gate not yet passed',
      });
      original=ids.map(id=>ledger.trace(id));
    }finally{ledger.close();}
    // Simulate the actual pre-relative v5 SQLite schema: every original
    // Git location AND frozen delivery/evidence digest used absolute paths.
    // This direct mutation is confined to a disposable TEST fixture, never
    // a real DevControl project database or its governance entrypoint.
    const sqlite=createRequire(import.meta.url)('node:sqlite') as {
      DatabaseSync:new(filename:string)=>any;
    };
    const db=new sqlite.DatabaseSync(databasePath);
    try{
      for(const id of ids){
        const baseline=db.prepare('SELECT prefix FROM dc_task_repository_baselines WHERE task_id=?')
          .all(id) as Array<{prefix:string}>;
        const oldDir=(prefix:string)=>fs.realpathSync(path.join(root,prefix,'.git'));
        for(const row of baseline){
          db.prepare('UPDATE dc_task_repository_baselines SET git_dir=? WHERE task_id=? AND prefix=?')
            .run(oldDir(row.prefix),id,row.prefix);
          db.prepare('UPDATE dc_legacy_child_worktree_snapshots SET git_dir=? WHERE task_id=? AND prefix=?')
            .run(oldDir(row.prefix),id,row.prefix);
        }
        const completions=db.prepare('SELECT revision,snapshot_json FROM dc_completion_repository_revisions WHERE task_id=?')
          .all(id) as Array<{revision:number;snapshot_json:string}>;
        for(const completion of completions){
          const previous=JSON.parse(completion.snapshot_json) as Array<{
            prefix:string;gitDir:string;baseHead:string;head:string;
          }>;
          const absolute=previous.map(repo=>({...repo,gitDir:oldDir(repo.prefix)}));
          const digest=revisionDigest(absolute);
          db.prepare('UPDATE dc_completion_repository_revisions SET snapshot_json=?,digest=? WHERE task_id=? AND revision=?')
            .run(JSON.stringify(absolute),digest,id,completion.revision);
          db.prepare('UPDATE dc_evidence_repository_digests SET digest=? WHERE evidence_id IN (SELECT id FROM dc_evidence WHERE task_id=?)')
            .run(digest,id);
          db.prepare('UPDATE dc_external_gate_repository_digests SET digest=? WHERE task_id=?')
            .run(digest,id);
        }
      }
    }finally{db.close();}
    const historical=new ProjectTaskLedger(root);
    try{original=ids.map(id=>historical.trace(id));}finally{historical.close();}
    const relocated=root+'-relocated';
    fs.renameSync(root,relocated);cleanups.push(relocated);
    const moved=new ProjectTaskLedger(relocated);
    try{
      expect(moved.trace(ids[0]).repositoryBaselineRelocations).toEqual([]);
      expect(original[0].repositoryBaselines.every((row:any)=>
        path.isAbsolute(row.git_dir))).toBe(true);
      expect(moved.checkStaged()).toMatchObject({
        passed:false,reason:'No staged task changes',deniedFiles:[],
      });
      for(const [i,id] of ids.entries()){
        const after=moved.trace(id);
        expect(after.repositoryBaselines).toEqual(original[i].repositoryBaselines);
        expect(after.evidence).toEqual(original[i].evidence);
        expect(after.completion).toEqual(original[i].completion);
        expect(after.externalGateReviews).toEqual(original[i].externalGateReviews);
        expect(after.task.status).toBe(original[i].task.status);
        expect(after.task.requiredGates).toEqual(original[i].task.requiredGates);
        expect(after.repositoryBaselineRelocations).toHaveLength(0);
      }
      expect(moved.get(ids[0]).status).toBe('verified');
      expect(moved.get(ids[1]).status).toBe('in_review');
      const notPassed=moved.verify(ids[1],pendingToken);
      expect(notPassed.passed).toBe(false);
      expect(String(notPassed.reason??'')).not.toMatch(/repository/i);
      expect(moved.trace(ids[0]).repositoryBaselineRelocations).toHaveLength(0);
      expect(fs.readFileSync(path.join(relocated,'apw-life','README.md'),'utf8'))
        .toBe('Original child Owner WIP preserved across copy\n');
    }finally{moved.close();}
  });

  it('defers a failed root-only external Gate with unrelated child WIP, frees the lease and resumes the original commit',()=>{
    const {root,child}=fixture();
    const tracked='Other Agent existing tracked changes — do not touch\n';
    const untracked='Other Agent existing untracked changes — do not touch\n';
    fs.writeFileSync(path.join(child,'README.md'),tracked);
    fs.writeFileSync(path.join(child,'draft.txt'),untracked);
    const childHead=cmd(child,'rev-parse','HEAD');
    const ledger=new ProjectTaskLedger(root);
    try{
      for(const id of ['AUDIT-ROOT-DEFER','AUDIT-AFTER-DEFER']){
        ledger.create({id,title:'Independent root-only delivery '+id,
          track:'governance',allowedPaths:['docs/'+id+'.md'],
          requiredGates:[id==='AUDIT-ROOT-DEFER'?'python_pytest':'docs']},'agent');
        ledger.approve(id,'owner');
      }
      const first=ledger.claim('AUDIT-ROOT-DEFER','developer');
      fs.mkdirSync(path.join(root,'docs'));
      fs.writeFileSync(path.join(root,'docs/AUDIT-ROOT-DEFER.md'),'Actual root-only schema code');
      cmd(root,'add','docs/AUDIT-ROOT-DEFER.md');
      cmd(root,'commit','-qm','root-only submitted code');
      const submitted=cmd(root,'rev-parse','HEAD');
      const failedEvidence='Real isolated postgres unavailable; three external pytest assertions remain failing';
      ledger.report('AUDIT-ROOT-DEFER',first.leaseToken,
        {kind:'python_pytest',reference:failedEvidence},true);
      ledger.complete('AUDIT-ROOT-DEFER',first.leaseToken,{
        summary:'Committed exact root-only database migration and its four scoped tests',
        implementation:'Only approved root files changed; child repositories untouched',
        verification:'Pytest external Gate failed and must be rerun against real Postgres',
        remaining:'Three genuine failures require separately reviewed source changes',
      });
      const deferred=ledger.deferVerification({id:'AUDIT-ROOT-DEFER',
        leaseToken:first.leaseToken,gate:'python_pytest',preserveExistingWorktree:true,
        reason:'Isolated PostgreSQL unavailable and three out-of-scope assertions still fail; rerun the actual full suite',
      });
      expect(deferred).toMatchObject({leaseReleased:true,gatePassed:false,
        pendingVerification:true,originalHead:submitted});
      expect(ledger.get('AUDIT-ROOT-DEFER').status).toBe('in_review');
      expect(ledger.next().activeLease).toBeNull();
      expect(cmd(child,'rev-parse','HEAD')).toBe(childHead);
      expect(fs.readFileSync(path.join(child,'README.md'),'utf8')).toBe(tracked);
      expect(fs.readFileSync(path.join(child,'draft.txt'),'utf8')).toBe(untracked);
      const second=ledger.claim('AUDIT-AFTER-DEFER','next-developer');
      fs.writeFileSync(path.join(root,'docs/AUDIT-AFTER-DEFER.md'),'Legitimately separate task');
      cmd(root,'add','docs/AUDIT-AFTER-DEFER.md');
      cmd(root,'commit','-qm','new approved root-only task');
      const current=cmd(root,'rev-parse','HEAD');
      ledger.report('AUDIT-AFTER-DEFER',second.leaseToken,
        {kind:'unit_test',reference:'Actual unit tests for subsequent independent task passed'},true);
      ledger.complete('AUDIT-AFTER-DEFER',second.leaseToken,{
        summary:'Separate committed root task',implementation:'Only second task file committed',
        verification:'Actual tests run and results reviewed against new Git SHA',
      });
      ledger.reviewOwnTask('AUDIT-AFTER-DEFER',second.leaseToken,{
        outcome:'passed',evidenceReference:'Actual unit tests for subsequent independent task passed',
        findings:'Inspected second approved source commit, required test coverage and unchanged child repository WIP.',
      });
      ledger.reviewExternalGate('AUDIT-AFTER-DEFER',second.leaseToken,{
        gate:'docs',runner:'next-developer',reviewer:'next-developer',reviewMode:'self',
        outcome:'passed',evidenceReference:'Actual unit tests for subsequent independent task passed',
        reviewNotes:'Reviewed exact submitted source, real project test evidence, failure conditions and untouched child histories.',
      });
      expect(ledger.verify('AUDIT-AFTER-DEFER',second.leaseToken).passed).toBe(true);
      const resumed=ledger.resumeVerification('AUDIT-ROOT-DEFER','developer');
      expect(resumed).toMatchObject({resumedVerification:true,
        originalCompletionHead:submitted,baseHead:first.baseHead});
      expect(cmd(root,'rev-parse','HEAD')).toBe(current);
      const notAccepted=ledger.verify('AUDIT-ROOT-DEFER',resumed.leaseToken);
      expect(notAccepted.passed).toBe(false);
      expect(JSON.stringify(notAccepted)).not.toContain('Multi-repository verification deferral requires');
      expect(fs.readFileSync(path.join(child,'README.md'),'utf8')).toBe(tracked);
      expect(fs.readFileSync(path.join(child,'draft.txt'),'utf8')).toBe(untracked);
      expect(ledger.get('AUDIT-ROOT-DEFER').status).toBe('in_review');
    }finally{ledger.close();}
  });

  it('rejects modified, new or staged child WIP before root-only deferral and after resume',()=>{
    const {root,child}=fixture();
    const original='Frozen unrelated child WIP\n';
    fs.writeFileSync(path.join(child,'README.md'),original);
    const ledger=new ProjectTaskLedger(root);
    try{
      ledger.create({id:'AUDIT-DEFERRAL-TAMPER',title:'Deferral retains child identity',
        track:'governance',allowedPaths:['docs/approved.txt'],requiredGates:['python_pytest']},'agent');
      ledger.approve('AUDIT-DEFERRAL-TAMPER','owner');
      const first=ledger.claim('AUDIT-DEFERRAL-TAMPER','developer');
      fs.mkdirSync(path.join(root,'docs'));
      fs.writeFileSync(path.join(root,'docs/approved.txt'),'Exact delivered source\n');
      cmd(root,'add','docs/approved.txt');cmd(root,'commit','-qm','frozen root source');
      ledger.report('AUDIT-DEFERRAL-TAMPER',first.leaseToken,
        {kind:'python_pytest',reference:'Real external tests not available in local environment'},true);
      ledger.complete('AUDIT-DEFERRAL-TAMPER',first.leaseToken,{
        summary:'Original root source complete',implementation:'Exact allowed file committed',
        verification:'External PostgreSQL tests unavailable',
      });
      const defer=()=>ledger.deferVerification({id:'AUDIT-DEFERRAL-TAMPER',
        leaseToken:first.leaseToken,gate:'python_pytest',preserveExistingWorktree:true,
        reason:'External PostgreSQL unavailable, run actual tests after restoring the test service',
      });
      fs.writeFileSync(path.join(child,'README.md'),'Tampered child file\n');
      expect(defer).toThrow(/protected child|PROTECTED_CHILD_WORKTREE_CHANGED|differ/i);
      fs.writeFileSync(path.join(child,'README.md'),original);
      fs.writeFileSync(path.join(child,'new.txt'),'Unapproved new child WIP\n');
      expect(defer).toThrow(/protected child|PROTECTED_CHILD_WORKTREE_CHANGED|differ/i);
      fs.rmSync(path.join(child,'new.txt'));
      cmd(child,'add','README.md');
      expect(defer).toThrow(/staged|index/i);
      cmd(child,'reset','-q','--','README.md');
      expect(defer().leaseReleased).toBe(true);
      const resumed=ledger.resumeVerification('AUDIT-DEFERRAL-TAMPER','developer');
      fs.writeFileSync(path.join(child,'new.txt'),'Unexpected WIP after resume\n');
      expect(()=>ledger.deferVerification({id:'AUDIT-DEFERRAL-TAMPER',
        leaseToken:resumed.leaseToken,gate:'python_pytest',preserveExistingWorktree:true,
        reason:'External PostgreSQL is still down, and new child WIP must fail closed',
      })).toThrow(/protected child|PROTECTED_CHILD_WORKTREE_CHANGED|differ/i);
      fs.rmSync(path.join(child,'new.txt'));
      fs.writeFileSync(path.join(child,'unrelated-commit.txt'),'Another repository revision\n');
      cmd(child,'add','unrelated-commit.txt');
      cmd(child,'commit','-qm','unrelated child HEAD moved after freeze');
      expect(()=>ledger.deferVerification({id:'AUDIT-DEFERRAL-TAMPER',
        leaseToken:resumed.leaseToken,gate:'python_pytest',preserveExistingWorktree:true,
        reason:'Changed child commit identity cannot be silently rebased into the frozen deferral',
      })).toThrow(/multi-repository|multi-Git|version vector/i);
      expect(ledger.next().activeLease?.taskId).toBe('AUDIT-DEFERRAL-TAMPER');
    }finally{ledger.close();}
  });

  it('does not resume root-only deferral after an unreviewed child repository HEAD change',()=>{
    const {root,child}=fixture();
    const ledger=new ProjectTaskLedger(root);
    try{
      ledger.create({id:'AUDIT-HEAD-FREEZE',title:'Original child Git HEAD remains frozen',
        track:'governance',allowedPaths:['docs/frozen.txt'],requiredGates:['python_pytest']},'agent');
      ledger.approve('AUDIT-HEAD-FREEZE','owner');
      const claimed=ledger.claim('AUDIT-HEAD-FREEZE','developer');
      fs.mkdirSync(path.join(root,'docs'));
      fs.writeFileSync(path.join(root,'docs/frozen.txt'),'Committed root change');
      cmd(root,'add','docs/frozen.txt');cmd(root,'commit','-qm','approved root Git delivery');
      ledger.report('AUDIT-HEAD-FREEZE',claimed.leaseToken,
        {kind:'python_pytest',reference:'Fixture confirms external database is unavailable'},true);
      ledger.complete('AUDIT-HEAD-FREEZE',claimed.leaseToken,{
        summary:'Original root-only delivery committed',implementation:'Child HEAD unchanged',
        verification:'External PostgreSQL Gate remains unpassed',
      });
      ledger.deferVerification({id:'AUDIT-HEAD-FREEZE',leaseToken:claimed.leaseToken,
        gate:'python_pytest',preserveExistingWorktree:true,
        reason:'Postgres test runner unavailable; hold the actual external acceptance requirement',
      });
      fs.writeFileSync(path.join(child,'unrelated.txt'),'Unapproved newer child commit');
      cmd(child,'add','unrelated.txt');cmd(child,'commit','-qm','other child history advanced');
      expect(()=>ledger.resumeVerification('AUDIT-HEAD-FREEZE','developer'))
        .toThrow(/multi-repository|multi-Git|version vector/i);
      expect(ledger.next().activeLease).toBeNull();
      expect(ledger.get('AUDIT-HEAD-FREEZE').pendingVerification).not.toBeNull();
    }finally{ledger.close();}
  });

  it('refuses to treat a genuinely scoped child Git delivery as a root-only deferral',()=>{
    const {root,child}=fixture();
    const ledger=new ProjectTaskLedger(root);
    try{
      ledger.create({id:'AUDIT-CHILD-DEFER',title:'Actual multi-Git source delivery',
        track:'governance',allowedPaths:['apw-life/src/**'],requiredGates:['python_pytest']},'agent');
      ledger.approve('AUDIT-CHILD-DEFER','owner');
      const claim=ledger.claim('AUDIT-CHILD-DEFER','developer');
      fs.mkdirSync(path.join(child,'src'));
      fs.writeFileSync(path.join(child,'src','actual.ts'),'export const real = 1;\n');
      cmd(child,'add','src/actual.ts');cmd(child,'commit','-qm','actual nested delivery');
      ledger.report('AUDIT-CHILD-DEFER',claim.leaseToken,
        {kind:'python_pytest',reference:'Actual scoped child tests still fail'},true);
      ledger.complete('AUDIT-CHILD-DEFER',claim.leaseToken,{
        summary:'Genuine child source committed',implementation:'Approved nested Git delivery',
        verification:'External test failure remains unresolved',
      });
      expect(()=>ledger.deferVerification({id:'AUDIT-CHILD-DEFER',
        leaseToken:claim.leaseToken,gate:'python_pytest',preserveExistingWorktree:true,
        reason:'Multi-repository delivery requires immutable version-vector deferral review',
      })).toThrow(/multi-repository|multi-Git|version vector/i);
      expect(ledger.get('AUDIT-CHILD-DEFER').pendingVerification).toBeNull();
      expect(ledger.next().activeLease?.taskId).toBe('AUDIT-CHILD-DEFER');
    }finally{ledger.close();}
  });

  it('claims and verifies root-only delivery while preserving another Agent child WIP byte-for-byte',()=>{
    const {root,child}=fixture();
    const original='other Agent live work, never touched by the root-only task\n';
    fs.writeFileSync(path.join(child,'README.md'),original);
    const ledger=new ProjectTaskLedger(root);
    try{
      ledger.create({id:'AUDIT-UNRELATED-WIP',title:'Independent root-only DAP safety patch',
        track:'governance',allowedPaths:['docs/safe.md'],requiredGates:['docs']},'agent');
      ledger.approve('AUDIT-UNRELATED-WIP','owner');
      const lease=ledger.claim('AUDIT-UNRELATED-WIP','dap-developer');
      expect(fs.readFileSync(path.join(child,'README.md'),'utf8')).toBe(original);
      fs.mkdirSync(path.join(root,'docs'));
      fs.writeFileSync(path.join(root,'docs/safe.md'),'Genuine root-only change');
      cmd(root,'add','docs/safe.md');
      cmd(root,'commit','-qm','root-only scope delivery');
      const evidence='Real root-only test verified preserved child SHA and approved scoped source';
      ledger.report('AUDIT-UNRELATED-WIP',lease.leaseToken,
        {kind:'project_test',reference:evidence},true);
      ledger.complete('AUDIT-UNRELATED-WIP',lease.leaseToken,{
        summary:'Implemented approved root-only source',
        implementation:'Committed docs/safe.md without modifying other Agent files',
        verification:'Validated root-only file and child byte-identity',});
      ledger.reviewOwnTask('AUDIT-UNRELATED-WIP',lease.leaseToken,{
        outcome:'passed',evidenceReference:evidence,
        findings:'Checked root-only delivery commit, source tests, exact child SHA preservation and negative child modification cases.',
      });
      ledger.reviewExternalGate('AUDIT-UNRELATED-WIP',lease.leaseToken,{
        gate:'docs',runner:'dap-developer',reviewer:'dap-developer',reviewMode:'self',
        outcome:'passed',evidenceReference:evidence,
        reviewNotes:'Reviewed actual root task tests and unchanged child WIP at the immutable delivery commit.',
      });
      expect(ledger.verify('AUDIT-UNRELATED-WIP',lease.leaseToken))
        .toMatchObject({passed:true,files:['docs/safe.md']});
      expect(fs.readFileSync(path.join(child,'README.md'),'utf8')).toBe(original);
    }finally{ledger.close();}
  });

  it('rejects new child changes after a protected claim and staged child work at claim',()=>{
    const {root,child}=fixture();
    const original='unrelated existing uncommitted child work\n';
    fs.writeFileSync(path.join(child,'README.md'),original);
    const ledger=new ProjectTaskLedger(root);
    try{
      ledger.create({id:'AUDIT-CHILD-IMMUTABLE',title:'Preserve child SHA while editing root',
        track:'governance',allowedPaths:['docs/approved.md'],requiredGates:['docs']},'agent');
      ledger.approve('AUDIT-CHILD-IMMUTABLE','owner');
      const lease=ledger.claim('AUDIT-CHILD-IMMUTABLE','developer');
      fs.mkdirSync(path.join(root,'docs'));
      fs.writeFileSync(path.join(root,'docs/approved.md'),'legitimate approved root change');
      cmd(root,'add','docs/approved.md');cmd(root,'commit','-qm','approved root change');
      fs.writeFileSync(path.join(child,'README.md'),'changed by an unrelated Agent\n');
      expect(()=>ledger.complete('AUDIT-CHILD-IMMUTABLE',lease.leaseToken,{
        summary:'Root change',implementation:'Scoped code committed',
        verification:'Attempted validation with changed child WIP',
      })).toThrow(/PROTECTED_CHILD_WORKTREE_CHANGED|child files differ/i);
      fs.writeFileSync(path.join(child,'README.md'),original);
      fs.writeFileSync(path.join(child,'untracked.txt'),'new unapproved WIP');
      expect(()=>ledger.complete('AUDIT-CHILD-IMMUTABLE',lease.leaseToken,{
        summary:'Root change',implementation:'Scoped code committed',
        verification:'Attempted validation with new child untracked file',
      })).toThrow(/PROTECTED_CHILD_WORKTREE_CHANGED|child files differ/i);
    }finally{ledger.close();}
  });

  it('refuses staged unrelated child changes at task claim and ignores invalid uv cache git markers',()=>{
    const {root,child}=fixture();
    const cached=path.join(root,'.uv_cache','sdists-v9');
    fs.mkdirSync(cached,{recursive:true});
    fs.writeFileSync(path.join(cached,'.git'),'');
    expect(discoverRepositories(root,['docs/approved.md']).map(r=>r.prefix))
      .toEqual(['','apw-life','apw-life-app']);
    fs.writeFileSync(path.join(child,'README.md'),'unrelated staged work');
    cmd(child,'add','README.md');
    const ledger=new ProjectTaskLedger(root);
    try{
      ledger.create({id:'AUDIT-NO-STAGED-CHILD',title:'Staged child changes are not protected',
        track:'governance',allowedPaths:['docs/approved.md'],requiredGates:['docs']},'agent');
      ledger.approve('AUDIT-NO-STAGED-CHILD','owner');
      expect(()=>ledger.claim('AUDIT-NO-STAGED-CHILD','developer'))
        .toThrow(/staged content|STAGED_WORKTREE/i);
      expect(ledger.get('AUDIT-NO-STAGED-CHILD').status).toBe('ready');
    }finally{ledger.close();}
  });

  it('reviews exact root+child delivery after unrelated merge commits, without counting later files',()=>{
    const {root,child}=fixture();
    const ledger=new ProjectTaskLedger(root);
    try{
      ledger.create({id:'AUDIT-EXACT',title:'Freeze actual multi-repo delivery revisions',
        track:'governance',allowedPaths:['apw-life/src/**'],requiredGates:['docs']},'agent');
      ledger.approve('AUDIT-EXACT','owner');
      const lease=ledger.claim('AUDIT-EXACT','developer');
      const rootDelivery=cmd(root,'rev-parse','HEAD');
      fs.mkdirSync(path.join(child,'src'));
      fs.writeFileSync(path.join(child,'src','task.ts'),'export const task=1;');
      cmd(child,'add','src/task.ts');cmd(child,'commit','-qm','original approved delivery');
      const childDelivery=cmd(child,'rev-parse','HEAD');
      // A genuine non-fast-forward merge lands after the tested delivery.
      const main=cmd(root,'branch','--show-current');
      cmd(root,'checkout','-qb','unrelated-work');
      fs.writeFileSync(path.join(root,'README.md'),'another team changed README after delivery');
      cmd(root,'add','README.md');cmd(root,'commit','-qm','unrelated branch delivery');
      cmd(root,'checkout','-q',main);cmd(root,'merge','-q','--no-ff','unrelated-work','-m','merge unrelated work');
      fs.writeFileSync(path.join(child,'README.md'),'unrelated child follow-up');
      cmd(child,'add','README.md');cmd(child,'commit','-qm','unrelated child merge follow-up');
      const deliveryHeads={'':rootDelivery,'apw-life':childDelivery,
        'apw-life-app':cmd(path.join(root,'apw-life-app'),'rev-parse','HEAD')};
      const receipt='Actual project test results recorded against exact original delivery HEADs';
      ledger.report('AUDIT-EXACT',lease.leaseToken,{
        kind:'project_test',reference:receipt,deliveryHeads,
      },true);
      expect(()=>ledger.complete('AUDIT-EXACT',lease.leaseToken,{
        summary:'Should not use latest merges',implementation:'Task file was committed',
        verification:'Real test receipt uses frozen versions',
      })).toThrow(/scope/i);
      const completed=ledger.complete('AUDIT-EXACT',lease.leaseToken,{
        summary:'Original task file only',implementation:'One child Git source file',
        verification:'Test receipt bound exact Git versions',deliveryHeads,
      });
      expect(completed.gitHead).toBe(rootDelivery);
      ledger.reviewOwnTask('AUDIT-EXACT',lease.leaseToken,{
        outcome:'passed',evidenceReference:receipt,
        findings:'Reviewed original per-repository delivery commits, actual tests, approved scope and later unrelated merge without claiming its files.',
      });
      ledger.reviewExternalGate('AUDIT-EXACT',lease.leaseToken,{
        gate:'docs',runner:'developer',reviewer:'developer',reviewMode:'self',
        outcome:'passed',evidenceReference:receipt,
        reviewNotes:'Verified the actual task test receipt at frozen commits and excluded unrelated later root merge and child follow-up.',
      });
      expect(ledger.verify('AUDIT-EXACT',lease.leaseToken)).toMatchObject({
        passed:true,files:['apw-life/src/task.ts'],
      });
    }finally{ledger.close();}
  });

  it('cannot reuse reviewed delivery if a later merge touches the frozen scope',()=>{
    const {root,child}=fixture();
    const ledger=new ProjectTaskLedger(root);
    try{
      ledger.create({id:'AUDIT-LATER-SCOPE',title:'Reject later child changes in frozen scope',
        track:'governance',allowedPaths:['apw-life/src/**'],requiredGates:['docs']},'agent');
      ledger.approve('AUDIT-LATER-SCOPE','owner');
      const lease=ledger.claim('AUDIT-LATER-SCOPE','developer');
      fs.mkdirSync(path.join(child,'src'));
      fs.writeFileSync(path.join(child,'src','task.ts'),'export const task=1;');
      cmd(child,'add','src/task.ts');cmd(child,'commit','-qm','delivery');
      const receipt='Actual test evidence at original scoped child delivery';
      ledger.report('AUDIT-LATER-SCOPE',lease.leaseToken,{kind:'unit_test',reference:receipt},true);
      ledger.complete('AUDIT-LATER-SCOPE',lease.leaseToken,{
        summary:'Original child commit',implementation:'Scoped source committed',
        verification:'Actual project unit tests completed',
      });
      fs.writeFileSync(path.join(child,'src','task.ts'),'export const task=2;');
      cmd(child,'add','src/task.ts');cmd(child,'commit','-qm','unreviewed later scoped change');
      expect(()=>ledger.reviewOwnTask('AUDIT-LATER-SCOPE',lease.leaseToken,{
        outcome:'passed',evidenceReference:receipt,
        findings:'Attempted to reuse old receipt after a later source commit touched approved scope without test updates.',
      })).toThrow(/DELIVERY_HEAD_CHANGED|Later commit touched|evidence/i);
      expect(ledger.get('AUDIT-LATER-SCOPE').status).toBe('in_review');
    }finally{ledger.close();}
  });
});

describe('Owner-authorized migration of a pre-v5 expired active task',()=>{
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
    const request={
      actor:'owner',explicitAuthorization:true,reason,ttlSeconds:3600,
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
        actor:'owner',explicitAuthorization:true,reason:
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
        actor:'owner',explicitAuthorization:true,reason:
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
      expect(trace).not.toContain('ownerRecoveryKey');
    }finally{f.ledger.close();}
  });

  it('cannot mistake a Git assume-unchanged protected file for an actual HEAD restoration',()=>{
    const f=oldTask();
    try{
      fs.writeFileSync(path.join(f.child,'README.md'),'real protected data not at HEAD');
      f.ledger.recoverTaskLease('AUDIT-LEGACY',f.request);
      cmd(f.child,'update-index','--assume-unchanged','README.md');
      expect(()=>f.ledger.refreshProtectedWorktree('AUDIT-LEGACY',{
        actor:'owner',explicitAuthorization:true,
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
      const request={actor:'owner',explicitAuthorization:true,reason:
        'Owner reviewed tracked file restoration without allowing unrelated new files or untracked deletion'};
      expect(()=>f.ledger.refreshProtectedWorktree('AUDIT-LEGACY',{
        ...request,explicitAuthorization:false,
      })).toThrow(/explicit Owner decision/i);
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
      const request={actor:'owner',explicitAuthorization:true,reason:
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
        ...f.request,explicitAuthorization:false,
      })).toThrow(/explicit Owner decision/i);
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
      expect(JSON.stringify(f.ledger.trace('AUDIT-LEGACY'))).not.toContain('ownerRecoveryKey');
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
      const now=Date.now();
      vi.spyOn(Date,'now').mockReturnValue(now+61_000);
      const migrated=ledger.recoverTaskLease('AUDIT-REVIEW',{
        actor:'owner',explicitAuthorization:true,reason,
        preserveExistingWorktree:true,rebaselineLegacyRepositories:true,
      });
      expect(migrated.status).toBe('in_review');
      expect(ledger.verify('AUDIT-REVIEW',migrated.leaseToken).passed).toBe(false);
      expect(ledger.get('AUDIT-REVIEW').status).toBe('in_review');
    }finally{
      ledger.close();
    }
  });
});

describe('multi-repository file identity and source audit',()=>{
  it('refreshes a single root protected tracked file without accepting any new unrelated dirty file',()=>{
    const {root}=fixture(false);
    fs.writeFileSync(path.join(root,'README.md'),'local Owner notes predating the claim');
    const ledger=new ProjectTaskLedger(root);
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
        actor:'owner',explicitAuthorization:true,reason,
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
      expect(ledger.taskClosureStatus('AUDIT-SELF').nextAction).toBe('verify');
      expect(()=>ledger.reviewOwnTask('AUDIT-SELF',claimed.leaseToken,{
        outcome:'passed',evidenceReference:'unreported',findings:
          'Inspected actual unit results and exact child Git HEAD, scoped files, and negative cases.',
      })).toThrow(/evidence/i);
      const reviewed=ledger.reviewOwnTask('AUDIT-SELF',claimed.leaseToken,{
        outcome:'passed',evidenceReference:reference,findings:
          'Inspected both repository revisions, exact changed source and committed child file, project test evidence, negative paths and the frozen task acceptance criteria.',
      });
      expect(reviewed).toMatchObject({reviewMode:'developer_self_review',outcome:'passed'});
      expect(ledger.taskClosureStatus('AUDIT-SELF').nextAction).toBe('verify');
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
      })).toThrow(/committed revision|evidence|Later commit touched frozen task scope/i);
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
        passed:false,reason:expect.stringMatching(/Exact delivered Git versions no longer valid|child Git HEAD.*changed/i),
      });
      expect(ledger.get('AUDIT-102').status).not.toBe('verified');
    }finally{ledger.close();}
  });
});
