import { describe, test, expect } from 'vitest';
import { startFeature } from '../start_feature.js';

function structured(result: Awaited<ReturnType<typeof startFeature>>): any {
  if (!('structuredContent' in result)) throw new Error('structuredContent 缺失');
  return result.structuredContent;
}

describe('start_feature 单元测试', () => {
  test('缺少必填参数时返回错误', async () => {
    const result = await startFeature({});
    expect(result.isError).toBe(true);
  });

  test('复杂需求默认 auto 触发 parent-child 并要求先拆分再回到 start_feature', async () => {
    const result = await startFeature({
      feature_name: 'mcp-v4',
      description: '跨模块协议、工具注册、Memory、Task Runtime 和兼容性矩阵的多阶段升级',
    });
    const value = structured(result);
    const plan = value.metadata.plan;
    const decomposition = plan.steps.find((step: any) => step.id === 'decompose-spec');
    const resume = plan.steps.find((step: any) => step.id === 'resume-with-subspecs');

    expect(value.metadata.layoutDecision.resolved).toBe('parent-child');
    expect(decomposition.type).toBe('agent_action');
    expect(resume.tool).toBe('start_feature');
    expect(resume.args.spec_layout).toBe('parent-child');
    expect(resume.args.subspecs).toMatch(/SubspecDefinition/);
    expect(plan.steps.some((step: any) => step.tool === 'add_feature')).toBe(false);
  });

  test('提供 subspecs 时生成内嵌 parent-child 规格草稿', async () => {
    const result = await startFeature({
      feature_name: 'commerce-v3',
      description: '商业系统版本升级',
      subspecs: [
        { id: 'foundation', title: '基础能力', fr: ['FR-1'] },
        { id: 'orders', title: '订单能力', fr: ['FR-2'], dependsOn: ['foundation'] },
      ],
    });
    const value = structured(result);
    const plan = value.metadata.plan;
    expect(value.metadata.layoutDecision.resolved).toBe('parent-child');
    expect(value.metadata.specDraft).toBeTruthy();
    expect(plan.steps.some((step: any) => step.id === 'write-spec')).toBe(true);
    expect(plan.steps.some((step: any) => step.id === 'decompose-spec')).toBe(false);
    expect(plan.steps.some((step: any) => step.tool === 'add_feature')).toBe(false);
  });

  test('flat 计划闭环且只引用 compact 可见工具', async () => {
    const result = await startFeature({
      feature_name: 'user-auth',
      description: '用户认证功能',
      docs_dir: 'docs',
    });
    const value = structured(result);
    const plan = value.metadata.plan;
    const tools = plan.steps.flatMap((step: any) => step.tool ? [step.tool] : []);
    const writeSpec = plan.steps.find((step: any) => step.id === 'write-spec');

    expect(plan.mode).toBe('delegated');
    expect(plan.contractVersion).toBe('2.0.0');
    expect(tools).toContain('init_project_context');
    expect(tools).toContain('check_spec');
    expect(tools).toContain('estimate');
    expect(tools).not.toContain('add_feature');
    expect(writeSpec.type).toBe('agent_action');
    expect(writeSpec.expectedOutputs).toContain('docs/specs/user-auth/requirements.md');
    expect(value.metadata.specDraft.structuredContent).toBeTruthy();
  });

  test('输出文本由 structured plan 渲染且没有隐藏工具指导', async () => {
    const result = await startFeature({ feature_name: 'user-auth', description: '用户认证功能' });
    const text = result.content[0].text;
    expect(text).toMatch(/执行计划/);
    expect(text).toMatch(/check_spec/);
    expect(text).toMatch(/estimate/);
    expect(text).toMatch(/graph-insights\/latest\.md/);
    expect(text).toMatch(/structuredContent\.metadata\.specDraft/);
    expect(text).not.toMatch(/调用 MCP 工具.*add_feature/);
  });

  test('template_profile 被内嵌规格草稿采用', async () => {
    const result = await startFeature({
      feature_name: 'user-auth',
      description: '用户认证功能',
      template_profile: 'strict',
    });
    const value = structured(result);
    expect(value.metadata.specDraft.templateProfile).toBe('strict');
  });

  test('parent-child 布局与 subspecs 被内嵌规格草稿采用', async () => {
    const result = await startFeature({
      feature_name: 'commerce-v2',
      description: 'v2 版本升级',
      spec_layout: 'parent-child',
      subspecs: [{ id: '01-foundation', title: '数据底座', fr: ['FR-1'] }],
    });
    const value = structured(result);
    const draft = value.metadata.specDraft;
    expect(draft.specLayout).toBe('parent-child');
    expect(draft.subspecs).toEqual([{ id: '01-foundation', title: '数据底座', fr: ['FR-1'] }]);
    expect(draft.specOutputs).toContain('docs/specs/commerce-v2/subspecs/01-foundation/spec.md');
  });

  test('parent-child 拒绝无效子规格依赖', async () => {
    const result = await startFeature({
      feature_name: 'commerce-v2',
      description: 'v2 版本升级',
      spec_layout: 'parent-child',
      subspecs: [{ id: '01-foundation', title: '数据底座', fr: ['FR-1'], dependsOn: ['missing'] }],
    });
    expect(result.isError).toBe(true);
  });

  test('loop 模式使用 Agent 原生澄清并回到可见 start_feature', async () => {
    const result = await startFeature({
      feature_name: 'user-auth',
      description: '用户认证功能',
      requirements_mode: 'loop',
      loop_question_budget: 3,
    });
    const value = structured(result);
    const tools = value.metadata.plan.steps.flatMap((step: any) => step.tool ? [step.tool] : []);
    expect(value.mode).toBe('loop');
    expect(tools).toContain('start_feature');
    expect(tools).not.toContain('ask_user');
    expect(value.metadata.plan.steps.find((step: any) => step.id === 'loop-1').type).toBe('agent_action');
  });

  test('拒绝逃出规格目录的 feature_name', async () => {
    const result = await startFeature({ feature_name: '../../escape', description: '非法路径测试' });
    expect(result.isError).toBe(true);
  });
});
