import { describe, expect, test } from 'vitest';
import { buildDevWorkflow, detectWorkflowScenario } from '../dev-workflow.js';

describe('dev-workflow', () => {
  test('识别 bugfix 场景', () => {
    const result = detectWorkflowScenario('登录报错 NullReference 需要排查修复');
    expect(result.scenario).toBe('bugfix');
  });

  test('识别 feature 场景', () => {
    const result = detectWorkflowScenario('开发用户认证新功能');
    expect(result.scenario).toBe('feature');
  });

  test('新增功能包含规格步骤时仍路由到 feature', () => {
    const result = detectWorkflowScenario(
      '为现有 TypeScript 项目新增一个只读的健康检查摘要功能，需要先生成规格、评估影响范围、补充测试，并在完成后进行收敛检查。'
    );
    expect(result.scenario).toBe('feature');
    expect(result.confidence).toBe('high');
  });

  test('只检查已有规格时路由到 spec', () => {
    const result = detectWorkflowScenario('仅检查现有订单导出规格和验收标准是否完整，不实现代码');
    expect(result.scenario).toBe('spec');
    expect(result.confidence).toBe('high');
  });

  test('新增页面即使提到规格仍优先路由到 ui', () => {
    const result = detectWorkflowScenario('新增设置页面和交互组件，先补充页面规格再实现');
    expect(result.scenario).toBe('ui');
  });

  test('发布候选开发中的实机验收不会误判为 spec', () => {
    const result = detectWorkflowScenario([
      '继续 MCP Probe Kit v4.0.0-rc.2 发布候选开发：',
      '- 校验 npm next 标签与 Git Tag/package version 一致性；',
      '- Legacy/Modern 双协议与 Agent Evals；',
      '- 真实客户端兼容矩阵保持 pending，完成实机验收前不得发布稳定版。',
    ].join('\n'));

    expect(result.scenario).toBe('feature');
    expect(result.confidence).not.toBe('low');
  });

  test('bugfix 计划首工具为 start_bugfix', () => {
    const plan = buildDevWorkflow('TypeError in checkout');
    expect(plan.firstTool).toBe('start_bugfix');
    expect(plan.phases.some((p) => p.steps.some((s) => s.tool === 'start_bugfix'))).toBe(true);
  });

  test('显式 scenario 覆盖推断', () => {
    const plan = buildDevWorkflow('随便', { scenario: 'ui' });
    expect(plan.scenario).toBe('ui');
    expect(plan.firstTool).toBe('start_ui');
  });
});
