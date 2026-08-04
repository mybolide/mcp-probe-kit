import { createHash } from 'node:crypto';

export type PlanJsonValue =
  | string
  | number
  | boolean
  | null
  | PlanJsonValue[]
  | { [key: string]: PlanJsonValue };

export type PlanJsonObject = { [key: string]: PlanJsonValue };

export interface PlanArtifact {
  id: string;
  kind: string;
  summary: string;
  reference?: string;
  stepId?: string;
  revision?: string;
  metadata?: PlanJsonObject;
  recordedAt: string;
}

function candidatePayload(raw: Record<string, unknown>): Record<string, unknown> {
  const {
    id: _id,
    status: _status,
    evidence: _evidence,
    recordedAt: _recordedAt,
    recorded_at: _recordedAtSnake,
    ...payload
  } = raw;
  return payload;
}

export interface PlanCandidate {
  id: string;
  summary: string;
  status: 'candidate' | 'validated' | 'rejected';
  evidence: string[];
  payload?: PlanJsonValue;
  recordedAt: string;
}

export interface PlanAcceptanceResult {
  gateId: string;
  passed: boolean;
  summary: string;
  reference?: string;
  verifiedAt: string;
}

export interface PlanRuntimeEvidence {
  kind: string;
  summary: string;
  reference?: string;
  revision?: string;
  verifiedAt: string;
}

