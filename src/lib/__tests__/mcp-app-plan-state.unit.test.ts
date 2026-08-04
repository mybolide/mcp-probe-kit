import { describe, expect, it } from 'vitest';
import {
  buildInitialPlanHeartbeatArgs,
  planSnapshotHasRecord,
  planSnapshotNeedsReconciliation,
  resolvePlanProjectRoot,
} from '../plan-workbench-state.js';

describe('MCP App plan workbench state', () => {
  it('uses resolved bootstrap project root when the original tool input omitted project_root', () => {
    expect(resolvePlanProjectRoot({
      lastInput: { description: 'feature' },
      lastResult: {
        structuredContent: {
          metadata: {
            bootstrapState: { projectRoot: 'E:/workspace/project' },
          },
        },
      },
      plan: { planId: 'feature-plan', steps: [] },
    })).toBe('E:/workspace/project');
  });

  it('keeps a workbench-created empty checkpoint in reconciliation state until Agent progress is written', () => {
    const emptyRecovered = {
      found: true,
      record: {
        status: 'active',
        completedStepIds: [],
        skippedSteps: [],
        runtimeEvidence: [{ kind: 'workbench_checkpoint_bootstrap' }],
      },
    };
    expect(planSnapshotNeedsReconciliation(emptyRecovered)).toBe(true);
    expect(planSnapshotNeedsReconciliation({
      ...emptyRecovered,
      record: {
        ...emptyRecovered.record,
        completedStepIds: ['spec'],
      },
    })).toBe(false);
  });

  it('prefers the explicit project root and can recover it from a resumed record', () => {
    expect(resolvePlanProjectRoot({
      lastInput: { project_root: 'E:/explicit' },
      planSnapshot: {
        found: true,
        record: { declaredScope: { projectRoot: 'E:/checkpoint' } },
      },
    })).toBe('E:/explicit');

    expect(resolvePlanProjectRoot({
      planSnapshot: {
        found: true,
        record: { declaredScope: { projectRoot: 'E:/checkpoint' } },
      },
    })).toBe('E:/checkpoint');
  });

  it('distinguishes a successful resume call without a stored checkpoint', () => {
    expect(planSnapshotHasRecord({ found: false })).toBe(false);
    expect(planSnapshotHasRecord({ found: true, record: {} })).toBe(false);
    expect(planSnapshotHasRecord({ found: true, record: { status: 'active' } })).toBe(true);
  });

  it('builds the first heartbeat with the full plan and stable project root', () => {
    expect(buildInitialPlanHeartbeatArgs({
      planId: 'feature-orders-abc',
      steps: [{ id: 'spec' }],
    }, 'E:/workspace/orders')).toMatchObject({
      plan_id: 'feature-orders-abc',
      project_root: 'E:/workspace/orders',
      status: 'active',
      completed_step_ids: [],
      unresolved_items: [],
      runtime_evidence: [{
        kind: 'workbench_checkpoint_bootstrap',
        summary: expect.stringContaining('Agent'),
      }],
      plan: {
        planId: 'feature-orders-abc',
        steps: [{ id: 'spec' }],
      },
    });
  });
});
