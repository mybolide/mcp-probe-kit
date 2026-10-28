import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { runV5DevControlTool, V5_DEVC_ACTIONS } from '../model-tool.js';
import { extractRequirementRefs, canonicalRequirementId } from '../requirement-ids.js';

const roots: string[] = [];
afterEach(() => { for (const dir of roots.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const root = () => {
  const dir = mkdtempSync(join(tmpdir(), 'v5-feature-stages-'));
  roots.push(dir);
  execFileSync('git', ['init', '-q', dir], { windowsHide: true, timeout: 3000 });
  return dir;
};
const action = async (project_root: string, name: string, operation: string,
  input: Record<string, unknown> = {}) => {
  const result = await runV5DevControlTool({
    action: operation, project_root, input: { name, ...input },
  });
  expect(result.isError).toBeFalsy();
  return result.structuredContent as Record<string, any>;
};

describe('v5 requirements → design → tasks lifecycle', () => {
  test('old FR-1 and new FR-001 share a canonical link without altering source labels', () => {
    expect(canonicalRequirementId('FR-1')).toBe('FR-001');
    expect(canonicalRequirementId('FR-001')).toBe('FR-001');
    expect(canonicalRequirementId('NFR-2')).toBe('NFR-002');
    expect(extractRequirementRefs('FR-1: first\nFR-001: same\nNFR-2: security')).toEqual([
      { id: 'FR-001', sourceIds: ['FR-1', 'FR-001'] },
      { id: 'NFR-002', sourceIds: ['NFR-2'] },
    ]);
  });

  test('main MCP can create a Feature then store and validate its three distinct SQLite sections', async () => {
    const project_root = root();
    const name = 'evidence-backed-insights';
    expect(V5_DEVC_ACTIONS).toContain('feature-create');
    const created = await action(project_root, name, 'feature-create', {
      description: 'Provide useful evidence-backed insights for end users',
      layout: 'flat',
    });
    expect(created).toMatchObject({ name, revision: 1, status: 'draft' });
    const sections = {
      requirements: 'FR-1: Users can see traceable evidence for every generated insight card.',
      design: 'The existing insight service returns structured facts with provenance and supports failure states.',
      tasks: 'Implement data retrieval and user-visible source references, including positive and failure tests.',
    };
    const revised = await action(project_root, name, 'feature-save', {
      sections, architectureImpact: false,
    });
    expect(revised.revision).toBe(2);
    expect(revised.sections).toEqual(sections);
    const validated = await action(project_root, name, 'feature-validate');
    expect(validated.passed).toBe(true);
    const brief = await action(project_root, name, 'feature-task-brief');
    expect(brief.readyForPlanning).toBe(true);
    expect(brief.requirementIds).toEqual(['FR-001']);
    expect(brief.requirementRefs).toEqual([{ id: 'FR-001', sourceIds: ['FR-1'] }]);
    expect(brief.approvedPlan).toMatchObject({ status: 'missing' });
    const exported = await action(project_root, name, 'feature-export', { format: 'markdown' });
    expect(exported.content).toContain('FR-1: Users');
    expect(exported.content).toContain('## 技术设计');
    expect(exported.content).toContain('## 研发任务');
    expect(existsSync(join(project_root, 'docs', 'specs', name, 'requirements.md'))).toBe(false);
  });
});
