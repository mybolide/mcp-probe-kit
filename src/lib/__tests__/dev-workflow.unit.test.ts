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

  test('发布候选开发中的实机验收不会误判为 spec', () => {
    const result = detectWorkflowScenario([
      '继续 MCP Probe Kit v4.0.0-rc.1 发布候选开发：',
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
