import { parseArgs, getString } from "../utils/parseArgs.js";
import { okStructured } from "../lib/response.js";
import { renderOrchestrationHeader } from "../lib/orchestration-guidance.js";
import type { APIWorkflowReport } from "../schemas/output/workflow-tools.js";

/**
 * start_api 智能编排工具
 * 
 * 场景：API 开发
 * 编排：[检查上下文] → genapi → gen_mock → gentest
 */
export async function startApi(args: any) {
  try {
    // 智能参数解析，支持自然语言输入
    const parsedArgs = parseArgs<{
      code?: string;
      language?: string;
      format?: string;
    }>(args, {
      defaultValues: {
        code: "",
        language: "typescript",
        format: "markdown",
      },
      primaryField: "code", // 纯文本输入默认映射到 code 字段
      fieldAliases: {
        code: ["source", "api", "代码", "endpoint"],
        language: ["lang", "语言", "编程语言"],
        format: ["output", "type", "格式", "输出格式"],
      },
    });

    const code = getString(parsedArgs.code);
    const language = getString(parsedArgs.language) || "typescript";
    const format = getString(parsedArgs.format) || "markdown";

    if (!code) {
      throw new Error("缺少必填参数: code（API 代码）");
    }

    const header = renderOrchestrationHeader({
      tool: 'start_api',
      goal: '生成 API 开发资料',
      tasks: [
        '按 delegated plan 顺序调用工具',
        '生成 API 文档、Mock 数据与测试代码',
      ],
    });

    const message = header + `# 🔌 API 开发编排

为以下 API 代码生成完整的开发资料：

\`\`\`${language}
${code}
\`\`\`

---

## 📋 执行步骤

### 步骤 1: 生成 API 文档
调用 \`genapi\` 工具，生成 API 端点列表、请求/响应格式、参数说明和示例。

### 步骤 2: 生成 Mock 数据
调用 \`gen_mock\` 工具，生成请求示例数据、响应示例数据和各种场景的测试数据。

### 步骤 3: 生成 API 测试
调用 \`gentest\` 工具，生成单元测试、集成测试、边界情况测试和错误处理测试。

---

## 📊 输出内容

完成后，提供：
1. API 文档（${format} 格式）
2. Mock 数据
3. 测试代码
4. 使用建议

**重要**: 请使用结构化输出格式返回结果。`;

    const plan = {
      mode: 'delegated',
      steps: [
        {
          id: 'api-doc',
          tool: 'genapi',
          args: { code, language, format },
          outputs: [],
        },
        {
          id: 'mock',
          tool: 'gen_mock',
          args: {
            schema: '[根据 API 文档提取的数据结构]',
            count: 3,
            format: 'json',
            locale: 'zh-CN',
          },
          outputs: [],
        },
        {
          id: 'tests',
          tool: 'gentest',
          args: { code, framework: '[根据项目上下文选择]' },
          outputs: [],
        },
      ],
    };

    // 创建结构化数据对象
    const structuredData: APIWorkflowReport = {
      summary: "API 开发编排",
      status: "pending",
      steps: [
        {
          name: "genapi",
          description: "生成 API 文档",
          status: "pending",
        },
        {
          name: "gen_mock",
          description: "生成 Mock 数据",
          status: "pending",
        },
        {
          name: "gentest",
          description: "生成 API 测试",
          status: "pending",
        },
      ],
      apiDocumentation: {}, // AI 将填充实际的 API 文档
      endpoints: [], // AI 将填充端点列表
      metadata: {
        plan,
      },
    };

    return okStructured(message, structuredData, {
      schema: (await import("../schemas/output/workflow-tools.js")).APIWorkflowSchema,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    const errorData: APIWorkflowReport = {
      summary: "API 开发失败",
      status: "failed",
      steps: [],
      apiDocumentation: {},
      endpoints: [],
      warnings: [errorMsg],
    };
    
    return okStructured(`❌ 编排执行失败: ${errorMsg}`, errorData, {
      schema: (await import("../schemas/output/workflow-tools.js")).APIWorkflowSchema,
    });
  }
}
