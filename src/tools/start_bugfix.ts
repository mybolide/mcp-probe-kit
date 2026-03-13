import * as fs from "node:fs";
import * as path from "node:path";
import { parseArgs, getString, getNumber } from "../utils/parseArgs.js";
import { okStructured } from "../lib/response.js";
import { renderOrchestrationHeader } from "../lib/orchestration-guidance.js";
import { BugFixReportSchema, RequirementsLoopSchema } from "../schemas/structured-output.js";
import type { BugFixReport, RequirementsLoopReport } from "../schemas/structured-output.js";
import {
  reportToolProgress,
  throwIfAborted,
  type ToolExecutionContext,
} from "../lib/tool-execution-context.js";
import { buildBugfixGraphContext } from "../lib/gitnexus-bridge.js";

/**
 * start_bugfix 智能编排工具
 * 
 * 场景：修复 Bug
 * 编排：[检查上下文] → fix_bug → gentest
 */

type TemplateProfileResolved = 'guided' | 'strict';
type TemplateProfileRequest = 'guided' | 'strict' | 'auto';
type AnalysisMode = 'tbp8';

function decideTemplateProfile(description: string): TemplateProfileResolved {
  const text = description || '';
  const lengthScore = text.length >= 200 ? 2 : text.length >= 120 ? 1 : 0;
  const structureSignals = [
    /(^|\n)\s*#{1,3}\s+\S+/m,
    /(^|\n)\s*[-*]\s+\S+/m,
    /(^|\n)\s*\d+\.\s+\S+/m,
    /错误|异常|堆栈|复现|期望|实际|影响|环境|版本/m,
  ];
  const signalScore = structureSignals.reduce((score, regex) => score + (regex.test(text) ? 1 : 0), 0);

  if (lengthScore >= 1 && signalScore >= 2) {
    return 'strict';
  }
  return 'guided';
}

function resolveTemplateProfile(rawProfile: string, description: string): {
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
      reason: resolved === 'strict' ? '信息较完整，适合紧凑指令' : '信息较简略，需要更多指导',
    };
  }

  if (normalized === 'guided' || normalized === 'strict') {
    return {
      requested: normalized as TemplateProfileRequest,
      resolved: normalized as TemplateProfileResolved,
    };
  }

  const fallback = decideTemplateProfile(description);
  return {
    requested: 'auto',
    resolved: fallback,
    warning: `模板档位 "${rawProfile}" 不支持，已回退为 ${fallback}`,
  };
}

const PROMPT_TEMPLATE_GUIDED = `# 🐛 Bug 修复编排指南（TBP 8 步真因分析）

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

## 🔍 步骤 1: 先做 TBP 1-7，再决定修复

**调用工具**: \`fix_bug\`

**参数**:
\`\`\`json
{
  "error_message": "{error_message}",
  "stack_trace": "{stack_trace}"
}
\`\`\`

**执行要点**:
1. 先定义现象，不能泛化
2. 复盘时间线，尽量带时间/步骤/状态
3. 明确排除错误方向，并说明为什么不是
4. 对比成功/失败样本，找分叉点
5. 定位问题边界（模型 / 状态机 / 工具 / 文件 / 环境）
6. 用因果句陈述真因：A + B 在条件 D 下导致 C
7. 闭合证据链后，才进入修复设计
8. 修复必须说明风险与验证方式

**产出**: 修复后的代码

---

## 🧪 步骤 2: 生成回归测试

**调用工具**: \`gentest\`

**参数**:
\`\`\`json
{
  "code": "[修复后的代码]",
  "framework": "[根据项目上下文选择: jest/vitest/mocha]"
}
\`\`\`

**执行要点**:
1. 为修复的代码生成测试
2. 包含 Bug 场景的测试用例
3. 包含边界情况测试

**产出**: 测试代码

---

## ✅ 完成检查

- [ ] 项目上下文已读取
- [ ] TBP-1~TBP-7 已闭合
- [ ] 真因已写成因果句
- [ ] 代码已修复
- [ ] 测试已添加
- [ ] 测试已通过

---

## 📝 输出汇总

完成后，向用户汇总：

1. **TBP 现象**: [精确定义的问题]
2. **TBP 时间线**: [关键事件顺序]
3. **已排除方向**: [不是哪些原因]
4. **问题边界**: [失控发生在哪一层]
5. **Bug 真因**: [根本原因]
6. **修复方案**: [修复说明]
7. **修改文件**: [文件列表]
8. **测试覆盖**: [测试情况]

---

*编排工具: MCP Probe Kit - start_bugfix*
`;

