/**
 * Built-in start_ui craft gates.
 * Check wording is derived from Emil Kowalski skills (MIT License,
 * Copyright (c) 2026 Emil Kowalski, https://github.com/emilkowalski/skills).
 * This module is not a vendored copy of that repository.
 */

export const UI_CRAFT_SOURCE = 'mcp-probe-kit-craft/1.0';
export const UI_THEME_FILE = 'docs/design-system.theme.css';
export const UI_EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
export const UI_EASE_IN_OUT = 'cubic-bezier(0.77, 0, 0.175, 1)';

export type CraftMotionPolicy = 'none' | 'minimal' | 'expressive';
export type CraftCheckHow = 'source' | 'screenshot' | 'both';
export type CraftSeverity = 'block' | 'warn';

export interface CraftCheck {
  id: string;
  severity: CraftSeverity;
  how: CraftCheckHow;
  rule: string;
}

export interface CraftAuditFinding {
  id: string;
  passed: boolean;
  evidence: string;
}

export const CRAFT_CHECKS: CraftCheck[] = [
  {
    id: 'depth-line-not-heavy-shadow',
    severity: 'block',
    how: 'screenshot',
    rule: '默认用背景分层和 1px --line；阴影只给浮层、拖拽或临时反馈。',
  },
  {
    id: 'no-double-depth',
    severity: 'block',
    how: 'screenshot',
    rule: '禁止实线框与厚阴影叠成两套层级。',
  },
  {
    id: 'press-scale',
    severity: 'block',
    how: 'source',
    rule: '可点控件须有 :active 或等价 press，scale 约 0.97，时长 100-160ms。',
  },
  {
    id: 'no-transition-all',
    severity: 'block',
    how: 'source',
    rule: '禁止 transition: all。',
  },
  {
    id: 'no-scale-zero',
    severity: 'block',
    how: 'source',
    rule: '若有进入动画，禁止 scale(0)；须 opacity 加 scale >= 0.9。',
  },
  {
    id: 'ease-out-enter',
    severity: 'block',
    how: 'source',
    rule: '进入/出现动画使用 ease-out；禁止 UI 进入使用 ease-in。',
  },
  {
    id: 'duration-caps',
    severity: 'warn',
    how: 'source',
    rule: '下拉/浮层 <= 250ms；模态/抽屉 <= 500ms；常规 UI 动效默认 < 300ms。',
  },
  {
    id: 'no-keyboard-chrome-motion',
    severity: 'block',
    how: 'both',
    rule: '键盘触发的命令面板或快捷操作不得使用打开/关闭动画。',
  },
  {
    id: 'popover-origin',
    severity: 'warn',
    how: 'source',
    rule: 'Popover 从 trigger 设置 transform-origin；Modal 保持居中。',
  },
  {
    id: 'tooltip-instant-followup',
    severity: 'warn',
    how: 'source',
    rule: 'Tooltip 首次可延迟；相邻后续 hover 应立刻出现。',
  },
  {
    id: 'no-default-inter',
    severity: 'block',
    how: 'source',
    rule: '无品牌字体时使用系统栈，禁止默认引入 Inter。',
  },
  {
    id: 'mobile-not-scaled-desktop',
    severity: 'block',
    how: 'screenshot',
    rule: '390 视口须重组任务流，不得只缩小桌面布局。',
  },
];

const LANDING_INTENT =
  /落地页|landing|marketing|官网|品牌站|宣传页|营销页/i;

export function motionPolicyForScreen(screenType: string): CraftMotionPolicy {
  if (screenType === 'marketing-page') return 'expressive';
  if (screenType === 'professional-dashboard' || screenType === 'workflow-console') {
    return 'minimal';
  }
  return 'minimal';
}

export function allowsLandingLayoutSearch(input: {
  query?: string;
  category?: string;
  screenType?: string;
}): boolean {
  const text = `${input.query || ''} ${input.category || ''} ${input.screenType || ''}`;
  return LANDING_INTENT.test(text) || input.screenType === 'marketing-page';
}

export function isLandingSearchResult(result: { category?: string }): boolean {
  const category = String(result.category || '').toLowerCase();
  return category === 'landing' || category === 'landings' || category.includes('landing-page');
}

export function filterLandingLayoutResults<T extends { category?: string }>(
  results: T[],
  input: { query?: string; category?: string; screenType?: string },
): { results: T[]; filteredCount: number } {
  if (allowsLandingLayoutSearch(input)) {
    return { results, filteredCount: 0 };
  }
  const kept = results.filter((item) => !isLandingSearchResult(item));
  return { results: kept, filteredCount: results.length - kept.length };
}

