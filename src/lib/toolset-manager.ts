/**
 * 工具集管理器
 * 根据环境变量 MCP_TOOLSET 过滤工具列表
 */

import { TOOL_CATALOG } from '../server/tool-catalog.js';
import type { ToolsetType } from '../server/tool-definition.js';

export type { ToolsetType } from '../server/tool-definition.js';

/**
 * 工具集定义 (v3.0 精简版)
 * 
 * - core: 核心工具（日常高频）
 * - ui: UI/UX 工具（推荐使用 start_ui 统一入口）
 * - workflow: 工作流工具（包含 core + 编排工具）
 * - full: 所有工具（默认）
 */
function namesFor(toolset: Exclude<ToolsetType, 'full'>): string[] {
  return TOOL_CATALOG
    .filter((entry) => entry.toolsets.includes(toolset))
    .map((entry) => entry.name);
}

export const TOOLSET_DEFINITIONS = {
  core: namesFor('core'),
  ui: namesFor('ui'),
  workflow: namesFor('workflow'),
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
    return TOOL_CATALOG.length;
  }
  
  const allowedTools = TOOLSET_DEFINITIONS[toolset];
  return (allowedTools as string[]).length;
}
