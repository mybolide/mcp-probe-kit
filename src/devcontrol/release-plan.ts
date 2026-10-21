/**
 * Frozen release scope: high-detail Spec parity rather than a flat task list.
 * This module only validates proposals; transactionality and authorization
 * live in the project-local SQLite ledger.
 */
export interface ReleasePlanNode {
  id: string;
  title: string;
  kind: "group" | "leaf";
  parentId?: string;
  dependsOn?: string[];
  requirementIds?: string[];
  acceptance?: string;
  /** Real user/system trigger and observable business outcome, not a task title. */
  scenario?: string;
  /** Ordered domain actions and state/ownership transitions. */
  workflow?: string[];
  businessRules?: string[];
  /** Stable references to committed specifications and relevant test cases. */
  sourceRefs?: string[];
  /** Explain what is already decided and what is expressly NOT decided. */
  reviewNotes?: string[];
  openQuestions?: string[];
  verificationEvidence?: string[];
  /** v3: frozen execution contract — no design choices left to a coder. */
  inputs?: string[];
  outputs?: string[];
  preconditions?: string[];
  stateTransitions?: string[];
  forbiddenChanges?: string[];
  stopConditions?: string[];
  /** Exact tracked files allowed to change (in addition to existing path rules). */
  allowedChangedFiles?: string[];
  designRef?: string;
  negativeCases?: string[];
  testCases?: string[];
  outOfScope?: string[];
  deliverables?: string[];
  estimatedHours?: number;
  allowedPaths?: string[];
  requiredGates?: string[];
  /** Existing approved or verified tasks are referenced, NEVER rewritten. */
  existing?: boolean;
}

export interface ReleasePlanProposal {
  release: string;
  scopeSource: string;
  requirementIds: string[];
  nodes: ReleasePlanNode[];
  rationale: string;
  /** The frozen plan revision this change is based on; 0 for a new release. */
  baseRevision: number;
  qualityProfile?: "spec-depth-v2" | "spec-depth-v3";
}

export interface PlanReview {
  passed: boolean;
  issues: string[];
  total: number;
  leafCount: number;
  groupCount: number;
  coveredRequirements: string[];
  uncoveredRequirements: string[];
}

