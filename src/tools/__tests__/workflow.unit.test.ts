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

describe('workflow 工具', () => {
  test('新功能意图返回 start_feature 为首工具', async () => {
    const projectRoot = makeProjectRoot();
    const result = await workflow({ intent: '实现订单导出功能', project_root: projectRoot });

    expect(result.isError).toBe(false);
    expect('structuredContent' in result).toBe(true);
    if (!('structuredContent' in result) || !result.structuredContent) {
      throw new Error('missing structuredContent');
    }
    expect(result.structuredContent.firstTool).toBe('start_feature');
    expect(result.structuredContent.scenario).toBe('feature');
    expect(result.structuredContent.firstToolArgsHint).toEqual({
      description: '实现订单导出功能',
      spec_layout: 'auto',
    });
    expect(result.content[0].text).toContain('start_feature');
    expect(result.content[0].text).toContain('spec_layout');
    expect(result.structuredContent.handles?.next_tool).toBe('start_feature');
    expect(fs.existsSync(path.join(projectRoot, '.agents/skills/mcp-probe-kit/SKILL.md'))).toBe(true);
  });

  test('新增状态页面不会误路由到 start_ui', async () => {
    const projectRoot = makeProjectRoot();
    const result = await workflow({
      intent: '为测试项目增加一个只读健康状态页面，展示版本、工具数量和 Memory 状态。',
      project_root: projectRoot,
    });

    expect(result.isError).toBe(false);
    if (!('structuredContent' in result) || !result.structuredContent) {
      throw new Error('missing structuredContent');
    }
    expect(result.structuredContent.scenario).toBe('feature');
    expect(result.structuredContent.firstTool).toBe('start_feature');
  });

  test('产品规划意图返回 start_product', async () => {
    const projectRoot = makeProjectRoot();
    const result = await workflow({
      intent: '规划健康状态模块的产品目标、用户价值、功能范围和验收标准。',
      project_root: projectRoot,
    });

    expect(result.isError).toBe(false);
    if (!('structuredContent' in result) || !result.structuredContent) {
      throw new Error('missing structuredContent');
    }
    expect(result.structuredContent.scenario).toBe('product');
    expect(result.structuredContent.firstTool).toBe('start_product');
  });

  test('新增功能中的规格步骤不会抢占 feature 路由', async () => {
    const projectRoot = makeProjectRoot();
    const intent = '为现有 TypeScript 项目新增一个只读的健康检查摘要功能，需要先生成规格、评估影响范围、补充测试，并在完成后进行收敛检查。';
    const result = await workflow({ intent, project_root: projectRoot });

    expect(result.isError).toBe(false);
    if (!('structuredContent' in result) || !result.structuredContent) {
      throw new Error('missing structuredContent');
    }
    expect(result.structuredContent.scenario).toBe('feature');
    expect(result.structuredContent.firstTool).toBe('start_feature');
    expect(result.structuredContent.firstToolArgsHint).toEqual({
      description: intent,
      spec_layout: 'auto',
    });
  });

  test('Bug 意图返回 start_bugfix', async () => {
    const projectRoot = makeProjectRoot();
    const result = await workflow({ intent: '修复支付接口 500 错误', scenario: 'bugfix', project_root: projectRoot });

    expect(result.isError).toBe(false);
    if (!('structuredContent' in result) || !result.structuredContent) {
      throw new Error('missing structuredContent');
    }
    expect(result.structuredContent.firstTool).toBe('start_bugfix');
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
    expect(String(result.content[0].text)).toContain('not-a-real-scenario');
    expect(fs.existsSync(path.join(projectRoot, '.agents'))).toBe(false);
    expect(fs.existsSync(path.join(projectRoot, 'AGENTS.md'))).toBe(false);
  });

  test('scenario 非字符串时在路由前返回类型错误', async () => {
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

  test('多意图冲突时不返回首工具，并暴露可解释候选', async () => {
    const projectRoot = makeProjectRoot();
    const result = await workflow({
      intent: '修复当前架构依赖错误，并重新设计模块边界和数据所有权。',
      project_root: projectRoot,
    });

    expect(result.isError).toBe(false);
    if (!('structuredContent' in result) || !result.structuredContent) {
      throw new Error('missing structuredContent');
    }
    expect(result.structuredContent.scenario).toBe('unknown');
    expect(result.structuredContent.firstTool).toBeNull();
    expect(result.structuredContent.handles).toMatchObject({
      next_tool: null,
      next_action: 'clarify_or_configure',
    });
    expect(result.structuredContent.routingDecision).toMatchObject({
      conflict: true,
      requiresClarification: true,
      selectedScenario: null,
    });
    expect(result.content[0].text).toContain('路由冲突');
    expect(result.content[0].text).toContain('bugfix');
    expect(result.content[0].text).toContain('architecture');
  });
});