const PROMPT_TEMPLATE_STRICT = `# 🐛 Bug 修复编排（严格 | TBP 8 步）

## 🎯 目标
修复 Bug：{error_message}

{stack_trace_section}

---

## ✅ 执行计划（按顺序）

1) 检查 \`docs/project-context.md\` 与 \`docs/graph-insights/latest.*\`，任一缺失则调用 \`init_project_context\`
2) 调用 \`fix_bug\`
\`\`\`json
{
  "error_message": "{error_message}",
  "stack_trace": "{stack_trace}",
  "analysis_mode": "{analysis_mode}"
}
\`\`\`
3) 调用 \`gentest\`
\`\`\`json
{
  "code": "[修复后的代码]",
  "framework": "[根据项目上下文选择: jest/vitest/mocha]"
}
\`\`\`

---

## ✅ 输出汇总
1. TBP 现象
2. TBP 时间线
3. 已排除方向
4. 问题边界
5. Bug 真因
6. 修复方案
7. 修改文件
8. 测试覆盖

---

*编排工具: MCP Probe Kit - start_bugfix*
`;

const LOOP_PROMPT_TEMPLATE_GUIDED = `# 🧭 Bug 需求澄清与补全（TBP RCA Loop）

本模式用于**生产级稳健补全**：在不改变用户意图的前提下补齐 TBP 8 步真因分析所需证据。

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
使用 \`ask_user\` 提问，问题来源于 TBP 清单（现象/时间线/对比样本/边界/验证）。

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
若 \`openQuestions\` 为空且无高风险假设，则结束 loop，进入 TBP-6/7/8 修复流程。

---

## ✅ 结束后继续
当满足结束条件时，执行：
1. 调用 \`fix_bug\` 完成 TBP 8 步分析与修复方案
2. 调用 \`gentest\` 生成回归测试

---

*编排工具: MCP Probe Kit - start_bugfix (requirements loop)*
`;

const LOOP_PROMPT_TEMPLATE_STRICT = `# 🧭 Bug 需求澄清与补全（TBP RCA Loop | 严格）

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
当满足结束条件时，调用 \`fix_bug\` 与 \`gentest\`

---

*编排工具: MCP Probe Kit - start_bugfix (requirements loop)*
`;

function buildBugfixQuestions(questionBudget: number) {
  const base = [
    { question: "请精确定义现象：用户可见的问题是什么？", context: "现象", required: true },
    { question: "问题发生的关键时间线是什么？开始、过程中、最后停在什么状态？", context: "时间线", required: true },
    { question: "期望行为与实际行为分别是什么？", context: "期望与实际", required: true },
    { question: "有没有成功样本或不出问题的对照场景？", context: "对比样本", required: false },
    { question: "环境/版本/配置差异是什么？", context: "环境信息", required: true },
    { question: "是否有日志、堆栈、run id、session id、trace 等证据？", context: "证据标识", required: false },
  ];
  return base.slice(0, Math.max(0, questionBudget));
}

