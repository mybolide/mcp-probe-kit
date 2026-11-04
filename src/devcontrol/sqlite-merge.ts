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
import {checkTaskContent,taskContentReviewHash,
  checkContentPair,type HumanTaskOverview,type AiExecutionBrief,
  type TaskContentReview} from './task-content.js';

type Cell=string|number|bigint|Uint8Array|null;
type RecordRow=Record<string,Cell>;
interface Statement{all(...args:Cell[]):RecordRow[];run(...args:Cell[]):unknown}
interface Database{
  exec(sql:string):void;
  prepare(sql:string):Statement;
  close():void;
}
function auditDraftChoices(db:Database,shapes:Map<string,TableShape>,
  decisions:MergeDecision[],fingerprint:string):void{
  if(!decisions.length)return;
  const required=['task_id','event','actor','details_json','created_at'];
  const columns=new Set(shapes.get('dc_audit')?.columns.map(c=>c.name)??[]);
  if(!required.every(c=>columns.has(c)))
    throw Error('Cannot preserve AI merge decision evidence: dc_audit schema unsupported');
  const insert=db.prepare(`INSERT INTO dc_audit
    (task_id,event,actor,details_json,created_at) VALUES (?,?,?,?,?)`);
  const at=new Date().toISOString();
  for(const decision of decisions){
    const key=JSON.parse(decision.key) as unknown;
    if(decision.table!=='dc_tasks'||!Array.isArray(key)||
      key.length!==1||typeof key[0]!=='string')
      throw Error('Draft merge decision requires a unique task ID');
    insert.run(key[0],'sqlite_merge_draft_resolution',decision.actor,
      JSON.stringify({fingerprint,choice:decision.choice,reason:decision.reason,
        table:decision.table,key:decision.key}),at);
  }
}
type Column={name:string;type:string;notnull:number;dflt_value:string|null;pk:number};
type ForeignKey={table:string;from:string;to:string};
type TableShape={columns:Column[];keys:string[];foreignKeys:ForeignKey[]};
type Conflict={table:string;key:string;source:Record<string,unknown>;
  target:Record<string,unknown>;base?:Record<string,unknown>;
  category:'concurrent_change'|'identity_collision'|'task_state'|'immutable_evidence'|'metadata'|'deletion';
  changedBySource:string[];changedByTarget:string[];
  resolutionAllowed:boolean};
export type MergeDecision={
  table:string;key:string;choice:'source'|'target';actor:string;reason:string;
};
type PlannedUpdate={row:RecordRow;key:string;previous:RecordRow};
type InternalPlan={
  tables:string[];newRows:Map<string,RecordRow[]>;
  updates:Map<string,PlannedUpdate[]>;conflicts:Conflict[];
  acceptedDecisions:MergeDecision[];autoResolved:number;
  totals:{sourceOnly:number;identical:number;conflicting:number};
  fingerprint:string;schemaErrors:string[];warnings:string[];
};
const excluded=new Set(['dc_leases','dc_task_leases',
  'dc_legacy_active_migrations','dc_task_integration_ready',
  'dc_task_repository_baselines','dc_task_repository_baseline_relocations',
  'dc_task_worktree_baselines','dc_legacy_child_worktree_snapshots',
  'dc_protected_worktree_refreshes',
  // Older releases kept a machine-specific PID/port registry inside the
  // project SQLite. It must never influence cross-machine schema or rows.
  'dc_workspace_runtime']);
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
const equal=(a:RecordRow,b:RecordRow)=>canonical(present(a))===canonical(present(b));
function changed(a:RecordRow,b?:RecordRow):string[]{
  if(!b)return Object.keys(a);
  return Object.keys(a).filter(k=>canonical(cell(a[k]))!==canonical(cell(b[k])));
}
function safeDraft(...rows:RecordRow[]):boolean{
  // Draft tasks have no claim, integration or Verified promise. A Ready
  // frozen contract, in-progress delivery, or completed verification is
  // NEVER auto-replaced by a newer timestamp or by an AI preference.
  return rows.every(r=>r.status==='draft'&&
    (!('approved_by' in r)||r.approved_by===null)&&
    (!('verified_at' in r)||r.verified_at===null));
}

