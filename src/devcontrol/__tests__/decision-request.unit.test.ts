import {afterEach,describe,expect,it} from 'vitest';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ProjectTaskLedger} from '../task-ledger.js';
import {dispatchDevControl} from '../command.js';
import {createDevControlBoardServer} from '../board-server.js';

const roots:string[]=[];
afterEach(()=>roots.splice(0).forEach(dir=>rmSync(dir,{recursive:true,force:true})));

function fixture(){
  const dir=mkdtempSync(join(tmpdir(),'dc-feature-decision-inbox-'));
  roots.push(dir);execFileSync('git',['init','-q',dir]);
  const ledger=new ProjectTaskLedger(dir);
  const feature='health-v2';
  dispatchDevControl(ledger,'feature-create',{
    name:feature,description:'Health tab data continuity and supported device health insights',
    layout:'flat',actor:'planning-agent'});
  const taskId='HEALTH-01';
  ledger.create({id:taskId,title:'Preserve health report continuity',
    track:'product',allowedPaths:['src/health/**'],requiredGates:['flutter_test']},'planner');
  const question={id:'DR-HEALTH-01',featureName:feature,
    title:'睡眠周数据不足时如何展示结果',
    question:'本周数据不足的情况下，是否需要保留上一周期已解锁的原分数和日期？',
    background:'已有解锁结果可能因为网络失败或低数据量被误清空，需要产品负责人明确展示行为。',
    recommendedOption:'keep',options:[
      {id:'keep',label:'保留历史结果',description:'保留原分数和原日期，并说明本期未更新'},
      {id:'hide',label:'暂时隐藏',description:'当前周期不显示旧分数'}],
    taskIds:[taskId],sourceRefs:['FR-HEALTH-12'],blocking:true,
    ownerRole:'product',actor:'fixture-planner',expectedRevision:0};
  return {ledger,feature,taskId,question};
}

