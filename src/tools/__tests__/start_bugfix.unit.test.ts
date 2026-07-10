/**
 * 单元测试：start_bugfix 工具（委托式编排）
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, test, expect } from 'vitest';
import { startBugfix } from '../start_bugfix.js';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('start_bugfix 单元测试', () => {
  test('缺少必填参数时返回错误', async () => {
    const result = await startBugfix({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/缺少必填参数|错误信息/i);
  });

  test('description 可作为 error_message 别名', async () => {
    const result = await startBugfix({
      description: 'memory-config 读取 items 时未做空值检查导致 map 报错',
      analysis_mode: 'src8',
    });

    expect(result.isError).toBe(false);
    const structured = (result as any).structuredContent;
    const src8Step = structured?.metadata?.plan?.steps?.find((step: any) => step.id === 'src8-1');
    expect(src8Step?.action).toMatch(/明确差距/);
    expect(result.content[0].text).toMatch(/memory-config/);
    expect(result.content[0].text).not.toMatch(/docs\/src8-methodology/);
  });

  test('返回委托式执行计划（steps）', async () => {
    const result = await startBugfix({
      error_message: 'TypeError: Cannot read property',
      stack_trace: 'at index.ts:12:3',
    });

    expect(result.isError).toBe(false);
    expect('structuredContent' in result).toBe(true);
    if (!('structuredContent' in result)) {
      throw new Error('structuredContent 缺失');
    }

    const structured = (result as any).structuredContent;
    const plan = structured?.metadata?.plan;
    expect(plan).toBeTruthy();
    expect(plan.mode).toBe('delegated');
    expect(Array.isArray(plan.steps)).toBe(true);
    expect(structured.analysisMode).toBe('src8');
    expect(structured.tbp.rootCauseStatement).toMatch(/A \+ B|因果句|待形成/);

    const fixStep = plan.steps.find((step: any) => step.id === 'src8-4');
    expect(fixStep).toBeTruthy();
    expect(fixStep.action).toMatch(/把握真因/);
    const gentestStep = plan.steps.find((step: any) => step.id === 'src8-7');
    expect(gentestStep?.tool).toBe('gentest');
    const contextStep = plan.steps.find((step: any) => step.tool === 'init_project_context');
    expect(contextStep.outputs).toContain('docs/graph-insights/latest.md');
    expect(contextStep.outputs).toContain('docs/graph-insights/latest.json');
    expect(contextStep.when).toMatch(/graph-insights\/latest\.md/);
    expect(contextStep.note).toMatch(/兼容老项目|补齐/);
    expect(structured?.metadata?.graphDocs?.latestMarkdownPath).toBe('docs/graph-insights/latest.md');
    expect(structured?.metadata?.graphContext?.summary).toMatch(/GitNexus|图谱|降级/);
  });

  test('关联规格存在时计划包含 check_spec 闸门', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bugfix-spec-'));
    tempDirs.push(root);
    const featureName = 'checkout-flow';
    const specDir = path.join(root, 'docs', 'specs', featureName);
    fs.mkdirSync(specDir, { recursive: true });
    fs.writeFileSync(path.join(specDir, 'requirements.md'), '# requirements\n');

    const result = await startBugfix({
      error_message: 'checkout total wrong',
      feature_name: featureName,
      docs_dir: 'docs',
      project_root: root,
    });

    expect(result.isError).toBe(false);
    const structured = (result as any).structuredContent;
    const checkStep = structured?.metadata?.plan?.steps?.find((step: any) => step.tool === 'check_spec');
    expect(checkStep).toBeTruthy();
    expect(checkStep.args.feature_name).toBe(featureName);
    expect(structured.metadata.specGate.featureName).toBe(featureName);
    expect(result.content[0].text).toMatch(/check_spec|规格闸门/);
  });

  test('loop 模式返回需求循环结构', async () => {
    const result = await startBugfix({
      error_message: 'NullReference',
      requirements_mode: 'loop',
      loop_question_budget: 2,
    });

    expect(result.isError).toBe(false);
    expect('structuredContent' in result).toBe(true);
    if (!('structuredContent' in result)) {
      throw new Error('structuredContent 缺失');
    }

    const loop = (result as any).structuredContent;
    expect(loop.mode).toBe('loop');
    expect(loop.round).toBe(1);
    expect(Array.isArray(loop.openQuestions)).toBe(true);
    expect(loop.openQuestions.length).toBeLessThanOrEqual(2);
  });

  test('template_profile 自动选择 strict（结构化输入）', async () => {
    const result = await startBugfix({
      error_message: `## 复现步骤
1. 打开登录页
2. 输入错误账号
3. 点击登录

## 期望
提示错误信息并保持页面可交互

## 实际
页面白屏，控制台报错

## 环境
- 浏览器: Chrome 120
- 系统: Windows 11
- 版本: v2.3.0`,
      stack_trace: 'TypeError: Cannot read property',
      template_profile: 'auto',
    });

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toMatch(/模板档位:\s*strict/);
  });

  test('template_profile 显式 guided 生效', async () => {
    const result = await startBugfix({
      error_message: '简单错误',
      template_profile: 'guided',
    });

    expect(result.isError).toBe(false);
    expect('structuredContent' in result).toBe(true);
    if (!('structuredContent' in result)) {
      throw new Error('structuredContent 缺失');
    }

    const structured = (result as any).structuredContent;
    const template = structured?.metadata?.template;
    expect(template?.profile).toBe('guided');
  });
});
