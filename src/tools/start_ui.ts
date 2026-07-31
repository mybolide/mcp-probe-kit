/**
 * 统一 UI 开发编排工具
 * 
 * 一键完成整个 UI 开发流程：
 * 1. 检查设计规范
 * 2. 检查/生成组件目录
 * 3. 搜索/生成 UI 模板
 * 4. 渲染最终代码
 */

import { parseArgs, getString, getNumber } from "../utils/parseArgs.js";
import { getReasoningEngine } from "./ui-ux-tools.js";
import { DesignRequest } from "../utils/design-reasoning-engine.js";
import { okStructured } from "../lib/response.js";
import { attachHandles } from "../lib/handles.js";
import { renderOrchestrationHeader } from "../lib/orchestration-guidance.js";
import { renderDelegatedPlanSteps } from "../lib/delegated-plan-renderer.js";
import {
  buildSkillBridgePlanStep,
  buildSkillHeaderNote,
  detectSkillBridge,
  renderSkillBridgeSection,
} from "../lib/skill-bridge.js";
import { UIReportSchema, RequirementsLoopSchema } from "../schemas/structured-output.js";
import type { UIReport, RequirementsLoopReport } from "../schemas/structured-output.js";
import { detectProjectType } from "../lib/project-detector.js";
import { resolveWorkspaceRoot, isLikelyProjectNamedRelativePath, buildProjectRootRetryHint } from "../lib/workspace-root.js";
import {
  reportToolProgress,
  throwIfAborted,
  type ToolExecutionContext,
} from "../lib/tool-execution-context.js";
import {
  buildMemoryPlanStep,
  loadMemoryInjectionContext,
  renderMemoryGuideSection,
  buildOrchestrationHandles,
} from "../lib/memory-orchestration.js";
import { isShadcnStack } from "../lib/shadcn-ui.js";
import { renderUiHardRules, renderUiBannedList, renderPreFlightChecklist } from "../lib/quality-constraints.js";

type TemplateProfileResolved = 'guided' | 'strict';
type TemplateProfileRequest = 'guided' | 'strict' | 'auto';

/** 渲染代码步骤统一注入的 UI 硬约束 + 黑名单 + 交付前自检 */
const UI_CONSTRAINTS_BLOCK = `

---

${renderUiHardRules()}

${renderUiBannedList()}

${renderPreFlightChecklist()}`;

function buildShadcnBlocksPlanStep(description: string, framework: string) {
  if (!isShadcnStack(framework)) {
    return [];
  }

  return [
    {
      id: 'shadcn-blocks',
      tool: 'ui_search',
      when: 'React/Next 栈：调用 ui_search（category=shadcn-blocks）匹配 block',
      args: {
        mode: 'search',
        query: description,
        category: 'shadcn-blocks',
        stack: framework,
        limit: 5,
      },
      outputs: [],
    },
  ];
}

function inferProductType(description: string): string {
  const text = (description || '').toLowerCase();
  if (/电商|e-?commerce|shop|商城|购物/.test(text)) return 'E-commerce';
  if (/教育|course|learning|school|培训/.test(text)) return 'Educational App';
  if (/医疗|health|med|clinic|hospital/.test(text)) return 'Healthcare App';
  if (/政府|gov|public/.test(text)) return 'Government/Public Service';
  if (/金融|fintech|bank|支付|crypto|区块链/.test(text)) return 'Fintech/Crypto';
  if (/社交|social|community|forum|chat/.test(text)) return 'Social Media App';
  if (/analytics|dashboard|报表|数据看板/.test(text)) return 'Analytics Dashboard';
  if (/b2b|企业/.test(text)) return 'B2B Service';
  if (/portfolio|作品集|个人网站/.test(text)) return 'Portfolio/Personal';
  if (/agency|工作室|创意/.test(text)) return 'Creative Agency';
  return 'SaaS (General)';
}

