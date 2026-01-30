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
import { renderOrchestrationHeader } from "../lib/orchestration-guidance.js";
import { UIReportSchema, RequirementsLoopSchema } from "../schemas/structured-output.js";
import type { UIReport, RequirementsLoopReport } from "../schemas/structured-output.js";
import { detectProjectType } from "../lib/project-detector.js";

type TemplateProfileResolved = 'guided' | 'strict';
type TemplateProfileRequest = 'guided' | 'strict' | 'auto';

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

const PROMPT_TEMPLATE_GUIDED = `# 快速开始

**职责说明**: 本工具仅提供执行指导，不执行实际操作。请按顺序调用以下 MCP 工具。

执行以下工具：

1. 检查 \`docs/project-context.md\` 是否存在，不存在则调用 \`init_project_context\`
2. 检查 \`docs/design-system.md\` 是否存在，不存在则调用 \`ui_design_system --product_type="{productType}" --stack="{framework}"\`
3. 检查 \`docs/ui/component-catalog.json\` 是否存在，不存在则调用 \`init_component_catalog\`
4. \`ui_search --mode=template --query="{description}"\`
5. 选择模板并保存到 \`docs/ui/{templateName}.json\`
6. \`render_ui --template="docs/ui/{templateName}.json" --framework="{framework}"\`
7. 将生成的 UI 文档添加到 \`docs/project-context.md\` 索引中

---

## 步骤 1: 生成项目上下文（如不存在）📋

**检查**: 查看 \`docs/project-context.md\` 是否存在

**如果不存在，调用工具**: \`init_project_context\`
**参数**: 无（使用默认配置）

**预期输出**: 
- \`docs/project-context.md\` - 项目上下文索引文件
- \`docs/project-context/\` - 项目文档目录

**失败处理**: 确保 docs 目录存在且有写入权限

---

## 步骤 2: 生成设计系统（如不存在）🎨

**检查**: 查看 \`docs/design-system.md\` 是否存在

**如果不存在，调用工具**: \`ui_design_system\`
**参数**:
\`\`\`json
{
  "product_type": "{productType}",
  "stack": "{framework}",
  "description": "{description}"
}
\`\`\`

**预期输出**: \`docs/design-system.json\` 和 \`docs/design-system.md\`
**失败处理**: 检查 docs 目录是否存在，确保有写入权限

---

## 步骤 3: 生成组件目录（如不存在）📦

**检查**: 查看 \`docs/ui/component-catalog.json\` 是否存在

**如果不存在，调用工具**: \`init_component_catalog\`
**参数**: 无

**预期输出**: \`docs/ui/component-catalog.json\`
**失败处理**: 确保步骤 2 的设计系统文件已生成

---

## 步骤 4: 搜索 UI 模板 🔍

**工具**: \`ui_search\`
**参数**:
\`\`\`json
{
  "mode": "template",
  "query": "{description}"
}
\`\`\`

**预期输出**: 匹配的模板列表（可能为空）
**失败处理**: 如果没有找到模板，创建最小模板文件再进入渲染步骤

---

## 步骤 5: 保存模板文件 🧩

**操作**: 从搜索结果选择模板或创建最小模板

**保存路径**: \`docs/ui/{templateName}.json\`

**最小模板示例**:
\`\`\`json
{
  "name": "UiTemplate",
  "description": "{description}",
  "layout": "sectioned"
}
\`\`\`

---

## 步骤 6: 渲染最终代码 💻

**工具**: \`render_ui\`
**参数**:
\`\`\`json
{
  "template": "docs/ui/{templateName}.json",
  "framework": "{framework}"
}
\`\`\`

**预期输出**: 完整的 {framework} 组件代码
**失败处理**: 如果模板不存在，请先完成步骤 5 保存模板文件

---

## 步骤 7: 更新项目上下文索引 📝

**操作**: 将生成的 UI 文档添加到 \`docs/project-context.md\` 中

**添加内容**:
在 "## 📚 文档导航" 部分添加：

\`\`\`markdown
### [UI 设计系统](./design-system.md)
项目的 UI 设计规范，包括颜色、字体、组件样式等

### [UI 组件目录](./ui/component-catalog.json)
可用的 UI 组件及其属性定义
\`\`\`

在 "## 💡 开发时查看对应文档" 部分的 "添加新功能" 下添加：
\`\`\`markdown
- **UI 设计系统**: [design-system.md](./design-system.md) - 查看设计规范
- **UI 组件目录**: [ui/component-catalog.json](./ui/component-catalog.json) - 查看可用组件
\`\`\`

**预期结果**: \`docs/project-context.md\` 包含 UI 相关文档的链接
**失败处理**: 如果文件不存在，跳过此步骤

---

## 高级选项

### 自定义设计系统
编辑 \`docs/design-system.json\` 修改颜色、字体等，然后重新运行。

### 自定义组件
编辑 \`docs/ui/component-catalog.json\` 添加新组件定义。

### 常见问题

**Q: 设计系统文件已存在，还需要重新生成吗？**
A: 不需要。如果文件已存在，直接跳过步骤 1。

**Q: 如何使用自定义模板？**
A: 在 \`docs/ui/\` 目录创建 JSON 模板文件，然后在步骤 4 中指定模板路径。
`;

