import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { checkSpec } from '../check_spec.js';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

function writeFile(root: string, relativePath: string, content: string): void {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function makeParentChildSpec(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'parent-child-spec-'));
  tempDirs.push(root);
  const base = 'docs/specs/commerce-v2';
  writeFile(root, `${base}/README.md`, '# 母规格\n## 原则\n保持兼容。\n## 子规格索引\n- 01-foundation\n## 依赖关系\n无。\n## 里程碑\n先完成底座。');
  writeFile(root, `${base}/requirements.md`, '# 需求\n## 功能概述\n## 需求列表\n### FR-1\n## 非功能需求\n## 依赖关系');
  writeFile(root, `${base}/design.md`, '# 设计\n## 概述\nFR-1\n## 技术方案\n## 文件结构');
  writeFile(root, `${base}/tasks.md`, '# 任务\n## 交付物清单\n## 任务列表\n## 需求覆盖矩阵\nFR-1\n## 文件变更清单\n## 子规格任务覆盖矩阵\n- 01-foundation/1.1');
  writeFile(root, `${base}/spec-manifest.json`, JSON.stringify({
    layout: 'parent-child',
    subspecs: [{ id: '01-foundation', title: '数据底座', fr: ['FR-1'] }],
  }));
  writeFile(root, `${base}/subspecs/01-foundation/spec.md`, '# 子规格\n## 范围\n实现数据底座。\n## 需求回链\nFR-1\nWHEN 请求 THEN 系统 SHALL 执行。\n## 涉及文件\n- src/example.ts\n## 不做项\n- 不做导出');
  writeFile(root, `${base}/subspecs/01-foundation/tasks.md`, '# 子任务\n- [ ] 1.1 实现底座\n  - 证据块: src/example.ts:1\n  - _需求: FR-1_');
  return root;
}

describe('check_spec parent-child', () => {
  test('递归读取 Agent 落盘的子规格并通过校验', async () => {
    const root = makeParentChildSpec();
    const result = await checkSpec({ feature_name: 'commerce-v2', project_root: root });

    expect(result.isError).toBe(false);
    expect((result as any).structuredContent.passed).toBe(true);
    expect(result.content[0].text).toMatch(/01-foundation/);
  });

  test('母任务矩阵未引用子任务时校验失败', async () => {
    const root = makeParentChildSpec();
    const tasksPath = path.join(root, 'docs/specs/commerce-v2/tasks.md');
    fs.writeFileSync(tasksPath, fs.readFileSync(tasksPath, 'utf8').replace('01-foundation/1.1', ''));

    const result = await checkSpec({ feature_name: 'commerce-v2', project_root: root });
    expect((result as any).structuredContent.passed).toBe(false);
    expect((result as any).structuredContent.issues).toContainEqual(
      expect.objectContaining({ code: 'unreferenced_subspec_task' }),
    );
  });

  test('拒绝 feature_name 逃出 docs/specs 目录', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-spec-traversal-'));
    tempDirs.push(root);
    writeFile(root, 'escape/requirements.md', '# 需求\n## 功能概述\n## 需求列表\nFR-1 SHALL work\n## 非功能需求\n## 依赖关系');
    writeFile(root, 'escape/design.md', '# 设计\n## 概述\nFR-1\n## 技术方案\n## 文件结构');
    writeFile(root, 'escape/tasks.md', '# 任务\n## 交付物清单\n## 任务列表\n## 需求覆盖矩阵\nFR-1\n## 文件变更清单');

    const result = await checkSpec({ feature_name: '../../escape', project_root: root });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/feature_name|规格目录|非法路径/);
  });
});
