import {afterEach,describe,expect,it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {ProjectTaskLedger} from '../task-ledger.js';
import {mergeDevControlSqlite} from '../sqlite-merge.js';

const sqlite=createRequire(import.meta.url)('node:sqlite') as {
  DatabaseSync:new(file:string)=>{
    exec(query:string):void;
    prepare(query:string):{run(...args:(string|number|null)[]):unknown;
      get(...args:(string|number|null)[]):Record<string,unknown>|undefined;
      all(...args:(string|number|null)[]):Record<string,unknown>[]};
    close():void;
  };
};
describe('AI-assisted SQLite project state merge',()=>{
  const folders:string[]=[];
  afterEach(()=>{for(const folder of folders.splice(0))
    fs.rmSync(folder,{recursive:true,force:true});});
  function fixtures(){
    const folder=fs.mkdtempSync(path.join(os.tmpdir(),'devcontrol-sqlite-merge-'));
    folders.push(folder);
    const target=path.join(folder,'target.sqlite3');
    const source=path.join(folder,'source.sqlite3');
    const db=new sqlite.DatabaseSync(target);
    try{
      db.exec(`
        PRAGMA foreign_keys=ON;
        CREATE TABLE dc_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
        CREATE TABLE dc_tasks(
          id TEXT PRIMARY KEY,title TEXT NOT NULL,status TEXT NOT NULL,
          parent_id TEXT REFERENCES dc_tasks(id)
        );
        CREATE TABLE dc_dependencies(
          task_id TEXT NOT NULL REFERENCES dc_tasks(id),
          depends_on TEXT NOT NULL REFERENCES dc_tasks(id),
          PRIMARY KEY(task_id,depends_on)
        );
        CREATE TABLE dc_evidence(
          id INTEGER PRIMARY KEY,task_id TEXT REFERENCES dc_tasks(id),
          reference TEXT NOT NULL
        );
        CREATE TABLE dc_audit(
          id INTEGER PRIMARY KEY,task_id TEXT,event TEXT NOT NULL
        );
        CREATE TABLE dc_task_leases(
          task_id TEXT PRIMARY KEY REFERENCES dc_tasks(id),agent TEXT NOT NULL
        );
        INSERT INTO dc_meta(key,value) VALUES('bootstrap','shared-project-origin');
        INSERT INTO dc_tasks(id,title,status) VALUES('ROOT','Requirements and design','ready');
      `);
    }finally{db.close();}
    fs.copyFileSync(target,source);
    const run=(file:string,query:string)=>{
      const d=new sqlite.DatabaseSync(file);
      try{d.exec('PRAGMA foreign_keys=ON');d.exec(query);}
      finally{d.close();}
    };
    const query=(file:string,sql:string)=>{
      const d=new sqlite.DatabaseSync(file);
      try{return d.prepare(sql).all();}finally{d.close();}
    };
    return {folder,target,source,run,query,
      preview:()=>mergeDevControlSqlite({
        targetPath:target,sourcePath:source,mode:'preview',
      })};
  }
  it('builds a separate consistent candidate from disjoint tasks and dependencies',()=>{
    const f=fixtures();
    f.run(f.target,`INSERT INTO dc_tasks(id,title,status) VALUES('UI','Single UI outcome','ready');
      INSERT INTO dc_task_leases(task_id,agent) VALUES('UI','local-only');`);
    f.run(f.source,`INSERT INTO dc_tasks(id,title,status,parent_id) VALUES('API','One API outcome','ready','ROOT');
      INSERT INTO dc_dependencies(task_id,depends_on) VALUES('API','ROOT');
      INSERT INTO dc_evidence(id,task_id,reference) VALUES(3,'API','project-test-receipt');
      INSERT INTO dc_task_leases(task_id,agent) VALUES('API','other-device');`);
    const result=f.preview();
    expect(result.candidatePossible).toBe(true);
    expect(result.counts).toMatchObject({sourceOnly:3,conflicting:0});
    const output=path.join(f.folder,'merged-candidate.sqlite3');
    const built=mergeDevControlSqlite({
      targetPath:f.target,sourcePath:f.source,mode:'candidate',
      expectedFingerprint:result.fingerprint,outputPath:output,
    });
    expect(built).toMatchObject({candidateCreated:true,candidatePath:output});
    expect(f.query(output,'SELECT id FROM dc_tasks ORDER BY id').map(r=>r.id))
      .toEqual(['API','ROOT','UI']);
    expect(f.query(output,'SELECT depends_on FROM dc_dependencies')).toEqual([
      {depends_on:'ROOT'},
    ]);
    expect(f.query(output,'SELECT task_id FROM dc_evidence')).toEqual([
      {task_id:'API'},
    ]);
    expect(f.query(output,'SELECT task_id FROM dc_task_leases')).toEqual([
      {task_id:'UI'},
    ]);
    expect(f.query(f.target,'SELECT id FROM dc_tasks ORDER BY id').map(r=>r.id))
      .toEqual(['ROOT','UI']);
    expect(f.query(f.source,'SELECT id FROM dc_tasks ORDER BY id').map(r=>r.id))
      .toEqual(['API','ROOT']);
  });
  it('reports competing task statuses and never produces a candidate',()=>{
    const f=fixtures();
    f.run(f.target,"UPDATE dc_tasks SET status='in_progress' WHERE id='ROOT'");
    f.run(f.source,"UPDATE dc_tasks SET status='verified' WHERE id='ROOT'");
    const plan=f.preview();
    expect(plan.candidatePossible).toBe(false);
    expect(plan.counts.conflicting).toBe(1);
    expect(plan.conflicts[0]).toMatchObject({table:'dc_tasks',
      target:{status:'in_progress'},source:{status:'verified'}});
    const output=path.join(f.folder,'not-created.sqlite3');
    expect(()=>mergeDevControlSqlite({targetPath:f.target,sourcePath:f.source,
      mode:'candidate',outputPath:output,expectedFingerprint:plan.fingerprint}))
      .toThrow(/conflicts/);
    expect(fs.existsSync(output)).toBe(false);
  });
  it('never silently rewrites colliding auto-increment evidence IDs',()=>{
    const f=fixtures();
    f.run(f.target,"INSERT INTO dc_evidence(id,task_id,reference) VALUES(1,'ROOT','result-a')");
    f.run(f.source,"INSERT INTO dc_evidence(id,task_id,reference) VALUES(1,'ROOT','result-b')");
    expect(f.preview()).toMatchObject({
      candidatePossible:false,counts:{conflicting:1,sourceOnly:0,identical:2},
    });
  });
  it('does not merge a database without shared ancestry or matching schema',()=>{
    const f=fixtures();
    f.run(f.source,"UPDATE dc_meta SET value='unrelated-project' WHERE key='bootstrap'");
    f.run(f.source,'DELETE FROM dc_tasks');
    expect(f.preview()).toMatchObject({candidatePossible:false});
    const g=fixtures();
    g.run(g.source,'ALTER TABLE dc_tasks ADD COLUMN unreviewed TEXT');
    expect(g.preview().blockingIssues.join(' ')).toMatch(/Incompatible table schema/);
  });
  it('detects changes after preview and leaves existing output untouched',()=>{
    const f=fixtures();
    const plan=f.preview();
    f.run(f.source,"INSERT INTO dc_tasks(id,title,status) VALUES('NEW','Another task','ready')");
    const out=path.join(f.folder,'candidate.sqlite3');
    expect(()=>mergeDevControlSqlite({targetPath:f.target,sourcePath:f.source,
      mode:'candidate',outputPath:out,expectedFingerprint:plan.fingerprint}))
      .toThrow(/changed since preview/);
    expect(fs.existsSync(out)).toBe(false);
    fs.writeFileSync(out,'protected-original');
    expect(()=>mergeDevControlSqlite({targetPath:f.target,sourcePath:f.source,
      mode:'candidate',outputPath:out,expectedFingerprint:f.preview().fingerprint}))
      .toThrow(/new path/);
    expect(fs.readFileSync(out,'utf8')).toBe('protected-original');
  });
  it('handles the actual complete DevControl schema and preserves historical metadata',()=>{
    const folder=fs.mkdtempSync(path.join(os.tmpdir(),'dc-real-ledger-'));
    folders.push(folder);
    const root=path.join(folder,'project');
    fs.mkdirSync(root,{recursive:true});
    execFileSync('git',['init','-q'],{cwd:root});
    fs.writeFileSync(path.join(root,'README.md'),'real schema test\n');
    execFileSync('git',['add','README.md'],{cwd:root});
    execFileSync('git',['-c','user.name=Test',
      '-c','user.email=test@example.invalid','commit','-qm','initial'],{cwd:root});
    const ledger=new ProjectTaskLedger(root);
    const target=ledger.databasePath;
    ledger.close();
    const edit=(file:string,sql:string)=>{
      const db=new sqlite.DatabaseSync(file);
      try{db.exec(sql);}finally{db.close();}
    };
    edit(target,"INSERT OR REPLACE INTO dc_meta(key,value) VALUES('bootstrap','shared-real-schema')");
    const source=path.join(folder,'source.sqlite3');
    fs.copyFileSync(target,source);
    edit(source,`INSERT INTO dc_tasks
      (id,title,track,release,priority,status,allowed_paths,required_gates,created_at,updated_at)
      VALUES('DOC-01','Write one standalone API guide','product','v5',50,
        'draft','["docs/**"]','[]','2026-11-02','2026-11-02')`);
    const preview=mergeDevControlSqlite({
      targetPath:target,sourcePath:source,mode:'preview',
    });
    expect(preview.candidatePossible).toBe(true);
    expect(preview.counts.sourceOnly).toBe(1);
    const output=path.join(folder,'candidate.sqlite3');
    mergeDevControlSqlite({targetPath:target,sourcePath:source,
      mode:'candidate',outputPath:output,expectedFingerprint:preview.fingerprint});
    const db=new sqlite.DatabaseSync(output);
    try{
      expect(db.prepare("SELECT status FROM dc_tasks WHERE id='DOC-01'").get())
        .toEqual({status:'draft'});
      expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    }finally{db.close();}
  });
});