export function normalizePlanJsonObject(
  value: unknown,
  field: string,
): PlanJsonObject | undefined {
  if (value === undefined || value === null) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} 必须是对象`);
  }
  assertPlainObject(value, field);
  return normalizeJsonValue(value, field, 0) as PlanJsonObject;
}

export function normalizePlanArtifacts(
  value: unknown,
  now: string = new Date().toISOString(),
): PlanArtifact[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const raw = record(item, `artifacts[${index}]`);
    const reference = text(raw.reference ?? raw.path ?? raw.uri);
    const summary = text(raw.summary ?? raw.name ?? reference);
    if (!summary) throw new Error(`artifacts[${index}].summary 不能为空`);
    const kind = text(raw.kind ?? raw.type) || 'artifact';
    const metadata = normalizePlanJsonObject(raw.metadata, `artifacts[${index}].metadata`);
    return {
      id: text(raw.id) || stableId('artifact', { kind, summary, reference }),
      kind,
      summary,
      ...(reference ? { reference } : {}),
      ...(text(raw.stepId ?? raw.step_id) ? { stepId: text(raw.stepId ?? raw.step_id) } : {}),
      ...(text(raw.revision) ? { revision: text(raw.revision) } : {}),
      ...(metadata ? { metadata } : {}),
      recordedAt: date(raw.recordedAt ?? raw.recorded_at, now),
    };
  });
}

export function normalizePlanCandidates(
  value: unknown,
  field: 'memoryCandidates' | 'architectureCandidates',
  now: string = new Date().toISOString(),
): PlanCandidate[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const raw = record(item, `${field}[${index}]`);
    const payload = raw.payload === undefined
      ? normalizeJsonValue(candidatePayload(raw), `${field}[${index}]`, 0)
      : normalizeJsonValue(raw.payload, `${field}[${index}].payload`, 0);
    const summary = text(raw.summary ?? raw.name ?? raw.description ?? raw.type)
      || `${field} candidate ${index + 1}`;
    return {
      id: text(raw.id) || stableId(field, payload),
      summary,
      status: candidateStatus(raw.status),
      evidence: stringArray(raw.evidence),
      ...(payload !== undefined ? { payload } : {}),
      recordedAt: date(raw.recordedAt ?? raw.recorded_at, now),
    };
  });
}

export function normalizeAcceptanceResults(
  value: unknown,
  now: string = new Date().toISOString(),
): PlanAcceptanceResult[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const raw = record(item, `acceptanceResults[${index}]`);
    const gateId = text(raw.gateId ?? raw.gate_id);
    const summary = text(raw.summary);
    if (!gateId || !summary) {
      throw new Error(`acceptanceResults[${index}] 必须包含 gate_id 和 summary`);
    }
    if (typeof raw.passed !== 'boolean') {
      throw new Error(`acceptanceResults[${index}].passed 必须是 boolean`);
    }
    return {
      gateId,
      passed: raw.passed,
      summary,
      ...(text(raw.reference) ? { reference: text(raw.reference) } : {}),
      verifiedAt: date(raw.verifiedAt ?? raw.verified_at, now),
    };
  });
}

export function normalizeRuntimeEvidence(
  value: unknown,
  now: string = new Date().toISOString(),
): PlanRuntimeEvidence[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const raw = record(item, `runtimeEvidence[${index}]`);
    const summary = text(raw.summary);
    if (!summary) throw new Error(`runtimeEvidence[${index}].summary 不能为空`);
    return {
      kind: text(raw.kind ?? raw.type) || 'runtime',
      summary,
      ...(text(raw.reference) ? { reference: text(raw.reference) } : {}),
      ...(text(raw.revision) ? { revision: text(raw.revision) } : {}),
      verifiedAt: date(raw.verifiedAt ?? raw.verified_at, now),
    };
  });
}

export function mergeArtifacts(
  existing: PlanArtifact[] = [],
  incoming: PlanArtifact[] = [],
): PlanArtifact[] {
  return mergeBy(existing, incoming, (item) => item.id);
}

export function mergeCandidates(
  existing: PlanCandidate[] = [],
  incoming: PlanCandidate[] = [],
): PlanCandidate[] {
  return mergeBy(existing, incoming, (item) => item.id);
}

export function mergeAcceptanceResults(
  existing: PlanAcceptanceResult[] = [],
  incoming: PlanAcceptanceResult[] = [],
): PlanAcceptanceResult[] {
  return mergeBy(existing, incoming, (item) => item.gateId);
}

export function mergeRuntimeEvidence(
  existing: PlanRuntimeEvidence[] = [],
  incoming: PlanRuntimeEvidence[] = [],
): PlanRuntimeEvidence[] {
  return mergeBy(
    existing,
    incoming,
    (item) => [item.kind, item.summary, item.reference, item.revision].join('|'),
  );
}

function normalizeJsonValue(value: unknown, field: string, depth: number): PlanJsonValue {
  if (depth > 12) throw new Error(`${field} JSON 嵌套过深`);
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${field} 包含非有限数字`);
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) => normalizeJsonValue(item, `${field}[${index}]`, depth + 1));
  }
  if (value && typeof value === 'object') {
    assertPlainObject(value, field);
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, normalizeJsonValue(item, `${field}.${key}`, depth + 1)]),
    );
  }
  throw new Error(`${field} 包含不可序列化值: ${typeof value}`);
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} 必须是对象`);
  }
  assertPlainObject(value, field);
  return value as Record<string, unknown>;
}

function assertPlainObject(value: object, field: string): void {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${field} 必须是普通 JSON 对象`);
  }
}

function candidateStatus(value: unknown): PlanCandidate['status'] {
  const status = text(value) || 'candidate';
  if (status === 'candidate' || status === 'validated' || status === 'rejected') return status;
  throw new Error(`不支持的 candidate status: ${status}`);
}

function stableId(prefix: string, value: unknown): string {
  return `${prefix}-${createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 12)}`;
}

function mergeBy<T>(existing: T[], incoming: T[], key: (item: T) => string): T[] {
  const map = new Map(existing.map((item) => [key(item), item]));
  for (const item of incoming) map.set(key(item), item);
  return [...map.values()];
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => text(item)).filter(Boolean))];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function date(value: unknown, fallback: string): string {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) throw new Error(`无效日期时间: ${String(value)}`);
  return parsed.toISOString();
}
