import { parseArgs, getString, getNumber } from "../utils/parseArgs.js";
import { okStructured } from "../lib/response.js";
import type { GuidanceResult } from "../schemas/output/guidance-tools.js";
import { renderGuidanceHeader } from "../lib/guidance.js";
import { handleToolError } from "../utils/error-handler.js";


const ESTIMATE_OUTPUT_CONTRACT = {
  summary: "一句话估算结论",
  storyPoints: "number",
  confidence: "high|medium|low",
  timeEstimates: {
    optimistic: "string",
    normal: "string",
    pessimistic: "string",
  },
  breakdown: [
    {
      task: "string",
      hours: "number",
      complexity: "low|medium|high",
    },
  ],
  risks: [
    {
      risk: "string",
      impact: "low|medium|high",
      mitigation: "string",
    },
  ],
  assumptions: ["string"],
};

const ESTIMATE_OUTPUT_EXAMPLE = {
  summary: "任务估算总结（一句话）",
  storyPoints: 5,
  confidence: "medium",
  timeEstimates: {
    optimistic: "4h",
    normal: "8h",
    pessimistic: "16h",
  },
  breakdown: [
    {
      task: "需求理解",
      hours: 1,
      complexity: "low",
    },
  ],
  risks: [
    {
      risk: "需求边界可能变化",
      impact: "medium",
      mitigation: "实现前确认验收标准",
    },
  ],
  assumptions: ["开发环境和依赖已就绪"],
};

/**
 * estimate 工具
 * 
 * 功能：评估开发任务的工作量
 * 模式：指令生成器模式 - 返回估算指南，由 AI 执行实际分析
 */

const PROMPT_TEMPLATE = `# 工作量估算指南

## 🎯 估算目标

**任务描述**: 
{task_description}

**上下文信息**:
- 团队规模: {team_size} 人
- 经验水平: {experience_level}

{code_context_section}

---

## 📋 估算步骤

### 步骤 1: 任务分解

将任务分解为以下标准活动：

| 活动 | 说明 | 占比参考 |
|------|------|----------|
| 需求理解 | 理解需求、澄清疑问 | 5-10% |
| 设计 | 技术方案设计 | 10-15% |
| 编码 | 核心代码实现 | 40-50% |
| 单元测试 | 编写测试用例 | 15-20% |
| 代码审查 | CR 和修改 | 5-10% |
| 集成测试 | 联调和修复 | 10-15% |
| 文档 | 更新文档 | 5% |

### 步骤 2: 复杂度评估

对每个维度打分（1-5）：

#### 代码量评估
| 等级 | 行数 | 说明 |
|------|------|------|
| 1 | < 50 行 | 微小改动 |
| 2 | 50-200 行 | 小改动 |
| 3 | 200-500 行 | 中等改动 |
| 4 | 500-1000 行 | 较大改动 |
| 5 | > 1000 行 | 大型改动 |

#### 技术难度评估
| 等级 | 说明 |
|------|------|
| 1 | 简单 CRUD、配置修改 |
| 2 | 常规业务逻辑 |
| 3 | 复杂算法、第三方集成 |
| 4 | 新技术栈、架构变更 |
| 5 | 核心系统重构 |

#### 依赖复杂度评估
| 等级 | 说明 |
|------|------|
| 1 | 无外部依赖，独立模块 |
| 2 | 依赖 1-2 个内部模块 |
| 3 | 依赖 3-5 个模块 |
| 4 | 跨团队协作 |
| 5 | 外部系统集成 |

#### 测试复杂度评估
| 等级 | 说明 |
|------|------|
| 1 | 简单单测即可 |
| 2 | 常规单测 + 少量集成测试 |
| 3 | 需要 Mock、集成测试 |
| 4 | 需要 E2E 测试 |
| 5 | 需要性能/安全测试 |

### 步骤 3: 时间估算

使用三点估算法（PERT）：

| 场景 | 时间 | 说明 |
|------|------|------|
| 乐观 (O) | ?h | 一切顺利，无阻塞 |
| 正常 (M) | ?h | 预期情况，少量问题 |
| 悲观 (P) | ?h | 遇到较多问题 |

**期望时间** = (O + 4×M + P) ÷ 6 = ?h

### 步骤 4: 故事点映射

| 故事点 | 时间范围 | 适用场景 |
|--------|----------|----------|
| 1 | 1-2 小时 | 微小改动、配置修改 |
| 2 | 2-4 小时 | 小功能、Bug 修复 |
| 3 | 4-8 小时 | 中等功能 |
| 5 | 1-2 天 | 较大功能 |
| 8 | 2-3 天 | 大功能 |
| 13 | 3-5 天 | 需要拆分的大任务 |

### 步骤 5: 风险识别

识别可能影响估算的风险因素：

| 风险类型 | 检查项 |
|----------|--------|
| 技术风险 | 新技术？复杂算法？不熟悉的领域？ |
| 依赖风险 | 外部依赖？团队协作？接口不稳定？ |
| 需求风险 | 需求明确？可能变更？边界清晰？ |
| 资源风险 | 人员可用？环境就绪？ |

---

## 📊 分析检查清单（非输出结构）

以下内容只用于推导估算，不构成第二套输出字段：
- 确认故事点与三点时间估算相互一致
- 在 breakdown 中列出主要任务、工时和复杂度
- 在 risks 中列出风险、影响和缓解措施
- 在 assumptions 中明确估算前提
- 使用 confidence 表达当前信息充分程度

最终响应只允许使用下方 JSON 契约中的字段名。

## 📤 输出格式要求

请严格按以下 JSON 格式输出估算结果。字段名必须与 structuredContent.outputContract 完全一致：

\`\`\`json
{output_contract_example}
\`\`\`

## ⚠️ 边界约束

- ❌ 仅估算，不执行任何开发工作
- ❌ 估算基于静态分析，实际可能有偏差
- ✅ 输出结构化估算结果和风险分析

---

*指南版本: 1.0.0*
*工具: MCP Probe Kit - estimate*
`;

