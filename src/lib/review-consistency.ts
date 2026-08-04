import * as fs from 'node:fs';
import * as path from 'node:path';
import type { GitDiffEvidence } from './git-diff-evidence.js';
import type { PlanHeartbeatRecord } from '../plans/plan-types.js';

export type ReviewConsistencyCategory =
  | 'scope'
  | 'contract'
  | 'test'
  | 'architecture'
  | 'revision'
  | 'artifact'
  | 'evidence';

export interface ReviewConsistencyFinding {
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: ReviewConsistencyCategory;
  message: string;
  evidence: string[];
  suggestion: string;
}

export interface ReviewConsistencyResult {
  planId?: string;
  planLoaded: boolean;
  declaredPaths: string[];
  expectedArtifacts: string[];
  changedFiles: string[];
  outOfScopeFiles: string[];
  missingArtifacts: string[];
  implementationFiles: string[];
  testFiles: string[];
  potentialContractChanges: string[];
  testEvidencePresent: boolean;
  architectureReviewRequired: boolean;
  architectureReviewSatisfied: boolean;
  revisionMatches: boolean | null;
  findings: ReviewConsistencyFinding[];
}

export interface CompareReviewConsistencyInput {
  repositoryRoot: string;
  diff: GitDiffEvidence;
  plan?: PlanHeartbeatRecord | null;
  requestedPlanId?: string;
}

const PATH_SCOPE_KEY = /^(?:files?|paths?|directories?|dirs?|modules?|components?|scope|scopePaths?|affectedFiles?|targetFiles?|allowedPaths?|includePaths?|excludePaths?)$/i;
const TEST_FILE = /(?:^|\/)(?:__tests__|tests?|specs?)(?:\/|$)|\.(?:test|spec)\.[^.\/]+$/i;
const DOC_FILE = /(?:^|\/)(?:docs?|examples?)(?:\/|$)|\.(?:md|mdx|txt|rst)$/i;
const GENERATED_FILE = /(?:^|\/)(?:build|dist|coverage|generated|vendor)(?:\/|$)/i;
const CONTRACT_FILE = /(?:^|\/)(?:api|apis|routes?|schemas?|migrations?|protocol|public|contracts?|openapi|graphql)(?:\/|$)|(?:^|\/)(?:package(?:-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|server\.json|tools-manifest\.json|tsconfig\.json|\.github\/workflows\/[^/]+)$/i;

function normalizeRelative(root: string, value: string): string | null {
  const trimmed = value.trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (!trimmed || /^[a-z]+:\/\//i.test(trimmed)) return null;
  if (path.isAbsolute(trimmed)) {
    const relative = path.relative(root, trimmed).replace(/\\/g, '/');
    if (!relative || relative.startsWith('../') || path.isAbsolute(relative)) return null;
    return relative;
  }
  if (trimmed === '..' || trimmed.startsWith('../')) return null;
  return trimmed;
}

function collectDeclaredPaths(
  root: string,
  value: unknown,
  key = '',
  results: Set<string> = new Set(),
): Set<string> {
  if (typeof value === 'string') {
    if (PATH_SCOPE_KEY.test(key)) {
      const normalized = normalizeRelative(root, value);
      if (normalized) results.add(normalized);
    }
    return results;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectDeclaredPaths(root, item, key, results);
    return results;
  }
  if (!value || typeof value !== 'object') return results;
  for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
    collectDeclaredPaths(root, childValue, childKey, results);
  }
  return results;
}

function collectExpectedArtifacts(root: string, plan: PlanHeartbeatRecord): string[] {
  const results = new Set<string>();
  for (const artifact of plan.artifacts) {
    if (!artifact.reference) continue;
    const normalized = normalizeRelative(root, artifact.reference);
    if (normalized) results.add(normalized);
  }
  for (const step of plan.plan.steps) {
    for (const output of step.outputs ?? []) {
      const normalized = normalizeRelative(root, output);
      if (normalized) results.add(normalized);
    }
  }
  return [...results].sort();
}

function globRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '___DOUBLE_STAR___')
    .replace(/\*/g, '[^/]*')
    .replace(/___DOUBLE_STAR___/g, '.*');
  return new RegExp(`^${escaped}(?:/.*)?$`);
}

