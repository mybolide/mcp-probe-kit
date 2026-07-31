import { describe, test, expect } from 'vitest';
import { startUi } from '../start_ui.js';

function value(result: Awaited<ReturnType<typeof startUi>>): any {
  if (!('structuredContent' in result)) throw new Error('structuredContent 缺失');
  return result.structuredContent;
}

describe('start_ui 集成测试', () => {
  test('手动模式返回可执行且闭环的指导', async () => {
    const result = await startUi({ description: '登录页面', framework: 'react', mode: 'manual' });
    const text = result.content[0].text || '';
    const plan = value(result).metadata.plan;
    const tools = plan.steps.flatMap((step: any) => step.tool ? [step.tool] : []);

    expect(result.isError).not.toBe(true);
    expect(text).toMatch(/^#\s+快速开始/m);
    expect(text).toMatch(/职责说明/);
    expect(text).toMatch(/失败处理/);
    expect(text).toMatch(/预期输出/);
    expect(tools).toContain('init_project_context');
    expect(tools).toContain('ui_design_system');
    expect(tools).toContain('ui_search');
    expect(tools).not.toContain('manual');
    expect(plan.steps.find((step: any) => step.id === 'catalog').type).toBe('agent_action');
    expect(plan.steps.find((step: any) => step.id === 'render').type).toBe('agent_action');
  });

  test('文本中的 MCP 工具引用与 structured plan 对称', async () => {
    const result = await startUi({ description: '管理后台', framework: 'react', mode: 'manual' });
    const text = result.content[0].text || '';
    const plan = value(result).metadata.plan;
    for (const step of plan.steps) {
      if (step.tool) expect(text).toContain(`\`${step.tool}\``);
    }
    expect(text).not.toMatch(/`init_component_catalog`|`render_ui`|`manual`/);
  });

  test.each(['react', 'vue', 'html'])('支持 %s 框架', async (framework) => {
    const result = await startUi({ description: '设置页面', framework, mode: 'manual' });
    expect(result.isError).not.toBe(true);
    expect(result.content[0].text).toContain(`目标框架：${framework}`);
  });

  test('auto 模式返回结构化推荐与闭环计划', async () => {
    const result = await startUi({ description: '数据分析仪表盘', mode: 'auto' });
    const report = value(result);
    expect(result.isError).not.toBe(true);
    expect(report.metadata.plan.mode).toBe('delegated');
    expect(report.metadata.template).toBeTruthy();
  });

  test('loop 模式不引用隐藏 ask_user', async () => {
    const result = await startUi({ description: '后台页面', requirements_mode: 'loop' });
    const report = value(result);
    const tools = report.metadata.plan.steps.flatMap((step: any) => step.tool ? [step.tool] : []);
    expect(report.mode).toBe('loop');
    expect(tools).not.toContain('ask_user');
    expect(report.metadata.plan.steps.find((step: any) => step.id === 'loop-1').type).toBe('agent_action');
  });

  test('缺少参数时给出可恢复错误', async () => {
    const result = await startUi({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/description|描述|需求/i);
  });

  test('无效模式时给出清晰错误', async () => {
    const result = await startUi({ description: '页面', mode: 'invalid' });
    expect(result.isError).toBe(true);
  });

  test('兼容旧的 description 调用方式', async () => {
    const result = await startUi({ description: '简单页面' });
    expect(result.isError).not.toBe(true);
  });
});
