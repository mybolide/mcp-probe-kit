import {afterEach,describe,expect,it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {captureFileEvidence,compareFileEvidence} from '../file-evidence.js';

const roots:string[]=[];
function workspace():string{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'devcontrol-gitless-'));
  roots.push(root);
  return root;
}
afterEach(()=>{for(const root of roots.splice(0))
  fs.rmSync(root,{recursive:true,force:true});});

describe('Git-independent source evidence',()=>{
  it('captures a non-Git workspace without creating a .git directory',()=>{
    const root=workspace();
    fs.mkdirSync(path.join(root,'client'));
    fs.mkdirSync(path.join(root,'server'));
    fs.writeFileSync(path.join(root,'client','main.ts'),'const a=1;');
    const first=captureFileEvidence(root);
    expect(first.kind).toBe('files-sha256-v1');
    expect(first.entries.map(item=>item.path)).toEqual(['client/main.ts']);
    expect(captureFileEvidence(root)).toEqual(first);
    expect(fs.existsSync(path.join(root,'.git'))).toBe(false);
    fs.writeFileSync(path.join(root,'client','main.ts'),'const a=2;');
    fs.writeFileSync(path.join(root,'server','index.ts'),'export {}');
    const second=captureFileEvidence(root);
    expect(compareFileEvidence(first,second)).toEqual({
      added:['server/index.ts'],modified:['client/main.ts'],
      deleted:[],changed:['client/main.ts','server/index.ts'],
    });
    fs.unlinkSync(path.join(root,'client','main.ts'));
    expect(compareFileEvidence(second,captureFileEvidence(root)).deleted)
      .toEqual(['client/main.ts']);
  });

  it('never treats runtime SQLite or nested Git metadata as source evidence',()=>{
    const root=workspace();
    fs.mkdirSync(path.join(root,'.mcp-probe-kit','state'),{recursive:true});
    fs.writeFileSync(path.join(root,'.mcp-probe-kit','state','devcontrol.sqlite3'),'secret');
    fs.mkdirSync(path.join(root,'client','.git'),{recursive:true});
    fs.writeFileSync(path.join(root,'client','.git','config'),'metadata');
    fs.writeFileSync(path.join(root,'client','app.ts'),'const app=true');
    expect(captureFileEvidence(root).entries.map(entry=>entry.path))
      .toEqual(['client/app.ts']);
  });

  it('rejects links and non-regular source files, rather than following outside the workspace',()=>{
    const root=workspace();
    const outside=workspace();
    fs.writeFileSync(path.join(outside,'private.txt'),'never read');
    fs.symlinkSync(path.join(outside,'private.txt'),path.join(root,'external.txt'));
    expect(()=>captureFileEvidence(root)).toThrow(/symlink/i);
  });

  it('rejects oversized file evidence rather than silently omitting changed bytes',()=>{
    const root=workspace();
    fs.writeFileSync(path.join(root,'too-large.dat'),Buffer.alloc(32*1024*1024+1));
    expect(()=>captureFileEvidence(root)).toThrow(/Unsafe file-evidence/);
  });
});