function inDeclaredScope(filePath: string, declaredPaths: string[]): boolean {
  return declaredPaths.some((declared) => {
    if (declared.includes('*')) return globRegex(declared).test(filePath);
    return filePath === declared || filePath.startsWith(`${declared.replace(/\/$/, '')}/`);
  });
}

function exactArtifactExists(root: string, artifact: string): boolean {
  if (artifact.includes('*') || artifact.includes('{') || artifact.includes('[')) return true;
  return fs.existsSync(path.resolve(root, artifact));
}

function testEvidencePresent(plan: PlanHeartbeatRecord): boolean {
  if (plan.evidence.some((item) => item.kind === 'test')) return true;
  if (plan.acceptanceResults.some((item) => item.passed && /test|build|regression|verify/i.test(item.gateId))) {
    return true;
  }
  return plan.runtimeEvidence.some((item) => {
    const text = `${item.kind} ${item.summary}`;
    return /test|build|regression/i.test(text)
      && !/failed|failure|error|exit\s*(?:code)?\s*[1-9]/i.test(text);
  });
}

function architectureSatisfied(plan: PlanHeartbeatRecord): boolean {
  if (plan.completedStepIds.some((id) => /architecture-(?:drift|validate)|arc-8/i.test(id))) return true;
  if (plan.acceptanceResults.some((item) => item.passed && /architecture|drift|arc-8/i.test(item.gateId))) {
    return true;
  }
  const evidenceText = [
    ...plan.evidence.map((item) => `${item.summary} ${item.reference ?? ''}`),
    ...plan.runtimeEvidence.map((item) => `${item.kind} ${item.summary} ${item.reference ?? ''}`),
  ].join('\n');
  return /architecture.{0,40}(?:drift|validate)|(?:drift|validate).{0,40}architecture|arc-8/i.test(evidenceText);
}

function isImplementationFile(filePath: string): boolean {
  return !TEST_FILE.test(filePath) && !DOC_FILE.test(filePath) && !GENERATED_FILE.test(filePath);
}

function finding(
  severity: ReviewConsistencyFinding['severity'],
  category: ReviewConsistencyCategory,
  message: string,
  evidence: string[],
  suggestion: string,
): ReviewConsistencyFinding {
  return { severity, category, message, evidence, suggestion };
}

