/**
 * UI/UX Pro Max 工具集（重构版）
 * 
 * 提供智能设计系统生成、UI/UX 数据搜索和数据同步功能
 * 使用模板类实现文档生成的原子化
 */

import { UIDataLoader } from '../utils/ui-data-loader.js';
import { DesignReasoningEngine, DesignRequest } from '../utils/design-reasoning-engine.js';
import { ASCIIBoxFormatter } from '../utils/ascii-box-formatter.js';
import { UISearchOptions } from '../utils/ui-search-engine.js';
import { syncUIDataToCache } from '../utils/ui-sync.js';
import { formatDesignSystemJson } from '../utils/design-system-json-formatter.js';
import { DesignSystemTemplates } from '../prompts/design-system-templates.js';

// 全局数据加载器实例
let dataLoader: UIDataLoader | null = null;
let reasoningEngine: DesignReasoningEngine | null = null;

/**
 * 获取数据加载器实例
 */
async function getDataLoader(): Promise<UIDataLoader> {
  if (!dataLoader) {
    dataLoader = new UIDataLoader({
      useCache: true,
      autoUpdate: true,
    });
    await dataLoader.load();
  }
  return dataLoader;
}

/**
 * 获取推理引擎实例
 */
async function getReasoningEngine(): Promise<DesignReasoningEngine> {
  if (!reasoningEngine) {
    const loader = await getDataLoader();
    const searchEngine = loader.getSearchEngine();
    
    reasoningEngine = new DesignReasoningEngine();
    
    // 加载所有数据（包括推理规则）
    const products = searchEngine.getCategoryData('products') || [];
    const styles = searchEngine.getCategoryData('styles') || [];
    const colors = searchEngine.getCategoryData('colors') || [];
    const typography = searchEngine.getCategoryData('typography') || [];
    const landing = searchEngine.getCategoryData('landing') || [];
    const uxGuidelines = searchEngine.getCategoryData('ux-guidelines') || [];
    const reasoning = (searchEngine.getCategoryData('ui-reasoning') || []) as any[];
    
    reasoningEngine.loadData({
      products,
      styles,
      colors,
      typography,
      landing,
      uxGuidelines,
      reasoning: reasoning as any,
    });
  }
  return reasoningEngine;
}

/**
 * UI 设计系统生成工具（重构版 - 只返回模板内容，不写文件）
 */
