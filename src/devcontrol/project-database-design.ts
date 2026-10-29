/** Discover versioned architecture documents and migration source code.
 * Mutable design reviews and approvals belong to DevControl SQLite, not
 * .neyna/state/postgresql-design markdown or unapproved local SQL drafts.
 * This module never opens the business PostgreSQL database or executes SQL.
 */
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {safeProjectDocument} from './project-catalog.js';

const MAX_SCHEMA_BYTES=512_000;
const migrationRoots=['migrations','db/migrations','database/migrations',
  'services/core/migrations','services/core/internal/storage/migrations'];
const canonicalDocs=['docs/architecture/database.md','docs/architecture/database-design.md',
  'docs/architecture/data-contracts.md','docs/architecture/schema.md'];

function safeRegular(root:string,relative:string):string|null{
  const resolvedRoot=path.resolve(root),full=path.resolve(resolvedRoot,relative);
  const lexical=path.relative(resolvedRoot,full);
  if(!lexical||lexical==='..'||lexical.startsWith('..'+path.sep)||
    path.isAbsolute(lexical))return null;
  try{
    if(!fs.existsSync(full)||fs.lstatSync(full).isSymbolicLink()||
      !fs.statSync(full).isFile()||fs.statSync(full).size>MAX_SCHEMA_BYTES)return null;
    const base=fs.realpathSync(resolvedRoot),real=fs.realpathSync(full);
    return real.startsWith(base+path.sep)?real:null;
  }catch{return null;}
}

function schemaTables(text:string):string[]{
  const names=[...text.matchAll(/\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?([a-z_][a-z0-9_]*)"?\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/gi)]
    .map(match=>[match[1],match[2]].filter(Boolean).join('.'));
  return [...new Set(names)].slice(0,120);
}

export function projectDatabaseDesign(root:string){
  const documents=canonicalDocs.filter(file=>{
    try{safeProjectDocument(root,file);return true;}catch{return false;}
  });
  const migrations:{path:string;tables:string[];classification:string}[]=[];
  // Only Git-tracked files may be described as versioned migration sources.
  // Untracked working drafts are deliberately excluded from LAN-visible APIs.
  let gitTracked=new Set<string>();
  try{
    gitTracked=new Set(execFileSync('git',['ls-files','--',...migrationRoots],{
      cwd:root,encoding:'utf8',windowsHide:true,timeout:2500,
      maxBuffer:128_000,stdio:['ignore','pipe','ignore'],
    }).split(/\r?\n/).filter(Boolean));
  }catch{/* Repository or Git unavailable: do not promote files to source. */}
  for(const directory of migrationRoots){
    const absolute=path.resolve(root,directory);
    if(!fs.existsSync(absolute)||fs.lstatSync(absolute).isSymbolicLink()||
      !fs.statSync(absolute).isDirectory())continue;
    for(const entry of fs.readdirSync(absolute,{withFileTypes:true}).slice(0,80)){
      if(!entry.isFile()||!/^[-\w.]+\.sql$/i.test(entry.name))continue;
      const relative=directory+'/'+entry.name;
      if(!gitTracked.has(relative))continue;
      const file=safeRegular(root,relative);
      if(file)migrations.push({path:relative,tables:schemaTables(fs.readFileSync(file,'utf8')),
        classification:'source-migration-not-deployment-proof'});
    }
  }
  const implementation=['services/core/internal/storage/postgres_migrations.go',
    'services/core/internal/storage/postgres_sql_statements.go',
    'services/core/internal/storage/schema_guard.go'].filter(file=>!!safeRegular(root,file));
  return {documents,migrations,implementation,
    disclaimer:'Only approved Git architecture and migration sources are discoverable here. Mutable design reviews come from DevControl SQLite. Source files do not prove deployment',
    reviewAuthority:'devcontrol-sqlite',
    deployedSchemaVerified:false};
}
