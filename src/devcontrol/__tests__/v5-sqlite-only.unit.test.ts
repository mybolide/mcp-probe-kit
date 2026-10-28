import { afterEach, describe, expect, test } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { V5_DEVC_ACTIONS, runV5DevControlTool } from '../model-tool.js';
import { readSqliteHistoryDocuments, usesHistorySqlite, writeSqliteHistoryDocument } from '../../lib/history-session/sqlite-store.js';
import { resolveHistoryDir } from '../../lib/history-session/storage.js';
import { isHistorySessionEnabled } from '../../lib/history-session-config.js';
import { executeRegisteredTool, getToolDefinition, listToolDefinitionsForToolset } from '../../server/tool-registry.js';
import { isV5Tool, V4_PROCESS_TOOLS } from '../../server/v5-tool-policy.js';
import { generateWorkflowSkillBody } from '../../lib/workflow-skill-template.js';
import { buildToolManifestSections } from '../../server/tool-manifest.js';

const roots: string[] = [];
afterEach(() => {
  delete process.env.MCP_HISTORY_STORAGE;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function newProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'mcp-v5-sqlite-'));
  roots.push(root);
  execFileSync('git', ['init', '-q', root], { timeout: 3000, stdio: 'ignore' });
  return root;
}

describe('v5 SQLite-only lifecycle', () => {
  test('main MCP exposes DevControl with scoped target root and rejects legacy import operations', async () => {
    const root = newProject();
    const listed = getToolDefinition('devcontrol');
    expect(listed?.schema.inputSchema).toMatchObject({
      required: ['action', 'project_root'],
    });
    const onboard = await runV5DevControlTool({ action: 'onboard', project_root: root });
    expect(onboard.isError).toBeFalsy();
    const next = await runV5DevControlTool({ action: 'next', project_root: root });
    expect(next.isError).toBeFalsy();
    const ideas = await runV5DevControlTool({ action: 'idea-list', project_root: root });
    expect(ideas.isError).toBeFalsy();
    expect(V5_DEVC_ACTIONS).toContain('feature-save');
    expect(V5_DEVC_ACTIONS).toContain('bug-step-save');
    expect(V5_DEVC_ACTIONS).toContain('verify');
    for (const action of ['import-spec', 'create', 'subtask']) {
      const response = await runV5DevControlTool({ action, project_root: root });
      expect(response.isError).toBe(true);
      expect(response.structuredContent).toMatchObject({ code: 'UNSUPPORTED_V5_ACTION' });
    }
    expect((await runV5DevControlTool({ action: 'next' })).structuredContent).toMatchObject({
      code: 'PROJECT_ROOT_REQUIRED',
    });
  });

  test('removed v4 state workflows cannot return even in MCP_TOOLSET=full', async () => {
    for (const tool of V4_PROCESS_TOOLS) {
      expect(isV5Tool(tool)).toBe(false);
      expect(getToolDefinition(tool)).toBeUndefined();
      await expect(executeRegisteredTool(tool, {})).rejects.toThrow('V5_SQLITE_ONLY');
    }
    for (const mode of ['compact', 'workflow', 'full'] as const) {
      const names = listToolDefinitionsForToolset(mode).map(({ name }) => name);
      expect(names).toContain('devcontrol');
      expect(names).not.toContain('plan_heartbeat');
      expect(names).not.toContain('start_feature');
    }
    const manifest = buildToolManifestSections();
    expect(manifest.totalTools).toBe(24);
    expect(manifest.toolsets.compactWithHistory.count).toBe(15);
  });

  test('History is project-local SQLite only; old Markdown is import input, never runtime fallback', () => {
    const root = newProject();
    const path = join(root, 'docs', 'history-session');
    expect(usesHistorySqlite(root, path)).toBe(true);
    expect(resolveHistoryDir(root)).toBe(path);
    process.env.MCP_HISTORY_STORAGE = 'files';
    expect(() => usesHistorySqlite(root, path)).toThrow('V5_SQLITE_ONLY');
    delete process.env.MCP_HISTORY_STORAGE;
    expect(() => resolveHistoryDir(root, 'legacy/history')).toThrow('V5_SQLITE_ONLY');
    expect(() => usesHistorySqlite(join(root, 'not-git'), join(root, 'not-git/docs/history-session')))
      .toThrow('V5_GIT_PROJECT_REQUIRED');
    expect(() => isHistorySessionEnabled({ MCP_HISTORY_SESSION: 'off' })).toThrow('V5_SQLITE_ONLY');
    expect(isHistorySessionEnabled({})).toBe(true);
    expect(generateWorkflowSkillBody('5.0.0')).toContain('v4 file-backed');
    expect(generateWorkflowSkillBody('5.0.0')).toContain('only project-development workflow');
  });

  test('one-way legacy History import preserves originals and new checkpoints are SQLite-only', () => {
    const root = newProject();
    const archiveDir = join(root, 'docs', 'history-session');
    mkdirSync(archiveDir, { recursive: true });
    const prior = '# Session 1\n\nOriginal archived user input and verified evidence.\n';
    const sourcePath = join(archiveDir, '1.md');
    writeFileSync(sourcePath, prior, 'utf8');
    expect(readSqliteHistoryDocuments(root)).toEqual(
      expect.arrayContaining([expect.objectContaining({ number: 1, content: prior })]));
    const second = '# Session 2\n\nSQLite-only v5 checkpoint.\n';
    writeSqliteHistoryDocument(root, 2, second);
    expect(existsSync(join(archiveDir, '2.md'))).toBe(false);
    expect(readFileSync(sourcePath, 'utf8')).toBe(prior);
    expect(readSqliteHistoryDocuments(root)).toEqual(
      expect.arrayContaining([expect.objectContaining({ number: 2, content: second })]));
  });
});
