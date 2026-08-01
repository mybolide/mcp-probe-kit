/**
 * UI/UX Pro Max 工具集（重构版）
 * 
 * 提供智能设计系统生成、UI/UX 数据搜索和数据同步功能
 * 使用模板类实现文档生成的原子化
 */

import { UIDataLoader } from '../utils/ui-data-loader.js';
import { UISearchOptions } from '../utils/ui-search-engine.js';
import { syncUIDataToCache, checkUISourcesUpdate } from '../utils/ui-sync.js';
import { formatShadcnResult, formatGuidelineResult, formatThemeResult, isGuidelineCategory, isShadcnCategory, isShadcnStack, isThemeCategory, pickThemeForProductType } from '../lib/shadcn-ui.js';
import { okStructured } from '../lib/response.js';
import type { DesignSystem, UISearchResult, SyncReport } from '../schemas/output/ui-ux-tools.js';
import { buildVisualDirectionContract, renderVisualDirectionBrief } from '../utils/visual-direction-engine.js';
import { searchUiStructures } from '../utils/ui-structure-search.js';
import {
  reportToolProgress,
  throwIfAborted,
  type ToolExecutionContext,
} from '../lib/tool-execution-context.js';

let dataLoader: UIDataLoader | null = null;

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
 * UI 视觉方向生成工具 v2。
 *
 * 返回一个协调的、可执行的视觉方向契约，而不是独立拼装风格、颜色、字体和动效。
 * 旧 colors/typography 字段由 v2 契约派生，仅用于兼容现有调用方。
 */
