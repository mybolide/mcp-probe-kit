/**
 * 单元测试：start_ui 工具
 * 
 * 测试具体的功能点、边界情况和错误条件
 */

import { describe, test, expect } from 'vitest';
import { startUi } from '../start_ui.js';

describe('start_ui 单元测试', () => {
  describe('任务 7.3: 错误处理', () => {
    test('缺少描述参数时返回错误', async () => {
      const result = await startUi({});
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/缺少必要参数|Missing required parameter/i);
      expect(result.content[0].text).toMatch(/用法|Usage/i);
    });

    test('空描述参数时返回错误', async () => {
      const result = await startUi({ description: '' });
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/缺少必要参数|Missing required parameter/i);
    });

    test('无效 mode 值时返回错误', async () => {
      const result = await startUi({ 
        description: '测试',
        mode: 'invalid'
      });
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/无效的模式|Invalid mode/i);
      expect(result.content[0].text).toMatch(/auto.*manual/i);
    });

    test('错误响应包含使用示例', async () => {
      const result = await startUi({});
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/示例|Example/i);
      expect(result.content[0].text).toMatch(/start_ui/);
    });
  });

  describe('参数解析', () => {
    test('默认 framework 为 html（最通用）', async () => {
      const result = await startUi({ description: '测试' });
      
      expect(result.content[0].text).toMatch(/html/i);
    });

    test('支持 vue framework', async () => {
      const result = await startUi({ 
        description: '测试',
        framework: 'vue'
      });
      
      expect(result.content[0].text).toMatch(/vue/i);
    });

    test('支持 html framework', async () => {
      const result = await startUi({ 
        description: '测试',
        framework: 'html'
      });
      
      expect(result.content[0].text).toMatch(/html/i);
    });

    test('自动生成模板名称', async () => {
      const result = await startUi({ description: '登录页面' });
      
      // 应该生成类似 login 的模板名
      expect(result.content[0].text).toMatch(/login|登录/i);
    });
  });

  describe('模板档位', () => {
    test('auto 模式可自动选择 strict', async () => {
      const result = await startUi({
        description: `# 页面目标
需要一个带筛选和批量操作的管理后台，用于管理订单与用户数据，包含导出与权限控制。

## 关键交互
1. 支持筛选、排序、分页、导出
2. 批量启用/禁用、批量标签、批量删除

## 数据来源
来自订单服务与用户服务接口，刷新频率 30s

## 状态
空态、加载态、错误态、无权限提示、空筛选结果`,
        template_profile: 'auto',
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toMatch(/模板档位:\s*strict/);
    });

    test('显式 guided 生效', async () => {
      const result = await startUi({
        description: '简单页面',
        template_profile: 'guided',
      });

      expect(result.isError).not.toBe(true);
      expect('structuredContent' in result).toBe(true);
      if (!('structuredContent' in result)) {
        throw new Error('structuredContent 缺失');
      }
      const structured = (result as any).structuredContent;
      const template = structured?.metadata?.template;
      expect(template?.profile).toBe('guided');
    });
  });

  describe('模式参数', () => {
    test('默认模式为 manual', async () => {
      const result = await startUi({ description: '测试' });
      
      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toMatch(/快速开始|Quick Start/i);
    });

    test('显式 manual 模式返回指导', async () => {
      const result = await startUi({ 
        description: '测试',
        mode: 'manual'
      });
      
      expect(result.isError).not.toBe(true);
      expect(result.content[0].text).toMatch(/快速开始|Quick Start/i);
    });

    test('auto 模式返回智能计划', async () => {
      const result = await startUi({ 
        description: '测试',
        mode: 'auto'
      });
      
      expect(result.isError).toBe(false);
      expect('structuredContent' in result).toBe(true);
      const structured = (result as any).structuredContent;
      expect(structured.summary).toMatch(/智能 UI 开发/i);
      expect(structured.metadata.plan.steps.length).toBeGreaterThanOrEqual(7);
    });
  });

  describe('输出格式', () => {
    test('返回有效的 markdown', async () => {
      const result = await startUi({ description: '测试' });
      
      const text = result.content[0].text;
      
      // 应该包含 markdown 标题
      expect(text).toMatch(/^#/m);
      
      // 应该包含代码块
      expect(text).toMatch(/```/);
    });

    test('包含所有必需的步骤', async () => {
      const result = await startUi({ description: '测试' });
      
      expect('structuredContent' in result).toBe(true);
      const structured = (result as any).structuredContent;
      const stepIds = structured.metadata.plan.steps.map((step: any) => step.id);

      expect(stepIds).toEqual(expect.arrayContaining([
        'context',
        'design-system',
        'catalog',
        'structure',
        'save-structure',
        'render',
        'capture-desktop',
        'capture-mobile',
        'visual-review',
        'visual-iterate',
        'visual-acceptance',
        'update-context',
      ]));
      expect(result.content[0].text).toContain('structuredContent.metadata.plan.steps');
    });

    test('包含高级选项部分', async () => {
      const result = await startUi({ description: '测试' });
      
      const text = result.content[0].text;
      
      expect(text).toMatch(/高级选项|Advanced Options/i);
    });
  });

  describe('正式交付闭环', () => {
    test.each([
      ['manual', { description: '订单审批页', framework: 'html', mode: 'manual' }],
      ['auto', { description: '订单审批页', framework: 'html', mode: 'auto' }],
      ['loop', { description: '订单审批页', framework: 'html', requirements_mode: 'loop', loop_question_budget: 2 }],
    ])('%s 模式使用同一 Delegated Plan Contract', async (_name, input) => {
      const result = await startUi(input);
      expect(result.isError).not.toBe(true);
      const structured = (result as any).structuredContent;
      const plan = structured.metadata.plan;
      const ids = plan.steps.map((step: any) => step.id);

      expect(plan.contractVersion).toBe('2.0.0');
      expect(plan.workflow).toBe('ui');
      expect(plan.planId).toMatch(/^ui-/);
      expect(plan.declaredScope.projectRoot).toBeTruthy();
      expect(plan.requiredEvidenceKinds).toEqual([
        'requirements',
        'implementation',
        'test',
        'review',
      ]);
      expect(plan.qualityGates).toEqual(expect.arrayContaining([
        'ui-visual-acceptance',
        'ui-responsive-acceptance',
        'ui-state-coverage',
        'ui-test-suite',
        'ui-code-review',
      ]));
      expect(ids).toEqual(expect.arrayContaining([
        'render',
        'capture-desktop',
        'capture-mobile',
        'visual-acceptance',
        'state-acceptance',
        'test',
        'review',
        'architecture-drift',
        'update-context',
      ]));
      expect(result.content[0].text).toContain('plan_heartbeat');
      expect(result.content[0].text).toContain('resume_plan');
      expect(result.content[0].text).toContain('converge');
    });

    test('UI 步骤依赖、验收门禁和报告摘要来自同一计划', async () => {
      const result = await startUi({
        description: '订单审批页',
        framework: 'html',
        mode: 'manual',
      });
      const structured = (result as any).structuredContent;
      const plan = structured.metadata.plan;
      const byId = new Map<string, any>(
        plan.steps.map((step: any) => [step.id, step] as [string, any]),
      );

      expect(byId.get('context').dependsOn).toHaveLength(1);
      expect(byId.get('structure').dependsOn).toEqual(['catalog']);
      expect(byId.get('render').dependsOn).toEqual(['save-structure']);
      expect(byId.get('visual-review').dependsOn).toEqual(['capture-desktop', 'capture-mobile']);
      expect(byId.get('state-acceptance').dependsOn).toEqual(['visual-acceptance']);
      expect(byId.get('test').dependsOn).toEqual(['state-acceptance']);
      expect(byId.get('review')).toMatchObject({
        tool: 'code_review',
        dependsOn: ['test'],
      });
      expect(byId.get('architecture-drift')).toMatchObject({
        tool: 'architecture',
        dependsOn: ['review'],
      });
      expect(byId.get('architecture-drift').when).toContain('ArchitectureCandidate');
      expect(structured.steps).toHaveLength(plan.steps.length);
      expect(structured.nextSteps.at(-1)).toContain('converge');
    });
  });

  describe('视觉方向契约', () => {
    test('auto 模式把视觉方向参数传入计划并暴露验收目标', async () => {
      const result = await startUi({
        description: '专业交易员使用的机会雷达与模拟盘管理首页',
        framework: 'react',
        mode: 'auto',
        target_audience: '专业交易员',
        screen_type: 'professional-dashboard',
        visual_direction: 'editorial-precision',
        density: 'compact',
        brand_personality: '精准,可信,克制',
        references: 'Linear,Apple',
        avoid: '卡片瀑布,大标题',
        target_score: 8.8,
      });

      expect(result.isError).toBe(false);
      const structured = (result as any).structuredContent;
      const direction = structured.metadata.visualDirection;
      expect(direction.contractVersion).toBe('2.0');
      expect(direction.direction.id).toBe('editorial-precision');
      expect(direction.objective.density).toBe('compact');
      expect(direction.acceptance.targetScore).toBe(8.8);

      const designStep = structured.metadata.plan.steps.find((step: any) => step.id === 'design-system');
      expect(designStep.args).toMatchObject({
        screen_type: 'professional-dashboard',
        visual_direction: 'editorial-precision',
        density: 'compact',
        target_score: 8.8,
      });
      expect(structured.designSystem.colors.accent).toMatch(/^oklch\(/);
      expect(structured.metadata.reviewPolicy).toMatchObject({
        maxRounds: 3,
        targetScore: 8.8,
        requiredViewports: ['1440x900', '390x844'],
      });

      const steps = structured.metadata.plan.steps;
      const structureStep = steps.find((step: any) => step.id === 'structure');
      expect(structureStep.args).toMatchObject({
        mode: 'structure',
        screen_type: 'professional-dashboard',
        density: 'compact',
      });
      const desktopStep = steps.find((step: any) => step.id === 'capture-desktop');
      const mobileStep = steps.find((step: any) => step.id === 'capture-mobile');
      const reviewStep = steps.find((step: any) => step.id === 'visual-review');
      const iterateStep = steps.find((step: any) => step.id === 'visual-iterate');
      const acceptanceStep = steps.find((step: any) => step.id === 'visual-acceptance');
      expect(desktopStep.outputs).toEqual(['artifacts/ui-review/专业交易员使用的机会雷达与模拟盘管理首页/desktop-1440x900.png']);
      expect(mobileStep.outputs).toEqual(['artifacts/ui-review/专业交易员使用的机会雷达与模拟盘管理首页/mobile-390x844.png']);
      expect(reviewStep.outputs).toEqual(['artifacts/ui-review/专业交易员使用的机会雷达与模拟盘管理首页/visual-review.json']);
      expect(iterateStep.note).toContain('每轮必须基于新截图重新评分');
      expect(acceptanceStep.note).toContain('无阻断项');
      expect(result.content[0].text).toContain('设计方向：Editorial Precision');
    });

    test('视觉迭代轮次限制在 1 到 5', async () => {
      const high = await startUi({ description: '订单审批工作台', review_max_rounds: 99 });
      const low = await startUi({ description: '订单审批工作台', review_max_rounds: 0 });

      expect((high as any).structuredContent.metadata.reviewPolicy.maxRounds).toBe(5);
      expect((low as any).structuredContent.metadata.reviewPolicy.maxRounds).toBe(1);
    });


    test('React 栈在页面结构确定后只搜索 shadcn 基础组件', async () => {
      const result = await startUi({
        description: '订单审批工作台',
        framework: 'react',
        mode: 'auto',
        screen_type: 'workflow-console',
      });
      const steps = (result as any).structuredContent.metadata.plan.steps;
      const ids = steps.map((step: any) => step.id);
      expect(ids).not.toContain('shadcn-blocks');
      expect(ids).toContain('shadcn-components');
      expect(ids.indexOf('shadcn-components')).toBeGreaterThan(ids.indexOf('save-structure'));
      expect(ids.indexOf('shadcn-components')).toBeLessThan(ids.indexOf('render'));
      const componentStep = steps.find((step: any) => step.id === 'shadcn-components');
      expect(componentStep.args.category).toBe('shadcn-components');
      expect(componentStep.note).toContain('不使用整页 block 覆盖');
    });

  });

});
