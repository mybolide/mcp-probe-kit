/**
 * 工具集管理器
 * 根据环境变量 MCP_TOOLSET 过滤工具列表
 */

export type ToolsetType = 'core' | 'ui' | 'workflow' | 'full';

/**
 * 工具集定义
 * 
 * - core: 12 个核心工具（高频使用）
 * - ui: 5 个 UI/UX 工具（推荐使用 start_ui 统一入口）
 * - workflow: 24 个工作流工具（包含 core + 编排工具）
 * - full: 所有 39 个工具（默认）
 */
export const TOOLSET_DEFINITIONS = {
  // 核心工具集（12 个）- 最常用的基础工具
  core: [
    'gencommit',
    'code_review',
    'gentest',
    'gendoc',
    'refactor',
    'perf',
    'security_scan',
    'fix_bug',
    'genapi',
    'gensql',
    'genreadme',
    'gen_mock',
  ],

  // UI/UX 工具集（5 个）- 对外工具，推荐使用 start_ui 统一入口
  ui: [
    'start_ui',         // ⭐ 统一入口（编排工具）
    'ui_search',        // 搜索 UI/UX 数据库
    'ui_design_system', // 生成设计系统
    'sync_ui_data',     // 同步 UI 数据
    // 注意：不包含内部工具 init_component_catalog 和 render_ui
  ],

  // 工作流工具集（24 个）- 包含核心工具 + 编排工具
  workflow: [
    // 核心工具（复用）
    'gencommit',
    'code_review',
    'gentest',
    'gendoc',
    'refactor',
    'perf',
    'security_scan',
    'fix_bug',
    'genapi',
    'gensql',
    'genreadme',
    'gen_mock',
    
    // 编排工具（10 个）
    'start_feature',
    'start_bugfix',
    'start_review',
    'start_release',
    'start_refactor',
    'start_onboard',
    'start_api',
    'start_doc',
    'start_ralph',
    'start_ui',
    
    // 交互工具（2 个）
    'interview',
    'ask_user',
  ],

  // 完整工具集（39 个）- 包含所有工具（包括内部工具）
  full: 'all' as const,
};

/**
 * 工具接口（简化版，用于过滤）
 */
export interface Tool {
  name: string;
  description: string;
  inputSchema: any;
}

/**
 * 根据工具集类型过滤工具列表
 * 
 * @param tools - 完整的工具列表
 * @param toolset - 工具集类型
 * @returns 过滤后的工具列表
 */
export function filterTools(tools: Tool[], toolset: ToolsetType): Tool[] {
  if (toolset === 'full') {
    return tools;
  }

  const allowedTools = TOOLSET_DEFINITIONS[toolset];
  
  return tools.filter(tool => (allowedTools as string[]).includes(tool.name));
}

/**
 * 从环境变量获取工具集类型
 * 
 * @returns 工具集类型，默认为 'full'
 */
export function getToolsetFromEnv(): ToolsetType {
  const toolset = process.env.MCP_TOOLSET?.toLowerCase();
  
  if (toolset === 'core' || toolset === 'ui' || toolset === 'workflow') {
    return toolset;
  }
  
  return 'full';
}

/**
 * 获取工具集的工具数量
 * 
 * @param toolset - 工具集类型
 * @returns 工具数量
 */
export function getToolsetSize(toolset: ToolsetType): number {
  if (toolset === 'full') {
    return 39;
  }
  
  const allowedTools = TOOLSET_DEFINITIONS[toolset];
  return (allowedTools as string[]).length;
}
