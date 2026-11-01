import { afterEach, describe, expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDevControlBoardServer } from '../board-server.js';
import { ProjectTaskLedger } from '../task-ledger.js';
import { VERSION } from '../../version.js';

const tempRoots:string[]=[];
afterEach(()=>{for(const p of tempRoots.splice(0))rmSync(p,{recursive:true,force:true});});

describe('DevControl v5 browser guide and settings API',()=>{
  test('human task API exposes the exact read-only MCP execution contract and real frozen provenance',async()=>{
    const root=mkdtempSync(join(tmpdir(),'dc-task-views-'));
    tempRoots.push(root);
    execFileSync('git',['init','-q',root],{timeout:3000});
    execFileSync('git',['-C',root,'config','user.name','Task View Fixture']);
    execFileSync('git',['-C',root,'config','user.email','fixture@example.invalid']);
    writeFileSync(join(root,'README.md'),'fixture');
    execFileSync('git',['-C',root,'add','README.md']);
    execFileSync('git',['-C',root,'commit','-qm','initial']);
    const ledger=new ProjectTaskLedger(root);
    const taskId='UX-CONTRACT';
    ledger.create({id:taskId,title:'Readable frozen execution contract',
      track:'governance',allowedPaths:['src/work.ts'],requiredGates:['docs']},'agent');
    ledger.approve(taskId,'owner');
    const server=createDevControlBoardServer(ledger,{lanEnabled:false});
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    try{
      const address=server.address();
      if(!address||typeof address==='string')throw Error('Missing server port');
      const base='http://127.0.0.1:'+address.port;
      const response=await fetch(base+'/api/tasks/'+taskId);
      expect(response.status).toBe(200);
      const data=await response.json() as Record<string,any>;
      expect(data.executionContract).toEqual(ledger.executionContract(taskId));
      expect(data.contract).toEqual(ledger.frozenTaskContract(taskId));
      expect(data.contract.authoritative).toBe(false);
      expect(data.executionContract.allowedPaths).toEqual(['src/work.ts']);
      expect(data.readability).toMatchObject({
        policy:'read-only-advisory',status:'source_missing',authoritative:false,
      });
      const scan=await fetch(base+'/api/task-readability');
      expect(scan.status).toBe(200);
      const inventory=await scan.json() as Record<string,any>;
      expect(inventory).toMatchObject({
        policy:'read-only-advisory',total:1,
        counts:{complete:0,needs_explanation:0,needs_contract_review:0,source_missing:1},
        records:[{id:taskId,readability:'source_missing'}],
      });
      expect(ledger.get(taskId).status).toBe('ready');
      const plannedReview=await fetch(base+'/api/task-spec-review');
      expect(plannedReview.status).toBe(200);
      const review=await plannedReview.json() as Record<string,any>;
      expect(review).toMatchObject({
        policy:'review-draft-no-mutation',totalCandidates:0,batchSize:0,items:[],
      });
      const packetResponse=await fetch(base+'/api/task-spec-review-packet?format=json');
      expect(packetResponse.status).toBe(200);
      expect(packetResponse.headers.get('content-type')).toContain('application/json');
      expect(packetResponse.headers.get('cache-control')).toBe('no-store');
      const packet=await packetResponse.json() as Record<string,any>;
      expect(packet).toMatchObject({
        policy:'read-only-not-owner-approved',count:0,items:[],
      });
      expect(packet.packetHash).toMatch(/^[0-9a-f]{64}$/);
      const markdownResponse=await fetch(
        base+'/api/task-spec-review-packet?format=markdown');
      expect(markdownResponse.status).toBe(200);
      expect(markdownResponse.headers.get('content-disposition')).toContain('attachment');
      expect(await markdownResponse.text()).toContain('未获得 Owner 批准');
      expect((await fetch(base+'/api/task-spec-review-packet?format=csv')).status).toBe(400);
      expect((await fetch(base+'/api/task-spec-review-packet',{method:'POST'})).status).toBe(405);
      expect(ledger.get(taskId).status).toBe('ready');
      expect(JSON.stringify(data)).not.toContain('leaseToken');
      expect((await fetch(base+'/api/tasks/'+taskId,{method:'POST'})).status).toBe(405);
      expect((await fetch(base+'/api/task-readability',{method:'POST'})).status).toBe(405);
      expect((await fetch(base+'/api/task-spec-review',{method:'POST'})).status).toBe(405);
      expect((await fetch(base+'/api/tasks/../../settings')).status).not.toBe(200);
    }finally{
      await new Promise<void>(resolve=>server.close(()=>resolve()));
      ledger.close();
    }
  });
  test('GET guide is read-only, phase-specific and never needs a project selector',async()=>{
    const root=mkdtempSync(join(tmpdir(),'dc-workbench-guide-'));
    tempRoots.push(root);
    execFileSync('git',['init','-q',root],{timeout:3000,windowsHide:true});
    const server=createDevControlBoardServer(root,{lanEnabled:false});
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    try{
      const address=server.address();
      expect(address).not.toBeNull();
      if(typeof address!=='object'||address===null)throw Error('Invalid server address');
      const base='http://127.0.0.1:'+address.port;
      const listing=await fetch(base+'/api/guide');
      expect(listing.status).toBe(200);
      expect(listing.headers.get('content-security-policy')).toContain("default-src 'none'");
      const guide=await listing.json() as {hasSideEffects:boolean;intents:Array<{intent:string}>};
      expect(guide.hasSideEffects).toBe(false);
      expect(guide.intents.map(row=>row.intent)).toEqual([
        'start','feature','planning','task','verification','bug','idea','scope','architecture',
      ]);
      const selected=await fetch(base+'/api/guide?intent=feature');
      expect((await selected.json()) as object).toMatchObject({
        hasSideEffects:false,selectedIntent:'feature',
        flow:{example:{action:'feature-create'}},
      });
      const page=await fetch(base+'/#tasks');
      expect(page.status).toBe(200);
      const html=await page.text();
      expect(html).toContain('data-view="settings"');
      expect(html).toContain('data-view="guide"');
      expect(html).toContain('content="light"');
      const meta=await (await fetch(base+'/api/meta')).json() as {
        schema:string;version:string;product:string;workspaceSchemaVersion:string
      };
      expect(meta.schema).toBe('devcontrol-project-workspace');
      expect(meta.product).toBe('mcp-probe-kit');
      expect(meta.version).toBe(VERSION);
      expect(meta.workspaceSchemaVersion).toBe('0.11.0');
      const access=await (await fetch(base+'/api/access')).json() as {lanEnabled:boolean};
      expect(access.lanEnabled).toBe(false);
      const invalidWrite=await fetch(base+'/api/guide',{method:'POST'});
      expect(invalidWrite.status).toBe(405);
      const settings=await fetch(base+'/api/settings');
      expect(settings.status).toBe(200);
      const current=await settings.json() as {
        csrfToken:string;ai:Record<string,{value:string}>;
        secrets:Record<string,{configured:boolean}>;
      };
      expect(current.csrfToken.length).toBeGreaterThan(40);
      expect(current.ai.MEMORY_SEARCH_LIMIT.value).toBe('3');
      expect(current.secrets.MEMORY_QDRANT_API_KEY.configured).toBe(false);
      const body=JSON.stringify({
        ai:{MEMORY_SEARCH_LIMIT:'5',MEMORY_SUMMARY_MAX_CHARS:'512'},
        flags:{MCP_ENABLE_UI_APPS:false},
      });
      const rejected=await fetch(base+'/api/settings',{
        method:'POST',headers:{'Content-Type':'application/json',
          Origin:base,'X-MCP-Settings-Token':'wrong'},body,
      });
      expect(rejected.status).toBe(403);
      const crossSite=await fetch(base+'/api/settings',{
        method:'POST',headers:{'Content-Type':'application/json',
          Origin:'https://other.example','X-MCP-Settings-Token':current.csrfToken},body,
      });
      expect(crossSite.status).toBe(403);
      const saved=await fetch(base+'/api/settings',{
        method:'POST',headers:{'Content-Type':'application/json',
          Origin:base,'X-MCP-Settings-Token':current.csrfToken},body,
      });
      expect(saved.status).toBe(200);
      expect(await saved.json()).toMatchObject({
        ai:{MEMORY_SEARCH_LIMIT:{value:'5',source:'project'},
          MEMORY_SUMMARY_MAX_CHARS:{value:'512',source:'project'}},
        flags:{MCP_ENABLE_UI_APPS:{effective:false}},
      });
      const dangerous=await fetch(base+'/api/settings',{
        method:'POST',headers:{'Content-Type':'application/json',
          Origin:base,'X-MCP-Settings-Token':current.csrfToken},
        body:JSON.stringify({ai:{PATH:'/tmp/injected'}}),
      });
      expect(dangerous.status).toBe(400);
      expect((await fetch(base+'/api/settings')).status).toBe(200);
    }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
  });
});
