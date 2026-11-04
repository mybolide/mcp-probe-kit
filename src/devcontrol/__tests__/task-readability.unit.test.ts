import {describe,it,expect} from 'vitest';
import {taskReadability} from '../task-readability.js';
import type {HumanTaskOverview} from '../task-content.js';

describe('read-only, evidence-grounded human task description',()=>{
  const base={
    authoritative:true,taskId:'T-01',type:'development',
    acceptance:'片段写入本地目录；失败时明确记录失败',
    requirementIds:['FR-011','FR-999'],allowedPaths:['src/audio/**'],
    requiredGates:['ios_device_e2e'],
  };
  const linked=[{id:'FR-011',title:'有声片段保存与元信息记录',
    acceptance:'录音可保存且记录元数据'}];
  it('explains the task using actual requirement text but does not fabricate a frozen purpose',()=>{
    const result=taskReadability(base,linked);
    expect(result.status).toBe('needs_contract_review');
    expect(result.purpose.source).toBe('requirement-reference');
    expect(result.purpose.text).toContain('FR-011 有声片段保存');
    expect(result.requirementRefs).toEqual([
      linked[0],{id:'FR-999',title:'未找到对应的需求说明'},
    ]);
    expect(result.outcomes).toEqual([]);
    expect(result.outcomesSource).toBe('missing');
    expect(result.issues.map(issue=>issue.field))
      .toEqual(['purpose','scenario','workflow','testCases','negativeCases','sourceRefs']);
    expect(result.policy).toBe('read-only-advisory');
    expect(base).not.toHaveProperty('purpose');
  });
  it('a complete frozen contract is readable without inventing implementation',()=>{
    const result=taskReadability({...base,purpose:'保存用户同意的录音',
      scenario:'收到有声片段',workflow:['落盘并记录时间'],
      testCases:['成功落盘'],negativeCases:['失败时报告错误'],
      sourceRefs:['FR-011']},linked);
    expect(result.status).toBe('complete');
    expect(result.purpose).toMatchObject({source:'frozen-task',
      text:'保存用户同意的录音'});
    expect(result.issues).toEqual([]);
  });
  it('a decision task is not penalized for irrelevant engineering workflow fields',()=>{
    const result=taskReadability({...base,type:'decision',purpose:'明确密钥来源'},linked);
    expect(result.status).toBe('complete');
    expect(result.issues).toEqual([]);
  });
  it('does not silently treat a legacy unfrozen task as authoritative',()=>{
    const result=taskReadability({...base,authoritative:false},linked);
    expect(result.status).toBe('source_missing');
    expect(result.issues).toContainEqual({
      field:'frozenSource',label:'原始冻结合同来源',severity:'contract',
    });
  });
  it('distinguishes only missing business explanation from execution requirements',()=>{
    const result=taskReadability({...base,scenario:'开始录音',
      workflow:['按录音流程执行'],testCases:['落盘成功'],
      negativeCases:['记录失败'],sourceRefs:['FR-011']},linked);
    expect(result.status).toBe('needs_explanation');
    expect(result.issues.map(x=>x.field)).toEqual(['purpose']);
  });
  it('only reports independent work commitments from a separately reviewed human overview',()=>{
    const human:HumanTaskOverview={
      why:'用户需要知道其已经保存的历史录音不会被网络状态抹掉',
      work:['保留已经保存的历史录音','失败后说明本次状态'],
      effects:['首页继续显示已经成功保存的记录'],
      scenarios:['离线环境使用已有录音'],
      businessAcceptance:['数据不足时保留之前成功的记录'],
      exclusions:['不自动重置过去已经记录的结果'],
    };
    const result=taskReadability(base,linked,{},human);
    expect(result.purpose).toMatchObject({
      source:'reviewed-human-overview',text:human.why});
    expect(result.outcomesSource).toBe('reviewed-human-overview');
    expect(result.outcomes).toEqual(human.work);
    expect(result.outcomes).not.toContain(base.acceptance);
  });
});
