import { describe, expect, it } from 'vitest';
import { reviewAtomicOutcome } from '../task-atomicity.js';
import { reviewAtomicWorkItems, type AtomicWorkItem } from '../release-work.js';
import { reviewFeatureTaskPlan } from '../feature-task-plan.js';

describe('v5 atomic task boundaries', () => {
  it('allows implementation and verification of ONE outcome together', () => {
    expect(reviewAtomicOutcome({
      id:'GP-02-01',title:'校验单笔订单幂等键',
      acceptance:'同一订单重试只能产生一个确定的服务端交易记录',
      estimatedHours:2,maxHours:4,
    })).toEqual([]);
  });

  it('micro policy targets 30–60 minutes and requires reasoning for 1–2 hour exceptions', () => {
    const base={id:'P-01',title:'校验单笔订单幂等键',
      acceptance:'同一订单重试只保存一笔交易记录',
      maxHours:2,preferredHours:1,requireEstimate:true};
    expect(reviewAtomicOutcome({...base,estimatedHours:0.75})).toEqual([]);
    expect(reviewAtomicOutcome({...base,estimatedHours:1.5}))
      .toEqual([expect.stringContaining('exceeds preferred 1h')]);
    expect(reviewAtomicOutcome({...base,estimatedHours:1.5,
      granularityJustification:'该单一事务的并发校验必须作为一项完整集成验证，不可安全地按文件切割。'}))
      .toEqual([]);
    expect(reviewAtomicOutcome({...base,estimatedHours:3}))
      .toEqual(expect.arrayContaining([expect.stringContaining('exceeds 2h')]));
    expect(reviewAtomicOutcome(base))
      .toEqual([expect.stringContaining('requires estimatedHours')]);
  });

  it('identifies three unrelated concerns even when written as one sentence', () => {
    expect(reviewAtomicOutcome({id:'GP-02',title:'完成历史段落池整理',
      acceptance:'交付数据资格审查、业务实现以及验收证据汇总'}))
      .toEqual(expect.arrayContaining([expect.stringContaining('eligibility, business')]));
    expect(reviewAtomicOutcome({id:'GP-03',title:'验证录音中断状态',
      acceptance:'录音中断后显示中断，且不允许新增录音片段'}))
      .toEqual([]);
  });

  it('rejects whole-product bundles, multiple acceptance objectives and overlong Feature leaves', () => {
    expect(reviewAtomicOutcome({
      id:'F-01',title:'完成整个系统所有功能',
      acceptance:'完成全部模块功能',estimatedHours:8,maxHours:4,
    })).toEqual(expect.arrayContaining([
      expect.stringContaining('whole-product'),
      expect.stringContaining('exceeds 4h'),
    ]));
    expect(reviewAtomicOutcome({
      id:'F-02',title:'校验单一登录接口',
      acceptance:'登录失败返回无权限；同时完成消息推送',
    })).toEqual([expect.stringContaining('bundles independent objectives')]);
  });

  it('rejects broad, generic release tasks before Owner approval', () => {
    const broad:AtomicWorkItem={
      id:'F1-01',title:'完成整个系统所有功能',
      stageId:'F1',type:'development',platform:'Flutter',ownerRole:'Client Developer',
      acceptance:'完成全部模块功能',allowedPaths:['lib/**'],requiredGates:['flutter_test'],
      estimatedHours:8,
    };
    const issues=reviewAtomicWorkItems([broad],['F1'],new Set());
    expect(issues.join(' | ')).toContain('whole-product');
    expect(issues.join(' | ')).toContain('exceeds 4h');
  });

  it('Feature review blocks multi-objective leaves and requires precise file scope and stop conditions', () => {
    const review=reviewFeatureTaskPlan({
      name:'checkout',revision:1,hash:'placeholder',
      layout:'flat',status:'specified',
      requirements:['FR-001'],subspecs:[],
    }, {
      release:'V0.1',rationale:'Split a stable checkout requirement into reviewed one-goal implementation tasks.',
      nodes:[{
        id:'F1-01',kind:'leaf',title:'完成整个系统所有功能',
        requirementIds:['FR-001'],acceptance:'完成所有接口功能',
        estimatedHours:8,designRef:'feature:checkout#design',
        sourceRefs:['feature:checkout#requirements'],
      }],
    });
    expect(review.passed).toBe(false);
    expect(review.issues).toEqual(expect.arrayContaining([
      expect.stringContaining('whole-product'),
      expect.stringContaining('exceeds 2h'),
      expect.stringContaining('exact frozen file boundaries'),
      expect.stringContaining('positive and failure test cases'),
      expect.stringContaining('non-goals and stop conditions'),
    ]));
  });
});
