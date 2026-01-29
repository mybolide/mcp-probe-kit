import { parseArgs, getString } from "../utils/parseArgs.js";

/**
 * gen_prototype - 生成原型设计文档指导
 * 
 * 返回原型设计文档模板和创建指导，由 AI 根据 PRD 或功能描述填充内容并创建文件
 */

export async function genPrototype(args: any) {
  try {
    // 使用智能参数解析
    const parsedArgs = parseArgs<{
      prd_path?: string;
      description?: string;
      docs_dir?: string;
    }>(args, {
      defaultValues: {
        prd_path: "",
        description: "",
        docs_dir: "docs",
      },
      primaryField: "description",
      fieldAliases: {
        prd_path: ["prd", "prd_file"],
        description: ["desc", "描述"],
        docs_dir: ["dir", "目录"],
      },
    });

    const prdPath = getString(parsedArgs.prd_path);
    const description = getString(parsedArgs.description);
    const docsDir = getString(parsedArgs.docs_dir) || "docs";

    if (!prdPath && !description) {
      return {
        content: [
          {
            type: "text",
            text: "❌ 缺少必需参数：prd_path 或 description 至少提供一个",
          },
        ],
        isError: true,
      };
    }

    const guidanceText = `# 🎨 生成原型设计文档指导

## 📋 输入信息

- **PRD 文档路径**: ${prdPath || "未提供"}
- **功能描述**: ${description || "从 PRD 中提取"}
- **文档目录**: ${docsDir}

---

## 🎯 任务说明

${prdPath ? `请读取 PRD 文档 \`${prdPath}\`，从中提取页面清单，然后为每个页面创建原型设计文档。` : `请根据功能描述，设计页面清单，然后为每个页面创建原型设计文档。`}

---

## 📝 执行步骤

### 步骤 1: 提取/设计页面清单

${prdPath ? `
**从 PRD 中提取页面清单**:
1. 读取 \`${prdPath}\` 文件
2. 找到 "## 5. 页面清单" 章节
3. 提取表格中的所有页面信息（页面名称、路径、类型、说明）
` : `
**根据功能描述设计页面清单**:
1. 分析功能描述
2. 设计至少包含以下页面：
   - 首页（/）- 产品介绍和导航入口
   - 核心功能页（/feature）- 主要功能展示
   - 其他必要页面
`}

### 步骤 2: 创建原型索引文档

创建文件 \`${docsDir}/prototype/prototype-index.md\`：

\`\`\`markdown
# 原型设计索引

> 生成时间：${new Date().toLocaleString('zh-CN')}
> 工具版本：mcp-probe-kit v2.3.0

## 概述

本文档是原型设计的索引文件，列出了所有页面的原型文档。

## 页面清单

共 [N] 个页面：

- [页面1名称](page-页面1名称.md) - 页面1说明
- [页面2名称](page-页面2名称.md) - 页面2说明
- [页面3名称](page-页面3名称.md) - 页面3说明

---

## 页面导航流程

**根据页面功能设计导航流程：**

- 首页 → 功能页 → 详情页
- [根据实际页面设计导航流程]

---

## 使用说明

1. 点击上方的页面链接查看对应的原型文档
2. 每个原型文档包含页面结构、交互说明、元素清单
3. 完成原型设计后，可以使用 \`start_ui\` 工具生成 HTML 原型

---

## 下一步

- [ ] 完善每个页面的原型文档
- [ ] 使用 \`ui_design_system\` 工具生成设计系统
- [ ] 使用 \`start_ui\` 工具生成 HTML 可交互原型
- [ ] 与团队评审原型设计
\`\`\`

### 步骤 3: 为每个页面创建原型文档

为每个页面创建文件 \`${docsDir}/prototype/page-[页面名称].md\`：

\`\`\`markdown
# 页面原型 - [页面名称]

> 生成时间：${new Date().toLocaleString('zh-CN')}
> 工具版本：mcp-probe-kit v2.3.0

## 页面信息

- **页面名称**: [页面名称]
- **页面路径**: [页面路径]
- **页面类型**: [页面类型]
- **页面说明**: [页面说明]

---

## 页面结构

### Header（页头）

**设计页头区域：**
- Logo
- 导航菜单
- 用户信息/登录按钮

### Main Content（主内容区）

**根据页面功能设计主内容区：**

#### Section 1
- 元素 1
- 元素 2
- 元素 3

#### Section 2
- 元素 1
- 元素 2

### Footer（页脚）

**设计页脚区域：**
- 版权信息
- 联系方式
- 相关链接

---

## 交互说明

**描述页面的交互行为：**

1. **交互 1**
   - 触发条件：[用户操作]
   - 行为：[系统响应]
   - 目标：[跳转或状态变化]

2. **交互 2**
   - 触发条件：[用户操作]
   - 行为：[系统响应]
   - 目标：[跳转或状态变化]

---

## 页面元素清单

**列出页面所需的所有 UI 元素：**

- [ ] 元素 1：[描述]
- [ ] 元素 2：[描述]
- [ ] 元素 3：[描述]
- [ ] 元素 4：[描述]

---

## 设计建议

**提供设计建议：**

- **布局建议**: [响应式布局、栅格系统等]
- **视觉建议**: [颜色、字体、间距等]
- **交互建议**: [动画、反馈、加载状态等]
\`\`\`

---

## 📌 填充指南

### 页面结构
- 根据页面功能设计合理的布局结构
- 包含 Header、Main Content、Footer 三个主要区域
- Main Content 可以分为多个 Section

### 交互说明
- 描述用户在页面上的所有交互行为
- 包括点击、输入、滚动等操作
- 说明每个交互的触发条件、系统响应和目标

### 页面元素清单
- 列出页面所需的所有 UI 元素
- 包括按钮、输入框、卡片、列表等
- 为每个元素提供简要描述

### 设计建议
- 提供布局、视觉、交互方面的设计建议
- 考虑响应式设计和用户体验
- 参考设计系统规范

---

## ✅ 完成后

所有原型文档应该已经创建在 \`${docsDir}/prototype/\` 目录下：
- \`prototype-index.md\` - 原型索引
- \`page-*.md\` - 各页面原型文档

---

## 🎯 下一步建议

1. 使用 \`ui_design_system\` 工具生成设计系统
2. 使用 \`start_ui\` 工具生成 HTML 可交互原型
3. 或使用 \`start_product\` 工具执行完整的产品设计工作流

---

💡 **提示**: 这是一个指导文档，AI 需要根据 PRD 或功能描述智能填充所有内容并创建实际的原型文件。
`;

    return {
      content: [
        {
          type: "text",
          text: guidanceText,
        },
      ],
      isError: false,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `❌ 生成原型设计指导失败: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
}
