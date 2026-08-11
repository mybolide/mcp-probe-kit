import { describe, expect, test } from 'vitest';
import {
  buildDevWorkflow,
  detectWorkflowRoute,
  detectWorkflowScenario,
  renderWorkflowMarkdown,
} from '../dev-workflow.js';

describe('dev-workflow guide contract', () => {
  test.each([
    '实现订单导出功能',
    'Fix the null pointer when saving drafts.',
    '重新设计移动端导航。',
    '评估服务边界，同时新增导出接口。',
    'architecture review copilot',
    '继续',
  ])('auto 不从自然语言猜 firstTool: %s', (intent) => {
    const route = detectWorkflowRoute(intent);
    expect(route).toMatchObject({
      scenario: 'unknown',
      confidence: 'low',
      routingDecision: {
        source: 'guide',
        selectedScenario: null,
        conflict: false,
        requiresClarification: false,
        candidates: [],
      },
    });
    expect(detectWorkflowScenario(intent)).toEqual({ scenario: 'unknown', confidence: 'low' });
  });

  test('auto plan 返回 Agent 工具选择指南而不是自动路由结果', () => {
    const plan = buildDevWorkflow('实现订单导出功能');
    expect(plan.scenario).toBe('unknown');
    expect(plan.firstTool).toBeNull();
    expect(plan.selectionGuide?.length).toBeGreaterThan(15);
    expect(plan.selectionGuide).toEqual(expect.arrayContaining([
      expect.objectContaining({ firstTool: 'start_feature' }),
      expect.objectContaining({ firstTool: 'start_bugfix' }),
      expect.objectContaining({ firstTool: 'architecture' }),
      expect.objectContaining({ firstTool: 'code_insight' }),
      expect.objectContaining({ firstTool: 'resume_plan' }),
    ]));
    expect(plan.agentSelectionRules?.join('\n')).toContain('Agent');
    expect(plan.agentSelectionRules?.join('\n')).toContain('多个独立交付');
  });

  test.each([
    ['feature', 'feature', 'start_feature'],
    ['bugfix', 'bugfix', 'start_bugfix'],
    ['bug', 'bugfix', 'start_bugfix'],
    ['ui', 'ui', 'start_ui'],
    ['product', 'product', 'start_product'],
    ['prd', 'product', 'start_product'],
    ['ralph', 'ralph', 'start_ralph'],
    ['architecture', 'architecture', 'architecture'],
    ['arch', 'architecture', 'architecture'],
    ['explore', 'explore', 'code_insight'],
    ['commit', 'commit', 'gencommit'],
    ['work_report', 'work_report', 'git_work_report'],
    ['report', 'work_report', 'git_work_report'],
    ['test', 'test', 'gentest'],
    ['review', 'review', 'code_review'],
    ['refactor', 'refactor', 'refactor'],
    ['onboard', 'onboard', 'start_onboard'],
    ['spec', 'spec', 'check_spec'],
  ] as const)('显式 scenario=%s 确定性返回 %s / %s', (input, scenario, firstTool) => {
    const route = detectWorkflowRoute('任意上下文', input);
    const plan = buildDevWorkflow('任意上下文', { scenario: input });
    expect(route.scenario).toBe(scenario);
    expect(route.confidence).toBe('high');
    expect(route.routingDecision.source).toBe('explicit');
    expect(route.routingDecision.selectedScenario).toBe(scenario);
    expect(plan.firstTool).toBe(firstTool);
  });

  test('显式 feature 使用 intent 生成参数提示，但不依赖 intent 做场景判断', () => {
    const intent = '实现订单导出功能';
    const plan = buildDevWorkflow(intent, { scenario: 'feature' });
    expect(plan.firstToolArgsHint).toEqual({ description: intent, spec_layout: 'auto' });
  });

  test.each([
    ['评估当前模块边界', 'assess'],
    ['设计目标架构和迁移方案', 'design'],
    ['校验是否符合目标架构', 'validate'],
    ['检查架构漂移', 'drift'],
  ] as const)('显式 architecture 后只推断架构子模式: %s', (intent, mode) => {
    const plan = buildDevWorkflow(intent, { scenario: 'architecture' });
    expect(plan.scenario).toBe('architecture');
    expect(plan.firstTool).toBe('architecture');
    expect(plan.firstToolArgsHint).toMatchObject({ mode, description: intent });
  });

  test('显式 memory 根据后端可用性决定是否给可执行工具', () => {
    const unavailable = buildDevWorkflow('查历史经验', { scenario: 'memory', memoryAvailable: false });
    const available = buildDevWorkflow('查历史经验', { scenario: 'memory', memoryAvailable: true });
    expect(unavailable.firstTool).toBeNull();
    expect(available.firstTool).toBe('search_memory');
  });

  test('渲染后的 auto 指南明确不做意图识别', () => {
    const plan = buildDevWorkflow('任意自然语言');
    const markdown = renderWorkflowMarkdown(plan, '任意自然语言');
    expect(markdown).toContain('Agent 工具选择指南');
    expect(markdown).toContain('Agent 判断规则');
    expect(markdown).toContain('不执行自然语言意图识别');
    expect(markdown).toContain('start_feature');
    expect(markdown).toContain('code_insight');
  });
});
