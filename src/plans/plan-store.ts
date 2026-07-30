import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { resolveWorkspaceRoot } from '../lib/workspace-root.js';
import {
  PLAN_STATE_SCHEMA_VERSION,
  normalizeDelegatedPlan,
  normalizePlanId,
  stringArray,
  type PlanHeartbeatRecord,
} from './plan-types.js';

export interface PlanStoreLocation {
  projectRoot: string;
  statePath: string;
  absolutePath: string;
}

export class JsonPlanStore {
  readonly projectRoot: string;
  private readonly plansDir: string;

  constructor(projectRoot?: string) {
    this.projectRoot = resolveWorkspaceRoot(projectRoot ?? '');
    this.plansDir = path.join(this.projectRoot, '.mcp-probe-kit', 'plans');
  }

  location(planId: string): PlanStoreLocation {
    const safeId = normalizePlanId(planId);
    const statePath = path.posix.join('.mcp-probe-kit', 'plans', `${safeId}.json`);
    return {
      projectRoot: this.projectRoot,
      statePath,
      absolutePath: path.join(this.plansDir, `${safeId}.json`),
    };
  }

  async read(planId: string): Promise<PlanHeartbeatRecord | null> {
    const location = this.location(planId);
    try {
      const raw = JSON.parse(await readFile(location.absolutePath, 'utf8')) as unknown;
      return normalizeRecord(raw);
    } catch (error) {
      if (isMissingFile(error)) return null;
      throw error;
    }
  }

  async write(record: PlanHeartbeatRecord): Promise<PlanStoreLocation> {
    const location = this.location(record.planId);
    await mkdir(this.plansDir, { recursive: true });
    const tempPath = `${location.absolutePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    await rename(tempPath, location.absolutePath);
    return location;
  }
}

function normalizeRecord(value: unknown): PlanHeartbeatRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Plan 状态文件不是对象');
  }
  const raw = value as Record<string, unknown>;
  const plan = normalizeDelegatedPlan(raw.plan);
  const createdAt = normalizeDate(raw.createdAt, 'createdAt');
  const updatedAt = normalizeDate(raw.updatedAt, 'updatedAt');
  return {
    schemaVersion: PLAN_STATE_SCHEMA_VERSION,
    planId: normalizePlanId(String(raw.planId ?? '')),
    plan,
    status: normalizeStatus(raw.status),
    ...(typeof raw.currentStepId === 'string' && raw.currentStepId.trim()
      ? { currentStepId: raw.currentStepId.trim() }
      : {}),
    completedStepIds: stringArray(raw.completedStepIds),
    skippedSteps: Array.isArray(raw.skippedSteps)
      ? raw.skippedSteps
          .filter((item): item is { stepId: string; reason: string } =>
            Boolean(item && typeof item === 'object')
          )
          .map((item) => ({ stepId: String(item.stepId), reason: String(item.reason) }))
      : [],
    unresolvedItems: stringArray(raw.unresolvedItems),
    evidence: Array.isArray(raw.evidence) ? (raw.evidence as never) : [],
    ...(typeof raw.lastVerifiedRevision === 'string'
      ? { lastVerifiedRevision: raw.lastVerifiedRevision }
      : {}),
    ...(raw.lastConvergence && typeof raw.lastConvergence === 'object'
      ? { lastConvergence: raw.lastConvergence as never }
      : {}),
    createdAt,
    updatedAt,
  };
}

function normalizeStatus(value: unknown): PlanHeartbeatRecord['status'] {
  const status = String(value ?? 'active') as PlanHeartbeatRecord['status'];
  if (!['active', 'blocked', 'converged', 'cancelled'].includes(status)) {
    throw new Error(`无效 Plan 状态: ${status}`);
  }
  return status;
}

function normalizeDate(value: unknown, field: string): string {
  const date = new Date(String(value ?? ''));
  if (Number.isNaN(date.getTime())) throw new Error(`Plan 状态缺少有效 ${field}`);
  return date.toISOString();
}

function isMissingFile(error: unknown): boolean {
  return Boolean(
    error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'
  );
}
