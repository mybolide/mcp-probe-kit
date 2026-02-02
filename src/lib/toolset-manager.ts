/**
 * 工具集管理器
 * 根据环境变量 MCP_TOOLSET 过滤工具列表
 */

import { allToolSchemas } from '../schemas/index.js';

export type ToolsetType = 'core' | 'ui' | 'workflow' | 'full';

/**
 * 工具集定义 (v3.0 精简版 - 20 个工具)
 * 
 * - core: 核心工具（日常高频）
 * - ui: UI/UX 工具（推荐使用 start_ui 统一入口）
 * - workflow: 工作流工具（包含 core + 编排工具）
 * - full: 所有工具（默认）
 */
export const TOOLSET_DEFINITIONS = {
  // 核心工具集 - 日常高频工具（9 个）
  core: [
    'gencommit',
    'code_review',
    'gentest',
    'refactor',
    'fix_bug',
    'add_feature',
    'init_project',
    'init_project_context',
    'estimate',
  ],

  // UI/UX 工具集 - 包含统一入口（4 个）
  ui: [
    'start_ui',         // ⭐ 统一入口（编排工具）
    'ui_design_system', // 生成设计系统
    'ui_search',        // 搜索 UI/UX 数据库
    'sync_ui_data',     // 同步 UI 数据
  ],

  // 工作流工具集 - 包含核心 + 编排 + 交互（20 个）
  workflow: [
    // 核心工具（9 个）
    'gencommit',
    'code_review',
    'gentest',
    'refactor',
    'fix_bug',
    'add_feature',
    'init_project',
    'init_project_context',
    'estimate',
    
    // 编排工具（6 个）
    'start_feature',
    'start_bugfix',
    'start_onboard',
    'start_ui',
    'start_product',
    'start_ralph',
    
    // 交互工具（2 个）
    'interview',
    'ask_user',
    
    // UI/UX 工具（3 个）
    'ui_design_system',
    'ui_search',
    'sync_ui_data',
  ],

  // 完整工具集 - 所有 20 个工具
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
    return allToolSchemas.length;
  }
  
  const allowedTools = TOOLSET_DEFINITIONS[toolset];
  return (allowedTools as string[]).length;
}
