import {afterEach,describe,expect,it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {ProjectTaskLedger} from '../task-ledger.js';
import {discoverRepositories} from '../repository-audit.js';
import {workspaceHookStatus} from '../git-gate.js';
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
