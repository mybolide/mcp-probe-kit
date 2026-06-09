/**
 * 质量约束「单一真相源」
 *
 * 目标：把散落在 task 模板、code_review、UI 工具里的软性质量要求，
 * 收敛到一个集中管理的硬约束模块。三个落点工具都从这里 import，
 * 改一处、处处生效，杜绝规则漂移。
 *
 * 设计哲学（借鉴 taste-skill / impeccable）：
 * 凡是想让下游 AI 真正照做的规则，必须用「机器可判定的硬约束 +
 * 精确字符串黑名单 + 二元禁令 + 交付前 checklist」，
 * 禁用「尽量 / 建议 / sparingly」这类会被 AI 忽略的软措辞。
 *
 * 本模块为纯常量 + 字符串渲染，无 I/O、零运行时依赖，便于单测。
 */

// ============================================================
// 一、代码量硬约束
// ============================================================

export interface CodeLimits {
  /** 单文件最大行数；超出必须拆分模块/组件 */
  maxFileLines: number;
  /** 单函数最大行数；超出必须拆分方法 */
  maxFunctionLines: number;
  /** 最大嵌套层数；超出用提前返回（early return）展平 */
  maxNestingDepth: number;
  /** 最大参数个数；超出改用参数对象 */
  maxParameters: number;
}

export const CODE_LIMITS: CodeLimits = {
  maxFileLines: 500,
  maxFunctionLines: 50,
  maxNestingDepth: 4,
  maxParameters: 3,
};

// ============================================================
// 二、代码完整性黑名单（精确字符串，机械可扫描）
// ============================================================

/**
 * 占位/省略式代码模式——出现即判「未完成的破碎输出」。
 * 措辞二元：零容忍，不存在「少量允许」。
 */
export const BANNED_CODE_PATTERNS: string[] = [
  '// ...',
  '/* ... */',
  '// TODO',
  '// FIXME（遗留未实现）',
  '// rest of code',
  '// rest of the code',
  '// implement here',
  '// your code here',
  '// similar to above',
  '// same as before',
  '裸露的省略号 ...（作为代码占位）',
  'the rest follows the same pattern',
  'and so on',
  '以此类推（作为代码省略）',
  '其余代码省略',
  '此处省略',
];

// ============================================================
// 三、UI 设计硬红线（带数值，可机器判定）
// ============================================================

/**
 * 每条都是带数值/比例的硬约束，区别于含糊的「保持一致」。
 * 精选自 impeccable，挑机器可判定、收益最高的条款。
 */
export const UI_HARD_RULES: string[] = [
  '间距系统：强制 4pt 基准阶梯 [4, 8, 12, 16, 24, 32, 48, 64, 96]px。同组元素 8-12px，跨区块 48-96px。任何不在阶梯内的 padding/margin/gap 判为漂移。',
  '触控目标：≥ 44×44px。视觉元素更小时用 padding 或伪元素扩大命中区。',
  '对比度（WCAG）：正文 ≥ 4.5:1；大文本（≥18px 或 bold ≥14px）≥ 3:1；UI 组件/图标 ≥ 3:1；placeholder 同样 ≥ 4.5:1（不可用默认浅灰）。',
  '字阶比例：相邻级别 ≥ 1.25（品牌站）或 1.125-1.2（产品界面）。禁止扁平字阶（14/15/16px 相邻）。最多 5 级。',
  '主正文流字号：≥ 16px / 1rem，且用 rem 而非 px（脚注、表格密集数据、图例等辅助文本可更小）。',
  'Hero 字号天花板：clamp() 的 max ≤ 6rem（96px）。clamp max ≤ 2.5 × min，否则破坏浏览器缩放与回流。',
  'Display 标题字间距：≥ -0.04em，再紧字母会粘连。',
  '色彩空间：用 OKLCH，禁用 HSL。中性色加微着色 chroma 0.005-0.015，朝品牌色（不默认朝暖橙 hue 60 / 冷蓝 hue 250）。',
  '色彩权重：遵守 60-30-10（60% 中性底 / 30% 次要 / 10% 强调）。一个页面锁定单一强调色，逐组件审计一致性。',
  '行高：标题 1.1-1.2，正文 1.5-1.7。深色背景上字重降一档、行高 +0.05-0.1。',
  '交互八态完整性：每个交互元素必须设计 Default / Hover / Focus / Active / Disabled / Loading / Error / Success 八态，缺一即 P1。',
  'Focus 可见性：禁止裸 outline:none。用 :focus-visible，2-3px 粗，对比 ≥ 3:1，outline-offset 在元素外侧。',
  '动效：时长 150-300ms；缓动用 ease-out-expo/quart/quint；禁 bounce/elastic；必须有 @media (prefers-reduced-motion: reduce) 分支。',
  '认知负荷：营销/落地页类界面任意决策点 ≤ 4 个可见选项（导航 ≤ 5 顶级项、表单每组 ≤ 4 字段、定价常见 ≤ 3-4 档）。数据密集型后台（监控大盘、交易看板）按信息需求放宽，不强套此限。',
  'z-index：建立语义层级（dropdown → sticky → modal-backdrop → modal → toast → tooltip）。禁止任意值 999 / 9999。',
];

