import { describe, expect, it, vi } from 'vitest';
import {
  filterTools,
  getToolsetFromEnv,
  TOOLSET_DEFINITIONS,
} from '../toolset-manager.js';

describe('toolset-manager', () => {
  it('workflow 工具集包含 delegated plan 依赖的完整记忆链路', () => {
    const workflowTools = TOOLSET_DEFINITIONS.workflow;
    expect(workflowTools).toEqual(
      expect.arrayContaining([
        'search_memory',
        'read_memory_asset',
        'memorize_asset',
        'update_memory_asset',
        'delete_memory_asset',
        'scan_and_extract_patterns',
      ])
    );
  });

  it('未知工具集仍安全降级为 full', () => {
    vi.stubEnv('MCP_TOOLSET', 'unknown');
    expect(getToolsetFromEnv()).toBe('full');
    vi.unstubAllEnvs();
  });

  it('过滤后不返回未声明工具', () => {
    const tools = [
      { name: 'workflow', description: '', inputSchema: {} },
      { name: 'search_memory', description: '', inputSchema: {} },
      { name: 'not_registered', description: '', inputSchema: {} },
    ];
    expect(filterTools(tools, 'workflow').map((tool) => tool.name)).toEqual([
      'workflow',
      'search_memory',
    ]);
  });
});
