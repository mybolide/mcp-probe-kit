import { describe, expect, it } from 'vitest';
import { searchUiStructures } from '../ui-structure-search.js';

describe('ui-structure-search', () => {
  it('专业监控看板优先返回 Signal Workbench', () => {
    const matches = searchUiStructures({
      query: '机会雷达、模拟盘、策略结果、风险异常和实时状态',
      screenType: 'professional-dashboard',
      density: 'compact',
      limit: 3,
    });

    expect(matches[0].pattern.id).toBe('signal-workbench');
    expect(matches[0].score).toBeGreaterThanOrEqual(75);
    expect(matches[0].pattern.regions.map((item) => item.name)).toContain('exception-queue');
    expect(matches[0].pattern.avoid).toContain('顶部一排装饰统计卡');
  });

  it('订单审批工作台优先返回列表与检查器结构', () => {
    const matches = searchUiStructures({
      query: '订单列表、批量审批、客户详情和处理历史',
      screenType: 'workflow-console',
      density: 'compact',
    });

    expect(matches[0].pattern.id).toBe('list-inspector-workflow');
    expect(matches[0].pattern.flow).toContain('就地查看或编辑');
  });

  it('品牌官网优先返回编辑式产品叙事', () => {
    const matches = searchUiStructures({
      query: '产品官网首页，展示真实产品、案例和工作方式',
      screenType: 'marketing-page',
      density: 'spacious',
    });

    expect(matches[0].pattern.id).toBe('editorial-product-story');
    expect(matches[0].pattern.avoid).toContain('Hero + 三等分卡片 + CTA');
  });
});