const PROMPT_TEMPLATE_STRICT = `# UI 开发编排（严格）

**职责说明**: 本工具仅提供执行指导，不执行实际操作。请按顺序调用以下 MCP 工具。

## ✅ 执行计划

1. 检查 \`docs/project-context.md\`，缺失则调用 \`init_project_context\`
2. 检查 \`docs/design-system.md\`，缺失则调用 \`ui_design_system --product_type="{productType}" --stack="{framework}"\`
3. 检查 \`docs/ui/component-catalog.json\`，缺失则调用 \`init_component_catalog\`
4. \`ui_search --mode=template --query="{description}"\`
5. 选择模板并保存到 \`docs/ui/{templateName}.json\`
6. \`render_ui --template="docs/ui/{templateName}.json" --framework="{framework}"\`
7. 将生成的 UI 文档添加到 \`docs/project-context.md\` 索引中

---

## 步骤 1: 生成项目上下文（如不存在）

**检查**: \`docs/project-context.md\`
**缺失则调用**: \`init_project_context\`
**预期输出**: \`docs/project-context.md\`

---

## 步骤 2: 生成设计系统（如不存在）

**检查**: \`docs/design-system.md\`
**缺失则调用**: \`ui_design_system\`
\`\`\`json
{
  "product_type": "{productType}",
  "stack": "{framework}",
  "description": "{description}"
}
\`\`\`
**预期输出**: \`docs/design-system.json\`、\`docs/design-system.md\`

---

## 步骤 3: 生成组件目录（如不存在）

**检查**: \`docs/ui/component-catalog.json\`
**缺失则调用**: \`init_component_catalog\`
**预期输出**: \`docs/ui/component-catalog.json\`

---

## 步骤 4: 搜索模板

**工具**: \`ui_search\`
\`\`\`json
{ "mode": "template", "query": "{description}" }
\`\`\`

---

## 步骤 5: 保存模板文件

**操作**: 从搜索结果选择模板或创建最小模板

**保存路径**: \`docs/ui/{templateName}.json\`

---

## 步骤 6: 渲染代码

**工具**: \`render_ui\`
\`\`\`json
{ "template": "docs/ui/{templateName}.json", "framework": "{framework}" }
\`\`\`

---

## 步骤 7: 更新项目上下文索引

将 UI 文档链接添加到 \`docs/project-context.md\`
`;