describe('lightweight Feature decision requests, separate from task lifecycle',()=>{
  it('stores a real answer with one immutable audit event and deduplicates retries',()=>{
    const {ledger,question,taskId}=fixture();
    try{
      const taskBefore=ledger.get(taskId);
      const created=dispatchDevControl(ledger,'decision-request-save',question);
      expect(created).toMatchObject({status:'pending',questionRevision:1,
        recommendedOption:'keep',blocking:true,taskIds:[taskId],
        taskApprovalUnchanged:true});
      expect(dispatchDevControl(ledger,'decision-request-list',{status:'pending'}))
        .toMatchObject({total:1});
      const submission={id:question.id,expectedRevision:1,kind:'decided',
        optionId:'keep',rationale:'历史结果有效，当前周期数据不足时仍需保留原日期。',
        actor:'product-owner',idempotencyKey:'submit-12345678'};
      const answered=dispatchDevControl(ledger,'decision-request-respond',submission);
      expect(answered).toMatchObject({status:'decided',idempotentReplay:false,
        decision:{optionId:'keep',actor:'product-owner',featureRevision:1}});
      const retried=dispatchDevControl(ledger,'decision-request-respond',{
        ...submission,clientAddress:'192.168.0.88'});
      expect(retried.idempotentReplay).toBe(true);
      const detail=dispatchDevControl(ledger,'decision-request-get',{id:question.id}) as {
        history:Array<{event:string}>;
      };
      expect(detail.history).toHaveLength(2);
      expect(detail.history.map((event:{event:string})=>event.event))
        .toEqual(['question','decided']);
      expect(dispatchDevControl(ledger,'decision-request-list',{status:'pending'}))
        .toMatchObject({total:0});
      expect(ledger.get(taskId)).toEqual(taskBefore);
      expect(()=>dispatchDevControl(ledger,'decision-request-respond',{
        ...submission,idempotencyKey:'other-00001'}))
        .toThrow(/already answered/i);
      expect(()=>dispatchDevControl(ledger,'decision-request-respond',{
        ...submission,optionId:'hide'}))
        .toThrow(/different decision/i);
    }finally{ledger.close();}
  });

  it('supports reject and defer without ever making a task claimable',()=>{
    const {ledger,question,taskId}=fixture();
    try{
      ledger.saveDecisionRequest(question);
      const rejected=ledger.respondDecisionRequest({id:question.id,expectedRevision:1,
        kind:'rejected',actor:'product-owner',rationale:'本期明确不做',
        idempotencyKey:'reject-1234567'});
      expect(rejected.status).toBe('rejected');
      expect(ledger.get(taskId).status).toBe('draft');
      ledger.saveDecisionRequest({...question,expectedRevision:1,
        question:'下一版本是否再考虑保留旧的睡眠结果，需要明确是否延期？'});
      const deferred=ledger.respondDecisionRequest({id:question.id,expectedRevision:2,
        kind:'deferred',actor:'product-owner',rationale:'需要更完整的 SDK 数据',
        deferTo:'V3',idempotencyKey:'defer-12345678'});
      expect(deferred).toMatchObject({status:'deferred',decision:{deferTo:'V3'}});
      expect(deferred.history.map((event:{event:string})=>event.event))
        .toEqual(['question','rejected','question','deferred']);
      expect(ledger.get(taskId).status).toBe('draft');
    }finally{ledger.close();}
  });

  it('prevents stale Feature revisions and stale question versions from being accepted',()=>{
    const {ledger,question,feature}=fixture();
    try{
      const first=ledger.saveDecisionRequest(question);
      dispatchDevControl(ledger,'feature-save',{
        name:feature,actor:'planner',architectureImpact:false,
        sections:{
          requirements:'FR-HEALTH-12: Previously unlocked results must be retained when incomplete.',
          design:'Keep historical entitlement and current data evaluation in separate storage states.',
          tasks:'Build continuity behavior and cover insufficient data and SDK failures.',
        },
      });
      expect(ledger.getDecisionRequest(first.id).stale).toBe(true);
      expect(()=>ledger.respondDecisionRequest({id:first.id,expectedRevision:1,
        kind:'decided',optionId:'keep',actor:'product-owner',idempotencyKey:'stale-12345678'}))
        .toThrow(/Feature or planning source changed/i);
      const revised=ledger.saveDecisionRequest({...question,expectedRevision:1});
      expect(revised).toMatchObject({questionRevision:2,status:'pending',
        featureRevision:2,stale:false});
      expect(()=>ledger.respondDecisionRequest({id:first.id,expectedRevision:1,
        kind:'decided',optionId:'keep',actor:'product-owner',idempotencyKey:'stale-22222222'}))
        .toThrow(/Question version changed/i);
      expect(ledger.getDecisionRequest(first.id).history).toHaveLength(2);
    }finally{ledger.close();}
  });

  it('offers a single narrow same-origin web confirmation route; other writes stay blocked',async()=>{
    const {ledger,question,taskId}=fixture();
    ledger.saveDecisionRequest(question);
    const server=createDevControlBoardServer(ledger,{lanEnabled:false});
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    try{
      const address=server.address();
      if(!address||typeof address==='string')throw Error('No test listener');
      const base='http://127.0.0.1:'+address.port;
      const url=base+'/api/decision-requests/'+question.id+'/answer';
      const access=await (await fetch(base+'/api/decision-requests/access')).json() as {
        csrfToken:string;canRespond:boolean;
      };
      expect(access.canRespond).toBe(true);
      const payload={expectedRevision:1,kind:'decided',optionId:'keep',
        actor:'product-owner',rationale:'本周数据不足时保留已解锁分数',
        idempotencyKey:'web-1234567890'};
      const options={method:'POST',headers:{'content-type':'application/json',
        origin:base,'x-mcp-decision-token':access.csrfToken},body:JSON.stringify(payload)};
      expect((await fetch(url,{...options,headers:{...options.headers,
        'x-mcp-decision-token':'forged'}})).status).toBe(403);
      expect((await fetch(url,{...options,headers:{...options.headers,
        origin:'https://example.invalid'}})).status).toBe(403);
      const accepted=await fetch(url,options);
      expect(accepted.status).toBe(200);
      expect((await accepted.json()).status).toBe('decided');
      expect((await fetch(url,options)).status).toBe(200);
      const detail=await (await fetch(base+'/api/decision-requests/'+question.id)).json() as {
        history:any[];decision:any;
      };
      expect(detail.history).toHaveLength(2);
      expect(detail.decision.clientAddress).toBeTruthy();
      expect((await fetch(base+'/api/tasks/'+taskId,{method:'POST',
        headers:options.headers})).status).toBe(405);
      expect(ledger.get(taskId).status).toBe('draft');
    }finally{
      await new Promise<void>(resolve=>server.close(()=>resolve()));
      ledger.close();
    }
  });
});