function normalizeTemplateName(value: string, fallback: string): string {
  const safe = (value || '')
    .toLowerCase()
    .replace(/页面|表单|组件/g, '')
    .trim()
    .replace(/[^\w\u4e00-\u9fa5-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return safe || fallback;
}

function decideTemplateProfile(description: string): TemplateProfileResolved {
  const text = description || '';
  const lengthScore = text.length >= 200 ? 2 : text.length >= 120 ? 1 : 0;
  const structureSignals = [
    /(^|\n)\s*#{1,3}\s+\S+/m,
    /(^|\n)\s*[-*]\s+\S+/m,
    /(^|\n)\s*\d+\.\s+\S+/m,
    /页面|组件|交互|状态|数据|权限|可访问性|响应式|视觉|风格/m,
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
      reason: resolved === 'strict' ? '需求结构化且较完整' : '需求较简略，需要更多指导',
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
    warning: `模板档位 \"${rawProfile}\" 不支持，已回退为 ${fallback}`,
  };
}

function buildUiQuestions(questionBudget: number) {
  const base = [
    { question: "页面目标是什么？用户需要完成什么任务？", context: "页面目标", required: true },
    { question: "核心功能与交互有哪些？", context: "核心交互", required: true },
    { question: "需要哪些状态（加载/空态/错误）？", context: "关键状态", required: true },
    { question: "数据来源与刷新频率是什么？", context: "数据来源", required: true },
    { question: "权限/可见性规则有哪些？", context: "权限规则", required: false },
    { question: "需要适配哪些设备/分辨率？", context: "响应式", required: false },
    { question: "是否有特定风格/品牌约束？", context: "视觉约束", required: false },
    { question: "可访问性要求有哪些？", context: "可访问性", required: false },
  ];
  return base.slice(0, Math.max(0, questionBudget));
}

/**
 * 从 project-context.md 读取框架信息
 */
function getFrameworkFromContext(projectRoot: string): string | null {
  try {
    const fs = require('fs');
    const path = require('path');
    const contextPath = path.join(projectRoot, 'docs', 'project-context.md');
    
    if (!fs.existsSync(contextPath)) {
      return null;
    }
    
    const content = fs.readFileSync(contextPath, 'utf-8');
    
    // 匹配表格中的框架信息：| 框架 | xxx |
    const match = content.match(/\|\s*框架\s*\|\s*([^\|]+)\s*\|/);
    if (match && match[1]) {
      const framework = match[1].trim();
      if (framework && framework !== '无' && framework !== '未检测到') {
        return framework;
      }
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * 统一 UI 开发编排工具
 */
export async function startUi(args: any, context?: ToolExecutionContext) {
  try {
    throwIfAborted(context?.signal, "start_ui 已取消");
    await reportToolProgress(context, 10, "start_ui: 解析参数与检测项目框架");

    // 智能参数解析
    const parsedArgs = parseArgs<{
      description?: string;
      framework?: string;
      template?: string;
      project_root?: string;
      mode?: string;
      template_profile?: string;
      requirements_mode?: string;
      loop_max_rounds?: number;
      loop_question_budget?: number;
      loop_assumption_cap?: number;
    }>(args, {
      defaultValues: {
        description: "",
        framework: "html",
        template: "",
        mode: "manual",
        template_profile: "auto",
        requirements_mode: "steady",
        loop_max_rounds: 2,
        loop_question_budget: 5,
        loop_assumption_cap: 3,
      },
      primaryField: "description",
      fieldAliases: {
        description: ["desc", "ui", "page", "需求", "描述"],
        framework: ["stack", "lib", "框架"],
        template: ["name", "模板名"],
        project_root: ["projectRoot", "project_path", "projectPath", "root", "project_root", "path", "dir", "directory", "项目路径", "项目根目录"],
        mode: ["模式"],
        template_profile: ["profile", "template_profile", "模板档位", "模板模式"],
        requirements_mode: ["requirements_mode", "loop", "需求模式"],
        loop_max_rounds: ["max_rounds", "rounds", "最大轮次"],
        loop_question_budget: ["question_budget", "问题数量", "问题预算"],
        loop_assumption_cap: ["assumption_cap", "假设上限"],
      },
    });

    const explicitProjectRoot = getString(parsedArgs.project_root);
    if (isLikelyProjectNamedRelativePath(explicitProjectRoot)) {
      return {
        content: [{
          type: "text",
          text: `拒绝执行 UI 编排：project_root 不能传带项目名的半相对路径，例如 ${explicitProjectRoot}。请改为传项目根目录绝对路径。`,
        }],
        isError: true,
        structuredContent: {
          error_code: "INVALID_PROJECT_ROOT",
          rejected_project_root: explicitProjectRoot,
          retry_hint: buildProjectRootRetryHint(explicitProjectRoot),
        },
      };
    }

    const projectRoot = resolveWorkspaceRoot(explicitProjectRoot);

    // 优先从 project-context.md 读取框架信息
    let detectedFramework = 'html'; // 默认值
    const contextFramework = getFrameworkFromContext(projectRoot);

    if (contextFramework) {
      // 从 project-context.md 中读取到了框架信息
      const fw = contextFramework.toLowerCase();
      if (fw.includes('vue') || fw.includes('nuxt')) {
        detectedFramework = 'vue';
      } else if (fw.includes('react') || fw.includes('next')) {
        detectedFramework = 'react';
      } else if (fw.includes('html')) {
        detectedFramework = 'html';
      }
    } else {
      // 如果没有 project-context.md，则实时检测
      const detection = detectProjectType(projectRoot);
      if (detection.framework) {
        const fw = detection.framework.toLowerCase();
        if (fw.includes('vue') || fw.includes('nuxt')) {
          detectedFramework = 'vue';
        } else if (fw.includes('react') || fw.includes('next')) {
          detectedFramework = 'react';
        } else if (fw.includes('html') || fw === 'none') {
          detectedFramework = 'html';
        }
      }
    }

    const description = getString(parsedArgs.description);
    const productType = inferProductType(description);
    const framework = getString(parsedArgs.framework) || detectedFramework;
    const mode = getString(parsedArgs.mode) || "manual";
    const rawProfile = getString(parsedArgs.template_profile);
    const requirementsMode = getString(parsedArgs.requirements_mode) || "steady";
    const maxRounds = getNumber(parsedArgs.loop_max_rounds, 2);
    const questionBudget = getNumber(parsedArgs.loop_question_budget, 5);
    const assumptionCap = getNumber(parsedArgs.loop_assumption_cap, 3);
    let templateName = getString(parsedArgs.template);
    templateName = normalizeTemplateName(templateName || description || 'ui-template', 'ui-template');

    throwIfAborted(context?.signal, "start_ui 已取消");
    await reportToolProgress(context, 35, "start_ui: 参数解析完成");

    const profileDecision = resolveTemplateProfile(rawProfile, description || "");
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

    // 验证 mode 参数
    const validModes = ["auto", "manual"];
    if (mode && !validModes.includes(mode)) {
      return {
        content: [
          {
            type: "text",
            text: `❌ 无效的模式: ${mode}

**有效选项**: auto, manual

**示例**:
\`\`\`
start_ui "登录页面" --mode=manual
start_ui "用户列表" --mode=auto
\`\`\`
`,
          },
        ],
        isError: true,
      };
    }

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

      const plan = {
        mode: 'delegated',
        steps: [
          ...memoryRecallStep,
          skillBridgeStep,
          {
            id: 'loop-1',
            type: 'agent_action',
            action: 'collect_ui_requirements_from_user',
            requiredInputs: openQuestions.map(({ question }) => question),
            expectedOutputs: ['补全后的页面目标、交互、状态、数据、权限、响应式与可访问性要求'],
            outputs: [],
            note: '支持 elicitation 的 Host 会直接收集；其他 Host 由 Agent 原生向用户提问，不调用隐藏的 ask_user',
          },
          ...(maxRounds > 1
            ? [
                {
                  id: 'loop-2',
                  type: 'agent_action' as const,
                  action: 'resolve_remaining_ui_questions',
                  when: '仍存在 openQuestions 或高风险 assumptions',
                  requiredInputs: ['上一轮未关闭的问题与假设'],
                  expectedOutputs: ['可执行的 UI 需求摘要'],
                  outputs: [],
                },
              ]
            : []),
          {
            id: 'context',
            tool: 'init_project_context',
            when: '缺少 docs/project-context.md',
            args: {},
            outputs: ['docs/project-context.md'],
          },
          {
            id: 'design-system',
            tool: 'ui_design_system',
            when: '缺少 docs/design-system.json 或 docs/design-system.md',
            args: {
              product_type: productType,
              stack: framework,
              description,
            },
            outputs: ['docs/design-system.json', 'docs/design-system.md'],
          },
          {
            id: 'catalog',
            type: 'agent_action',
            action: 'create_component_catalog',
            when: '缺少 docs/ui/component-catalog.json',
            requiredInputs: ['docs/design-system.json 或当前设计系统结果', '现有组件与页面需求'],
            expectedOutputs: ['docs/ui/component-catalog.json'],
            outputs: ['docs/ui/component-catalog.json'],
            note: '由 Agent 使用宿主文件能力生成组件目录；该步骤不是 MCP 工具调用',
          },
          ...buildShadcnBlocksPlanStep(description, framework),
          {
            id: 'template',
            tool: 'ui_search',
            args: { mode: 'template', query: description },
            outputs: [],
          },
          {
            id: 'save-template',
            type: 'agent_action',
            action: 'save_ui_template',
            requiredInputs: ['ui_search 返回的模板候选或 Agent 创建的最小模板'],
            expectedOutputs: [`docs/ui/${templateName}.json`],
            outputs: [`docs/ui/${templateName}.json`],
          },
          {
            id: 'render',
            type: 'agent_action',
            action: 'implement_ui_from_template',
            requiredInputs: [`docs/ui/${templateName}.json`, 'docs/design-system.md', `目标框架：${framework}`],
            expectedOutputs: ['可运行的 UI 代码与必要测试'],
            outputs: [],
            note: '由 Agent 使用宿主代码与文件能力实施；该步骤不是 MCP 工具调用',
          },
          {
            id: 'update-context',
            type: 'agent_action',
            action: 'update_project_context',
            requiredInputs: ['已生成的设计系统、组件目录、模板和 UI 实现路径'],
            expectedOutputs: ['docs/project-context.md 中的 UI 文档索引已更新'],
            outputs: ['docs/project-context.md'],
          },
          ...(memoryContext.enabled ? [buildMemoryPlanStep('ui')] : []),
        ],
      };

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

      // 1. 获取推理引擎
      const engine = await getReasoningEngine();

      // 2. 构造设计请求
      const request: DesignRequest = {
        productType,
        description,
        stack: framework,
      };

      // 3. 生成推荐
      const recommendation = engine.generateRecommendation(request);

      throwIfAborted(context?.signal, "start_ui(auto) 已取消");
      await reportToolProgress(context, 80, "start_ui: 智能计划已生成");

      // 4. 提取推理结果
      const inferredProductType = recommendation.target;
      const inferredKeywords = recommendation.style.keywords.join(", ");
      const inferredStack = framework; // 保持用户指定的技术栈，或默认为 react

      // 5. 生成智能执行计划
      const searchQuery = description || templateName;
      const plan = {
        mode: 'delegated',
        steps: [
          ...memoryRecallStep,
          skillBridgeStep,
          {
            id: 'context',
            tool: 'init_project_context',
            when: '缺少 docs/project-context.md',
            args: {},
            outputs: ['docs/project-context.md'],
          },
          {
            id: 'design-system',
            tool: 'ui_design_system',
            when: '缺少 docs/design-system.json 或 docs/design-system.md',
            args: {
              product_type: inferredProductType,
              stack: inferredStack,
              keywords: inferredKeywords,
              description,
            },
            outputs: ['docs/design-system.json', 'docs/design-system.md'],
          },
          {
            id: 'catalog',
            type: 'agent_action',
            action: 'create_component_catalog',
            when: '缺少 docs/ui/component-catalog.json',
            requiredInputs: ['docs/design-system.json 或当前设计系统结果', '现有组件与页面需求'],
            expectedOutputs: ['docs/ui/component-catalog.json'],
            outputs: ['docs/ui/component-catalog.json'],
            note: '由 Agent 使用宿主文件能力生成组件目录；该步骤不是 MCP 工具调用',
          },
          ...buildShadcnBlocksPlanStep(description, inferredStack),
          {
            id: 'template',
            tool: 'ui_search',
            args: { mode: 'template', query: searchQuery },
            outputs: [],
          },
          {
            id: 'save-template',
            type: 'agent_action',
            action: 'save_ui_template',
            requiredInputs: ['ui_search 返回的模板候选或 Agent 创建的最小模板'],
            expectedOutputs: [`docs/ui/${templateName}.json`],
            outputs: [`docs/ui/${templateName}.json`],
          },
          {
            id: 'render',
            type: 'agent_action',
            action: 'implement_ui_from_template',
            requiredInputs: [`docs/ui/${templateName}.json`, 'docs/design-system.md', `目标框架：${inferredStack}`],
            expectedOutputs: ['可运行的 UI 代码与必要测试'],
            outputs: [],
            note: '由 Agent 使用宿主代码与文件能力实施；该步骤不是 MCP 工具调用',
          },
          {
            id: 'update-context',
            type: 'agent_action',
            action: 'update_project_context',
            requiredInputs: ['已生成的设计系统、组件目录、模板和 UI 实现路径'],
            expectedOutputs: ['docs/project-context.md 中的 UI 文档索引已更新'],
            outputs: ['docs/project-context.md'],
          },
          ...(memoryContext.enabled ? [buildMemoryPlanStep('ui')] : []),
        ],
      };

      const header = renderOrchestrationHeader({
        tool: 'start_ui',
        goal: `UI 需求：${description}`,
        tasks: [
          '按 delegated plan 顺序调用工具',
          '生成设计系统、模板并渲染 UI 代码',
        ],
        notes: [
          ...headerNotes,
          ...(memoryContext.enabled ? ['记忆优先: 已自动注入相似历史 UI 资产与坑（见顶部），先复用并规避同类坑'] : []),
        ],
      });

      const smartPlan = `${header}${memoryGuideSection}${skillBridgeSection}
# 快速开始

## 职责说明
MCP 工具只提供指导并负责设计系统、检索与编排；Agent 负责组件目录、模板落盘、代码实施和测试。

## 失败处理
任一步失败时保留已完成产物、记录失败原因并从该步骤重试；不得跳过失败步骤宣称完成。

## 高级选项
可通过 mode、framework、template 和 template_profile 控制编排方式；未指定时采用安全默认值。

# UI 开发闭环

- 模式：auto
- 目标框架：${inferredStack}
- 设计方向：${recommendation.style.primary}
- 规则：文本步骤与 \`structuredContent.metadata.plan.steps\` 来自同一份计划。

## 步骤
${renderDelegatedPlanSteps(plan.steps)}`;

      // Create structured UI report for auto mode
      const uiReport: UIReport = {
        summary: `智能 UI 开发：${description}`,
        status: 'pending',
        steps: [
          {
            name: '生成项目上下文',
            status: 'pending',
            description: `调用 init_project_context 生成项目文档`,
          },
          {
            name: '生成设计系统',
            status: 'pending',
            description: `调用 ui_design_system 生成设计规范`,
          },
          {
            name: '生成组件目录',
            status: 'pending',
            description: '由 Agent 生成组件目录文件',
          },
          {
            name: '搜索 UI 模板',
            status: 'pending',
            description: '调用 ui_search 搜索匹配的模板',
          },
          {
            name: '保存模板文件',
            status: 'pending',
            description: `将模板保存为 docs/ui/${templateName}.json`,
          },
          {
            name: '渲染最终代码',
            status: 'pending',
            description: '由 Agent 根据模板和设计系统实施 UI 代码',
          },
          {
            name: '更新项目上下文',
            status: 'pending',
            description: '将 UI 文档添加到 project-context.md 索引',
          },
        ],
        artifacts: [],
        nextSteps: [
          '调用 init_project_context',
          `调用 ui_design_system --product_type="${inferredProductType}" --stack="${inferredStack}"`,
          '由 Agent 创建 docs/ui/component-catalog.json',
          `调用 ui_search --mode=template --query="${description}"`,
          `保存模板到 docs/ui/${templateName}.json`,
          `由 Agent 按 ${inferredStack} 实施 UI 代码与测试`,
          '更新 docs/project-context.md 添加 UI 文档链接',
        ],
        designSystem: {
          colors: {},
          typography: {},
          spacing: {},
        },
        renderedCode: {
          framework: inferredStack as 'react' | 'vue' | 'html',
          code: '待生成',
        },
        consistencyRules: [
          '所有组件使用设计系统中定义的颜色',
          '所有组件使用设计系统中定义的字体',
          '所有组件使用设计系统中定义的间距',
        ],
        metadata: {
          plan,
          template: templateMeta,
          skills: skillBridge,
        },
      };

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
        '生成设计系统、组件目录、模板并实施 UI 代码',
      ],
      notes: [
        ...headerNotes,
        ...(memoryContext.enabled ? ['记忆增强：已注入相关历史 UI 资产候选'] : []),
      ],
    });


    const plan = {
      mode: 'delegated',
      steps: [
        ...memoryRecallStep,
        skillBridgeStep,
        {
          id: 'context',
          tool: 'init_project_context',
          when: '缺少 docs/project-context.md',
          args: {},
          outputs: ['docs/project-context.md'],
        },
        {
          id: 'design-system',
          tool: 'ui_design_system',
          when: '缺少 docs/design-system.json 或 docs/design-system.md',
          args: {
            product_type: productType,
            stack: framework,
            description,
          },
          outputs: ['docs/design-system.json', 'docs/design-system.md'],
        },
        {
          id: 'catalog',
          type: 'agent_action',
          action: 'create_component_catalog',
          when: '缺少 docs/ui/component-catalog.json',
          requiredInputs: ['docs/design-system.json 或当前设计系统结果', '现有组件与页面需求'],
          expectedOutputs: ['docs/ui/component-catalog.json'],
          outputs: ['docs/ui/component-catalog.json'],
          note: '由 Agent 使用宿主文件能力生成组件目录；该步骤不是 MCP 工具调用',
        },
        ...buildShadcnBlocksPlanStep(description, framework),
        {
          id: 'template',
          tool: 'ui_search',
          args: { mode: 'template', query: description },
          outputs: [],
        },
        {
          id: 'save-template',
          type: 'agent_action',
          action: 'save_ui_template',
          requiredInputs: ['ui_search 返回的模板候选或 Agent 创建的最小模板'],
          expectedOutputs: [`docs/ui/${templateName}.json`],
          outputs: [`docs/ui/${templateName}.json`],
        },
        {
          id: 'render',
          type: 'agent_action',
          action: 'implement_ui_from_template',
          requiredInputs: [`docs/ui/${templateName}.json`, 'docs/design-system.md', `目标框架：${framework}`],
          expectedOutputs: ['可运行的 UI 代码与必要测试'],
          outputs: [],
          note: '由 Agent 使用宿主代码与文件能力实施；该步骤不是 MCP 工具调用',
        },
        {
          id: 'update-context',
          type: 'agent_action',
          action: 'update_project_context',
          requiredInputs: ['已生成的设计系统、组件目录、模板和 UI 实现路径'],
          expectedOutputs: ['docs/project-context.md 中的 UI 文档索引已更新'],
          outputs: ['docs/project-context.md'],
        },
        ...(memoryContext.enabled ? [buildMemoryPlanStep('ui')] : []),
      ],
    };

    const guide = `${header}${memoryGuideSection}${skillBridgeSection}
# 快速开始

## 职责说明
MCP 工具只提供指导并负责设计系统、检索与编排；Agent 负责组件目录、模板落盘、代码实施和测试。

## 失败处理
任一步失败时保留已完成产物、记录失败原因并从该步骤重试；不得跳过失败步骤宣称完成。

## 高级选项
可通过 mode、framework、template 和 template_profile 控制编排方式；未指定时采用安全默认值。

# UI 开发闭环

- 模式：manual
- 目标框架：${framework}
- 模板：docs/ui/${templateName}.json
- 规则：文本步骤与 \`structuredContent.metadata.plan.steps\` 来自同一份计划。

## 步骤
${renderDelegatedPlanSteps(plan.steps)}`;

    // Create structured UI report for manual mode
    const uiReport: UIReport = {
      summary: `UI 开发工作流：${description}`,
      status: 'pending',
      steps: [
        {
          name: '检查项目上下文',
          status: 'pending',
          description: '检查 docs/project-context.md 是否存在',
        },
        {
          name: '检查设计系统',
          status: 'pending',
          description: '检查 docs/design-system.md 是否存在',
        },
        {
          name: '检查组件目录',
          status: 'pending',
          description: '检查 docs/ui/component-catalog.json 是否存在',
        },
        {
          name: '搜索 UI 模板',
          status: 'pending',
          description: '调用 ui_search 搜索匹配的模板',
        },
        {
          name: '保存模板文件',
          status: 'pending',
          description: `将模板保存为 docs/ui/${templateName}.json`,
        },
        {
          name: '渲染最终代码',
          status: 'pending',
          description: '由 Agent 根据模板和设计系统实施 UI 代码',
        },
        {
          name: '更新项目上下文',
          status: 'pending',
          description: '将 UI 文档添加到 project-context.md 索引',
        },
      ],
      artifacts: [],
      nextSteps: [
        '检查 docs/project-context.md，如不存在则调用 init_project_context',
        '检查 docs/design-system.md，如不存在则调用 ui_design_system',
        '检查 docs/ui/component-catalog.json，如不存在则由 Agent 创建 docs/ui/component-catalog.json',
        ...(isShadcnStack(framework)
          ? [`调用 ui_search --category=shadcn-blocks --query="${description}" 匹配 shadcn block`]
          : []),
        `调用 ui_search --mode=template --query="${description}"`,
        `保存模板到 docs/ui/${templateName}.json`,
        `由 Agent 按 ${framework} 实施 UI 代码与测试`,
        '更新 docs/project-context.md 添加 UI 文档链接',
      ],
      designSystem: {
        colors: {},
        typography: {},
        spacing: {},
      },
      renderedCode: {
        framework: framework as 'react' | 'vue' | 'html',
        code: '待生成',
      },
      consistencyRules: [
        '所有组件使用设计系统中定义的颜色',
        '所有组件使用设计系统中定义的字体',
        '所有组件使用设计系统中定义的间距',
      ],
      metadata: {
        plan,
        template: templateMeta,
        skills: skillBridge,
      },
    };

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
