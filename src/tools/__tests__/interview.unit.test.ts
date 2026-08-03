import { describe, expect, test } from 'vitest';
import { interview } from '../interview.js';

describe('interview', () => {
  test('短描述只追问缺失项，不再固定输出全量问题', async () => {
    const result = await interview({ description: '做一个健康状态页。' });
    const structured = (result as any).structuredContent;

    expect(structured.mode).toBe('questions');
    expect(structured.readyForSpec).toBe(false);
    expect(structured.questions.length).toBeGreaterThan(0);
    expect(structured.questions.length).toBeLessThanOrEqual(6);
    expect(structured.questions.length).toBeLessThan(14);
    expect(String(result.content[0].text)).toContain('只需回答以上缺失项');
  });

  test('完整约束已给出时直接收敛到规格，不重复全量追问', async () => {
    const description = [
      '做一个只读健康状态页，展示服务版本、工具数量、Memory、Git 和计划状态。',
      '页面不允许修改系统状态，接口失败时显示明确错误。',
      '桌面端和移动端均不得横向溢出，不要求登录，也不引入新依赖。',
    ].join('');
    const result = await interview({ description });
    const structured = (result as any).structuredContent;
    const text = String(result.content[0].text);

    expect(structured.mode).toBe('questions');
    expect(structured.readyForSpec).toBe(true);
    expect(structured.questions).toEqual([]);
    expect(structured.recognizedConstraints).toEqual(expect.arrayContaining([
      '功能为只读展示',
      '不得修改系统状态',
      '失败时必须显示明确错误',
      '不要求登录',
      '不得引入新依赖',
    ]));
    expect(text).toContain('当前信息已足以形成规格草案');
    expect(text).not.toContain('Q1.');
    expect(structured.nextSteps.join(' ')).toMatch(/check_spec|start_feature/);
  });
});
