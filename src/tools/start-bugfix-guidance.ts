import { buildProjectRootRetryHint } from '../lib/workspace-root.js';

export type TemplateProfileResolved = 'guided' | 'strict';
export type TemplateProfileRequest = 'guided' | 'strict' | 'auto';

export function decideTemplateProfile(description: string): TemplateProfileResolved {
  const text = description || '';
  const lengthScore = text.length >= 200 ? 2 : text.length >= 120 ? 1 : 0;
  const structureSignals = [
    /(^|\n)\s*#{1,3}\s+\S+/m,
    /(^|\n)\s*[-*]\s+\S+/m,
    /(^|\n)\s*\d+\.\s+\S+/m,
    /错误|异常|堆栈|复现|期望|实际|影响|环境|版本/m,
  ];
  const signalScore = structureSignals.reduce(
    (score, regex) => score + (regex.test(text) ? 1 : 0),
    0
  );
  return lengthScore >= 1 && signalScore >= 2 ? 'strict' : 'guided';
}

export function buildInvalidProjectRootResponse(projectRoot: string) {
  return {
    content: [{
      type: 'text',
      text: `拒绝执行 bugfix 编排：project_root 不能传带项目名的半相对路径，例如 ${projectRoot}。请改为传项目根目录绝对路径。`,
    }],
    isError: true,
    structuredContent: {
      error_code: 'INVALID_PROJECT_ROOT',
      rejected_project_root: projectRoot,
      retry_hint: buildProjectRootRetryHint(projectRoot),
    },
  };
}

export function resolveTemplateProfile(
  rawProfile: string,
  description: string
): {
  requested: TemplateProfileRequest;
  resolved: TemplateProfileResolved;
  warning?: string;
  reason?: string;
} {
  const normalized = (rawProfile || '').trim().toLowerCase();
  if (!normalized || normalized === 'auto') {
    const resolved = decideTemplateProfile(description);
    return {
      requested: 'auto',
      resolved,
      reason:
        resolved === 'strict'
          ? '信息较完整，适合紧凑指令'
          : '信息较简略，需要更多指导',
    };
  }
  if (normalized === 'guided' || normalized === 'strict') {
    return {
      requested: normalized,
      resolved: normalized,
    };
  }
  const fallback = decideTemplateProfile(description);
  return {
    requested: 'auto',
    resolved: fallback,
    warning: `模板档位 "${rawProfile}" 不支持，已回退为 ${fallback}`,
  };
}

export const PROMPT_TEMPLATE_GUIDED = `# 🐛 Bug 修复编排指南（SRC-8 真因分析）

## 🎯 目标

修复以下 Bug：

**错误信息**:
\`\`\`
{error_message}
\`\`\`

{stack_trace_section}

---

## 📋 步骤 0: 项目上下文与取证基线（自动处理）

**操作**:
1. 检查 \`docs/project-context.md\` 是否存在
2. 检查 \`docs/graph-insights/latest.md\` 和 \`docs/graph-insights/latest.json\` 是否存在
3. **如果任一缺失**：
   - 调用 \`init_project_context\` 工具
   - 等待生成完成
4. **读取** \`docs/project-context.md\` 与图谱文档
5. 了解项目的技术栈、架构、测试框架和调用链
6. 后续步骤参考此上下文

---

## 🔍 步骤 1~8: SRC-8（delegated plan）

**执行方式**: 严格按 \`structuredContent.metadata.plan.steps\` 顺序执行（与 \`start_feature\` 相同模式）。

**SRC 概要**:
1. **src8-1** 明确差距 → \`BugAnalysis.tbp.phenomenon\`
2. **src8-2** \`code_insight\` → 边界/时间线
3. **src8-3** 验收契约 → \`BugAnalysis.testPlan\`
4. **src8-4** 真因工作表 4a~4e → \`rootCauseAnalysis\`（闭合前禁止改代码）
5. **src8-5** 制定对策 → \`BugAnalysis.fixPlan\`
6. **src8-6** 贯彻修复 → 代码补丁
7. **src8-7** \`gentest\` → 回归测试
8. **src8-8** 准备成功/失败/证伪/回归记忆候选 → 写入 \`plan_heartbeat\`；\`converge\` 通过后再 \`memorize_asset\`

**Bug 上下文**:
\`\`\`
{error_message}
\`\`\`

{stack_trace_section}

---

## ✅ 完成检查

- [ ] 项目上下文已读取
- [ ] SRC-8 Step 1~3 已完成
- [ ] **rootCauseWorksheet / rootCauseAnalysis 已闭合**
- [ ] 真因已写成因果句
- [ ] 代码已修复
- [ ] 测试已添加
- [ ] 测试已通过

---

## 📝 输出汇总

完成后，向用户汇总：

1. **SRC-1 差距**: [精确定义的问题]
2. **SRC-2 时间线/边界**: [关键事件与归因层]
3. **已排除方向**: [不是哪些原因]
4. **问题边界**: [失控发生在哪一层]
5. **Bug 真因**: [根本原因]
6. **修复方案**: [修复说明]
7. **修改文件**: [文件列表]
8. **测试覆盖**: [测试情况]

---

*编排工具: MCP Probe Kit - start_bugfix*
`;

