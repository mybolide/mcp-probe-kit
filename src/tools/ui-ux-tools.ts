/**
 * UI/UX Pro Max 工具集（重构版）
 * 
 * 提供智能设计系统生成、UI/UX 数据搜索和数据同步功能
 * 使用模板类实现文档生成的原子化
 */

import { UIDataLoader } from '../utils/ui-data-loader.js';
import { DesignReasoningEngine, DesignRequest, DesignSystemRecommendation } from '../utils/design-reasoning-engine.js';
import { ASCIIBoxFormatter } from '../utils/ascii-box-formatter.js';
import { UISearchOptions } from '../utils/ui-search-engine.js';
import { syncUIDataToCache } from '../utils/ui-sync.js';
import { formatDesignSystemJson } from '../utils/design-system-json-formatter.js';

/**
 * 文件索引接口
 * 定义需要创建的文件及其元数据
 */
export interface FileIndex {
  path: string;          // 文件路径（如 "docs/design-system.json"）
  purpose: string;       // 文件用途说明
  order: number;         // 创建顺序（1, 2, 3...）
  required: boolean;     // 是否必需
}

/**
 * 创作指导接口
 * 为 AI 提供文档创作的主题和提示，而非具体内容
 */
export interface CreationGuidance {
  principles: string[];      // 设计原则文档应包含的主题
  interaction: string[];     // 交互规范文档应包含的主题
  layout: string[];          // 布局规范文档应包含的主题
  config: string[];          // 技术配置文档应包含的主题
  tips: string[];            // 创作提示
}

/**
 * UI 设计系统输出接口（重构版）
 * 返回核心数据和创作指导，而非预生成的文档内容
 */
export interface UIDesignSystemOutput {
  asciiBox: string;                           // ASCII Box 格式的核心推荐
  designSystemJson: object;                   // 机器可读的精确配置
  fileIndex: FileIndex[];                     // 要创建的文件索引（按顺序）
  creationGuidance: CreationGuidance;         // 创作指导
  recommendation: DesignSystemRecommendation; // 原始推荐数据
}

// 全局数据加载器实例
let dataLoader: UIDataLoader | null = null;
let reasoningEngine: DesignReasoningEngine | null = null;

/**
 * 生成文件索引
 * 定义需要创建的文件列表及其创建顺序
 * 
 * @returns FileIndex[] - 按创建顺序排列的文件索引数组
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */
export function generateFileIndex(): FileIndex[] {
  return [
    {
      path: 'docs/design-system.json',
      purpose: '机器可读的设计系统配置文件，包含颜色、字体、间距等精确数值',
      order: 1,
      required: true,
    },
    {
      path: 'docs/design-guidelines/README.md',
      purpose: '设计指南目录文件，提供所有设计文档的索引和导航',
      order: 2,
      required: true,
    },
    {
      path: 'docs/design-guidelines/01-principles.md',
      purpose: '设计原则文档，定义核心设计价值观和指导原则',
      order: 3,
      required: true,
    },
    {
      path: 'docs/design-guidelines/02-interaction.md',
      purpose: '交互规范文档，定义用户交互模式和反馈机制',
      order: 4,
      required: true,
    },
    {
      path: 'docs/design-guidelines/03-layout.md',
      purpose: '布局规范文档，定义栅格系统和页面布局模式',
      order: 5,
      required: true,
    },
    {
      path: 'docs/design-guidelines/04-config.md',
      purpose: '技术配置文档，提供具体技术栈的配置代码示例',
      order: 6,
      required: true,
    },
    {
      path: 'docs/design-system.md',
      purpose: '设计系统主文档，包含 ASCII Box 推荐和完整的设计系统概览',
      order: 7,
      required: true,
    },
  ];
}

/**
 * 生成创作指导
 * 为 AI 提供文档创作的主题和提示，而非具体内容
 * 
 * @param productType - 产品类型（如 "SaaS", "E-commerce"）
 * @param stack - 技术栈（如 "react", "vue", "nextjs"）
 * @returns CreationGuidance - 包含各类文档的主题列表和创作提示
 * 
 * Requirements: 4.2, 4.3, 4.4, 4.5, 5.3, 5.4
 */