export function compareReviewConsistency(
  input: CompareReviewConsistencyInput,
): ReviewConsistencyResult {
  const { repositoryRoot, diff, plan, requestedPlanId } = input;
  const changedFiles = diff.changedFiles.map((item) => item.path);
  const testFiles = changedFiles.filter((item) => TEST_FILE.test(item));
  const implementationFiles = changedFiles.filter(isImplementationFile);
  const potentialContractChanges = changedFiles.filter((item) => CONTRACT_FILE.test(item));
  const declaredPaths = plan
    ? [...collectDeclaredPaths(repositoryRoot, plan.declaredScope)].sort()
    : [];
  const expectedArtifacts = plan ? collectExpectedArtifacts(repositoryRoot, plan) : [];
  const outOfScopeFiles = declaredPaths.length > 0
    ? changedFiles.filter((item) => !inDeclaredScope(item, declaredPaths))
    : [];
  const missingArtifacts = expectedArtifacts.filter(
    (artifact) => !exactArtifactExists(repositoryRoot, artifact),
  );
  const hasTestEvidence = plan ? testEvidencePresent(plan) : false;
  const activeArchitectureCandidates = plan
    ? plan.architectureCandidates.filter((item) => item.status !== 'rejected')
    : [];
  const architectureReviewRequired = activeArchitectureCandidates.length > 0
    || potentialContractChanges.length > 0;
  const architectureReviewSatisfied = plan ? architectureSatisfied(plan) : false;
  const revisionMatches = plan?.lastVerifiedRevision && diff.currentRevision
    ? plan.lastVerifiedRevision === diff.currentRevision
    : null;
  const findings: ReviewConsistencyFinding[] = [];

  if (requestedPlanId && !plan) {
    findings.push(finding(
      'high',
      'evidence',
      `未找到请求的 Plan 状态：${requestedPlanId}`,
      [`project_root=${repositoryRoot}`],
      '确认 plan_id 和 project_root，先调用 resume_plan 或建立 Plan 状态后再审查。',
    ));
  }
  if (outOfScopeFiles.length > 0) {
    findings.push(finding(
      'high',
      'scope',
      '真实变更超出 Plan 明确声明的文件/目录范围。',
      outOfScopeFiles,
      '逐项确认越界变更是否必要；必要时更新 declaredScope 和影响分析，否则回退这些变更。',
    ));
  }
  if (plan && declaredPaths.length === 0 && changedFiles.length > 0) {
    findings.push(finding(
      'low',
      'scope',
      'Plan 未声明可进行文件级核验的路径范围。',
      [`changedFiles=${changedFiles.length}`],
      '后续托管代码任务在 declaredScope 中加入 files/paths/modules 等可审计范围。',
    ));
  }
  if (missingArtifacts.length > 0) {
    findings.push(finding(
      'medium',
      'artifact',
      'Plan 声明的部分确定性产物在当前工作区不存在。',
      missingArtifacts,
      '核实产物是否尚未生成、路径是否已变更，或从 Plan 中删除不再适用的输出。',
    ));
  }
  if (implementationFiles.length > 0 && testFiles.length === 0 && !hasTestEvidence) {
    findings.push(finding(
      'high',
      'test',
      '存在实现或配置变更，但没有测试文件变化，也没有 Plan 中的真实测试证据。',
      implementationFiles,
      '运行受影响测试并将命令、退出码和结果写入 Plan；必要时补回归测试。',
    ));
  }
  if (potentialContractChanges.length > 0) {
    findings.push(finding(
      'medium',
      'contract',
      '检测到可能影响公共契约、Schema、迁移、协议或发布配置的文件。',
      potentialContractChanges,
      '核对消费者、兼容策略、迁移/回滚、文档和相应测试，不得仅按普通内部重构处理。',
    ));
  }
  if (architectureReviewRequired && !architectureReviewSatisfied) {
    findings.push(finding(
      'high',
      'architecture',
      '当前变更需要架构 validate/drift 证据，但 Plan 中尚未找到已通过的结果。',
      [
        ...activeArchitectureCandidates.map((item) => `candidate:${item.id}`),
        ...potentialContractChanges,
      ],
      '调用 architecture mode=drift/validate，对照已确认设计和真实 diff，并将结果写入 Plan。',
    ));
  }
  if (revisionMatches === false && plan?.lastVerifiedRevision && diff.currentRevision) {
    findings.push(finding(
      'high',
      'revision',
      'Plan 最近验证 revision 与当前 HEAD 不一致，既有验证证据可能已经过期。',
      [`verified=${plan.lastVerifiedRevision}`, `current=${diff.currentRevision}`],
      '在当前 revision 重新运行测试、审查和必要验收，再更新 lastVerifiedRevision。',
    ));
  }
  if (changedFiles.length === 0) {
    findings.push(finding(
      'low',
      'evidence',
      '当前 Git 证据中没有可审查的已跟踪变更。',
      diff.untrackedFiles.length > 0 ? diff.untrackedFiles : ['git diff is empty'],
      '确认 diff_mode/ref 范围；未跟踪文件需由 Agent显式读取，不能仅凭文件名完成审查。',
    ));
  }

  return {
    ...(plan ? { planId: plan.planId } : requestedPlanId ? { planId: requestedPlanId } : {}),
    planLoaded: Boolean(plan),
    declaredPaths,
    expectedArtifacts,
    changedFiles,
    outOfScopeFiles,
    missingArtifacts,
    implementationFiles,
    testFiles,
    potentialContractChanges,
    testEvidencePresent: hasTestEvidence,
    architectureReviewRequired,
    architectureReviewSatisfied,
    revisionMatches,
    findings,
  };
}
