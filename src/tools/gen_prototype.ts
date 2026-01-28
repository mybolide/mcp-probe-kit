import { promises as fs } from "fs";
import path from "path";

/**
 * gen_prototype - 生成原型设计文档
 * 
 * 基于 PRD 文档或功能描述生成原型设计文档
 */

interface GenPrototypeInput {
  prd_path?: string;          // PRD 文档路径（可选）
  description?: string;       // 功能描述（如果没有 PRD）
  docs_dir?: string;          // 输出目录（默认 docs）
}

interface GenPrototypeOutput {
  success: boolean;
  message: string;
  data: {
    index_path: string;       // 索引文件路径
    page_paths: string[];     // 所有页面文档路径
    page_count: number;       // 页面数量
  };
}

interface PageInfo {
  name: string;
  path: string;
  type: string;
  description: string;
}

/**
 * 从 PRD 文档中提取页面清单
 */
async function extractPagesFromPrd(prdPath: string): Promise<PageInfo[]> {
  try {
    const prdContent = await fs.readFile(prdPath, "utf-8");
    
    // 简单的页面提取逻辑（从表格中提取）
    const pages: PageInfo[] = [];
    const lines = prdContent.split('\n');
    let inPageTable = false;
    
    for (const line of lines) {
      if (line.includes('## 5. 页面清单')) {
        inPageTable = true;
        continue;
      }
      
      if (inPageTable && line.startsWith('|') && !line.includes('页面名称')) {
        const parts = line.split('|').map(p => p.trim()).filter(p => p);
        if (parts.length >= 4) {
          pages.push({
            name: parts[0],
            path: parts[1],
            type: parts[2],
            description: parts[3],
          });
        }
      }
      
      if (inPageTable && line.startsWith('##') && !line.includes('页面清单')) {
        break;
      }
    }
    
    return pages;
  } catch (error) {
    throw new Error(`Failed to read PRD file: ${error}`);
  }
}

/**
 * 生成默认页面清单（当没有 PRD 时）
 */
function generateDefaultPages(description: string): PageInfo[] {
  return [
    {
      name: "首页",
      path: "/",
      type: "主页面",
      description: "产品介绍和导航入口",
    },
    {
      name: "功能页",
      path: "/feature",
      type: "功能页面",
      description: "核心功能展示",
    },
  ];
}

/**
 * 生成单个页面的原型文档
 */
function generatePagePrototype(page: PageInfo): string {
  const fileName = page.name.replace(/\s+/g, '-').toLowerCase();
  
  return `# 页面原型 - ${page.name}

> 生成时间：${new Date().toLocaleString('zh-CN')}
> 工具版本：mcp-probe-kit v2.3.0

## 页面信息

- **页面名称**: ${page.name}
- **页面路径**: ${page.path}
- **页面类型**: ${page.type}
- **页面说明**: ${page.description}

---

## 页面结构

### Header（页头）

**请 AI 设计页头区域：**
- Logo
- 导航菜单
- 用户信息/登录按钮

### Main Content（主内容区）

**请 AI 根据页面功能设计主内容区：**

#### Section 1
- 元素 1
- 元素 2
- 元素 3

#### Section 2
- 元素 1
- 元素 2

### Footer（页脚）

**请 AI 设计页脚区域：**
- 版权信息
- 联系方式
- 相关链接

---

## 交互说明

**请 AI 描述页面的交互行为：**

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

**请 AI 列出页面所需的所有 UI 元素：**

- [ ] 元素 1：[描述]
- [ ] 元素 2：[描述]
- [ ] 元素 3：[描述]
- [ ] 元素 4：[描述]

---

## 设计建议

**请 AI 提供设计建议：**

- **布局建议**: [响应式布局、栅格系统等]
- **视觉建议**: [颜色、字体、间距等]
- **交互建议**: [动画、反馈、加载状态等]

---

**注意：** 本文档由 AI 辅助生成，请根据实际情况调整和完善内容。标记为"请 AI..."的部分需要 AI 根据页面功能进行智能填充。
`;
}

/**
 * 生成原型索引文档
 */