// ============================================================
// 四、UI 禁用黑名单（match-and-refuse，二元禁令）
// ============================================================

/**
 * 命中即「AI slop」。这些是 taste-skill / impeccable 生产测试中
 * 最高频的 AI 设计破绽（tells）。
 */
export const UI_BANNED_LIST: string[] = [
  '默认字体 Inter / Roboto / Open Sans（无明确理由时禁用）。',
  'AI 默认紫蓝渐变（紫→蓝光辉），最典型的 AI 破绽。',
  'gradient text（background-clip:text + 渐变）作为标题默认效果。',
  'side-stripe 装饰边框（border-left/right > 1px 纯装饰）。',
  '默认 glassmorphism（无真实层次的毛玻璃）。',
  '相同卡片等距网格（无层次的 N 等分 card grid）。',
  '嵌套卡片（nested cards 永远是错的）。',
  '卡片圆角 ≥ 32px（卡片圆角上限 12-16px）。',
  'ghost-card：同元素 border 1px + box-shadow blur ≥16px。',
  'cream / sand / beige 米色正文背景（2026 年的饱和 AI 默认底色）。',
  'hero-metric 模板（巨大数字 + 小标签的套路化英雄区）。',
  '每段都有的 tiny uppercase eyebrow 小标签（每 3 区块最多 1 个）。',
  '01 / 02 / 03 编号式小标题装饰。',
  '英文排版/UI 文案中滥用 em-dash（"—"）：英文语境最高频的 AI 破绽，禁止用作随意连接符（中文正文的破折号属合法标点，不在此列）。',
  '占位文案 "Lorem Ipsum" / "John Doe" / "Acme"。',
  'AI 陈词滥调文案：Elevate / Seamless / Unleash / Delve / 赋能 / 一站式。',
  '同页重复 CTA 意图（如 "Get in touch" + "Let\'s talk" 并存）。',
];

// ============================================================
// 渲染函数：返回 markdown 片段，供各工具拼进指南
// ============================================================

/** 代码量硬约束清单 */
export function renderCodeLimits(): string {
  return `**代码量硬约束（超出即判 HIGH，必须重构）**：
- [ ] 单文件 ≤ ${CODE_LIMITS.maxFileLines} 行：超出必须拆分为多个模块/组件
- [ ] 单函数 ≤ ${CODE_LIMITS.maxFunctionLines} 行：超出必须拆分方法
- [ ] 嵌套 ≤ ${CODE_LIMITS.maxNestingDepth} 层：超出用提前返回（early return）展平
- [ ] 参数 ≤ ${CODE_LIMITS.maxParameters} 个：超出改用参数对象`;
}

/** 完整性黑名单（占位符/省略式代码） */
export function renderBannedPatterns(): string {
  const list = BANNED_CODE_PATTERNS.map((p) => `- \`${p}\``).join('\n');
  return `**完整性检查（命中即判 CRITICAL：「部分输出 = 破碎输出」）**：

下列占位/省略模式零容忍，扫描到任意一个即判定该交付物未完成：

${list}

> 二元规则：不存在「少量允许」。任何用占位符、省略注释代替真实实现的行为都是破碎输出。`;
}

/** UI 设计硬红线 */
export function renderUiHardRules(): string {
  const list = UI_HARD_RULES.map((r, i) => `${i + 1}. ${r}`).join('\n');
  return `## UI 设计硬红线（带数值，可逐条核验）

${list}`;
}

/** UI 禁用黑名单 */
export function renderUiBannedList(): string {
  const list = UI_BANNED_LIST.map((b) => `- ❌ ${b}`).join('\n');
  return `## UI 禁用黑名单（命中即 AI slop，二元禁令）

${list}`;
}

/**
 * 交付前自检矩阵（Pre-Flight Checklist）。
 * 把所有约束收口成一个生成结束前必须逐条诚实勾选的闭环。
 * 任意一项不能诚实勾选 = 未完成。
 */
export function renderPreFlightChecklist(): string {
  return `## 交付前自检矩阵（Pre-Flight Check）

> 生成结束前必须逐条诚实勾选。任意一项不能勾选 = 未完成，禁止交付。

**完整性**：
- [ ] 无任何占位符 / 省略注释 / TODO（对照完整性黑名单）
- [ ] 交付物数量与需求一致（Scope-lock：先数清楚再交付）

**代码量**：
- [ ] 所有文件 ≤ ${CODE_LIMITS.maxFileLines} 行，函数 ≤ ${CODE_LIMITS.maxFunctionLines} 行

**UI（若涉及界面）**：
- [ ] 间距落在 4pt 阶梯内
- [ ] 对比度达标（正文 ≥ 4.5:1）
- [ ] 交互元素八态齐全
- [ ] 未命中 UI 禁用黑名单（无 em-dash、无 AI 紫蓝渐变、无米色底等）
- [ ] 单一强调色、统一圆角阶梯（一致性锁）`;
}
