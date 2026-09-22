import { describe, expect, it } from 'vitest';
import {
  auditCraftSource,
  craftSourceBlocks,
  filterLandingLayoutResults,
  renderCraftPlaybook,
  renderThemeCss,
} from '../ui-craft.js';

describe('ui-craft', () => {
  it('阻断 transition:all、Inter、缺 press 态和 scale(0)', () => {
    const findings = auditCraftSource(`
      @import url('https://fonts.google.com/css2?family=Inter');
      .card { transition: all 300ms ease-in; }
      .modal { transform: scale(0); }
    `);

    expect(findings.find((item) => item.id === 'no-transition-all')?.passed).toBe(false);
    expect(findings.find((item) => item.id === 'no-default-inter')?.passed).toBe(false);
    expect(findings.find((item) => item.id === 'press-scale')?.passed).toBe(false);
    expect(findings.find((item) => item.id === 'no-scale-zero')?.passed).toBe(false);
    expect(craftSourceBlocks(findings)).toBe(true);
  });

  it('接受 press 态与系统字体', () => {
    const findings = auditCraftSource(`
      button:active { transform: scale(0.97); }
      .panel { transition: transform 140ms cubic-bezier(0.23, 1, 0.32, 1); }
    `);

    expect(findings.every((item) => item.passed)).toBe(true);
    expect(craftSourceBlocks(findings)).toBe(false);
  });

  it('默认搜索过滤 landing 类别，明确营销意图时保留', () => {
    const results = [
      { category: 'landing', title: 'Hero' },
      { category: 'ux-guidelines', title: 'Form' },
    ];

    const filtered = filterLandingLayoutResults(results, { query: 'dashboard table' });
    expect(filtered.results).toEqual([{ category: 'ux-guidelines', title: 'Form' }]);
    expect(filtered.filteredCount).toBe(1);

    const kept = filterLandingLayoutResults(results, { query: '营销落地页', category: 'landing' });
    expect(kept.results).toHaveLength(2);
    expect(kept.filteredCount).toBe(0);
  });

  it('生成可引用的 theme CSS 变量', () => {
    const css = renderThemeCss({
      tokens: { accent: 'oklch(0.5 0.1 250)', canvas: 'oklch(0.99 0 0)' },
      radius: { sm: '4px' },
      shadows: { overlay: '0 8px 24px rgb(0 0 0 / 12%)' },
      motionPolicy: 'minimal',
    });

    expect(css).toContain('--accent:');
    expect(css).toContain('--radius-sm:');
    expect(css).toContain('--motion-policy: minimal');
    expect(css).toContain('Emil Kowalski');
  });

  it('营销 playbook 要求解释动效与全宽，工作台保持克制', () => {
    const marketing = renderCraftPlaybook({ motionPolicy: 'expressive', screenType: 'marketing-page' });
    expect(marketing).toContain('全宽 bleed');
    expect(marketing).toContain('Explanation');
    expect(marketing).toContain('cubic-bezier(0.23, 1, 0.32, 1)');
    expect(marketing).toContain('ui_design_system');
    expect(marketing).not.toMatch(/锈铜|近黑字/);
    expect(marketing).not.toMatch(/npx skills/);

    const consolePlaybook = renderCraftPlaybook({ motionPolicy: 'minimal', screenType: 'workflow-console' });
    expect(consolePlaybook).toContain('禁止装饰动效');
    expect(consolePlaybook).not.toContain('全宽 bleed');
  });
});
