import * as fs from "node:fs";
import * as path from "node:path";
import { parseArgs, getString, getNumber } from "../utils/parseArgs.js";
import { okStructured } from "../lib/response.js";
import { renderOrchestrationHeader } from "../lib/orchestration-guidance.js";
import { FeatureReportSchema, RequirementsLoopSchema } from "../schemas/structured-output.js";
import type { FeatureReport, RequirementsLoopReport } from "../schemas/structured-output.js";
import {
  reportToolProgress,
  throwIfAborted,
  type ToolExecutionContext,
} from "../lib/tool-execution-context.js";
import { buildFeatureGraphContext } from "../lib/gitnexus-bridge.js";

/**
 * start_feature 智能编排工具
 * 
 * 场景：开发新功能
 * 编排：[检查上下文] → add_feature → estimate
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

const PROMPT_TEMPLATE = `# 🚀 新功能开发编排（委托式）

本工具仅生成 **执行计划（steps）**。AI 需要按顺序调用对应工具并落盘文档。

## 🎯 目标
开发新功能：**{feature_name}**
功能描述：{description}

---

## ✅ 执行计划（按顺序）

### 0) 项目上下文（如缺失）
**检查**:
- \`{docs_dir}/project-context.md\`
- \`{docs_dir}/graph-insights/latest.md\`
- \`{docs_dir}/graph-insights/latest.json\`
**缺失则调用**: \`init_project_context\`
\`\`\`json
{ "docs_dir": "{docs_dir}", "project_root": "{project_root}" }
\`\`\`

### 1) 生成功能规格
**调用**: \`add_feature\`
\`\`\`json
{
  "feature_name": "{feature_name}",
  "description": "{description}",
  "docs_dir": "{docs_dir}",
  "template_profile": "{template_profile}"
}
\`\`\`
**预期输出**:
- \`{docs_dir}/specs/{feature_name}/requirements.md\`
- \`{docs_dir}/specs/{feature_name}/design.md\`
- \`{docs_dir}/specs/{feature_name}/tasks.md\`

### 2) 工作量估算
**调用**: \`estimate\`
\`\`\`json
{
  "task_description": "实现 {feature_name} 功能：{description}",
  "code_context": "参考生成的 tasks.md 中的任务列表"
}
\`\`\`

---

## ✅ 输出汇总（执行完成后）
1. 规格文档位置: \`{docs_dir}/specs/{feature_name}/\`
2. 图谱入口: \`{docs_dir}/graph-insights/latest.md\`
3. 估算结果: 故事点 + 时间区间
4. 主要风险（如有）
5. 下一步: 按 tasks.md 开始开发

---

*编排工具: MCP Probe Kit - start_feature*`;

const LOOP_PROMPT_TEMPLATE = `# 🧭 需求澄清与补全（Requirements Loop）

本模式用于**生产级稳健补全**：在不改变用户意图的前提下补齐关键要素，并输出可审计的结构化结果。

## 🎯 目标
开发新功能：**{feature_name}**  
功能描述：{description}

## ✅ 规则
1. **不覆盖用户原始需求**
2. **补全内容必须标注来源**（User / Derived / Assumption）
3. **假设必须进入待确认列表**
4. **每轮问题 ≤ {question_budget}，假设 ≤ {assumption_cap}**

---

## 🔁 执行步骤（每轮）

### 1) 生成待确认问题
使用 \`ask_user\` 提问，问题来源于“功能需求补全清单”（角色/触发/约束/异常/依赖等）。

**调用示例**:
\`\`\`json
{
  "questions": [
    { "question": "目标用户或角色是谁？", "context": "角色定义", "required": true },
    { "question": "触发场景是什么？", "context": "业务场景", "required": true }
  ]
}
\`\`\`

### 2) 更新结构化输出
将回答补入 \`requirements\`，并标注来源：
- User：用户明确回答
- Derived：合理推导
- Assumption：无法确认但补全（需确认）

### 3) 自检与结束
若 \`openQuestions\` 为空且无高风险假设，则结束 loop，进入规格生成与估算。

---

## ✅ 结束后继续
当满足结束条件时，执行：
1. 调用 \`add_feature\` 生成规格文档
2. 调用 \`estimate\` 进行工作量估算

---

*编排工具: MCP Probe Kit - start_feature (requirements loop)*
`;

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
        requirements_mode: ["mode", "requirements_mode", "loop", "需求模式"],
        loop_max_rounds: ["max_rounds", "rounds", "最大轮次"],
        loop_question_budget: ["question_budget", "问题数量", "问题预算"],
        loop_assumption_cap: ["assumption_cap", "假设上限"],
      },
    });

    let featureName = getString(parsedArgs.feature_name);
    let description = getString(parsedArgs.description);
    const docsDir = getString(parsedArgs.docs_dir) || "docs";
    const projectRoot = getString(parsedArgs.project_root);
    const templateProfile = getString(parsedArgs.template_profile) || "auto";
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

    throwIfAborted(context?.signal, "start_feature 已取消");
    await reportToolProgress(context, 55, "start_feature: 刷新图谱并收敛需求范围");
    const graphDocs = {
      latestMarkdownPath: `${docsDir}/graph-insights/latest.md`,
      latestJsonPath: `${docsDir}/graph-insights/latest.json`,
    };
    const resolvedProjectRoot = path.resolve(projectRoot || process.cwd());
    const bootstrapState = {
      projectContextExists: fs.existsSync(path.join(resolvedProjectRoot, docsDir, "project-context.md")),
      latestMarkdownExists: fs.existsSync(path.join(resolvedProjectRoot, docsDir, "graph-insights", "latest.md")),
      latestJsonExists: fs.existsSync(path.join(resolvedProjectRoot, docsDir, "graph-insights", "latest.json")),
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

      const plan = {
        mode: 'delegated',
        steps: [
          {
            id: 'context',
            tool: 'init_project_context',
            when: `缺少 ${docsDir}/project-context.md 或 ${graphDocs.latestMarkdownPath} / ${graphDocs.latestJsonPath}`,
            args: {
              docs_dir: docsDir,
              ...(projectRoot ? { project_root: projectRoot } : {}),
            },
            outputs: [`${docsDir}/project-context.md`, graphDocs.latestMarkdownPath, graphDocs.latestJsonPath],
            note: `兼容老项目：即使已有旧版 project-context，只要缺少图谱文档，也要先补齐 ${graphDocs.latestMarkdownPath}`,
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
            id: 'spec',
            tool: 'add_feature',
            when: 'stopConditions.ready=true',
            args: { feature_name: featureName, description, docs_dir: docsDir, template_profile: templateProfile },
            outputs: [
              `${docsDir}/specs/${featureName}/requirements.md`,
              `${docsDir}/specs/${featureName}/design.md`,
              `${docsDir}/specs/${featureName}/tasks.md`,
            ],
          },
          {
            id: 'estimate',
            tool: 'estimate',
            when: 'stopConditions.ready=true',
            args: {
              task_description: `实现 ${featureName} 功能：${description}`,
              code_context: estimateCodeContext,
            },
            outputs: [],
          },
        ],
      };

      const header = renderOrchestrationHeader({
        tool: 'start_feature',
        goal: `开发新功能：${featureName}`,
        tasks: [
          '按 Requirements Loop 规则提问并更新结构化输出',
          '满足结束条件后生成规格并完成估算',
        ],
        notes: [`模板档位: ${templateProfile}`, graphStatusNote],
      });

      const guide = (header + LOOP_PROMPT_TEMPLATE
        .replace(/{feature_name}/g, featureName)
        .replace(/{description}/g, description)
        .replace(/{project_root}/g, (projectRoot || process.cwd()).replace(/\\/g, "/"))
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
        loopReport,
        {
          schema: RequirementsLoopSchema,
          note: 'AI 应按轮次澄清需求并更新结构化输出，满足结束条件后再进入 add_feature / estimate',
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
        notes: [`模板档位: ${templateProfile}`, graphStatusNote],
    });

    const guide = (header + PROMPT_TEMPLATE
      .replace(/{feature_name}/g, featureName)
      .replace(/{description}/g, description)
      .replace(/{docs_dir}/g, docsDir)
      .replace(/{project_root}/g, (projectRoot || process.cwd()).replace(/\\/g, "/"))
      .replace(/{template_profile}/g, templateProfile))
      + graphGuideSection;

    const plan = {
      mode: 'delegated',
      steps: [
        {
          id: 'context',
          tool: 'init_project_context',
          when: `缺少 ${docsDir}/project-context.md 或 ${graphDocs.latestMarkdownPath} / ${graphDocs.latestJsonPath}`,
          args: {
            docs_dir: docsDir,
            ...(projectRoot ? { project_root: projectRoot } : {}),
          },
          outputs: [`${docsDir}/project-context.md`, graphDocs.latestMarkdownPath, graphDocs.latestJsonPath],
          note: `兼容老项目：即使已有旧版 project-context，只要缺少图谱文档，也要先补齐 ${graphDocs.latestMarkdownPath}`,
        },
        {
          id: 'spec',
          tool: 'add_feature',
          args: { feature_name: featureName, description, docs_dir: docsDir, template_profile: templateProfile },
          outputs: [
            `${docsDir}/specs/${featureName}/requirements.md`,
            `${docsDir}/specs/${featureName}/design.md`,
            `${docsDir}/specs/${featureName}/tasks.md`,
          ],
        },
        {
          id: 'estimate',
          tool: 'estimate',
          args: {
            task_description: `实现 ${featureName} 功能：${description}`,
            code_context: estimateCodeContext,
          },
          outputs: [],
        },
      ],
    };

    // 创建结构化的功能开发报告
    const featureReport: FeatureReport = {
      summary: `新功能开发工作流：${featureName}`,
      status: 'pending',
      steps: [
        {
          name: '检查项目上下文',
          status: 'pending',
          description: `检查 ${docsDir}/project-context.md 与 graph-insights/latest.* 是否存在，缺失则调用 init_project_context`,
        },
        {
          name: '生成功能规格',
          status: 'pending',
          description: '调用 add_feature 工具生成需求、设计和任务文档',
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
        '调用 add_feature 工具生成功能规格文档',
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
      featureReport,
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
