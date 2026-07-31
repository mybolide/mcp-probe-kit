import { isMemoryEnabled } from './memory-config.js';
import { TOOL_CATALOG } from '../server/tool-catalog.js';
import type { ToolsetType } from '../server/tool-definition.js';
import {
  COMPACT_MODEL_TOOL_NAMES,
  MEMORY_MODEL_TOOL_NAMES,
} from '../server/tool-visibility.js';

export type { ToolsetType } from '../server/tool-definition.js';

function namesFor(toolset: 'core' | 'ui' | 'workflow'): string[] {
  return TOOL_CATALOG
    .filter((entry) => entry.toolsets.includes(toolset))
    .map((entry) => entry.name);
}

export const TOOLSET_DEFINITIONS = {
  compact: [...COMPACT_MODEL_TOOL_NAMES],
  core: namesFor('core'),
  ui: namesFor('ui'),
  workflow: namesFor('workflow'),
  full: 'all' as const,
};

export interface Tool {
  name: string;
  description: string;
  inputSchema: unknown;
}

export interface ToolsetResolutionOptions {
  memoryEnabled?: boolean;
}

export function resolveToolsetNames(
  toolset: ToolsetType,
  options: ToolsetResolutionOptions = {},
): readonly string[] | 'all' {
  if (toolset === 'full') return 'all';
  if (toolset !== 'compact') return TOOLSET_DEFINITIONS[toolset];

  const memoryEnabled = options.memoryEnabled ?? isMemoryEnabled();
  return memoryEnabled
    ? [...COMPACT_MODEL_TOOL_NAMES, ...MEMORY_MODEL_TOOL_NAMES]
    : [...COMPACT_MODEL_TOOL_NAMES];
}

export function filterTools(
  tools: Tool[],
  toolset: ToolsetType,
  options: ToolsetResolutionOptions = {},
): Tool[] {
  const allowed = resolveToolsetNames(toolset, options);
  if (allowed === 'all') return tools;
  const allowedNames = new Set(allowed);
  return tools.filter((tool) => allowedNames.has(tool.name));
}

export function getToolsetFromEnv(): ToolsetType {
  const toolset = process.env.MCP_TOOLSET?.trim().toLowerCase();
  if (
    toolset === 'compact' ||
    toolset === 'core' ||
    toolset === 'ui' ||
    toolset === 'workflow' ||
    toolset === 'full'
  ) {
    return toolset;
  }
  return 'compact';
}

export function getToolsetSize(
  toolset: ToolsetType,
  options: ToolsetResolutionOptions = {},
): number {
  const names = resolveToolsetNames(toolset, options);
  return names === 'all' ? TOOL_CATALOG.length : names.length;
}
