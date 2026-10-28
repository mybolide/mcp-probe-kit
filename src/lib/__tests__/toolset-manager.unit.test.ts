import { describe, expect, it, vi } from 'vitest';
import {
  filterTools,
  getToolsetFromEnv,
  resolveToolsetNames,
  TOOLSET_DEFINITIONS,
} from '../toolset-manager.js';

describe('toolset-manager', () => {
  it('workflow toolset keeps reusable Memory helpers but no old v4 Plan', () => {
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
    expect(workflowTools).toContain('devcontrol');
    expect(workflowTools).not.toContain('resume_plan');
  });

  it('unknown or missing toolset safely defaults to compact', () => {
    vi.stubEnv('MCP_TOOLSET', 'unknown');
    expect(getToolsetFromEnv()).toBe('compact');
    vi.unstubAllEnvs();
  });

  it('v5 compact exposes 10 base tools, +5 mandatory SQLite History, +6 optional Memory', () => {
    expect(resolveToolsetNames('compact', { memoryEnabled: false, historyEnabled: false })).toHaveLength(10);
    expect(resolveToolsetNames('compact', { memoryEnabled: false, historyEnabled: true })).toHaveLength(15);
    expect(resolveToolsetNames('compact', { memoryEnabled: true, historyEnabled: false })).toHaveLength(16);
    expect(resolveToolsetNames('compact', { memoryEnabled: true, historyEnabled: true })).toHaveLength(21);
    expect(resolveToolsetNames('compact', { memoryEnabled: false, historyEnabled: true })).toEqual(
      expect.arrayContaining([
        'devcontrol',
        'gencommit',
        'architecture',
        'history_session_bootstrap',
      ]),
    );
    expect(resolveToolsetNames('compact', { memoryEnabled: false, historyEnabled: false })).not.toEqual(
      expect.arrayContaining(['add_feature', 'start_feature', 'resume_plan', 'ask_user']),
    );
  });

  it('filtering never returns undeclared tools', () => {
    const tools = [
      { name: 'devcontrol', description: '', inputSchema: {} },
      { name: 'resume_plan', description: '', inputSchema: {} },
      { name: 'search_memory', description: '', inputSchema: {} },
      { name: 'history_session_bootstrap', description: '', inputSchema: {} },
      { name: 'not_registered', description: '', inputSchema: {} },
    ];
    expect(
      filterTools(tools, 'compact', { memoryEnabled: true, historyEnabled: true }).map((tool) => tool.name),
    ).toEqual(['devcontrol', 'search_memory', 'history_session_bootstrap']);
  });
});
