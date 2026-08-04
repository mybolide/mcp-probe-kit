/**
 * 统一 UI 开发编排工具
 * 
 * 一键完成整个 UI 开发流程：
 * 1. 检查设计规范
 * 2. 检查/生成组件目录
 * 3. 搜索/生成 UI 模板
 * 4. 渲染最终代码
 */

import { okStructured } from "../lib/response.js";
import { attachHandles } from "../lib/handles.js";
import { renderOrchestrationHeader } from "../lib/orchestration-guidance.js";
import {
  renderDelegatedPlanStateProtocol,
  renderDelegatedPlanSteps,
} from "../lib/delegated-plan-renderer.js";
import {
  buildSkillBridgePlanStep,
  buildSkillHeaderNote,
  detectSkillBridge,
  renderSkillBridgeSection,
} from "../lib/skill-bridge.js";
import { UIReportSchema, RequirementsLoopSchema } from "../schemas/structured-output.js";
import type { RequirementsLoopReport } from "../schemas/structured-output.js";
import {
  reportToolProgress,
  throwIfAborted,
  type ToolExecutionContext,
} from "../lib/tool-execution-context.js";
import {
  loadMemoryInjectionContext,
  renderMemoryGuideSection,
  buildOrchestrationHandles,
} from "../lib/memory-orchestration.js";
import { buildUiPlan } from "./start-ui-plan.js";
import { buildUiReport } from "./start-ui-output.js";
import type { DelegatedPlanStep } from "../lib/delegated-plan-contract.js";
import { buildUiQuestions } from "./start-ui-config.js";
import { normalizeStartUiRequest } from "./start-ui-request.js";

/**
 * 统一 UI 开发编排工具
 */
