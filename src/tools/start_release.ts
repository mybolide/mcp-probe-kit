import { parseArgs, getString } from "../utils/parseArgs.js";

/**
 * start_release 智能编排工具
 * 
 * 场景：发布准备
 * 编排：[检查上下文] → genchangelog → genpr
 */

const PROMPT_TEMPLATE = `# 📦 发布准备编排指南

## 🎯 目标

准备发布版本：**{version}**

---

## 📋 步骤 0: 项目上下文（自动处理）

**操作**:
1. 检查 \`docs/project-context.md\` 是否存在
2. **如果不存在**：
   - 调用 \`init_project_context\` 工具
   - 等待生成完成
3. **读取** \`docs/project-context.md\` 内容
4. 了解项目的版本管理方式、发布流程

---

## 📝 步骤 1: 生成 Changelog

**调用工具**: \`genchangelog\`

**参数**:
\`\`\`json
{
  "version": "{version}",
  "from": "{from_tag}",
  "to": "HEAD"
}
\`\`\`

**执行要点**:
1. 分析从上个版本到现在的所有 commit
2. 按类型分类（feat/fix/docs/refactor 等）
3. 生成结构化的变更日志

**产出**: CHANGELOG.md 内容

---

## 📋 步骤 2: 生成 PR 描述

**调用工具**: \`genpr\`

**参数**:
\`\`\`json
{
  "branch": "{branch}",
  "commits": "[从 genchangelog 获取的 commit 信息]"
}
\`\`\`

**执行要点**:
1. 总结本次发布的主要变更
2. 列出新功能、Bug 修复、破坏性变更
3. 生成规范的 PR 描述

**产出**: PR 描述

---

## ✅ 完成检查

- [ ] 项目上下文已读取
- [ ] Changelog 已生成
- [ ] PR 描述已生成
- [ ] 版本号已确认

---

## 📝 输出汇总

完成后，向用户提供：

### 1. CHANGELOG 内容

\`\`\`markdown
## [{version}] - {date}

### ✨ 新功能
- ...

### 🐛 Bug 修复
- ...

### 📝 文档
- ...

### ♻️ 重构
- ...
\`\`\`

### 2. PR 描述

\`\`\`markdown
## 发布 {version}

### 变更摘要
...

### 详细变更
...

### 测试情况
...
\`\`\`

### 3. 发布检查清单

- [ ] 版本号已更新（package.json 等）
- [ ] CHANGELOG.md 已更新
- [ ] 测试全部通过
- [ ] 文档已更新
- [ ] PR 已创建

---

*编排工具: MCP Probe Kit - start_release*
`;

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

    const guide = PROMPT_TEMPLATE
      .replace(/{version}/g, version)
      .replace(/{from_tag}/g, fromTag)
      .replace(/{branch}/g, branch)
      .replace(/{date}/g, new Date().toISOString().split("T")[0]);

    return {
      content: [{ type: "text", text: guide }],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `❌ 编排执行失败: ${errorMsg}` }],
      isError: true,
    };
  }
}
