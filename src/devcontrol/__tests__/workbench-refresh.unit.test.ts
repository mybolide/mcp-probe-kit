import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const source=readFileSync(resolve(import.meta.dirname,'../workbench/runtime.js'),'utf8');

describe('Workbench refresh countdown follows completed API batches',()=>{
  test('waits for the LAST response even if another endpoint already failed',async()=>{
    const start=source.indexOf('  async function awaitRefreshRequests(');
    const end=source.indexOf('  async function loadBrandVersion()',start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const collect=vm.runInNewContext(source.slice(start,end)+'\nawaitRefreshRequests;',
      {Promise},{timeout:1000}) as
      (requests:Promise<unknown>[],optionalLast?:boolean)=>Promise<unknown[]>;
    let finishLast!: (value:unknown)=>void;
    const last=new Promise(resolve=>{finishLast=resolve;});
    let settled=false;
    const batch=collect([Promise.reject(new Error('board failed')),
      Promise.resolve({other:'ready'}),last]);
    batch.then(()=>{settled=true;},()=>{settled=true;});
    await Promise.resolve();await Promise.resolve();
    expect(settled).toBe(false);
    finishLast({last:'finally returned'});
    await expect(batch).rejects.toThrow('board failed');
    expect(settled).toBe(true);
    // Insights are optional, but even their failed request must settle before
    // the full workbench can begin the next interval.
    let endOptional!: (error:Error)=>void;
    const optional=new Promise((_resolve,reject)=>{endOptional=reject;});
    const optionalBatch=collect([Promise.resolve('required'),optional],true);
    let optionalDone=false;
    optionalBatch.then(()=>{optionalDone=true;});
    await Promise.resolve();expect(optionalDone).toBe(false);
    endOptional(new Error('optional insights unavailable'));
    expect(Array.from(await optionalBatch)).toEqual(['required',null]);
  });

  test('5→4→3→2→1→request: countdown remains zero and does not overlap',()=>{
    const start=source.indexOf('  setInterval(()=>{');
    const end=source.indexOf('  window.addEventListener("focus"',start);
    expect(start).toBeGreaterThan(0);
    const calls:string[]=[];
    let tick!:()=>void;
    const context=vm.createContext({
      setInterval:(cb:()=>void,ms:number)=>{expect(ms).toBe(1000);tick=cb;},
      router:{current:()=> 'tasks'},
      document:{visibilityState:'visible'},
      $:()=>({classList:{contains:()=>false}}),
      updateRefreshCountdown:()=>{calls.push('display');},
      reload:()=>{calls.push('overview-request');},
      refreshTaskData:()=>{
        calls.push('tasks-request');
        vm.runInContext('taskRefreshInProgress=true',context);
      },
    });
    vm.runInContext('let refreshRemaining=5,refreshSeconds=5;'+
      'let reloadInProgress=false,taskRefreshInProgress=false;'+
      source.slice(start,end),context,{timeout:1000});
    for(const expected of [4,3,2,1,0]){
      tick();
      expect(vm.runInContext('refreshRemaining',context)).toBe(expected);
    }
    expect(calls.filter(x=>x==='tasks-request')).toHaveLength(1);
    for(let i=0;i<12;i++)tick();
    expect(vm.runInContext('refreshRemaining',context)).toBe(0);
    expect(calls.filter(x=>x==='tasks-request')).toHaveLength(1);
    // The real async handler resets only in its finally, once all fetches
    // and the DOM update have completed.
    expect(source).toContain('finally{taskRefreshInProgress=false;resetRefreshClock();}');
    expect(source).toContain('finally{reloadInProgress=false;resetRefreshClock();}');
    vm.runInContext('taskRefreshInProgress=false;refreshRemaining=refreshSeconds',context);
    tick();expect(vm.runInContext('refreshRemaining',context)).toBe(4);
  });
});
