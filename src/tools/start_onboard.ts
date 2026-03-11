import { parseArgs, getString } from "../utils/parseArgs.js";
import { okStructured } from "../lib/response.js";
import { renderOrchestrationHeader } from "../lib/orchestration-guidance.js";
import { OnboardingReportSchema } from "../schemas/structured-output.js";
import type { OnboardingReport } from "../schemas/structured-output.js";
import {
  reportToolProgress,
  throwIfAborted,
  type ToolExecutionContext,
} from "../lib/tool-execution-context.js";

/**
 * start_onboard 智能编排工具
 * 
 * 场景：快速上手项目
 * 编排：init_project_context
 */

const PROMPT_TEMPLATE = `# 📚 快速上手编排指南

## 🎯 目标

快速了解并上手当前项目

---

## 📝 步骤 1: 生成项目上下文

**调用工具**: \`init_project_context\`

**参数**:
\`\`\`json
{
  "docs_dir": "{docs_dir}",
  "project_root": "{project_path}"
}
\`\`\`

**生成内容**:
- 技术栈文档
- 架构说明
- 编码规范
- 开发指南

**产出**: \`{docs_dir}/project-context.md\`

---

## ✅ 完成检查

- [ ] 技术栈已识别
- [ ] 项目上下文已生成
- [ ] 文档已保存

---

## 📊 输出汇总

完成后，向用户提供：

### 1. 项目概览

| 项目 | 内容 |
|------|------|
| 项目名称 | [名称] |
| 项目类型 | [前端/后端/全栈/库] |
| 主要语言 | [语言] |
| 框架 | [框架] |

### 2. 技术栈

| 类别 | 技术 |
|------|------|
| 语言 | [语言列表] |
| 框架 | [框架列表] |
| 构建工具 | [工具列表] |
| 测试框架 | [框架列表] |

### 3. 快速开始

\`\`\`bash
# 安装依赖
[安装命令]

# 启动开发
[启动命令]

# 运行测试
[测试命令]
\`\`\`

### 4. 下一步建议

1. 阅读 \`{docs_dir}/project-context.md\` 了解详细信息
2. 查看 README.md 了解项目背景
3. 运行项目熟悉功能
4. 阅读核心模块代码

---

*编排工具: MCP Probe Kit - start_onboard*
`;

export async function startOnboard(args: any, context?: ToolExecutionContext) {
  try {
    throwIfAborted(context?.signal, "start_onboard 已取消");
    await reportToolProgress(context, 10, "start_onboard: 解析参数");

    // 智能参数解析，支持自然语言输入
    const parsedArgs = parseArgs<{
      project_path?: string;
      docs_dir?: string;
    }>(args, {
      defaultValues: {
        project_path: ".",
        docs_dir: "docs",
      },
      primaryField: "project_path", // 纯文本输入默认映射到 project_path 字段
      fieldAliases: {
        project_path: ["path", "dir", "directory", "路径", "项目路径"],
        docs_dir: ["docs", "output", "目录", "文档目录"],
      },
    });

    const projectPath = getString(parsedArgs.project_path) || ".";
    const docsDir = getString(parsedArgs.docs_dir) || "docs";

    throwIfAborted(context?.signal, "start_onboard 已取消");
    await reportToolProgress(context, 85, "start_onboard: 生成执行计划");

    const header = renderOrchestrationHeader({
      tool: 'start_onboard',
      goal: '快速了解并上手项目',
      tasks: [
        '按 delegated plan 顺序调用工具',
        '生成并汇总项目上下文与快速开始信息',
      ],
    });

    const guide = header + PROMPT_TEMPLATE
      .replace(/{project_path}/g, projectPath)
      .replace(/{docs_dir}/g, docsDir);

    const plan = {
      mode: 'delegated',
      steps: [
        {
          id: 'context',
          tool: 'init_project_context',
          args: {
            docs_dir: docsDir,
            project_root: projectPath,
          },
          outputs: [`${docsDir}/project-context.md`],
        },
      ],
    };

    // Create structured onboarding report
    const onboardingReport: OnboardingReport = {
      summary: `项目上手工作流：${projectPath}`,
      status: 'pending',
      steps: [
        {
          name: '生成项目上下文',
          status: 'pending',
          description: '调用 init_project_context 生成项目文档',
        },
      ],
      artifacts: [],
      nextSteps: [
        '调用 init_project_context 生成文档',
        `阅读 ${docsDir}/project-context.md`,
        '查看 README.md 了解项目背景',
      ],
      projectSummary: {
        name: '待生成',
        description: '待生成',
        techStack: [],
        architecture: '待生成',
      },
      quickstart: {
        setup: ['待生成'],
        commonTasks: [],
      },
      keyFiles: [],
      metadata: {
        plan,
      },
    };

    await reportToolProgress(context, 95, "start_onboard: 输出已生成");

    return okStructured(
      guide,
      onboardingReport,
      {
        schema: OnboardingReportSchema,
        note: 'AI 应该按照指南执行步骤，并在上下文生成后更新 structuredContent 中的项目信息',
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
