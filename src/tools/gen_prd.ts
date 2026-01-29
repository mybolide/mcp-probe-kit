import { parseArgs, getString } from "../utils/parseArgs.js";

/**
 * gen_prd - 生成产品需求文档（PRD）指导
 * 
 * 返回 PRD 文档模板和创建指导，由 AI 根据产品描述填充内容并创建文件
 */

export async function genPrd(args: any) {
  try {
    // 使用智能参数解析
    const parsedArgs = parseArgs<{
      description?: string;
      product_name?: string;
      docs_dir?: string;
    }>(args, {
      defaultValues: {
        description: "",
        product_name: "新产品",
        docs_dir: "docs",
      },
      primaryField: "description",
      fieldAliases: {
        description: ["desc", "需求", "描述"],
        product_name: ["name", "产品名称"],
        docs_dir: ["dir", "目录"],
      },
    });

    const description = getString(parsedArgs.description);
    const productName = getString(parsedArgs.product_name) || "新产品";
    const docsDir = getString(parsedArgs.docs_dir) || "docs";

    if (!description) {
      return {
        content: [
          {
            type: "text",
            text: "❌ 缺少必需参数：description（产品描述或访谈记录）",
          },
        ],
        isError: true,
      };
    }

    const guidanceText = `# 📝 生成产品需求文档（PRD）指导

## 📋 输入信息

- **产品名称**: ${productName}
- **文档目录**: ${docsDir}
- **产品描述**: 
${description}

---

## 🎯 任务说明

请根据上述产品描述，创建一个完整的 PRD 文档。

---

## 📄 PRD 文档模板

请将以下模板保存为 \`${docsDir}/prd/product-requirements.md\`：

\`\`\`markdown
# 产品需求文档 (PRD) - ${productName}

> 生成时间：${new Date().toLocaleString('zh-CN')}
> 工具版本：mcp-probe-kit v2.3.0

## 目录

- [1. 产品概述](#1-产品概述)
- [2. 功能需求](#2-功能需求)
- [3. 功能优先级](#3-功能优先级)
- [4. 非功能性需求](#4-非功能性需求)
- [5. 页面清单](#5-页面清单)

---

## 1. 产品概述

### 1.1 产品愿景

${description}

### 1.2 目标用户

**根据产品描述分析目标用户群体：**
- 用户群体 1：[请根据产品描述填写]
- 用户群体 2：[请根据产品描述填写]
- 用户群体 3：[请根据产品描述填写]

### 1.3 核心价值

**提炼产品的核心价值主张：**
- 价值点 1：[请根据产品描述填写]
- 价值点 2：[请根据产品描述填写]
- 价值点 3：[请根据产品描述填写]

---

## 2. 功能需求

### 2.1 核心功能

**根据产品描述提取核心功能列表：**

1. **功能 1**
   - 描述：[功能描述]
   - 用户价值：[为用户带来什么价值]

2. **功能 2**
   - 描述：[功能描述]
   - 用户价值：[为用户带来什么价值]

3. **功能 3**
   - 描述：[功能描述]
   - 用户价值：[为用户带来什么价值]

### 2.2 用户故事

**生成用户故事：**

- 作为 [角色]，我希望 [功能]，以便 [价值]
- 作为 [角色]，我希望 [功能]，以便 [价值]
- 作为 [角色]，我希望 [功能]，以便 [价值]

---

## 3. 功能优先级

### P0（必须有 - Must Have）

**识别核心功能（产品 MVP 必需）：**
- [ ] 功能 1
- [ ] 功能 2

### P1（应该有 - Should Have）

**识别重要但非核心的功能：**
- [ ] 功能 3
- [ ] 功能 4

### P2（可以有 - Could Have）

**识别锦上添花的功能：**
- [ ] 功能 5
- [ ] 功能 6

---

## 4. 非功能性需求

### 4.1 性能要求

**根据产品类型提出性能要求：**
- 页面加载时间：< 2 秒
- API 响应时间：< 500ms
- 并发用户数：[根据产品规模估算]

### 4.2 安全要求

**提出安全要求：**
- 用户认证：[认证方式]
- 数据加密：[加密方式]
- 权限控制：[权限模型]

### 4.3 兼容性要求

**提出兼容性要求：**
- 浏览器支持：Chrome、Firefox、Safari、Edge（最新两个版本）
- 移动端支持：iOS 13+、Android 8+
- 屏幕分辨率：支持响应式设计

---

## 5. 页面清单

**根据功能需求列出所有需要的页面：**

| 页面名称 | 页面路径 | 页面类型 | 说明 |
|---------|---------|---------|------|
| 首页 | / | 主页面 | 产品介绍和导航入口 |
| 登录页 | /login | 认证页面 | 用户登录 |
| 注册页 | /register | 认证页面 | 用户注册 |
| 功能页 1 | /feature-1 | 功能页面 | [功能说明] |
| 功能页 2 | /feature-2 | 功能页面 | [功能说明] |

---

## 附录

### 术语表

- **术语 1**：定义
- **术语 2**：定义

### 参考资料

- [相关文档或链接]

---

**注意：** 本文档由 AI 辅助生成，请根据实际情况调整和完善内容。
\`\`\`

---

## ✅ 执行步骤

1. **创建目录**: 确保 \`${docsDir}/prd/\` 目录存在
2. **创建文件**: 将上述模板保存为 \`${docsDir}/prd/product-requirements.md\`
3. **填充内容**: 根据产品描述智能填充所有标记为 [请根据产品描述填写] 的部分
4. **完善细节**: 
   - 分析目标用户群体
   - 提炼核心价值主张
   - 提取核心功能列表
   - 生成用户故事
   - 划分功能优先级
   - 列出所有需要的页面

---

## 📌 填充指南

### 1.2 目标用户
- 分析产品描述中提到的用户群体
- 考虑产品的使用场景和目标市场
- 描述每个用户群体的特征和需求

### 1.3 核心价值
- 提炼产品解决的核心问题
- 描述产品为用户带来的主要价值
- 突出产品的差异化优势

### 2.1 核心功能
- 从产品描述中提取所有功能点
- 为每个功能描述其作用和用户价值
- 确保功能覆盖产品的核心需求

### 2.2 用户故事
- 使用"作为...我希望...以便..."格式
- 每个用户故事对应一个具体功能
- 确保用户故事清晰、可测试

### 3. 功能优先级
- P0: 产品 MVP 必需的核心功能
- P1: 重要但非核心的功能
- P2: 锦上添花的功能

### 5. 页面清单
- 列出所有需要的页面
- 包括页面路径、类型和说明
- 确保页面覆盖所有功能

---

## 🎯 下一步建议

1. 完成 PRD 文档创建后，使用 \`gen_prototype\` 工具生成原型设计文档
2. 或使用 \`start_product\` 工具执行完整的产品设计工作流

---

💡 **提示**: 这是一个指导文档，AI 需要根据产品描述智能填充所有内容并创建实际的 PRD 文件。
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
          text: `❌ 生成 PRD 指导失败: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
}
