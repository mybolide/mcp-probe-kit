import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { workflow } from '../workflow.js';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

function makeProjectRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-root-'));
  tempDirs.push(root);
  return root;
}

function structured(result: Awaited<ReturnType<typeof workflow>>) {
  if (!('structuredContent' in result) || !result.structuredContent) {
    throw new Error('missing structuredContent');
  }
  return result.structuredContent;
}

describe('workflow 工具选择指南', () => {
  test.each([
    '实现订单导出功能',
    '修复支付接口 500 错误',
    '重新设计移动端导航',
    '评估服务边界，同时新增导出接口',
  ])('auto 不根据 intent 猜工具: %s', async (intent) => {
    const projectRoot = makeProjectRoot();
    const result = await workflow({ intent, project_root: projectRoot });
    expect(result.isError).toBe(false);
    const data = structured(result);
    expect(data.scenario).toBe('unknown');
    expect(data.firstTool).toBeNull();
    expect(data.routingDecision).toMatchObject({
      source: 'guide',
      selectedScenario: null,
      conflict: false,
      requiresClarification: false,
    });
    expect(data.selectionGuide?.length).toBeGreaterThan(15);
    expect(data.agentSelectionRules?.length).toBeGreaterThan(3);
    expect(data.handles).toMatchObject({
      next_tool: null,
      next_action: 'agent_select_tool_from_guide',
    });
    expect(result.content[0].text).toContain('Agent 工具选择指南');
    expect(fs.existsSync(path.join(projectRoot, '.agents/skills/mcp-probe-kit/SKILL.md'))).toBe(true);
  });

  test('显式 feature scenario 返回确定性的 start_feature', async () => {
    const projectRoot = makeProjectRoot();
    const intent = '实现订单导出功能';
    const result = await workflow({ intent, scenario: 'feature', project_root: projectRoot });
    const data = structured(result);
    expect(data.scenario).toBe('feature');
    expect(data.firstTool).toBe('start_feature');
    expect(data.firstToolArgsHint).toEqual({ description: intent, spec_layout: 'auto' });
    expect(data.routingDecision).toMatchObject({ source: 'explicit', selectedScenario: 'feature' });
  });

  test.each([
    ['bugfix', 'start_bugfix'],
    ['test', 'gentest'],
    ['product', 'start_product'],
    ['refactor', 'refactor'],
    ['architecture', 'architecture'],
  ] as const)('显式 %s scenario 返回确定性首工具', async (scenario, firstTool) => {
    const projectRoot = makeProjectRoot();
    const result = await workflow({ intent: '上下文', scenario, project_root: projectRoot });
    const data = structured(result);
    expect(data.firstTool).toBe(firstTool);
    expect(data.routingDecision.source).toBe('explicit');
  });

  test('显式非法 scenario 直接拒绝且不触发项目 bootstrap', async () => {
    const projectRoot = makeProjectRoot();
    const result = await workflow({
      intent: '实现订单导出功能',
      scenario: 'not-a-real-scenario',
      project_root: projectRoot,
    });
    expect(result.isError).toBe(true);
    expect(String(result.content[0].text)).toContain('参数 scenario 不支持');
    expect(fs.existsSync(path.join(projectRoot, '.agents'))).toBe(false);
    expect(fs.existsSync(path.join(projectRoot, 'AGENTS.md'))).toBe(false);
  });

  test('scenario 非字符串时在指南生成前返回类型错误', async () => {
    const projectRoot = makeProjectRoot();
    const result = await workflow({
      intent: '实现订单导出功能',
      scenario: { invalid: true },
      project_root: projectRoot,
    });
    expect(result.isError).toBe(true);
    expect(String(result.content[0].text)).toContain('scenario 必须是字符串');
    expect(fs.existsSync(path.join(projectRoot, '.agents'))).toBe(false);
  });
});