export const PROMPT_TEMPLATE_STRICT = `# 🐛 Bug 修复编排（严格 | SRC-8）

## 🎯 目标
修复 Bug：{error_message}

{stack_trace_section}

---

## ✅ 执行计划

严格按 \`structuredContent.metadata.plan.steps\` 顺序执行（context → src8-1 → … → src8-8）。

**要点**: src8-4 闭合 \`rootCauseWorksheet\` 前禁止改代码；src8-6 前满足复现门禁。

{spec_gate_section}

---

## ✅ 输出汇总
1. SRC-1 差距
2. SRC-2 时间线/边界
3. 已排除方向
4. 问题边界
5. Bug 真因
6. 修复方案
7. 修改文件
8. 测试覆盖

---

*编排工具: MCP Probe Kit - start_bugfix*
`;

export const LOOP_PROMPT_TEMPLATE_GUIDED = `# 🧭 Bug 需求澄清与补全（SRC-8 RCA Loop）

本模式用于**生产级稳健补全**：在不改变用户意图的前提下补齐 SRC-8 真因分析（尤其 Step 4 工作表）所需证据。

## 🎯 目标
修复 Bug：{error_message}

## ✅ 规则
1. **不覆盖用户原始描述**
2. **补全内容必须标注来源**（User / Derived / Assumption）
3. **假设必须进入待确认列表**
4. **每轮问题 ≤ {question_budget}，假设 ≤ {assumption_cap}**

---

## 🔁 执行步骤（每轮）

### 1) 生成待确认问题
使用 \`ask_user\` 提问，问题来源于 SRC-8 清单（差距/边界/验收契约/对比样本/真因工作表）。

**调用示例**:
\`\`\`json
{
  "questions": [
    { "question": "复现步骤是什么？", "context": "复现步骤", "required": true },
    { "question": "期望行为是什么？", "context": "期望行为", "required": true }
  ]
}
\`\`\`

### 2) 更新结构化输出
将回答补入 \`requirements\`，并标注来源：
- User：用户明确回答
- Derived：合理推导
- Assumption：无法确认但补全（需确认）

### 3) 自检与结束
若 \`openQuestions\` 为空且无高风险假设，则结束 loop，进入 SRC-8 Step 5~8（对策→修复→评价→巩固）。

---

## ✅ 结束后继续
当满足结束条件时，严格按 \`structuredContent.metadata.plan.steps\` 中 src8-1~8 执行（禁止跳步）。

---

*编排工具: MCP Probe Kit - start_bugfix (requirements loop)*
`;

export const LOOP_PROMPT_TEMPLATE_STRICT = `# 🧭 Bug 需求澄清与补全（SRC-8 RCA Loop | 严格）

本模式用于稳健补全关键信息，不改变用户意图。

## 🎯 目标
修复 Bug：{error_message}

## ✅ 规则
1. 不覆盖用户原始描述
2. 补全内容标注来源（User / Derived / Assumption）
3. 假设进入待确认列表
4. 每轮问题 ≤ {question_budget}，假设 ≤ {assumption_cap}

---

## 🔁 执行步骤（每轮）
1) 使用 \`ask_user\` 提问补全关键信息
2) 更新结构化输出并标注来源
3) 若 \`openQuestions\` 为空且无高风险假设则结束

---

## ✅ 结束后继续
当满足结束条件时，按 \`metadata.plan\` 执行 src8-1~8。

---

*编排工具: MCP Probe Kit - start_bugfix (requirements loop)*
`;

export function buildBugfixQuestions(questionBudget: number) {
  const base = [
    { question: '请精确定义现象：用户可见的问题是什么？', context: '现象', required: true },
    { question: '问题发生的关键时间线是什么？开始、过程中、最后停在什么状态？', context: '时间线', required: true },
    { question: '期望行为与实际行为分别是什么？', context: '期望与实际', required: true },
    { question: '有没有成功样本或不出问题的对照场景？', context: '对比样本', required: false },
    { question: '环境/版本/配置差异是什么？', context: '环境信息', required: true },
    { question: '是否有日志、堆栈、run id、session id、trace 等证据？', context: '证据标识', required: false },
  ];
  return base.slice(0, Math.max(0, questionBudget));
}

export function buildBugfixGraphGuideSection(input: {
  latestMarkdownPath: string;
  latestJsonPath: string;
  graphDocsMissing: boolean;
  graphContext: {
    available: boolean;
    summary: string;
    highlights: string[];
  };
}): string {
  const { latestMarkdownPath, latestJsonPath, graphDocsMissing, graphContext } = input;
  const highlights = graphContext.highlights.length > 0
    ? `- 任务级线索:\n${graphContext.highlights.slice(0, 3).map((item) => `  - ${item}`).join('\n')}`
    : '- 任务级线索: 无';
  return `

## 🧠 代码图谱上下文
- 基线入口: ${latestMarkdownPath}
- 基线结构化副本: ${latestJsonPath}
- 基线状态: ${graphDocsMissing ? '缺失（需要补初始化）' : '可用'}
- 任务级收敛: ${graphContext.available ? '可用' : '降级'}
- 任务级摘要: ${graphContext.summary}
${highlights}
- 使用方式: 先读取基线图谱，再用本次任务图谱做 SRC-2/4 的边界与真因收敛
`;
}
