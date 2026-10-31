import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { boardHtml } from '../board-html.js';

const source=readFileSync(resolve(import.meta.dirname,'../workbench/time.js'),'utf8');
const helper=source+'\n({beijingDateTime,beijingDate,beijingClock})';

describe('DevControl display times always use Asia/Shanghai',()=>{
  test('ISO UTC, explicit offsets, and SQLite UTC timestamps describe the same instant',()=>{
    const clock=vm.runInNewContext(helper,{Date,Intl}) as {
      beijingDateTime:(value:unknown)=>string;
      beijingDate:(value:unknown)=>string;
      beijingClock:(value:unknown)=>string;
    };
    const expected='2026/10/31 00:05:06 北京时间';
    expect(clock.beijingDateTime('2026-10-30T16:05:06.000Z')).toBe(expected);
    expect(clock.beijingDateTime('2026-10-31T00:05:06+08:00')).toBe(expected);
    expect(clock.beijingDateTime('2026-10-30 16:05:06')).toBe(expected);
    expect(clock.beijingDate('2026-10-30T16:05:06Z')).toBe('2026/10/31（北京时间）');
    expect(clock.beijingClock('2026-10-30T16:05:06Z')).toBe('00:05:06 北京时间');
    expect(clock.beijingDateTime('unknown')).toBe('unknown');
    expect(clock.beijingDateTime('')).toBe('—');
    expect(clock.beijingDateTime('2026-10-30')).toBe('2026-10-30');
  });

  test('same UTC instant renders identically on a UTC or Los Angeles browser',()=>{
    const values=['UTC','America/Los_Angeles','Asia/Shanghai'].map(zone=>{
      const child=spawnSync(process.execPath,['-e',
        'const vm=require("node:vm");const fs=require("node:fs");'+
        'const src=fs.readFileSync(process.argv[1],"utf8");'+
        'const f=vm.runInNewContext(src+"\\nbeijingDateTime",{Date,Intl});'+
        'process.stdout.write(f("2026-10-30 16:05:06"));',
        resolve(import.meta.dirname,'../workbench/time.js')],{
        encoding:'utf8',env:{...process.env,TZ:zone},timeout:5_000,
      });
      expect(child.status,child.stderr).toBe(0);
      return child.stdout;
    });
    expect(new Set(values).size).toBe(1);
    expect(values[0]).toBe('2026/10/31 00:05:06 北京时间');
  });

  test('both workbench and standalone/embedded board use the explicit zone',()=>{
    const browserSource=[
      'runtime.js','records.js','features.js','insights.js','markdown.js',
    ].map(name=>readFileSync(resolve(import.meta.dirname,'../workbench',name),'utf8')).join('\n');
    expect(browserSource).not.toContain('.toLocaleTimeString()');
    expect(browserSource).not.toContain('.toLocaleDateString()');
    for(const kind of [true,false]){
      const markup=boardHtml('test-nonce',kind);
      expect(markup).toContain('timeZone:"Asia/Shanghai"');
      expect(markup).not.toContain('new Date().toLocaleTimeString()');
      expect(markup).toContain('beijingStamp(completion.created_at)');
      expect(markup).toContain('beijingStamp(task.updatedAt)');
    }
  });
});