/**
 * estimate 工具实现
 */
export async function estimate(args: any) {
  try {
    // 智能参数解析，支持自然语言输入
    const parsedArgs = parseArgs<{
      task_description?: string;
      code_context?: string;
      team_size?: number;
      experience_level?: string;
    }>(args, {
      defaultValues: {
        task_description: "",
        code_context: "",
        team_size: 1,
        experience_level: "mid",
      },
      primaryField: "task_description", // 纯文本输入默认映射到 task_description 字段
      fieldAliases: {
        task_description: ["task", "description", "requirement", "任务", "任务描述"],
        code_context: ["context", "code", "上下文", "相关代码"],
        team_size: ["team", "size", "团队", "团队规模"],
        experience_level: ["level", "experience", "经验", "经验水平"],
      },
    });

    const taskDescription = getString(parsedArgs.task_description);
    const codeContext = getString(parsedArgs.code_context);
    const teamSize = getNumber(parsedArgs.team_size, 1);
    const experienceLevel = getString(parsedArgs.experience_level) || "mid";

    if (!taskDescription) {
      throw new Error("缺少必填参数: task_description（任务描述）");
    }
    if (!Number.isInteger(teamSize) || teamSize < 1) {
      throw new Error(`参数 team_size 必须是大于等于 1 的整数，当前值: ${String(parsedArgs.team_size)}`);
    }
    if (!['junior', 'mid', 'senior'].includes(experienceLevel)) {
      throw new Error(`参数 experience_level 不支持: ${experienceLevel}。可选值: junior, mid, senior`);
    }

    const expLevelMap: Record<string, string> = {
      junior: "初级（1-2年经验）",
      mid: "中级（3-5年经验）",
      senior: "高级（5年以上经验）",
    };

    const codeContextSection = codeContext
      ? `**相关代码/文件**:\n\`\`\`\n${codeContext}\n\`\`\``
      : "";

    const header = renderGuidanceHeader({
      tool: "estimate",
      goal: "输出结构化的工作量估算结果。",
      tasks: ["基于任务描述进行估算", "仅输出估算结果"],
      outputs: ["结构化估算报告（JSON）"],
    });

    const guide = `${header}${PROMPT_TEMPLATE
      .replace(/{task_description}/g, taskDescription)
      .replace(/{team_size}/g, String(teamSize))
      .replace(/{experience_level}/g, expLevelMap[experienceLevel] || experienceLevel)
      .replace(/{code_context_section}/g, codeContextSection)
      .replace(/{output_contract_example}/g, JSON.stringify(ESTIMATE_OUTPUT_EXAMPLE, null, 2))}`;

    const structured: GuidanceResult = {
      mode: 'guidance',
      summary: `工作量估算指南：${taskDescription}`,
      input: {
        taskDescription,
        codeContext: codeContext || null,
        teamSize,
        experienceLevel,
      },
      instructions: [
        '把任务拆成需求、设计、开发、单元测试、审查、集成测试和文档活动',
        '分别评估代码量、技术难度、依赖和测试复杂度（1-5）',
        '给出乐观、正常、悲观时间并使用 PERT 计算期望值',
        '映射故事点，列出风险、假设和必要的拆分建议',
      ],
      outputContract: ESTIMATE_OUTPUT_CONTRACT,
      boundaries: [
        '该工具提供估算方法和输出契约，不声称已经执行真实开发',
        '估算必须基于当前输入；信息不足时降低置信度并明确假设',
      ],
      nextSteps: ['Agent 按 instructions 完成估算并输出符合 outputContract 的结果'],
    };
    return okStructured(guide, structured, {
      schema: (await import('../schemas/output/guidance-tools.js')).GuidanceResultSchema,
      note: '指导型工具：structuredContent 包含完整估算方法和输出契约',
    });
  } catch (error) {
    return handleToolError(error, 'estimate');
  }
}