export async function uiDesignSystem(args: any) {
  try {
    // 构建设计请求
    const request: DesignRequest = {
      productType: args.product_type || args.description || 'SaaS',
      description: args.description,
      stack: args.stack,
      targetAudience: args.target_audience,
      keywords: args.keywords ? args.keywords.split(',').map((k: string) => k.trim()) : undefined,
    };
    
    // 获取推理引擎
    const engine = await getReasoningEngine();
    
    // 生成设计系统推荐
    const recommendation = engine.generateRecommendation(request);
    
    // 格式化输出
    const formatter = new ASCIIBoxFormatter();
    const asciiBox = formatter.format(recommendation);  // ASCII Box 格式（核心）
    
    // 生成 JSON 格式
    const designSystemJson = formatDesignSystemJson(
      recommendation,
      request.productType,
      request.stack
    );
    
    // 准备模板参数
    const templateParams = {
      productType: request.productType,
      stack: request.stack,
      targetAudience: request.targetAudience,
      recommendation,
      designSystemJson,
      asciiBox,
    };
    
    // 使用模板类生成所有文档内容（但不写文件）
    const indexMd = DesignSystemTemplates.generateIndexMd(templateParams);
    const principlesDoc = DesignSystemTemplates.generatePrinciplesMd(templateParams);
    const interactionDoc = DesignSystemTemplates.generateInteractionMd(templateParams);
    const layoutDoc = DesignSystemTemplates.generateLayoutMd(templateParams);
    const configDoc = DesignSystemTemplates.generateConfigMd(templateParams);
    const readmeDoc = DesignSystemTemplates.generateReadmeMd(templateParams);
    
    // 返回所有模板内容，让 AI 决定如何处理
    return {
      content: [
        {
          type: "text",
          text: `✅ 设计系统推荐已生成

**产品类型**: ${request.productType}
**技术栈**: ${request.stack || 'html'}

---

## 🎨 AI 设计推荐

\`\`\`
${asciiBox}
\`\`\`

---

## 📝 请创建以下文件

## � 请创建以下文件

**重要**: 以下是 AI 推荐的设计系统文档内容，请将这些内容写入到对应的文件中。

### 文件结构

\`\`\`
docs/
├── design-system.md          # 主文档（包含上述 ASCII Box 推荐）
├── design-system.json        # JSON 配置（供程序读取）
└── design-guidelines/        # 详细设计指南
    ├── README.md             # 文档索引
    ├── 01-principles.md      # 设计原则
    ├── 02-interaction.md     # 交互规范
    ├── 03-layout.md          # 布局规范
    └── 04-config.md          # 技术配置
\`\`\`

---

### 📄 请创建文件: docs/design-system.md

\`\`\`markdown
${indexMd}
\`\`\`

---

### 📄 请创建文件: docs/design-system.json

\`\`\`json
${JSON.stringify(designSystemJson, null, 2)}
\`\`\`

---

### 📄 请创建文件: docs/design-guidelines/README.md

\`\`\`markdown
${readmeDoc}
\`\`\`

---

### 📄 请创建文件: docs/design-guidelines/01-principles.md

\`\`\`markdown
${principlesDoc}
\`\`\`

---

### 📄 请创建文件: docs/design-guidelines/02-interaction.md

\`\`\`markdown
${interactionDoc}
\`\`\`

---

### 📄 请创建文件: docs/design-guidelines/03-layout.md

\`\`\`markdown
${layoutDoc}
\`\`\`

---

### 📄 请创建文件: docs/design-guidelines/04-config.md

\`\`\`markdown
${configDoc}
\`\`\`

---

## ✅ 完成后

文件创建完成后，即可使用 \`start_ui "页面名称"\` 生成 UI 组件，所有组件将自动应用上述设计系统规范。
`,
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `❌ 设计系统生成失败: ${errorMessage}

**可能的原因**:
1. 数据未加载完成
2. 产品类型不明确
3. 数据格式错误

**建议**:
1. 提供更具体的产品类型（如 "SaaS", "E-commerce", "Healthcare"）
2. 添加产品描述帮助推理引擎理解需求
3. 检查数据是否已同步（使用 \`sync_ui_data\` 工具）
`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * UI 搜索工具（增强版）
 */
export async function uiSearch(args: any) {
  try {
    const mode = args.mode || 'search';
    const query = args.query || '';
    
    // 模式 1: catalog - 返回组件目录
    if (mode === 'catalog') {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const catalogPath = path.join(process.cwd(), 'docs', 'ui', 'component-catalog.json');
      
      try {
        const catalogContent = await fs.readFile(catalogPath, 'utf-8');
        const catalog = JSON.parse(catalogContent);
        
        // 格式化组件列表
        const components = catalog.components || [];
        const componentList = components.map((comp: any, index: number) => {
          return `### ${index + 1}. ${comp.name}

**描述**: ${comp.description || '无'}
**Props**: ${Object.keys(comp.props || {}).join(', ')}
**样式**: ${comp.styles ? Object.keys(comp.styles).join(', ') : '无'}
`;
        }).join('\n---\n\n');
        
        return {
          content: [
            {
              type: "text",
              text: `# 📦 组件目录

共 ${components.length} 个可用组件

---

${componentList}

**提示**: 这些组件可以在 UI 模板中使用
`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `❌ 未找到组件目录文件

请先运行 \`init_component_catalog\` 生成组件目录。
`,
            },
          ],
          isError: true,
        };
      }
    }
    
    // 模式 2: template - 搜索 UI 模板
    if (mode === 'template') {
      const fs = await import('fs/promises');
      const path = await import('path');
      
      const templatesDir = path.join(process.cwd(), 'docs', 'ui', 'pages');
      
      try {
        // 检查模板目录是否存在
        await fs.access(templatesDir);
        
        // 读取所有模板文件
        const files = await fs.readdir(templatesDir);
        const jsonFiles = files.filter(f => f.endsWith('.json'));
        
        if (jsonFiles.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `📭 暂无可用模板

**建议**:
1. 使用 \`start_ui\` 生成新模板
2. 模板会自动保存到 \`docs/ui/pages/\` 目录
3. 下次可以直接搜索使用

**示例**:
\`\`\`
start_ui "登录页面"
start_ui "用户列表"
\`\`\`
`,
              },
            ],
          };
        }
        
        // 读取所有模板内容
        const templates = await Promise.all(
          jsonFiles.map(async (file) => {
            const filePath = path.join(templatesDir, file);
            const content = await fs.readFile(filePath, 'utf-8');
            const template = JSON.parse(content);
            return {
              file,
              name: template.name || file.replace('.json', ''),
              description: template.description || '无描述',
              template,
            };
          })
        );
        
        // 如果有查询，进行简单的文本匹配
        let filteredTemplates = templates;
        if (query) {
          const lowerQuery = query.toLowerCase();
          filteredTemplates = templates.filter(t => 
            t.name.toLowerCase().includes(lowerQuery) ||
            t.description.toLowerCase().includes(lowerQuery)
          );
        }
        
        if (filteredTemplates.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `未找到匹配的模板

**查询**: ${query}
**可用模板**: ${templates.map(t => t.name).join(', ')}

**建议**: 使用 \`start_ui "${query}"\` 生成新模板
`,
              },
            ],
          };
        }
        
        // 格式化模板列表
        const templateList = filteredTemplates.map((t, index) => {
          return `### ${index + 1}. ${t.name}

**文件**: \`docs/ui/pages/${t.file}\`
**描述**: ${t.description}
**组件数**: ${JSON.stringify(t.template).match(/"type":/g)?.length || 0}

\`\`\`json
${JSON.stringify(t.template, null, 2)}
\`\`\`
`;
        }).join('\n---\n\n');
        
        return {
          content: [
            {
              type: "text",
              text: `# 📄 UI 模板搜索结果

找到 ${filteredTemplates.length} 个匹配模板

---

${templateList}

**使用方法**:
\`\`\`
render_ui docs/ui/pages/<文件名>.json --framework=react
\`\`\`
`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `📭 暂无可用模板

模板目录不存在或为空。

**建议**:
使用 \`start_ui\` 生成第一个模板：

\`\`\`
start_ui "登录页面"
start_ui "用户列表"
start_ui "设置页面"
\`\`\`

模板会自动保存到 \`docs/ui/pages/\` 目录。
`,
            },
          ],
        };
      }
    }
    
    // 模式 3: search - 默认搜索模式（原有功能）
    const loader = await getDataLoader();
    const searchEngine = loader.getSearchEngine();
    
    const options: UISearchOptions = {
      category: args.category,
      stack: args.stack,
      limit: args.limit || 10,
      minScore: args.min_score || 0,
    };
    
    const results = searchEngine.search(query, options);
    
    if (results.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `未找到匹配的 UI/UX 数据。

**搜索条件:**
- 查询: ${query}
- 类别: ${options.category || '全部'}
- 技术栈: ${options.stack || '全部'}

**建议:**
1. 尝试使用更通用的关键词
2. 检查拼写是否正确
3. 移除类别或技术栈限制
`,
          },
        ],
      };
    }
    
    // 格式化结果
    const formattedResults = results.map((result, index) => {
      const data = result.data;
      const fields = Object.entries(data)
        .filter(([_key, value]) => value != null && value !== '')
        .map(([key, value]) => {
          if (typeof value === 'object') {
            return `- **${key}**: \`${JSON.stringify(value)}\``;
          }
          return `- **${key}**: ${value}`;
        })
        .join('\n');
      
      return `### ${index + 1}. ${result.category} (相关度: ${result.score.toFixed(2)})

${fields}
`;
    }).join('\n---\n\n');
    
    return {
      content: [
        {
          type: "text",
          text: `# UI/UX 搜索结果

找到 ${results.length} 条匹配结果

**搜索条件:**
- 查询: ${query}
- 类别: ${options.category || '全部'}
- 技术栈: ${options.stack || '全部'}

---

${formattedResults}
`,
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `❌ UI 搜索失败: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * UI 数据同步工具
 */
export async function syncUiData(args: any) {
  try {
    const force = args.force || false;
    const verbose = args.verbose || false;
    
    // 检查是否需要更新
    if (!force) {
      const loader = await getDataLoader();
      const cacheManager = loader.getCacheManager();
      
      try {
        const updateInfo = await cacheManager.checkUpdate();
        
        if (!updateInfo.hasUpdate) {
          return {
            content: [
              {
                type: "text",
                text: `✅ UI/UX 数据已是最新版本

**当前版本:** ${updateInfo.currentVersion}
**最新版本:** ${updateInfo.latestVersion}

无需更新。如需强制同步，请使用 \`force: true\` 参数。
`,
              },
            ],
          };
        }
        
        console.log(`Update available: ${updateInfo.currentVersion || 'none'} -> ${updateInfo.latestVersion}`);
      } catch (error) {
        console.log('Failed to check update, proceeding with sync...');
      }
    }
    
    // 执行同步
    await syncUIDataToCache(force, verbose);
    
    // 重新加载数据
    if (dataLoader) {
      await dataLoader.reload();
    }
    
    const cacheDir = dataLoader?.getCacheManager().getCacheDir() || '';
    
    return {
      content: [
        {
          type: "text",
          text: `✅ UI/UX 数据同步成功

数据已更新到缓存目录: ${cacheDir}

**提示:** 数据已自动重新加载，可以立即使用最新数据。
`,
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `❌ UI 数据同步失败: ${errorMessage}

**可能的原因:**
1. 网络连接问题
2. npm registry 不可访问
3. 磁盘空间不足
4. 权限问题

**建议:**
1. 检查网络连接
2. 稍后重试
3. 使用 \`verbose: true\` 查看详细日志
`,
        },
      ],
      isError: true,
    };
  }
}