const stableId = /^[A-Z][A-Z0-9-]{1,39}$/;
const requirementId = /^(?:FR|NFR)-\d{3,}$/;
const allowedGates = new Set([
  "docs", "go_contract", "devcontrol_tests", "go_http_integration",
  "flutter_test", "ios_device_e2e", "v01_release_e2e",
]);
const unfilled = /\[(?:填写|待补)|\b(?:TODO|TBD)\b/i;

export function reviewReleasePlan(plan: ReleasePlanProposal): PlanReview {
  const issues: string[] = [];
  const nodes = Array.isArray(plan?.nodes) ? plan.nodes : [];
  const requirements = Array.isArray(plan?.requirementIds) ? plan.requirementIds : [];
  if (!plan || typeof plan.release !== "string" ||
      !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,39}$/.test(plan.release)) issues.push("Invalid release");
  if (!Number.isSafeInteger(plan?.baseRevision) || plan.baseRevision < 0) {
    issues.push("baseRevision must be an exact nonnegative revision");
  }
  if (typeof plan?.scopeSource !== "string" ||
      !/^docs\/[^/]+(?:\/[^/]+)*\.md$/.test(plan.scopeSource) ||
      plan.scopeSource.split("/").includes("..")) issues.push("Canonical Git scopeSource required");
  if (typeof plan?.rationale !== "string" || plan.rationale.trim().length < 25) {
    issues.push("Explain full-version coverage, non-goals and change rationale");
  }
  if (!requirements.length || new Set(requirements).size !== requirements.length ||
      requirements.some(x => typeof x !== "string" || !requirementId.test(x))) {
    issues.push("Unique FR/NFR coverage IDs required");
  }
  if (!nodes.length || nodes.length > 1000) issues.push("Full release tree requires 1..1000 nodes");
  const byId = new Map<string, ReleasePlanNode>();
  const coverage = new Set<string>();
  for (const item of nodes) {
    if (!item || typeof item.id !== "string" || !stableId.test(item.id) || byId.has(item.id)) {
      issues.push("Missing, invalid or duplicate task ID " + (item?.id ?? "?"));
      continue;
    }
    if (item.dependsOn !== undefined && (!Array.isArray(item.dependsOn) ||
        item.dependsOn.some(x => typeof x !== "string"))) {
      issues.push(item.id + ": dependency IDs must be an array of strings");
    }
    byId.set(item.id, item);
    if (typeof item.title !== "string" || !item.title.trim()) issues.push(item.id + ": title missing");
    if (item.kind !== "leaf" && item.kind !== "group") issues.push(item.id + ": invalid kind");
    if (item.kind === "leaf") {
      if (!Array.isArray(item.requirementIds) || !item.requirementIds.length ||
          item.requirementIds.some(id => !requirements.includes(id))) {
        issues.push(item.id + ": link every leaf to in-scope FR/NFR");
      } else for (const id of item.requirementIds) coverage.add(id);
      // Smallness is an upper bound, not a surrogate for acceptance quality.
      if (!item.existing) {
        if (plan.qualityProfile === "spec-depth-v2" || plan.qualityProfile === "spec-depth-v3") {
          if (typeof item.scenario !== "string" || item.scenario.trim().length < 32) {
            issues.push(item.id + ": specific user/system trigger and outcome missing");
          }
          for (const [name,values,min] of [
            ["workflow",item.workflow,3],["businessRules",item.businessRules,2],
            ["sourceRefs",item.sourceRefs,2],["reviewNotes",item.reviewNotes,1],
            ["verificationEvidence",item.verificationEvidence,2],
            ["testCases",item.testCases,2],["negativeCases",item.negativeCases,2],
          ] as const) {
            if (!Array.isArray(values) || values.length < min ||
                values.some(x => typeof x !== "string" || x.trim().length < 12)) {
              issues.push(item.id + ": specific " + name + " requires at least " + min + " substantive entries");
            }
          }
          if (item.openQuestions !== undefined && (!Array.isArray(item.openQuestions) ||
              item.openQuestions.some(x => typeof x !== "string" || !x.trim()))) {
            issues.push(item.id + ": openQuestions must be string array");
          }
        }
        if(plan.qualityProfile==="spec-depth-v3"){
          for(const [name,values] of [
            ["inputs",item.inputs],["outputs",item.outputs],
            ["preconditions",item.preconditions],["stateTransitions",item.stateTransitions],
            ["forbiddenChanges",item.forbiddenChanges],["stopConditions",item.stopConditions],
          ] as const){
            if(!Array.isArray(values)||!values.length||
               values.some(value=>typeof value!=="string"||value.trim().length<15||unfilled.test(value))){
              issues.push(item.id+": v3 requires concrete "+name);
            }
          }
          const exact=item.allowedChangedFiles;
          if(!Array.isArray(exact)||!exact.length||
             new Set(exact).size!==exact.length||
             exact.some(f=>typeof f!=="string"||!f||f.startsWith("/")||
               f.includes("\\")||f.split("/").includes("..")||f.includes("*")||
               !(item.allowedPaths??[]).some(p=>p.endsWith("/**")?
                 f.startsWith(p.slice(0,-3)+"/"):f===p))){
            issues.push(item.id+": v3 exact allowedChangedFiles must be within task allowedPaths");
          }
        }
        if (typeof item.estimatedHours !== "number" ||
            !Number.isFinite(item.estimatedHours) ||
            item.estimatedHours <= 0 || item.estimatedHours > 8) {
          issues.push(item.id + ": split work over one estimated workday (0 < hours <= 8)");
        }
        if (typeof item.acceptance !== "string" || item.acceptance.trim().length < 25) {
          issues.push(item.id + ": independently testable acceptance required");
        }
        if (typeof item.designRef !== "string" || item.designRef.trim().length < 8) {
          issues.push(item.id + ": reviewed design/contract reference required");
        }
        if (!Array.isArray(item.testCases) || !item.testCases.length ||
            item.testCases.some(x => typeof x !== "string" || x.trim().length < 8)) {
          issues.push(item.id + ": concrete positive test case required");
        }
        if (!Array.isArray(item.negativeCases) || !item.negativeCases.length ||
            item.negativeCases.some(x => typeof x !== "string" || !x.trim())) {
          issues.push(item.id + ": negative / failure case required");
        }
        if (!Array.isArray(item.deliverables) || !item.deliverables.length ||
            item.deliverables.some(x => typeof x !== "string" || !x.trim())) {
          issues.push(item.id + ": exact deliverables required");
        }
        if (!Array.isArray(item.allowedPaths) || !item.allowedPaths.length ||
            item.allowedPaths.some(x => typeof x !== "string" || !x ||
              x.startsWith("/") || x.includes("\\") || x.split("/").includes(".."))) {
          issues.push(item.id + ": safe bounded file scopes required");
        }
        if (!Array.isArray(item.requiredGates) || !item.requiredGates.length ||
            item.requiredGates.some(x => !allowedGates.has(x))) {
          issues.push(item.id + ": executable acceptance Gate required");
        }
        const text = [
          item.title, item.acceptance, item.designRef,
          ...(item.testCases ?? []), ...(item.negativeCases ?? []),
          ...(item.deliverables ?? []),
        ].filter((x):x is string=>typeof x === "string").join("\n");
        if (unfilled.test(text)) issues.push(item.id + ": template placeholders are forbidden");
      }
    }
  }
  const graph = new Map<string, string[]>();
  for (const node of byId.values()) {
    if (node.parentId && (!byId.has(node.parentId) ||
        byId.get(node.parentId)?.kind !== "group")) {
      issues.push(node.id + ": parent must be a group in this full plan");
    }
    if (node.kind === "group" && !nodes.some(other => other.parentId === node.id)) {
      issues.push(node.id + ": group has no child tasks");
    }
    const edges = [
      ...(Array.isArray(node.dependsOn) ? node.dependsOn : []),
      ...(node.parentId ? [node.parentId] : []),
    ];
    for (const dep of edges) if (dep === node.id || !byId.has(dep)) {
      issues.push(node.id + ": missing or self-referential dependency/parent " + dep);
    }
    graph.set(node.id, edges.filter(dep => byId.has(dep)));
  }
  const visited = new Set<string>(), visiting = new Set<string>();
  const dfs = (id: string): void => {
    if (visiting.has(id)) { issues.push("Cycle at " + id); return; }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dep of graph.get(id) ?? []) dfs(dep);
    visiting.delete(id); visited.add(id);
  };
  for (const id of byId.keys()) dfs(id);
  const uncovered = requirements.filter(id => !coverage.has(id));
  if (uncovered.length) issues.push("Uncovered requirements: " + uncovered.join(", "));
  return {
    passed: issues.length === 0, issues, total: nodes.length,
    leafCount: nodes.filter(x => x.kind === "leaf").length,
    groupCount: nodes.filter(x => x.kind === "group").length,
    coveredRequirements: [...coverage].sort(), uncoveredRequirements: uncovered,
  };
}
