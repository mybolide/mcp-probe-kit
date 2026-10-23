import { describe, it, expect } from "vitest";
import { manifestSubjectHash, reviewArtifactChange, reviewManifest,
  type GovernedArtifactManifest } from "../governed-artifacts.js";

const sample: GovernedArtifactManifest = {
  id: "db:business-schema",
  guardRoots:["db/migrations"],
  files:[{path:"db/migrations/0001.sql",sha256:"f".repeat(64)}],
  rationale:"Freeze versioned architecture and require approval for every future migration, constraint or index change.",
  sourceRefs:["docs/architecture/database-adr.md","task:ARCH-123"],
};

describe("generic governed artifacts",()=>{
  it("hashes the whole manifest and the previous baseline identity",()=>{
    const hash=manifestSubjectHash(sample,0,"");
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(manifestSubjectHash({...sample,files:[{...sample.files[0],sha256:"a".repeat(64)}]},
      0,"")).not.toBe(hash);
    expect(manifestSubjectHash(sample,1,hash)).not.toBe(hash);
    expect(reviewManifest(sample)).toEqual([]);
  });
  it("rejects traversal, unguarded paths and overlapping directories",()=>{
    expect(reviewManifest({...sample,files:[{path:"../outside.sql",sha256:"f".repeat(64)}]}))
      .not.toEqual([]);
    expect(reviewManifest({...sample,files:[{path:"db/other.sql",sha256:"f".repeat(64)}]}))
      .not.toEqual([]);
    expect(reviewManifest({...sample,guardRoots:["db","db/migrations"]})).not.toEqual([]);
    expect(reviewManifest({...sample,files:[sample.files[0],sample.files[0]]})).not.toEqual([]);
  });
  it("never treats proposer or a stale review hash as independent approval",()=>{
    const expectedHash=manifestSubjectHash(sample,0,"");
    const review={reviewer:"second-review-agent",method:"independent-agent-pass" as const,
      subjectHash:expectedHash,
      scopeAssessment:"The documented schema file set is narrow, and every approved file has an exact source hash.",
      dependencyAssessment:"This release contract requires the separate review of migrations before dependent feature execution.",
      securityAndTestAssessment:"Require empty database, replay, rollback, role isolation and historical deletion tests on an isolated server.",
      sourceRefs:sample.sourceRefs};
    expect(reviewArtifactChange(review,"first-agent",expectedHash,sample.sourceRefs)).toEqual([]);
    expect(reviewArtifactChange({...review,reviewer:"first-agent"},"first-agent",
      expectedHash,sample.sourceRefs)).not.toEqual([]);
    expect(reviewArtifactChange({...review,subjectHash:"0".repeat(64)},"first-agent",
      expectedHash,sample.sourceRefs)).not.toEqual([]);
    expect(reviewArtifactChange({...review,sourceRefs:["invented:no-source"]},"first-agent",
      expectedHash,sample.sourceRefs)).not.toEqual([]);
  });
});
