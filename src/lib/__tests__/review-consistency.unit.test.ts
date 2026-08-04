import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { buildDelegatedPlanContract } from '../delegated-plan-contract.js';
import { compareReviewConsistency } from '../review-consistency.js';
import type { GitDiffEvidence } from '../git-diff-evidence.js';
import type { PlanHeartbeatRecord } from '../../plans/plan-types.js';

const roots: string[] = [];

function makeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'review-consistency-'));
  roots.push(root);
  return root;
}

function diff(root: string, files: string[], revision = 'bbbbbbbb'): GitDiffEvidence {
  return {
    available: true,
    repositoryRoot: root.replace(/\\/g, '/'),
    mode: 'auto',
    currentRevision: revision,
    changedFiles: files.map((file) => ({ path: file, status: 'M', additions: 1, deletions: 0 })),
    untrackedFiles: [],
    diff: 'diff --git a/file b/file',
    diffChars: 24,
    truncated: false,
    warnings: [],
  };
}

function planRecord(overrides: Partial<PlanHeartbeatRecord> = {}): PlanHeartbeatRecord {
  const now = new Date().toISOString();
  const plan = buildDelegatedPlanContract({
    planId: 'feature-review-consistency',
    workflow: 'feature',
    workflowVersion: '4.0.0',
    objective: 'review consistency',
    declaredScope: { paths: ['src/allowed'] },
    steps: [{
      id: 'implementation',
      type: 'agent_action',
      action: 'implement',
      outputs: ['artifacts/result.json'],
    }],
  });
  return {
    schemaVersion: '1.0.0',
    planId: plan.planId,
    plan,
    status: 'active',
    completedStepIds: [],
    skippedSteps: [],
    unresolvedItems: [],
    evidence: [],
    declaredScope: { paths: ['src/allowed'] },
    artifacts: [{
      id: 'artifact-result',
      kind: 'file',
      summary: 'result',
      reference: 'artifacts/result.json',
      recordedAt: now,
    }],
    memoryCandidates: [],
    architectureCandidates: [{
      id: 'architecture-candidate-1',
      summary: 'boundary change',
      status: 'candidate',
      evidence: ['design'],
      recordedAt: now,
    }],
    acceptanceResults: [],
    runtimeEvidence: [],
    lastVerifiedRevision: 'aaaaaaaa',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('review consistency', () => {
  test('发现越界变更、缺失产物、测试缺口、契约变化、架构证据和 revision 过期', () => {
    const root = makeRoot();
    const result = compareReviewConsistency({
      repositoryRoot: root,
      diff: diff(root, ['src/outside.ts', 'src/api/schema.ts']),
      plan: planRecord(),
    });

    expect(result.outOfScopeFiles).toEqual(['src/outside.ts', 'src/api/schema.ts']);
    expect(result.missingArtifacts).toContain('artifacts/result.json');
    expect(result.potentialContractChanges).toContain('src/api/schema.ts');
    expect(result.testEvidencePresent).toBe(false);
    expect(result.architectureReviewRequired).toBe(true);
    expect(result.architectureReviewSatisfied).toBe(false);
    expect(result.revisionMatches).toBe(false);
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ severity: 'high', category: 'scope' }),
      expect.objectContaining({ severity: 'medium', category: 'artifact' }),
      expect.objectContaining({ severity: 'high', category: 'test' }),
      expect.objectContaining({ severity: 'medium', category: 'contract' }),
      expect.objectContaining({ severity: 'high', category: 'architecture' }),
      expect.objectContaining({ severity: 'high', category: 'revision' }),
    ]));
  });

  test('当前 revision、测试和架构证据齐全时不产生对应高风险发现', () => {
    const root = makeRoot();
    fs.mkdirSync(path.join(root, 'artifacts'), { recursive: true });
    fs.writeFileSync(path.join(root, 'artifacts', 'result.json'), '{}\n', 'utf8');
    const record = planRecord({
      evidence: [{
        kind: 'test',
        summary: 'npm test passed 10/10',
        revision: 'bbbbbbbb',
        verifiedAt: new Date().toISOString(),
      }],
      completedStepIds: ['implementation', 'architecture-drift'],
      acceptanceResults: [{
        gateId: 'architecture-drift',
        passed: true,
        summary: 'drift passed',
        verifiedAt: new Date().toISOString(),
      }],
      lastVerifiedRevision: 'bbbbbbbb',
      architectureCandidates: [],
    });
    const result = compareReviewConsistency({
      repositoryRoot: root,
      diff: diff(root, ['src/allowed/service.ts', 'src/allowed/service.test.ts']),
      plan: record,
    });

    expect(result.outOfScopeFiles).toEqual([]);
    expect(result.missingArtifacts).toEqual([]);
    expect(result.testEvidencePresent).toBe(true);
    expect(result.revisionMatches).toBe(true);
    expect(result.findings.some((item) => item.category === 'test' && item.severity === 'high')).toBe(false);
    expect(result.findings.some((item) => item.category === 'architecture' && item.severity === 'high')).toBe(false);
    expect(result.findings.some((item) => item.category === 'revision' && item.severity === 'high')).toBe(false);
  });

  test('请求的 Plan 不存在时形成明确证据缺口', () => {
    const root = makeRoot();
    const result = compareReviewConsistency({
      repositoryRoot: root,
      diff: diff(root, ['src/a.ts']),
      plan: null,
      requestedPlanId: 'missing-plan',
    });

    expect(result.planLoaded).toBe(false);
    expect(result.findings).toContainEqual(expect.objectContaining({
      severity: 'high',
      category: 'evidence',
      message: expect.stringContaining('missing-plan'),
    }));
  });
});