function generatePrototypeIndex(pages: PageInfo[], pagePaths: string[]): string {
  const pageList = pages.map((page, index) => {
    const fileName = path.basename(pagePaths[index]);
    return `- [${page.name}](${fileName}) - ${page.description}`;
  }).join('\n');
  
  const navigationFlow = pages.map((page, index) => {
    if (index === pages.length - 1) return '';
    const nextPage = pages[index + 1];
    return `- ${page.name} → ${nextPage.name}`;
  }).filter(f => f).join('\n');
  
  return `# 原型设计索引

> 生成时间：${new Date().toLocaleString('zh-CN')}
> 工具版本：mcp-probe-kit v2.3.0

## 概述

本文档是原型设计的索引文件，列出了所有页面的原型文档。

## 页面清单

共 ${pages.length} 个页面：

${pageList}

---

## 页面导航流程

**请 AI 根据页面功能设计导航流程：**

${navigationFlow || '- 首页 → 功能页 → 详情页'}

---

## 使用说明

1. 点击上方的页面链接查看对应的原型文档
2. 每个原型文档包含页面结构、交互说明、元素清单
3. 标记为"请 AI..."的部分需要 AI 根据功能进行智能填充
4. 完成原型设计后，可以使用 \`start_ui\` 工具生成 HTML 原型

---

## 下一步

- [ ] 完善每个页面的原型文档
- [ ] 使用 \`ui_design_system\` 工具生成设计系统
- [ ] 使用 \`start_ui\` 工具生成 HTML 可交互原型
- [ ] 与团队评审原型设计

---

**注意：** 本文档由 AI 辅助生成，请根据实际情况调整和完善内容。
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
 * gen_prototype 工具主函数
 */
export async function genPrototype(input: GenPrototypeInput): Promise<GenPrototypeOutput> {
  try {
    // 1. 验证输入参数
    if (!input.prd_path && !input.description) {
      return {
        success: false,
        message: "缺少必需参数：prd_path 或 description 至少提供一个",
        data: {
          index_path: "",
          page_paths: [],
          page_count: 0,
        },
      };
    }

    // 2. 设置默认值
    const docsDir = input.docs_dir || "docs";
    const prototypeDir = path.join(docsDir, "prototype");

    // 3. 确保输出目录存在
    await ensureDirectory(prototypeDir);

    // 4. 获取页面清单
    let pages: PageInfo[];
    if (input.prd_path) {
      pages = await extractPagesFromPrd(input.prd_path);
      if (pages.length === 0) {
        pages = generateDefaultPages(input.description || "");
      }
    } else {
      pages = generateDefaultPages(input.description!);
    }

    // 5. 生成每个页面的原型文档
    const pagePaths: string[] = [];
    for (const page of pages) {
      const fileName = `page-${page.name.replace(/\s+/g, '-').toLowerCase()}.md`;
      const filePath = path.join(prototypeDir, fileName);
      const content = generatePagePrototype(page);
      await fs.writeFile(filePath, content, "utf-8");
      pagePaths.push(filePath);
    }

    // 6. 生成索引文件
    const indexPath = path.join(prototypeDir, "prototype-index.md");
    const indexContent = generatePrototypeIndex(pages, pagePaths);
    await fs.writeFile(indexPath, indexContent, "utf-8");

    // 7. 返回成功响应
    return {
      success: true,
      message: `✅ 原型设计文档已生成！\n\n📁 索引文件：${indexPath}\n📄 页面数量：${pages.length} 个\n\n生成的页面：\n${pages.map((p, i) => `${i + 1}. ${p.name} (${pagePaths[i]})`).join('\n')}\n\n**下一步建议：**\n1. 请 AI 完善每个页面的原型文档（填充标记为"请 AI..."的部分）\n2. 使用 ui_design_system 工具生成设计系统\n3. 使用 start_ui 工具生成 HTML 可交互原型`,
      data: {
        index_path: indexPath,
        page_paths: pagePaths,
        page_count: pages.length,
      },
    };

  } catch (error) {
    return {
      success: false,
      message: `生成原型文档失败：${error}`,
      data: {
        index_path: "",
        page_paths: [],
        page_count: 0,
      },
    };
  }
}
