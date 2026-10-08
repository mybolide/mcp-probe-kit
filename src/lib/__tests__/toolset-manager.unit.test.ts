import { describe, expect, it, vi } from 'vitest';
import {
  filterTools,
  getToolsetFromEnv,
  resolveToolsetNames,
  TOOLSET_DEFINITIONS,
} from '../toolset-manager.js';

describe('toolset-manager', () => {
  it('workflow toolset keeps delegated-plan memory dependencies', () => {
    const workflowTools = TOOLSET_DEFINITIONS.workflow;
    expect(workflowTools).toEqual(
      expect.arrayContaining([
        'search_memory',
        'read_memory_asset',
        'memorize_asset',
        'update_memory_asset',
        'delete_memory_asset',
        'scan_and_extract_patterns',
      ]),
    );
  });

  it('unknown or missing toolset safely defaults to compact', () => {
    vi.stubEnv('MCP_TOOLSET', 'unknown');
    expect(getToolsetFromEnv()).toBe('compact');
    vi.unstubAllEnvs();
  });

  it('compact exposes 24 base tools, +5 history (default), +6 memory', () => {
    expect(resolveToolsetNames('compact', { memoryEnabled: false, historyEnabled: false })).toHaveLength(24);
    expect(resolveToolsetNames('compact', { memoryEnabled: false, historyEnabled: true })).toHaveLength(29);
    expect(resolveToolsetNames('compact', { memoryEnabled: true, historyEnabled: false })).toHaveLength(30);
    expect(resolveToolsetNames('compact', { memoryEnabled: true, historyEnabled: true })).toHaveLength(35);
    expect(resolveToolsetNames('compact', { memoryEnabled: false, historyEnabled: true })).toEqual(
      expect.arrayContaining([
        'start_product',
        'gencommit',
        'converge',
        'architecture',
        'history_session_bootstrap',
      ]),
    );
    expect(resolveToolsetNames('compact', { memoryEnabled: false, historyEnabled: false })).not.toEqual(
      expect.arrayContaining(['add_feature', 'fix_bug', 'sync_ui_data', 'ask_user']),
    );
  });

  it('filtering never returns undeclared tools', () => {
    const tools = [
      { name: 'workflow', description: '', inputSchema: {} },
      { name: 'search_memory', description: '', inputSchema: {} },
      { name: 'history_session_bootstrap', description: '', inputSchema: {} },
      { name: 'not_registered', description: '', inputSchema: {} },
    ];
    expect(
      filterTools(tools, 'compact', { memoryEnabled: true, historyEnabled: true }).map((tool) => tool.name),
    ).toEqual(['workflow', 'search_memory', 'history_session_bootstrap']);
  });
});
