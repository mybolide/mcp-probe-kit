/**
 * 单元测试：start_feature 工具（委托式编排）
 */

import { describe, test, expect } from 'vitest';
import { startFeature } from '../start_feature.js';

describe('start_feature 单元测试', () => {
  test('缺少必填参数时返回错误', async () => {
    const result = await startFeature({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/请提供功能名称和描述|参数错误/i);
  });

  test('返回委托式执行计划（steps）', async () => {
    const result = await startFeature({
      feature_name: 'user-auth',
      description: '用户认证功能',
      docs_dir: 'docs',
    });

    expect(result.isError).toBe(false);
    expect('structuredContent' in result).toBe(true);
    if (!('structuredContent' in result)) {
      throw new Error('structuredContent 缺失');
    }

    const structured = (result as any).structuredContent;
    const plan = structured?.metadata?.plan;
    expect(plan).toBeTruthy();
    expect(plan.mode).toBe('delegated');
    expect(Array.isArray(plan.steps)).toBe(true);
    expect(plan.steps.length).toBe(3);

    const tools = plan.steps.map((step: any) => step.tool);
    expect(tools).toContain('init_project_context');
    expect(tools).toContain('add_feature');
    expect(tools).toContain('estimate');

    const specStep = plan.steps.find((step: any) => step.tool === 'add_feature');
    expect(specStep.args.feature_name).toBe('user-auth');
    expect(specStep.outputs).toContain('docs/specs/user-auth/requirements.md');
  });

  test('输出文本包含执行计划与关键工具名', async () => {
    const result = await startFeature({
      feature_name: 'user-auth',
      description: '用户认证功能',
    });

    const text = result.content[0].text;
    expect(text).toMatch(/执行计划/);
    expect(text).toMatch(/add_feature/);
    expect(text).toMatch(/estimate/);
  });

  test('template_profile 应该透传到 add_feature 计划', async () => {
    const result = await startFeature({
      feature_name: 'user-auth',
      description: '用户认证功能',
      template_profile: 'strict',
    });

    expect(result.isError).toBe(false);
    expect('structuredContent' in result).toBe(true);
    if (!('structuredContent' in result)) {
      throw new Error('structuredContent 缺失');
    }
    const structured = (result as any).structuredContent;
    const plan = structured?.metadata?.plan;
    expect(plan).toBeTruthy();

    const specStep = plan.steps.find((step: any) => step.tool === 'add_feature');
    expect(specStep.args.template_profile).toBe('strict');
  });

  test('loop 模式返回需求循环结构', async () => {
    const result = await startFeature({
      feature_name: 'user-auth',
      description: '用户认证功能',
      requirements_mode: 'loop',
      loop_question_budget: 3,
    });

    expect(result.isError).toBe(false);
    expect('structuredContent' in result).toBe(true);
    if (!('structuredContent' in result)) {
      throw new Error('structuredContent 缺失');
    }

    const loop = (result as any).structuredContent;
    expect(loop.mode).toBe('loop');
    expect(loop.round).toBe(1);
    expect(loop.maxRounds).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(loop.openQuestions)).toBe(true);
    expect(loop.openQuestions.length).toBeLessThanOrEqual(3);
  });
});
