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

/**
 * start_bugfix 智能编排工具
 * 
 * 场景：修复 Bug
 * 编排：[检查上下文] → fix_bug → gentest
 */

type TemplateProfileResolved = 'guided' | 'strict';
type TemplateProfileRequest = 'guided' | 'strict' | 'auto';

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

const PROMPT_TEMPLATE_GUIDED = `# 🐛 Bug 修复编排指南

## 🎯 目标

修复以下 Bug：

**错误信息**:
\`\`\`
{error_message}
\`\`\`

{stack_trace_section}

---

## 📋 步骤 0: 项目上下文（自动处理）

**操作**:
1. 检查 \`docs/project-context.md\` 是否存在
2. **如果不存在**：
   - 调用 \`init_project_context\` 工具
   - 等待生成完成
3. **读取** \`docs/project-context.md\` 内容
4. 了解项目的技术栈、架构、测试框架
5. 后续步骤参考此上下文

---

## 🔍 步骤 1: Bug 分析与修复

**调用工具**: \`fix_bug\`

**参数**:
\`\`\`json
{
  "error_message": "{error_message}",
  "stack_trace": "{stack_trace}"
}
\`\`\`

**执行要点**:
1. 按指南完成问题定位
2. 使用 5 Whys 分析根本原因
3. 设计修复方案
4. 实施代码修复

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
- [ ] Bug 已定位
- [ ] 根本原因已分析
- [ ] 代码已修复
- [ ] 测试已添加
- [ ] 测试已通过

---

## 📝 输出汇总

完成后，向用户汇总：

1. **Bug 原因**: [根本原因]
2. **修复方案**: [修复说明]
3. **修改文件**: [文件列表]
4. **测试覆盖**: [测试情况]

---

*编排工具: MCP Probe Kit - start_bugfix*
`;

const PROMPT_TEMPLATE_STRICT = `# 🐛 Bug 修复编排（严格）

## 🎯 目标
修复 Bug：{error_message}

{stack_trace_section}

---

## ✅ 执行计划（按顺序）

1) 检查 \`docs/project-context.md\`，缺失则调用 \`init_project_context\`
2) 调用 \`fix_bug\`
\`\`\`json
{
  "error_message": "{error_message}",
  "stack_trace": "{stack_trace}"
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
1. Bug 原因
2. 修复方案
3. 修改文件
4. 测试覆盖

---

*编排工具: MCP Probe Kit - start_bugfix*
`;

const LOOP_PROMPT_TEMPLATE_GUIDED = `# 🧭 Bug 需求澄清与补全（Requirements Loop）

本模式用于**生产级稳健补全**：在不改变用户意图的前提下补齐 Bug 修复所需关键信息。

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
使用 \`ask_user\` 提问，问题来源于 Bug 修复补全清单（复现/环境/期望/影响/验证）。

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
若 \`openQuestions\` 为空且无高风险假设，则结束 loop，进入修复流程。

---

## ✅ 结束后继续
当满足结束条件时，执行：
1. 调用 \`fix_bug\` 进行定位与修复
2. 调用 \`gentest\` 生成回归测试

---

*编排工具: MCP Probe Kit - start_bugfix (requirements loop)*
`;

const LOOP_PROMPT_TEMPLATE_STRICT = `# 🧭 Bug 需求澄清与补全（Requirements Loop | 严格）

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
    { question: "复现步骤是什么？", context: "复现步骤", required: true },
    { question: "环境/版本信息是什么？", context: "环境信息", required: true },
    { question: "期望行为是什么？", context: "期望行为", required: true },
    { question: "实际表现是什么？", context: "实际表现", required: true },
    { question: "影响范围与严重级别如何？", context: "影响范围", required: true },
    { question: "是否有相关日志/错误栈？", context: "日志信息", required: false },
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
      template_profile?: string;
      requirements_mode?: string;
      loop_max_rounds?: number;
      loop_question_budget?: number;
      loop_assumption_cap?: number;
    }>(args, {
      defaultValues: {
        error_message: "",
        stack_trace: "",
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
        template_profile: ["profile", "template_profile", "模板档位", "模板模式"],
        requirements_mode: ["mode", "requirements_mode", "loop", "需求模式"],
        loop_max_rounds: ["max_rounds", "rounds", "最大轮次"],
        loop_question_budget: ["question_budget", "问题数量", "问题预算"],
        loop_assumption_cap: ["assumption_cap", "假设上限"],
      },
    });

    const errorMessage = getString(parsedArgs.error_message);
    const stackTrace = getString(parsedArgs.stack_trace);
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
    };
    if (profileDecision.reason) {
      templateMeta.reason = profileDecision.reason;
    }
    if (profileDecision.warning) {
      templateMeta.warning = profileDecision.warning;
    }

    const headerNotes = [
      `模板档位: ${profileDecision.resolved}${profileDecision.requested === 'auto' ? '（自动）' : ''}`,
    ];
    if (profileDecision.reason) {
      headerNotes.push(`选择理由: ${profileDecision.reason}`);
    }
    if (profileDecision.warning) {
      headerNotes.push(profileDecision.warning);
    }

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
            when: '缺少 docs/project-context.md',
            args: { docs_dir: 'docs' },
            outputs: ['docs/project-context.md'],
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

      const guide = header + loopTemplate
        .replace(/{error_message}/g, errorMessage)
        .replace(/{question_budget}/g, String(questionBudget))
        .replace(/{assumption_cap}/g, String(assumptionCap));

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

    const guide = header + promptTemplate
      .replace(/{error_message}/g, errorMessage)
      .replace(/{stack_trace}/g, stackTrace)
      .replace(/{stack_trace_section}/g, stackTraceSection);

    const plan = {
      mode: 'delegated',
      steps: [
        {
          id: 'context',
          tool: 'init_project_context',
          when: '缺少 docs/project-context.md',
          args: { docs_dir: 'docs' },
          outputs: ['docs/project-context.md'],
        },
        {
          id: 'fix',
          tool: 'fix_bug',
          args: {
            error_message: errorMessage,
            ...(stackTrace ? { stack_trace: stackTrace } : {}),
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
      steps: [
        {
          name: '检查项目上下文',
          status: 'pending',
          description: '检查 docs/project-context.md 是否存在，如不存在则调用 init_project_context',
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
        '调用 fix_bug 工具分析和修复问题',
        '调用 gentest 工具生成回归测试',
        '运行测试验证修复',
      ],
      rootCause: '待分析（需要调用 fix_bug 工具）',
      fixPlan: '待制定（需要调用 fix_bug 工具）',
      testPlan: '待生成（需要调用 gentest 工具）',
      affectedFiles: [],
      metadata: {
        plan,
        template: templateMeta,
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
