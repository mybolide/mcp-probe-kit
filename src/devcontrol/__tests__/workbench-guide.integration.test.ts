import { afterEach, describe, expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDevControlBoardServer } from '../board-server.js';
import { VERSION } from '../../version.js';

const tempRoots:string[]=[];
afterEach(()=>{for(const p of tempRoots.splice(0))rmSync(p,{recursive:true,force:true});});

describe('DevControl v5 browser guide and settings API',()=>{
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