export async function startBugfix(args: any, context?: ToolExecutionContext) {
  try {
    throwIfAborted(context?.signal, "start_bugfix 已取消");
    await reportToolProgress(context, 10, "start_bugfix: 解析参数");

    // 智能参数解析，支持自然语言输入
    const parsedArgs = parseArgs<{
      error_message?: string;
      stack_trace?: string;
      code_context?: string;
      project_root?: string;
      analysis_mode?: string;
      template_profile?: string;
      requirements_mode?: string;
      loop_max_rounds?: number;
      loop_question_budget?: number;
      loop_assumption_cap?: number;
    }>(args, {
      defaultValues: {
        error_message: "",
        stack_trace: "",
        code_context: "",
        analysis_mode: "tbp8",
        template_profile: "auto",
        requirements_mode: "steady",
        loop_max_rounds: 2,
        loop_question_budget: 5,
        loop_assumption_cap: 3,
      },
      primaryField: "error_message", // 纯文本输入默认映射到 error_message 字段
      fieldAliases: {
        error_message: ["error", "err", "message", "错误", "错误信息"],
        stack_trace: ["stack", "trace", "堆栈", "调用栈"],
        code_context: ["code_context", "code", "context", "相关代码", "代码上下文"],
        project_root: ["projectRoot", "project_path", "projectPath", "root", "project_root", "项目路径", "项目根目录"],
        analysis_mode: ["analysis_mode", "methodology", "rca", "tbp", "分析方法"],
        template_profile: ["profile", "template_profile", "模板档位", "模板模式"],
        requirements_mode: ["mode", "requirements_mode", "loop", "需求模式"],
        loop_max_rounds: ["max_rounds", "rounds", "最大轮次"],
        loop_question_budget: ["question_budget", "问题数量", "问题预算"],
        loop_assumption_cap: ["assumption_cap", "假设上限"],
      },
    });

    const errorMessage = getString(parsedArgs.error_message);
    const stackTrace = getString(parsedArgs.stack_trace);
    const codeContext = getString(parsedArgs.code_context);
    const projectRoot = getString(parsedArgs.project_root);
    const analysisMode = ((getString(parsedArgs.analysis_mode) || "tbp8").toLowerCase() === "tbp8"
      ? "tbp8"
      : "tbp8") as AnalysisMode;
    const rawProfile = getString(parsedArgs.template_profile);
    const requirementsMode = getString(parsedArgs.requirements_mode) || "steady";
    const maxRounds = getNumber(parsedArgs.loop_max_rounds, 2);
    const questionBudget = getNumber(parsedArgs.loop_question_budget, 5);
    const assumptionCap = getNumber(parsedArgs.loop_assumption_cap, 3);

    throwIfAborted(context?.signal, "start_bugfix 已取消");
    await reportToolProgress(context, 35, "start_bugfix: 参数解析完成");

    if (!errorMessage) {
      throw new Error("缺少必填参数: error_message（错误信息）");
    }

    const combinedText = [errorMessage, stackTrace].filter(Boolean).join("\n");
    const profileDecision = resolveTemplateProfile(rawProfile, combinedText);
    const templateMeta: Record<string, string> = {
      profile: profileDecision.resolved,
      requested: profileDecision.requested,
      analysisMode,
    };
    if (profileDecision.reason) {
      templateMeta.reason = profileDecision.reason;
    }
    if (profileDecision.warning) {
      templateMeta.warning = profileDecision.warning;
    }

    const headerNotes = [
      `模板档位: ${profileDecision.resolved}${profileDecision.requested === 'auto' ? '（自动）' : ''}`,
      `分析方法: ${analysisMode}`,
    ];
    if (profileDecision.reason) {
      headerNotes.push(`选择理由: ${profileDecision.reason}`);
    }
    if (profileDecision.warning) {
      headerNotes.push(profileDecision.warning);
    }

    throwIfAborted(context?.signal, "start_bugfix 已取消");
    await reportToolProgress(context, 55, "start_bugfix: 刷新图谱并收敛问题范围");
    const graphDocs = {
      latestMarkdownPath: "docs/graph-insights/latest.md",
      latestJsonPath: "docs/graph-insights/latest.json",
    };
    const resolvedProjectRoot = path.resolve(projectRoot || process.cwd());
    const bootstrapState = {
      projectContextExists: fs.existsSync(path.join(resolvedProjectRoot, "docs", "project-context.md")),
      latestMarkdownExists: fs.existsSync(path.join(resolvedProjectRoot, "docs", "graph-insights", "latest.md")),
      latestJsonExists: fs.existsSync(path.join(resolvedProjectRoot, "docs", "graph-insights", "latest.json")),
    };
    const graphDocsMissing = !bootstrapState.latestMarkdownExists || !bootstrapState.latestJsonExists;
    const graphContext = await buildBugfixGraphContext({
      errorMessage,
      stackTrace,
      projectRoot: projectRoot || undefined,
      signal: context?.signal,
    });
    const graphStatusNote = graphContext.available
      ? `任务图谱收敛: 可用（${graphContext.mode}）`
      : "任务图谱收敛: 已降级（自动回退）";
    headerNotes.push(graphStatusNote);

    const graphCodeContext = [
      codeContext,
      `如存在 ${graphDocs.latestMarkdownPath}，请一并参考其中的调用链、依赖关系和影响面摘要`,
      ...(graphContext.available
        ? [
            graphContext.summary ? `任务图谱摘要: ${graphContext.summary}` : "",
            ...graphContext.highlights.slice(0, 3).map((item) => `任务图谱线索: ${item}`),
          ]
        : []),
    ]
      .filter(Boolean)
      .join("\n\n");

    const graphGuideSection = `

## 🧠 代码图谱上下文
- 基线入口: ${graphDocs.latestMarkdownPath}
- 基线结构化副本: ${graphDocs.latestJsonPath}
- 基线状态: ${graphDocsMissing ? "缺失（需要补初始化）" : "可用"}
- 任务级收敛: ${graphContext.available ? "可用" : "降级"}
- 任务级摘要: ${graphContext.summary}
${graphContext.highlights.length > 0
    ? `- 任务级线索:\n${graphContext.highlights.slice(0, 3).map((item) => `  - ${item}`).join("\n")}`
    : "- 任务级线索: 无"}
- 使用方式: 先读取基线图谱，再用本次任务图谱做 TBP-4 / TBP-5 / TBP-6 的边界与真因收敛
`;

    if (requirementsMode === "loop") {
      throwIfAborted(context?.signal, "start_bugfix(loop) 已取消");
      await reportToolProgress(context, 70, "start_bugfix: 生成 loop 计划");

      const openQuestions = buildBugfixQuestions(questionBudget).map((q, index) => ({
        id: `Q-${index + 1}`,
        ...q,
      }));

      const requirements = [
        {
          id: "BUG-1",
          title: `修复: ${errorMessage.substring(0, 40)}${errorMessage.length > 40 ? "..." : ""}`,
          description: `修复 Bug：${errorMessage}`,
          source: "User" as const,
          acceptance: [
            "WHEN 按复现步骤操作 THEN 系统 SHALL 不再出现该错误",
            "IF 环境与版本一致 THEN 系统 SHALL 保持预期行为",
          ],
        },
      ];

      const assumptions: RequirementsLoopReport['assumptions'] = [];
      const missingFields = openQuestions.map((q) => q.context || q.question);
      const stopReady = openQuestions.length === 0 && assumptions.length === 0;

      const plan = {
        mode: 'delegated',
        steps: [
          {
            id: 'context',
            tool: 'init_project_context',
            when: `缺少 docs/project-context.md 或 ${graphDocs.latestMarkdownPath} / ${graphDocs.latestJsonPath}`,
            args: {
              docs_dir: 'docs',
              ...(projectRoot ? { project_root: projectRoot } : {}),
            },
            outputs: ['docs/project-context.md', graphDocs.latestMarkdownPath, graphDocs.latestJsonPath],
            note: `兼容老项目：如果旧项目没有 graph-insights/latest.*，先补齐图谱初始化再进入 bug 收敛`,
          },
          {
            id: 'loop-1',
            tool: 'ask_user',
            args: { questions: openQuestions.map(({ question, context, required }) => ({ question, context, required })) },
            outputs: [],
          },
          ...(maxRounds > 1
            ? [
                {
                  id: 'loop-2',
                  tool: 'ask_user',
                  when: '仍存在 openQuestions 或 assumptions',
                  args: { questions: '[根据上一轮补全结果生成问题]' },
                  outputs: [],
                },
              ]
            : []),
          {
            id: 'fix',
            tool: 'fix_bug',
            when: 'stopConditions.ready=true',
            args: {
              error_message: errorMessage,
              ...(stackTrace ? { stack_trace: stackTrace } : {}),
              analysis_mode: analysisMode,
              ...(graphCodeContext ? { code_context: graphCodeContext } : {}),
            },
            outputs: [],
          },
          {
            id: 'test',
            tool: 'gentest',
            when: 'stopConditions.ready=true',
            args: {
              code: '[修复后的代码]',
              framework: '[根据项目上下文选择: jest/vitest/mocha]',
            },
            outputs: [],
          },
        ],
      };

      const header = renderOrchestrationHeader({
        tool: 'start_bugfix',
        goal: `修复 Bug：${errorMessage}`,
        tasks: [
          '按 Requirements Loop 规则提问并更新结构化输出',
          '满足结束条件后按 delegated plan 执行修复与测试',
        ],
        notes: headerNotes,
      });

      const loopTemplate = profileDecision.resolved === 'strict'
        ? LOOP_PROMPT_TEMPLATE_STRICT
        : LOOP_PROMPT_TEMPLATE_GUIDED;

      const guide = (header + loopTemplate
        .replace(/{error_message}/g, errorMessage)
        .replace(/{analysis_mode}/g, analysisMode)
        .replace(/{question_budget}/g, String(questionBudget))
        .replace(/{assumption_cap}/g, String(assumptionCap)))
        + graphGuideSection;

      const loopReport: RequirementsLoopReport = {
        mode: 'loop',
        round: 1,
        maxRounds,
        questionBudget,
        assumptionCap,
        requirements,
        openQuestions,
        assumptions,
        delta: {
          added: ['BUG-1'],
          modified: [],
          removed: [],
        },
        validation: {
          passed: stopReady,
          missingFields,
          warnings: [],
        },
        stopConditions: {
          ready: stopReady,
          reasons: stopReady ? ['所有关键问题已确认'] : ['存在待确认问题'],
        },
        metadata: {
          plan,
          template: templateMeta,
          graphDocs,
          bootstrapState: {
            ...bootstrapState,
            graphDocsMissing,
          },
          graphContext,
        },
      };

      await reportToolProgress(context, 95, "start_bugfix: loop 输出已生成");

      return okStructured(
        guide,
        loopReport,
        {
          schema: RequirementsLoopSchema,
          note: 'AI 应按轮次澄清 Bug 需求并更新结构化输出，满足结束条件后再进入 fix_bug / gentest',
        }
      );
    }

    const stackTraceSection = stackTrace
      ? `**堆栈跟踪**:\n\`\`\`\n${stackTrace}\n\`\`\``
      : "";

    const header = renderOrchestrationHeader({
      tool: 'start_bugfix',
      goal: `修复 Bug：${errorMessage}`,
      tasks: [
        '按 delegated plan 顺序调用工具',
        '完成修复并生成回归测试',
      ],
      notes: headerNotes,
    });

    const promptTemplate = profileDecision.resolved === 'strict'
      ? PROMPT_TEMPLATE_STRICT
      : PROMPT_TEMPLATE_GUIDED;

    const guide = (header + promptTemplate
      .replace(/{error_message}/g, errorMessage)
      .replace(/{stack_trace}/g, stackTrace)
      .replace(/{analysis_mode}/g, analysisMode)
      .replace(/{stack_trace_section}/g, stackTraceSection))
      + graphGuideSection;

    const plan = {
      mode: 'delegated',
      steps: [
        {
          id: 'context',
          tool: 'init_project_context',
          when: `缺少 docs/project-context.md 或 ${graphDocs.latestMarkdownPath} / ${graphDocs.latestJsonPath}`,
          args: {
            docs_dir: 'docs',
            ...(projectRoot ? { project_root: projectRoot } : {}),
          },
          outputs: ['docs/project-context.md', graphDocs.latestMarkdownPath, graphDocs.latestJsonPath],
          note: `兼容老项目：如果旧项目没有 graph-insights/latest.*，先补齐图谱初始化再进入 bug 收敛`,
        },
        {
          id: 'fix',
          tool: 'fix_bug',
          args: {
            error_message: errorMessage,
            ...(stackTrace ? { stack_trace: stackTrace } : {}),
            analysis_mode: analysisMode,
            ...(graphCodeContext ? { code_context: graphCodeContext } : {}),
          },
          outputs: [],
        },
        {
          id: 'test',
          tool: 'gentest',
          args: {
            code: '[修复后的代码]',
            framework: '[根据项目上下文选择: jest/vitest/mocha]',
          },
          outputs: [],
        },
      ],
    };

    // 创建结构化的 Bug 修复报告
    const bugfixReport: BugFixReport = {
      summary: `Bug 修复工作流：${errorMessage.substring(0, 50)}${errorMessage.length > 50 ? '...' : ''}`,
      status: 'pending',
      analysisMode,
      steps: [
        {
          name: '检查项目上下文',
          status: 'pending',
          description: '检查 docs/project-context.md 与 graph-insights/latest.* 是否存在，缺失则调用 init_project_context',
        },
        {
          name: 'Bug 分析与修复',
          status: 'pending',
          description: '调用 fix_bug 工具进行问题定位和修复',
        },
        {
          name: '生成回归测试',
          status: 'pending',
          description: '调用 gentest 工具生成测试用例',
        },
      ],
      artifacts: [],
      nextSteps: [
        '检查并读取项目上下文文档',
        `如果缺少 ${graphDocs.latestMarkdownPath} / ${graphDocs.latestJsonPath}，先调用 init_project_context 补齐图谱初始化`,
        `优先读取 ${graphDocs.latestMarkdownPath} 获取调用链、依赖和影响面摘要`,
        '结合本次任务图谱线索收敛问题边界，避免扩大改动面',
        '按 TBP-1~TBP-7 完成真因分析',
        '调用 fix_bug 工具分析问题并形成因果句真因',
        '调用 gentest 工具生成回归测试',
        '运行测试验证修复',
      ],
      rootCause: '待分析（需要调用 fix_bug 工具）',
      fixPlan: '待制定（需要调用 fix_bug 工具）',
      testPlan: '待生成（需要调用 gentest 工具）',
      affectedFiles: [],
      tbp: {
        phenomenon: `待确认：${errorMessage}`,
        timeline: [
          { order: 1, event: '收到用户错误描述', evidence: errorMessage },
          ...(stackTrace ? [{ order: 2, event: '收到堆栈信息', evidence: stackTrace }] : []),
        ],
        ruledOut: [],
        commonPattern: '待通过成功/失败样本对比确认分叉点',
        boundary: '待定位（优先检查状态机、工具执行层、文件系统、环境配置）',
        rootCauseStatement: '待形成 “A + B 在条件 D 下导致 C” 的因果句',
        evidence: [
          { type: 'symptom', detail: errorMessage, source: 'error_message' },
          ...(stackTrace ? [{ type: 'stack' as const, detail: stackTrace, source: 'stack_trace' }] : []),
          ...(graphCodeContext ? [{ type: 'graph' as const, detail: graphCodeContext, source: 'graph_context' }] : []),
        ],
        repair: [
          {
            layer: 'analysis',
            action: '先完成 TBP 1-7 取证与真因闭合，再进入修复',
            risk: '若直接改代码，容易补症状而非修真因',
            verification: '检查真因是否能解释全部关键现象并排除竞争假设',
          },
        ],
      },
      metadata: {
        plan,
        template: templateMeta,
        analysisMode,
        graphDocs,
        bootstrapState: {
          ...bootstrapState,
          graphDocsMissing,
        },
        graphContext,
      },
    };

    await reportToolProgress(context, 95, "start_bugfix: 执行计划输出已生成");

    return okStructured(
      guide,
      bugfixReport,
      {
        schema: BugFixReportSchema,
        note: 'AI 应该按照指南执行步骤，并在每个步骤完成后更新 structuredContent 中的状态',
      }
    );
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `❌ 编排执行失败: ${errorMsg}` }],
      isError: true,
    };
  }
}
