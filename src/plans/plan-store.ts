import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { resolveWorkspaceRoot } from '../lib/workspace-root.js';
import {
  PLAN_STATE_SCHEMA_VERSION,
  normalizeEvidence,
  normalizeDelegatedPlan,
  normalizePlanId,
  stringArray,
  type PlanHeartbeatRecord,
} from './plan-types.js';
import {
  normalizeAcceptanceResults,
  normalizePlanArtifacts,
  normalizePlanCandidates,
  normalizePlanJsonObject,
  normalizeRuntimeEvidence,
} from './plan-state-metadata.js';

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

  async readLatestResumable(): Promise<PlanHeartbeatRecord | null> {
    let entries;
    try {
      entries = await readdir(this.plansDir, { withFileTypes: true });
    } catch (error) {
      if (isMissingFile(error)) return null;
      throw error;
    }

    const records: PlanHeartbeatRecord[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      try {
        const raw = JSON.parse(
          await readFile(path.join(this.plansDir, entry.name), 'utf8'),
        ) as unknown;
        const record = normalizeRecord(raw);
        if (record.status === 'active' || record.status === 'blocked') {
          records.push(record);
        }
      } catch {
        // A malformed unrelated checkpoint must not prevent recovery of valid plans.
      }
    }

    return records.sort((left, right) =>
      Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
      || right.planId.localeCompare(left.planId)
    )[0] ?? null;
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
  const declaredScope = normalizePlanJsonObject(
    raw.declaredScope ?? raw.declared_scope,
    'declaredScope',
  );
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
    evidence: normalizeEvidence(raw.evidence, updatedAt),
    ...(declaredScope ? { declaredScope } : {}),
    artifacts: normalizePlanArtifacts(raw.artifacts, updatedAt),
    memoryCandidates: normalizePlanCandidates(
      raw.memoryCandidates ?? raw.memory_candidates,
      'memoryCandidates',
      updatedAt,
    ),
    architectureCandidates: normalizePlanCandidates(
      raw.architectureCandidates ?? raw.architecture_candidates,
      'architectureCandidates',
      updatedAt,
    ),
    acceptanceResults: normalizeAcceptanceResults(
      raw.acceptanceResults ?? raw.acceptance_results,
      updatedAt,
    ),
    runtimeEvidence: normalizeRuntimeEvidence(
      raw.runtimeEvidence ?? raw.runtime_evidence,
      updatedAt,
    ),
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
