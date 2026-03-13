import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { initProjectContext } from '../init_project_context.js';

describe('init_project_context 单元测试', () => {
  test('返回 delegated plan，并预置 code_insight 图谱初始化步骤', async () => {
    const result = await initProjectContext({
      docs_dir: 'docs',
      project_root: 'E:/workspace/github/mcp-probe-kit',
    });

    expect(result.isError).toBeFalsy();
    expect('structuredContent' in result).toBe(true);
    if (!('structuredContent' in result)) {
      throw new Error('structuredContent 缺失');
    }

    const structured = (result as any).structuredContent;
    expect(structured.documentation.some((item: any) => item.path === 'docs/graph-insights/latest.md')).toBe(true);
    expect(structured.documentation.some((item: any) => item.path === 'docs/graph-insights/latest.json')).toBe(true);
    expect(structured.metadata?.graphDocs?.latestMarkdownFilePath).toContain('/docs/graph-insights/latest.md');

    const plan = structured.metadata?.plan;
    expect(plan?.mode).toBe('delegated');
    expect(plan.steps.map((step: any) => step.id)).toEqual([
      'write-project-context',
      'bootstrap-code-insight',
      'persist-graph-docs',
    ]);
    expect(plan.steps[1].action).toMatch(/code_insight/);
  });

  test('输出文本包含 graph-insights 入口和 delegated plan', async () => {
    const result = await initProjectContext({
      docs_dir: 'docs',
      project_root: 'E:/workspace/github/mcp-probe-kit',
    });

    const text = result.content[0].text;
    expect(text).toMatch(/graph-insights\/latest\.md/);
    expect(text).toMatch(/delegated plan/);
    expect(text).toMatch(/code_insight/);
  });

  test('已存在 project-context.md 时不再规划重写上下文文档', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-probe-kit-context-'));
    fs.mkdirSync(path.join(projectRoot, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'docs', 'project-context.md'), '# existing context\n', 'utf8');

    const result = await initProjectContext({
      docs_dir: 'docs',
      project_root: projectRoot,
    });

    expect(result.isError).toBeFalsy();
    expect('structuredContent' in result).toBe(true);
    if (!('structuredContent' in result)) {
      throw new Error('structuredContent 缺失');
    }

    const structured = (result as any).structuredContent;
    expect(structured.metadata?.projectContextExists).toBe(true);
    expect(structured.metadata?.plan?.steps.map((step: any) => step.id)).toEqual([
      'bootstrap-code-insight',
      'persist-graph-docs',
    ]);

    const text = result.content[0].text;
    expect(text).toMatch(/已存在（将保留，不覆盖）/);
    expect(text).toMatch(/不要重写/);
  });
});
