import { describe, expect, test } from 'vitest';
import {
  planFromToolResult,
  shouldAdoptPlanSnapshot,
} from '../plan-workbench-state.js';

describe('plan-workbench-state', () => {
  test('resume record.plan outranks stale metadata.plan', () => {
    const selected = planFromToolResult({
      structuredContent: {
        metadata: {
          plan: {
            planId: 'stale-plan',
            steps: [{ id: 'old-step' }],
          },
        },
        plan: {
          planId: 'also-stale',
          steps: [{ id: 'middle-step' }],
        },
        record: {
          plan: {
            planId: 'fresh-plan',
            steps: [{ id: 'fresh-step' }],
          },
        },
      },
    });

    expect(selected).toMatchObject({
      planId: 'fresh-plan',
      steps: [{ id: 'fresh-step' }],
    });
  });

  test('newer snapshots replace older snapshots but stale poll results do not regress UI', () => {
    const current = {
      found: true,
      record: {
        planId: 'feature-plan',
        plan: { planId: 'feature-plan', steps: [{ id: 'a' }] },
        updatedAt: '2026-08-06T03:10:00.000Z',
      },
    };
    const newer = {
      found: true,
      record: {
        planId: 'feature-plan',
        plan: { planId: 'feature-plan', steps: [{ id: 'a' }] },
        updatedAt: '2026-08-06T03:11:00.000Z',
      },
    };
    const older = {
      found: true,
      record: {
        planId: 'feature-plan',
        plan: { planId: 'feature-plan', steps: [{ id: 'a' }] },
        updatedAt: '2026-08-06T03:09:00.000Z',
      },
    };

    expect(shouldAdoptPlanSnapshot(current, newer)).toBe(true);
    expect(shouldAdoptPlanSnapshot(current, older)).toBe(false);
    expect(shouldAdoptPlanSnapshot(null, newer)).toBe(true);
    expect(shouldAdoptPlanSnapshot(current, { found: false })).toBe(false);
  });
});
