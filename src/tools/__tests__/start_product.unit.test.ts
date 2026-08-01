import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { startProduct } from '../start_product.js';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

function makeProjectRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'start-product-'));
  tempDirs.push(root);
  return root;
}

describe('start_product', () => {
  test('从 description 的结构化段落提取目标用户和核心约束', async () => {
    const root = makeProjectRoot();
    const result = await startProduct({
      product_name: 'rc4 acceptance product',
      project_root: root,
      description: [
        '目标：为开发团队提供一个只读的项目状态摘要面板。',
        '',
        '目标用户：',
        'TypeScript 项目维护者',
        '',
        '核心约束：',
        '- 不修改业务数据',
        '- 不引入登录系统',
        '- 仅展示已有状态',
      ].join('\n'),
    });

    expect(result.isError).toBe(false);
    if (!('structuredContent' in result) || !result.structuredContent) {
      throw new Error('missing structuredContent');
    }
    const metadata = result.structuredContent.metadata as Record<string, unknown>;
    expect(metadata.productBrief).toEqual({
      targetUsers: 'TypeScript 项目维护者',
      constraints: '不修改业务数据；不引入登录系统；仅展示已有状态',
    });
    const plan = metadata.plan as Record<string, unknown>;
    expect(plan.workflowVersion).toBe('4.0.0');
    expect(result.content[0]?.text).toContain('目标用户：TypeScript 项目维护者');
  });

  test('显式参数优先于 description 提取结果', async () => {
    const root = makeProjectRoot();
    const result = await startProduct({
      product_name: 'explicit product',
      project_root: root,
      description: '目标用户：旧用户\n核心约束：旧约束',
      target_users: '显式用户',
      constraints: '显式约束',
    });

    expect(result.isError).toBe(false);
    if (!('structuredContent' in result) || !result.structuredContent) {
      throw new Error('missing structuredContent');
    }
    const metadata = result.structuredContent.metadata as Record<string, unknown>;
    expect(metadata.productBrief).toEqual({
      targetUsers: '显式用户',
      constraints: '显式约束',
    });
  });
});