export function generateCreationGuidance(
  productType: string,
  stack?: string
): CreationGuidance {
  // 设计原则文档的主题列表
  const principles = [
    '核心设计原则（一致性、反馈、效率、容错性）',
    '设计价值观和理念',
    '用户体验目标',
    '可访问性原则',
    '设计决策指导',
    '品牌一致性要求',
  ];

  // 交互规范文档的主题列表
  const interaction = [
    '按钮和链接的交互状态（hover、active、disabled）',
    '表单交互模式（输入、验证、错误提示）',
    '反馈机制（成功、错误、警告、信息提示）',
    '加载状态和骨架屏',
    '动效和过渡效果规范',
    '手势和触摸交互（移动端）',
    '键盘导航和快捷键',
  ];

  // 布局规范文档的主题列表
  const layout = [
    '栅格系统（列数、间距、断点）',
    '页面布局模式（单栏、双栏、三栏）',
    '组件布局和对齐规则',
    '响应式设计策略',
    '间距系统（margin、padding）',
    '容器和包装器规范',
    'Z-index 层级管理',
  ];

  // 技术配置文档的主题列表
  const config = [
    '设计 Token 配置（颜色、字体、间距）',
    '主题配置代码示例',
    'CSS Variables 定义',
    '组件样式实现指南',
    '工具类和辅助函数',
    '构建和打包配置',
  ];

  // 根据技术栈调整配置主题
  if (stack) {
    const stackLower = stack.toLowerCase();

    if (stackLower.includes('tailwind')) {
      config.push('Tailwind CSS 配置文件示例');
      config.push('自定义 Tailwind 插件');
    }

    if (stackLower.includes('react') || stackLower.includes('next')) {
      config.push('React 组件样式方案（CSS Modules / Styled Components）');
      config.push('Theme Provider 配置');
    }

    if (stackLower.includes('vue') || stackLower.includes('nuxt')) {
      config.push('Vue 组件样式方案（Scoped CSS / CSS Modules）');
      config.push('Vue 插件配置');
    }

    if (stackLower.includes('svelte')) {
      config.push('Svelte 组件样式方案');
      config.push('Svelte 预处理器配置');
    }

    if (stackLower.includes('astro')) {
      config.push('Astro 组件样式方案');
      config.push('Astro 集成配置');
    }
  }

  // 生成创作提示
  const tips = [
    `根据产品类型 "${productType}" 调整文档重点和示例`,
    '使用 design-system.json 中的精确数值（颜色、字体大小、间距等）',
    '参考 ASCII Box 推荐中的核心建议',
    '根据反模式（antiPatterns）提供"应避免"的建议',
    '提供具体的代码示例，而非抽象描述',
    '确保所有文档之间保持一致性',
    '使用清晰的标题层级和结构',
  ];

  // 根据技术栈添加特定提示
  if (stack) {
    tips.push(`在技术配置文档中提供 ${stack} 的具体实现示例`);
    tips.push(`确保代码示例符合 ${stack} 的最佳实践`);
  }

  // 根据产品类型添加特定提示
  const productTypeLower = productType.toLowerCase();
  if (productTypeLower.includes('saas') || productTypeLower.includes('b2b')) {
    tips.push('强调专业性、效率和数据密集型界面的设计');
  } else if (productTypeLower.includes('ecommerce') || productTypeLower.includes('e-commerce')) {
    tips.push('强调产品展示、购物流程和转化率优化');
  } else if (productTypeLower.includes('healthcare') || productTypeLower.includes('medical')) {
    tips.push('强调可访问性、清晰度和信任感');
  } else if (productTypeLower.includes('fintech') || productTypeLower.includes('finance')) {
    tips.push('强调安全性、可信度和数据可视化');
  }

  return {
    principles,
    interaction,
    layout,
    config,
    tips,
  };
}

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
export async function getReasoningEngine(): Promise<DesignReasoningEngine> {
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
 * UI 设计系统生成工具（重构版 - AI 驱动的文档生成）
 * 
 * 不再使用硬编码模板，而是返回核心数据和创作指导，
 * 让 AI 根据推荐自由创建文档内容
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.5, 6.1-6.6
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

    // 格式化输出（保留 ASCII Box 和 JSON 格式化）
    const formatter = new ASCIIBoxFormatter();
    const asciiBox = formatter.format(recommendation);

    // 生成 JSON 格式
    const designSystemJson = formatDesignSystemJson(
      recommendation,
      request.productType,
      request.stack
    );

    // 生成文件索引（按创建顺序）
    const fileIndex = generateFileIndex();

    // 生成创作指导
    const creationGuidance = generateCreationGuidance(
      request.productType,
      request.stack
    );

    // 构建输出对象
    const output: UIDesignSystemOutput = {
      asciiBox,
      designSystemJson,
      fileIndex,
      creationGuidance,
      recommendation,
    };

    // 格式化文件索引列表
    const fileIndexList = fileIndex
      .map(file => `${file.order}. **${file.path}** ${file.required ? '(必需)' : '(可选)'}\n   ${file.purpose}`)
      .join('\n\n');

    // 格式化创作指导
    const guidanceText = `
### 设计原则文档主题
${creationGuidance.principles.map((topic, i) => `${i + 1}. ${topic}`).join('\n')}

### 交互规范文档主题
${creationGuidance.interaction.map((topic, i) => `${i + 1}. ${topic}`).join('\n')}

### 布局规范文档主题
${creationGuidance.layout.map((topic, i) => `${i + 1}. ${topic}`).join('\n')}

### 技术配置文档主题
${creationGuidance.config.map((topic, i) => `${i + 1}. ${topic}`).join('\n')}

### 创作提示
${creationGuidance.tips.map((tip, i) => `${i + 1}. ${tip}`).join('\n')}
`;

    // 返回新的输出格式（Requirements: 2.1, 2.5, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6）
    return {
      content: [
        {
          type: "text",
          text: `# ✅ 设计系统推荐已生成

**产品类型**: ${request.productType}
**技术栈**: ${request.stack || 'html'}
${request.targetAudience ? `**目标用户**: ${request.targetAudience}` : ''}

---

## 🎨 1. 核心设计推荐（ASCII Box）

以下是基于 AI 推理引擎生成的核心设计推荐：

\`\`\`
${asciiBox}
\`\`\`

---

## 📊 2. 精确配置数据（JSON）

以下是机器可读的设计系统配置，包含所有精确数值：

\`\`\`json
${JSON.stringify(designSystemJson, null, 2)}
\`\`\`

---

## 📁 3. 文件索引（按创建顺序）

请严格按照以下顺序创建文件：

${fileIndexList}

**注意**: design-system.md 是最后创建的主文档，它应该包含完整的设计系统概览和 ASCII Box 推荐。

---

## 📝 4. 文档创作指导

以下是各类文档应包含的关键主题。**请根据上述 ASCII Box 推荐和 JSON 数据自由创作内容，不要使用固定模板**：

${guidanceText}

---

## ✨ 请根据以上推荐和指导创建文档

**现在，请按照文件索引的顺序，逐个创建设计系统文档。**

### 创作要求：

1. **使用核心数据**：
   - 将 ASCII Box 中的核心推荐作为设计依据
   - 使用 JSON 数据中的精确数值（颜色代码、字体大小、间距值等）
   - 确保所有数值与 JSON 配置保持一致

2. **遵循文件顺序**：
   - 严格按照文件索引的顺序创建（1→2→3→4→5→6→7）
   - design-system.json 最先创建（包含所有精确配置）
   - design-system.md 最后创建（包含完整概览）

3. **自由创作内容**：
   - 参考创作指导中的主题列表
   - 根据产品类型 "${request.productType}" 调整重点
   ${request.stack ? `- 提供 ${request.stack} 的具体实现示例` : ''}
   - 不要局限于固定模板，发挥创造力

4. **保持一致性**：
   - 所有文档使用相同的设计 Token（颜色、字体、间距）
   - 确保术语和命名规范统一
   - 交叉引用其他文档时保持准确

5. **提供实用示例**：
   - 包含具体的代码示例（不要抽象描述）
   - 展示实际应用场景
   - 参考反模式（antiPatterns）提供"应避免"的建议

### 开始创作：

**第一步**：创建 \`docs/design-system.json\`，包含所有精确配置数据（使用上面的 JSON）

**第二步**：创建 \`docs/design-guidelines/README.md\`，提供设计指南的索引和导航

**第三步至第六步**：依次创建四个设计指南文档（principles、interaction、layout、config）

**最后一步**：创建 \`docs/design-system.md\`，包含以下内容：
   - ASCII Box 推荐（核心设计）
   - 完整的设计系统概览
   - **文件索引**（列出所有设计文档的链接，方便后续查看和使用）
   - 快速开始指南

---

🚀 **准备好了吗？让我们开始创建第一个文件吧！**
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


