/**
 * AI-assisted, non-destructive DevControl SQLite merge.
 *
 * This is NOT a byte-level SQLite merge and never considers evidence to be
 * passed merely because a row was imported. It creates a separate candidate
 * only when all project data is conflict-free and relationally consistent.
 * Humans/AI inspect conflict reports; no silent last-writer-wins.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';

type Cell=string|number|bigint|Uint8Array|null;
type RecordRow=Record<string,Cell>;
interface Statement{all(...args:Cell[]):RecordRow[];run(...args:Cell[]):unknown}
interface Database{
  exec(sql:string):void;
  prepare(sql:string):Statement;
  close():void;
}
type Column={name:string;type:string;notnull:number;dflt_value:string|null;pk:number};
type ForeignKey={table:string;from:string;to:string};
type TableShape={columns:Column[];keys:string[];foreignKeys:ForeignKey[]};
type Conflict={table:string;key:string;source:Record<string,unknown>;
  target:Record<string,unknown>};
type InternalPlan={
  tables:string[];newRows:Map<string,RecordRow[]>;conflicts:Conflict[];
  totals:{sourceOnly:number;identical:number;conflicting:number};
  fingerprint:string;schemaErrors:string[];warnings:string[];
};
const excluded=new Set(['dc_leases','dc_task_leases',
  'dc_legacy_active_migrations','dc_task_integration_ready',
  'dc_task_repository_baselines','dc_task_repository_baseline_relocations',
  'dc_task_worktree_baselines','dc_legacy_child_worktree_snapshots',
  'dc_protected_worktree_refreshes']);
const maxPreviewConflicts=40;
const module=createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync:new(path:string,options?:{readOnly?:boolean})=>Database;
};
const safeName=(s:string)=>/^dc_[a-z0-9_]+$/.test(s);
const quoted=(s:string)=>'"'+s.replaceAll('"','""')+'"';
const cell=(v:Cell):unknown=>v instanceof Uint8Array?
  {binary:Buffer.from(v).toString('base64')}:typeof v==='bigint'?{bigint:String(v)}:v;
const canonical=(value:unknown)=>JSON.stringify(value);
const present=(row:RecordRow):Record<string,unknown>=>Object.fromEntries(
  Object.entries(row).map(([k,v])=>[k,cell(v)]));
const hash=(value:unknown)=>createHash('sha256').update(canonical(value)).digest('hex');

function tables(db:Database):Map<string,TableShape>{
  const result=new Map<string,TableShape>();
  const names=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'dc_%' ORDER BY name")
    .all().map(r=>String(r.name));
  for(const name of names){
    if(!safeName(name))throw Error('Unsafe SQLite schema table name');
    const columns=db.prepare('PRAGMA table_info('+quoted(name)+')').all()
      .map(r=>({
        name:String(r.name),type:String(r.type),notnull:Number(r.notnull),
        dflt_value:r.dflt_value===null?null:String(r.dflt_value),
        pk:Number(r.pk),
      }));
    if(columns.some(c=>!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(c.name)))
      throw Error('Unsafe SQLite schema column name');
    const keys=columns.filter(c=>c.pk>0).sort((a,b)=>a.pk-b.pk).map(c=>c.name);
    const foreignKeys=db.prepare('PRAGMA foreign_key_list('+quoted(name)+')').all()
      .map(r=>({table:String(r.table),from:String(r.from),to:String(r.to)}));
    result.set(name,{columns,keys,foreignKeys});
  }
  return result;
}
function rows(db:Database,name:string,shape:TableShape):RecordRow[]{
  if(!shape.keys.length)throw Error('Cannot merge a SQLite table without a primary key: '+name);
  return db.prepare('SELECT * FROM '+quoted(name)+' ORDER BY '+
    shape.keys.map(quoted).join(',')).all();
}
function rowKey(row:RecordRow,keys:string[]):string{
  return canonical(keys.map(k=>cell(row[k])));
}
function projectAnchor(left:Database,right:Database):boolean{
  // Cloned legacy SQLite databases retain the bootstrap marker. Alternatively
  // an unchanged task contract is shared ancestry even if states diverge.
  const meta=(db:Database)=>db.prepare(
    "SELECT value FROM dc_meta WHERE key='bootstrap'").all()[0]?.value;
  const a=meta(left),b=meta(right);
  if(typeof a==='string'&&a.length>0&&a===b)return true;
  const available=new Set(tables(left).get('dc_tasks')?.columns.map(c=>c.name)??[]);
  const columns=['id','title','release','allowed_paths','required_gates']
    .filter(c=>available.has(c));
  if(columns.length<2)return false;
  const items=(db:Database)=>db.prepare(
    'SELECT '+columns.map(quoted).join(',')+' FROM dc_tasks ORDER BY id').all();
  const ids=new Set(items(left).map(r=>hash(present(r))));
  // Shared titles alone are not project identity. Require multiple exact
  // common planned outcomes when the original bootstrap marker differs.
  return items(right).filter(r=>ids.has(hash(present(r)))).length>=2;
}
function sortDependencies(shapes:Map<string,TableShape>,names:string[]):string[]{
  const visited=new Set<string>(),visiting=new Set<string>(),order:string[]=[];
  const requested=new Set(names);
  function visit(name:string){
    if(visited.has(name))return;
    if(visiting.has(name))throw Error('Cyclic SQLite foreign keys cannot be merged automatically');
    visiting.add(name);
    for(const foreign of shapes.get(name)!.foreignKeys)
      if(foreign.table!==name&&requested.has(foreign.table))visit(foreign.table);
    visiting.delete(name);visited.add(name);order.push(name);
  }
  names.forEach(visit);
  return order;
}
function analyze(target:Database,source:Database):InternalPlan{
  const lhs=tables(target),rhs=tables(source);
  const names=[...new Set([...lhs.keys(),...rhs.keys()])].sort();
  const schemaErrors:string[]=[];
  for(const name of names)
    if(!lhs.has(name)||!rhs.has(name)||canonical(lhs.get(name))!==canonical(rhs.get(name)))
      schemaErrors.push('Incompatible table schema: '+name);
  if(!lhs.has('dc_tasks')||!lhs.has('dc_meta'))
    schemaErrors.push('Not a supported DevControl project ledger');
  const warnings:string[]=[];
  if(!schemaErrors.length&&!projectAnchor(target,source))
    schemaErrors.push('No shared project ancestry. Do not merge unrelated DevControl SQLite databases');
  const newRows=new Map<string,RecordRow[]>(),conflicts:Conflict[]=[];
  const totals={sourceOnly:0,identical:0,conflicting:0};
  const fingerprints:unknown[]=[];
  for(const name of names){
    if(schemaErrors.some(e=>e.includes('table schema: '+name))||
      !lhs.has(name)||!rhs.has(name))continue;
    if(excluded.has(name)){
      warnings.push(name+' is checkout-local and will remain from the target');
      continue;
    }
    const shape=lhs.get(name)!;
    if(!shape.keys.length){
      schemaErrors.push('Missing stable primary key: '+name);
      continue;
    }
    const targetRows=rows(target,name,shape);
    const sourceRows=rows(source,name,shape);
    fingerprints.push([name,targetRows.map(present),sourceRows.map(present)]);
    const existing=new Map(targetRows.map(r=>[rowKey(r,shape.keys),r]));
    const pending:RecordRow[]=[];
    for(const src of sourceRows){
      const key=rowKey(src,shape.keys),dst=existing.get(key);
      if(!dst){
        // Local-meta markers are never adopted from another machine.
        if(name==='dc_meta'){
          warnings.push('Source-only metadata remains local: '+key);
          continue;
        }
        if(name==='dc_tasks'&&!['draft','ready'].includes(String(src.status))){
          schemaErrors.push('Source-only executing or accepted task '+String(src.id)+
            ' needs AI to inspect its exact Git delivery and real acceptance evidence before adopting it');
          continue;
        }
        pending.push(src);totals.sourceOnly++;
      }else if(canonical(present(src))===canonical(present(dst))){
        totals.identical++;
      }else{
        totals.conflicting++;
        if(conflicts.length<maxPreviewConflicts)
          conflicts.push({table:name,key,source:present(src),target:present(dst)});
      }
    }
    if(pending.length)newRows.set(name,pending);
  }
  const fingerprint=hash({schema:[...lhs,...rhs],rows:fingerprints});
  return {tables:sortDependencies(lhs,[...newRows.keys()]),
    newRows,conflicts,totals,fingerprint,schemaErrors,warnings};
}
function open(file:string,readOnly:boolean):Database{
  const absolute=path.resolve(file);
  if(!fs.statSync(absolute).isFile()||fs.lstatSync(absolute).isSymbolicLink())
    throw Error('SQLite source must be a regular file, not a symlink');
  const db=new module.DatabaseSync(absolute,{readOnly});
  db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=8000;');
  const check=db.prepare('PRAGMA quick_check').all();
  if(check.length!==1||check[0].quick_check!=='ok'){
    db.close();throw Error('SQLite quick_check failed: '+absolute);
  }
  return db;
}
export type MergeRequest={
  targetPath:string;sourcePath:string;mode:'preview'|'candidate';
  outputPath?:string;expectedFingerprint?:string;
};
/** No in-place changes: candidate builds a separately VACUUMed target copy.
 * Conflicting mutable task rows and identity collisions are reported, NEVER
 * resolved by a last-writer-wins upsert or an AI-invented verified status.
 */