export async function uiDesignSystem(args: any) {
  try {
    const contract = buildVisualDirectionContract({
      productType: args.product_type || args.description || 'Product',
      description: args.description,
      stack: args.stack,
      targetAudience: args.target_audience,
      screenType: args.screen_type,
      visualDirection: args.visual_direction,
      density: args.density,
      brandPersonality: args.brand_personality || args.keywords,
      references: args.references,
      avoid: args.avoid,
      targetScore: args.target_score,
    });

    const message = renderVisualDirectionBrief(contract);
    const colorTokens = contract.visualLanguage.color.tokens;
    const typography = contract.visualLanguage.typography;

    const structuredData: DesignSystem = {
      ...contract,
      productType: contract.objective.productType,
      colors: {
        primary: {
          '500': colorTokens.accent,
          '600': colorTokens.accentStrong,
        },
        secondary: {
          canvas: colorTokens.canvas,
          surface: colorTokens.surface,
        },
        neutral: {
          text: colorTokens.text,
          mutedText: colorTokens.mutedText,
          line: colorTokens.line,
        },
        semantic: {
          success: colorTokens.success,
          warning: colorTokens.warning,
          danger: colorTokens.danger,
        },
      },
      typography: {
        fontFamilies: {
          strategy: typography.familyStrategy,
        },
        fontSizes: { ...typography.scale },
        fontWeights: { ...typography.weights },
        lineHeights: { ...typography.lineHeights },
      },
      spacing: {
        base: contract.visualLanguage.spacing.base,
        scale: contract.visualLanguage.spacing.scale,
        sectionGap: contract.visualLanguage.spacing.sectionGap,
      },
      breakpoints: {
        mobile: '390px',
        tablet: '768px',
        desktop: '1440px',
      },
      components: contract.componentRules.map((item) => ({
        name: item.component,
        rule: item.rule,
      })),
      documentation: message,
    };

    return okStructured(message, structuredData, {
      schema: (await import('../schemas/output/ui-ux-tools.js')).DesignSystemSchema,
      contractVersion: contract.contractVersion,
      note: '视觉方向是实现与截图评审的单一依据；旧 colors/typography 字段仅用于兼容现有调用方。',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const fallback = buildVisualDirectionContract({
      productType: args.product_type || 'Product',
      description: args.description || '生成可执行的产品界面视觉方向',
      targetAudience: args.target_audience,
      targetScore: args.target_score,
    });
    const message = `视觉方向生成失败：${errorMessage}\n\n已返回安全的 Operational Clarity 基线，请补充页面类型、核心任务和目标用户后重试。`;
    const tokens = fallback.visualLanguage.color.tokens;
    const errorData: DesignSystem = {
      ...fallback,
      summary: '视觉方向生成失败，已返回安全基线',
      productType: fallback.objective.productType,
      colors: {
        primary: { '500': tokens.accent, '600': tokens.accentStrong },
        secondary: { canvas: tokens.canvas, surface: tokens.surface },
        neutral: { text: tokens.text, mutedText: tokens.mutedText, line: tokens.line },
        semantic: { success: tokens.success, warning: tokens.warning, danger: tokens.danger },
      },
      typography: {
        fontFamilies: { strategy: fallback.visualLanguage.typography.familyStrategy },
        fontSizes: { ...fallback.visualLanguage.typography.scale },
        fontWeights: { ...fallback.visualLanguage.typography.weights },
        lineHeights: { ...fallback.visualLanguage.typography.lineHeights },
      },
      spacing: {
        base: fallback.visualLanguage.spacing.base,
        scale: fallback.visualLanguage.spacing.scale,
        sectionGap: fallback.visualLanguage.spacing.sectionGap,
      },
      breakpoints: { mobile: '390px', tablet: '768px', desktop: '1440px' },
      components: fallback.componentRules.map((item) => ({ name: item.component, rule: item.rule })),
      documentation: message,
    };

    return okStructured(message, errorData, {
      schema: (await import('../schemas/output/ui-ux-tools.js')).DesignSystemSchema,
      degraded: true,
    });
  }
}

/**
 * UI 搜索工具（增强版）
 */
export async function uiSearch(args: any) {
  try {
    const mode = args.mode || 'search';
    const query = args.query || '';

    if (mode === 'structure') {
      const matches = searchUiStructures({
        query,
        screenType: args.screen_type,
        density: args.density,
        limit: args.limit || 3,
      });

      const structuredData: UISearchResult = {
        summary: matches.length
          ? `找到 ${matches.length} 个页面结构候选`
          : '未找到页面结构候选',
        query,
        category: 'page-structure',
        results: matches.map(({ pattern, score, reasons }) => ({
          id: pattern.id,
          title: pattern.title,
          description: pattern.description,
          category: 'page-structure',
          score,
          preview: JSON.stringify({
            screenTypes: pattern.screenTypes,
            densities: pattern.densities,
            regions: pattern.regions,
            flow: pattern.flow,
            interaction: pattern.interaction,
            responsive: pattern.responsive,
            useWhen: pattern.useWhen,
            avoid: pattern.avoid,
            referenceMethods: pattern.referenceMethods,
            matchReasons: reasons,
          }, null, 2),
        })),
        totalResults: matches.length,
      };

      if (!matches.length) {
        return okStructured(
          `未找到匹配的页面结构。请补充 screen_type、核心任务或内容密度，不要改用风格标签搜索。`,
          structuredData,
          { schema: (await import('../schemas/output/ui-ux-tools.js')).UISearchResultSchema },
        );
      }

      const message = `# 页面结构候选

${matches.map(({ pattern, score, reasons }, index) => `## ${index + 1}. ${pattern.title} · ${score}/100

${pattern.description}

- **匹配原因**：${reasons.join('；') || '通用结构候选'}
- **区域**：${pattern.regions.map((item) => `${item.name}（${item.purpose}）`).join(' → ')}
- **任务流**：${pattern.flow.join(' → ')}
- **交互**：${pattern.interaction}
- **响应式**：${pattern.responsive.join('；')}
- **禁止**：${pattern.avoid.join('；')}
- **参考方法**：${pattern.referenceMethods.join('；')}`).join('\n\n---\n\n')}

选择一个结构作为 \`docs/ui/page-structure.json\` 的基础。只复用信息组织方法，不复制参考产品的品牌视觉。`;

      return okStructured(message, structuredData, {
        schema: (await import('../schemas/output/ui-ux-tools.js')).UISearchResultSchema,
        mode: 'structure',
      });
    }

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

        const message = `# 📦 组件目录

共 ${components.length} 个可用组件

---

${componentList}

**提示**: 这些组件可以在 UI 模板中使用
`;

        const structuredData: UISearchResult = {
          summary: `组件目录 - ${components.length} 个组件`,
          query: 'catalog',
          category: 'components',
          results: components.map((comp: any) => ({
            id: comp.name,
            title: comp.name,
            description: comp.description || '无描述',
            category: 'component',
          })),
          totalResults: components.length,
        };

        return okStructured(message, structuredData, {
          schema: (await import('../schemas/output/ui-ux-tools.js')).UISearchResultSchema,
        });
      } catch (error) {
        const errorData: UISearchResult = {
          summary: "未找到组件目录",
          query: 'catalog',
          results: [],
          totalResults: 0,
        };
        
        return okStructured(`❌ 未找到组件目录文件

请先由 Agent 根据设计系统与现有组件生成组件目录文件。
`, errorData, {
          schema: (await import('../schemas/output/ui-ux-tools.js')).UISearchResultSchema,
        });
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
          const emptyData: UISearchResult = {
            summary: "暂无可用模板",
            query: query || 'template',
            category: 'template',
            results: [],
            totalResults: 0,
          };
          
          return okStructured(`📭 暂无可用模板

**建议**:
1. 使用 \`start_ui\` 生成新模板
2. 模板会自动保存到 \`docs/ui/pages/\` 目录
3. 下次可以直接搜索使用

**示例**:
\`\`\`
start_ui "登录页面"
start_ui "用户列表"
\`\`\`
`, emptyData, {
            schema: (await import('../schemas/output/ui-ux-tools.js')).UISearchResultSchema,
          });
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
          const noMatchData: UISearchResult = {
            summary: "未找到匹配的模板",
            query: query,
            category: 'template',
            results: templates.map(t => ({
              id: t.file,
              title: t.name,
              description: t.description,
              category: 'template',
            })),
            totalResults: 0,
          };
          
          return okStructured(`未找到匹配的模板

**查询**: ${query}
**可用模板**: ${templates.map(t => t.name).join(', ')}

**建议**: 使用 \`start_ui "${query}"\` 生成新模板
`, noMatchData, {
            schema: (await import('../schemas/output/ui-ux-tools.js')).UISearchResultSchema,
          });
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

        const message = `# 📄 UI 模板搜索结果

找到 ${filteredTemplates.length} 个匹配模板

---

${templateList}

**使用方法**:
\`\`\`
由 Agent 根据页面模板和设计系统实施 React UI 代码并运行测试
\`\`\`
`;

        const structuredData: UISearchResult = {
          summary: `找到 ${filteredTemplates.length} 个模板`,
          query: query || 'template',
          category: 'template',
          results: filteredTemplates.map(t => ({
            id: t.file,
            title: t.name,
            description: t.description,
            category: 'template',
            preview: JSON.stringify(t.template, null, 2),
          })),
          totalResults: filteredTemplates.length,
        };

        return okStructured(message, structuredData, {
          schema: (await import('../schemas/output/ui-ux-tools.js')).UISearchResultSchema,
        });
      } catch (error) {
        const errorData: UISearchResult = {
          summary: "暂无可用模板",
          query: query || 'template',
          category: 'template',
          results: [],
          totalResults: 0,
        };
        
        return okStructured(`📭 暂无可用模板

模板目录不存在或为空。

**建议**:
使用 \`start_ui\` 生成第一个模板：

\`\`\`
start_ui "登录页面"
start_ui "用户列表"
start_ui "设置页面"
\`\`\`

模板会自动保存到 \`docs/ui/pages/\` 目录。
`, errorData, {
          schema: (await import('../schemas/output/ui-ux-tools.js')).UISearchResultSchema,
        });
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
      const noResultData: UISearchResult = {
        summary: "未找到匹配的 UI/UX 数据",
        query: query,
        category: options.category,
        results: [],
        totalResults: 0,
      };
      
      return okStructured(`未找到匹配的 UI/UX 数据。

**搜索条件:**
- 查询: ${query}
- 类别: ${options.category || '全部'}
- 技术栈: ${options.stack || '全部'}

**建议:**
1. 尝试使用更通用的关键词
2. 检查拼写是否正确
3. 移除类别或技术栈限制
`, noResultData, {
        schema: (await import('../schemas/output/ui-ux-tools.js')).UISearchResultSchema,
      });
    }

    // 格式化结果
    const formattedResults = results.map((result, index) => {
      const data = result.data;

      if (isShadcnCategory(result.category)) {
        return `### ${index + 1}. ${data.name || data.title} (相关度: ${result.score.toFixed(2)})

${formatShadcnResult(data)}
`;
      }

      if (isThemeCategory(result.category)) {
        return `### ${index + 1}. ${data.title || data.name} (相关度: ${result.score.toFixed(2)})

${formatThemeResult(data)}
`;
      }

      if (isGuidelineCategory(result.category)) {
        return `### ${index + 1}. ${data.level} (相关度: ${result.score.toFixed(2)})

${formatGuidelineResult(data)}
`;
      }

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

    const message = `# UI/UX 搜索结果

找到 ${results.length} 条匹配结果

**搜索条件:**
- 查询: ${query}
- 类别: ${options.category || '全部'}
- 技术栈: ${options.stack || '全部'}

---

${formattedResults}
`;

    const structuredData: UISearchResult = {
      summary: `找到 ${results.length} 条结果`,
      query: query,
      category: options.category,
      results: results.map(result => ({
        id: result.data.name || result.data.id || result.data.title || '',
        title: result.data.title || result.data.name || '',
        description: result.data.description || '',
        category: result.category,
        score: result.score,
        preview: isShadcnCategory(result.category)
          ? `${result.data.installCommand || ''}\n${JSON.stringify(result.data, null, 2)}`
          : isThemeCategory(result.category)
            ? String(result.data.globalsCssSnippet || JSON.stringify(result.data, null, 2))
            : isGuidelineCategory(result.category)
              ? `${result.data.level}: ${result.data.rule}`
              : JSON.stringify(result.data, null, 2),
      })),
      totalResults: results.length,
    };

    return okStructured(message, structuredData, {
      schema: (await import('../schemas/output/ui-ux-tools.js')).UISearchResultSchema,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    const errorData: UISearchResult = {
      summary: "UI 搜索失败",
      query: args.query || '',
      results: [],
      totalResults: 0,
    };
    
    return okStructured(`❌ UI 搜索失败: ${errorMessage}`, errorData, {
      schema: (await import('../schemas/output/ui-ux-tools.js')).UISearchResultSchema,
    });
  }
}

/**
 * UI 数据同步工具
 */
export async function syncUiData(args: any, context?: ToolExecutionContext) {
  try {
    throwIfAborted(context?.signal, 'sync_ui_data 已取消');
    await reportToolProgress(context, 5, 'sync_ui_data: 开始同步流程');

    const force = args.force || false;
    const verbose = args.verbose || false;
    const checkOnly = args.check_only === true || args.dry_run === true;

    if (checkOnly) {
      const loader = await getDataLoader();
      const metadata = loader.getCacheManager().getMetadata();
      const searchEngine = loader.getSearchEngine();
      const localStatus: SyncReport = {
        summary: "UI/UX 本地缓存状态检查完成",
        status: 'success',
        synced: {
          colors: (searchEngine.getCategoryData('colors') || []).length,
          icons: (searchEngine.getCategoryData('icons') || []).length,
          components: (searchEngine.getCategoryData('products') || []).length,
          patterns: (searchEngine.getCategoryData('landing') || []).length,
          shadcnBlocks: (searchEngine.getCategoryData('shadcn-blocks') || []).length,
          shadcnComponents: (searchEngine.getCategoryData('shadcn-components') || []).length,
          themes: (searchEngine.getCategoryData('ui-themes') || []).length,
          vercelGuidelines: (searchEngine.getCategoryData('ui-guidelines-vercel') || []).length,
        },
        version: metadata?.version,
        timestamp: new Date().toISOString(),
      };
      await reportToolProgress(context, 100, 'sync_ui_data: 本地状态检查完成');
      return okStructured(
        'UI/UX 本地缓存状态检查完成；check_only 未访问网络且未写入缓存。',
        localStatus,
        { schema: (await import('../schemas/output/ui-ux-tools.js')).SyncReportSchema },
      );
    }

    // 检查是否需要更新
    if (!force) {
      throwIfAborted(context?.signal, 'sync_ui_data 已取消');
      await reportToolProgress(context, 15, 'sync_ui_data: 检查上游版本');

      const loader = await getDataLoader();
      const cacheDir = loader.getCacheManager().getCacheDir();

      try {
        const updateInfo = await checkUISourcesUpdate(cacheDir, context?.signal);

        if (!updateInfo.hasUpdate) {
          await reportToolProgress(context, 100, 'sync_ui_data: 数据已是最新');

          const upToDateData: SyncReport = {
            summary: "UI/UX 数据已是最新版本",
            status: 'success',
            synced: {},
            version: updateInfo.uipro.current || updateInfo.uipro.latest,
            timestamp: new Date().toISOString(),
          };
          
          return okStructured(`✅ UI/UX 数据已是最新版本

**uipro-cli:** ${updateInfo.uipro.current || 'unknown'} (latest ${updateInfo.uipro.latest})
**shadcn registry:** ${updateInfo.shadcn.current || 'unknown'} (latest ${updateInfo.shadcn.latest})
**ui-themes:** ${updateInfo.themes.current || 'unknown'} (latest ${updateInfo.themes.latest})
**vercel guidelines:** ${updateInfo.vercel.current || 'unknown'} (latest ${updateInfo.vercel.latest})

无需更新。如需强制同步，请使用 \`force: true\` 参数。
`, upToDateData, {
            schema: (await import('../schemas/output/ui-ux-tools.js')).SyncReportSchema,
          });
        }

        console.log(
          `Update available: uipro ${updateInfo.uipro.current || 'none'} -> ${updateInfo.uipro.latest}; shadcn ${updateInfo.shadcn.current || 'none'} -> ${updateInfo.shadcn.latest}`
        );
      } catch (error) {
        console.log('Failed to check update, proceeding with sync...');
      }
    }

    // 执行同步（下载并写入缓存，当前会话不热切换）
    throwIfAborted(context?.signal, 'sync_ui_data 已取消');
    await reportToolProgress(context, 30, 'sync_ui_data: 下载并处理数据');

    await syncUIDataToCache(force, verbose, {
      signal: context?.signal,
      force,
      onProgress: async (progress, message) => {
        await reportToolProgress(context, 30 + Math.round(progress * 0.6), `sync_ui_data: ${message}`);
      },
    });

    throwIfAborted(context?.signal, 'sync_ui_data 已取消');
    await reportToolProgress(context, 92, 'sync_ui_data: 记录会话状态');

    // 获取同步的数据统计
    const loader = await getDataLoader();
    const cacheDir = loader.getCacheManager().getCacheDir() || '';
    const metadata = loader.getCacheManager().getMetadata();
    const searchEngine = loader.getSearchEngine();
    const sessionInfo = loader.getSessionInfo();
    
    const syncedData: SyncReport = {
      summary: "UI/UX 数据同步成功",
      status: 'success',
      synced: {
        colors: (searchEngine.getCategoryData('colors') || []).length,
        icons: (searchEngine.getCategoryData('icons') || []).length,
        components: (searchEngine.getCategoryData('products') || []).length,
        patterns: (searchEngine.getCategoryData('landing') || []).length,
        shadcnBlocks: (searchEngine.getCategoryData('shadcn-blocks') || []).length,
        shadcnComponents: (searchEngine.getCategoryData('shadcn-components') || []).length,
        themes: (searchEngine.getCategoryData('ui-themes') || []).length,
        vercelGuidelines: (searchEngine.getCategoryData('ui-guidelines-vercel') || []).length,
      },
      version: metadata?.version,
      timestamp: new Date().toISOString(),
    };

    await reportToolProgress(context, 100, 'sync_ui_data: 同步完成');

    return okStructured(`✅ UI/UX 数据同步成功

数据已更新到缓存目录: ${cacheDir}
下载版本: ${metadata?.version || 'unknown'}

**同步统计:**
- 颜色: ${syncedData.synced.colors} 条
- 图标: ${syncedData.synced.icons} 条
- 组件: ${syncedData.synced.components} 条
- 模式: ${syncedData.synced.patterns} 条
- shadcn blocks: ${syncedData.synced.shadcnBlocks || 0} 条
- shadcn components: ${syncedData.synced.shadcnComponents || 0} 条
- UI 主题: ${syncedData.synced.themes || 0} 套
- Vercel 规范: ${syncedData.synced.vercelGuidelines || 0} 条

**会话状态:**
- 当前会话使用版本: ${sessionInfo.activeVersion || 'unknown'}（source: ${sessionInfo.source}）
- 下次启动生效版本: ${sessionInfo.pendingVersion || metadata?.version || 'unknown'}

**提示:** 为保证会话内结果一致，新数据将在下次启动后生效。
`, syncedData, {
      schema: (await import('../schemas/output/ui-ux-tools.js')).SyncReportSchema,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    const errorData: SyncReport = {
      summary: "UI 数据同步失败",
      status: 'failed',
      synced: {},
      timestamp: new Date().toISOString(),
      errors: [errorMessage],
    };
    
    return okStructured(`❌ UI 数据同步失败: ${errorMessage}

**可能的原因:**
1. 网络连接问题
2. npm registry 不可访问
3. 磁盘空间不足
4. 权限问题

**建议:**
1. 检查网络连接
2. 稍后重试
3. 使用 \`verbose: true\` 查看详细日志
`, errorData, {
      schema: (await import('../schemas/output/ui-ux-tools.js')).SyncReportSchema,
    });
  }
}


