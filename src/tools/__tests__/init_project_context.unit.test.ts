import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { initProjectContext } from '../init_project_context.js';

describe('init_project_context 单元测试', () => {
  test('返回 delegated plan，含 finalize-agents-md 与 AGENTS.md 模板', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-probe-kit-init-'));
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
    expect(structured.documentation.some((item: any) => item.path === 'AGENTS.md')).toBe(true);
    expect(structured.documentation.some((item: any) => item.path === 'docs/graph-insights/latest.md')).toBe(true);
    expect(structured.metadata?.layout?.indexPath).toBe('AGENTS.md');
    expect(structured.metadata?.agentsMdTemplate).toMatch(/mcp-probe:context begin/);
    expect(structured.metadata?.manifestWritten).toBe('docs/.mcp-probe/layout.json');
    expect(fs.existsSync(path.join(projectRoot, 'docs', '.mcp-probe', 'layout.json'))).toBe(true);

    const plan = structured.metadata?.plan;
    expect(plan?.mode).toBe('delegated');
    expect(plan.steps.map((step: any) => step.id)).toEqual([
      'write-modular-docs',
      'bootstrap-code-insight',
      'persist-graph-docs',
      'finalize-agents-md',
    ]);
    expect(plan.steps[0].outputs).toContain('docs/project-context.md');
    expect(plan.steps[3].id).toBe('finalize-agents-md');
  });

  test('输出文本包含 AGENTS.md 与 MCP 触发规则', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-probe-kit-init-'));
    const result = await initProjectContext({
      project_root: projectRoot,
    });

    const text = result.content[0].text;
    expect(text).toMatch(/AGENTS\.md/);
    expect(text).toMatch(/start_feature/);
    expect(text).toMatch(/finalize-agents-md/);
  });

  test('已存在 project-context 分类文档时跳过重写 modular', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-probe-kit-context-'));
    fs.mkdirSync(path.join(projectRoot, 'docs', 'project-context'), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, 'docs', 'project-context.md'), '# existing context\n', 'utf8');

    const result = await initProjectContext({
      docs_dir: 'docs',
      project_root: projectRoot,
    });

    expect(result.isError).toBeFalsy();
    const structured = (result as any).structuredContent;
    expect(structured.metadata?.legacyProjectContextExists).toBe(true);
    expect(structured.metadata?.plan?.steps.map((step: any) => step.id)).toEqual([
      'bootstrap-code-insight',
      'persist-graph-docs',
      'finalize-agents-md',
    ]);

    const text = result.content[0].text;
    expect(text).toMatch(/保留/);
  });

  test('已有 AGENTS.md 用户内容时 prepend merge', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-probe-kit-agents-'));
    fs.writeFileSync(path.join(projectRoot, 'AGENTS.md'), '# Custom rules\n', 'utf8');

    const result = await initProjectContext({ project_root: projectRoot });
    const structured = (result as any).structuredContent;
    expect(structured.metadata?.agentsMdMergeMode).toBe('prepended');
    expect(structured.metadata?.agentsMdTemplate).toMatch(/<!-- mcp-probe:context begin/);
    expect(structured.metadata?.agentsMdTemplate).toContain('# Custom rules');
  });
});
