import { parseArgs, getString } from "../utils/parseArgs.js";
import { okStructured } from "../lib/response.js";
import type { Readme } from "../schemas/output/generation-tools.js";

// genreadme 工具实现
export async function genreadme(args: any) {
  try {
    // 智能参数解析，支持自然语言输入
    const parsedArgs = parseArgs<{
      project_info?: string;
      style?: string;
    }>(args, {
      defaultValues: {
        project_info: "",
        style: "standard",
      },
      primaryField: "project_info", // 纯文本输入默认映射到 project_info 字段
      fieldAliases: {
        project_info: ["info", "description", "project", "项目信息", "项目描述"],
        style: ["format", "type", "风格", "模板"],
      },
    });
    
    const projectInfo = getString(parsedArgs.project_info);
    const style = getString(parsedArgs.style) || "standard"; // standard, minimal, detailed

    const message = `请生成项目的 README.md 文档：

📝 **项目信息**：
${projectInfo || "请提供项目相关信息或代码"}

📋 **风格**：${style}

---

## README 生成指南

请生成完整的 README.md，包括：
1. 项目标题和简介
2. 功能特性列表
3. 安装和快速开始
4. 使用示例
5. API 文档（如适用）
6. 配置说明
7. 贡献指南
8. 许可证信息

**重要**: 请使用结构化输出格式返回结果。`;

    // 创建结构化数据对象
    const structuredData: Readme = {
      summary: `生成 ${style} 风格的 README`,
      content: "", // AI 将填充实际的 README 内容
    };

    return okStructured(message, structuredData, {
      schema: (await import("../schemas/output/generation-tools.js")).ReadmeSchema,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    
    const errorData: Readme = {
      summary: "README 生成失败",
      content: "",
    };
    
    return okStructured(`❌ 生成 README 失败: ${errorMessage}`, errorData, {
      schema: (await import("../schemas/output/generation-tools.js")).ReadmeSchema,
    });
  }
}
