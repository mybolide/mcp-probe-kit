import { parseArgs, getString } from "../utils/parseArgs.js";
import { okStructured } from "../lib/response.js";
import type { ReleaseWorkflowReport } from "../schemas/output/workflow-tools.js";

/**
 * start_release 智能编排工具
 * 
 * 场景：发布准备
 * 编排：[检查上下文] → genchangelog → genpr
 */
export async function startRelease(args: any) {
  try {
    // 智能参数解析，支持自然语言输入
    const parsedArgs = parseArgs<{
      version?: string;
      from_tag?: string;
      branch?: string;
    }>(args, {
      defaultValues: {
        version: "",
        from_tag: "上个版本 tag",
        branch: "",
      },
      primaryField: "version", // 纯文本输入默认映射到 version 字段
      fieldAliases: {
        version: ["ver", "v", "版本", "版本号"],
        from_tag: ["from", "start", "起始", "起始版本"],
        branch: ["分支", "发布分支"],
      },
    });

    const version = getString(parsedArgs.version);
    const fromTag = getString(parsedArgs.from_tag) || "上个版本 tag";
    const branch = getString(parsedArgs.branch) || "release/" + version;

    if (!version) {
      throw new Error("缺少必填参数: version（版本号，如 v1.2.0）");
    }

    const message = `# 📦 发布准备编排

准备发布版本：**${version}**

---

## 📋 执行步骤

### 步骤 1: 生成 Changelog
调用 \`genchangelog\` 工具，分析从 ${fromTag} 到现在的所有 commit，按类型分类生成变更日志。

### 步骤 2: 生成 PR 描述
调用 \`genpr\` 工具，总结本次发布的主要变更，生成规范的 PR 描述。

---

## 📝 输出内容

完成后，提供：
1. CHANGELOG.md 内容
2. PR 描述
3. 发布检查清单

**重要**: 请使用结构化输出格式返回结果。`;

    // 创建结构化数据对象
    const structuredData: ReleaseWorkflowReport = {
      summary: `发布 ${version} 准备`,
      status: "pending",
      steps: [
        {
          name: "genchangelog",
          description: "生成 Changelog",
          status: "pending",
        },
        {
          name: "genpr",
          description: "生成 PR 描述",
          status: "pending",
        },
      ],
      version: version,
      changelog: {}, // AI 将填充实际的 Changelog
    };

    return okStructured(message, structuredData, {
      schema: (await import("../schemas/output/workflow-tools.js")).ReleaseWorkflowSchema,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    const errorData: ReleaseWorkflowReport = {
      summary: "发布准备失败",
      status: "failed",
      steps: [],
      version: "",
      changelog: {},
      warnings: [errorMsg],
    };
    
    return okStructured(`❌ 编排执行失败: ${errorMsg}`, errorData, {
      schema: (await import("../schemas/output/workflow-tools.js")).ReleaseWorkflowSchema,
    });
  }
}