export async function startUi(args: any, context?: ToolExecutionContext) {
  try {
    throwIfAborted(context?.signal, "start_ui 已取消");
    await reportToolProgress(context, 10, "start_ui: 解析参数与检测项目框架");

    const normalizedRequest = normalizeStartUiRequest(args);
    if (!normalizedRequest.ok) {
      return normalizedRequest.response as any;
    }
    const {
      description,
      framework,
      mode,
      requirementsMode,
      maxRounds,
      questionBudget,
      assumptionCap,
      reviewMaxRounds,
      projectRootPosix,
      visualContract,
      designSystemArgs,
      templateName,
      templateMeta,
      headerNotes,
    } = normalizedRequest.value;

    throwIfAborted(context?.signal, "start_ui 已取消");
    await reportToolProgress(context, 35, "start_ui: 参数解析完成");
    const skillBridge = detectSkillBridge('start_ui');
    const skillBridgeStep = buildSkillBridgePlanStep(skillBridge);
    const skillBridgeSection = renderSkillBridgeSection(skillBridge);
    headerNotes.push(buildSkillHeaderNote(skillBridge));

    const memoryContext = await loadMemoryInjectionContext(description || templateName, 'ui');
    const memoryGuideSection = renderMemoryGuideSection(memoryContext);
    // 记忆优先：先复用历史 UI 资产/模式并规避历史 UI 坑，再进入设计与渲染
    const memoryRecallStep = memoryContext.enabled
      ? [{
          id: 'recall-memory',
          tool: 'search_memory',
          when: '开干前（下方「历史经验与坑」已自动注入相似 UI 资产与坑；需要更多时再调）',
          args: { query: description || templateName, limit: 5 },
          outputs: [],
          note: '先复用历史可复用 UI 组件/布局/交互模式，并规避历史 UI 坑（交互/兼容性/可访问性）',
        }]
      : [];

    // requirements loop 模式
    if (requirementsMode === "loop") {
      throwIfAborted(context?.signal, "start_ui(loop) 已取消");
      await reportToolProgress(context, 70, "start_ui: 生成 loop 计划");

      if (!description) {
        return {
          content: [
            {
              type: "text",
              text: `❌ 缺少必要参数

**用法**:
\`\`\`
start_ui <描述> --requirements_mode=loop
\`\`\``,
            },
          ],
          isError: true,
        };
      }

      const openQuestions = buildUiQuestions(questionBudget).map((q, index) => ({
        id: `Q-${index + 1}`,
        ...q,
      }));

      const requirements = [
        {
          id: "UI-1",
          title: description,
          description: description,
          source: "User" as const,
          acceptance: [
            "WHEN 页面加载 THEN 系统 SHALL 展示加载状态",
            "IF 无数据 THEN 系统 SHALL 展示空态且提示原因",
          ],
        },
      ];

      const assumptions: RequirementsLoopReport['assumptions'] = [];
      const missingFields = openQuestions.map((q) => q.context || q.question);
      const stopReady = openQuestions.length === 0 && assumptions.length === 0;

      const requirementSteps: DelegatedPlanStep[] = [
        {
          id: 'loop-1',
          type: 'agent_action',
          action: 'collect_ui_requirements_from_user',
          requiredInputs: openQuestions.map(({ question }) => question),
          expectedOutputs: ['补全后的页面目标、交互、状态、数据、权限、响应式与可访问性要求'],
          completionEvidence: ['openQuestions 和 assumptions 已更新为当前真实状态'],
          outputs: [],
          note: '支持 elicitation 的 Host 会直接收集；其他 Host 由 Agent 原生向用户提问，不调用隐藏的 ask_user',
        },
        ...(maxRounds > 1
          ? [{
              id: 'loop-2',
              type: 'agent_action' as const,
              action: 'resolve_remaining_ui_questions',
              dependsOn: ['loop-1'],
              when: '仍存在 openQuestions 或高风险 assumptions',
              requiredInputs: ['上一轮未关闭的问题与假设'],
              expectedOutputs: ['可执行的 UI 需求摘要'],
              completionEvidence: ['关键问题已关闭，或记录明确阻断项'],
              outputs: [],
            }]
          : []),
      ];
      const plan = buildUiPlan({
        mode: 'loop',
        description,
        framework,
        templateName,
        projectRoot: projectRootPosix,
        visualContract,
        reviewMaxRounds,
        designSystemArgs,
        memoryEnabled: memoryContext.enabled,
        memoryRecallSteps: memoryRecallStep as DelegatedPlanStep[],
        skillBridgeStep: skillBridgeStep as DelegatedPlanStep,
        requirementSteps,
      });

      const header = renderOrchestrationHeader({
        tool: 'start_ui',
        goal: `UI 需求：${description}`,
        tasks: [
          '按 Requirements Loop 规则提问并更新结构化输出',
          '满足结束条件后按 delegated plan 执行 UI 计划',
        ],
        notes: [
          ...headerNotes,
          ...(memoryContext.enabled ? ['记忆优先: 已自动注入相似历史 UI 资产与坑（见顶部），先复用并规避同类坑；再决定是否沉淀'] : []),
        ],
      });

      const guide = `${header}${memoryGuideSection}${skillBridgeSection}
# 快速开始

## 职责说明
MCP 只提供指导、设计结果与执行计划；Agent 负责使用宿主对话、文件、代码和测试能力完成真实实施。

## 失败处理
工具调用失败时记录原因并按 plan 的条件重试；需求不完整时继续原生对话，不得伪造完成状态。

# UI Requirements Loop

支持 MCP elicitation 的 Host 会直接弹出结构化表单；其他 Host 由 Agent 使用原生对话提问。不要调用 compact 模式不可见的 \`ask_user\`。

## 当前问题
${openQuestions.map((item) => `- ${item.question}`).join('\n')}

${renderDelegatedPlanStateProtocol({
  planId: plan.planId,
  projectRoot: projectRootPosix,
})}

## 与 structuredContent 对称的执行计划
${renderDelegatedPlanSteps(plan.steps)}`;


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
          added: ['UI-1'],
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
          visualDirection: visualContract,
          reviewPolicy: {
            maxRounds: reviewMaxRounds,
            targetScore: visualContract.acceptance.targetScore,
            requiredViewports: visualContract.acceptance.requiredViewports,
            dimensions: visualContract.acceptance.dimensions,
            blockingFailures: visualContract.acceptance.blockingFailures,
          },
          skills: skillBridge,
        },
      };

      await reportToolProgress(context, 95, "start_ui: loop 输出已生成");

      return okStructured(
        guide,
        attachHandles(loopReport, buildOrchestrationHandles(memoryContext)),
        {
          schema: RequirementsLoopSchema,
          note: 'AI 应逐轮补齐 UI 需求；支持 elicitation 时由 Host 收集，否则使用原生对话，再执行结构化 UI 计划',
        }
      );
    }

    // 自动模式实现
    if (mode === "auto") {
      throwIfAborted(context?.signal, "start_ui(auto) 已取消");
      await reportToolProgress(context, 55, "start_ui: 生成智能推荐");

      const inferredProductType = visualContract.objective.productType;
      const inferredStack = framework;


      const plan = buildUiPlan({
        mode: 'auto',
        description,
        framework: inferredStack,
        templateName,
        projectRoot: projectRootPosix,
        visualContract,
        reviewMaxRounds,
        designSystemArgs,
        memoryEnabled: memoryContext.enabled,
        memoryRecallSteps: memoryRecallStep as DelegatedPlanStep[],
        skillBridgeStep: skillBridgeStep as DelegatedPlanStep,
      });

      const header = renderOrchestrationHeader({
        tool: 'start_ui',
        goal: `UI 需求：${description}`,
        tasks: [
          '按 delegated plan 顺序调用工具',
          '锁定视觉方向、生成关键页面并准备截图验收',
        ],
        notes: [
          ...headerNotes,
          ...(memoryContext.enabled ? ['记忆优先: 已自动注入相似历史 UI 资产与坑（见顶部），先复用并规避同类坑'] : []),
        ],
      });

      const smartPlan = `${header}${memoryGuideSection}${skillBridgeSection}
# 快速开始

## 职责说明
MCP 工具只提供视觉方向、结构检索与编排；Agent 负责关键页面实施、真实截图、视觉评分和迭代。

## 失败处理
任一步失败时保留已完成产物、记录失败原因并从该步骤重试；不得跳过失败步骤宣称完成。

## 高级选项
可通过 mode、framework、template 和 template_profile 控制编排方式；未指定时采用安全默认值。

# UI 开发闭环

- 模式：auto
- 目标框架：${inferredStack}
- 设计方向：${visualContract.direction.name}
- 规则：文本步骤与 \`structuredContent.metadata.plan.steps\` 来自同一份计划。

${renderDelegatedPlanStateProtocol({
  planId: plan.planId,
  projectRoot: projectRootPosix,
})}

## 步骤
${renderDelegatedPlanSteps(plan.steps)}`;

      const uiReport = buildUiReport({
        mode: 'auto',
        description,
        framework: inferredStack,
        projectRoot: projectRootPosix,
        plan,
        visualContract,
        reviewMaxRounds,
        templateMeta,
        skillBridge,
      });

      await reportToolProgress(context, 95, "start_ui: auto 输出已生成");

      return okStructured(
        smartPlan,
        attachHandles(uiReport, buildOrchestrationHandles(memoryContext)),
        {
          schema: UIReportSchema,
          note: 'AI 应该按照智能计划执行步骤，并在每个步骤完成后更新 structuredContent',
        }
      );
    }

    if (!description) {
      return {
        content: [
          {
            type: "text",
            text: `❌ 缺少必要参数

**用法**:
\`\`\`
start_ui <描述> [--framework=react|vue|html]
\`\`\`

**示例**:
\`\`\`
start_ui "登录页面"
start_ui "用户列表" --framework=vue
start_ui "设置页面" --framework=react
\`\`\`

**提示**: 
- 确保已运行 \`ui_design_system\` 生成设计系统
- 组件目录会自动生成（如果不存在）
`,
          },
        ],
        isError: true,
      };
    }

    const header = renderOrchestrationHeader({
      tool: 'start_ui',
      goal: `UI 开发：${description}`,
      tasks: [
        '按 delegated plan 顺序调用可见 MCP 工具并执行 Agent 操作',
        '锁定视觉方向、选择页面结构、实施关键页面并完成截图评审',
      ],
      notes: [
        ...headerNotes,
        ...(memoryContext.enabled ? ['记忆增强：已注入相关历史 UI 资产候选'] : []),
      ],
    });


    const plan = buildUiPlan({
      mode: 'manual',
      description,
      framework,
      templateName,
      projectRoot: projectRootPosix,
      visualContract,
      reviewMaxRounds,
      designSystemArgs,
      memoryEnabled: memoryContext.enabled,
      memoryRecallSteps: memoryRecallStep as DelegatedPlanStep[],
      skillBridgeStep: skillBridgeStep as DelegatedPlanStep,
    });

    const guide = `${header}${memoryGuideSection}${skillBridgeSection}
# 快速开始

## 职责说明
MCP 工具只提供视觉方向、结构检索与编排；Agent 负责关键页面实施、真实截图、视觉评分和迭代。

## 失败处理
任一步失败时保留已完成产物、记录失败原因并从该步骤重试；不得跳过失败步骤宣称完成。

## 高级选项
可通过 mode、framework、template 和 template_profile 控制编排方式；未指定时采用安全默认值。

# UI 开发闭环

- 模式：manual
- 目标框架：${framework}
- 视觉方向：${visualContract.direction.name}
- 内容密度：${visualContract.objective.density}
- 目标评分：${visualContract.acceptance.targetScore}/10
- 页面结构：docs/ui/page-structure.json
- 规则：文本步骤与 \`structuredContent.metadata.plan.steps\` 来自同一份计划。

${renderDelegatedPlanStateProtocol({
  planId: plan.planId,
  projectRoot: projectRootPosix,
})}

## 步骤
${renderDelegatedPlanSteps(plan.steps)}`;

    const uiReport = buildUiReport({
      mode: 'manual',
      description,
      framework,
      projectRoot: projectRootPosix,
      plan,
      visualContract,
      reviewMaxRounds,
      templateMeta,
      skillBridge,
    });

    await reportToolProgress(context, 95, "start_ui: manual 输出已生成");

    return okStructured(
      guide,
      attachHandles(uiReport, buildOrchestrationHandles(memoryContext)),
      {
        schema: UIReportSchema,
        note: 'AI 应该按照指南执行步骤，并在每个步骤完成后更新 structuredContent',
      }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `❌ UI 开发流程失败: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
}
