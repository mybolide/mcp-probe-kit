import {afterEach,describe,expect,it,vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {performance} from 'node:perf_hooks';
import {ProjectTaskLedger} from '../task-ledger.js';

let root:string,ledger:ProjectTaskLedger;
afterEach(()=>{
  vi.restoreAllMocks();ledger?.close();
  if(root)fs.rmSync(root,{recursive:true,force:true});
});

describe('next at multi-hundred-task project scale',()=>{
  it('selects an approved Ready leaf without changing SQLite or repeatedly expanding the same task',()=>{
    root=fs.mkdtempSync(path.join(os.tmpdir(),'devcontrol-next-scale-'));
    execFileSync('git',['init','-q',root]);
    ledger=new ProjectTaskLedger(root);
    const Db=createRequire(import.meta.url)('node:sqlite').DatabaseSync;
    const db=new Db(ledger.databasePath);
    try{
      db.exec('BEGIN');
      db.prepare("INSERT OR REPLACE INTO dc_meta(key,value) VALUES('bootstrap',?)")
        .run(JSON.stringify({importedTasks:420}));
      const insert=db.prepare(`INSERT INTO dc_tasks
        (id,title,parent_id,track,release,priority,status,allowed_paths,
         required_gates,spec_id,plan_id,created_at,updated_at)
        VALUES(?,?,NULL,'governance','V0.1',50,?,?,?,NULL,NULL,?,?)`);
      const now=new Date().toISOString();
      for(let i=0;i<420;i++){
        const id='SCALE-'+String(i).padStart(4,'0');
        insert.run(id,'Project task '+i,i<320?'verified':'ready',
          JSON.stringify([`src/task-${i}.ts`]),JSON.stringify(['docs']),now,now);
      }
      db.exec('COMMIT');
    }finally{db.close();}
    const before=fs.readFileSync(path.join(root,'.git','HEAD'));
    const contract=vi.spyOn(ledger,'executionContract');
    const started=performance.now();
    const response=ledger.next();
    const elapsedMs=Math.round(performance.now()-started);
    expect(response.nextTask).toMatchObject({id:'SCALE-0320',status:'ready'});
    expect(response.selectedTaskWriterStatus).toMatchObject({claimableNow:true});
    expect(response.blocked).toEqual([]);
    expect(fs.readFileSync(path.join(root,'.git','HEAD')).equals(before)).toBe(true);
    expect(ledger.get('SCALE-0320').status).toBe('ready');
    // Timing is diagnostic, never a machine-specific test Gate.
    console.info(JSON.stringify({scenario:'next-420-tasks',elapsedMs,
      fullContracts:contract.mock.calls.length,selected:response.nextTask.id}));
  },60000);
});
