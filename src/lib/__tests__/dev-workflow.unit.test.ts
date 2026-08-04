import { describe, expect, test } from 'vitest';
import { buildDevWorkflow, detectWorkflowScenario } from '../dev-workflow.js';

describe('dev-workflow', () => {
  test('识别 bugfix 场景', () => {
    const result = detectWorkflowScenario('登录报错 NullReference 需要排查修复');
    expect(result.scenario).toBe('bugfix');
  });

  test('明确架构设计任务路由到 architecture，而普通读懂架构仍是 explore', () => {
    const architecture = detectWorkflowScenario('评估当前模块边界和数据所有权，并设计可回滚的目标架构');
    expect(architecture).toEqual({ scenario: 'architecture', confidence: 'high' });

    const plan = buildDevWorkflow('评估当前模块边界和数据所有权，并设计可回滚的目标架构');
    expect(plan.firstTool).toBe('architecture');
    expect(plan.firstToolArgsHint).toMatchObject({ mode: 'design' });

    const explore = detectWorkflowScenario('帮我读懂当前架构和调用链');
    expect(explore.scenario).toBe('explore');
  });

  test('显式 architecture scenario 直接返回 ARC-8 工具', () => {
    const plan = buildDevWorkflow('核验实现是否偏离目标架构', { scenario: 'architecture' });
    expect(plan.scenario).toBe('architecture');
    expect(plan.firstTool).toBe('architecture');
    expect(plan.firstToolArgsHint).toMatchObject({ mode: 'drift' });
  });

  test('项目接入和建立上下文路由到 onboard', () => {
    const intent = '将当前项目接入 MCP Probe Kit 并建立项目上下文。';
    const result = detectWorkflowScenario(intent);
    expect(result).toEqual({ scenario: 'onboard', confidence: 'high' });

    const plan = buildDevWorkflow(intent);
    expect(plan.firstTool).toBe('start_onboard');
  });

  test('新增只读状态页面按功能交付路由到 feature', () => {
    const result = detectWorkflowScenario(
      '为测试项目增加一个只读健康状态页面，展示版本、工具数量和 Memory 状态。'
    );
    expect(result.scenario).toBe('feature');
    expect(result.confidence).toBe('high');
  });

  test('产品目标和用户价值规划路由到 product', () => {
    const result = detectWorkflowScenario(
      '规划健康状态模块的产品目标、用户价值、功能范围和验收标准。'
    );
    expect(result.scenario).toBe('product');
    expect(result.confidence).toBe('high');

    const plan = buildDevWorkflow('规划健康状态模块的产品目标、用户价值、功能范围和验收标准。');
    expect(plan.firstTool).toBe('start_product');
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
