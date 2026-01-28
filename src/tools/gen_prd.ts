import { promises as fs } from "fs";
import path from "path";

/**
 * gen_prd - 生成产品需求文档（PRD）
 * 
 * 基于产品描述或访谈记录生成标准的 PRD 文档
 */

interface GenPrdInput {
  description: string;        // 产品描述或访谈记录
  product_name?: string;      // 产品名称（可选）
  docs_dir?: string;          // 输出目录（默认 docs）
}

interface GenPrdOutput {
  success: boolean;
  message: string;
  data: {
    prd_path: string;         // PRD 文档路径
    sections: string[];       // 生成的章节列表
  };
}

/**
 * 生成 PRD 文档模板
 */
function generatePrdTemplate(productName: string, description: string): string {
  return `# 产品需求文档 (PRD) - ${productName}

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

**请 AI 根据产品描述分析目标用户群体：**
- 用户群体 1：[描述]
- 用户群体 2：[描述]
- 用户群体 3：[描述]

### 1.3 核心价值

**请 AI 提炼产品的核心价值主张：**
- 价值点 1：[描述]
- 价值点 2：[描述]
- 价值点 3：[描述]

---

## 2. 功能需求

### 2.1 核心功能

**请 AI 根据产品描述提取核心功能列表：**

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

**请 AI 生成用户故事：**

- 作为 [角色]，我希望 [功能]，以便 [价值]
- 作为 [角色]，我希望 [功能]，以便 [价值]
- 作为 [角色]，我希望 [功能]，以便 [价值]

---

## 3. 功能优先级

### P0（必须有 - Must Have）

**请 AI 识别核心功能（产品 MVP 必需）：**
- [ ] 功能 1
- [ ] 功能 2

### P1（应该有 - Should Have）

**请 AI 识别重要但非核心的功能：**
- [ ] 功能 3
- [ ] 功能 4

### P2（可以有 - Could Have）

**请 AI 识别锦上添花的功能：**
- [ ] 功能 5
- [ ] 功能 6

---

## 4. 非功能性需求

### 4.1 性能要求

**请 AI 根据产品类型提出性能要求：**
- 页面加载时间：< 2 秒
- API 响应时间：< 500ms
- 并发用户数：[根据产品规模估算]

### 4.2 安全要求

**请 AI 提出安全要求：**
- 用户认证：[认证方式]
- 数据加密：[加密方式]
- 权限控制：[权限模型]

### 4.3 兼容性要求

**请 AI 提出兼容性要求：**
- 浏览器支持：Chrome、Firefox、Safari、Edge（最新两个版本）
- 移动端支持：iOS 13+、Android 8+
- 屏幕分辨率：支持响应式设计

---

## 5. 页面清单

**请 AI 根据功能需求列出所有需要的页面：**

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

**注意：** 本文档由 AI 辅助生成，请根据实际情况调整和完善内容。标记为"请 AI..."的部分需要 AI 根据产品描述进行智能填充。
`;
}

/**
 * 确保目录存在
 */
async function ensureDirectory(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    throw new Error(`Failed to create directory ${dirPath}: ${error}`);
  }
}

/**
 * gen_prd 工具主函数
 */
export async function genPrd(input: GenPrdInput): Promise<GenPrdOutput> {
  try {
    // 1. 验证输入参数
    if (!input.description || input.description.trim() === "") {
      return {
        success: false,
        message: "缺少必需参数：description",
        data: {
          prd_path: "",
          sections: [],
        },
      };
    }

    // 2. 设置默认值
    const productName = input.product_name || "新产品";
    const docsDir = input.docs_dir || "docs";
    const prdDir = path.join(docsDir, "prd");

    // 3. 确保输出目录存在
    await ensureDirectory(prdDir);

    // 4. 生成 PRD 文档内容
    const prdContent = generatePrdTemplate(productName, input.description);

    // 5. 保存文档到文件
    const prdPath = path.join(prdDir, "product-requirements.md");
    await fs.writeFile(prdPath, prdContent, "utf-8");

    // 6. 返回成功响应
    const sections = [
      "1. 产品概述",
      "2. 功能需求",
      "3. 功能优先级",
      "4. 非功能性需求",
      "5. 页面清单",
    ];

    return {
      success: true,
      message: `✅ PRD 文档已生成：${prdPath}\n\n包含以下章节：\n${sections.map(s => `- ${s}`).join('\n')}\n\n**下一步建议：**\n1. 请 AI 根据产品描述完善 PRD 内容（填充标记为"请 AI..."的部分）\n2. 使用 gen_prototype 工具生成原型设计文档\n3. 使用 start_product 工具执行完整的产品设计工作流`,
      data: {
        prd_path: prdPath,
        sections,
      },
    };

  } catch (error) {
    return {
      success: false,
      message: `生成 PRD 文档失败：${error}`,
      data: {
        prd_path: "",
        sections: [],
      },
    };
  }
}
