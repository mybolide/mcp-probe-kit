import { parseArgs, getString } from "../utils/parseArgs.js";
import { okStructured } from "../lib/response.js";
import { renderGuidanceHeader } from "../lib/guidance.js";
import type { SQLQuery } from "../schemas/output/generation-tools.js";

// gensql 工具实现
export async function gensql(args: any) {
  try {
    // 智能参数解析，支持自然语言输入
    const parsedArgs = parseArgs<{
      description?: string;
      dialect?: string;
    }>(args, {
      defaultValues: {
        description: "",
        dialect: "postgres",
      },
      primaryField: "description", // 纯文本输入默认映射到 description 字段
      fieldAliases: {
        description: ["query", "requirement", "需求", "查询需求"],
        dialect: ["database", "db", "type", "数据库", "数据库类型"],
      },
    });
    
    const description = getString(parsedArgs.description);
    const dialect = getString(parsedArgs.dialect) || "postgres"; // postgres, mysql, sqlite

    const header = renderGuidanceHeader({
      tool: "gensql",
      goal: "生成可执行的 SQL 语句。",
      tasks: ["根据需求生成 SQL", "仅输出 SQL 与必要说明"],
      outputs: [`${dialect} SQL`],
    });

    const message = `${header}请根据以下需求生成 SQL：

📝 **需求描述**：
${description || "请描述需要查询/操作的数据"}

🗄️ **数据库类型**：${dialect}

---

## SQL 生成指南

请生成优化的 SQL 语句，并提供：
1. 完整的 SQL 代码
2. 查询说明
3. 索引建议（如适用）
4. 性能优化建议（如适用）

**重要**: 请使用结构化输出格式返回结果。`;

    // 创建结构化数据对象
    const structuredData: SQLQuery = {
      summary: `生成 ${dialect} SQL 查询`,
      dialect: dialect as any,
      query: "", // AI 将填充实际的 SQL
      explanation: description,
    };

    return okStructured(message, structuredData, {
      schema: (await import("../schemas/output/generation-tools.js")).SQLQuerySchema,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    
    const errorData: SQLQuery = {
      summary: "SQL 生成失败",
      dialect: "postgres",
      query: "",
      explanation: errorMessage,
    };
    
    return okStructured(`❌ 生成 SQL 失败: ${errorMessage}`, errorData, {
      schema: (await import("../schemas/output/generation-tools.js")).SQLQuerySchema,
    });
  }
}
