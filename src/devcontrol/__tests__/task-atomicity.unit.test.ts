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
      expect.stringContaining('exceeds 4h'),
      expect.stringContaining('exact frozen file boundaries'),
      expect.stringContaining('positive and failure test cases'),
      expect.stringContaining('non-goals and stop conditions'),
    ]));
  });
});
