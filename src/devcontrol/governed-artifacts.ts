/**
 * Cross-project frozen artifacts (database schemas, protocol contracts,
 * security policies, etc.). DevControl owns the approval trail; filesystem
 * checks never infer Owner authorization from an edited document.
 */
import { createHash } from "node:crypto";

export interface GovernedArtifactManifest {
  id: string;
  guardRoots: string[];
  files: { path: string; sha256: string }[];
  rationale: string;
  sourceRefs: string[];
}

export interface GovernedArtifactReview {
  reviewer: string;
  method: "independent-agent-pass";
  subjectHash: string;
  scopeAssessment: string;
  dependencyAssessment: string;
  securityAndTestAssessment: string;
  sourceRefs: string[];
}

const sha = /^[0-9a-f]{64}$/;
const safePath = (p: unknown): p is string =>
  typeof p === "string" && p.length > 0 && p.length <= 240 &&
  /^[a-zA-Z0-9_.\-/]+$/.test(p) &&
  !p.startsWith("/") && !p.includes("//") &&
  !p.split("/").some(part => !part || part === "." || part === ".." ||
    part === ".git" || part === ".neyna" || part === ".mcp-probe-kit");
const explanation = (p: unknown, min = 35) =>
  typeof p === "string" && p.trim().length >= min && p.length < 8_000;

export function reviewManifest(input: GovernedArtifactManifest): string[] {
  const issues: string[] = [];
  if (!input || typeof input.id !== "string" ||
    !/^[a-z][a-z0-9_.:-]{2,79}$/.test(input.id)) {
    return ["A stable project-neutral artifact ID is required"];
  }
  if (!Array.isArray(input.guardRoots) || !input.guardRoots.length ||
    input.guardRoots.length > 10 ||
    input.guardRoots.some(root => !safePath(root)) ||
    new Set(input.guardRoots).size !== input.guardRoots.length)
    issues.push("1–10 unique, safe project-relative governed directories required");
  if (!Array.isArray(input.files) || !input.files.length || input.files.length > 200 ||
    input.files.some(file => !file || !safePath(file.path) || !sha.test(file.sha256)) ||
    new Set(input.files.map(f => f?.path)).size !== input.files.length)
    issues.push("1–200 unique paths with exact SHA-256 hashes required");
  if (!issues.length) {
    for (const file of input.files) {
      if (!input.guardRoots.some(root => file.path.startsWith(root + "/")))
        issues.push(file.path + ": outside declared guarded directories");
    }
    for (let i = 0; i < input.guardRoots.length; i++) {
      if (input.guardRoots.some((r,j) => i !== j &&
          (r.startsWith(input.guardRoots[i] + "/") ||
          input.guardRoots[i].startsWith(r + "/"))))
        issues.push("Guard directories must not overlap");
    }
  }
  if (!explanation(input.rationale))issues.push("Reasoned artifact baseline/change rationale required");
  if (!Array.isArray(input.sourceRefs) || !input.sourceRefs.length ||
    input.sourceRefs.some(ref => !explanation(ref, 5)))
    issues.push("Real source references must justify this baseline");
  return issues;
}

export function manifestSubjectHash(input: GovernedArtifactManifest,
  baseRevision: number, baseHash: string): string {
  return createHash("sha256").update(JSON.stringify({
    baseRevision,baseHash,manifest:input,
  })).digest("hex");
}

export function reviewArtifactChange(review: GovernedArtifactReview,
  proposedBy: string, subjectHash: string, refs: string[]): string[] {
  const issues: string[] = [];
  if (!review || review.method !== "independent-agent-pass" ||
    !explanation(review.reviewer, 3) || review.reviewer === proposedBy)
    issues.push("A different independent reviewer label is required");
  if (review?.subjectHash !== subjectHash)
    issues.push("Review must bind the exact proposed baseline/change hash");
  for (const field of ["scopeAssessment","dependencyAssessment","securityAndTestAssessment"] as const) {
    if (!explanation(review?.[field], 50))
      issues.push(field + " must contain concrete analysis, not filler");
  }
  if (!Array.isArray(review?.sourceRefs) ||
    !review.sourceRefs.some(ref => refs.includes(ref)))
    issues.push("Independent review must cite at least one underlying proposal source");
  return issues;
}

export function artifactIsCovered(path: string, roots: string[]): boolean {
  return roots.some(root => path.startsWith(root + "/"));
}