export function mergeDevControlSqlite(request:MergeRequest){
  const targetPath=path.resolve(request.targetPath);
  const sourcePath=path.resolve(request.sourcePath);
  if(targetPath===sourcePath)throw Error('Source and target SQLite must differ');
  const source=open(sourcePath,true),target=open(targetPath,true);
  try{
    const plan=analyze(target,source);
    const summary={
      kind:'devcontrol-sqlite-merge',mode:request.mode,
      targetPath,sourcePath,fingerprint:plan.fingerprint,
      counts:plan.totals,schemasCompatible:plan.schemaErrors.length===0,
      conflicts:plan.conflicts,conflictsTruncated:plan.totals.conflicting>plan.conflicts.length,
      blockingIssues:plan.schemaErrors,warnings:plan.warnings,
      candidatePossible:plan.schemaErrors.length===0&&plan.totals.conflicting===0,
      candidateNotAccepted:'A merged SQLite is only a candidate. Current AI must validate its Git revisions, task dependencies, real tests and acceptance before using it as project state.',
    };
    if(request.mode==='preview')return summary;
    if(request.mode!=='candidate')throw Error('Unknown merge mode');
    if(!summary.candidatePossible)
      throw Error('Merge has schema, identity or row conflicts; inspect preview first. No output written.');
    if(request.expectedFingerprint!==plan.fingerprint)
      throw Error('Merge inputs changed since preview. Re-run preview and review the new fingerprint.');
    if(!request.outputPath)throw Error('An explicit candidate output path is required');
    const outputPath=path.resolve(request.outputPath);
    if([targetPath,sourcePath].includes(outputPath)||fs.existsSync(outputPath)||
      !fs.existsSync(path.dirname(outputPath)))
      throw Error('Candidate output must be a new path in an existing directory');
    const literal=outputPath.replaceAll("'","''");
    target.exec("VACUUM INTO '"+literal+"'");
    let candidate:Database|undefined;
    try{
      candidate=open(outputPath,false);
      const post=analyze(candidate,source);
      if(post.fingerprint!==plan.fingerprint||post.totals.conflicting)
        throw Error('Input data changed during merge; candidate discarded');
      candidate.exec('BEGIN IMMEDIATE');
      try{
        // Parent/child task IDs may be ordered differently in two databases.
        // Defer their internal FK checks until the whole candidate is built.
        candidate.exec('PRAGMA defer_foreign_keys=ON');
        const shapes=tables(candidate);
        for(const table of plan.tables){
          const shape=shapes.get(table)!;
          const cols=shape.columns.map(c=>c.name);
          const query='INSERT INTO '+quoted(table)+' ('+cols.map(quoted).join(',')+
            ') VALUES ('+cols.map(()=>'?').join(',')+')';
          for(const row of plan.newRows.get(table)??[])
            candidate.prepare(query).run(...cols.map(c=>row[c]));
        }
        const violation=candidate.prepare('PRAGMA foreign_key_check').all();
        if(violation.length)throw Error('Merged candidate has foreign-key violations');
        candidate.exec('COMMIT');
      }catch(e){candidate.exec('ROLLBACK');throw e;}
      candidate.close();candidate=undefined;
      return {...summary,candidatePath:outputPath,candidateCreated:true};
    }catch(error){
      candidate?.close();
      fs.rmSync(outputPath,{force:true});
      throw error;
    }
  }finally{
    source.close();target.close();
  }
}
