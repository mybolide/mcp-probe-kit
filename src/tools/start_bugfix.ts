import * as fs from "node:fs";
import * as path from "node:path";
import { parseArgs, getString, getNumber } from "../utils/parseArgs.js";
import { okStructured } from "../lib/response.js";
import { attachHandles } from "../lib/handles.js";
import { renderOrchestrationHeader } from "../lib/orchestration-guidance.js";
import { BugFixReportSchema, RequirementsLoopSchema } from "../schemas/structured-output.js";
import type { BugFixReport, RequirementsLoopReport } from "../schemas/structured-output.js";
import {
  reportToolProgress,
  throwIfAborted,
  type ToolExecutionContext,
} from "../lib/tool-execution-context.js";
import { buildBugfixGraphContext } from "../lib/gitnexus-bridge.js";
import {
  buildMemoryPlanStep,
  loadMemoryInjectionContext,
  renderMemoryGuideSection,
  buildOrchestrationHandles,
} from "../lib/memory-orchestration.js";
import { resolveWorkspaceRoot, isLikelyProjectNamedRelativePath } from "../lib/workspace-root.js";
import {
  layoutAbsPath,
  parseLayoutArgsFromRecord,
  resolveProjectContextLayout,
} from "../lib/project-context-layout.js";
import { resolveAnalysisMode, mergeBugfixOrchestrationPlan } from "../lib/src8-guidance.js";
import {
  buildCheckSpecPlanStep,
  renderSpecGatePromptSection,
  resolveBugfixSpecGate,
} from "../lib/spec-gate.js";
import {
  buildDelegatedPlanContract,
  createDelegatedPlanId,
  type DelegatedPlanStep,
} from "../lib/delegated-plan-contract.js";
import {
  LOOP_PROMPT_TEMPLATE_GUIDED,
  LOOP_PROMPT_TEMPLATE_STRICT,
  PROMPT_TEMPLATE_GUIDED,
  PROMPT_TEMPLATE_STRICT,
  buildBugfixQuestions,
  buildBugfixGraphGuideSection,
  buildInvalidProjectRootResponse,
  resolveTemplateProfile,
  type TemplateProfileResolved,
} from "./start-bugfix-guidance.js";
import { buildBugfixReport } from "./start-bugfix-report.js";

/** Bug 修复编排：[检查上下文] → SRC-8 → gentest → converge。 */
type AnalysisMode = 'src8' | 'tbp8';