export function auditCraftSource(source: string): CraftAuditFinding[] {
  const text = source;
  const hasPress =
    /:active\s*\{[^}]*scale\s*\(\s*0\.9[5-8]\s*\)/is.test(text)
    || /whileTap|while-tap|active:scale/i.test(text);
  const hasInterImport = /(?:fonts\.google|next\/font|font-family)[^;\n]*Inter\b/i.test(text)
    || /['"]Inter['"]/.test(text);
  const hasTransitionAll = /transition\s*:\s*all\b/i.test(text);
  const hasScaleZero = /scale\s*\(\s*0\s*\)/.test(text);
  const hasEaseInEnter = /ease-in(?!-out)/i.test(text) && /transition|animation|keyframes/i.test(text);

  return [
    {
      id: 'press-scale',
      passed: hasPress,
      evidence: hasPress ? 'found press/active scale' : 'missing :active scale 0.95-0.98',
    },
    {
      id: 'no-transition-all',
      passed: !hasTransitionAll,
      evidence: hasTransitionAll ? 'transition: all' : 'no transition:all',
    },
    {
      id: 'no-scale-zero',
      passed: !hasScaleZero,
      evidence: hasScaleZero ? 'scale(0)' : 'no scale(0)',
    },
    {
      id: 'ease-out-enter',
      passed: !hasEaseInEnter,
      evidence: hasEaseInEnter ? 'ease-in used with transition/animation' : 'no ease-in enter',
    },
    {
      id: 'no-default-inter',
      passed: !hasInterImport,
      evidence: hasInterImport ? 'Inter font referenced' : 'no Inter',
    },
  ];
}

export function craftSourceBlocks(findings: CraftAuditFinding[]): boolean {
  const sourceBlockIds = new Set(
    CRAFT_CHECKS.filter((item) => item.severity === 'block' && item.how !== 'screenshot').map((item) => item.id),
  );
  return findings.some((item) => sourceBlockIds.has(item.id) && !item.passed);
}

export function slopBlockingFailures(): string[] {
  return [
    '实现未引用 docs/design-system.theme.css 或契约 token，仍使用默认 Inter 或 shadcn 默认主色当权威',
    '等分卡片瀑布或同屏装饰统计卡堆叠',
    '源码 craft-audit 阻断项未通过（transition:all、无 press 态、scale(0)、ease-in 进入、默认 Inter）',
  ];
}

export function renderThemeCss(input: {
  tokens: Record<string, string>;
  radius: Record<string, string>;
  shadows: Record<string, string>;
  motionPolicy: CraftMotionPolicy;
}): string {
  const tokenLines = Object.entries(input.tokens)
    .map(([name, value]) => `  --${kebab(name)}: ${value};`)
    .join('\n');
  const radiusLines = Object.entries(input.radius)
    .map(([name, value]) => `  --radius-${kebab(name)}: ${value};`)
    .join('\n');
  const shadowLines = Object.entries(input.shadows)
    .map(([name, value]) => `  --shadow-${kebab(name)}: ${value};`)
    .join('\n');

  return `/* Fallback tokens from the visual-direction contract. Prefer docs/design-system.* or brand colors. */
/* Craft clauses derived from Emil Kowalski skills (MIT). */
:root {
${tokenLines}
${radiusLines}
${shadowLines}
  --ease-out: ${UI_EASE_OUT};
  --ease-in-out: ${UI_EASE_IN_OUT};
  --motion-policy: ${input.motionPolicy};
  --press-scale: 0.97;
  --press-duration: 140ms;
}
`;
}

export function renderCraftPlaybook(input: {
  motionPolicy: CraftMotionPolicy;
  screenType: string;
}): string {
  const marketing = input.screenType === 'marketing-page' || input.motionPolicy === 'expressive';
  const hunt = marketing
    ? `营销页必须先找动效机会再写 CSS：至少 1 处 **Explanation**（产品如何工作，可长于 300ms）、首屏进入用 opacity+translate/scale>=0.9、购买按钮 **Feedback**。禁止只做静止通栏。`
    : `工作台只做 Feedback（press）和偶尔的防跳跃；读数、表格、图表禁止装饰动效。`;
  const layout = marketing
    ? `构图：全宽 bleed 与交错阅读；禁止把 \`max-width: 1120px\` 居中通栏当作唯一布局。1440 视口应吃满宽，390 先价值后图像。配色不在此规定，以 ui_design_system 为准。`
    : `构图：沿用当前项目已有控制台分区与密度，不要套官网宽屏。`;

  return `## 内嵌动效（Emil，不是外部 Skill）

${hunt}
${layout}

决策：高频率/键盘触发 **永不** 动画。目的只能是 Feedback、Spatial、State、防跳跃、Explanation（营销）、Delight（仅首次）。只动画 \`transform\` 与 \`opacity\`。进入用 \`--ease-out: cubic-bezier(0.23, 1, 0.32, 1)\`，禁止进入 \`ease-in\`。常规 UI < 300ms；营销解释可更长。\`prefers-reduced-motion\` 减弱而非一律删光。不要调用 GitHub Skill 仓库。

`;
}

function kebab(value: string): string {
  return value.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}
