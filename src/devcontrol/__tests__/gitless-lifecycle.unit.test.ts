import {afterEach,describe,expect,it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {ProjectTaskLedger} from '../task-ledger.js';
import {discoverRepositories} from '../repository-audit.js';
import {workspaceHookStatus} from '../git-gate.js';
import {ensureMcpProbeKitBootstrap} from '../../lib/workflow-skill-installer.js';
import {MCP_PROBE_SKILL_REL_PATH} from '../../lib/workflow-skill-template.js';
import {SKILL_GUIDANCE_REVISION} from '../../lib/workflow-skill-version.js';
import type {ReleasePlanProposal,ReleasePlanNode} from '../release-plan.js';

const roots:string[]=[];
function rootless(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'mcp-no-git-lifecycle-'));
  roots.push(root);
  return root;
}
function prepare(root:string,id:string,scope=['src/**']){
  fs.mkdirSync(path.join(root,'docs','product'),{recursive:true});
  fs.mkdirSync(path.join(root,'docs','architecture'),{recursive:true});
  fs.writeFileSync(path.join(root,'docs','product','requirements.md'),
    '# Approved scope\nFR-001 implements the source file.\nNFR-002 requires evidence integrity.\n');
  fs.writeFileSync(path.join(root,'docs','architecture','overview.md'),
    '# Architecture\nThe workspace owns the canonical source and preserves test evidence.\n');
  const ledger=new ProjectTaskLedger(root);
  const approvedFile=scope[0]==='client/src/**'?'client/src/page.ts':'src/feature.ts';
  const leaf:ReleasePlanNode={
    id,title:'Implement approved source '+id,kind:'leaf',parentId:'GITLESS-PARENT',
    requirementIds:['FR-001','NFR-002'],estimatedHours:0.75,
    acceptance:'The approved source file contains a verifiable change and an actual test result.',
    designRef:'docs/architecture/overview.md#source',
    testCases:[
      'After implementing the feature, inspect the actual generated source content.',
      'After a second inspection, the source digest remains identical to the tested files.',
    ],
    negativeCases:[
      'Changes outside the frozen file scope must prevent recording an accepted delivery.',
      'A changed file after its test receipt must invalidate the submitted evidence.',
    ],
    scenario:'A developer implements an approved source feature and tests the resulting output.',
    workflow:[
      'Inspect the requirements and approved file scope before creating the source.',
      'Implement exactly the approved file and calculate the content hash.',
      'Run the real test and review it against the completed snapshot.',
    ],
    businessRules:[
      'The source test must be for the exact submitted file content.',
      'No unrelated source files may be changed during the task.',
    ],
    sourceRefs:[
      'docs/product/requirements.md#FR-001',
      'docs/architecture/overview.md#source',
    ],
    reviewNotes:['The source file location and acceptance cases are settled.'],
    verificationEvidence:[
      'A named real test receipt linked to the source revision.',
      'The precise source manifest and its independently checked digest.',
    ],
    inputs:['A reviewed feature requirement and an approved file path.'],
    outputs:['A real source file with content verified by the development agent.'],
    preconditions:['The approved architecture and source document are present.'],
    stateTransitions:['A Ready source task produces one completed source revision.'],
    forbiddenChanges:['Do not modify unrelated files outside the frozen scope.'],
    stopConditions:['Stop if requirements or source locations differ from approval.'],
    allowedChangedFiles:[approvedFile],
    outOfScope:['Do not introduce a Git repository or new task scopes.'],
    deliverables:[approvedFile],allowedPaths:scope,requiredGates:['docs'],
  };
  const plan:ReleasePlanProposal={
    release:'V0.1',scopeSource:'docs/product/requirements.md',
    requirementIds:['FR-001','NFR-002'],
    baseRevision:0,qualityProfile:'spec-depth-v3',
    rationale:'The release is limited to one concrete source file with actual test evidence; everything outside scope is deferred.',
    nodes:[{id:'GITLESS-PARENT',title:'Approved source feature',kind:'group'},leaf],
  };
  const proposal=ledger.proposeReleasePlan(plan,'agent');
  ledger.approveReleasePlan('V0.1','owner',String(proposal.hash));
  return ledger;
}
const acceptance=(reference:string)=>({
  evidenceReference:reference,
  findings:'Examined the specific edited source files and the actual test report; each change fits the approved work item and no unrelated source was modified.',
  gates:[{gate:'docs',evidenceReference:reference,
    findings:'Reviewed the real documentation test receipt against the exact SHA256 file manifest.'}],
});
afterEach(()=>{for(const root of roots.splice(0))
  fs.rmSync(root,{recursive:true,force:true});});

