/**
 * 单元测试：start_feature 工具（委托式编排）
 */

import { describe, test, expect } from 'vitest';
import { startFeature } from '../start_feature.js';

describe('start_feature 单元测试', () => {
  test('缺少必填参数时返回错误', async () => {
    const result = await startFeature({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/请提供功能名称和描述|参数错误/i);
  });

  test('复杂需求默认 auto 触发 parent-child 并先生成子规格拆分步骤', async () => {
    const result = await startFeature({
      feature_name: 'mcp-v4',
      description: `MCP v4 架构升级：
- R1 Tool Registry 与 dispatcher
- R2 Canonical Skill 和 delegated workflow
- R3 Memory / Qdrant 学习闭环
- R4 Legacy / Modern 双协议兼容
- R5 Task Runtime、progress 与 cancellation
- R6 conformance 兼容测试矩阵`,
    });

    expect(result.isError).toBe(false);
    const structured = (result as any).structuredContent;
    const plan = structured.metadata.plan;
    const decompositionStep = plan.steps.find((step: any) => step.id === 'decompose-spec');
    const specStep = plan.steps.find((step: any) => step.tool === 'add_feature');

    expect(structured.metadata.layoutDecision.resolved).toBe('parent-child');
    expect(decompositionStep?.type).toBe('agent_action');
    expect(decompositionStep?.action).toMatch(/拆分为 2-8 个/);
    expect(specStep.args.spec_layout).toBe('parent-child');
    expect(specStep.args.subspecs).toMatch(/decompose-spec/);
    expect(specStep.outputs).toContain('docs/specs/mcp-v4/spec-manifest.json');
    expect(specStep.outputs).toContain('docs/specs/mcp-v4/subspecs/<subspec-id>/spec.md');
  });

  test('未显式布局但提供 subspecs 时自动采用 parent-child', async () => {
    const result = await startFeature({
      feature_name: 'commerce-v3',
      description: '商业系统版本升级',
      subspecs: [
        { id: 'foundation', title: '基础能力', fr: ['FR-1'] },
        { id: 'orders', title: '订单能力', fr: ['FR-2'], dependsOn: ['foundation'] },
      ],
    });

    expect(result.isError).toBe(false);
    const plan = (result as any).structuredContent.metadata.plan;
    const specStep = plan.steps.find((step: any) => step.tool === 'add_feature');
    expect(specStep.args.spec_layout).toBe('parent-child');
    expect(plan.steps.some((step: any) => step.id === 'decompose-spec')).toBe(false);
  });

  test('返回委托式执行计划（steps）', async () => {
    const result = await startFeature({
      feature_name: 'user-auth',
      description: '用户认证功能',
      docs_dir: 'docs',
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
    expect(plan.contractVersion).toBe('2.0.0');
    expect(plan.workflow).toBe('feature');
    expect(plan.planId).toMatch(/^feature-/);
    expect(plan.globalRules).toContain('check_spec 未通过前不得进入实现阶段');
    expect(Array.isArray(plan.steps)).toBe(true);
    expect(plan.steps.length).toBeGreaterThanOrEqual(3);

    const tools = plan.steps.map((step: any) => step.tool);
    expect(tools).toContain('init_project_context');
    expect(tools).toContain('add_feature');
    expect(tools).toContain('estimate');

    const contextStep = plan.steps.find((step: any) => step.tool === 'init_project_context');
    expect(contextStep.type).toBe('tool');
    expect(contextStep.expectedOutputs).toEqual(contextStep.outputs);
    expect(contextStep.outputs).toContain('AGENTS.md');
    expect(contextStep.outputs).toContain('docs/graph-insights/latest.md');
    expect(contextStep.outputs).toContain('docs/graph-insights/latest.json');
    expect(contextStep.when).toMatch(/graph-insights\/latest\.md/);
    expect(contextStep.note).toMatch(/兼容老项目|补齐/);

    const specStep = plan.steps.find((step: any) => step.tool === 'add_feature');
    expect(specStep.args.feature_name).toBe('user-auth');
    expect(specStep.args.spec_layout).toBe('flat');
    expect(specStep.outputs).toContain('docs/specs/user-auth/requirements.md');
    expect(structured?.metadata?.graphDocs?.latestMarkdownPath).toBe('docs/graph-insights/latest.md');
    expect(structured?.metadata?.graphContext?.summary).toMatch(/GitNexus|图谱|降级/);
  });

  test('输出文本包含执行计划与关键工具名', async () => {
    const result = await startFeature({
      feature_name: 'user-auth',
      description: '用户认证功能',
    });

    const text = result.content[0].text;
    expect(text).toMatch(/执行计划/);
    expect(text).toMatch(/add_feature/);
    expect(text).toMatch(/estimate/);
    expect(text).toMatch(/graph-insights\/latest\.md/);
    expect(text).toMatch(/任务级收敛/);
    expect(text).toMatch(/project-context\.md/);
  });

  test('template_profile 应该透传到 add_feature 计划', async () => {
    const result = await startFeature({
      feature_name: 'user-auth',
      description: '用户认证功能',
      template_profile: 'strict',
    });

    expect(result.isError).toBe(false);
    expect('structuredContent' in result).toBe(true);
    if (!('structuredContent' in result)) {
      throw new Error('structuredContent 缺失');
    }
    const structured = (result as any).structuredContent;
    const plan = structured?.metadata?.plan;
    expect(plan).toBeTruthy();

    const specStep = plan.steps.find((step: any) => step.tool === 'add_feature');
    expect(specStep.args.template_profile).toBe('strict');
  });

  test('parent-child 布局透传到 add_feature 委托计划', async () => {
    const result = await startFeature({
      feature_name: 'commerce-v2',
      description: 'v2 升级。',
      spec_layout: 'parent-child',
      subspecs: [{ id: '01-foundation', title: '数据底座', fr: ['FR-1'] }],
    });

    expect(result.isError).toBe(false);
    const plan = (result as any).structuredContent.metadata.plan;
    const specStep = plan.steps.find((step: any) => step.tool === 'add_feature');
    expect(specStep.args.spec_layout).toBe('parent-child');
    expect(specStep.args.subspecs).toEqual([
      { id: '01-foundation', title: '数据底座', fr: ['FR-1'] },
    ]);
    expect(specStep.outputs).toContain('docs/specs/commerce-v2/spec-manifest.json');
    expect(specStep.outputs).toContain('docs/specs/commerce-v2/subspecs/01-foundation/spec.md');
    expect(result.content[0].text).toMatch(/"spec_layout": "parent-child"/);
  });

  test('parent-child 拒绝无效的子规格依赖', async () => {
    const result = await startFeature({
      feature_name: 'commerce-v2',
      description: 'v2 升级。',
      spec_layout: 'parent-child',
      subspecs: [{ id: '01-foundation', title: '数据底座', fr: ['FR-1'], dependsOn: ['missing'] }],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/依赖.*无效/);
  });

  test('loop 模式返回需求循环结构', async () => {
    const result = await startFeature({
      feature_name: 'user-auth',
      description: '用户认证功能',
      requirements_mode: 'loop',
      loop_question_budget: 3,
    });

    expect(result.isError).toBe(false);
    expect('structuredContent' in result).toBe(true);
    if (!('structuredContent' in result)) {
      throw new Error('structuredContent 缺失');
    }

    const loop = (result as any).structuredContent;
    expect(loop.mode).toBe('loop');
    expect(loop.round).toBe(1);
    expect(loop.maxRounds).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(loop.openQuestions)).toBe(true);
    expect(loop.openQuestions.length).toBeLessThanOrEqual(3);
    expect(loop.metadata.plan.workflow).toBe('feature');
    expect(loop.metadata.plan.contractVersion).toBe('2.0.0');
  });

  test('拒绝会逃出规格目录的 feature_name', async () => {
    const result = await startFeature({
      feature_name: '../../escape',
      description: '非法路径测试',
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/feature_name|kebab-case/);
  });
});