export async function startBugfix(args: any, context?: ToolExecutionContext) {
  try {
    throwIfAborted(context?.signal, "start_bugfix 已取消");
    await reportToolProgress(context, 10, "start_bugfix: 解析参数");

    // 智能参数解析，支持自然语言输入
    const parsedArgs = parseArgs<{
      error_message?: string;
      description?: string;
      stack_trace?: string;
      code_context?: string;
      project_root?: string;
      docs_dir?: string;
      feature_name?: string;
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
        analysis_mode: "src8",
        template_profile: "auto",
        requirements_mode: "steady",
        loop_max_rounds: 2,
        loop_question_budget: 5,
        loop_assumption_cap: 3,
      },
      primaryField: "error_message", // 纯文本输入默认映射到 error_message 字段
      fieldAliases: {
        error_message: ["error", "err", "message", "错误", "错误信息", "description", "desc", "summary", "问题", "bug", "issue"],
        stack_trace: ["stack", "trace", "堆栈", "调用栈"],
        code_context: ["code_context", "code", "context", "相关代码", "代码上下文"],
        project_root: ["projectRoot", "project_path", "projectPath", "root", "project_root", "项目路径", "项目根目录"],
        docs_dir: ["dir", "output", "目录", "文档目录"],
        feature_name: ["name", "feature", "spec", "功能名", "功能名称", "规格"],
        analysis_mode: ["analysis_mode", "methodology", "rca", "tbp", "分析方法"],
        template_profile: ["profile", "template_profile", "模板档位", "模板模式"],
        requirements_mode: ["mode", "requirements_mode", "loop", "需求模式"],
        loop_max_rounds: ["max_rounds", "rounds", "最大轮次"],
        loop_question_budget: ["question_budget", "问题数量", "问题预算"],
        loop_assumption_cap: ["assumption_cap", "假设上限"],
      },
    });

    const errorMessage = getString(parsedArgs.error_message) || getString(parsedArgs.description);
    const stackTrace = getString(parsedArgs.stack_trace);
    const codeContext = getString(parsedArgs.code_context);
    const projectRoot = getString(parsedArgs.project_root);
    const docsDir = getString(parsedArgs.docs_dir) || "docs";
    const featureNameInput = getString(parsedArgs.feature_name);
    if (isLikelyProjectNamedRelativePath(projectRoot)) {
      return buildInvalidProjectRootResponse(projectRoot);
    }
    const analysisMode = resolveAnalysisMode(getString(parsedArgs.analysis_mode)) as AnalysisMode;
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
    const resolvedProjectRoot = resolveWorkspaceRoot(projectRoot);
    const layout = resolveProjectContextLayout(
      resolvedProjectRoot,
      parseLayoutArgsFromRecord({ docs_dir: docsDir })
    );
    const graphDocs = {
      latestMarkdownPath: layout.latestMarkdownPath,
      latestJsonPath: layout.latestJsonPath,
    };
    const bootstrapState = {
      projectContextExists:
        fs.existsSync(layoutAbsPath(layout, layout.indexPath)) ||
        fs.existsSync(layoutAbsPath(layout, layout.legacyIndexPath)),
      latestMarkdownExists: fs.existsSync(layoutAbsPath(layout, layout.latestMarkdownPath)),
      latestJsonExists: fs.existsSync(layoutAbsPath(layout, layout.latestJsonPath)),
      indexPath: layout.indexPath,
      projectRoot: layout.projectRootPosix,
      layoutManifest: layout.manifestPath,
    };
    const graphDocsMissing = !bootstrapState.latestMarkdownExists || !bootstrapState.latestJsonExists;
    const specGate = resolveBugfixSpecGate({
      featureName: featureNameInput,
      projectRoot: layout.projectRoot,
      docsDir,
      hintText: combinedText,
    });
    const specGateSection = specGate ? renderSpecGatePromptSection(specGate) : '';
    if (specGate) {
      headerNotes.push(
        specGate.detected
          ? `规格闸门: 已自动关联 ${specGate.specDir}/，修复后需 check_spec`
          : `规格闸门: 关联 ${specGate.specDir}/，修复后需 check_spec`
      );
    }
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

    const graphGuideSection = buildBugfixGraphGuideSection({
      latestMarkdownPath: graphDocs.latestMarkdownPath,
      latestJsonPath: graphDocs.latestJsonPath,
      graphDocsMissing,
      graphContext,
    });

    const memoryContext = await loadMemoryInjectionContext(
      [errorMessage, stackTrace, codeContext].filter(Boolean).join("\n"),
      "bugfix"
    );
    const memoryGuideSection = renderMemoryGuideSection(memoryContext);
    const memoryRecallStep = memoryContext.enabled
      ? [{
          id: 'recall-memory',
          tool: 'search_memory',
          when: '开干前（下方「历史经验与坑」已自动注入相似历史修复；需要更多同类案例时再调）',
          args: { query: errorMessage, limit: 5 },
          outputs: [],
          note: '先看历史同类 Bug 的根因与已验证修复，优先复用其修复路径并规避同类坑；据此收敛 SRC-4 真因方向',
        }]
      : [];

    const buildOrchestrationPlan = (options?: {
      src8When?: string;
      loopSteps?: Array<{
        id: string;
        tool?: string;
        action?: string;
        args?: Record<string, unknown>;
        outputs?: string[];
        when?: string;
        note?: string;
      }>;
    }) => {
      const contextStep = {
        id: 'context',
        tool: 'init_project_context',
        when: `缺少 ${layout.indexPath} 或 ${graphDocs.latestMarkdownPath} / ${graphDocs.latestJsonPath}`,
        args: {
          docs_dir: layout.contextRoot,
          ...(projectRoot ? { project_root: projectRoot } : {}),
        },
        outputs: [layout.indexPath, graphDocs.latestMarkdownPath, graphDocs.latestJsonPath],
        note: `兼容老项目：如果旧项目没有 graph-insights/latest.*，先补齐图谱初始化再进入 bug 收敛`,
      };

      const src8Plan = mergeBugfixOrchestrationPlan({
        src8Input: {
          error_message: errorMessage,
          stack_trace: stackTrace || undefined,
          analysis_mode: analysisMode,
          code_context: graphCodeContext || undefined,
          project_root: resolvedProjectRoot,
          includeMemorize: !memoryContext.enabled,
        },
        preambleSteps: [...memoryRecallStep, contextStep, ...(options?.loopSteps ?? [])],
        deferMemorize: memoryContext.enabled,
        appendSteps: [
          ...(specGate ? [buildCheckSpecPlanStep(specGate.featureName, specGate.docsDir)] : []),
          ...(memoryContext.enabled ? [buildMemoryPlanStep('bugfix')] : []),
        ],
      });

      if (options?.src8When) {
        const firstSrc8 = src8Plan.steps.find((step) => step.id.startsWith('src8-'));
        if (firstSrc8) {
          firstSrc8.when = options.src8When;
        }
      }

      const contract = buildDelegatedPlanContract({
        planId: createDelegatedPlanId('bugfix', `${errorMessage}:${requirementsMode}`),
        workflow: 'bugfix',
        workflowVersion: '4.0.0',
        objective: `定位真因并修复 Bug：${errorMessage}`,
        globalRules: [
          '未完成 SRC-8 真因收敛前不得直接实施猜测性修复',
          'Agent 必须使用宿主能力完成真实代码修改和测试执行',
          '修复完成必须包含回归验证与防复发措施',
          '历史记忆仅作为候选证据，当前项目事实与代码优先',
        ],
        completionCriteria: [
          '真因能够解释全部关键现象并排除主要竞争假设',
          '修复方案作用于原因层而不是仅隐藏症状',
          '回归测试与关联规格闸门通过',
          '可复用的成功或失败经验已评估是否沉淀',
        ],
        memoryPolicy: {
          recallBeforeExecution: memoryContext.enabled,
          extractAfterValidation: memoryContext.enabled,
        },
        steps: src8Plan.steps as DelegatedPlanStep[],
      });

      return {
        ...src8Plan,
        ...contract,
      };
    };

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

      const plan = buildOrchestrationPlan({
        src8When: 'stopConditions.ready=true',
        loopSteps: [
          {
            id: 'loop-1',
            tool: 'ask_user',
            args: { questions: openQuestions.map(({ question, context, required }) => ({ question, context, required })) },
            outputs: [],
          },
          ...(maxRounds > 1
            ? [{
                id: 'loop-2',
                tool: 'ask_user',
                when: '仍存在 openQuestions 或 assumptions',
                args: { questions: '[根据上一轮补全结果生成问题]' },
                outputs: [],
              }]
            : []),
        ],
      });

      const header = renderOrchestrationHeader({
        tool: 'start_bugfix',
        goal: `修复 Bug：${errorMessage}`,
        tasks: [
          '按 Requirements Loop 规则提问并更新结构化输出',
          '满足结束条件后按 delegated plan 执行修复与测试',
        ],
        notes: [
          ...headerNotes,
          ...(memoryContext.enabled ? ['记忆优先: 已自动注入历史同类 Bug 的根因与修复（见顶部），先复用、规避同类坑；结束后评估沉淀'] : []),
        ],
      });

      const loopTemplate = profileDecision.resolved === 'strict'
        ? LOOP_PROMPT_TEMPLATE_STRICT
        : LOOP_PROMPT_TEMPLATE_GUIDED;

      const renderedLoopPrompt = loopTemplate
        .replace(/{error_message}/g, errorMessage)
        .replace(/{analysis_mode}/g, analysisMode)
        .replace(/{question_budget}/g, String(questionBudget))
        .replace(/{assumption_cap}/g, String(assumptionCap));
      const guide = header + memoryGuideSection + renderedLoopPrompt + graphGuideSection;

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
        attachHandles(loopReport, buildOrchestrationHandles(memoryContext)),
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
        '按 delegated plan 顺序执行 metadata.plan.steps（src8-1~8）',
        '完成修复、回归测试、记忆候选准备与 converge 收敛',
      ],
      notes: [
        ...headerNotes,
        ...(memoryContext.enabled ? ['记忆优先: 已自动注入历史同类 Bug 的根因与修复（见顶部），先复用、规避同类坑'] : []),
      ],
    });

    const promptTemplate = profileDecision.resolved === 'strict'
      ? PROMPT_TEMPLATE_STRICT
      : PROMPT_TEMPLATE_GUIDED;

    const renderedPrompt = promptTemplate
      .replace(/{error_message}/g, errorMessage)
      .replace(/{stack_trace}/g, stackTrace)
      .replace(/{analysis_mode}/g, analysisMode)
      .replace(/{stack_trace_section}/g, stackTraceSection)
      .replace(/{spec_gate_section}/g, specGateSection);
    const guide = header + memoryGuideSection + renderedPrompt + graphGuideSection;

    const plan = buildOrchestrationPlan();

    const bugfixReport = buildBugfixReport({
      errorMessage,
      stackTrace,
      analysisMode,
      indexPath: layout.indexPath,
      graphDocs,
      graphDocsMissing,
      graphCodeContext,
      bootstrapState,
      graphContext,
      ...(specGate ? { specGate } : {}),
      memoryEnabled: memoryContext.enabled,
      plan,
      templateMeta,
    });

    await reportToolProgress(context, 95, "start_bugfix: 执行计划输出已生成");

    return okStructured(
      guide,
      attachHandles(bugfixReport, buildOrchestrationHandles(memoryContext)),
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
