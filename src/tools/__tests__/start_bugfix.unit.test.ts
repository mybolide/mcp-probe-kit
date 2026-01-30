/**
 * 单元测试：start_bugfix 工具（委托式编排）
 */

import { describe, test, expect } from 'vitest';
import { startBugfix } from '../start_bugfix.js';

describe('start_bugfix 单元测试', () => {
  test('缺少必填参数时返回错误', async () => {
    const result = await startBugfix({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/缺少必填参数|错误信息/i);
  });

  test('返回委托式执行计划（steps）', async () => {
    const result = await startBugfix({
      error_message: 'TypeError: Cannot read property',
      stack_trace: 'at index.ts:12:3',
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

    const fixStep = plan.steps.find((step: any) => step.tool === 'fix_bug');
    expect(fixStep).toBeTruthy();
    expect(fixStep.args.error_message).toBe('TypeError: Cannot read property');
  });

  test('loop 模式返回需求循环结构', async () => {
    const result = await startBugfix({
      error_message: 'NullReference',
      requirements_mode: 'loop',
      loop_question_budget: 2,
    });

    expect(result.isError).toBe(false);
    expect('structuredContent' in result).toBe(true);
    if (!('structuredContent' in result)) {
      throw new Error('structuredContent 缺失');
    }

    const loop = (result as any).structuredContent;
    expect(loop.mode).toBe('loop');
    expect(loop.round).toBe(1);
    expect(Array.isArray(loop.openQuestions)).toBe(true);
    expect(loop.openQuestions.length).toBeLessThanOrEqual(2);
  });

  test('template_profile 自动选择 strict（结构化输入）', async () => {
    const result = await startBugfix({
      error_message: `## 复现步骤
1. 打开登录页
2. 输入错误账号
3. 点击登录

## 期望
提示错误信息并保持页面可交互

## 实际
页面白屏，控制台报错

## 环境
- 浏览器: Chrome 120
- 系统: Windows 11
- 版本: v2.3.0`,
      stack_trace: 'TypeError: Cannot read property',
      template_profile: 'auto',
    });

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toMatch(/模板档位:\s*strict/);
  });

  test('template_profile 显式 guided 生效', async () => {
    const result = await startBugfix({
      error_message: '简单错误',
      template_profile: 'guided',
    });

    expect(result.isError).toBe(false);
    expect('structuredContent' in result).toBe(true);
    if (!('structuredContent' in result)) {
      throw new Error('structuredContent 缺失');
    }

    const structured = (result as any).structuredContent;
    const template = structured?.metadata?.template;
    expect(template?.profile).toBe('guided');
  });
});
