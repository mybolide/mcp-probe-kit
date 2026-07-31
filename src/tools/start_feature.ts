import * as fs from "node:fs";
import * as path from "node:path";
import { parseArgs, getString, getNumber } from "../utils/parseArgs.js";
import { okStructured } from "../lib/response.js";
import { attachHandles } from "../lib/handles.js";
import { renderOrchestrationHeader } from "../lib/orchestration-guidance.js";
import { FeatureReportSchema, RequirementsLoopSchema } from "../schemas/structured-output.js";
import type { FeatureReport, RequirementsLoopReport } from "../schemas/structured-output.js";
import {
  reportToolProgress,
  throwIfAborted,
  type ToolExecutionContext,
} from "../lib/tool-execution-context.js";
import { buildFeatureGraphContext } from "../lib/gitnexus-bridge.js";
import { renderDelegatedPlanSteps } from "../lib/delegated-plan-renderer.js";
import { addFeature } from "./add_feature.js";
import {
  buildMemoryPlanStep,
  loadMemoryInjectionContext,
  renderMemoryGuideSection,
  buildOrchestrationHandles,
} from "../lib/memory-orchestration.js";
import { resolveWorkspaceRoot, isLikelyProjectNamedRelativePath, buildProjectRootRetryHint } from "../lib/workspace-root.js";
import {
  layoutAbsPath,
  parseLayoutArgsFromRecord,
  resolveProjectContextLayout,
} from "../lib/project-context-layout.js";
import {
  normalizeDocsDir,
  normalizeFeatureName,
  normalizeSpecLayoutRequest,
  normalizeSubspecs,
  resolveSpecLayoutDecision,
  type SpecLayout,
  type SpecLayoutDecision,
  type SubspecDefinition,
} from "../lib/parent-child-spec.js";
import {
  buildDelegatedPlanContract,
  createDelegatedPlanId,
  type DelegatedPlanStep,
} from "../lib/delegated-plan-contract.js";

/**
 * start_feature 智能编排工具
 * 
 * 场景：开发新功能
 * 编排：[检查上下文] → 内嵌规格草稿 → check_spec → estimate
 */

/**
 * 从自然语言输入中提取功能名和描述
 * @param input - 自然语言输入
 * @returns 提取的功能名和描述
 */
