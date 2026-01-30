import { parseArgs, getString, getNumber } from "../utils/parseArgs.js";
import { okStructured } from "../lib/response.js";
import { renderGuidanceHeader } from "../lib/guidance.js";
import type { MockData } from "../schemas/output/generation-tools.js";

/**
 * gen_mock 工具实现
 */
export async function genMock(args: any) {
  try {
    // 智能参数解析，支持自然语言输入
    const parsedArgs = parseArgs<{
      schema?: string;
      count?: number;
      format?: string;
      locale?: string;
      seed?: number;
    }>(args, {
      defaultValues: {
        schema: "",
        count: 1,
        format: "json",
        locale: "zh-CN",
        seed: 0,
      },
      primaryField: "schema", // 纯文本输入默认映射到 schema 字段
      fieldAliases: {
        schema: ["type", "interface", "structure", "类型", "数据结构"],
        count: ["num", "amount", "number", "数量"],
        format: ["output", "type", "格式", "输出格式"],
        locale: ["lang", "language", "语言", "区域"],
        seed: ["random_seed", "种子"],
      },
    });

    const schema = getString(parsedArgs.schema);
    const count = getNumber(parsedArgs.count, 1);
    const format = getString(parsedArgs.format) || "json";
    const locale = getString(parsedArgs.locale) || "zh-CN";
    const seed = getNumber(parsedArgs.seed, 0);

    if (!schema) {
      throw new Error("缺少必填参数: schema（数据结构定义）");
    }

    if (count < 1 || count > 1000) {
      throw new Error("count 参数必须在 1-1000 之间");
    }

    const header = renderGuidanceHeader({
      tool: "gen_mock",
      goal: "生成符合结构定义的 Mock 数据。",
      tasks: ["根据 schema 生成数据", "仅输出 Mock 数据结果"],
      outputs: [`${format} 格式的 Mock 数据`],
    });

    const message = `${header}请生成 Mock 数据：

📝 **数据结构**：
\`\`\`
${schema}
\`\`\`

📋 **生成配置**：
- 数量: ${count} 条
- 格式: ${format}
- 语言: ${locale}
${seed ? `- 随机种子: ${seed}（可重复生成）` : ""}

---

## Mock 数据生成指南

请根据数据结构生成 ${count} 条 Mock 数据，注意：
1. 根据字段名识别语义（如 email、phone、name 等）
2. 生成符合语义的真实数据
3. 确保数据多样性
4. 保持关联数据一致性

**重要**: 请使用结构化输出格式返回结果。`;

    // 创建结构化数据对象
    const structuredData: MockData = {
      summary: `生成 ${count} 条 ${format} 格式的 Mock 数据`,
      format: format as any,
      count: count,
      data: [], // AI 将填充实际的 Mock 数据
    };

    return okStructured(message, structuredData, {
      schema: (await import("../schemas/output/generation-tools.js")).MockDataSchema,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    const errorData: MockData = {
      summary: "Mock 数据生成失败",
      format: "json",
      count: 0,
      data: [],
    };
    
    return okStructured(`❌ Mock 数据生成失败: ${errorMsg}`, errorData, {
      schema: (await import("../schemas/output/generation-tools.js")).MockDataSchema,
    });
  }
}
