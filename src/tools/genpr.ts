import { parseArgs, getString } from "../utils/parseArgs.js";
import { okStructured } from "../lib/response.js";
import { renderGuidanceHeader } from "../lib/guidance.js";
import type { PullRequest } from "../schemas/output/generation-tools.js";

// genpr 工具实现
export async function genpr(args: any) {
  try {
    // 智能参数解析，支持自然语言输入
    const parsedArgs = parseArgs<{
      branch?: string;
      commits?: string;
    }>(args, {
      defaultValues: {
        branch: "",
        commits: "",
      },
      primaryField: "commits", // 纯文本输入默认映射到 commits 字段
      fieldAliases: {
        branch: ["分支", "branch_name"],
        commits: ["commit_history", "log", "提交", "提交历史"],
      },
    });
    
    const branch = getString(parsedArgs.branch);
    const commits = getString(parsedArgs.commits);

    const header = renderGuidanceHeader({
      tool: "genpr",
      goal: "生成结构化的 Pull Request 描述。",
      tasks: ["基于 commit 历史生成 PR 描述", "仅输出最终 PR 文本"],
      outputs: ["PR 描述（含变更说明/测试计划/Checklist）"],
    });

    const message = `${header}请生成规范的 Pull Request 描述：

📝 **分支信息**：
${branch || "请提供分支名称"}

📋 **Commit 历史**：
${commits || "请先执行 git log 查看 commit 历史"}

---

## PR 描述生成指南

请生成完整的 PR 描述，包括：

1. **变更说明** - 概述和详细变更内容
2. **解决的问题** - 关联的 Issue
3. **技术细节** - 主要修改和架构变更
4. **测试计划** - 测试覆盖情况
5. **注意事项** - 破坏性变更、部署注意事项
6. **Checklist** - 代码审查清单

**重要**: 请使用结构化输出格式返回结果。`;

    // 创建结构化数据对象
    const structuredData: PullRequest = {
      summary: `生成 ${branch || "分支"} 的 PR 描述`,
      title: "", // AI 将填充 PR 标题
      description: "", // AI 将填充 PR 描述
      type: "feature", // AI 将根据内容判断类型
    };

    return okStructured(message, structuredData, {
      schema: (await import("../schemas/output/generation-tools.js")).PullRequestSchema,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    
    const errorData: PullRequest = {
      summary: "PR 描述生成失败",
      title: "",
      description: "",
      type: "feature",
    };
    
    return okStructured(`❌ 生成 PR 描述失败: ${errorMessage}`, errorData, {
      schema: (await import("../schemas/output/generation-tools.js")).PullRequestSchema,
    });
  }
}
