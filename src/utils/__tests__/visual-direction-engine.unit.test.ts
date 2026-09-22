import { describe, expect, it } from 'vitest';
import { buildVisualDirectionContract } from '../visual-direction-engine.js';

describe('visual-direction-engine', () => {
  it('专业看板默认使用 Editorial Precision 和 compact 密度', () => {
    const contract = buildVisualDirectionContract({
      productType: 'A股交易策略系统',
      description: '展示机会雷达、模拟盘、异常状态和实时策略结果的数据看板。',
      targetAudience: '专业交易员',
    });

    expect(contract.objective.screenType).toBe('professional-dashboard');
    expect(contract.objective.density).toBe('compact');
    expect(contract.direction.id).toBe('editorial-precision');
    expect(contract.direction.name).toBe('Editorial Precision');
    expect(contract.informationArchitecture.layout).toContain('不使用等分卡片瀑布');
    expect(contract.visualLanguage.color.tokens.accent).toMatch(/^(oklch\(|#)/);
    expect(contract.visualLanguage.typography.familyStrategy).toContain('不默认引入 Inter');
    expect(contract.visualLanguage.typography.scale.body).toBe('1rem');
    expect(contract.visualLanguage.typography.scale.dense).toBe('0.875rem');
    expect(contract.acceptance.targetScore).toBe(8.5);
    expect(contract.acceptance.dimensions.reduce((sum, item) => sum + item.weight, 0)).toBe(100);
    expect(contract.craft.tokensFile).toBe('docs/design-system.theme.css');
    expect(contract.craft.themeCss).toContain('--press-scale');
    expect(contract.acceptance.blockingFailures.some((item) => item.includes('craft-audit'))).toBe(true);
  });

  it('保留用户指定方向、参考方法、禁用项和目标评分', () => {
    const contract = buildVisualDirectionContract({
      productType: 'B2B SaaS',
      description: '管理订单、审批和批量操作。',
      visualDirection: 'Quiet Command Center',
      density: 'compact',
      brandPersonality: '精准, 克制',
      references: ['Linear', 'Apple'],
      avoid: ['大面积空白', '装饰性图标'],
      targetScore: 9.2,
      paletteCatalog: [],
    });

    expect(contract.direction.name).toBe('Quiet Command Center');
    expect(contract.direction.rationale).toContain('用户指定方向');
    expect(contract.direction.personality).toEqual(expect.arrayContaining(['精准', '克制']));
    expect(contract.direction.referenceLessons).toHaveLength(2);
    expect(contract.direction.referenceLessons[0].lesson).toContain('紧凑密度');
    expect(contract.avoid).toEqual(expect.arrayContaining(['大面积空白', '装饰性图标']));
    expect(contract.acceptance.targetScore).toBe(9.2);
  });

  it('空色表时营销页仍用 storytelling preset oklch', () => {
    const contract = buildVisualDirectionContract({
      productType: 'wearable',
      description: '智能戒指品牌官网',
      screenType: 'marketing-page',
      paletteCatalog: [],
    });
    expect(contract.visualLanguage.color.catalogSource).toBe('preset-fallback');
    expect(contract.visualLanguage.color.tokens.text).toMatch(/^oklch\(/);
    expect(contract.visualLanguage.color.strategy).toMatch(/fallback/);
  });

  it('医疗和政务场景不再推荐 Neumorphism', () => {
    const contract = buildVisualDirectionContract({
      productType: 'Healthcare App',
      description: '患者查看检查结果和风险提示。',
    });

    expect(contract.direction.id).toBe('calm-trust');
    expect(contract.direction.name).toBe('Calm Trust');
    expect(contract.avoid).toContain('Neumorphism 或 Claymorphism');
    expect(contract.visualLanguage.depth.strategy).toContain('默认扁平分层');
    expect(contract.visualLanguage.color.catalogProductType || contract.visualLanguage.color.catalogSource).toBeTruthy();
  });

  it('营销 storytelling 色来自 promax 目录或 preset 兜底', () => {
    const contract = buildVisualDirectionContract({
      productType: 'wearable',
      description: '智能戒指品牌官网',
      screenType: 'marketing-page',
    });

    expect(contract.direction.id).toBe('product-storytelling');
    expect(contract.visualLanguage.color.strategy).toMatch(/ui-ux-pro-max|fallback/);
    expect(contract.visualLanguage.color.tokens.accent).toMatch(/^(oklch\(|#)/);
    expect(contract.craft.themeCss).toContain('Prefer docs/design-system');
  });
});