function tableNames(db:Database):string[]{
  const names=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'dc_%' ORDER BY name")
    .all().map(r=>String(r.name));
  if(names.some(name=>!safeName(name)))throw Error('Unsafe SQLite schema table name');
  return names;
}
function tables(db:Database):Map<string,TableShape>{
  const result=new Map<string,TableShape>();
  // Machine-local tables must be excluded BEFORE introspecting columns and
  // comparing schemas, even if one side or the common base lacks the table.
  for(const name of tableNames(db)){
    if(excluded.has(name))continue;
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
function taskDependencyIssues(target:Database,shapes:Map<string,TableShape>,
  additions:Map<string,RecordRow[]>,updates:Map<string,PlannedUpdate[]>):string[]{
  if(!shapes.has('dc_tasks')||!shapes.has('dc_dependencies'))return [];
  const state=new Map<string,string>();
  const taskRows=[
    ...rows(target,'dc_tasks',shapes.get('dc_tasks')!),
    ...(additions.get('dc_tasks')??[]),
  ];
  for(const task of taskRows)state.set(String(task.id),String(task.status));
  for(const change of updates.get('dc_tasks')??[])
    state.set(String(change.row.id),String(change.row.status));
  const edges=new Map<string,string[]>();
  const dependencies=[
    ...rows(target,'dc_dependencies',shapes.get('dc_dependencies')!),
    ...(additions.get('dc_dependencies')??[]),
  ];
  const issues:string[]=[];
  for(const relation of dependencies){
    const task=String(relation.task_id),prerequisite=String(relation.depends_on);
    if(!state.has(task)||!state.has(prerequisite)){
      issues.push('Merged dependency references a missing task: '+task+'/'+prerequisite);
      continue;
    }
    if(['in_progress','in_review','verified'].includes(state.get(task)!)&&
      state.get(prerequisite)!=='verified')
      issues.push('Merged executing or Verified task '+task+
        ' has a prerequisite that is not Verified: '+prerequisite);
    const entries=edges.get(task)??[];
    entries.push(prerequisite);edges.set(task,entries);
  }
  const visiting=new Set<string>(),visited=new Set<string>();
  function visit(task:string){
    if(visiting.has(task)){
      issues.push('Merged task dependency cycle at '+task);return;
    }
    if(visited.has(task))return;
    visiting.add(task);
    for(const predecessor of edges.get(task)??[])visit(predecessor);
    visiting.delete(task);visited.add(task);
  }
  for(const task of state.keys())visit(task);
  return [...new Set(issues)];
}

/** Merging independent H/E revisions is safe only if every approved pair
 * still points to both exact document bytes and its original review.
 * Otherwise a split-brain SQLite copy could silently manufacture an AI
 * brief that neither machine actually approved. Never auto-repair it.
 */
function taskContentMergeIssues(target:Database,shapes:Map<string,TableShape>,
  additions:Map<string,RecordRow[]>,updates:Map<string,PlannedUpdate[]>):string[]{
  const rev='dc_task_content_revisions',pairs='dc_task_content_pairs';
  if(!shapes.has(rev)||!shapes.has(pairs))return [];
  const merged=(name:string):RecordRow[]=>{
    const shape=shapes.get(name);
    if(!shape)return [];
    const saved=rows(target,name,shape);
    const changes=new Map((updates.get(name)??[]).map(item=>[item.key,item.row]));
    return [...saved.map(row=>changes.get(rowKey(row,shape.keys))??row),
      ...(additions.get(name)??[])];
  };
  const errors:string[]=[];
  const docs=new Map<string,{content:HumanTaskOverview|AiExecutionBrief;
    hash:string;source:string}>();
  const key=(id:string,audience:string,version:number)=>
    JSON.stringify([id,audience,version]);
  for(const row of merged(rev)){
    const id=String(row.task_id),audience=String(row.audience);
    if(!['human','ai'].includes(audience)){
      errors.push('Invalid task content audience: '+id);continue;
    }
    try{
      const checked=checkTaskContent(audience as 'human'|'ai',
        JSON.parse(String(row.content_json)));
      if(!checked.passed||checked.hash!==row.content_hash||!checked.content)
        throw Error('Content hash or fields did not match');
      docs.set(key(id,audience,Number(row.revision)),{
        content:checked.content,hash:checked.hash!,
        source:String(row.source_plan_hash),
      });
    }catch{
      errors.push('Invalid independent '+audience+' content revision: '+id+
        ' v'+String(row.revision));
    }
  }
  for(const row of merged('dc_task_content_drafts')){
    const id=String(row.task_id),audience=String(row.audience);
    if(!['human','ai'].includes(audience)){
      errors.push('Invalid task content draft audience: '+id);continue;
    }
    try{
      const checked=checkTaskContent(audience as 'human'|'ai',
        JSON.parse(String(row.content_json)));
      if(!checked.passed||checked.hash!==row.content_hash)
        throw Error('Draft fingerprint changed');
      docs.set(key(id,audience,Number(row.base_revision)+1),{
        content:checked.content!,hash:checked.hash!,
        source:String(row.source_plan_hash),
      });
    }catch{
      errors.push('Invalid unapproved '+audience+' draft: '+id);
    }
  }
  const validatePair=(row:RecordRow,approved:boolean)=>{
    const id=String(row.task_id);
    const h=docs.get(key(id,'human',Number(row.human_revision)));
    const ai=docs.get(key(id,'ai',Number(row.ai_revision)));
    if(!h||!ai||h.hash!==row.human_hash||ai.hash!==row.ai_hash||
      h.source!==row.source_plan_hash||ai.source!==row.source_plan_hash){
      errors.push('Orphaned or mismatched H/E pair after SQLite merge: '+id);
      return;
    }
    try{
      const review=JSON.parse(String(row.review_json)) as TaskContentReview;
      const subject={taskId:id,sourcePlanHash:String(row.source_plan_hash),
        humanHash:h.hash,aiHash:ai.hash,
        humanRevision:Number(row.human_revision),
        aiRevision:Number(row.ai_revision)};
      if(taskContentReviewHash(subject,review)!==row.review_hash||
        checkContentPair(h.content as HumanTaskOverview,
          ai.content as AiExecutionBrief,review,
          approved&&row.approval_mode==='editorial-reviewed'?
            'editorial':'substantive').length)
        throw Error('Review SHA or correspondence changed');
    }catch{
      errors.push('Unverifiable H/E consistency review after merge: '+id);
    }
  };
  for(const row of merged(pairs))validatePair(row,true);
  for(const row of merged('dc_task_content_pair_reviews'))validatePair(row,false);
  return [...new Set(errors)];
}
function analyze(target:Database,source:Database,base?:Database,
  decisions:MergeDecision[]=[]):InternalPlan{
  const lhs=tables(target),rhs=tables(source),ancestor=base?tables(base):undefined;
  const localNames=[...new Set([
    ...tableNames(target),...tableNames(source),...(base?tableNames(base):[]),
  ])].filter(name=>excluded.has(name)).sort();
  const names=[...new Set([...lhs.keys(),...rhs.keys(),...(ancestor?.keys()??[])])].sort();
  const schemaErrors:string[]=[];
  for(const name of names)
    if(!lhs.has(name)||!rhs.has(name)||canonical(lhs.get(name))!==canonical(rhs.get(name))||
      (ancestor&&canonical(lhs.get(name))!==canonical(ancestor.get(name))))
      schemaErrors.push('Incompatible table schema: '+name);
  if(!lhs.has('dc_tasks')||!lhs.has('dc_meta'))
    schemaErrors.push('Not a supported DevControl project ledger');
  const warnings=localNames.map(name=>
    name+' is machine-local and will remain from the target if present');
  if(!schemaErrors.length&&(!projectAnchor(target,source)||
    (base&&(!projectAnchor(base,target)||!projectAnchor(base,source)))))
    schemaErrors.push('No shared project ancestry. Do not merge unrelated DevControl SQLite databases');
  const newRows=new Map<string,RecordRow[]>(),updates=new Map<string,PlannedUpdate[]>();
  const conflicts:Conflict[]=[];
  const acceptedDecisions:MergeDecision[]=[];
  const totals={sourceOnly:0,identical:0,conflicting:0};
  const fingerprints:unknown[]=[];
  let autoResolved=0;
  const usedDecisions=new Set<number>();
  function addConflict(table:string,key:string,src:RecordRow,dst:RecordRow,
    previous:RecordRow|undefined,category:Conflict['category'],
    resolutionAllowed:boolean,pendingUpdates:PlannedUpdate[]){
    const record:Conflict={
      table,key,source:present(src),target:present(dst),
      ...(previous?{base:present(previous)}:{}),category,
      changedBySource:changed(src,previous),changedByTarget:changed(dst,previous),
      resolutionAllowed,
    };
    const matches=decisions.map((d,i)=>({d,i}))
      .filter(({d})=>d.table===table&&d.key===key);
    if(matches.length>1)throw Error('Duplicate merge decisions for '+table+'/'+key);
    if(matches.length===1){
      const {d,i}=matches[0];
      if(!resolutionAllowed)throw Error(
        'Merge decision is forbidden for frozen/Verified task or immutable record: '+table+'/'+key);
      if(!['source','target'].includes(d.choice)||!d.actor?.trim()||
        typeof d.reason!=='string'||d.reason.trim().length<20)
        throw Error('Merge decision needs a source/target choice, responsible AI actor and detailed reason');
      usedDecisions.add(i);acceptedDecisions.push(d);
      if(d.choice==='source')pendingUpdates.push({row:src,key,previous:dst});
      return;
    }
    totals.conflicting++;
    if(conflicts.length<maxPreviewConflicts)conflicts.push(record);
  }
  for(const name of names){
    if(schemaErrors.some(e=>e.includes('table schema: '+name))||
      !lhs.has(name)||!rhs.has(name))continue;
    const shape=lhs.get(name)!;
    if(!shape.keys.length){
      schemaErrors.push('Missing stable primary key: '+name);continue;
    }
    const targetRows=rows(target,name,shape),sourceRows=rows(source,name,shape);
    const baseRows=base?rows(base,name,shape):[];
    fingerprints.push([name,targetRows.map(present),sourceRows.map(present),
      ...(base?[baseRows.map(present)]:[])]);
    const existing=new Map(targetRows.map(r=>[rowKey(r,shape.keys),r]));
    const fromBase=new Map(baseRows.map(r=>[rowKey(r,shape.keys),r]));
    const fromSource=new Map(sourceRows.map(r=>[rowKey(r,shape.keys),r]));
    const pending:RecordRow[]=[],pendingUpdates:PlannedUpdate[]=[];
    for(const src of sourceRows){
      const key=rowKey(src,shape.keys),dst=existing.get(key),prior=fromBase.get(key);
      if(!dst){
        if(prior){
          // Deleting an old row on one computer cannot silently erase a
          // modified row on the other. No physical deletion is supported.
          schemaErrors.push('Source row has a missing/deleted target ancestor: '+name+'/'+key);
          continue;
        }
        if(name==='dc_meta'){
          warnings.push('Source-only metadata remains local: '+key);continue;
        }
        if(name==='dc_tasks'&&!['draft','ready'].includes(String(src.status))){
          schemaErrors.push('Source-only executing or accepted task '+String(src.id)+
            ' needs AI to inspect its exact Git delivery and real acceptance evidence before adopting it');
          continue;
        }
        pending.push(src);totals.sourceOnly++;
      }else if(equal(src,dst)){
        totals.identical++;
      }else if(prior&&equal(src,prior)){
        // Source has not modified this exact baseline row; keep local edits.
        // For immutable history rows, do not collapse a differing identity
        // or an audit/evidence rewrite merely because source is older.
        if(name==='dc_tasks'&&safeDraft(src,dst,prior))autoResolved++;
        else addConflict(name,key,src,dst,prior,
          name==='dc_tasks'?'task_state':'immutable_evidence',false,pendingUpdates);
      }else if(prior&&equal(dst,prior)&&name==='dc_tasks'&&safeDraft(src,dst,prior)){
        // Only a one-sided unapproved task draft edit is safely commutative.
        pendingUpdates.push({row:src,key,previous:dst});autoResolved++;
      }else{
        const category:Conflict['category']=name==='dc_tasks'?'task_state':
          name==='dc_meta'?'metadata':
          name==='dc_evidence'||name==='dc_audit'||name==='dc_completion_notes'?
            'immutable_evidence':prior?'concurrent_change':'identity_collision';
        addConflict(name,key,src,dst,prior,category,
          name==='dc_tasks'&&!!prior&&safeDraft(src,dst,prior),
          pendingUpdates);
      }
    }
    if(base){
      for(const prior of baseRows){
        const key=rowKey(prior,shape.keys);
        if(existing.has(key)&&!fromSource.has(key))
          schemaErrors.push('Source deleted an existing history row: '+name+'/'+key);
      }
    }
    if(pending.length)newRows.set(name,pending);
    if(pendingUpdates.length)updates.set(name,pendingUpdates);
  }
  if(usedDecisions.size!==decisions.length)
    throw Error('Merge decision does not match an actual current conflict');
  if(!schemaErrors.length)
    schemaErrors.push(...taskDependencyIssues(target,lhs,newRows,updates));
  if(!schemaErrors.length)
    schemaErrors.push(...taskContentMergeIssues(target,lhs,newRows,updates));
  const fingerprint=hash({schema:[...lhs,...rhs,...(ancestor?[...ancestor]:[])],
    rows:fingerprints,decisions});
  return {tables:sortDependencies(lhs,[...new Set([...newRows.keys(),...updates.keys()])]),
    newRows,updates,conflicts,totals,fingerprint,schemaErrors,warnings,
    acceptedDecisions,autoResolved};
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
  basePath?:string;resolutions?:MergeDecision[];
};
/** No in-place changes: candidate builds a separately VACUUMed target copy.
 * Conflicting mutable task rows and identity collisions are reported, NEVER
 * resolved by a last-writer-wins upsert or an AI-invented verified status.
 */
export function mergeDevControlSqlite(request:MergeRequest){
  const targetPath=path.resolve(request.targetPath);
  const sourcePath=path.resolve(request.sourcePath);
  if(targetPath===sourcePath)throw Error('Source and target SQLite must differ');
  const basePath=request.basePath?path.resolve(request.basePath):undefined;
  if(basePath&&[targetPath,sourcePath].includes(basePath))
    throw Error('Common-ancestor SQLite must be a separate original snapshot');
  if(request.resolutions!==undefined&&!Array.isArray(request.resolutions))
    throw Error('Merge resolutions must be a JSON array');
  const source=open(sourcePath,true);
  let target:Database|undefined,base:Database|undefined;
  try{
    target=open(targetPath,true);
    base=basePath?open(basePath,true):undefined;
    const plan=analyze(target,source,base,request.resolutions??[]);
    const summary={
      kind:'devcontrol-sqlite-merge',mode:request.mode,
      targetPath,sourcePath,basePath:basePath??null,
      comparison:base?'three-way':'two-way',
      fingerprint:plan.fingerprint,
      counts:plan.totals,schemasCompatible:plan.schemaErrors.length===0,
      conflicts:plan.conflicts,conflictsTruncated:plan.totals.conflicting>plan.conflicts.length,
      blockingIssues:plan.schemaErrors,warnings:plan.warnings,
      automaticallyResolvedDraftChanges:plan.autoResolved,
      reviewedResolutions:plan.acceptedDecisions,
      proposedDraftUpdates:[...plan.updates.values()].reduce((n,a)=>n+a.length,0),
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
      const post=analyze(candidate,source,base,request.resolutions??[]);
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
          const setCols=cols.filter(c=>!shape.keys.includes(c));
          if(!setCols.length)continue;
          const updateSql='UPDATE '+quoted(table)+' SET '+
            setCols.map(c=>quoted(c)+'=?').join(',')+' WHERE '+
            shape.keys.map(k=>quoted(k)+'=?').join(' AND ');
          for(const update of plan.updates.get(table)??[]){
            const result=candidate.prepare(updateSql).run(
              ...setCols.map(c=>update.row[c]),...shape.keys.map(k=>update.row[k]));
            if(!result||typeof result!=='object'||(result as {changes?:number}).changes!==1)
              throw Error('Draft resolution did not update exactly one candidate row');
          }
        }
        auditDraftChoices(candidate,shapes,plan.acceptedDecisions,plan.fingerprint);
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
    base?.close();target?.close();source.close();
  }
}