function extractFeatureInfo(input: string): { name: string; description: string } {
  // 移除常见的引导词
  let text = input
    .replace(/^(添加|实现|开发|创建|新增|生成|构建|做|要|想要|需要|帮我|请|麻烦)/i, "")
    .trim();
  
  // 移除结尾的"功能"、"模块"等词
  text = text.replace(/(功能|模块|特性|组件|系统|服务)$/i, "").trim();
  
  // 如果文本很短（少于20个字符），直接作为功能名
  if (text.length < 20) {
    const name = text
      .toLowerCase()
      .replace(/[\s\u4e00-\u9fa5]+/g, "-") // 将空格和中文替换为连字符
      .replace(/[^a-z0-9-]/g, "") // 移除非字母数字和连字符
      .replace(/-+/g, "-") // 合并多个连字符
      .replace(/^-|-$/g, ""); // 移除首尾连字符
    
    return {
      name: name || "new-feature",
      description: input,
    };
  }
  
  // 如果文本较长，尝试提取关键词作为功能名
  // 提取前几个关键词
  const words = text.split(/[\s,，、]+/).filter(w => w.length > 0);
  const keyWords = words.slice(0, 3).join(" ");
  
  const name = keyWords
    .toLowerCase()
    .replace(/[\s\u4e00-\u9fa5]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  
  return {
    name: name || "new-feature",
    description: input,
  };
}

function buildOpenQuestions(questionBudget: number) {
  const base = [
    { question: "目标用户或角色是谁？", context: "角色定义", required: true },
    { question: "核心业务场景与触发条件是什么？", context: "业务场景", required: true },
    { question: "有哪些关键约束或权限边界？", context: "权限与边界", required: true },
    { question: "异常/失败时应如何处理？", context: "异常处理", required: true },
    { question: "依赖哪些系统或接口？", context: "依赖关系", required: true },
  ];
  return base.slice(0, Math.max(0, questionBudget));
}

function buildSpecOutputs(
  docsDir: string,
  featureName: string,
  specLayout: SpecLayout,
  subspecs: SubspecDefinition[],
): string[] {
  const root = `${docsDir}/specs/${featureName}`;
  const flatFiles = [`${root}/requirements.md`, `${root}/design.md`, `${root}/tasks.md`];
  if (specLayout === 'flat') {
    return flatFiles;
  }
  return [
    `${root}/README.md`,
    ...flatFiles,
    `${root}/spec-manifest.json`,
    ...(subspecs.length > 0
      ? subspecs.flatMap((subspec) => [
          `${root}/subspecs/${subspec.id}/spec.md`,
          `${root}/subspecs/${subspec.id}/tasks.md`,
        ])
      : [
          `${root}/subspecs/<subspec-id>/spec.md`,
          `${root}/subspecs/<subspec-id>/tasks.md`,
        ]),
  ];
}

function buildSubspecDecompositionStep(
  featureName: string,
  layoutDecision: SpecLayoutDecision,
): DelegatedPlanStep[] {
  if (!layoutDecision.requiresSubspecDefinition) {
    return [];
  }
  return [{
    id: 'decompose-spec',
    type: 'agent_action',
    action: `根据已确认需求把 ${featureName} 拆分为 2-8 个职责单一、可独立验收的子规格，并生成 SubspecDefinition[] 后重新调用 start_feature`,
    when: '需求范围与 FR-n 已明确后、生成 parent-child 规格草稿前',
    requiredInputs: ['已确认的功能需求与范围边界', '代码图谱与模块边界', 'FR-n 需求编号'],
    expectedOutputs: ['subspecs 数组：每项包含 id、title、fr 和可选 dependsOn'],
    completionEvidence: [
      '每个 FR-n 至少映射到一个子规格',
      '子规格之间无循环依赖',
      '跨模块契约留在母规格，模块实现细节归入子规格',
    ],
    qualityGates: ['子规格数量与项目复杂度相称', '不存在仅按文件夹机械拆分的子规格'],
    onFailure: {
      strategy: 'ask_user',
      instruction: '模块边界不明确时，先向用户确认交付范围或调用 code_insight 收敛边界',
    },
    note: `自动布局评分 ${layoutDecision.score}；原因：${layoutDecision.reasons.join('；')}`,
  }];
}

export async function startFeature(args: any, context?: ToolExecutionContext) {
  try {
    throwIfAborted(context?.signal, "start_feature 已取消");
    await reportToolProgress(context, 10, "start_feature: 解析参数");

    // 智能参数解析，支持自然语言输入
    const parsedArgs = parseArgs<{
      feature_name?: string;
      description?: string;
      docs_dir?: string;
      project_root?: string;
      template_profile?: string;
      spec_layout?: string;
      subspecs?: unknown;
      requirements_mode?: string;
      loop_max_rounds?: number;
      loop_question_budget?: number;
      loop_assumption_cap?: number;
      input?: string;
    }>(args, {
      defaultValues: {
        feature_name: "",
        description: "",
        docs_dir: "docs",
        template_profile: "auto",
        spec_layout: "auto",
        requirements_mode: "steady",
        loop_max_rounds: 2,
        loop_question_budget: 5,
        loop_assumption_cap: 3,
      },
      primaryField: "input", // 纯文本输入默认映射到 input 字段
      fieldAliases: {
        feature_name: ["name", "feature", "功能名", "功能名称"],
        description: ["desc", "requirement", "描述", "需求"],
        docs_dir: ["dir", "output", "目录", "文档目录"],
        project_root: ["projectRoot", "project_path", "projectPath", "root", "project_root", "项目路径", "项目根目录"],
        template_profile: ["profile", "template_profile", "模板档位", "模板模式"],
        spec_layout: ["layout", "specLayout", "规格布局"],
        subspecs: ["sub_specs", "子规格", "子模块"],
        requirements_mode: ["mode", "requirements_mode", "loop", "需求模式"],
        loop_max_rounds: ["max_rounds", "rounds", "最大轮次"],
        loop_question_budget: ["question_budget", "问题数量", "问题预算"],
        loop_assumption_cap: ["assumption_cap", "假设上限"],
      },
    });

    let featureName = getString(parsedArgs.feature_name);
    let description = getString(parsedArgs.description);
    const docsDir = normalizeDocsDir(getString(parsedArgs.docs_dir), "docs");
    const projectRoot = getString(parsedArgs.project_root);
    if (isLikelyProjectNamedRelativePath(projectRoot)) {
      return {
        content: [{
          type: "text",
          text: `拒绝执行 feature 编排：project_root 不能传带项目名的半相对路径，例如 ${projectRoot}。请改为传项目根目录绝对路径。`,
        }],
        isError: true,
        structuredContent: {
          error_code: "INVALID_PROJECT_ROOT",
          rejected_project_root: projectRoot,
          retry_hint: buildProjectRootRetryHint(projectRoot),
        },
      };
    }
    const templateProfile = getString(parsedArgs.template_profile) || "auto";
    const specLayoutRequest = normalizeSpecLayoutRequest(parsedArgs.spec_layout);
    const requirementsMode = getString(parsedArgs.requirements_mode) || "steady";
    const maxRounds = getNumber(parsedArgs.loop_max_rounds, 2);
    const questionBudget = getNumber(parsedArgs.loop_question_budget, 5);
    const assumptionCap = getNumber(parsedArgs.loop_assumption_cap, 3);

    throwIfAborted(context?.signal, "start_feature 已取消");
    await reportToolProgress(context, 35, "start_feature: 参数解析完成");

    // 如果是纯自然语言输入（input 字段有值但 feature_name 和 description 为空）
    const input = getString(parsedArgs.input);
    if (input && !featureName && !description) {
      // 智能提取功能名和描述
      const extracted = extractFeatureInfo(input);
      featureName = extracted.name;
      description = extracted.description;
    }

    // 如果只有 description 没有 feature_name，尝试从 description 提取
    if (!featureName && description) {
      const extracted = extractFeatureInfo(description);
      featureName = extracted.name;
      if (!description || description === featureName) {
        description = extracted.description;
      }
    }

    if (!featureName || !description) {
      throw new Error(
        "请提供功能名称和描述。\n\n" +
        "示例用法：\n" +
        "- 自然语言：'开发用户认证功能'\n" +
        "- 详细描述：'实现用户登录、注册和密码重置功能'\n" +
        "- JSON格式：{\"feature_name\": \"user-auth\", \"description\": \"用户认证功能\"}"
      );
    }
    featureName = normalizeFeatureName(featureName);
    const layoutDecision = resolveSpecLayoutDecision({
      requested: specLayoutRequest,
      description,
      subspecs: parsedArgs.subspecs,
    });
    const specLayout = layoutDecision.resolved;
    let subspecs: SubspecDefinition[] = [];
    if (specLayout === 'parent-child' && Array.isArray(parsedArgs.subspecs) && parsedArgs.subspecs.length > 0) {
      subspecs = normalizeSubspecs(parsedArgs.subspecs, specLayout);
    } else if (
      specLayout === 'parent-child'
      && parsedArgs.subspecs !== undefined
      && parsedArgs.subspecs !== null
      && !Array.isArray(parsedArgs.subspecs)
    ) {
      subspecs = normalizeSubspecs(parsedArgs.subspecs, specLayout);
    }
    const subspecDecompositionSteps = buildSubspecDecompositionStep(featureName, {
      ...layoutDecision,
      requiresSubspecDefinition: specLayout === 'parent-child' && subspecs.length === 0,
    });
    const specOutputs = buildSpecOutputs(docsDir, featureName, specLayout, subspecs);
    const canBuildEmbeddedSpecDraft = specLayout === 'flat' || subspecs.length > 0;
    const embeddedSpecResult = canBuildEmbeddedSpecDraft
      ? await addFeature({
          feature_name: featureName,
          description,
          docs_dir: docsDir,
          template_profile: templateProfile,
          spec_layout: specLayout,
          ...(specLayout === 'parent-child' ? { subspecs } : {}),
        })
      : null;
    const embeddedSpecDraft = embeddedSpecResult
      ? {
          templateProfile,
          specLayout,
          subspecs,
          specOutputs,
          guidance: embeddedSpecResult.content.find((item) => item.type === 'text')?.text ?? '',
          structuredContent:
            'structuredContent' in embeddedSpecResult
              ? embeddedSpecResult.structuredContent ?? null
              : null,
        }
      : null;

    throwIfAborted(context?.signal, "start_feature 已取消");
    await reportToolProgress(context, 55, "start_feature: 刷新图谱并收敛需求范围");
    const resolvedProjectRoot = resolveWorkspaceRoot(projectRoot);
    const layout = resolveProjectContextLayout(
      resolvedProjectRoot,
      parseLayoutArgsFromRecord({ docs_dir: docsDir })
    );
    const projectRootAbs = layout.projectRoot;
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
    const graphContext = await buildFeatureGraphContext({
      featureName,
      description,
      projectRoot: projectRoot || undefined,
      signal: context?.signal,
    });
    const graphStatusNote = graphContext.available
      ? `任务图谱收敛: 可用（${graphContext.mode}）`
      : "任务图谱收敛: 已降级（自动回退）";
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
- 使用方式: 先参考基线图谱，再使用本次任务图谱线索约束模块边界和改动范围
`;

    const estimateCodeContext = [
      `参考生成的 ${docsDir}/specs/${featureName}/tasks.md`,
      `如存在 ${graphDocs.latestMarkdownPath}，请一并参考其中的模块依赖和调用链摘要`,
      ...(graphContext.available
        ? [
            graphContext.summary ? `任务图谱摘要: ${graphContext.summary}` : "",
            ...graphContext.highlights.slice(0, 2).map((item) => `任务图谱线索: ${item}`),
          ]
        : []),
    ]
      .filter(Boolean)
      .join("\n");

    const memoryContext = await loadMemoryInjectionContext(`${featureName}\n${description}`, 'feature');
    const memoryGuideSection = renderMemoryGuideSection(memoryContext);
    // 记忆优先：把"先检索消化历史经验/坑"作为编排的显式第一步
    const memoryRecallStep = memoryContext.enabled
      ? [{
          id: 'recall-memory',
          tool: 'search_memory',
          when: '开干前（下方「历史经验与坑」已自动注入 top 命中；需要更多历史需求/坑时再调）',
          args: { query: `${featureName} ${description}`, limit: 5 },
          outputs: [],
          note: '先消化历史经验与可复用模式，并逐条核对「历史坑」是否已在本次设计中规避；据此收敛需求范围，并把要点填入 requirements.md 的「历史经验与坑」节',
        }]
      : [];

    if (requirementsMode === "loop") {
      throwIfAborted(context?.signal, "start_feature(loop) 已取消");
      await reportToolProgress(context, 70, "start_feature: 生成 loop 计划");

      const openQuestions = buildOpenQuestions(questionBudget).map((q, index) => ({
        id: `Q-${index + 1}`,
        ...q,
      }));

      const requirements = [
        {
          id: "FR-1",
          title: featureName,
          description: description,
          source: "User" as const,
          acceptance: [
            `WHEN 用户触发 ${featureName} THEN 系统 SHALL 按需求响应`,
            `IF 条件不满足 THEN 系统 SHALL 给出明确提示`,
          ],
        },
      ];

      const assumptions = [] as RequirementsLoopReport['assumptions'];
      const missingFields = openQuestions.map((q) => q.context || q.question);
      const stopReady = openQuestions.length === 0 && assumptions.length === 0;

      const plan = buildDelegatedPlanContract({
        planId: createDelegatedPlanId('feature', `${featureName}:loop`),
        workflow: 'feature',
        workflowVersion: '4.0.0',
        objective: `澄清并规划新功能：${featureName}`,
        globalRules: [
          'Agent 必须按步骤顺序调用 MCP，并使用宿主能力完成真实文件与代码操作',
          'check_spec 未通过前不得进入实现阶段',
          '历史记忆仅作为参考，当前项目事实与代码优先',
        ],
        completionCriteria: [
          '关键需求问题已关闭或被明确记录为假设',
          '规格文档已生成并通过 check_spec',
          '工作量与主要风险已完成评估',
        ],
        memoryPolicy: {
          recallBeforeExecution: memoryContext.enabled,
          extractAfterValidation: memoryContext.enabled,
        },
        steps: [
          ...memoryRecallStep,
          {
            id: 'context',
            tool: 'init_project_context',
            when: `缺少 ${layout.indexPath} 或 ${graphDocs.latestMarkdownPath} / ${graphDocs.latestJsonPath}`,
            args: {
              docs_dir: docsDir,
              ...(projectRoot ? { project_root: projectRoot } : {}),
            },
            outputs: [layout.indexPath, graphDocs.latestMarkdownPath, graphDocs.latestJsonPath],
            note: `兼容老项目：即使已有旧版 project-context，只要缺少图谱文档，也要先补齐 ${graphDocs.latestMarkdownPath}`,
          },
          {
            id: 'loop-1',
            type: 'agent_action',
            action: 'collect_requirements_from_user',
            requiredInputs: openQuestions.map(({ question }) => question),
            expectedOutputs: ['合并用户回答后的完整需求摘要', '已关闭或明确保留的 openQuestions'],
            outputs: [],
            note: '支持 elicitation 的 Host 会在本次工具调用中直接收集；不支持时由 Agent 原生向用户提问，不调用隐藏的 ask_user 工具',
          },
          ...(maxRounds > 1
            ? [
                {
                  id: 'loop-2',
                  type: 'agent_action' as const,
                  action: 'resolve_remaining_requirements',
                  when: '仍存在 openQuestions 或高风险 assumptions',
                  requiredInputs: ['上一轮未关闭的问题与假设'],
                  expectedOutputs: ['可执行的完整需求摘要'],
                  outputs: [],
                },
              ]
            : []),
          {
            id: 'resume-feature',
            type: 'tool',
            tool: 'start_feature',
            when: '关键问题已关闭后',
            args: {
              feature_name: featureName,
              description: '[将用户确认答案合并进原始 description 后传入]',
              docs_dir: docsDir,
              template_profile: templateProfile,
              spec_layout: specLayout,
              requirements_mode: 'steady',
              ...(projectRoot ? { project_root: projectRoot } : {}),
              ...(specLayout === 'parent-child' && subspecs.length > 0 ? { subspecs } : {}),
            },
            outputs: specOutputs,
            note: '第二次 start_feature 会返回内嵌规格草稿、check_spec 与 estimate 的闭环计划',
          },
          ...(memoryContext.enabled ? [buildMemoryPlanStep('feature')] : []),
        ] as DelegatedPlanStep[],
      });

      const header = renderOrchestrationHeader({
        tool: 'start_feature',
        goal: `开发新功能：${featureName}`,
        tasks: [
          '按 Requirements Loop 规则提问并更新结构化输出',
          '满足结束条件后生成规格并完成估算',
        ],
        notes: [
          `模板档位: ${templateProfile}`,
          `规格布局: ${specLayout}（请求: ${layoutDecision.requested}；评分: ${layoutDecision.score}）`,
          ...layoutDecision.reasons.map((reason) => `布局依据: ${reason}`),
          graphStatusNote,
          ...(memoryContext.enabled ? ['记忆优先: 已自动注入历史经验与坑（见顶部），开干前先消化、约束范围并规避同类坑；结束后评估是否沉淀'] : []),
        ],
      });

      const guide = `${header}${memoryGuideSection}
# Requirements Loop

本次需要先补齐需求。支持 MCP elicitation 的 Host 会直接弹出结构化表单；其他 Host 由 Agent 使用原生对话向用户提问。不要调用 compact 模式中不可见的 \`ask_user\`。

## 当前问题
${openQuestions.map((item) => `- ${item.question}`).join('\n')}

## 与 structuredContent 对称的执行计划
${renderDelegatedPlanSteps(plan.steps)}
${graphGuideSection}`;

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
          added: ['FR-1'],
          modified: [],
          removed: [],
        },
        validation: {
          passed: stopReady,
          missingFields: missingFields,
          warnings: [],
        },
        stopConditions: {
          ready: stopReady,
          reasons: stopReady ? ['所有关键问题已确认'] : ['存在待确认问题'],
        },
        metadata: {
          plan,
          layoutDecision,
          graphDocs,
          bootstrapState: {
            ...bootstrapState,
            graphDocsMissing,
          },
          graphContext,
        },
      };

      await reportToolProgress(context, 95, "start_feature: loop 输出已生成");

      return okStructured(
        guide,
        attachHandles(loopReport, buildOrchestrationHandles(memoryContext)),
        {
          schema: RequirementsLoopSchema,
          note: 'Agent 应逐轮澄清需求；支持 elicitation 时由 Host 收集，否则使用原生对话，再重新调用 start_feature 进入 steady 计划',
        }
      );
    }

    const header = renderOrchestrationHeader({
      tool: 'start_feature',
      goal: `开发新功能：${featureName}`,
      tasks: [
        '按 delegated plan 顺序调用工具',
        '生成规格文档并完成工作量估算',
      ],
        notes: [
          `模板档位: ${templateProfile}`,
          graphStatusNote,
          ...(memoryContext.enabled ? ['记忆优先: 已自动注入历史经验与坑（见顶部），开干前先消化、约束范围并规避同类坑'] : []),
        ],
    });

    const specPlanSteps: DelegatedPlanStep[] = embeddedSpecDraft
      ? [
          {
            id: 'write-spec',
            type: 'agent_action',
            action: 'write_embedded_feature_spec',
            requiredInputs: ['structuredContent.metadata.specDraft'],
            expectedOutputs: specOutputs,
            outputs: specOutputs,
            note: '规格模板已经由 start_feature 内部生成；Agent 直接按内嵌草稿写入并补全占位',
          },
          {
            id: 'check-spec',
            type: 'tool',
            tool: 'check_spec',
            when: 'requirements/design/tasks 落盘后、进入估算或实现前',
            args: { feature_name: featureName, docs_dir: docsDir, ...(projectRoot ? { project_root: projectRoot } : {}) },
            outputs: [],
            note: '未通过则按报告补全后重跑；通过前不要写实现代码',
          },
          {
            id: 'estimate',
            type: 'tool',
            tool: 'estimate',
            args: {
              task_description: `实现 ${featureName} 功能：${description}`,
              code_context: estimateCodeContext,
            },
            outputs: [],
          },
        ]
      : [
          {
            id: 'resume-with-subspecs',
            type: 'tool',
            tool: 'start_feature',
            when: 'decompose-spec 已产生完整 SubspecDefinition[] 后',
            args: {
              feature_name: featureName,
              description,
              docs_dir: docsDir,
              template_profile: templateProfile,
              spec_layout: 'parent-child',
              subspecs: '[填入 decompose-spec 产生的 SubspecDefinition[]]',
              requirements_mode: 'steady',
              ...(projectRoot ? { project_root: projectRoot } : {}),
            },
            outputs: specOutputs,
            note: '再次调用 start_feature 以生成内嵌 parent-child 规格草稿',
          },
        ];


    const plan = buildDelegatedPlanContract({
      planId: createDelegatedPlanId('feature', `${featureName}:steady`),
      workflow: 'feature',
      workflowVersion: '4.0.0',
      objective: `规划并实施新功能：${featureName}`,
      globalRules: [
        'Agent 必须按步骤顺序调用 MCP，并使用宿主能力完成真实文件与代码操作',
        'check_spec 未通过前不得进入实现阶段',
        '不得把 delegated plan 的输出误认为代码已经实施',
        '历史记忆仅作为参考，当前项目事实与代码优先',
      ],
      completionCriteria: [
        '规格文档已生成并通过 check_spec',
        '工作量与主要风险已完成评估',
        'Agent 已按 tasks.md 完成实现、测试与必要审查',
      ],
      memoryPolicy: {
        recallBeforeExecution: memoryContext.enabled,
        extractAfterValidation: memoryContext.enabled,
      },
      steps: [
        ...memoryRecallStep,
        {
          id: 'context',
          tool: 'init_project_context',
          when: `缺少 ${layout.indexPath} 或 ${graphDocs.latestMarkdownPath} / ${graphDocs.latestJsonPath}`,
          args: {
            docs_dir: docsDir,
            ...(projectRoot ? { project_root: projectRoot } : {}),
          },
          outputs: [layout.indexPath, graphDocs.latestMarkdownPath, graphDocs.latestJsonPath],
          note: `兼容老项目：即使已有旧版 project-context，只要缺少图谱文档，也要先补齐 ${graphDocs.latestMarkdownPath}`,
        },
        ...subspecDecompositionSteps,
        ...specPlanSteps,
        ...(memoryContext.enabled ? [buildMemoryPlanStep('feature')] : []),
      ] as DelegatedPlanStep[],
    });

    const specDraftSection = embeddedSpecDraft
      ? `
## 内嵌规格草稿

规格模板已放在 \`structuredContent.metadata.specDraft\`。Agent 必须据此写入并补全 ${specOutputs.length} 个规格文件，不要重复生成规格草稿。`
      : `
## Parent-Child 分解

当前尚未提供子规格定义。先完成 \`decompose-spec\`，再按计划重新调用 \`start_feature\` 并传入 SubspecDefinition[]。`;
    const guide = `${header}${memoryGuideSection}
# 新功能开发闭环

- 功能：${featureName}
- 布局：${specLayout}（请求：${layoutDecision.requested}）
- 规则：文本步骤与 \`structuredContent.metadata.plan.steps\` 来自同一份计划。
${specDraftSection}

## 执行计划
${renderDelegatedPlanSteps(plan.steps)}
${graphGuideSection}`;

    // 创建结构化的功能开发报告
    const featureReport: FeatureReport = {
      summary: `新功能开发工作流：${featureName}`,
      status: 'pending',
      steps: [
        {
          name: '检查项目上下文',
          status: 'pending',
          description: `检查 ${layout.indexPath} 与 graph-insights/latest.* 是否存在，缺失则调用 init_project_context`,
        },
        {
          name: '生成功能规格',
          status: 'pending',
          description: '使用 start_feature 内嵌的 specDraft 写入并补全需求、设计和任务文档',
        },
        {
          name: '工作量估算',
          status: 'pending',
          description: '调用 estimate 工具进行工作量估算',
        },
      ],
      artifacts: [],
      nextSteps: [
        '检查并读取项目上下文文档',
        `如果缺少 ${graphDocs.latestMarkdownPath} / ${graphDocs.latestJsonPath}，先调用 init_project_context 补齐图谱初始化`,
        `优先读取 ${graphDocs.latestMarkdownPath} 获取模块依赖与调用链摘要`,
        '使用 structuredContent.metadata.specDraft 写入并补全功能规格文档',
        '调用 check_spec 校验规格完整性，未通过先补全再重跑（通过前不要写实现代码）',
        '调用 estimate 工具进行工作量估算',
        '按照 tasks.md 开始开发',
      ],
      specArtifacts: [
        {
          path: `${docsDir}/specs/${featureName}/requirements.md`,
          type: 'requirements',
        },
        {
          path: `${docsDir}/specs/${featureName}/design.md`,
          type: 'design',
        },
        {
          path: `${docsDir}/specs/${featureName}/tasks.md`,
          type: 'tasks',
        },
      ],
      estimate: {
        optimistic: '待估算',
        normal: '待估算',
        pessimistic: '待估算',
      },
      dependencies: [],
      metadata: {
        plan,
        specDraft: embeddedSpecDraft,
        layoutDecision,
        graphDocs,
        bootstrapState: {
          ...bootstrapState,
          graphDocsMissing,
        },
        graphContext,
      },
    };

    await reportToolProgress(context, 95, "start_feature: 执行计划输出已生成");

    return okStructured(
      guide,
      attachHandles(featureReport, buildOrchestrationHandles(memoryContext)),
      {
        schema: FeatureReportSchema,
        note: 'AI 应该按照指南执行步骤，并在每个步骤完成后更新 structuredContent 中的状态和估算信息',
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
