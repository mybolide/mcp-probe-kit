import { describe, test, expect } from 'vitest';
import {
  CODE_LIMITS,
  BANNED_CODE_PATTERNS,
  UI_HARD_RULES,
  UI_BANNED_LIST,
  renderCodeLimits,
  renderBannedPatterns,
  renderUiHardRules,
  renderUiBannedList,
  renderPreFlightChecklist,
} from '../quality-constraints.js';

describe('quality-constraints（质量约束单一真相源）', () => {
  test('CODE_LIMITS 数值符合预期（单文件 500 / 函数 50）', () => {
    expect(CODE_LIMITS.maxFileLines).toBe(500);
    expect(CODE_LIMITS.maxFunctionLines).toBe(50);
    expect(CODE_LIMITS.maxNestingDepth).toBe(4);
    expect(CODE_LIMITS.maxParameters).toBe(3);
  });

  test('黑名单与硬约束清单非空', () => {
    expect(BANNED_CODE_PATTERNS.length).toBeGreaterThan(0);
    expect(UI_HARD_RULES.length).toBeGreaterThan(0);
    expect(UI_BANNED_LIST.length).toBeGreaterThan(0);
  });

  test('代码完整性黑名单含关键占位模式', () => {
    expect(BANNED_CODE_PATTERNS).toContain('// TODO');
    expect(BANNED_CODE_PATTERNS).toContain('// ...');
  });

  test('UI 黑名单含 em-dash 零容忍与 AI 紫蓝渐变', () => {
    expect(UI_BANNED_LIST.some((b) => b.includes('em-dash'))).toBe(true);
    expect(UI_BANNED_LIST.some((b) => b.includes('紫蓝渐变'))).toBe(true);
  });

  test('renderCodeLimits 输出含 500 行红线', () => {
    const out = renderCodeLimits();
    expect(out).toContain('500');
    expect(out).toContain('HIGH');
  });

  test('renderBannedPatterns 输出含 CRITICAL 与二元规则', () => {
    const out = renderBannedPatterns();
    expect(out).toContain('CRITICAL');
    expect(out).toContain('二元');
  });

  test('renderUiHardRules 含 4pt 间距阶梯与对比度阈值', () => {
    const out = renderUiHardRules();
    expect(out).toContain('4, 8, 12, 16, 24, 32, 48, 64, 96');
    expect(out).toContain('4.5:1');
  });

  test('renderUiBannedList 输出每条以 ❌ 标记', () => {
    const out = renderUiBannedList();
    expect(out).toContain('❌');
  });

  test('renderPreFlightChecklist 含 Scope-lock 与完整性勾选项', () => {
    const out = renderPreFlightChecklist();
    expect(out).toContain('Pre-Flight');
    expect(out).toContain('Scope-lock');
    expect(out).toContain('占位符');
  });

  // 防回归：注入下游 prompt 的渲染输出自身不得含 em-dash，否则与「em-dash 零容忍」自相矛盾
  test('代码类渲染输出不含 em-dash（避免规则自相矛盾）', () => {
    expect(renderCodeLimits()).not.toContain('—');
    expect(renderBannedPatterns()).not.toContain('—');
    expect(renderPreFlightChecklist()).not.toContain('—');
  });
});
