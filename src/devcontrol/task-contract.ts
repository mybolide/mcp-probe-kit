/**
 * Common, read-only contract projection for every approved DevControl task.
 * The frozen source snapshot is authoritative; dc_task_specs is a convenience
 * summary and must never fill missing approved contract fields.
 */
import { validGateRequirements } from './gate-policy.js';

/** The same minimum write-time contract for every NEW executable leaf,
 * independent of whether the plan is Feature or release-work. Specialized
 * profile checks may add requirements, never remove these baseline checks.
 */
export function reviewSharedTaskPlanningFields(input:Record<string,any>):string[] {
  const issues:string[]=[];
  const id=String(input?.id??'?');
  if(!/^[A-Z][A-Z0-9-]{1,39}$/.test(id))issues.push(id+': invalid shared task ID');
  if(typeof input?.title!=='string'||!input.title.trim())
    issues.push(id+': missing shared task title');
  if(typeof input?.acceptance!=='string'||input.acceptance.trim().length<8)
    issues.push(id+': missing independently verifiable acceptance');
  if(!Array.isArray(input?.requirementIds)||input.requirementIds.some((v:unknown)=>
    typeof v!=='string'||!v.trim()))
    issues.push(id+': requirementIds must be a declared list');
  const sqliteDecision=input?.requiredGates?.length===1&&input.requiredGates[0]==='sqlite_decision';
  if(!Array.isArray(input?.allowedPaths)||
      (!input.allowedPaths.length&&!sqliteDecision)||
      input.allowedPaths.some((p:unknown)=>typeof p!=='string'||
        p.startsWith('/')||p.split('/').includes('..')))
    issues.push(id+': shared task contract requires safe bounded file scope');
  if(!validGateRequirements(input?.requiredGates))
    issues.push(id+': missing declared project acceptance Gates');
  if(input?.dependsOn!==undefined&&(!Array.isArray(input.dependsOn)||
      input.dependsOn.some((v:unknown)=>typeof v!=='string'||!v.trim())))
    issues.push(id+': invalid task dependencies');
  return issues;
}
export interface TaskContractSource {
  kind: "feature" | "release-work" | "release-plan" | "legacy";
  planId: string | null;
  planHash: string | null;
  revision: number | null;
  approvedBy: string | null;
  approvedAt: string | null;
  frozen: boolean;
  qualityProfile: string | null;
}

const fields = [
  "purpose", "description", "scenario", "acceptance", "requirementIds",
  "workflow", "inputs", "outputs", "businessRules", "testCases",
  "negativeCases", "verificationEvidence", "outOfScope", "sourceRefs",
  "designRef", "preconditions", "stateTransitions", "forbiddenChanges",
  "stopConditions", "allowedChangedFiles", "deliverables", "estimatedHours",
  "granularityJustification", "type", "kind", "platform", "ownerRole",
] as const;
const listFields = new Set<string>([
  "requirementIds", "workflow", "inputs", "outputs", "businessRules",
  "testCases", "negativeCases", "verificationEvidence", "outOfScope",
  "sourceRefs", "preconditions", "stateTransitions", "forbiddenChanges",
  "stopConditions", "allowedChangedFiles", "deliverables",
]);

function meaningful(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0 &&
    value.every(entry => typeof entry === "string" && entry.trim().length > 0);
  if (typeof value === "string") return value.trim().length > 0;
  return typeof value === "number" && Number.isFinite(value);
}

export function normalizeFrozenTaskContract(
  task: Record<string, unknown>, frozenNode: Record<string, unknown> | null,
  source: TaskContractSource,
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const key of fields) {
    // Do not backfill title, scenario or generated defaults into absent fields.
    data[key] = frozenNode && Object.hasOwn(frozenNode, key) ?
      frozenNode[key] : null;
  }
  const allowedPaths = frozenNode && Object.hasOwn(frozenNode, "allowedPaths") ?
    frozenNode.allowedPaths : task.allowedPaths;
  const gates = frozenNode && Object.hasOwn(frozenNode, "requiredGates") ?
    frozenNode.requiredGates : task.requiredGates;
  const dependencies = frozenNode && Object.hasOwn(frozenNode, "dependsOn") ?
    frozenNode.dependsOn : task.dependsOn;
  return {
    taskId: task.id, title: task.title, status: task.status,
    parentId: task.parentId ?? null,
    source,
    ...data,
    allowedPaths: allowedPaths ?? null,
    requiredGates: gates ?? null,
    dependsOn: dependencies ?? null,
    missingFields: fields.filter(key => !meaningful(data[key]) &&
      (listFields.has(key) || key !== "estimatedHours")),
    authoritative: source.frozen && frozenNode !== null,
  };
}

/** Advisory audit. Never modifies approval, eligibility or Verified status. */
export function auditNormalizedTaskContract(
  contract: Record<string, any>,
): { passed: boolean; missing: string[]; issues: string[];
     applicable: boolean; retroactiveGateApplied: false } {
  const source = contract.source as TaskContractSource;
  if (!contract.authoritative) return {
    passed: false, applicable: false, retroactiveGateApplied: false,
    missing: ["approvedFrozenSnapshot"],
    issues: ["Original approved task node cannot be located; do not fabricate it from the summary"],
  };
  if (contract.kind === "group") return {
    passed: true, applicable: false, retroactiveGateApplied: false,
    missing: [], issues: [],
  };
  const common = ["acceptance", "requirementIds", "allowedPaths", "requiredGates"];
  const workType = contract.type ?? (source.kind === "feature" ? "development" : null);
  const detailed = ["development", "integration", "bugfix", "testing"].includes(workType);
  const mandatory = [...common, ...(detailed ?
    ["scenario", "workflow", "testCases", "negativeCases", "sourceRefs"] : [])];
  const missing = mandatory.filter(key => !meaningful(contract[key]));
  const issues: string[] = [];
  if (Array.isArray(contract.allowedChangedFiles) &&
      contract.allowedChangedFiles.length > 0 &&
      !Array.isArray(contract.allowedPaths))
    issues.push("Exact allowedChangedFiles exists without a file-scope list");
  return {
    passed: missing.length === 0 && issues.length === 0,
    applicable: true, retroactiveGateApplied: false, missing, issues,
  };
}
