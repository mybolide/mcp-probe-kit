import { parseArgs, getString } from "../utils/parseArgs.js";
import { okStructured } from "../lib/response.js";
import { renderOrchestrationHeader } from "../lib/orchestration-guidance.js";
import type { DocWorkflowReport } from "../schemas/output/workflow-tools.js";

/**
 * start_doc 智能编排工具
 * 
 * 场景：文档生成
 * 编排：[检查上下文] → gendoc → genreadme → genapi
 */
export async function startDoc(args: any) {
  try {
    // 智能参数解析，支持自然语言输入
    const parsedArgs = parseArgs<{
      code?: string;
      project_info?: string;
      style?: string;
      lang?: string;
    }>(args, {
      defaultValues: {
        code: "",
        project_info: "",
        style: "jsdoc",
        lang: "zh",
      },
      primaryField: "code", // 纯文本输入默认映射到 code 字段
      fieldAliases: {
        code: ["source", "src", "代码", "content"],
        project_info: ["info", "project", "项目信息"],
        style: ["format", "type", "风格", "注释风格"],
        lang: ["language", "语言"],
      },
    });

    const code = getString(parsedArgs.code) || getString(parsedArgs.project_info);
    const style = getString(parsedArgs.style) || "jsdoc";
    const lang = getString(parsedArgs.lang) || "zh";

    if (!code) {
      throw new Error("缺少必填参数: code 或 project_info");
    }

    const header = renderOrchestrationHeader({
      tool: 'start_doc',
      goal: '生成项目文档与注释',
      tasks: [
        '按 delegated plan 顺序调用工具',
        '输出注释、README 与 API 文档',
      ],
    });

    const message = header + `# 📖 文档生成编排

为项目/代码生成完整的文档

**输入内容**:
\`\`\`
${code}
\`\`\`

---

## 📋 执行步骤

### 步骤 1: 生成代码注释
调用 \`gendoc\` 工具，生成函数/方法注释、参数说明、返回值说明和使用示例。

### 步骤 2: 生成 README
调用 \`genreadme\` 工具，生成项目简介、功能特性、安装使用、API 说明和贡献指南。

### 步骤 3: 生成 API 文档（如适用）
调用 \`genapi\` 工具，生成 API 端点列表、请求/响应格式和参数说明。

---

## 📊 输出内容

完成后，提供：
1. 代码注释（${style} 风格）
2. README.md
3. API 文档（如适用）
4. 文档清单

**重要**: 请使用结构化输出格式返回结果。`;

    const plan = {
      mode: 'delegated',
      steps: [
        {
          id: 'doc',
          tool: 'gendoc',
          args: { code, style, lang },
          outputs: [],
        },
        {
          id: 'readme',
          tool: 'genreadme',
          args: { project_info: code, style: 'standard' },
          outputs: ['README.md'],
        },
        {
          id: 'api',
          tool: 'genapi',
          when: '如包含 API 相关代码',
          args: { code, format: 'markdown' },
          outputs: [],
        },
      ],
    };

    // 创建结构化数据对象
    const structuredData: DocWorkflowReport = {
      summary: "文档生成编排",
      status: "pending",
      steps: [
        {
          name: "gendoc",
          description: "生成代码注释",
          status: "pending",
        },
        {
          name: "genreadme",
          description: "生成 README",
          status: "pending",
        },
        {
          name: "genapi",
          description: "生成 API 文档",
          status: "pending",
        },
      ],
      coverage: {
        functions: 0,
        classes: 0,
        modules: 0,
      },
      metadata: {
        plan,
      },
    };

    return okStructured(message, structuredData, {
      schema: (await import("../schemas/output/workflow-tools.js")).DocWorkflowSchema,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    const errorData: DocWorkflowReport = {
      summary: "文档生成失败",
      status: "failed",
      steps: [],
      coverage: {
        functions: 0,
        classes: 0,
        modules: 0,
      },
      warnings: [errorMsg],
    };
    
    return okStructured(`❌ 编排执行失败: ${errorMsg}`, errorData, {
      schema: (await import("../schemas/output/workflow-tools.js")).DocWorkflowSchema,
    });
  }
}
