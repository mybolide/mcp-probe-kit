import { parseArgs, getString } from "../utils/parseArgs.js";
import { okStructured } from "../lib/response.js";
import type { Changelog } from "../schemas/output/generation-tools.js";

// genchangelog 工具实现
export async function genchangelog(args: any) {
  try {
    // 智能参数解析，支持自然语言输入
    const parsedArgs = parseArgs<{
      version?: string;
      from?: string;
      to?: string;
    }>(args, {
      defaultValues: {
        version: "",
        from: "",
        to: "HEAD",
      },
      primaryField: "version", // 纯文本输入默认映射到 version 字段
      fieldAliases: {
        version: ["ver", "v", "版本", "版本号"],
        from: ["from_tag", "start", "起始", "起始版本"],
        to: ["to_tag", "end", "结束", "结束版本"],
      },
    });
    
    const version = getString(parsedArgs.version);
    const from = getString(parsedArgs.from);
    const to = getString(parsedArgs.to) || "HEAD";

    const message = `请生成项目的 CHANGELOG（变更日志）：

📝 **版本信息**：
${version || "请提供版本号（如：v1.2.0）"}

📋 **Commit 范围**：
从 ${from || "上一个 tag"} 到 ${to}

---

## Changelog 生成指南

请生成符合 [Keep a Changelog](https://keepachangelog.com/) 规范的 CHANGELOG，包括：

1. **Added（新增）** - 新功能
2. **Changed（变更）** - 功能修改
3. **Deprecated（废弃）** - 即将移除的功能
4. **Removed（移除）** - 已移除的功能
5. **Fixed（修复）** - Bug 修复
6. **Security（安全）** - 安全漏洞修复

**重要**: 请使用结构化输出格式返回结果。`;

    // 创建结构化数据对象
    const structuredData: Changelog = {
      summary: `生成 ${version || "新版本"} 的 Changelog`,
      version: version || "",
      date: new Date().toISOString().split('T')[0],
      content: "", // AI 将填充实际的 Changelog 内容
      changes: {
        features: [],
        fixes: [],
        breaking: [],
      },
    };

    return okStructured(message, structuredData, {
      schema: (await import("../schemas/output/generation-tools.js")).ChangelogSchema,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    
    const errorData: Changelog = {
      summary: "Changelog 生成失败",
      version: "",
      date: new Date().toISOString().split('T')[0],
      content: "",
      changes: {},
    };
    
    return okStructured(`❌ 生成 Changelog 失败: ${errorMessage}`, errorData, {
      schema: (await import("../schemas/output/generation-tools.js")).ChangelogSchema,
    });
  }
}
