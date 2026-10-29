import {afterEach,describe,expect,it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {projectDatabaseDesign} from '../project-database-design.js';

const roots:string[]=[];
function fixture():string{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'mcp-architecture-review-'));
  roots.push(root);return root;
}
function write(root:string,name:string,content:string):void{
  const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,content);
}
afterEach(()=>{for(const root of roots.splice(0))fs.rmSync(root,{recursive:true,force:true});});

describe('database architecture sources and project isolation',()=>{
  it('reads canonical Git docs and migration identifiers but never local unapproved review drafts',()=>{
    const root=fixture();
    write(root,'docs/architecture/data-contracts.md','# Data contracts\n\nVetted source');
    write(root,'migrations/0001_schema.sql',
      'CREATE TABLE public.events(id uuid); CREATE TABLE public.owners(id uuid);');
    write(root,'.neyna/state/postgresql-design/0001_project.v4.review.sql',
      "CREATE TABLE leaked_table(secret text); INSERT INTO secrets VALUES('must-not-leak');");
    write(root,'services/core/internal/storage/postgres_migrations.go','package storage');
    execFileSync('git',['init','-q',root],{timeout:2500});
    execFileSync('git',['add','migrations/0001_schema.sql'],{cwd:root,timeout:2500});
    const result=projectDatabaseDesign(root);
    expect(result.documents).toEqual(['docs/architecture/data-contracts.md']);
    expect(result.migrations[0]).toMatchObject({path:'migrations/0001_schema.sql',
      tables:['public.events','public.owners']});
    expect(result.implementation).toContain('services/core/internal/storage/postgres_migrations.go');
    expect(result.reviewAuthority).toBe('devcontrol-sqlite');
    expect(result.deployedSchemaVerified).toBe(false);
    expect(JSON.stringify(result)).not.toContain('leaked_table');
    expect(JSON.stringify(result)).not.toContain('must-not-leak');
    expect(JSON.stringify(result)).not.toContain('postgresql-design');
  });
  it('does not follow symlinked migration paths and handles empty projects',()=>{
    const root=fixture(),external=fixture();
    write(external,'private.sql','CREATE TABLE leaked_table(secret text);');
    fs.mkdirSync(path.join(root,'migrations'),{recursive:true});
    if(process.platform!=='win32')fs.symlinkSync(path.join(external,'private.sql'),
      path.join(root,'migrations','external.sql'));
    const result=projectDatabaseDesign(root);
    expect(result.migrations).toEqual([]);
    expect(result.documents).toEqual([]);
  });
});