const LOOP_PROMPT_TEMPLATE_GUIDED = `# 🧭 UI 需求澄清与补全（Requirements Loop）

本模式用于**生产级稳健补全**：在不改变用户意图的前提下补齐 UI 需求关键要素。

## 🎯 目标
UI 需求：{description}

## ✅ 规则
1. **不覆盖用户原始描述**
2. **补全内容必须标注来源**（User / Derived / Assumption）
3. **假设必须进入待确认列表**
4. **每轮问题 ≤ {question_budget}，假设 ≤ {assumption_cap}**

---

## 🔁 执行步骤（每轮）

### 1) 生成待确认问题
使用 \`ask_user\` 提问，问题来源于 UI 需求补全清单（目标/交互/状态/设备/可访问性）。

### 2) 更新结构化输出
将回答补入 \`requirements\`，并标注来源。

### 3) 自检与结束
若 \`openQuestions\` 为空且无高风险假设，则结束 loop，进入 UI 执行计划。

---

## ✅ 结束后继续
当满足结束条件时，按 delegated plan 执行：
- 设计系统 → 组件目录 → 模板搜索 → 保存模板 → 渲染代码 → 更新上下文

---

*编排工具: MCP Probe Kit - start_ui (requirements loop)*
`;

const LOOP_PROMPT_TEMPLATE_STRICT = `# 🧭 UI 需求澄清与补全（Requirements Loop | 严格）

本模式用于稳健补全 UI 需求关键要素，不改变用户意图。

## 🎯 目标
UI 需求：{description}

## ✅ 规则
1. 不覆盖用户原始描述
2. 补全内容必须标注来源（User / Derived / Assumption）
3. 假设必须进入待确认列表
4. 每轮问题 ≤ {question_budget}，假设 ≤ {assumption_cap}

---

## 🔁 执行步骤（每轮）
1) 使用 \`ask_user\` 提问补全关键信息
2) 更新结构化输出并标注来源
3) 若 \`openQuestions\` 为空且无高风险假设则结束

---

## ✅ 结束后继续
当满足结束条件时，按 delegated plan 执行 UI 计划

---

*编排工具: MCP Probe Kit - start_ui (requirements loop)*
`;

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
export async function startUi(args: any) {
  try {
    const projectRoot = process.cwd();
    
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
    
    // 智能参数解析
    const parsedArgs = parseArgs<{
      description?: string;
      framework?: string;
      template?: string;
      mode?: string;
      template_profile?: string;
      requirements_mode?: string;
      loop_max_rounds?: number;
      loop_question_budget?: number;
      loop_assumption_cap?: number;
    }>(args, {
      defaultValues: {
        description: "",
        framework: detectedFramework, // 使用检测到的框架
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
        mode: ["模式"],
        template_profile: ["profile", "template_profile", "模板档位", "模板模式"],
        requirements_mode: ["requirements_mode", "loop", "需求模式"],
        loop_max_rounds: ["max_rounds", "rounds", "最大轮次"],
        loop_question_budget: ["question_budget", "问题数量", "问题预算"],
        loop_assumption_cap: ["assumption_cap", "假设上限"],
      },
    });

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
            tool: 'init_component_catalog',
            when: '缺少 docs/ui/component-catalog.json',
            args: {},
            outputs: ['docs/ui/component-catalog.json'],
          },
          {
            id: 'template',
            tool: 'ui_search',
            args: { mode: 'template', query: description },
            outputs: [],
          },
          {
            id: 'save-template',
            tool: 'manual',
            action: 'save_ui_template',
            outputs: [`docs/ui/${templateName}.json`],
          },
          {
            id: 'render',
            tool: 'render_ui',
            args: {
              template: `docs/ui/${templateName}.json`,
              framework,
            },
            outputs: [],
          },
          {
            id: 'update-context',
            tool: 'manual',
            action: 'update_project_context',
            outputs: ['docs/project-context.md'],
          },
        ],
      };

      const header = renderOrchestrationHeader({
        tool: 'start_ui',
        goal: `UI 需求：${description}`,
        tasks: [
          '按 Requirements Loop 规则提问并更新结构化输出',
          '满足结束条件后按 delegated plan 执行 UI 计划',
        ],
        notes: headerNotes,
      });

      const loopTemplate = profileDecision.resolved === 'strict'
        ? LOOP_PROMPT_TEMPLATE_STRICT
        : LOOP_PROMPT_TEMPLATE_GUIDED;

      const guide = header + loopTemplate
        .replace(/{description}/g, description)
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
        },
      };

      return okStructured(
        guide,
        loopReport,
        {
          schema: RequirementsLoopSchema,
          note: 'AI 应按轮次澄清 UI 需求并更新结构化输出，满足结束条件后再执行 UI 计划',
        }
      );
    }

    // 自动模式实现
    if (mode === "auto") {
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

      // 4. 提取推理结果
      const inferredProductType = recommendation.target;
      const inferredKeywords = recommendation.style.keywords.join(", ");
      const inferredStack = framework; // 保持用户指定的技术栈，或默认为 react

      // 5. 生成智能执行计划
      const searchQuery = description || templateName;
      const smartPlanGuided = `# 🚀 智能 UI 开发计划

基于您的描述 "**${description}**"，AI 引擎已为您规划了最佳开发路径。

## 🧠 智能分析结果

- **产品类型**: ${inferredProductType}
- **推荐风格**: ${recommendation.style.primary}
- **关键特性**: ${inferredKeywords}
- **技术栈**: ${inferredStack}

---

## 📋 执行步骤（已自动优化参数）

请按顺序执行以下命令：

### 1. 生成项目上下文 📋
\`\`\`bash
init_project_context
\`\`\`

### 2. 生成设计系统 🎨
\`\`\`bash
ui_design_system --product_type="${inferredProductType}" --stack="${inferredStack}" --keywords="${inferredKeywords}" --description="${description}"
\`\`\`

### 3. 生成组件目录 📦
\`\`\`bash
init_component_catalog
\`\`\`

### 4. 生成 UI 模板 📄
\`\`\`bash
# 搜索现有模板或生成新模板
ui_search --mode=template --query="${searchQuery}"
\`\`\`

### 5. 保存模板文件 🧩
\`\`\`bash
# 将选中的模板保存到本地
# 目标路径：docs/ui/${templateName}.json
\`\`\`

### 6. 渲染代码 💻
\`\`\`bash
render_ui docs/ui/${templateName}.json --framework="${inferredStack}"
\`\`\`

### 7. 更新项目上下文 📝
将生成的 UI 文档链接添加到 \`docs/project-context.md\` 的文档导航部分。

---

## 💡 为什么选择这个方案？

${recommendation.reasoning}
`;

      const smartPlanStrict = `# 🚀 智能 UI 开发计划（严格）

## 🧠 智能分析结果

- **产品类型**: ${inferredProductType}
- **推荐风格**: ${recommendation.style.primary}
- **关键特性**: ${inferredKeywords}
- **技术栈**: ${inferredStack}

---

## 📋 执行步骤

1) init_project_context
2) ui_design_system --product_type="${inferredProductType}" --stack="${inferredStack}" --keywords="${inferredKeywords}" --description="${description}"
3) init_component_catalog
4) ui_search --mode=template --query="${searchQuery}"
5) 保存模板到 docs/ui/${templateName}.json
6) render_ui docs/ui/${templateName}.json --framework="${inferredStack}"
7) 更新 project-context.md 索引
`;

      const plan = {
        mode: 'delegated',
        steps: [
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
            tool: 'init_component_catalog',
            when: '缺少 docs/ui/component-catalog.json',
            args: {},
            outputs: ['docs/ui/component-catalog.json'],
          },
          {
            id: 'template',
            tool: 'ui_search',
            args: { mode: 'template', query: searchQuery },
            outputs: [],
          },
          {
            id: 'save-template',
            tool: 'manual',
            action: 'save_ui_template',
            outputs: [`docs/ui/${templateName}.json`],
          },
          {
            id: 'render',
            tool: 'render_ui',
            args: {
              template: `docs/ui/${templateName}.json`,
              framework: inferredStack,
            },
            outputs: [],
          },
          {
            id: 'update-context',
            tool: 'manual',
            action: 'update_project_context',
            outputs: ['docs/project-context.md'],
          },
        ],
      };

      const header = renderOrchestrationHeader({
        tool: 'start_ui',
        goal: `UI 需求：${description}`,
        tasks: [
          '按 delegated plan 顺序调用工具',
          '生成设计系统、模板并渲染 UI 代码',
        ],
        notes: headerNotes,
      });

      const smartPlan = header + (profileDecision.resolved === 'strict' ? smartPlanStrict : smartPlanGuided);

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
            description: '调用 init_component_catalog 生成组件目录',
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
            description: '调用 render_ui 生成组件代码',
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
          '调用 init_component_catalog',
          `调用 ui_search --mode=template --query="${description}"`,
          `保存模板到 docs/ui/${templateName}.json`,
          `调用 render_ui --framework="${inferredStack}"`,
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
        },
      };

      return okStructured(
        smartPlan,
        uiReport,
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

    // 转义 JSON 字符串中的特殊字符
    const escapeJson = (str: string) => {
      return str
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
    };

    // 安全的字符串替换，避免 $& 等特殊字符被解释为替换模式
    const safeReplace = (template: string, placeholder: string, value: string) => {
      return template.split(placeholder).join(value);
    };

    const header = renderOrchestrationHeader({
      tool: 'start_ui',
      goal: `UI 需求：${description}`,
      tasks: [
        '按 delegated plan 顺序调用工具',
        '生成设计系统、模板并渲染 UI 代码',
      ],
      notes: headerNotes,
    });

    const baseTemplate = profileDecision.resolved === 'strict'
      ? PROMPT_TEMPLATE_STRICT
      : PROMPT_TEMPLATE_GUIDED;

    let guide = header + baseTemplate;
    guide = safeReplace(guide, '{description}', escapeJson(description));
    guide = safeReplace(guide, '{productType}', productType);
    guide = safeReplace(guide, '{framework}', framework);
    guide = safeReplace(guide, '{templateName}', templateName);

    const plan = {
      mode: 'delegated',
      steps: [
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
          tool: 'init_component_catalog',
          when: '缺少 docs/ui/component-catalog.json',
          args: {},
          outputs: ['docs/ui/component-catalog.json'],
        },
        {
          id: 'template',
          tool: 'ui_search',
          args: { mode: 'template', query: description },
          outputs: [],
        },
        {
          id: 'save-template',
          tool: 'manual',
          action: 'save_ui_template',
          outputs: [`docs/ui/${templateName}.json`],
        },
        {
          id: 'render',
          tool: 'render_ui',
          args: {
            template: `docs/ui/${templateName}.json`,
            framework,
          },
          outputs: [],
        },
        {
          id: 'update-context',
          tool: 'manual',
          action: 'update_project_context',
          outputs: ['docs/project-context.md'],
        },
      ],
    };

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
          description: '调用 render_ui 生成组件代码',
        },
        {
          name: '更新项目上下文',
          status: 'pending',
          description: '将 UI 文档添加到 project-context.md 索引',
        },
      ],
      artifacts: [],
      nextSteps: [
        '检查项目上下文，如不存在则调用 init_project_context',
        '检查设计系统文件，如不存在则调用 ui_design_system',
        '检查组件目录，如不存在则调用 init_component_catalog',
        `调用 ui_search --mode=template --query="${description}"`,
        `保存模板到 docs/ui/${templateName}.json`,
        `调用 render_ui --framework="${framework}"`,
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
      },
    };

    return okStructured(
      guide,
      uiReport,
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
