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
    expect(result.content[0].text).toContain('start_feature');
    expect(result.structuredContent.handles?.next_tool).toBe('start_feature');
    expect(fs.existsSync(path.join(projectRoot, '.agents/skills/mcp-probe-kit/SKILL.md'))).toBe(true);
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
});
