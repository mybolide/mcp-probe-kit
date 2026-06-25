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