describe('DevControl project without any Git repository',()=>{
  it('completes an approved task through claim, source diff, real report and atomic verify with no Git',()=>{
    const root=rootless(),ledger=prepare(root,'GITLESS-1');
    try{
      const claim=ledger.claim('GITLESS-1','developer');
      expect(claim.evidenceKind).toBe('files-sha256-v1');
      fs.mkdirSync(path.join(root,'src'));
      fs.writeFileSync(path.join(root,'src','feature.ts'),'export const feature = true;\n');
      const result=ledger.complete('GITLESS-1',claim.leaseToken,{
        summary:'Complete approved feature',implementation:'Added feature source file',
        verification:'Executed and reviewed actual documentation test',
      });
      expect(result.files).toEqual(['src/feature.ts']);
      expect(result.evidenceKind).toBe('files-sha256-v1');
      expect(()=>ledger.verify('GITLESS-1',claim.leaseToken))
        .toThrow(/Report real test evidence/);
    }finally{ledger.close();}
  });
  it('accepts only byte-identical MCP-generated Skill and AGENTS upgrades after a Gitless claim',()=>{
    const root=rootless();
    fs.writeFileSync(path.join(root,'AGENTS.md'),
      '# User security rules\nDo not modify production credentials.\n');
    ensureMcpProbeKitBootstrap(root);
    const tracked=['AGENTS.md',MCP_PROBE_SKILL_REL_PATH];
    for(const file of tracked){
      const full=path.join(root,file);
      fs.writeFileSync(full,fs.readFileSync(full,'utf8')
        .replaceAll(SKILL_GUIDANCE_REVISION,
          'v5-sqlite-devcontrol-20261102-owned-guidance-r19'));
    }
    const ledger=prepare(root,'GITLESS-8');
    try{
      const token=ledger.claim('GITLESS-8','developer').leaseToken;
      const refreshed=ensureMcpProbeKitBootstrap(root);
      expect(refreshed.agentsMd.updated).toBe(true);
      expect(refreshed.skill.updated).toBe(true);
      expect(ledger.checkStaged()).toMatchObject({
        passed:false,reason:'No source changes since claim',
      });
      fs.mkdirSync(path.join(root,'src'));
      fs.writeFileSync(path.join(root,'src','feature.ts'),'export const code = 8;');
      expect(ledger.checkStaged()).toMatchObject({
        passed:true,changedFiles:['src/feature.ts'],deniedFiles:[],
      });
      expect(ledger.complete('GITLESS-8',token,{
        summary:'Actual accepted implementation',implementation:'One approved file',
        verification:'Local source test completed',
      }).files).toEqual(['src/feature.ts']);
      const reference='The actual approved source passed its project-owned test';
      ledger.report('GITLESS-8',token,{kind:'docs',reference},true);
      const original=fs.readFileSync(path.join(root,'AGENTS.md'),'utf8');
      fs.writeFileSync(path.join(root,'AGENTS.md'),
        original+'\n# Unauthorized change to user instructions\n');
      expect(ledger.verify('GITLESS-8',token,acceptance(reference))).toMatchObject({
        passed:false,reason:'FILE_SOURCE_CHANGED',
      });
      fs.writeFileSync(path.join(root,'AGENTS.md'),original);
      expect(ledger.verify('GITLESS-8',token,acceptance(reference))).toMatchObject({
        passed:true,files:['src/feature.ts'],
      });
    }finally{ledger.close();}
  });
  it('releases an untouched Git-free claim and refuses to release a changed source',()=>{
    const root=rootless(),ledger=prepare(root,'GITLESS-5');
    try{
      const untouched=ledger.claim('GITLESS-5','developer').leaseToken;
      expect(ledger.release('GITLESS-5',untouched)).toMatchObject({
        released:true,status:'ready',
      });
      const next=ledger.claim('GITLESS-5','developer').leaseToken;
      fs.mkdirSync(path.join(root,'src'));
      fs.writeFileSync(path.join(root,'src','feature.ts'),'a real change');
      expect(()=>ledger.release('GITLESS-5',next)).toThrow(/UNFINISHED_WORK|Do not release/);
    }finally{ledger.close();}
  });
  it('recovers an expired Git-free lease without resetting its original source baseline',()=>{
    const root=rootless(),ledger=prepare(root,'GITLESS-6');
    try{
      ledger.claim('GITLESS-6','original-developer');
      fs.mkdirSync(path.join(root,'src'));
      fs.writeFileSync(path.join(root,'src','feature.ts'),'approved progress');
      const db=(ledger as any).db;
      db.exec('UPDATE dc_leases SET expires_at=1');
      db.exec('UPDATE dc_task_leases SET expires_at=1');
      const recovered=ledger.recoverTaskLease('GITLESS-6',{
        actor:'responsible-developer',
        reason:'The previous process crashed; the original approved file baseline and task scope were inspected before restoring the lease.',
      });
      expect(recovered).toMatchObject({
        status:'in_progress',evidenceKind:'files-sha256-v1',
        testsPassedByRecovery:false,
      });
      expect(ledger.complete('GITLESS-6',recovered.leaseToken,{
        summary:'Recovered approved work',implementation:'Kept exact file',
        verification:'Test results need review',
      })).toMatchObject({files:['src/feature.ts']});
    }finally{ledger.close();}
  });
  it('defers and resumes an external Gate without fabricating Git or passing the Gate',()=>{
    const root=rootless(),ledger=prepare(root,'GITLESS-7');
    try{
      const token=ledger.claim('GITLESS-7','developer').leaseToken;
      fs.mkdirSync(path.join(root,'src'));
      fs.writeFileSync(path.join(root,'src','feature.ts'),'approved output');
      ledger.complete('GITLESS-7',token,{
        summary:'Finished implementation',implementation:'Delivered feature.ts',
        verification:'Recorded local receipt; the external verifier is unavailable',
      });
      ledger.report('GITLESS-7',token,{
        kind:'docs',reference:'Local test passed; the final external test is deferred',
      },true);
      expect(ledger.deferVerification({
        id:'GITLESS-7',leaseToken:token,gate:'docs',
        reason:'The independent external test runner is currently unavailable and must be rerun before final acceptance.',
      })).toMatchObject({pendingVerification:true,gatePassed:false});
      expect(ledger.taskClosureStatus('GITLESS-7').nextAction)
        .toBe('resume-verification');
      const resumed=ledger.resumeVerification('GITLESS-7','developer');
      expect(resumed).toMatchObject({
        resumedVerification:true,evidenceKind:'files-sha256-v1',
      });
      const evidence='Final real external runner receipt for unchanged source SHA256';
      ledger.report('GITLESS-7',resumed.leaseToken,{
        kind:'docs',reference:evidence,
      },true);
      expect(ledger.verify('GITLESS-7',resumed.leaseToken,acceptance(evidence)))
        .toMatchObject({passed:true,evidenceKind:'files-sha256-v1'});
    }finally{ledger.close();}
  });

  it('reaches Verified without a Git commit but only with matching file evidence and substantive Gate review',()=>{
    const root=rootless(),ledger=prepare(root,'GITLESS-2');
    const originalPath=process.env.PATH;
    try{
      // Git might not even be installed. Do not merely check for absent .git.
      process.env.PATH=path.join(root,'intentionally-no-executables');
      const token=ledger.claim('GITLESS-2','developer').leaseToken;
      expect(ledger.checkStaged()).toMatchObject({
        passed:false,evidenceKind:'files-sha256-v1',gitIndex:'not_applicable',
      });
      fs.mkdirSync(path.join(root,'src'));
      fs.writeFileSync(path.join(root,'src','feature.ts'),'export const feature = 42;\n');
      expect(ledger.checkStaged()).toMatchObject({
        passed:true,changedFiles:['src/feature.ts'],gitIndex:'not_applicable',
      });
      ledger.complete('GITLESS-2',token,{
        summary:'Implemented the approved source',implementation:'Added feature.ts',
        verification:'Confirmed the real test results',
      });
      const reference='Real documentation test run passed on the exact source content';
      ledger.report('GITLESS-2',token,{kind:'docs',reference},true);
      expect(ledger.verify('GITLESS-2',token)).toMatchObject({
        passed:false,reason:'TASK_ACCEPTANCE_REQUIRED',
      });
      expect(ledger.verify('GITLESS-2',token,acceptance('not-reported'))).toMatchObject({
        passed:false,reason:'TASK_ACCEPTANCE_EVIDENCE_MISSING',
      });
      expect(ledger.verify('GITLESS-2',token,acceptance(reference))).toMatchObject({
        passed:true,evidenceKind:'files-sha256-v1',files:['src/feature.ts'],
      });
      expect(ledger.get('GITLESS-2').status).toBe('verified');
      expect(fs.existsSync(path.join(root,'.git'))).toBe(false);
      expect(discoverRepositories(root,[])).toEqual([]);
      expect(workspaceHookStatus(root)).toMatchObject({
        state:'not-applicable',repositories:{},
      });
    }finally{process.env.PATH=originalPath;ledger.close();}
  });

  it('still requires exact Owner-approved source hash in a Git-free release',()=>{
    const root=rootless();
    fs.mkdirSync(path.join(root,'docs','product'),{recursive:true});
    fs.writeFileSync(path.join(root,'docs','product','requirements.md'),
      'FR-001 approved source requirement');
    const ledger=new ProjectTaskLedger(root);
    try{
      expect(ledger.list()).toEqual([]);
      expect(fs.existsSync(path.join(root,'.git'))).toBe(false);
    }finally{ledger.close();}
  });

  it('rejects out-of-scope changes and file mutation after evidence was submitted',()=>{
    const root=rootless(),ledger=prepare(root,'GITLESS-3');
    try{
      const token=ledger.claim('GITLESS-3','developer').leaseToken;
      fs.mkdirSync(path.join(root,'src'));
      fs.writeFileSync(path.join(root,'src','feature.ts'),'export const feature=1');
      fs.writeFileSync(path.join(root,'outside.ts'),'const ownerCode=1');
      expect(ledger.checkStaged()).toMatchObject({
        passed:false,deniedFiles:['outside.ts'],
      });
      expect(()=>ledger.complete('GITLESS-3',token,{
        summary:'Attempted delivery',implementation:'Changed feature',
        verification:'Run test',
      })).toThrow(/outside approved scope/);
      fs.unlinkSync(path.join(root,'outside.ts'));
      ledger.complete('GITLESS-3',token,{
        summary:'Approved delivery',implementation:'Changed approved feature',
        verification:'Run test',
      });
      const reference='Actual file gate evidence bound to this exact source';
      ledger.report('GITLESS-3',token,{kind:'docs',reference},true);
      fs.writeFileSync(path.join(root,'src','feature.ts'),'export const feature=2');
      expect(ledger.verify('GITLESS-3',token,acceptance(reference))).toMatchObject({
        passed:false,reason:'FILE_SOURCE_CHANGED',
      });
      expect(ledger.get('GITLESS-3').status).toBe('in_review');
    }finally{ledger.close();}
  });

  it('uses a non-Git parent with independent child Git folders without creating a parent Git',()=>{
    const root=rootless();
    fs.mkdirSync(path.join(root,'client'));
    fs.mkdirSync(path.join(root,'server'));
    for(const child of ['client','server'])
      execFileSync('git',['init','-q',path.join(root,child)],{timeout:3000});
    const ledger=prepare(root,'GITLESS-4',['client/src/**']);
    try{
      const token=ledger.claim('GITLESS-4','developer').leaseToken;
      fs.mkdirSync(path.join(root,'client','src'));
      fs.writeFileSync(path.join(root,'client','src','page.ts'),'export const page=true');
      const result=ledger.complete('GITLESS-4',token,{
        summary:'New UI page',implementation:'Added page.ts',verification:'Tested output',
      });
      expect(result.files).toEqual(['client/src/page.ts']);
      expect(fs.existsSync(path.join(root,'.git'))).toBe(false);
      expect(fs.existsSync(path.join(root,'client','.git'))).toBe(true);
      expect(discoverRepositories(root,[]).map(repo=>repo.prefix))
        .toEqual(['client','server']);
      expect(workspaceHookStatus(root)).toMatchObject({
        state:'not-applicable',repositories:{
          client:expect.any(Object),server:expect.any(Object),
        },
      });
    }finally{ledger.close();}
  });
});
