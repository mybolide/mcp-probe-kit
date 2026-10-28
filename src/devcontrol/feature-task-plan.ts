/**
 * start_feature -> DevControl native task planning contract.
 * Plans are scoped to a single SQLite Feature, not an entire Git release.
 * The planning Agent authors the nodes; DevControl reviews their evidence.
 */
import { reviewReleasePlan, type ReleasePlanNode } from "./release-plan.js";
import { canonicalRequirementId } from './requirement-ids.js';
import { reviewAtomicOutcome } from './task-atomicity.js';

export interface FeatureTaskPlan {
  release: string;
  rationale: string;
  nodes: ReleasePlanNode[];
}

export interface FeatureTaskSource {
  name: string;
  revision: number;
  hash: string;
  status: string;
  layout: string;
  requirements: string[];
  subspecs: { id: string; fr?: string[]; dependsOn?: string[] }[];
}

const generic = /\b(?:TODO|TBD|placeholder|fill in|to be decided)\b|(?:待填写|待确认|稍后补充|根据实际情况|具体实现待定)/i;

export function reviewFeatureTaskPlan(source: FeatureTaskSource,
  proposal: FeatureTaskPlan, approvedExternalDependencies: ReadonlySet<string> = new Set()):
  { passed: boolean; issues: string[]; leafCount: number;
    coveredRequirements: string[]; uncoveredRequirements: string[] } {
  const nodes = Array.isArray(proposal?.nodes) ? proposal.nodes : [];
  const baseline = reviewReleasePlan({
    release: proposal?.release, rationale: proposal?.rationale,
    nodes, requirementIds: source.requirements, baseRevision: 0,
    scopeSource: "docs/product/requirements.md", qualityProfile: "spec-depth-v3",
  }, { approvedExternalDependencies });
  const issues = [...baseline.issues];
  if (source.status !== "specified") issues.push("Validate start_feature requirements/design/tasks before planning");
  if (!source.requirements.length) issues.push("Feature has no canonical FR/NFR identifiers");
  if (!nodes.some(n => n.kind === "leaf")) issues.push("At least one independent development leaf is required");
  if (nodes.length > 1000) issues.push("Feature task tree exceeds 1000 nodes: split into reviewed Feature batches");
  const leaves = nodes.filter(n => n.kind === "leaf");
  if (nodes.some(n => n.existing)) {
    issues.push("Feature task planning cannot use the legacy existing=true shortcut");
  }
  const design = `feature:${source.name}#design`;
  const reqRef = `feature:${source.name}#requirements`;
  for (const leaf of leaves) {
    issues.push(...reviewAtomicOutcome({id:leaf.id,title:leaf.title,
      acceptance:leaf.acceptance,estimatedHours:leaf.estimatedHours,maxHours:4}));
    if(!leaf.allowedChangedFiles?.length)
      issues.push(leaf.id+": leaf needs exact frozen file boundaries");
    if(!leaf.testCases?.length||!leaf.negativeCases?.length)
      issues.push(leaf.id+": leaf needs positive and failure test cases for its single outcome");
    if(!leaf.outOfScope?.length||!leaf.stopConditions?.length)
      issues.push(leaf.id+": specify non-goals and stop conditions so Agent cannot expand scope");
    if (leaf.designRef !== design) issues.push(`${leaf.id}: must reference reviewed SQLite feature design`);
    if (!leaf.sourceRefs?.includes(reqRef)) issues.push(`${leaf.id}: missing Feature requirement provenance`);
    if (leaf.openQuestions?.length) issues.push(`${leaf.id}: unresolved design decisions block approval`);
    const strings = [leaf.scenario, leaf.acceptance, leaf.designRef,
      ...(leaf.workflow ?? []), ...(leaf.businessRules ?? []), ...(leaf.testCases ?? []),
      ...(leaf.negativeCases ?? []), ...(leaf.inputs ?? []), ...(leaf.outputs ?? []),
      ...(leaf.preconditions ?? []), ...(leaf.stateTransitions ?? []),
      ...(leaf.stopConditions ?? []), ...(leaf.verificationEvidence ?? [])]
      .filter((value): value is string => typeof value === "string");
    if (strings.some(value => generic.test(value))) {
      issues.push(`${leaf.id}: unresolved placeholders or generic implementation instructions`);
    }
    for (const [field, values] of [
      ["workflow", leaf.workflow], ["businessRules",leaf.businessRules],
      ["testCases",leaf.testCases], ["negativeCases",leaf.negativeCases],
    ] as const) {
      if (Array.isArray(values) && new Set(values.map(value => value.trim().toLowerCase())).size !== values.length) {
        issues.push(`${leaf.id}: duplicate ${field} entries do not count as independent coverage`);
      }
    }
  }
  for (const sub of source.subspecs) {
    if (typeof sub?.id !== "string" || !sub.id.trim()) {
      issues.push("Invalid start_feature child specification identifier");continue;
    }
    const related = leaves.filter(n => n.sourceRefs?.includes(`feature:${source.name}#subspec:${sub.id}`));
    if (!related.length) issues.push(`Uncovered start_feature subspec: ${sub.id}`);
    for (const req of sub.fr ?? []) if (!related.some(n =>
      n.requirementIds?.some(id => canonicalRequirementId(id) === canonicalRequirementId(req)))) {
      issues.push(`Subspec ${sub.id} has no leaf implementing ${req}`);
    }
    // If a subspec depends on another one, its implementing leaves must have
    // a concrete task dependency on at least one upstream leaf.
    for (const upstream of sub.dependsOn ?? []) {
      const providers = leaves.filter(n => n.sourceRefs?.includes(`feature:${source.name}#subspec:${upstream}`));
      if (!providers.length || !related.some(n => n.dependsOn?.some(id => providers.some(p => p.id === id)))) {
        issues.push(`Subspec ${sub.id} lacks an executable dependency on ${upstream}`);
      }
    }
  }
  if (source.layout === "parent-child" && !nodes.some(n => n.kind === "group")) {
    issues.push("Parent-child start_feature requires grouped task hierarchy");
  }
  return { passed: issues.length === 0, issues, leafCount: leaves.length,
    coveredRequirements: baseline.coveredRequirements,
    uncoveredRequirements: baseline.uncoveredRequirements };
}
