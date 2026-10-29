import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import http from "node:http";
import vm from "node:vm";
import { ProjectTaskLedger, DevControlError } from "../task-ledger.js";
import { ensureMcpProbeSkill, ensureAgentsMdSkillReference } from "../../lib/workflow-skill-installer.js";
import { MCP_PROBE_SKILL_REL_PATH } from "../../lib/workflow-skill-template.js";
import { releaseReviewSubjectHash, REVIEW_DIMENSIONS } from "../release-work.js";
import { IDEA_REVIEW_DIMENSIONS } from "../idea-review.js";
import { createDevControlBoardServer, WORKSPACE_SCHEMA_VERSION } from "../board-server.js";
import { projectContext, readProjectDoc, safeProjectDocument } from "../project-catalog.js";
import { projectHtml } from "../project-html.js";
import { bootstrapHistorySession, checkpointHistorySession } from "../../lib/history-session/index.js";

let root = "";
let ledger: ProjectTaskLedger | null = null;

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

/** Explicitly simulate two separate, auditable roles in a fixture project.
 * This helper only records a review decision; it never executes project tests.
 */
function recordAcceptanceReview(id:string,token:string,gate='docs',reference?:string):void {
  const history=ledger!.trace(id);
  const completionHead=history.completion?.git_head;
  const evidence=history.evidence.find((row:any)=>row.git_head===completionHead&&
    (!reference||row.reference===reference));
  if(!evidence)throw Error('Fixture must report genuine test evidence before independent review');
  const runner=ledger!.next().activeLease?.agent;
  if(!runner)throw Error('Fixture must retain its developer lease');
  ledger!.reviewExternalGate(id,token,{
    gate,runner,reviewer:'separate-acceptance-reviewer',outcome:'passed',
    evidenceReference:evidence.reference,
    reviewNotes:'The independent fixture reviewer checked reported acceptance evidence and bound commit identity.',
  });
}
function save(file: string, content: string): void {
  const absolute = path.join(root, file);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content);
}
function commit(message = "change"): void {
  git("add", "-A");
  git("-c", "user.name=Fixture", "-c", "user.email=test@example.invalid",
    "commit", "-qm", message);
}
function create(options: Partial<{
  id: string; title: string; parentId: string; dependsOn: string[];
  allowedPaths: string[]; requiredGates: string[]; specId: string;
}> = {}) {
  return ledger!.create({
    id: "NEYNA-200", title: "Contract", allowedPaths: ["tests/contracts/**"],
    requiredGates: ["docs"], ...options,
  }, "agent-proposal");
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "probe-devcontrol-"));
  git("init", "-q");
  save(".gitignore", ".neyna/state/\n");
  save("scripts/validate_docs.py", "print('documentation checks ok')\n");
  save("README.md", "fixture\n");
  save(".neyna/devcontrol-plan.json", JSON.stringify({
    schema_version: 1, project_id: "neyna", phase: "0-to-1", focus_task: "F1",
    tasks: [
      { id: "F0", title: "Environment", release: "V0.1", track: "product",
        allowed_paths: ["docs/**"], required_gates: ["docs"], depends_on: [],
        bootstrap: { status: "verified", evidence: "environment checked" } },
      { id: "F1", title: "API contract", release: "V0.1", track: "product",
        allowed_paths: ["tests/contracts/**"], required_gates: ["docs"], depends_on: ["F0"] },
      { id: "F2", title: "Core", release: "V0.1", track: "product",
        allowed_paths: ["services/core/**"], required_gates: ["docs"], depends_on: ["F1"] },
    ],
  }));
  commit("legacy baseline");
  // Simulate Python v0.1 local DB migration, including an existing verified task.
  const require = createRequire(import.meta.url);
  const { DatabaseSync } = require("node:sqlite") as {
    DatabaseSync: new (file: string) => {
      exec(sql: string): void; close(): void;
      prepare(sql: string): { run(...args: any[]): unknown };
    };
  };
  fs.mkdirSync(path.join(root, ".neyna/state"), { recursive: true });
  const db = new DatabaseSync(path.join(root, ".neyna/state/devcontrol.sqlite3"));
  db.exec("CREATE TABLE task_state(task_id TEXT PRIMARY KEY,status TEXT,verified_at TEXT);");
  db.prepare("INSERT INTO task_state VALUES(?,?,?)").run("F0", "verified", "2026-10-19T00:00:00Z");
  db.prepare("INSERT INTO task_state VALUES(?,?,?)").run("F1", "planned", null);
  db.prepare("INSERT INTO task_state VALUES(?,?,?)").run("F2", "planned", null);
  db.close();
  ledger = new ProjectTaskLedger(root);
});

afterEach(() => {
  ledger?.close();
  ledger = null;
  fs.rmSync(root, { recursive: true, force: true });
});

describe("project ledger and legacy migration", () => {
  it('allows one responsible Agent to review its own actual tests without a second Agent',()=>{
    create({id:'NEYNA-200',requiredGates:['ios_device_e2e']});
    ledger!.approve('NEYNA-200','owner');
    const claim=ledger!.claim('NEYNA-200','single-development-agent');
    save('tests/contracts/recorded-evidence.json','{"source":"real"}');
    commit('committed approved acceptance scope');
    const head=git('rev-parse','HEAD');
    const reference='Real actual project test receipt checked against source at exact commit';
    ledger!.report('NEYNA-200',claim.leaseToken,{kind:'ios_device_test',reference},true);
    ledger!.complete('NEYNA-200',claim.leaseToken,{
      summary:'Delivered the committed project acceptance fixture',
      implementation:'Implemented only the frozen approved contract file',
      verification:'Project-owned test proof submitted; acceptance review separately recorded',
    });
    expect(ledger!.taskClosureStatus('NEYNA-200').nextAction).toBe('self-review');
    expect(()=>ledger!.reviewOwnTask('NEYNA-200','invalid-token',{
      outcome:'passed',findings:'Individually checked code scope and the real test receipt tied to the committed source.',
      evidenceReference:reference,
    })).toThrow(/lease/i);
    expect(()=>ledger!.reviewOwnTask('NEYNA-200',claim.leaseToken,{
      outcome:'passed',findings:'Individually checked code scope and the real test receipt tied to the committed source.',
      evidenceReference:'Not a reported result',
    })).toThrow(/evidence/i);
    expect(ledger!.verify('NEYNA-200',claim.leaseToken).passed).toBe(false);
    const first=ledger!.reviewOwnTask('NEYNA-200',claim.leaseToken,{
      outcome:'passed',findings:'Personally reviewed the exact scoped Git commit, test artifact, failure path and agreed frozen acceptance requirement with no missing scenario.',
      evidenceReference:reference,
    });
    expect(first).toMatchObject({outcome:'passed',completionHead:head,reviewMode:'developer_self_review'});
    expect(ledger!.taskClosureStatus('NEYNA-200').nextAction).toBe('gate-review');
    expect(ledger!.verify('NEYNA-200',claim.leaseToken).passed).toBe(false);
    expect(()=>ledger!.reviewExternalGate('NEYNA-200',claim.leaseToken,{
      gate:'ios_device_e2e',runner:'single-development-agent',reviewer:'single-development-agent',
      outcome:'passed',evidenceReference:reference,
      reviewNotes:'The required real project test was read and verified against accepted behavior.',
    })).toThrow(/review/i);
    ledger!.reviewExternalGate('NEYNA-200',claim.leaseToken,{
      gate:'ios_device_e2e',runner:'single-development-agent',reviewer:'single-development-agent',
      reviewMode:'self',outcome:'passed',evidenceReference:reference,
      reviewNotes:'Read the complete real project test output, confirmed its commit, inspected source correctness and failure coverage against frozen criteria.',
    });
    expect(ledger!.verify('NEYNA-200',claim.leaseToken)).toMatchObject({passed:true});
    expect(ledger!.get('NEYNA-200').status).toBe('verified');
    expect(ledger!.trace('NEYNA-200').audit.map((event:any)=>event.event))
      .toContain('developer_task_self_reviewed');
  });
  it('replaces an unreviewed optional handoff without inventing another reviewer',()=>{
    create({id:'NEYNA-200',requiredGates:['docs']});
    ledger!.approve('NEYNA-200','owner');
    const claim=ledger!.claim('NEYNA-200','same-developer');
    save('tests/contracts/handoff-migration.json','{"approved":true}');
    commit('original approved scoped work');
    ledger!.report('NEYNA-200',claim.leaseToken,{
      kind:'docs',reference:'Project test output with 1 passed 0 failed',
    },true);
    ledger!.complete('NEYNA-200',claim.leaseToken,{
      summary:'Finished the actual frozen task',implementation:'Submitted committed scope',
      verification:'Evidence requires substantive acceptance review',
    });
    const handoff=ledger!.handoffReview('NEYNA-200',{
      leaseToken:claim.leaseToken,actor:'same-developer',
      reason:'Original handoff was issued before the Owner explicitly removed the second Agent requirement',
    });
    expect(ledger!.taskClosureStatus('NEYNA-200').reviewStatus).toBe('awaiting_review');
    expect(ledger!.taskClosureStatus('NEYNA-200').nextAction).toBe('self-review');
    ledger!.reviewOwnTask('NEYNA-200',claim.leaseToken,{
      outcome:'passed',findings:'Independently of implementation time, re-read the actual scoped committed changes, project test result, and expected negative behavior.',
      evidenceReference:'Project test output with 1 passed 0 failed',
    });
    expect(()=>ledger!.independentTaskReview('NEYNA-200',handoff.ticket,{
      reviewer:'different-reviewer',outcome:'passed',
      findings:'A rotated old ticket cannot override the new final developer self-review decision.',
      evidenceReference:'Project test output with 1 passed 0 failed',
    })).toThrow(/ticket/i);
    expect(()=>ledger!.reviewOwnTask('NEYNA-200',claim.leaseToken,{
      outcome:'passed',findings:'A previously decided self review must not allow replacing the exact same immutable review.',
      evidenceReference:'Project test output with 1 passed 0 failed',
    })).toThrow(/decided/i);
  });
  it('rotates an unreviewed lost review ticket with the original active developer only',()=>{
    create({id:'NEYNA-200'});ledger!.approve('NEYNA-200','owner');
    const claim=ledger!.claim('NEYNA-200','real-developer');
    save('tests/contracts/ticket-recovery.json','{"scope":"approved"}');
    commit('submit a scoped test fixture for independent review');
    ledger!.report('NEYNA-200',claim.leaseToken,{
      kind:'docs',reference:'real signed review ticket recovery fixture evidence',
    },true);
    ledger!.complete('NEYNA-200',claim.leaseToken,{
      summary:'Submitted committed contract fixture for acceptance',
      implementation:'Only approved fixture code was committed',
      verification:'Project evidence was recorded for separate review',
    });
    const first=ledger!.handoffReview('NEYNA-200',{
      leaseToken:claim.leaseToken,actor:'real-developer',
      reason:'Send exact source and test fixture to a different independent reviewer',
    });
    expect(()=>ledger!.handoffReview('NEYNA-200',{
      leaseToken:claim.leaseToken,actor:'real-developer',
      reason:'Trying to overwrite the first ticket without an explicit rotation intent',
    })).toThrow(/pending-ticket rotation/);
    expect(()=>ledger!.handoffReview('NEYNA-200',{
      leaseToken:'unauthorized-token',actor:'not-the-developer',rotatePendingTicket:true,
      reason:'A different actor must not invalidate a valid reviewer ticket',
    })).toThrow(/credential/);
    const rotated=ledger!.handoffReview('NEYNA-200',{
      leaseToken:claim.leaseToken,actor:'real-developer',rotatePendingTicket:true,
      reason:'The one-time ticket was lost before any reviewer received or used it',
    });
    expect(rotated.rotated).toBe(true);
    expect(rotated.ticket).not.toBe(first.ticket);
    expect(()=>ledger!.independentTaskReview('NEYNA-200',first.ticket,{
      reviewer:'different-independent-reviewer',outcome:'passed',
      findings:'Reviewed the exact source diff and original signed fixture evidence.',
      evidenceReference:'real signed review ticket recovery fixture evidence',
    })).toThrow(/ticket/i);
    ledger!.independentTaskReview('NEYNA-200',rotated.ticket,{
      reviewer:'different-independent-reviewer',outcome:'passed',
      findings:'The committed source and test evidence were independently inspected.',
      evidenceReference:'real signed review ticket recovery fixture evidence',
    });
    expect(()=>ledger!.handoffReview('NEYNA-200',{
      leaseToken:claim.leaseToken,actor:'real-developer',rotatePendingTicket:true,
      reason:'An approved reviewer decision must not be overwritten by a ticket rotation',
    })).toThrow(/ROTATION|reviewed|Only the original active developer/i);
    expect(ledger!.trace('NEYNA-200').audit.map((e:any)=>e.event)).toContain('review_ticket_rotated');
  });
  it('keeps iOS as an evidence requirement rather than probing devices or launching XCTest',()=>{
    create({id:'NEYNA-200',requiredGates:['ios_device_e2e']});
    ledger!.approve('NEYNA-200','owner');
    const claim=ledger!.claim('NEYNA-200','ios-implementation-agent');
    save('tests/contracts/ios-scope.json','{"delivery":"frozen"}');
    commit('bounded iOS acceptance fixture submitted by developer');
    ledger!.report('NEYNA-200',claim.leaseToken,{
      kind:'ios_physical_test_receipt',
      reference:'ci-artifact://project/ios/device-run/validated-by-project-reviewer',
    },true);
    ledger!.complete('NEYNA-200',claim.leaseToken,{
      summary:'Submitted a scoped application change and an external project-device evidence reference',
      implementation:'The committed contract fixture belongs only to this approved task',
      verification:'Device tests are performed and reviewed by the project, never by DevControl',
    });
    const handoff=ledger!.handoffReview('NEYNA-200',{
      leaseToken:claim.leaseToken,actor:'ios-implementation-agent',
      reason:'Deliver the original commit and external run evidence to an independent reviewer',
    });
    ledger!.independentTaskReview('NEYNA-200',handoff.ticket,{
      reviewer:'independent-task-reviewer',outcome:'passed',
      findings:'Inspected the scoped commit, acceptance conditions and project-provided test artifacts.',
      evidenceReference:'ci-artifact://project/ios/device-run/validated-by-project-reviewer',
    });
    expect(ledger!.verifyReviewedTask('NEYNA-200',handoff.ticket)).toMatchObject({
      passed:false,results:{ios_device_e2e:{passed:false}},
    });
    expect(ledger!.taskClosureStatus('NEYNA-200').nextAction).toBe('gate-review');
    expect(()=>ledger!.reviewExternalGate('NEYNA-200',claim.leaseToken,{
      gate:'ios_device_e2e',runner:'project-ci-runner',reviewer:'ios-implementation-agent',
      outcome:'passed',
      evidenceReference:'ci-artifact://project/ios/device-run/validated-by-project-reviewer',
      reviewNotes:'A developer cannot pretend to be the independent reviewer for their own CI run',
    })).toThrow(/reviewer|review/i);
    ledger!.reviewExternalGate('NEYNA-200',claim.leaseToken,{
      gate:'ios_device_e2e',runner:'project-ci-runner',reviewer:'independent-gate-reviewer',
      outcome:'passed',
      evidenceReference:'ci-artifact://project/ios/device-run/validated-by-project-reviewer',
      reviewNotes:'Independent Reviewer inspected the externally executed CI device results against acceptance.',
    });
    expect(ledger!.verifyReviewedTask('NEYNA-200',handoff.ticket).passed).toBe(true);
    expect(ledger!.get('NEYNA-200').status).toBe('verified');
  });
  it('protects pre-existing unrelated untracked files while an independent reviewer verifies actual committed task work',()=>{
    create({id:'NEYNA-200',requiredGates:['docs']});
    ledger!.approve('NEYNA-200','project-owner');
    save('other-project/private-notes.txt','existing unrelated project note - DO NOT DELETE\n');
    const original=fs.readFileSync(path.join(root,'other-project/private-notes.txt'));
    const claimed=ledger!.claim('NEYNA-200','implementer',600);
    save('tests/contracts/task-evidence.json','{"ready":true}');
    git('add','tests/contracts/task-evidence.json');
    git('-c','user.name=Fixture','-c','user.email=test@example.invalid',
      'commit','-qm','real scoped task implementation');
    const head=git('rev-parse','HEAD');
    ledger!.report('NEYNA-200',claimed.leaseToken,{kind:'docs_test',
      reference:'docs:verify executed with success in the fixture'},true);
    const complete=ledger!.complete('NEYNA-200',claimed.leaseToken,{
      summary:'Implemented the approved contract task and committed its scoped test fixture',
      implementation:'Only the contracts test fixture was created and committed',
      verification:'Documentation validation was actually run by the project gate',
    });
    expect(complete.preservedUncommittedFiles).toBe(1);
    const handoff=ledger!.handoffReview('NEYNA-200',{
      leaseToken:claimed.leaseToken,actor:'implementer',
      reason:'Implementation and completion evidence are ready for an independent reviewer to inspect',
    });
    expect(handoff.completionHead).toBe(head);
    expect(()=>ledger!.independentTaskReview('NEYNA-200',handoff.ticket,{
      reviewer:'implementer',outcome:'passed',
      findings:'Confirmed all required tests and verified that existing private files were untouched.',
      evidenceReference:'docs:verify executed with success in the fixture',
    })).toThrow(/Reviewer must differ/);
    const reviewed=ledger!.independentTaskReview('NEYNA-200',handoff.ticket,{
      reviewer:'independent-qa',outcome:'passed',
      findings:'Inspected the real commit and test fixture, verified the changed-file scope and preserved unrelated files.',
      evidenceReference:'docs:verify executed with success in the fixture',
    });
    expect(reviewed.outcome).toBe('passed');
    recordAcceptanceReview('NEYNA-200',claimed.leaseToken,'docs',
      'docs:verify executed with success in the fixture');
    expect(ledger!.verifyReviewedTask('NEYNA-200',handoff.ticket)).toMatchObject({
      passed:true,reviewer:'independent-qa',
    });
    expect(ledger!.get('NEYNA-200').status).toBe('verified');
    expect(ledger!.next().activeLease).toBeNull();
    expect(fs.readFileSync(path.join(root,'other-project/private-notes.txt'))).toEqual(original);
    const trace=ledger!.trace('NEYNA-200');
    expect(trace.reviewHandoff).toMatchObject({reviewer:'independent-qa',outcome:'passed'});
    expect(trace.audit.map((row:any)=>row.event)).toContain('reviewed_task_verified');
    expect(JSON.stringify(trace)).not.toContain(handoff.ticket);
  });

  it('completes a resumed external Gate review against immutable original delivery despite later unrelated commits',()=>{
    create({id:'NEYNA-200',requiredGates:['independent_acceptance']});
    create({id:'NEYNA-201',requiredGates:['docs']});
    ledger!.approve('NEYNA-200','owner');ledger!.approve('NEYNA-201','owner');
    const first=ledger!.claim('NEYNA-200','service-agent');
    save('tests/contracts/deferred-service.json','{"delivered":true}');
    commit('scoped original delivery');
    const original=git('rev-parse','HEAD');
    ledger!.report('NEYNA-200',first.leaseToken,{
      kind:'unit_test',reference:'Original unit tests executed for frozen service delivery'},true);
    ledger!.complete('NEYNA-200',first.leaseToken,{
      summary:'Submitted actual service integration code before external acceptance was available',
      implementation:'Committed an isolated contract fixture with exact frozen file scope',
      verification:'Local unit tests reported but the separately reviewed acceptance runner is pending',
    });
    ledger!.deferVerification({id:'NEYNA-200',leaseToken:first.leaseToken,
      gate:'independent_acceptance',reason:'External integration runner unavailable until next maintenance window'});
    const second=ledger!.claim('NEYNA-201','other-agent');
    save('tests/contracts/unrelated-after-deferral.json','{"otherTask":true}');
    commit('unrelated later task');
    ledger!.report('NEYNA-201',second.leaseToken,{kind:'docs',
      reference:'Documentation check for unrelated task'},true);
    ledger!.complete('NEYNA-201',second.leaseToken,{
      summary:'Unrelated task committed its own file',
      implementation:'Added separate fixture with a non-overlapping path',
      verification:'Docs Gate can run for the unrelated task',
    });
    recordAcceptanceReview('NEYNA-201',second.leaseToken,'docs',
      'Documentation check for unrelated task');
    expect(ledger!.verify('NEYNA-201',second.leaseToken).passed).toBe(true);
    const current=git('rev-parse','HEAD');expect(current).not.toBe(original);
    const resumed=ledger!.resumeVerification('NEYNA-200','service-agent');
    ledger!.report('NEYNA-200',resumed.leaseToken,{kind:'external_test',
      reference:'Independent acceptance fixture output from resumed external runner'},false);
    const handoff=ledger!.handoffReview('NEYNA-200',{
      leaseToken:resumed.leaseToken,actor:'service-agent',
      reason:'Deferred frozen delivery is ready for a different Reviewer after external runner returned',
    });
    expect(handoff.completionHead).toBe(original);
    expect(handoff.currentHead).toBe(current);
    ledger!.independentTaskReview('NEYNA-200',handoff.ticket,{
      reviewer:'delivery-reviewer',outcome:'passed',
      findings:'Checked the immutable original delivery against later unrelated commits and inspected test evidence.',
      evidenceReference:'Original unit tests executed for frozen service delivery',
    });
    ledger!.reviewExternalGate('NEYNA-200',resumed.leaseToken,{
      gate:'independent_acceptance',
      evidenceReference:'Independent acceptance fixture output from resumed external runner',
      runner:'service-agent',reviewer:'gate-reviewer',outcome:'passed',
      reviewNotes:'Independently inspected the external integration fixture output against the original delivery',
    });
    expect(ledger!.verifyReviewedTask('NEYNA-200',handoff.ticket)).toMatchObject({passed:true});
    expect(ledger!.get('NEYNA-200').status).toBe('verified');
    expect(ledger!.taskClosureStatus('NEYNA-200')).toMatchObject({completed:true,steps:[]});
    expect(git('rev-parse','HEAD')).toBe(current);
  });

  it('recovers an expired in_progress lease and completes the original Git task through independent review',()=>{
    create({id:'NEYNA-200'});ledger!.approve('NEYNA-200','owner');
    const initial=ledger!.claim('NEYNA-200','lost-developer',60);
    save('other-project/existing.txt','non-task material must stay intact');
    save('tests/contracts/real-submission.json','{"contract":true}');
    git('add','tests/contracts/real-submission.json');
    git('-c','user.name=Fixture','-c','user.email=test@example.invalid',
      'commit','-qm','scoped completed submission before developer left');
    const committed=git('rev-parse','HEAD');
    const db=(ledger! as any).db;
    db.prepare("UPDATE dc_leases SET expires_at=? WHERE task_id='NEYNA-200'")
      .run(Date.now()-5);
    const prior=process.env.DEVCONTROL_OWNER_RECOVERY_KEY;
    process.env.DEVCONTROL_OWNER_RECOVERY_KEY='test-only-expired-lease-recovery-password';
    try{
      expect(()=>ledger!.recoverTaskLease('NEYNA-200',{
        actor:'owner-coordinator',ownerRecoveryKey:'invalid',
        reason:'Recover a stranded scoped delivery after the original Agent session disappeared',
      })).toThrow(/Owner recovery credential/);
      const takeover=ledger!.recoverTaskLease('NEYNA-200',{
        actor:'owner-coordinator',ownerRecoveryKey:process.env.DEVCONTROL_OWNER_RECOVERY_KEY!,
        reason:'The original developer session was lost after the reviewed Git commit and cannot return',
      });
      expect(takeover).toMatchObject({originalBaseHead:initial.baseHead,currentHead:committed,
        status:'in_progress'});
      expect(takeover.leaseToken).not.toBe(initial.leaseToken);
      ledger!.complete('NEYNA-200',takeover.leaseToken,{
        summary:'Original task implementation was already committed and retains its exact Git ancestry',
        implementation:'Recovered the original in-scope committed fixture without touching unrelated files',
        verification:'The exact scoped Git commit and required docs gate remain subject to review',
      });
      ledger!.report('NEYNA-200',takeover.leaseToken,{
        kind:'docs',reference:'recovered task test evidence tied to committed revision'},true);
      const review=ledger!.handoffReview('NEYNA-200',{
        leaseToken:takeover.leaseToken,actor:'owner-coordinator',
        reason:'Recovered original delivery was documented and passed to a distinct Reviewer for approval',
      });
      ledger!.independentTaskReview('NEYNA-200',review.ticket,{
        reviewer:'external-qa-agent',outcome:'passed',
        findings:'Independently inspected the preserved original Git commit, complete report and real fixture evidence.',
        evidenceReference:'recovered task test evidence tied to committed revision',
      });
      recordAcceptanceReview('NEYNA-200',takeover.leaseToken,'docs',
        'recovered task test evidence tied to committed revision');
      expect(ledger!.verifyReviewedTask('NEYNA-200',review.ticket).passed).toBe(true);
      expect(ledger!.get('NEYNA-200').status).toBe('verified');
      expect(fs.readFileSync(path.join(root,'other-project/existing.txt'),'utf8'))
        .toBe('non-task material must stay intact');
      expect(ledger!.trace('NEYNA-200').audit.map((e:any)=>e.event))
        .toContain('owner_task_lease_recovered');
    }finally{
      if(prior===undefined)delete process.env.DEVCONTROL_OWNER_RECOVERY_KEY;
      else process.env.DEVCONTROL_OWNER_RECOVERY_KEY=prior;
    }
  });

  it('returns a rejected independent review for rework without removing project files',()=>{
    create({id:'NEYNA-200'});ledger!.approve('NEYNA-200','owner');
    const claim=ledger!.claim('NEYNA-200','developer');
    save('tests/contracts/rejection.json','{}');
    git('add','tests/contracts/rejection.json');
    git('-c','user.name=Fixture','-c','user.email=test@example.invalid',
      'commit','-qm','task awaiting review');
    ledger!.report('NEYNA-200',claim.leaseToken,{kind:'docs',reference:'required verification evidence'},true);
    ledger!.complete('NEYNA-200',claim.leaseToken,{
      summary:'Submitted actual scoped implementation',
      implementation:'Created a contract fixture under the approved task path',
      verification:'Submitted documentation validation evidence for review',
    });
    const handoff=ledger!.handoffReview('NEYNA-200',{
      leaseToken:claim.leaseToken,actor:'developer',
      reason:'Ready for an independent agent to inspect the exact task submission',
    });
    expect(ledger!.independentTaskReview('NEYNA-200',handoff.ticket,{
      reviewer:'reviewer-two',outcome:'failed',
      findings:'The fixture lacks the expected negative-case assertions and needs code changes before verification.',
      evidenceReference:'required verification evidence',
    })).toMatchObject({status:'returned_for_rework'});
    expect(ledger!.get('NEYNA-200').status).toBe('in_progress');
    expect(()=>ledger!.verifyReviewedTask('NEYNA-200',handoff.ticket)).toThrow(/ticket/i);
  });

  it('restores review authority after a lost developer session using an explicit Owner credential',()=>{
    create({id:'NEYNA-200'});ledger!.approve('NEYNA-200','owner');
    const claimed=ledger!.claim('NEYNA-200','departed-implementer',60);
    save('tests/contracts/session-handoff.json','{"safe":true}');
    git('add','tests/contracts/session-handoff.json');
    git('-c','user.name=Fixture','-c','user.email=test@example.invalid',
      'commit','-qm','task already committed before session was lost');
    ledger!.report('NEYNA-200',claimed.leaseToken,{
      kind:'docs',reference:'original completion evidence from departed agent'},true);
    ledger!.complete('NEYNA-200',claimed.leaseToken,{
      summary:'The original implementer committed the scoped change before leaving',
      implementation:'An isolated contract fixture is retained in original Git history',
      verification:'The original task evidence is available to an independent reviewer',
    });
    const database=(ledger! as any).db;
    database.prepare("UPDATE dc_leases SET expires_at=? WHERE task_id='NEYNA-200'")
      .run(Date.now()-1);
    const original=process.env.DEVCONTROL_OWNER_RECOVERY_KEY;
    process.env.DEVCONTROL_OWNER_RECOVERY_KEY='test-only-owner-secret-at-least-24-characters';
    try{
      expect(()=>ledger!.handoffReview('NEYNA-200',{
        leaseToken:claimed.leaseToken,actor:'departed-implementer',
        reason:'Attempting to use a previously expired developer lease is prohibited',
      })).toThrow(/credential/);
      expect(()=>ledger!.handoffReview('NEYNA-200',{
        actor:'project-owner',reason:'Recovered after original Agent session was lost',
        ownerRecoveryKey:'wrong-secret',
      })).toThrow(/credential/);
      const recovered=ledger!.handoffReview('NEYNA-200',{
        actor:'project-owner',
        reason:'Authorized recovery of a stranded completed task without modifying its Git commits',
        ownerRecoveryKey:process.env.DEVCONTROL_OWNER_RECOVERY_KEY,
      });
      expect(recovered.completionHead).toBe(git('rev-parse','HEAD'));
      ledger!.independentTaskReview('NEYNA-200',recovered.ticket,{
        reviewer:'independent-security-reviewer',outcome:'passed',
        findings:'Audited the old completion and scoped commit using recorded evidence; no task file was rewritten.',
        evidenceReference:'original completion evidence from departed agent',
      });
      recordAcceptanceReview('NEYNA-200',claimed.leaseToken,'docs',
        'original completion evidence from departed agent');
      expect(ledger!.verifyReviewedTask('NEYNA-200',recovered.ticket).passed).toBe(true);
      expect(ledger!.get('NEYNA-200').status).toBe('verified');
      expect(ledger!.trace('NEYNA-200').audit.some((e:any)=>
        e.event==='review_handed_off'&&e.details.via==='authorized_owner_recovery')).toBe(true);
    }finally{
      if(original===undefined)delete process.env.DEVCONTROL_OWNER_RECOVERY_KEY;
      else process.env.DEVCONTROL_OWNER_RECOVERY_KEY=original;
    }
  });
  it("preserves leased WIP and exact owner-dirty bytes through reviewed incremental approval", () => {
    save("docs/roadmap/recovery-version.md",
      "# Scope\n\n| 阶段 | 描述 |\n| --- | --- |\n| F0 | Baseline |\n| F1 | Build |\n| F2 | Integration |\n");
    commit("recovery scope baseline");
    const items=[
      {id:"WORK-A",title:"实现安全授权适配",stageId:"F1",type:"development",
        ownerRole:"iOS Engineer",platform:"iPhone",dependsOn:["F0"],
        allowedPaths:["services/core/**"],requiredGates:["docs"],
        acceptance:"授权只有主动触发系统请求才会进入可录音状态"},
      {id:"WORK-Q",title:"验证授权拒绝场景",stageId:"F1",type:"testing",
        ownerRole:"QA Engineer",platform:"iPhone",dependsOn:["WORK-A"],
        allowedPaths:["tests/contracts/**"],requiredGates:["docs"],
        acceptance:"拒权后无音频帧并可找到设备设置入口"},
      {id:"WORK-I",title:"校验跨端授权集成",stageId:"F2",type:"integration",
        ownerRole:"Integration Engineer",platform:"iPhone",dependsOn:["WORK-Q"],
        allowedPaths:["tests/contracts/**"],requiredGates:["docs"],
        acceptance:"实际应用验证授权状态与设备权限一致"},
      {id:"WORK-R",title:"验证授权发布清单",stageId:"F2",type:"release",
        ownerRole:"Release Engineer",platform:"Release",dependsOn:["WORK-I"],
        allowedPaths:["docs/**"],requiredGates:["docs"],
        acceptance:"批准的授权功能均有可追溯真实设备证据"},
    ] as any[];
    const base={release:"V0.1",scopeSource:"docs/roadmap/recovery-version.md",
      rationale:"This release separates source implementation from device integration and independent verification.",
      stages:[{id:"F0",verifiedTaskIds:["F0"]},{id:"F1"},{id:"F2"}],workItems:items};
    const plan={...base,agentReview:{reviewer:"quality-agent",method:"independent-agent-pass" as const,
      subjectHash:releaseReviewSubjectHash(base as any),sourceRefs:[base.scopeSource],
      reviewedStageIds:["F0","F1","F2"],checks:REVIEW_DIMENSIONS.map(dimension=>({
        dimension,conclusion:"Independently checked source boundaries and required device evidence for "+dimension,
        workItemIds:items.map(item=>item.id)}))}};
    expect(ledger!.reviewReleaseWork(plan as any).issues).toEqual([]);
    const staged=ledger!.stageReleaseWork(plan as any,"planner");
    const frozen=ledger!.approveReleaseWork("V0.1",staged.hash);
    const claim=ledger!.claim("WORK-A","developer");
    save("services/core/work-in-scope.txt","legitimate partial code\n");
    commit("partially implemented authorized code");
    const pausedHead=git("rev-parse","HEAD");
    save("README.md","owner's longstanding dirty edits remain untouched\n");
    const expectedDirty=createRequire(import.meta.url)("node:crypto")
      .createHash("sha256").update(fs.readFileSync(path.join(root,"README.md"))).digest("hex") as string;
    const reviewedItem={id:"WORK-NEW",title:"完善实际Core数据库连接验证",
      stageId:"F2",type:"development" as const,platform:"Go",ownerRole:"Core Engineer",
      dependsOn:["F0"],allowedPaths:["services/core/cmd/**"],requiredGates:["docs"],
      acceptance:"真实Go服务对非法请求拒绝且能验证Core启动链路"};
    const inc={release:"V0.1",baseRevision:1,baseHash:frozen.hash,
      addWorkItems:[reviewedItem],addDependencies:[{taskId:"WORK-I",dependsOn:["WORK-NEW"]}],
      rationale:"The device integration previously lacked the required server runtime prerequisite; keep its QA contract unchanged.",
      alternatives:"A fake Core in device tests would not validate a real server; the task stays atomic and versioned.",
      verificationPlan:"Use the original mandatory testing evidence and reject any invented device or Core completion.",
      sourceRefs:["task:WORK-I",base.scopeSource]};
    const incStaged=ledger!.stageReleaseWorkIncremental(inc,"incremental-author");
    const incReview={reviewer:"different-reviewer",method:"independent-agent-pass" as const,
      subjectHash:incStaged.proposalHash,affectedTaskIds:["WORK-NEW","WORK-I"],
      scopeAssessment:"Adds a separate Core runtime task without changing original authorized Flutter code paths.",
      dependencyAssessment:"Core must finish before the previously Ready device QA task, while verified historical tasks remain frozen.",
      securityAndTestAssessment:"Original gates remain mandatory and owner edits are protected by recorded SHA-256 during pause.",
      sourceRefs:["task:WORK-I"]};
    const reviewed=ledger!.reviewStagedReleaseWorkIncremental("V0.1",incReview,incStaged.proposalHash);
    const input={id:"WORK-A",leaseToken:claim.leaseToken,
      expectedProposalHash:incStaged.proposalHash,expectedReviewHash:reviewed.reviewHash,
      reason:"Preserve the legitimate earlier Git changes and owner edits before the unrelated reviewed incremental receives exact Owner authorization.",
      existingDirtyFiles:[{path:"README.md",sha256:expectedDirty}]};
    expect(()=>ledger!.pauseForReviewedIncremental({...input,
      expectedReviewHash:"0".repeat(64)})).toThrow(/Exact reviewed incremental hashes/);
    expect(()=>ledger!.pauseForReviewedIncremental({...input,
      existingDirtyFiles:[{path:"README.md",sha256:"0".repeat(64)}]}))
      .toThrow(/existing uncommitted file changed/);
    expect(ledger!.pauseForReviewedIncremental(input)).toMatchObject({
      status:"ready",paused:true,originalBaseHead:claim.baseHead,
      pausedHead,untouchedExistingDirtyFiles:["README.md"]});
    expect(fs.readFileSync(path.join(root,"README.md"),"utf8"))
      .toContain("owner's longstanding dirty edits remain untouched");
    expect(ledger!.get("WORK-A").allowedPaths).toEqual(["services/core/**"]);
    const approved=ledger!.approveReleaseWorkIncremental({release:"V0.1",
      expectedProposalHash:incStaged.proposalHash,expectedReviewHash:reviewed.reviewHash,
      approvedBy:"test-owner",explicitAuthorization:true,
      reason:"I explicitly authorize this reviewed Core prerequisite without touching the user's preexisting uncommitted changes."});
    expect(approved.added).toEqual(["WORK-NEW"]);
    const reclaimed=ledger!.claim("WORK-A","developer");
    expect(reclaimed.baseHead).toBe(claim.baseHead);
    expect(git("rev-parse","HEAD")).toBe(pausedHead);
    expect(fs.readFileSync(path.join(root,"README.md"),"utf8"))
      .toContain("owner's longstanding dirty edits remain untouched");
    // Regression for a REAL project that has already paused once for an
    // incremental change and now must pause a SECOND time for native scope.
    // The original pause is immutable in the history table and its audit.
    const nextScope={release:"V0.1",baseRevision:2,baseHash:approved.hash,
      changes:[{taskId:"WORK-A",addAllowedPaths:["apps/client/lib/features/shell/neyna_app.dart"]}],
      rationale:"The earlier approved Flutter microphone authorization bridge must be reachable in the existing app's settings screen without expanding capture scope.",
      alternatives:"A stand-alone developer-only test app cannot satisfy the production navigation acceptance; leave mic capture unstarted.",
      verificationPlan:"Test real shell navigation, OS permission denial and settings recovery on an actual signed iPhone without starting microphone capture.",
      sourceRefs:["task:WORK-A","docs/roadmap/recovery-version.md"]};
    expect(ledger!.reviewReleaseWorkScopeAmendment(nextScope)).toMatchObject({passed:true});
    const nextStaged=ledger!.stageReleaseWorkScopeAmendment(nextScope,"different-planner");
    const nextReview={reviewer:"real-other-reviewer",method:"independent-agent-pass" as const,
      subjectHash:nextStaged.proposalHash,affectedTaskIds:["WORK-A"],
      scopeAssessment:"Exactly one additional existing shell source file is needed to expose the prior approved authorization bridge.",
      dependencyAssessment:"All source authorization and QA dependencies remain intact, and no record of verified work is modified.",
      securityAndTestAssessment:"Only explicit owner interaction may request system microphone permission; no AVAudioEngine or capture is started.",
      sourceRefs:["task:WORK-A","docs/roadmap/recovery-version.md"]};
    const nextReviewed=ledger!.reviewStagedReleaseWorkScopeAmendment(
      "V0.1",nextReview,nextStaged.proposalHash);
    const secondPause=ledger!.pauseForScopeAmendment("WORK-A",reclaimed.leaseToken,
      "The production Settings authorization entrypoint requires the single approved shell source path, while preserving the original WIP and local owner files.",
      [{path:"README.md",sha256:expectedDirty}]);
    expect(secondPause).toMatchObject({paused:true,status:"ready",
      originalBaseHead:claim.baseHead,pausedHead});
    const archived=(ledger! as any).db.prepare(
      "SELECT prior_record_json FROM dc_scope_pause_history WHERE task_id=?")
      .all("WORK-A") as Array<{prior_record_json:string}>;
    expect(archived).toHaveLength(1);
    expect(JSON.parse(archived[0].prior_record_json)).toMatchObject({
      proposal_hash:incStaged.proposalHash,
      base_head:claim.baseHead,
      paused_head:pausedHead,
    });
    expect(ledger!.get("WORK-A").allowedPaths).toEqual(["services/core/**"]);
    expect(ledger!.approveReleaseWorkScopeAmendment({release:"V0.1",
      expectedProposalHash:nextStaged.proposalHash,
      expectedReviewHash:nextReviewed.reviewHash,approvedBy:"test-owner",
      explicitAuthorization:true,
      reason:"The isolated fixture Owner expressly approves the single reviewed production Settings source file while preserving both previous task pauses."}))
      .toMatchObject({scopeOnly:true});
    expect(ledger!.claim("WORK-A","developer").baseHead).toBe(claim.baseHead);
    expect(fs.readFileSync(path.join(root,"README.md"),"utf8"))
      .toContain("owner's longstanding dirty edits remain untouched");
  });

  it("records a committed task's completion without moving unrelated tracked or untracked main work", () => {
    create({id:"NEYNA-200",requiredGates:["ios_device_e2e"]});
    ledger!.approve("NEYNA-200","owner");
    const lease=ledger!.claim("NEYNA-200","audio-agent");
    save("tests/contracts/capture.json",'{"frameCount":1000}');
    commit("real capture frame counter implemented");
    const commitHead=git("rev-parse","HEAD");
    ledger!.report("NEYNA-200",lease.leaseToken,{
      kind:"native_xctest_usb_partial",reference:"Real USB device 15 pass; live microphone pending",
    },true);
    save("README.md","existing owner notes, absolutely do not overwrite\n");
    save("tests/contracts/future.wav",'{"otherTaskWip":true}');
    const statusBefore=git("status","--porcelain=v1");
    const report={
      summary:"Real bounded audio frame counter delivered",
      implementation:"Only the committed code belongs to the current task",
      verification:"Real native XCTest passed but live permission Gate remains pending",
      remaining:"Real physical microphone permission and foreground sampling required",
    };
    expect(() => ledger!.complete("NEYNA-200",lease.leaseToken,report))
      .toThrow(/dirty|untracked|worktree/i);
    const done=ledger!.complete("NEYNA-200",lease.leaseToken,{
      ...report,preserveExistingWorktree:true,
    });
    expect(done.gitHead).toBe(commitHead);
    expect(done.preservedUncommittedFiles).toBe(2);
    expect(git("status","--porcelain=v1")).toBe(statusBefore);
    const beforeGate=ledger!.verify("NEYNA-200",lease.leaseToken);
    expect(beforeGate.passed).toBe(false);
    expect(beforeGate.reason??"").not.toContain("Uncommitted files");
    expect(git("status","--porcelain=v1")).toBe(statusBefore);
    const deferred=ledger!.deferVerification({
      id:"NEYNA-200",leaseToken:lease.leaseToken,gate:"ios_device_e2e",
      reason:"Physical microphone consent unavailable, real iPhone Gate pending",
      preserveExistingWorktree:true,
    });
    expect(deferred.gatePassed).toBe(false);
    expect(deferred.preservedUncommittedFiles).toBe(2);
    expect(ledger!.get("NEYNA-200").status).toBe("in_review");
    expect(ledger!.get("NEYNA-200").pendingVerification.gate).toBe("ios_device_e2e");
    expect(ledger!.taskClosureStatus('NEYNA-200').nextAction).toBe('resume-verification');
    expect(ledger!.next().activeLease).toBeNull();
    expect(git("status","--porcelain=v1")).toBe(statusBefore);
  });

  it("preserves exact unrelated Owner edits while completing and verifying a committed task", () => {
    create();
    ledger!.approve("NEYNA-200","owner");
    const claim=ledger!.claim("NEYNA-200","agent");
    save("tests/contracts/delivered.json","{}\n");
    commit("deliver only the approved contract");
    save("README.md","pre-existing owner local settings\n");
    const sha=createRequire(import.meta.url)("node:crypto").createHash("sha256")
      .update(fs.readFileSync(path.join(root,"README.md"))).digest("hex") as string;
    const manifest=[{path:"README.md",sha256:sha}];
    const report={summary:"Delivered scoped source",implementation:"Authorized contract",
      verification:"Fixture gate and protected SHA match",existingDirtyFiles:manifest};
    expect(()=>ledger!.complete("NEYNA-200",claim.leaseToken,{
      ...report,existingDirtyFiles:undefined,
    })).toThrow(/manifest/i);
    expect(()=>ledger!.complete("NEYNA-200",claim.leaseToken,{
      ...report,existingDirtyFiles:[{path:"README.md",sha256:"0".repeat(64)}],
    })).toThrow(/expected bytes|manifest/i);
    const completion=ledger!.complete("NEYNA-200",claim.leaseToken,report);
    expect(completion.preservedDirtyFiles).toEqual(manifest);
    expect(JSON.parse(ledger!.trace("NEYNA-200").completion.preserved_dirty_json))
      .toEqual(manifest);
    ledger!.report("NEYNA-200",claim.leaseToken,
      {kind:"real_gate",reference:"independent approved task gate passed"},true);
    recordAcceptanceReview('NEYNA-200',claim.leaseToken,'docs',
      'independent approved task gate passed');
    expect(ledger!.verify("NEYNA-200",claim.leaseToken)).toMatchObject({
      passed:true,taskId:"NEYNA-200",
    });
    expect(fs.readFileSync(path.join(root,"README.md"),"utf8"))
      .toBe("pre-existing owner local settings\n");
  });

  it("rejects changed, newly staged or in-scope dirty files despite a preserved manifest", () => {
    create();
    ledger!.approve("NEYNA-200","owner");
    const claim=ledger!.claim("NEYNA-200","agent");
    save("tests/contracts/source.json","{}\n");
    commit("approved source");
    save("README.md","unchanged Owner edits\n");
    const sha=createRequire(import.meta.url)("node:crypto").createHash("sha256")
      .update(fs.readFileSync(path.join(root,"README.md"))).digest("hex") as string;
    const manifest=[{path:"README.md",sha256:sha}];
    const report={summary:"Scoped delivery",implementation:"One contract",
      verification:"Approved test evidence",existingDirtyFiles:manifest};
    expect(()=>ledger!.complete("NEYNA-200",claim.leaseToken,{
      ...report,existingDirtyFiles:[{path:"tests/contracts/source.json",sha256:sha}],
    })).toThrow(/manifest/i);
    save("tests/contracts/source.json","changed uncommitted task code\n");
    expect(()=>ledger!.complete("NEYNA-200",claim.leaseToken,report)).toThrow(/manifest/i);
    save("tests/contracts/source.json","{}\n");
    save("tests/contracts/staged.json","{}\n");
    git("add","tests/contracts/staged.json");
    expect(()=>ledger!.complete("NEYNA-200",claim.leaseToken,report)).toThrow(/Staged and untracked/i);
    git("reset","-q","HEAD","--","tests/contracts/staged.json");
    fs.rmSync(path.join(root,"tests/contracts/staged.json"));
    ledger!.complete("NEYNA-200",claim.leaseToken,report);
    ledger!.report("NEYNA-200",claim.leaseToken,
      {kind:"gate",reference:"fixture verified"},true);
    save("README.md","Owner edit silently changed after completion\n");
    expect(ledger!.verify("NEYNA-200",claim.leaseToken)).toMatchObject({
      passed:false,reason:expect.stringMatching(/protected Owner/i),
    });
  });

  it("cannot declare task-scoped or committed files as protected Owner edits", () => {
    create();
    ledger!.approve("NEYNA-200","owner");
    const claim=ledger!.claim("NEYNA-200","agent");
    save("tests/contracts/code.json","{}\n");
    commit("approved task code");
    save("tests/contracts/code.json","uncommitted modifications\n");
    const sha=createRequire(import.meta.url)("node:crypto").createHash("sha256")
      .update(fs.readFileSync(path.join(root,"tests/contracts/code.json"))).digest("hex") as string;
    expect(()=>ledger!.complete("NEYNA-200",claim.leaseToken,{
      summary:"Task",implementation:"Code",verification:"Test",
      existingDirtyFiles:[{path:"tests/contracts/code.json",sha256:sha}],
    })).toThrow(/Current task/i);
  });

  it("never exempts a deleted tracked Owner file from clean-worktree review", () => {
    create();
    ledger!.approve("NEYNA-200","owner");
    const claim=ledger!.claim("NEYNA-200","agent");
    save("tests/contracts/code.json","{}\n");
    commit("approved code");
    const sha=createRequire(import.meta.url)("node:crypto").createHash("sha256")
      .update(fs.readFileSync(path.join(root,"README.md"))).digest("hex") as string;
    fs.rmSync(path.join(root,"README.md"));
    expect(()=>ledger!.complete("NEYNA-200",claim.leaseToken,{
      summary:"Task",implementation:"Code",verification:"Test",
      existingDirtyFiles:[{path:"README.md",sha256:sha}],
    })).toThrow(/tracked file edits|manifest|Owner edits/i);
  });
  it("stages leased partial code then pauses, reviews, approves and reclaims original Git baseline", () => {
    save("docs/roadmap/recovery-version.md",
      "# Scoped recovery\n\n| 阶段 | 描述 |\n| --- | --- |\n| F0 | 已验证基线 |\n| F1 | 授权接口实现 |\n| F2 | 联调与发布 |\n");
    commit("scope recovery baseline");
    const entries=[
      {id:"WORK-PERM",title:"实现授权的原生权限适配",stageId:"F1",type:"development",
        ownerRole:"iOS Engineer",platform:"iPhone",dependsOn:["F0"],
        allowedPaths:["services/core/**"],requiredGates:["docs"],
        acceptance:"系统仅在用户主动确认授权后才读取并返回麦克风权限状态"},
      {id:"WORK-PERM-QA",title:"核验拒绝授权的行为",stageId:"F1",type:"testing",
        ownerRole:"QA Engineer",platform:"iPhone",dependsOn:["WORK-PERM"],
        allowedPaths:["tests/contracts/**"],requiredGates:["docs"],
        acceptance:"拒权后设备不产生录音帧且始终可进入系统权限设置"},
      {id:"WORK-PERM-E2E",title:"进行客户端音频授权集成",stageId:"F2",type:"integration",
        ownerRole:"Integration QA",platform:"iPhone",dependsOn:["WORK-PERM-QA"],
        allowedPaths:["tests/contracts/**"],requiredGates:["docs"],
        acceptance:"设备授权状态在断开和重新连接后保持与系统权限一致"},
      {id:"WORK-PERM-REL",title:"核验录音授权交付清单",stageId:"F2",type:"release",
        ownerRole:"Release Engineer",platform:"Release",dependsOn:["WORK-PERM-E2E"],
        allowedPaths:["docs/**"],requiredGates:["docs"],
        acceptance:"交付清单全部提供已执行的授权拒绝和权限恢复证据"},
    ] as any[];
    const proposal={release:"V0.1",scopeSource:"docs/roadmap/recovery-version.md",
      rationale:"Four bounded development, testing, integration and release steps preserve distinct evidentiary gates.",
      stages:[{id:"F0",verifiedTaskIds:["F0"]},{id:"F1"},{id:"F2"}],workItems:entries};
    const plan={...proposal,agentReview:{reviewer:"quality-review-agent",
      method:"independent-agent-pass" as const,
      subjectHash:releaseReviewSubjectHash(proposal as any),
      sourceRefs:["docs/roadmap/recovery-version.md"],reviewedStageIds:["F0","F1","F2"],
      checks:REVIEW_DIMENSIONS.map(dimension=>({dimension,
        conclusion:"Independently assessed the authorization lifecycle and auditable evidence for "+dimension,
        workItemIds:entries.map(item=>item.id)}))}};
    expect(ledger!.reviewReleaseWork(plan as any).issues).toEqual([]);
    const staged=ledger!.stageReleaseWork(plan as any,"planning-agent");
    const frozen=ledger!.approveReleaseWork("V0.1",staged.hash);
    const claim=ledger!.claim("WORK-PERM","implementer-agent");
    const originalBase=claim.baseHead;
    save("services/core/internal/permission-bridge.txt", "already approved original scope\n");
    commit("in-scope partial authorization adapter");
    const originalPartialHead=git("rev-parse","HEAD");
    const scope={release:"V0.1",baseRevision:1,baseHash:frozen.hash,
      changes:[{taskId:"WORK-PERM",addAllowedPaths:["apps/client/ios/Runner/AppDelegate.swift"]}],
      rationale:"The iPhone native permission component requires application bootstrap registration to become executable by the original authorized client.",
      alternatives:"Leaving Swift authorization in a source-only directory would not verify permission handling in the actual Runner application.",
      verificationPlan:"Retain every preexisting source commit and original file permission, verify independent scope evidence, then test a true iPhone signed build after explicit Owner approval.",
      sourceRefs:["task:WORK-PERM","docs/roadmap/recovery-version.md"]};
    expect(ledger!.reviewReleaseWorkScopeAmendment(scope)).toMatchObject({passed:true});
    const pending=ledger!.stageReleaseWorkScopeAmendment(scope,"scope-planner");
    expect(ledger!.get("WORK-PERM").allowedPaths).toEqual(["services/core/**"]);
    const paused=ledger!.pauseForScopeAmendment("WORK-PERM",claim.leaseToken,
      "This previously committed in-scope Swift adapter cannot be registered without separately approved Runner bootstrap scope.");
    expect(paused).toMatchObject({paused:true,status:"ready",
      originalBaseHead:originalBase,pausedHead:originalPartialHead,
      changedFiles:["services/core/internal/permission-bridge.txt"]});
    expect(()=>ledger!.claim("WORK-PERM","premature-agent"))
      .toThrow(/Scope amendment.*awaits independent review/);
    const review={reviewer:"independent-quality-agent",method:"independent-agent-pass" as const,
      subjectHash:pending.proposalHash,affectedTaskIds:["WORK-PERM"],
      scopeAssessment:"Only the specific AppDelegate Swift registration file is newly allowed and the original implementation file remains within the frozen scope.",
      dependencyAssessment:"The original verified environment prerequisite remains satisfied and all dependent QA, integration and release tasks retain their own gates.",
      securityAndTestAssessment:"No permissions change until Owner approval; user-initiated microphone prompt and denied/no-audio cases remain mandatory actual device evidence.",
      sourceRefs:["task:WORK-PERM","docs/roadmap/recovery-version.md"]};
    const reviewed=ledger!.reviewStagedReleaseWorkScopeAmendment("V0.1",review,
      pending.proposalHash);
    expect(reviewed).toMatchObject({status:"reviewed",executableScopeChanged:false});
    const approved=ledger!.approveReleaseWorkScopeAmendment({release:"V0.1",
      expectedProposalHash:pending.proposalHash,expectedReviewHash:reviewed.reviewHash,
      approvedBy:"test-owner",explicitAuthorization:true,
      reason:"This isolated test Owner authorizes exactly one extra native registration file after the true review and preserved Git history."});
    expect(approved).toMatchObject({revision:2,scopeOnly:true});
    expect(ledger!.get("WORK-PERM").allowedPaths).toEqual([
      "services/core/**","apps/client/ios/Runner/AppDelegate.swift"]);
    const reclaimed=ledger!.claim("WORK-PERM","implementer-agent");
    expect(reclaimed.baseHead).toBe(originalBase);
    expect(git("rev-parse","HEAD")).toBe(originalPartialHead);
    expect(ledger!.get("WORK-PERM").status).toBe("in_progress");
    expect((ledger! as any).db.prepare(
      "SELECT resumed_at FROM dc_scope_pauses WHERE task_id='WORK-PERM'").get().resumed_at)
      .toBeTruthy();
  });
  it("enforces a reviewed, Owner-approved generic artifact baseline across staged files",()=>{
    const source="protocols/v1/schema.sql",baselineSQL="CREATE TABLE sample(id bigint);\n";
    save(source,baselineSQL);
    commit("approved schema design source");
    const hashText=(value:string)=>createRequire(import.meta.url)("node:crypto")
      .createHash("sha256").update(value).digest("hex") as string;
    const baseline={id:"business-contract",guardRoots:["protocols/v1"],
      files:[{path:source,sha256:hashText(baselineSQL)}],
      rationale:"Use the reviewed data contract to prevent uncontrolled schema updates after release approval.",
      sourceRefs:["protocols/v1/schema.sql","task:ARCH-201"]};
    const proposal=ledger!.stageGovernedArtifact(baseline,0,"","planning-agent");
    expect(proposal.baselineChanged).toBe(false);
    expect(ledger!.checkGovernedArtifacts()).toMatchObject({passed:true,
      protectedBaselines:[]});
    const review={reviewer:"independent-reviewer",method:"independent-agent-pass" as const,
      subjectHash:proposal.proposalHash,
      scopeAssessment:"Only the versioned SQL contract directory is guarded; all paths are exact and checked.",
      dependencyAssessment:"Dependent application changes require an approved migration release task before this changes.",
      securityAndTestAssessment:"Must demonstrate migration atomicity, replay, least privilege and rollback before release.",
      sourceRefs:["protocols/v1/schema.sql"]};
    expect(()=>ledger!.independentlyReviewGovernedArtifact(baseline.id,
      {...review,reviewer:"planning-agent"},proposal.proposalHash))
      .toThrow(/different independent reviewer/);
    const accepted=ledger!.independentlyReviewGovernedArtifact(baseline.id,review,proposal.proposalHash);
    const owner={id:baseline.id,expectedProposalHash:proposal.proposalHash,
      expectedReviewHash:accepted.reviewHash,approvedBy:"test-owner",
      reason:"Freeze the exact independently reviewed schema and protect future modifications.",
      explicitAuthorization:true};
    expect(()=>ledger!.approveGovernedArtifact({...owner,explicitAuthorization:false}))
      .toThrow(/Explicit Owner authorization/);
    expect(()=>ledger!.approveGovernedArtifact({...owner,expectedReviewHash:"f".repeat(64)}))
      .toThrow(/review hashes/);
    const approved=ledger!.approveGovernedArtifact(owner);
    expect(approved).toMatchObject({revision:1,status:"frozen",fileCount:1});
    expect(ledger!.checkGovernedArtifacts()).toMatchObject({passed:true});

    create({id:"NEYNA-901",allowedPaths:["protocols/v1/**"],requiredGates:["docs"]});
    ledger!.approve("NEYNA-901","test-owner");
    const lease=ledger!.claim("NEYNA-901","implementer");
    const changedSQL="CREATE TABLE sample(id bigint PRIMARY KEY);\n";
    save(source,changedSQL);
    git("add","--",source);
    const denied=ledger!.checkStaged();
    expect(denied).toMatchObject({passed:false,reason:
      "Frozen governed artifact changed without reviewed approval"});
    expect(denied.issues[0]).toContain("SHA-256 differs");
    git("restore","--staged","--",source);
    git("restore","--",source);
    ledger!.release("NEYNA-901",lease.leaseToken);

    const replacement={...baseline,files:[{path:source,sha256:hashText(changedSQL)}],
      rationale:"Change the sample primary key after detailed impact assessment and independent migration verification."};
    expect(()=>ledger!.stageGovernedArtifact(replacement,1,"f".repeat(64),"planning-agent"))
      .toThrow(/baseline revision\/hash changed/);
    const staged=ledger!.stageGovernedArtifact(replacement,1,approved.hash,"planning-agent");
    const reviewed=ledger!.independentlyReviewGovernedArtifact(replacement.id,
      {...review,subjectHash:staged.proposalHash},staged.proposalHash);
    expect(ledger!.checkGovernedArtifacts()).toMatchObject({passed:true});
    const revised=ledger!.approveGovernedArtifact({...owner,expectedProposalHash:staged.proposalHash,
      expectedReviewHash:reviewed.reviewHash});
    expect(revised).toMatchObject({revision:2,previousHash:approved.hash});
    expect(ledger!.checkGovernedArtifacts()).toMatchObject({passed:false});

    const approvedClaim=ledger!.claim("NEYNA-901","implementer");
    save(source,changedSQL);
    git("add","--",source);
    expect(ledger!.checkStaged()).toMatchObject({passed:true,taskId:"NEYNA-901"});
    git("commit","-qm","approved governed schema update");
    expect(ledger!.checkGovernedArtifacts()).toMatchObject({passed:true,
      protectedBaselines:[{id:"business-contract",revision:2,hash:revised.hash}]});
    save("protocols/v1/unapproved.sql","CREATE TABLE surprise(x integer);\n");
    expect(ledger!.checkGovernedArtifacts()).toMatchObject({passed:false});
    fs.unlinkSync(path.join(root,"protocols/v1/unapproved.sql"));
    expect(ledger!.checkGovernedArtifacts().passed).toBe(true);
    expect(ledger!.governedArtifact(baseline.id).baseline.revision).toBe(2);
    expect(approvedClaim.leaseToken).toBeTruthy();
  });
  it("holds chat ideas in SQLite until impact assessment, separate review and explicit planning disposition",()=>{
    const dbPath=path.join(root,".neyna/state/devcontrol.sqlite3");
    const sqlite=createRequire(import.meta.url)("node:sqlite") as {
      DatabaseSync:new(path:string)=>{prepare(sql:string):{
        run(...args:unknown[]):unknown;get(...args:unknown[]):Record<string,any>|undefined
      };close():void};
    };
    const store=new sqlite.DatabaseSync(dbPath);
    const frozen={plan:{release:"V0.1",stages:[{id:"F1"}],
      workItems:[{id:"F1",stageId:"F1"}]}};
    const frozenHash="f".repeat(64);
    store.prepare(`INSERT INTO dc_release_work_plans
      (release,revision,hash,snapshot_json,approved_by,approved_at)
      VALUES(?,?,?,?,?,?)`).run("V0.1",1,frozenHash,
        JSON.stringify(frozen),"test-owner",new Date().toISOString());
    store.close();
    const captured=ledger!.captureIdea({release:"V0.1",
      title:"Switch Neyna product business storage to PostgreSQL",
      description:"New owner proposal should be evaluated, not trigger immediate code changes.",
      sourceRef:"user-conversation-2026-10-22",submittedBy:"host-agent"});
    expect(captured).toMatchObject({status:"captured",revision:1,executableTaskCreated:false});
    expect(ledger!.get("F1").status).toBe("ready");
    expect(()=>ledger!.decideIdea(captured.id,{disposition:"adopt",
      expectedRevision:1,expectedReviewHash:"x",approvedBy:"Owner",reason:"New storage direction",
      explicitAuthorization:true}))
      .toThrow(/Review/);
    const assessment={recommendation:"adopt" as const,placement:"after_task" as const,
      targetStageId:"F1",targetTaskId:"F1",affectedTaskIds:["F1"],
      rationale:"PostgreSQL provides the product storage boundary requested by the Owner.",
      alternatives:"Separate code changes into staged and independently tested PostgreSQL tasks.",
      dependencyImpact:"Go module bootstrapping and integration tests must be ready before DB migration.",
      securityAndTestImpact:"Connection loss and least-privilege negative tests become mandatory.",
      versionImpact:"Propose a revised frozen release roster with a new atomic testing task.",
      evidenceRefs:["source:user-owner-proposal","task:F1"],
      assessedBy:"analysis-agent"};
    expect(()=>ledger!.assessIdea(captured.id,{
      ...assessment,targetTaskId:"UNKNOWN"
    },1)).toThrow(/insertion/i);
    const assessed=ledger!.assessIdea(captured.id,assessment,1);
    expect(assessed).toMatchObject({status:"assessed",revision:2,executableTaskCreated:false});
    const checks=["product_fit","dependency_integrity","timing_priority",
      "security_and_testing"].map(dimension=>({dimension,
        conclusion:"Independent evidence and task dependency review for "+dimension,
        taskIds:["F1"]}));
    expect(()=>ledger!.reviewIdea(captured.id,{reviewer:"analysis-agent",
      method:"independent-agent-pass",subjectHash:assessed.assessmentHash,checks} as never,2))
      .toThrow(/independent/i);
    expect(()=>ledger!.reviewIdea(captured.id,{reviewer:"second-reviewer",
      method:"independent-agent-pass",subjectHash:"a".repeat(64),checks} as never,2))
      .toThrow(/stale/i);
    const reviewed=ledger!.reviewIdea(captured.id,{reviewer:"second-reviewer",
      method:"independent-agent-pass",subjectHash:assessed.assessmentHash,checks} as never,2);
    expect(reviewed).toMatchObject({status:"reviewed",revision:3});
    expect(()=>ledger!.decideIdea(captured.id,{disposition:"adopt",
      expectedRevision:3,expectedReviewHash:"b".repeat(64),approvedBy:"Owner",
      reason:"Plan current integration",explicitAuthorization:true})).toThrow(/hash/i);
    const decided=ledger!.decideIdea(captured.id,{disposition:"adopt",
      expectedRevision:3,expectedReviewHash:reviewed.reviewHash,
      approvedBy:"Owner",reason:"Add to reviewed planning queue, not implementation",
      explicitAuthorization:true});
    expect(decided).toMatchObject({status:"approved_for_planning",
      executableTaskCreated:false,frozenPlanChanged:false});
    expect(ledger!.getIdea(captured.id).history).toHaveLength(4);
    expect(ledger!.get("F1").status).toBe("ready");
    expect(ledger!.releaseWorkPlan("V0.1").frozenHash).toBe(frozenHash);
    expect(git("status","--porcelain")).toBe("");
    expect(()=>ledger!.assessIdea(captured.id,assessment,4)).toThrow(/Only/);
  });

  it("treats Go HTTP acceptance as a requirement, not a hardcoded test-file scanner",()=>{
    create({id:"NEYNA-290",allowedPaths:["services/core/cmd/**"],
      requiredGates:["go_http_integration"]});
    ledger!.approve("NEYNA-290","owner");
    expect(ledger!.executionContract("NEYNA-290")).toMatchObject({eligible:true,issues:[]});
    expect(ledger!.claim("NEYNA-290","agent").task.status).toBe("in_progress");
  });

  it("allows bootstrapping a missing Go HTTP Gate when its real prerequisites are in scope",()=>{
    create({id:"NEYNA-291",allowedPaths:["services/core/cmd/**",
      "services/core/go.mod","services/core/internal/http_integration_test.go"],
      requiredGates:["go_http_integration"]});
    ledger!.approve("NEYNA-291","owner");
    expect(ledger!.executionContract("NEYNA-291")).toMatchObject({eligible:true,issues:[]});
  });

  it("does not require Go or PostgreSQL test paths to be known to the MCP",()=>{
    create({id:"NEYNA-292",allowedPaths:["services/core/cmd/**"],
      requiredGates:["go_http_integration","go_postgres_live"]});
    ledger!.approve("NEYNA-292","test-owner");
    expect(ledger!.executionContract("NEYNA-292")).toMatchObject({eligible:true,issues:[]});
    const claimed=ledger!.claim("NEYNA-292","agent");
    expect(claimed.task.status).toBe("in_progress");
    // The Agent must later report results and an independent reviewer must
    // attest to both requirements; DevControl never connects to PostgreSQL.
  });

  it("allows only generated Skill and AGENTS.md updates without a task lease",()=>{
    save("AGENTS.md","# Custom project security rules\nNever commit secrets.\n");
    commit("own AGENTS.md before kit installation");
    ensureMcpProbeSkill(root);
    ensureAgentsMdSkillReference(root);
    git("add",MCP_PROBE_SKILL_REL_PATH,"AGENTS.md");
    const result=ledger!.checkStaged();
    expect(result).toMatchObject({passed:true,scope:"managed-guidance-sync",taskId:null,
      stagedFiles:[MCP_PROBE_SKILL_REL_PATH,"AGENTS.md"]});
    expect(fs.readFileSync(path.join(root,"AGENTS.md"),"utf8"))
      .toContain("Never commit secrets.");
    commit("sync generated project guidance without a task lease");
    // An empty Git index must not get blanket permission from this exception.
    expect(()=>ledger!.checkStaged()).toThrow(/No active approved task lease/);
  });

  it("never allows arbitrary edits or mixed files to claim generated guidance exemption",()=>{
    save("AGENTS.md","# User governance\nKeep custom security instructions.\n");
    commit("user authored guidance");
    ensureMcpProbeSkill(root);
    ensureAgentsMdSkillReference(root);
    git("add",MCP_PROBE_SKILL_REL_PATH,"AGENTS.md");
    expect(ledger!.checkStaged().passed).toBe(true);
    save("AGENTS.md",fs.readFileSync(path.join(root,"AGENTS.md"),"utf8")+
      "\n## Unapproved change\nRemove all product gates.\n");
    git("add","AGENTS.md");
    expect(()=>ledger!.checkStaged()).toThrow(/managed guidance validation.*AGENTS\.md/);

    ensureAgentsMdSkillReference(root);
    // The generator merges the existing user content, it does NOT authorize
    // altering the non-managed body, even when its own block is still valid.
    expect(()=>ledger!.checkStaged()).toThrow(/No active approved task lease/);
    git("restore","--staged","--","AGENTS.md");
    git("restore","--","AGENTS.md");
    save("tests/contracts/other.json","{}\n");
    git("add","tests/contracts/other.json");
    expect(()=>ledger!.checkStaged()).toThrow(/No active approved task lease/);
    git("restore","--staged","--","tests/contracts/other.json");
    save(MCP_PROBE_SKILL_REL_PATH,fs.readFileSync(path.join(root,MCP_PROBE_SKILL_REL_PATH),"utf8")+
      "\nDisable all checks.\n");
    git("add",MCP_PROBE_SKILL_REL_PATH);
    expect(()=>ledger!.checkStaged()).toThrow(/staged content differs/);
  });
  it("keeps a user idea as a non-executable candidate until reasoned impact, separate review and explicit authorization",()=>{
    save("docs/roadmap/idea-version.md",
      "# Approved scope\n\n| 阶段 | 说明 |\n| --- | --- |\n| F0 | Verified baseline |\n| F2 | Go Core and validation |\n");
    commit("freeze idea review baseline");
    const workItems=[
      {id:"IDEA-CORE",title:"Build the Go Core entrypoint",stageId:"F2",
        type:"development",ownerRole:"Core Agent",platform:"Go",
        dependsOn:["F0"],acceptance:"Core starts under real integration checks",
        allowedPaths:["services/core/cmd/**"],requiredGates:["docs"]},
      {id:"IDEA-QA",title:"Test Core API behavior",stageId:"F2",
        type:"testing",ownerRole:"QA Agent",platform:"Go",
        dependsOn:["IDEA-CORE"],acceptance:"Actual restart and invalid token tests pass",
        allowedPaths:["tests/**"],requiredGates:["docs"]},
      {id:"IDEA-INT",title:"Test client to Core integration",stageId:"F2",
        type:"integration",ownerRole:"Integration Agent",platform:"iOS",
        dependsOn:["IDEA-QA"],acceptance:"Physical device integration evidence is recorded",
        allowedPaths:["tests/**"],requiredGates:["docs"]},
      {id:"IDEA-REL",title:"Evaluate actual release evidence",stageId:"F2",
        type:"release",ownerRole:"Release Agent",platform:"Release",
        dependsOn:["IDEA-INT"],acceptance:"Go, privacy and device release checks are independently verified",
        allowedPaths:["docs/**"],requiredGates:["docs"]},
    ] as any[];
    const base={release:"V0.1",scopeSource:"docs/roadmap/idea-version.md",
      stages:[{id:"F0",verifiedTaskIds:["F0"]},{id:"F2"}],
      workItems,rationale:"Independent version review covers code, QA, integration and release phases."};
    const plan={...base,agentReview:{
      reviewer:"independent-planning-agent",method:"independent-agent-pass",
      subjectHash:releaseReviewSubjectHash(base as any),
      sourceRefs:["docs/roadmap/idea-version.md"],reviewedStageIds:["F0","F2"],
      checks:REVIEW_DIMENSIONS.map(dimension=>({dimension,
        conclusion:"Independently assessed original product scope and risks: "+dimension,
        workItemIds:["IDEA-CORE","IDEA-QA"]})),
    }};
    const staged=ledger!.stageReleaseWork(plan as any,"planner");
    expect(staged.status).toBe("review_pending");
    ledger!.approveReleaseWork("V0.1",staged.hash);
    const frozenHash=ledger!.releaseWorkPlan("V0.1").frozenHash;
    const baseline=git("rev-parse","HEAD");
    const candidate=ledger!.captureIdea({release:"V0.1",
      title:"Owner suggests PostgreSQL in place of the early SQLite candidate",
      description:"Assess whether to switch user-data persistence without modifying the active Core task.",
      sourceRef:"owner-conversation:new-direction",submittedBy:"conversation-agent"});
    expect(candidate.status).toBe("captured");
    expect(candidate.executableTaskCreated).toBe(false);
    expect(ledger!.get("IDEA-CORE").status).toBe("ready");
    const impact={
      recommendation:"adopt" as const,placement:"after_task" as const,
      targetStageId:"F2",targetTaskId:"IDEA-CORE",
      affectedTaskIds:["IDEA-CORE","IDEA-QA","IDEA-INT"],
      assessedBy:"planning-agent",
      rationale:"The owner explicitly chooses PostgreSQL for Neyna business data, not DevControl SQLite.",
      alternatives:"Defer the provider selection or use a dedicated PostgreSQL Store Port after Go bootstrap.",
      dependencyImpact:"PostgreSQL integration needs module scaffolding and database-specific tests after bootstrap.",
      securityAndTestImpact:"Test credentials, migration failure, deletion restoration and unavailable database handling.",
      versionImpact:"Propose inserting a separate task after the Core bootstrap and before dependent API integration.",
      evidenceRefs:["docs/roadmap/idea-version.md","IDEA-CORE","IDEA-QA"],
    };
    expect(()=>ledger!.assessIdea(candidate.id,{
      ...impact,targetTaskId:"NONEXISTENT"},candidate.revision))
      .toThrow(/targetTaskId|existing|insertion/i);
    const assessed=ledger!.assessIdea(candidate.id,impact,candidate.revision);
    expect(assessed.status).toBe("assessed");
    expect(assessed.assessmentHash).toMatch(/^[a-f0-9]{64}$/);
    const review={
      reviewer:"separate-review-agent",method:"independent-agent-pass" as const,
      subjectHash:assessed.assessmentHash,
      checks:IDEA_REVIEW_DIMENSIONS.map(dimension=>({
        dimension,conclusion:"Independently checked exact baseline, dependencies and regression risk for "+dimension,
        taskIds:["IDEA-CORE","IDEA-QA"],
      })),
    };
    expect(()=>ledger!.reviewIdea(candidate.id,{
      ...review,reviewer:"planning-agent"},assessed.revision))
      .toThrow(/separate/i);
    expect(()=>ledger!.reviewIdea(candidate.id,{
      ...review,subjectHash:"f".repeat(64)},assessed.revision))
      .toThrow(/stale/i);
    const reviewed=ledger!.reviewIdea(candidate.id,review as any,assessed.revision);
    expect(reviewed.status).toBe("reviewed");
    expect(()=>ledger!.decideIdea(candidate.id,{
      disposition:"adopt",approvedBy:"owner-audit-label",
      expectedReviewHash:reviewed.reviewHash,expectedRevision:reviewed.revision,
      reason:"Keep the suggested architecture change for a separately approved release amendment.",
      explicitAuthorization:false,
    })).toThrow(/explicitly authorize/i);
    expect(()=>ledger!.decideIdea(candidate.id,{
      disposition:"adopt",approvedBy:"owner-audit-label",
      expectedReviewHash:"f".repeat(64),expectedRevision:reviewed.revision,
      reason:"Owner approved this change for a later separate version planning pass.",
      explicitAuthorization:true,
    })).toThrow(/Exact independent review hash/);
    const authorized=ledger!.decideIdea(candidate.id,{
      disposition:"adopt",approvedBy:"owner-audit-label",
      expectedReviewHash:reviewed.reviewHash,expectedRevision:reviewed.revision,
      reason:"Owner approved a separate proposal, not direct coding or immediate reordering.",
      explicitAuthorization:true,
    });
    expect(authorized).toMatchObject({status:"approved_for_planning",
      executableTaskCreated:false,frozenPlanChanged:false});
    expect(authorized.history).toHaveLength(4);
    expect(ledger!.listIdeas("V0.1").ideas).toHaveLength(1);
    expect(ledger!.releaseWorkPlan("V0.1").frozenHash).toBe(frozenHash);
    expect(ledger!.get("IDEA-CORE").status).toBe("ready");
    expect(ledger!.get("IDEA-QA").dependsOn).toEqual(["IDEA-CORE"]);
    expect(git("rev-parse","HEAD")).toBe(baseline);
    expect(git("status","--porcelain")).toBe("");
    // A justified new idea CAN be admitted into the currently claimed task
    // when that task's original contract already covers it. The idea alone
    // creates no lease, new scope, dependency or executable work item.
    const claim=ledger!.claim("IDEA-CORE","core-implementation-agent");
    const inside=ledger!.captureIdea({release:"V0.1",
      title:"Strengthen the already approved Core startup health behavior",
      description:"The existing entrypoint should correctly reject unhealthy startup without changing its acceptance or file scope.",
      sourceRef:"owner-feedback:current-task",submittedBy:"current-conversation-agent"});
    const insideAssessment=ledger!.assessIdea(inside.id,{
      ...impact,recommendation:"adopt",placement:"within_task",
      rationale:"The claimed Core entrypoint can enforce its original startup health acceptance inside the unchanged allowed paths.",
      alternatives:"Add a later separate task, but it would repeat the same approved scope and acceptance.",
      versionImpact:"No change to the frozen workload, dependencies or acceptance is needed; execute during the claimed work.",
    },inside.revision);
    const insideReview=ledger!.reviewIdea(inside.id,{
      ...review,subjectHash:insideAssessment.assessmentHash,
    } as any,insideAssessment.revision);
    const insideDecision=ledger!.decideIdea(inside.id,{
      disposition:"adopt",approvedBy:"owner-explicit-current-task",
      expectedRevision:insideReview.revision,
      expectedReviewHash:insideReview.reviewHash,
      reason:"This evaluated improvement fits the existing approved task and should be included now.",
      explicitAuthorization:true,
    });
    expect(insideDecision).toMatchObject({
      status:"approved_for_planning",canProceedWithinExistingTask:true,
      releaseAmendmentRequired:false,executableTaskCreated:false,
      frozenPlanChanged:false,
    });
    expect(insideDecision.nextGate).toMatch(/Existing task contract/);
    expect(ledger!.get("IDEA-CORE").status).toBe("in_progress");
    expect(ledger!.releaseWorkPlan("V0.1").frozenHash).toBe(frozenHash);
    ledger!.release("IDEA-CORE",claim.leaseToken);
    // Deferral without a known insertion stage is a valid assessment result,
    // not a reason to invent a task or force an artificial future date.
    const uncertain=ledger!.captureIdea({release:"V0.1",
      title:"Explore optional future telemetry export",
      description:"No committed customer or runtime need; feasibility and risk remain uncertain.",
      sourceRef:"owner-feedback:optional-research",submittedBy:"analysis-agent"});
    const deferred=ledger!.assessIdea(uncertain.id,{
      ...impact,recommendation:"defer",placement:"none",
      targetStageId:"",targetTaskId:undefined,affectedTaskIds:[],
      rationale:"No direct requirement justifies insertion in this release yet; revisit once usage is observed.",
      versionImpact:"No target version is chosen until measurable demand supports a planning slot.",
    },uncertain.revision);
    expect(deferred).toMatchObject({status:"assessed"});
  });
  it("does not turn a new idea into executable work or change the frozen release without reviewed planning",()=>{
    save("docs/roadmap/idea-release.md",
      "# Scope\n\n| 阶段 | 内容 |\n| --- | --- |\n| F0 | 已验证基础 |\n| F2 | Core 实现与验收 |\n");
    commit("scope baseline");
    const items=[
      {id:"ID-DEC",title:"确定鉴权方案",type:"decision",stageId:"F2",
        ownerRole:"Security",platform:"Go",dependsOn:["F0"],
        acceptance:"清楚记录安全选择和风险",allowedPaths:[],requiredGates:["sqlite_decision"]},
      {id:"ID-DEV",title:"实现HTTP接口",type:"development",stageId:"F2",
        ownerRole:"Core",platform:"Go",dependsOn:["ID-DEC"],
        acceptance:"运行端到端 Go HTTP 测试",allowedPaths:["services/core/**"],requiredGates:["docs"]},
      {id:"ID-QA",title:"测试安全拒绝行为",type:"testing",stageId:"F2",
        ownerRole:"QA",platform:"Go",dependsOn:["ID-DEV"],
        acceptance:"真实拒绝请求测试通过",allowedPaths:["tests/**"],requiredGates:["docs"]},
      {id:"ID-INT",title:"完成接口集成验证",type:"integration",stageId:"F2",
        ownerRole:"Integration",platform:"Go",dependsOn:["ID-QA"],
        acceptance:"跨模块真实集成验证通过",allowedPaths:["tests/**"],requiredGates:["docs"]},
      {id:"ID-REL",title:"确认发布门禁",type:"release",stageId:"F2",
        ownerRole:"Release",platform:"Go",dependsOn:["ID-INT"],
        acceptance:"发布测试证据完整有效",allowedPaths:["docs/**"],requiredGates:["docs"]},
    ] as any[];
    const base={release:"V0.1",scopeSource:"docs/roadmap/idea-release.md",
      stages:[{id:"F0",verifiedTaskIds:["F0"]},{id:"F2"}],workItems:items,
      rationale:"Fully review the security design, real implementation, test and release chain before freeze."};
    const plan={...base,agentReview:{reviewer:"separate-planning-reviewer",
      method:"independent-agent-pass" as const,
      subjectHash:releaseReviewSubjectHash(base as any),
      sourceRefs:["docs/roadmap/idea-release.md"],reviewedStageIds:["F0","F2"],
      checks:REVIEW_DIMENSIONS.map(dimension=>({dimension,
        conclusion:"Inspected the original design risks and proper timing for "+dimension,
        workItemIds:["ID-DEC","ID-DEV"]})),
    }};
    expect(ledger!.reviewReleaseWork(plan as any).passed).toBe(true);
    const proposal=ledger!.stageReleaseWork(plan as any,"planning-agent");
    ledger!.approveReleaseWork("V0.1",proposal.hash);
    const baseline=ledger!.releaseWorkPlan("V0.1").frozenHash;
    const initialCount=ledger!.list().length,head=git("rev-parse","HEAD");
    const idea=ledger!.captureIdea({release:"V0.1",title:"考虑支持 PostgreSQL",
      description:"User proposed changing the production database; analyze risks and schedule before changing any tasks.",
      sourceRef:"user-request:database-2026-10-22",submittedBy:"idea-capture-agent"});
    expect(idea).toMatchObject({status:"captured",revision:1,executableTaskCreated:false});
    expect(ledger!.list()).toHaveLength(initialCount);
    const assessment={
      recommendation:"adopt" as const,placement:"after_task" as const,
      targetStageId:"F2",targetTaskId:"ID-DEC",affectedTaskIds:["ID-DEC","ID-DEV"],
      rationale:"The new provider changes production storage semantics and must be assessed before HTTP implementation.",
      alternatives:"Retain the initial proposed provider versus schedule a reviewed PostgreSQL implementation.",
      dependencyImpact:"Database driver and migration design must precede Core endpoint persistence work.",
      securityAndTestImpact:"Introduce real PostgreSQL integration, backup recovery and deletion regression tests.",
      versionImpact:"A frozen release amendment is required before additional product tasks can execute.",
      evidenceRefs:["docs/roadmap/idea-release.md","frozen-task:ID-DEC"],
      assessedBy:"business-analysis-agent",
    };
    expect(()=>ledger!.assessIdea(idea.id,{...assessment,targetTaskId:"NOT-IN-PLAN"},1))
      .toThrow(/affectedTaskIds|targetTaskId/);
    const assessed=ledger!.assessIdea(idea.id,assessment,1);
    expect(assessed).toMatchObject({status:"assessed",revision:2});
    expect(()=>ledger!.assessIdea(idea.id,assessment,1)).toThrow(/revision changed/);
    const checks=IDEA_REVIEW_DIMENSIONS.map(dimension=>({dimension,
      conclusion:"Independent assessment of requirements, timing and test impact for "+dimension,
      taskIds:["ID-DEC","ID-DEV"]}));
    expect(()=>ledger!.reviewIdea(idea.id,{reviewer:assessment.assessedBy,
      method:"independent-agent-pass",subjectHash:assessed.assessmentHash,checks},2))
      .toThrow(/separate independent/);
    const reviewed=ledger!.reviewIdea(idea.id,{
      reviewer:"separate-review-agent",method:"independent-agent-pass",
      subjectHash:assessed.assessmentHash,checks},2);
    expect(reviewed).toMatchObject({status:"reviewed",revision:3});
    expect(()=>ledger!.decideIdea(idea.id,{
      disposition:"adopt",approvedBy:"user-explicit-authorization",
      expectedRevision:3,expectedReviewHash:"0".repeat(64),
      reason:"Accept after evaluating product needs and rollback risk.",
      explicitAuthorization:true}))
      .toThrow(/review hash/);
    const decided=ledger!.decideIdea(idea.id,{
      disposition:"adopt",approvedBy:"user-explicit-authorization",
      expectedRevision:3,expectedReviewHash:reviewed.reviewHash,
      reason:"Accept for subsequent formal release amendment planning, not immediate coding.",
      explicitAuthorization:true});
    expect(decided).toMatchObject({
      status:"approved_for_planning",revision:4,
      frozenPlanChanged:false,executableTaskCreated:false});
    expect(ledger!.getIdea(idea.id).history).toHaveLength(4);
    expect(ledger!.listIdeas("V0.1").ideas).toHaveLength(1);
    expect(ledger!.releaseWorkPlan("V0.1").frozenHash).toBe(baseline);
    expect(ledger!.list()).toHaveLength(initialCount);
    expect(ledger!.get("ID-DEV").status).toBe("ready");
    expect(git("rev-parse","HEAD")).toBe(head);
    expect(git("status","--porcelain")).toBe("");
    expect(()=>ledger!.decideIdea(idea.id,{
      disposition:"adopt",approvedBy:"someone",expectedRevision:3,
      expectedReviewHash:reviewed.reviewHash,reason:"Try to approve twice without new review.",
      explicitAuthorization:true}))
      .toThrow(/Review the idea first/);
  });
  it("records frozen architecture decisions solely in SQLite without ADR Markdown or Git commits",()=>{
    save("docs/roadmap/decision-version.md",
      "# Test scope\n\n| 阶段 | 说明 |\n| --- | --- |\n| F0 | 基线 |\n| F2 | 设计与验收 |\n");
    commit("freeze baseline scope");
    const rows=[
      {id:"WORK-DEC1",title:"确定一致性备份语义",stageId:"F2",type:"decision",
        ownerRole:"Core Architect",platform:"Go",dependsOn:["F0"],
        acceptance:"记录恢复失败处理及风险权衡",allowedPaths:[],requiredGates:["sqlite_decision"]},
      {id:"WORK-DEC2",title:"审核设备令牌设计",stageId:"F2",type:"decision",
        ownerRole:"Security Architect",platform:"Go",dependsOn:["WORK-DEC1"],
        acceptance:"形成设备鉴权选择及回滚意见",
        allowedPaths:["docs/architecture/**"],requiredGates:["docs"]},
      {id:"WORK-DEV1",title:"实现存储服务代码",stageId:"F2",type:"development",
        ownerRole:"Go Core Agent",platform:"Go",dependsOn:["WORK-DEC2"],
        acceptance:"真实Go测试展示正确持久写入",
        allowedPaths:["services/core/**"],requiredGates:["docs"]},
      {id:"WORK-TEST",title:"测试Core集成结果",stageId:"F2",type:"testing",
        ownerRole:"QA Agent",platform:"Go",dependsOn:["WORK-DEV1"],
        acceptance:"真实重启测试及故障注入可复现",
        allowedPaths:["tests/**"],requiredGates:["docs"]},
      {id:"WORK-INT1",title:"确认跨端联调结果",stageId:"F2",type:"integration",
        ownerRole:"Integration Agent",platform:"iOS/Go",dependsOn:["WORK-TEST"],
        acceptance:"记录完整双端测试与失败回退",
        allowedPaths:["tests/**"],requiredGates:["docs"]},
      {id:"WORK-REL1",title:"复核最终版本验收",stageId:"F2",type:"release",
        ownerRole:"Release Agent",platform:"Release",dependsOn:["WORK-INT1"],
        acceptance:"发布前实际测试结果全部核实",
        allowedPaths:["docs/**"],requiredGates:["docs"]},
    ] as any[];
    const base={release:"V0.1",scopeSource:"docs/roadmap/decision-version.md",
      stages:[{id:"F0",verifiedTaskIds:["F0"]},{id:"F2"}],workItems:rows,
      rationale:"The reviewed full roster preserves verified baseline, independent decisions and all required test/release dependencies."};
    const plan={...base,agentReview:{
      reviewer:"independent-reviewer",method:"independent-agent-pass" as const,
      subjectHash:releaseReviewSubjectHash(base as any),
      sourceRefs:["docs/roadmap/decision-version.md"],
      reviewedStageIds:["F0","F2"],
      checks:REVIEW_DIMENSIONS.map(dimension=>({
        dimension,conclusion:"Independently inspected original requirements and risks for "+dimension,
        workItemIds:["WORK-DEC1","WORK-DEC2"]})),
    }};
    const wrong={...plan,workItems:rows.map((row,i)=>i===2?
      {...row,allowedPaths:[],requiredGates:["sqlite_decision"]}:row)};
    expect(ledger!.reviewReleaseWork(wrong as any).issues.some((s:string)=>
      s.includes("SQLite-only decision"))).toBe(true);
    expect(ledger!.reviewReleaseWork(plan as any).passed).toBe(true);
    const stage=ledger!.stageReleaseWork(plan as any,"planner");
    expect(stage.status).toBe("review_pending");
    ledger!.approveReleaseWork("V0.1",stage.hash);
    const head=git("rev-parse","HEAD");
    const first=ledger!.claim("WORK-DEC1","decision-agent");
    expect(ledger!.executionContract("WORK-DEC1").deliveryModes).toEqual(
      ["sqlite-decision","legacy-git"]);
    expect(ledger!.checkStaged()).toMatchObject({passed:false});
    expect(ledger!.getDecision("WORK-DEC1").decision).toBeNull();
    expect(()=>ledger!.recordDecision("WORK-DEV1",first.leaseToken,{} as never))
      .toThrow(/lease/i);
    const fields={
      status:"proposed" as const,
      question:"How should Go Core recover from an interrupted SQLite backup?",
      decision:"Use the online backup API and fail closed before enabling queries.",
      rationale:"Raw WAL file copying can omit committed transactions and expose stale deletion snapshots.",
      alternatives:"Raw file copy is rejected; external PostgreSQL is deferred pending real workload tests.",
      consequences:"Recovery must verify external deletion ledger before exposing any remembered content.",
      verificationPlan:"Execute online backup, interrupted migration and deleted-history restoration fixtures.",
    };
    expect(()=>ledger!.recordDecision("WORK-DEC1",first.leaseToken,{
      ...fields,decision:"short"})).toThrow(/substantial/);
    const recorded=ledger!.recordDecision("WORK-DEC1",first.leaseToken,fields);
    expect(recorded).toMatchObject({revision:1,status:"proposed"});
    expect(()=>ledger!.recordDecision("WORK-DEC1",first.leaseToken,{
      ...fields,expectedRevision:0})).toThrow(/current decision revision/);
    expect(ledger!.recordDecision("WORK-DEC1",first.leaseToken,{
      ...fields,expectedRevision:1,status:"decided"})).toMatchObject({revision:2});
    const history=ledger!.getDecision("WORK-DEC1");
    expect(history.history).toHaveLength(2);
    expect(history.decision.status).toBe("decided");
    ledger!.complete("WORK-DEC1",first.leaseToken,{
      summary:"A standalone SQLite backup decision is recorded for this task.",
      implementation:"Only DevControl decision-save changed local SQLite with versioned audit.",
      verification:"The record has complete alternatives and negative recovery tests.",
      remaining:"Production encryption and real recovery still need G2 and implementation.",
    });
    ledger!.report("WORK-DEC1",first.leaseToken,{kind:"sqlite_decision",
      reference:"decision:WORK-DEC1#revision=2"},true);
    expect(ledger!.verify('WORK-DEC1',first.leaseToken)).toMatchObject({
      passed:false,reason:'TASK_REVIEW_REQUIRED'});
    const decisionHandoff=ledger!.handoffReview('WORK-DEC1',{
      leaseToken:first.leaseToken,actor:'decision-agent',
      reason:'Submitted immutable decision record to a distinct Agent for security review',
    });
    ledger!.independentTaskReview('WORK-DEC1',decisionHandoff.ticket,{
      reviewer:'security-reviewer',outcome:'passed',
      findings:'Inspected the two historical decision revisions and verified the accepted recovery constraints.',
      evidenceReference:'decision:WORK-DEC1#revision=2',
    });
    expect(ledger!.verifyReviewedTask("WORK-DEC1",decisionHandoff.ticket)).toMatchObject({
      passed:true,files:[],results:{sqlite_decision:{passed:true}}});
    expect(git("rev-parse","HEAD")).toBe(head);
    expect(git("status","--porcelain")).toBe("");
    expect(fs.existsSync(path.join(root,"docs/architecture/decisions"))).toBe(false);
    // The already frozen legacy docs-gated decision can *explicitly* opt in;
    // its frozen plan hash, file scope and gates are not silently rewritten.
    const second=ledger!.claim("WORK-DEC2","security-agent");
    expect(second.task.requiredGates).toEqual(["docs"]);
    ledger!.recordDecision("WORK-DEC2",second.leaseToken,{
      ...fields,question:"How can the iPhone authenticate against the local Go Core?",
      decision:"Use per-device revocable bearer credentials and server-verified TLS connections.",
    });
    ledger!.complete("WORK-DEC2",second.leaseToken,{
      summary:"Device authentication choice saved to SQLite, no Markdown was created.",
      implementation:"Existing frozen docs gate is replaced only for this explicitly recorded decision.",
      verification:"Reviewed offline and expired-token failure behavior without claiming product tests.",
    });
    ledger!.report("WORK-DEC2",second.leaseToken,{kind:"sqlite_decision",
      reference:"decision:WORK-DEC2#revision=1"},true);
    const legacyDecisionHandoff=ledger!.handoffReview('WORK-DEC2',{
      leaseToken:second.leaseToken,actor:'security-agent',
      reason:'Legacy frozen decision is ready for a separate evidence-based review',
    });
    ledger!.independentTaskReview('WORK-DEC2',legacyDecisionHandoff.ticket,{
      reviewer:'independent-policy-reviewer',outcome:'passed',
      findings:'Independently checked bearer token revocation and expiry against the persisted decision.',
      evidenceReference:'decision:WORK-DEC2#revision=1',
    });
    expect(ledger!.verifyReviewedTask("WORK-DEC2",legacyDecisionHandoff.ticket)).toMatchObject({
      passed:true,files:[],results:{sqlite_decision:{passed:true}}});
    expect(ledger!.get("WORK-DEV1").status).toBe("ready");
    expect(ledger!.executionContract("WORK-DEC2").requiredGates).toEqual(["docs"]);
    expect(git("rev-parse","HEAD")).toBe(head);
  });
  it("normalizes old SQLite draft file-template hints without rewriting historical rows",()=>{
    ledger!.saveFeature({name:"old-guidance",description:"Legacy feature stored SQLite with file hints",
      layout:"flat",plan:{},draft:{specOutputs:["docs/specs/old-guidance/tasks.md"],
        guidance:"Agent 必须创建三个文件 requirements.md / design.md / tasks.md",
        structuredContent:{obsolete:true}}});
    const f=ledger!.getFeature("old-guidance");
    expect(f.draft.specOutputs).toEqual([]);
    expect(f.draft.guidance).toContain("不生成");
    expect(f.draft.structuredContent).toBeNull();
  });
  it("imports 56 reviewed atomic tasks within one bounded transaction and reconciles lost replies",()=>{
    save("docs/roadmap/bulk-version.md","# Version\n\n| 阶段 | 描述 |\n| --- | --- |\n| F0 | 旧基线 |\n| F1 | 新工作 |\n| F2 | 联调 |\n| F3 | 验收 |\n");
    commit("freeze bulk version scope");
    const verificationItems=Array.from({length:54},(_,index)=>({
      id:"BULK-"+String(index+1).padStart(3,"0"),
      title:"验证事件批次 "+(index+1)+" 的边界输入",
      stageId:"F1",type:"testing" as const,ownerRole:"QA Engineer",platform:"Python",
      acceptance:"第 "+(index+1)+" 批非法输入拒绝且无持久副作用",
      allowedPaths:["tests/**"],requiredGates:["docs"],dependsOn:["F0"],
    }));
    const workItems=[...verificationItems,{
      id:"BULK-055",title:"执行全批次异常联调",stageId:"F2",type:"integration" as const,
      ownerRole:"Integration Engineer",platform:"Python",
      acceptance:"全部五十四批次都返回正确的拒绝状态",
      allowedPaths:["tests/**"],requiredGates:["docs"],
      dependsOn:verificationItems.map(item=>item.id),
    },{
      id:"BULK-056",title:"核验最终发布检查清单",stageId:"F3",type:"release" as const,
      ownerRole:"Release Engineer",platform:"Python",
      acceptance:"所有联调结果通过并保留发布核对记录",
      allowedPaths:["docs/**"],requiredGates:["docs"],dependsOn:["BULK-055"],
    }];
    const base={release:"V0.1",scopeSource:"docs/roadmap/bulk-version.md",
      rationale:"Validate independently bounded input batches with a stable upstream verified baseline and no scope creep.",
      stages:[{id:"F0",verifiedTaskIds:["F0"]},{id:"F1"},{id:"F2"},{id:"F3"}],workItems};
    const plan={...base,agentReview:{reviewer:"same-developer-later-pass",
      method:"agent-self-check" as const,
      subjectHash:releaseReviewSubjectHash(base as any),
      sourceRefs:["docs/roadmap/bulk-version.md"],reviewedStageIds:["F0","F1","F2","F3"],
      checks:REVIEW_DIMENSIONS.map(dimension=>({
        dimension,conclusion:"Rechecked exact batch scope and acceptance requirements for "+dimension,
        workItemIds:["BULK-001","BULK-056"],
      }))}};
    const reviewed=ledger!.reviewReleaseWork(plan as any);
    expect(reviewed.issues).toEqual([]);
    const proposed=ledger!.stageReleaseWork(plan as any,"solo-planner");
    const start=performance.now();
    const frozen=ledger!.approveReleaseWork("V0.1",proposed.hash);
    const elapsed=performance.now()-start;
    expect(frozen.added).toHaveLength(56);
    expect(elapsed).toBeLessThan(20000);
    expect(ledger!.get("BULK-056").status).toBe("ready");
    expect(ledger!.approveReleaseWork("V0.1",proposed.hash)).toMatchObject({
      status:"frozen",alreadyApplied:true,hash:proposed.hash,
    });
    expect(ledger!.list().filter(task=>task.id.startsWith("BULK-"))).toHaveLength(56);
  });

  it("plans an entire version as simple single-action rows, blocks early coding, then atomically approves", async () => {
    save("docs/roadmap/test-version.md",
      "# Version\n\n| 阶段 | 描述 |\n| --- | --- |\n| F0 | 已验证基线 |\n| F1 | 接口准备 |\n| F2 | 联调发布 |\n");
    commit("freeze release scope");
    const items = [
      {id:"WORK-101",title:"实现本地事件创建接口",stageId:"F1",type:"development",
        owner:"Core Agent",platform:"Go",requirementIds:["FR-101"],
        dependsOn:["F0"],acceptance:"首次写入返回稳定事件编号",
        allowedPaths:["services/core/**"],requiredGates:["docs"]},
      {id:"WORK-102",title:"验证事件写入接口",stageId:"F1",type:"testing",
        owner:"QA Agent",platform:"Go",dependsOn:["WORK-101"],acceptance:"测试用例通过且附带执行日志",
        allowedPaths:["tests/contracts/**"],requiredGates:["docs"]},
      {id:"WORK-103",title:"执行跨端联调",stageId:"F2",type:"integration",
        owner:"Integration Agent",platform:"iOS/Go",dependsOn:["WORK-102"],acceptance:"联调请求正确生成持久事件",
        allowedPaths:["tests/contracts/**"],requiredGates:["docs"]},
      {id:"WORK-104",title:"验证版本发布清单",stageId:"F2",type:"release",
        owner:"Release Agent",platform:"Release",dependsOn:["WORK-103"],acceptance:"版本发布检查表逐项通过",
        allowedPaths:["docs/**"],requiredGates:["docs"]},
    ] as const;
    const plan={release:"V0.1",scopeSource:"docs/roadmap/test-version.md",
      rationale:"All current-version stages, independent development, testing, integration and final release evidence are included.",
      stages:[{id:"F0",verifiedTaskIds:["F0"]},{id:"F1"},{id:"F2"}],
      workItems:items.map(x=>({...x,dependsOn:[...x.dependsOn],
        allowedPaths:[...x.allowedPaths],requiredGates:[...x.requiredGates]}))};
    const withReview=(roster:any)=>({...roster,agentReview:{
      reviewer:"independent-quality-review-agent",
      method:"independent-agent-pass" as const,
      subjectHash:releaseReviewSubjectHash(roster as any),
      sourceRefs:["docs/roadmap/test-version.md"],
      reviewedStageIds:["F0","F1","F2"],
      checks:REVIEW_DIMENSIONS.map(dimension=>({
        dimension,conclusion:"Independently checked original scope and task evidence for "+dimension,
        workItemIds:["WORK-101","WORK-102","WORK-103","WORK-104"],
      })),
    }});
    const largeTitle={...plan,workItems:plan.workItems.map((item,index)=>index===0?
      {...item,title:"完成接口以及测试以及前后端全部功能"}:item)};
    const vague={...plan,workItems:plan.workItems.map((item,index)=>index===0?
      {...item,acceptance:"以真实证据证明：实现本地事件创建接口已按需求完成。"}:item)};
    expect(ledger!.reviewReleaseWork(vague as any).issues).toContain(
      "WORK-101: generic self-referential acceptance is not independently verifiable");
    expect(ledger!.reviewReleaseWork(largeTitle as any).passed).toBe(false);
    const draft=ledger!.stageReleaseWork(largeTitle as any,"planner");
    expect(draft.status).toBe("needs_revision");
    expect(()=>ledger!.approveReleasePlan("V0.1","owner","a".repeat(64)))
      .toThrow(/Use release-work-review and release-work-approve/);
    const web=createDevControlBoardServer(ledger!);
    await new Promise<void>(resolve=>web.listen(0,"127.0.0.1",resolve));
    try {
      const addr=web.address();
      const port=addr&&typeof addr==="object"?addr.port:0;
      const response=await fetch("http://127.0.0.1:"+port+"/api/release-work-plan");
      expect(response.status).toBe(200);
      const version=await response.json();
      expect(version.status).toBe("needs_revision");
      expect(version.proposal.plan.workItems[0].acceptance).toBe("首次写入返回稳定事件编号");
    } finally {await new Promise<void>(resolve=>web.close(()=>resolve()));}
    expect(ledger!.get("F0").status).toBe("verified");
    expect(()=>ledger!.approveReleaseWork("V0.1",draft.hash)).toThrow(/title must describe one bounded action/);
    expect(()=>ledger!.get("WORK-101")).toThrow();
    expect(ledger!.reviewReleaseWork(plan as any).issues)
      .toContain("Agent semantic review missing: review this plan before version activation");
    const complete=withReview(plan);
    const review=ledger!.reviewReleaseWork(complete as any);
    expect(review).toMatchObject({passed:true,workItemCount:4});
    const strictPlan={...plan,qualityProfile:"task-detail-v1"};
    const strictReview=ledger!.reviewReleaseWork(withReview(strictPlan) as any);
    expect(strictReview.passed).toBe(false);
    expect(strictReview.issues).toContain("WORK-101: detailed task brief missing purpose");
    expect(strictReview.issues).toContain("WORK-101: detailed task brief missing testCases");
    expect(review.reviewSubjectHash).toBe(complete.agentReview.subjectHash);
    const stale={...complete,workItems:complete.workItems.map((item:any,index:number)=>index===0?
      {...item,acceptance:"首次写入后得到可持久查询的编号"}:item)};
    expect(ledger!.reviewReleaseWork(stale as any).issues)
      .toContain("Agent semantic review is stale: task/requirements/stage roster changed");
    const fakeReview={...complete,agentReview:{...complete.agentReview,
      checks:complete.agentReview.checks.map((check:any,index:number)=>index===0?{
        ...check,workItemIds:["MISSING-FAKE-TASK"]}:check)}};
    expect(ledger!.reviewReleaseWork(fakeReview as any).issues.some((issue:string)=>
      issue.includes("needs a reasoned conclusion and existing work-item examples"))).toBe(true);
    const uncovered={...plan,requiredRequirementIds:["FR-101","NFR-006"],
      requirementsSource:"docs/roadmap/test-version.md"};
    const missing=ledger!.reviewReleaseWork(uncovered as any);
    expect(missing.issues).toContain("Whole-version requirement NFR-006 has no independent work item");
    const manual={...plan,reviewFindings:[{id:"RISK-01",title:"Authorization policy not approved",
      detail:"Requires Owner architecture review before implementation",severity:"blocker",status:"open"}]};
    expect(ledger!.reviewReleaseWork(manual as any).issues.some((value:string)=>
      value.includes("Version review blocker RISK-01"))).toBe(true);
    const autonomousPlan={...plan,workItems:plan.workItems.map(item=>
      ({...item,owner:undefined,ownerRole:"Implementation Agent"})),
      reviewFindings:[{id:"RISK-01",title:"Authorization enforcement pending",
        detail:"Design decided; implementation and actual tests must follow",
        decision:"Keep all Core reads and writes behind a server-verified device credential.",
        nextAction:"Implement Core guard and confirm unauthorized requests cannot read user data.",
        decisionStatus:"decided",verificationStatus:"pending",status:"open",
        affectedIds:["WORK-101"],severity:"blocker"}]};
    const autonomous={...withReview(autonomousPlan),reviewFindings:autonomousPlan.reviewFindings};
    expect(ledger!.reviewReleaseWork(autonomous as any).passed).toBe(true);
    const fakePassed={...autonomous,reviewFindings:[{
      ...autonomous.reviewFindings[0],status:"resolved",verificationStatus:"passed"}]};
    expect(ledger!.reviewReleaseWork(fakePassed as any).issues).toContain(
      "Verification cannot pass without evidence and resolution: RISK-01");
    const fakeClosed={...autonomous,reviewFindings:[{
      ...autonomous.reviewFindings[0],status:"resolved"}]};
    expect(ledger!.reviewReleaseWork(fakeClosed as any).issues).toContain(
      "Unverified product outcome cannot be closed: RISK-01");
    const bypassed={...plan,workItems:plan.workItems.map(item=>
      item.id==="WORK-104"?{...item,dependsOn:["WORK-101"]}:item)};
    expect(ledger!.reviewReleaseWork(bypassed as any).issues.some((value:string)=>
      value.includes("Final release acceptance has no dependency chain"))).toBe(true);
    const pending=ledger!.stageReleaseWork(complete as any,"planner",draft.hash);
    expect(pending.status).toBe("review_pending");
    expect(()=>ledger!.claim("F1","agent")).toThrow();
    const approved=ledger!.approveReleaseWork("V0.1",pending.hash);
    expect(approved.added).toEqual(items.map(item=>item.id));
    // General frozen-scope amendments preserve completed work and old plan
    // history. A proposer cannot self-review or self-approve by staging.
    const amendment={release:"V0.1",baseRevision:1,baseHash:approved.hash,
      changes:[{taskId:"WORK-102",addAllowedPaths:["services/core/go.mod",
        "services/core/internal/http_integration_test.go"]}],
      rationale:"The test task needs an actual Core module and executable HTTP integration tests outside its current frozen file scope.",
      alternatives:"A separate module bootstrap task would require a new reviewed dependency and makes this atomic test unnecessarily indirect.",
      verificationPlan:"Keep the original docs Gate and run the real Core HTTP integration Gate when a future approved task requires it.",
      sourceRefs:["task:WORK-102","docs/roadmap/test-version.md"]};
    expect(ledger!.reviewReleaseWorkScopeAmendment({...amendment,
      changes:[{taskId:"WORK-999",addAllowedPaths:["services/core/go.mod"]}]}))
      .toMatchObject({passed:false});
    expect(ledger!.reviewReleaseWorkScopeAmendment({...amendment,
      changes:[{taskId:"WORK-102",addAllowedPaths:["../outside"]}]}))
      .toMatchObject({passed:false});
    expect(ledger!.reviewReleaseWorkScopeAmendment(amendment)).toMatchObject({passed:true});
    const stagedScope=ledger!.stageReleaseWorkScopeAmendment(amendment,"planning-agent");
    expect(stagedScope).toMatchObject({status:"awaiting_independent_review",
      executableScopeChanged:false,
      requiredAgentAction:{
        responsible:"host_development_agent",kind:"scope_amendment",
        status:"agent_review_required",
        nextTool:"release-work-scope-independent-review",
        proposalHash:stagedScope.proposalHash,
        reviewHash:null,affectedTaskIds:["WORK-102"],
      }});
    expect(ledger!.releaseWorkScopeAmendment("V0.1")).toMatchObject({
      requiredAgentAction:{kind:"scope_amendment",
        nextTool:"release-work-scope-independent-review"},
    });
    expect(ledger!.next().pendingAgentActions).toContainEqual(
      expect.objectContaining({kind:"scope_amendment",status:"agent_review_required"}));
    expect(()=>ledger!.claim("WORK-102","coding-agent"))
      .toThrow(/Scope amendment.*awaits independent review/);
    expect(ledger!.next().blocked).toContainEqual(expect.objectContaining({
      id:"WORK-102",pendingScopeReview:true,
    }));
    // Reproduce a claim made by the OLD binary after an amendment was staged,
    // before v5 introduced the claim guard. The partial commit is inside the
    // ORIGINAL approved path and must remain in Git during recovery.
    const beforePartial=git("rev-parse","HEAD");
    const brokenToken="old-lease-for-scope-recovery";
    const oldDb=(ledger! as any).db;
    oldDb.prepare("UPDATE dc_tasks SET status='in_progress' WHERE id='WORK-102'").run();
    oldDb.prepare(`INSERT INTO dc_leases
      (singleton,task_id,agent,token,base_head,expires_at)
      VALUES(1,?,?,?,?,?)`).run("WORK-102","previous-agent",brokenToken,
      beforePartial,Date.now()+600_000);
    save("tests/contracts/partial-replay.json",'{"old_scope":true}\n');
    commit("already scoped partial Flutter-style task work");
    expect(()=>ledger!.report("WORK-102",brokenToken,{
      kind:"undefined",reference:"undefined"},true)).toThrow(/Evidence kind and reference required/);
    save("tests/contracts/uncommitted.json",'{"unsafe":true}\n');
    expect(()=>ledger!.pauseForScopeAmendment("WORK-102",brokenToken,
      "A prior Agent started implementation before scope review completed."))
      .toThrow(/Commit or revert local changes/);
    fs.rmSync(path.join(root,"tests/contracts/uncommitted.json"));
    // Longstanding Owner edits can coexist with committed, in-scope work.
    // They must not be stashed, reset, staged or silently dropped to obtain
    // a scope review. A complete tracked SHA-256 manifest preserves them.
    save("README.md","fixture\nowner pre-existing changes stay byte-identical\n");
    const ownedBytes=fs.readFileSync(path.join(root,"README.md"));
    const ownedHash=createRequire(import.meta.url)("node:crypto")
      .createHash("sha256").update(ownedBytes).digest("hex") as string;
    expect(()=>ledger!.pauseForScopeAmendment("WORK-102",brokenToken,
      "Preserve the older authorized commit and the Owner's unrelated dirty file."))
      .toThrow(/Commit or revert local changes/);
    expect(()=>ledger!.pauseForScopeAmendment("WORK-102",brokenToken,
      "Preserve the older authorized commit and the Owner's unrelated dirty file.",
      [{path:"README.md",sha256:"0".repeat(64)}]))
      .toThrow(/Preserved owner file changed/);
    expect(()=>ledger!.pauseForScopeAmendment("WORK-102",brokenToken,
      "Preserve the older authorized commit and the Owner's unrelated dirty file.",
      []))
      .toThrow(/Actual dirty files differ/);
    expect(()=>ledger!.release("WORK-102",brokenToken))
      .toThrow(/renew or reclaim/);
    const paused=ledger!.pauseForScopeAmendment("WORK-102",brokenToken,
      "A necessary real integration file was excluded from the frozen task's scope.",
      [{path:"README.md",sha256:ownedHash}]);
    expect(paused).toMatchObject({status:"ready",paused:true,reviewRequired:true,
      originalBaseHead:beforePartial,changedFiles:["tests/contracts/partial-replay.json"]});
    expect(fs.readFileSync(path.join(root,"README.md"))).toEqual(ownedBytes);
    expect(ledger!.get("WORK-102").status).toBe("ready");
    expect(()=>ledger!.claim("WORK-102","coding-agent"))
      .toThrow(/Scope amendment.*awaits independent review/);
    expect(()=>ledger!.pauseForScopeAmendment("WORK-102",brokenToken,
      "Attempt to replay an already exhausted original task lease"))
      .toThrow(/Active task lease token required/);
    expect(git("rev-parse","HEAD")).not.toBe(beforePartial);
    expect(ledger!.get("WORK-102").allowedPaths).toEqual(["tests/contracts/**"]);
    expect(ledger!.releaseWorkPlan("V0.1").scopeAmendment?.status)
      .toBe("awaiting_independent_review");
    const amendReview={reviewer:"second-agent",method:"independent-agent-pass" as const,
      subjectHash:stagedScope.proposalHash,affectedTaskIds:["WORK-102"],
      scopeAssessment:"The extra files are necessary only for creating real Core integration evidence and do not change product acceptance.",
      dependencyAssessment:"The change adds only file permissions for an unclaimed Ready task and leaves verified tasks and dependencies untouched.",
      securityAndTestAssessment:"The existing required Gate is preserved and a full integration test must produce actual evidence before verification.",
      sourceRefs:["task:WORK-102","docs/roadmap/test-version.md"]};
    expect(()=>ledger!.reviewStagedReleaseWorkScopeAmendment("V0.1",
      {...amendReview,reviewer:"planning-agent"},stagedScope.proposalHash))
      .toThrow(/Distinct independent reviewer/);
    const reviewed=ledger!.reviewStagedReleaseWorkScopeAmendment("V0.1",
      amendReview,stagedScope.proposalHash);
    expect(reviewed.status).toBe("reviewed");
    expect(reviewed.requiredAgentAction).toMatchObject({
      kind:"scope_amendment",status:"owner_authorization_required",
      nextTool:"release-work-scope-approve",proposalHash:stagedScope.proposalHash,
      reviewHash:reviewed.reviewHash,
    });
    const ownerArgs={release:"V0.1",expectedProposalHash:stagedScope.proposalHash,
      expectedReviewHash:reviewed.reviewHash,approvedBy:"test-owner",
      reason:"I authorize this exact scope addition while retaining the original product acceptance and test Gate.",
      explicitAuthorization:true};
    expect(()=>ledger!.approveReleaseWorkScopeAmendment({...ownerArgs,
      explicitAuthorization:false})).toThrow(/Explicit Owner authorization/);
    expect(()=>ledger!.approveReleaseWorkScopeAmendment({...ownerArgs,
      expectedReviewHash:"0".repeat(64)})).toThrow(/Exact staged proposal/);
    const amended=ledger!.approveReleaseWorkScopeAmendment(ownerArgs);
    expect(amended).toMatchObject({revision:2,previousHash:approved.hash,
      scopeOnly:true,affectedTaskIds:["WORK-102"]});
    expect(ledger!.releaseWorkPlan("V0.1")).toMatchObject({revision:2,
      frozenHash:amended.hash,scopeAmendment:null});
    expect(ledger!.get("WORK-102").allowedPaths).toEqual([
      "tests/contracts/**","services/core/go.mod","services/core/internal/http_integration_test.go"]);
    const pausedAudit=oldDb.prepare(
      "SELECT details_json FROM dc_audit WHERE task_id='WORK-102' AND event='scope_paused_for_review'"
    ).get();
    expect(JSON.parse(pausedAudit.details_json).originalBaseHead).toBe(beforePartial);
    // The actual prior work cannot be silently discarded. Resuming before
    // its frozen dependency is verified is still forbidden.
    expect(()=>ledger!.claim("WORK-102","coding-agent"))
      .toThrow(/depends on WORK-101/);
    expect(ledger!.get("F0").status).toBe("verified");
    expect(ledger!.get("WORK-101").allowedPaths).toEqual(["services/core/**"]);
    expect(()=>ledger!.stageReleaseWorkScopeAmendment(amendment,"planning-agent"))
      .toThrow(/revision or hash changed/);
    const history=(ledger! as any).db.prepare(
      "SELECT revision,hash FROM dc_release_work_history WHERE release='V0.1' ORDER BY revision").all();
    expect(history).toEqual([{revision:1,hash:approved.hash},{revision:2,hash:amended.hash}]);
    const contract=ledger!.executionContract("WORK-101");
    expect(contract).toMatchObject({eligible:true,profile:"atomic-work-item"});
    const audit=ledger!.taskDetailAudit("WORK-101");
    expect(audit).toMatchObject({taskId:"WORK-101",passed:false,
      scope:"frozen",qualityProfile:"legacy",retroactiveGateApplied:false});
    expect(audit.missing).toContain("purpose");
    expect(ledger!.executionContract("WORK-101").eligible).toBe(true);
    expect(contract.spec).toMatchObject({title:"实现本地事件创建接口",
      acceptance:"首次写入返回稳定事件编号"});
    expect(ledger!.get("WORK-101").owner).toBe("Core Agent");
    const prerequisite=ledger!.claim("WORK-101","coding-agent");
    expect(prerequisite.task.id).toBe("WORK-101");
    const underway={...amendment,baseRevision:2,baseHash:amended.hash,
      changes:[{taskId:"WORK-101",addAllowedPaths:["apps/client/ios/Runner/AppDelegate.swift"]}]};
    // Regression: a leased task with no recorded completion/evidence must be
    // able to STAGE a missing-file amendment before calling pause-for-scope.
    // Previously stage required Ready and pause required staged, creating an
    // impossible ordering for legitimate in-scope partial commits.
    expect(ledger!.reviewReleaseWorkScopeAmendment(underway)).toMatchObject({passed:true});
    const ongoingScope=ledger!.stageReleaseWorkScopeAmendment(underway,"planner");
    expect(ongoingScope).toMatchObject({status:"awaiting_independent_review",
      executableScopeChanged:false});
    expect(ledger!.get("WORK-101").allowedPaths).toEqual(["services/core/**"]);
    expect(()=>ledger!.approveReleaseWorkScopeAmendment({
      release:"V0.1",expectedProposalHash:ongoingScope.proposalHash,
      expectedReviewHash:"0".repeat(64),approvedBy:"test-owner",
      reason:"Approval before true independent review and pause cannot grant file permissions.",
      explicitAuthorization:true,
    })).toThrow(/active task lease/i);
    // This isolated test Owner deliberately retires the unreviewed fixture.
    // A real user request must never be inferred from the test label.
    expect(ledger!.withdrawReleaseWorkScopeAmendment({
      release:"V0.1",expectedProposalHash:ongoingScope.proposalHash,
      approvedBy:"test-owner",explicitAuthorization:true,
      reason:"Test-only fixture has confirmed that staging preserves the original file scope.",
    })).toMatchObject({withdrawn:true,executableScopeChanged:false});
    // Restore a synthetic fixture edit before testing *unrelated* strict
    // release; the pause above was already proven to preserve its bytes.
    // This restoration happens in a disposable test repository only.
    save("README.md","fixture\n");
    ledger!.release("WORK-101",prerequisite.leaseToken);
    // In the isolated test database the predecessor becomes Verified without
    // unrelated Git files, so the paused task's HEAD can be exactly restored.
    oldDb.prepare("UPDATE dc_tasks SET status='verified' WHERE id='WORK-101'").run();
    const resumed=ledger!.claim("WORK-102","coding-agent");
    expect(resumed.baseHead).toBe(beforePartial);
    expect(ledger!.get("WORK-102").status).toBe("in_progress");
    expect(oldDb.prepare("SELECT resumed_at FROM dc_scope_pauses WHERE task_id='WORK-102'")
      .get().resumed_at).toBeTruthy();
    ledger!.complete("WORK-102",resumed.leaseToken,{
      summary:"Recovered the original in-scope partial work from the old Agent's committed revision.",
      implementation:"Kept the original immutable Git base without discarding the code or broadening old scopes.",
      verification:"Validated the scoped existing file and old revision through the original docs gate.",
    });
    ledger!.report("WORK-102",resumed.leaseToken,{
      kind:"test",reference:"real previously committed in-scope fixture file"},true);
    const recoveredHandoff=ledger!.handoffReview('WORK-102',{
      leaseToken:resumed.leaseToken,actor:'coding-agent',
      reason:'The recovered scoped commit is ready for independent verification without touching Owner files',
    });
    ledger!.independentTaskReview('WORK-102',recoveredHandoff.ticket,{
      reviewer:'second-reviewer',outcome:'passed',
      findings:'Validated the original stored Git ancestry, completion revision and the independently retested contract fixture.',
      evidenceReference:'real previously committed in-scope fixture file',
    });
    recordAcceptanceReview('WORK-102',resumed.leaseToken,'docs',
      'real previously committed in-scope fixture file');
    expect(ledger!.verifyReviewedTask("WORK-102",recoveredHandoff.ticket)).toMatchObject({
      passed:true,files:["tests/contracts/partial-replay.json"]});
    // Owner-approved new work MUST be its own frozen task, never masquerade
    // as expanded QA scope. Hash-bound review and approval are separate.
    const newCoreItem={id:"WORK-CORE-NEW",title:"装配真实持久化服务端路由",
      stageId:"F2",type:"development" as const,platform:"Go",
      ownerRole:"Go Core Engineer",dependsOn:["WORK-102"],
      requirementIds:["FR-101"],
      acceptance:"真实 Go HTTP 服务在鉴权和数据库提交之后返回可重新查询的同源事件编号",
      allowedPaths:["services/core/cmd/**"],requiredGates:["go_contract"],estimatedHours:4};
    const increment={release:"V0.1",baseRevision:2,baseHash:amended.hash,
      addWorkItems:[newCoreItem],
      addDependencies:[{taskId:"WORK-103",dependsOn:["WORK-CORE-NEW"]}],
      rationale:"The existing QA task cannot bring up a real authenticated Core process or PostgreSQL connection inside its frozen test-only scope.",
      alternatives:"Expanding a client test to implement the Go server breaks the single-action contract; mock HTTP cannot demonstrate durable PostgreSQL writes.",
      verificationPlan:"Execute the Go persistence and auth contract tests, then run the simulator-to-Core test only after the new service task is Verified.",
      sourceRefs:["task:WORK-103","docs/roadmap/test-version.md"]};
    expect(ledger!.reviewReleaseWorkIncremental({...increment,
      addDependencies:[{taskId:"WORK-102",dependsOn:["WORK-CORE-NEW"]}]}))
      .toMatchObject({passed:false});
    expect(ledger!.reviewReleaseWorkIncremental({...increment,
      addWorkItems:[{...newCoreItem,dependsOn:["WORK-103"]}]}).issues)
      .toContain("WORK-103: cyclic release dependency");
    expect(ledger!.reviewReleaseWorkIncremental({...increment,
      baseHash:"0".repeat(64)})).toMatchObject({passed:false});
    expect(ledger!.reviewReleaseWorkIncremental(increment)).toMatchObject({passed:true,
      affectedTaskIds:["WORK-CORE-NEW","WORK-103"]});
    let stagedIncrement=ledger!.stageReleaseWorkIncremental(increment,"incremental-planner");
    expect(stagedIncrement).toMatchObject({status:"awaiting_independent_review",
      executableTasksChanged:false,
      requiredAgentAction:{
        responsible:"host_development_agent",status:"agent_review_required",
        nextTool:"release-work-incremental-independent-review",
        kind:"incremental_work",reviewHash:null,
        affectedTaskIds:["WORK-CORE-NEW","WORK-103"],
        ownerAuthorizationRequired:true,executableTasksChanged:false,
      }});
    expect(stagedIncrement.requiredAgentAction.action).toContain("不要等待 DevControl 自己进行审查");
    expect(ledger!.releaseWorkIncrementalAmendment("V0.1")).toMatchObject({
      status:"awaiting_independent_review",
      requiredAgentAction:{responsible:"host_development_agent",
        nextTool:"release-work-incremental-independent-review",
        proposalHash:stagedIncrement.proposalHash},
    });
    expect(()=>ledger!.get("WORK-CORE-NEW")).toThrow();
    expect(()=>ledger!.claim("WORK-103","premature-qa"))
      .toThrow(/awaits independent review and Owner hash approval/);
    expect(ledger!.next()).toMatchObject({
      nextAgentAction:{responsible:"host_development_agent",
        kind:"incremental_work",proposalHash:stagedIncrement.proposalHash,
        status:"agent_review_required"},
      pendingAgentActions:[{kind:"incremental_work",
        nextTool:"release-work-incremental-independent-review"}],
    });
    expect(ledger!.next().blocked).toContainEqual(expect.objectContaining({
      id:"WORK-103",pendingIncrementalReview:true,
      requiredAgentAction:expect.objectContaining({status:"agent_review_required"})}));
    const withdrawnArgs={release:"V0.1",expectedProposalHash:stagedIncrement.proposalHash,
      approvedBy:"test-owner",explicitAuthorization:true,
      reason:"The staged work uses an insufficient Go HTTP gate to demonstrate a live PostgreSQL transaction; correct it before review."};
    expect(()=>ledger!.withdrawReleaseWorkIncremental({...withdrawnArgs,
      explicitAuthorization:false})).toThrow(/Owner authorization/);
    expect(()=>ledger!.withdrawReleaseWorkIncremental({...withdrawnArgs,
      expectedProposalHash:"0".repeat(64)})).toThrow(/exact unreviewed/);
    expect(ledger!.withdrawReleaseWorkIncremental(withdrawnArgs))
      .toMatchObject({withdrawn:true,executableTasksChanged:false,
        frozenRevisionUnchanged:true});
    expect(ledger!.releaseWorkPlan("V0.1")).toMatchObject({revision:2,
      frozenHash:amended.hash,incrementalAmendment:null});
    expect(()=>ledger!.get("WORK-CORE-NEW")).toThrow();
    const reviewedIncrement={...increment,
      verificationPlan:increment.verificationPlan+" Require independently reviewed live PostgreSQL integration evidence for durable data."};
    stagedIncrement=ledger!.stageReleaseWorkIncremental(reviewedIncrement,"incremental-planner");
    expect(stagedIncrement.proposalHash).not.toBe(withdrawnArgs.expectedProposalHash);
    const incrementalReview={reviewer:"second-independent-agent",
      method:"independent-agent-pass" as const,
      subjectHash:stagedIncrement.proposalHash,
      affectedTaskIds:["WORK-CORE-NEW","WORK-103"],
      scopeAssessment:"The Go runtime item changes only the server startup tree while retaining QA outcome and existing file permissions.",
      dependencyAssessment:"The new server runtime must finish before the Ready simulator test; already verified source tasks remain untouched.",
      securityAndTestAssessment:"No authentication bypass is introduced and the unchanged Go and QA Gates still require executable evidence.",
      sourceRefs:["task:WORK-103"]};
    expect(()=>ledger!.reviewStagedReleaseWorkIncremental("V0.1",
      {...incrementalReview,reviewer:"incremental-planner"},
      stagedIncrement.proposalHash)).toThrow(/distinct independent reviewer/i);
    const checkedIncrement=ledger!.reviewStagedReleaseWorkIncremental("V0.1",
      incrementalReview,stagedIncrement.proposalHash);
    expect(checkedIncrement.status).toBe("reviewed");
    expect(checkedIncrement.requiredAgentAction).toMatchObject({
      status:"owner_authorization_required",
      nextTool:"release-work-incremental-approve",
      proposalHash:stagedIncrement.proposalHash,
      reviewHash:checkedIncrement.reviewHash,
    });
    expect(ledger!.next()).toMatchObject({
      nextAgentAction:{status:"owner_authorization_required",
        nextTool:"release-work-incremental-approve"},
    });
    const approveArgs={release:"V0.1",expectedProposalHash:stagedIncrement.proposalHash,
      expectedReviewHash:checkedIncrement.reviewHash,approvedBy:"test-owner",
      reason:"I explicitly approve this independent Core runtime prerequisite without relaxing original QA acceptance or historical gates.",
      explicitAuthorization:true};
    expect(()=>ledger!.approveReleaseWorkIncremental({...approveArgs,
      explicitAuthorization:false})).toThrow(/Owner must explicitly approve/);
    expect(()=>ledger!.approveReleaseWorkIncremental({...approveArgs,
      expectedReviewHash:"a".repeat(64)})).toThrow(/Exact independently reviewed/);
    const approvedIncrement=ledger!.approveReleaseWorkIncremental(approveArgs);
    expect(approvedIncrement).toMatchObject({revision:3,previousHash:amended.hash,
      added:["WORK-CORE-NEW"],blockedByNewPrerequisite:["WORK-103"]});
    expect(ledger!.get("WORK-CORE-NEW")).toMatchObject({status:"ready",
      allowedPaths:["services/core/cmd/**"],requiredGates:["go_contract"]});
    expect(ledger!.get("WORK-103").dependsOn).toEqual(["WORK-102","WORK-CORE-NEW"]);
    expect(ledger!.get("WORK-102").status).toBe("verified");
    expect(ledger!.get("WORK-103").allowedPaths).toEqual(["tests/contracts/**"]);
    expect(ledger!.executionContract("WORK-CORE-NEW")).toMatchObject({eligible:true});
    expect(ledger!.releaseWorkPlan("V0.1")).toMatchObject({revision:3,
      incrementalAmendment:null});
    const frozenHistory=(ledger! as any).db.prepare(
      "SELECT revision,hash FROM dc_release_work_history WHERE release='V0.1' ORDER BY revision"
    ).all();
    expect(frozenHistory).toEqual([{revision:1,hash:approved.hash},
      {revision:2,hash:amended.hash},{revision:3,hash:approvedIncrement.hash}]);
    expect(()=>ledger!.stageReleaseWorkIncremental(increment,"incremental-planner"))
      .toThrow(/Frozen release revision\/hash drift/);
    const abandonedScope={...amendment,baseRevision:3,baseHash:approvedIncrement.hash,
      changes:[{taskId:"WORK-104",addAllowedPaths:["services/core/cmd/release.go"]}]};
    const stagedAlternative=ledger!.stageReleaseWorkScopeAmendment(
      abandonedScope,"superseded-scope-proposer");
    expect(()=>ledger!.withdrawReleaseWorkScopeAmendment({release:"V0.1",
      expectedProposalHash:stagedAlternative.proposalHash,
      approvedBy:"test-owner",reason:"The Owner selected the atomic prerequisite alternative for the frozen release.",
      explicitAuthorization:false})).toThrow(/Owner authorization/);
    expect(()=>ledger!.withdrawReleaseWorkScopeAmendment({release:"V0.1",
      expectedProposalHash:"f".repeat(64),approvedBy:"test-owner",
      reason:"The Owner selected the separate atomic runtime task rather than expanding scope.",
      explicitAuthorization:true})).toThrow(/Only the exact unreviewed proposal/);
    const withdrawn=ledger!.withdrawReleaseWorkScopeAmendment({release:"V0.1",
      expectedProposalHash:stagedAlternative.proposalHash,approvedBy:"test-owner",
      reason:"The approved separate runtime prerequisite replaces this unnecessary QA scope expansion.",
      explicitAuthorization:true});
    expect(withdrawn).toMatchObject({withdrawn:true,executableScopeChanged:false});
    expect(ledger!.releaseWorkPlan("V0.1")).toMatchObject({revision:3,
      scopeAmendment:null});
    expect(ledger!.get("WORK-104").allowedPaths).toEqual(["docs/**"]);
  });
  it("turns a start_feature SQLite specification into a reviewed Feature task plan without release-wide files", async () => {
    ledger!.saveFeature({name:"event-ingest",description:"Persist auditable event messages with idempotency",layout:"flat",
      plan:{steps:[{id:"write-spec"}]},draft:{specLayout:"flat"}});
    ledger!.reviseFeature("event-ingest",{
      requirements:"FR-101: Authenticated requests are recorded once and can be replayed safely after restart.",
      design:"Use an isolated Core event handler backed by durable SQLite transactions and validated input shapes.",
      tasks:"Implement API ingestion, idempotency conflict handling, restart persistence and integration evidence.",
    },"planner",false);
    expect(ledger!.validateFeature("event-ingest").passed).toBe(true);
    const brief=ledger!.featureTaskBrief("event-ingest");
    expect(brief.readyForPlanning).toBe(true);
    expect(brief.requirementIds).toContain("FR-101");
    const node={
      id:"INGEST-LEAF",title:"Persist idempotent event payload using approved Core handler",kind:"leaf" as const,
      parentId:"INGEST-GROUP",dependsOn:["F0"],requirementIds:["FR-101"],
      scenario:"When a logged-in user retries a valid event, the server responds with one persistent record.",
      workflow:["Validate the caller's identity and canonicalize the input event body.",
        "Read the transaction-scoped idempotency key and detect a prior receipt.",
        "Write the event once and return the persisted identifier with provenance."],
      businessRules:["Never persist two records for the same caller and canonical request key.",
        "Conflicting payloads with a reused key must return a stable conflict response."],
      sourceRefs:["feature:event-ingest#requirements","feature:event-ingest#design"],
      reviewNotes:["The Core persistence decision must be already approved before coding begins."],
      verificationEvidence:["Run the real HTTP event ingestion integration test with recorded exit code.",
        "Run the persistent store restart test and attach the resulting Git HEAD."],
      inputs:["Authenticated user identity and canonical event payload with request key."],
      outputs:["A durable event identifier and a stable HTTP result containing provenance."],
      preconditions:["Storage migration and authentication contract have passed their gates."],
      stateTransitions:["Unseen request key becomes committed event, while retries return its identifier."],
      forbiddenChanges:["Do not modify Flutter clients, authentication design, or event protocol contracts."],
      stopConditions:["Stop and request approval if the storage layout or identity contract is not decided."],
      allowedChangedFiles:["services/core/ingest.go"],
      designRef:"feature:event-ingest#design",
      acceptance:"The initial event is persisted and exact retries cannot create duplicates after restart.",
      negativeCases:["A reused request key with different content produces conflict without writes.",
        "Unauthenticated requests must not create any durable event or idempotency entry."],
      testCases:["POST a valid first event and assert one durable event is created.",
        "Restart Core and repeat the event with matching identity and key."],
      outOfScope:["Client-side event rendering"],deliverables:["services/core/ingest.go","Core integration test evidence"],
      allowedPaths:["services/core/**"],requiredGates:["docs"],estimatedHours:1,
    };
    const plan={release:"V0.1",rationale:"Deliver one auditable event ingestion feature with clear restart semantics and no client-facing changes.",
      nodes:[{id:"INGEST-GROUP",title:"Core event ingestion",kind:"group" as const},node]};
    const weak={...plan,nodes:[plan.nodes[0],{...node,negativeCases:[]}]};
    expect(ledger!.reviewFeatureTasks("event-ingest",brief.feature.revision,weak).passed).toBe(false);
    const savedDraft=ledger!.stageFeatureTasks("event-ingest",brief.feature.revision,weak,"planning-agent");
    expect(savedDraft).toMatchObject({status:"needs_revision",executableTasksCreated:0});
    expect(ledger!.featureTaskPlan("event-ingest").review.issues.length).toBeGreaterThan(0);
    expect(ledger!.list().some(task=>task.id==="INGEST-LEAF")).toBe(false);
    expect(()=>ledger!.approveFeatureTasks("event-ingest","owner",savedDraft.hash))
      .toThrow(/INCOMPLETE_FEATURE_TASKS|specific negativeCases/);
    expect(ledger!.reviewFeatureTasks("event-ingest",brief.feature.revision-1,plan).passed).toBe(false);
    const reviewed=ledger!.reviewFeatureTasks("event-ingest",brief.feature.revision,plan);
    expect(reviewed).toMatchObject({passed:true,generatedLeaves:1,coveredFeatureRequirements:["FR-101"]});
    const before=ledger!.list().length;
    const pending=ledger!.proposeFeatureTasks("event-ingest",brief.feature.revision,plan,
      "planning-agent",savedDraft.hash);
    expect(pending.status).toBe("awaiting_second_review");
    expect(ledger!.list()).toHaveLength(before);
    expect(ledger!.listFeatureTaskPlans()).toHaveLength(1);
    expect(ledger!.listFeatureTaskPlans()[0].proposal.plan.nodes[1].scenario).toContain("logged-in user");
    const web=createDevControlBoardServer(ledger!);
    await new Promise<void>(resolve=>web.listen(0,"127.0.0.1",resolve));
    try {
      const address=web.address();
      const base="http://127.0.0.1:"+(address&&typeof address==="object"?address.port:0);
      const plans=await (await fetch(base+"/api/feature-task-plans")).json();
      expect(plans.plans[0].status).toBe("awaiting_second_review");
      expect(plans.plans[0].proposal.plan.nodes[1].id).toBe("INGEST-LEAF");
      expect(await (await fetch(base+"/")).text()).toContain("/api/feature-task-plans");
      expect((await fetch(base+"/api/feature-task-plans",{method:"POST"})).status).toBe(405);
    } finally { await new Promise<void>(resolve=>web.close(()=>resolve())); }
    expect(()=>ledger!.proposeFeatureTasks("event-ingest",brief.feature.revision,
      {...plan,rationale:"A different full proposed scope that was not explicitly revised by the Owner."},
      "planning-agent")).toThrow(/Pending Feature plan differs/);
    expect(ledger!.featureTaskPlan("event-ingest").proposalHash).toBe(pending.hash);
    expect(()=>ledger!.approveFeatureTasks("event-ingest","owner","0".repeat(64))).toThrow(/matching Feature proposal/);
    expect(()=>ledger!.approveFeatureTasks("event-ingest","owner",pending.hash))
      .toThrow(/separate feature-task-second-review/);
    const second={reviewer:'same-planning-agent',
      coverage:'Rechecked FR-101 and the persistent restart outcome against the stored Feature requirements.',
      dependencies:'Verified F0 is a real upstream task and the group only organizes this development leaf.',
      failureCases:'Verified conflicting idempotency payloads and unauthenticated requests fail without persistence.',
      fileScope:'Compared services/core/ingest.go and services/core boundaries to the exact frozen scope.',
      verification:'Inspected integration tests for valid POST, restart, failure responses and persistent evidence.',
      checkedTaskIds:['INGEST-LEAF']};
    expect(()=>ledger!.recordFeatureSecondReview('event-ingest','0'.repeat(64),second))
      .toThrow(/Re-open/);
    const reviewedAgain=ledger!.recordFeatureSecondReview('event-ingest',pending.hash,second);
    expect(reviewedAgain).toMatchObject({status:'reviewed',proposalHash:pending.hash,checkedTaskCount:1});
    expect(()=>ledger!.recordFeatureSecondReview('event-ingest',pending.hash,second))
      .toThrow(/immutable/);
    expect(ledger!.featureTaskPlan('event-ingest')).toMatchObject({status:'review_pending'});
    const expectedLocalApprover=ledger!.localDeveloper().name||ledger!.localDeveloper().device;
    const approved=ledger!.approveFeatureTasks("event-ingest","untrusted caller text",pending.hash);
    expect(approved.added).toEqual(["INGEST-GROUP","INGEST-LEAF"]);
    expect(ledger!.get("INGEST-LEAF").approvedBy).toBe(expectedLocalApprover);
    expect(ledger!.get("INGEST-LEAF").status).toBe("ready");
    expect(ledger!.approveFeatureTasks("event-ingest","agent",pending.hash))
      .toMatchObject({status:'frozen',alreadyApplied:true});
    expect(ledger!.get("INGEST-LEAF").dependsOn).toEqual(["F0"]);
    expect(ledger!.executionContract("INGEST-LEAF")).toMatchObject({eligible:true,profile:"spec-depth-v3"});
    expect(()=>ledger!.claim("INGEST-GROUP","agent")).toThrow(/leaf|group/i);
    const claimed=ledger!.claim("INGEST-LEAF","agent");
    expect(claimed.task.id).toBe("INGEST-LEAF");
    expect(ledger!.featureTaskPlan("event-ingest").status).toBe("frozen");
    expect(ledger!.release("INGEST-LEAF",claimed.leaseToken).released).toBe(true);
    ledger!.reviseFeature("event-ingest",{tasks:
      "Implement updated Core ingest and a new event idempotency conflict branch with additional state coverage."},
      "planner",false);
    expect(ledger!.executionContract("INGEST-LEAF").eligible).toBe(false);
    expect(()=>ledger!.claim("INGEST-LEAF","agent")).toThrow(/frozen plan/i);
    expect(fs.existsSync(path.join(root,"docs/specs/event-ingest/tasks.md"))).toBe(false);
  });
  it("imports existing verified task status, preserves legacy schema, and recommends F1", () => {
    expect(ledger!.get("F0").status).toBe("verified");
    expect(ledger!.get("F1").status).toBe("ready");
    expect(ledger!.next().nextTask.id).toBe("F1");
    expect(ledger!.next().blocked).toContainEqual({
      id: "F2", blockedBy: ["F1"], unverifiedChildren: [],
    });
    expect(ledger!.trace("F0").audit.some((x: any) => x.event === "legacy_import")).toBe(true);
    expect(() => ledger!.claim("F2", "blocked")).toThrowError(DevControlError);
  });

  it("stores all eight SRC-8 sections with revisions, evidence, task links and strict completion gates", () => {
    const bug = ledger!.recordWorkItem({ kind: "bug", title: "API restarts lose events",
      description: "Restart the service and the event disappears" });
    const initial = ledger!.bugDetail(bug.id);
    expect(initial.steps).toHaveLength(8);
    expect(initial.steps.every((step: any) => step.status === "pending" && step.revision === 0)).toBe(true);
    const update = (step: number, expectedRevision = 0, status: any = "completed") =>
      ledger!.updateBugStep({ id: bug.id, step, expectedRevision, status,
        summary: `Validated SRC-8 step ${step} with a reproducible observation`,
        evidence: [`tests/bug-regression.test.ts#step-${step}`], actor: "test-agent" });
    expect(() => update(2)).toThrow(/preceding SRC-8/);
    expect(() => ledger!.updateBugStep({ id: bug.id, step: 1, expectedRevision: 0,
      status: "completed", summary: "root cause", evidence: [], actor: "test-agent" }))
      .toThrow(/evidence/i);
    expect(update(1).step.revision).toBe(1);
    expect(() => update(1)).toThrow(/reload/);
    for (let step = 2; step <= 5; step++) update(step);
    expect(() => update(6)).toThrow(/repair and regression-test tasks/);
    expect(ledger!.linkBugTask(bug.id, "F1", "repair", "test-agent").role).toBe("repair");
    expect(() => update(6)).toThrow(/repair and regression-test tasks/);
    // The fixture's F0 is an existing, historically verified task.
    ledger!.linkBugTask(bug.id, "F0", "repair", "test-agent");
    ledger!.linkBugTask(bug.id, "F0", "test", "test-agent");
    expect(ledger!.linkBugTask(bug.id, "F0", "test", "test-agent").reused).toBe(true);
    // A linked, unverified repair task must still block closure.
    expect(() => update(6)).toThrow(/repair and regression-test tasks/);
    // A different Bug with only the verified fixture task may finish, after all SRC-8 evidence.
    const finished = ledger!.recordWorkItem({kind:"bug",title:"Missing warning on retry",description:"Reproduction and evidence"});
    ledger!.linkBugTask(finished.id,"F0","repair","test-agent");
    ledger!.linkBugTask(finished.id,"F0","test","test-agent");
    for (let step=1; step<=8; step++) {
      ledger!.updateBugStep({id:finished.id,step,status:"completed",expectedRevision:0,
        summary:`Verified step ${step}`,evidence:[`evidence#${step}`],actor:"test-agent"});
    }
    expect(ledger!.bugDetail(finished.id).status).toBe("verified");
    expect(() => ledger!.updateBugStep({id:finished.id,step:1,status:"blocked",
      summary:"Need reopening",evidence:[],expectedRevision:1,actor:"test-agent"}))
      .toThrow(/immutable/);
    const require = createRequire(import.meta.url);
    const {DatabaseSync} = require("node:sqlite") as {DatabaseSync:new(file:string)=>any};
    const db=new DatabaseSync(ledger!.databasePath);
    try {
      const revisions=db.prepare("SELECT count(*) AS total FROM dc_bug_step_revisions WHERE item_id=?")
        .get(finished.id);
      expect(revisions.total).toBe(8);
    } finally { db.close(); }
  });

  it("creates database-native feature drafts without Markdown and handles stable revisions", () => {
    const initial = ledger!.saveFeature({
      name: "personal-insights", description: "Provide evidence-backed insight cards",
      layout: "flat", plan: { planId: "feature-personal-insights", steps: [{ id: "design" }] },
      draft: { specLayout: "flat" },
    });
    expect(initial.revision).toBe(1);
    expect(ledger!.saveFeature({
      name: "personal-insights", description: "Provide evidence-backed insight cards",
      layout: "flat", plan: { planId: "feature-personal-insights", steps: [{ id: "other" }] },
      draft: { specLayout: "flat" },
    }).revision).toBe(1);
    expect(ledger!.validateFeature("personal-insights").passed).toBe(false);
    const result = ledger!.reviseFeature("personal-insights", {
      requirements: "FR-1: The client should surface meaningful evidence-backed insights for the user.",
      design: "An existing feature module renders the summary, without changing top-level architecture.",
      tasks: "1. Implement the existing feature widget. 2. Execute contract and acceptance tests.",
    }, "engineer", false);
    expect(result.revision).toBe(2);
    expect(ledger!.validateFeature("personal-insights").passed).toBe(true);
    expect(ledger!.getFeature("personal-insights").status).toBe("specified");
    const exported = ledger!.exportFeature("personal-insights");
    expect(exported).toContain("FR-1:");
    expect(JSON.parse(ledger!.exportFeature("personal-insights", "json")).revision).toBe(2);
    expect(fs.existsSync(path.join(root, "docs/specs/personal-insights/tasks.md"))).toBe(false);
    expect(ledger!.listFeatures()).toContainEqual(expect.objectContaining({ name: "personal-insights" }));
    expect(() => ledger!.saveFeature({
      name: "personal-insights", description: "Incompatible replacement", layout: "flat",
      plan: {}, draft: null,
    })).toThrow(/cannot be silently replaced/i);
  });

  it("deduplicates project Bugs and rejects semantically identical new tasks", () => {
    const first = ledger!.recordWorkItem({
      kind: "bug", title: "后台蓝牙同步 停止！", description: "First diagnosis",
    });
    const again = ledger!.recordWorkItem({
      kind: "bug", title: "后台蓝牙同步停止", description: "Duplicate report",
    });
    expect(first.id).toBe(again.id);
    expect(again.reused).toBe(true);
    expect(first.device).toBeTruthy();
    expect(first.creator).toBeTruthy();
    expect(ledger!.listWorkItems("bug")).toHaveLength(1);
    expect(() => ledger!.recordWorkItem({
      kind: "memory" as never, title: "BLE battery optimization", description: "Wrong subsystem",
    })).toThrow(/History Session/);
    create({ id: "NEYNA-290", title: "Implement X" });
    expect(() => create({ id: "NEYNA-291", title: "Implement   X!!!" })).toThrow(/matching task already exists/i);
    expect(create({ id: "NEYNA-292", title: "Implement X", dependsOn: ["F1"] }).id).toBe("NEYNA-292");
  });

  it("requires top-level architecture reconciliation and a real Git commit before design approval", () => {
    save("docs/architecture/overview.md", "# Overview\nInitial architecture baseline\n");
    commit("architecture baseline");
    ledger!.saveFeature({
      name: "watch-sensors", description: "Add sensor ingestion with new ownership boundary",
      layout: "flat", plan: {}, draft: {},
    });
    expect(() => ledger!.reviseFeature("watch-sensors", {
      design: "A native watch receiver becomes a new architectural component serving sensor data.",
    })).toThrow(/architectureImpact/);
    ledger!.reviseFeature("watch-sensors", {
      requirements: "FR-1: Collect real foreground sensor events and attach provenance in records.",
      design: "Introduce a native watch collector behind the Core ingestion API and preserve provenance.",
      tasks: "Implement watch ingestion and execute provenance contract and interruption tests.",
    }, "developer", true, "docs/architecture/overview.md");
    const outstanding = ledger!.listWorkItems("architecture_change");
    expect(outstanding).toHaveLength(1);
    expect(ledger!.validateFeature("watch-sensors")).toMatchObject({ passed: false });
    expect(() => ledger!.syncArchitecture(outstanding[0].id, "reviewer")).toThrow(/not changed/i);
    save("docs/architecture/overview.md",
      "# Overview\nWatch collector is a separate module owned by Core ingestion contracts.\n");
    commit("sync approved top-level architecture");
    expect(ledger!.syncArchitecture(outstanding[0].id, "reviewer").status).toBe("synced");
    expect(ledger!.validateFeature("watch-sensors").passed).toBe(true);
    expect(ledger!.getFeature("watch-sensors").status).toBe("specified");
  });

  it("isolates a new project's database inside its own Git root without adding tracked files", () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), "isolated-devcontrol-"));
    execFileSync("git", ["init", "-q"], { cwd: other });
    let otherLedger: ProjectTaskLedger | undefined;
    try {
      otherLedger = new ProjectTaskLedger(other);
      expect(otherLedger.databasePath).toBe(path.join(other, ".mcp-probe-kit/state/devcontrol.sqlite3"));
      expect(otherLedger.listFeatures()).toEqual([]);
      expect(otherLedger.listWorkItems()).toEqual([]);
      expect(execFileSync("git", ["status", "--porcelain"], { cwd: other, encoding: "utf8" })).toBe("");
      expect(otherLedger.databasePath).not.toBe(ledger!.databasePath);
      otherLedger.saveFeature({ name: "independent", description: "Independent project",
        layout: "flat", plan: {}, draft: null });
      expect(ledger!.listFeatures().find((item: any) => item.name === "independent")).toBeUndefined();
    } finally {
      otherLedger?.close(); fs.rmSync(other, { recursive: true, force: true });
    }
  });

  it("renders a valid zero-dependency workspace client with all required sections", () => {
    const output = projectHtml("safe-nonce");
    for (const section of [
      "view-overview", "view-requirements", "view-issues",
      "view-architecture", "view-tasks", "view-docs",
    ]) {
      expect(output).toContain('id="' + section + '"');
    }
    // Product goals are now visible inside the overview, not stranded
    // on an unreachable ninth page.
    expect(output).toContain('id="vision-title"');
    expect(output).toContain('id="roadmap-title"');
    expect(output).toContain('id="okr-title"');
    expect(output).toContain('data-tasktab="not_started"');
    expect(output).toContain('data-tasktab="in_progress"');
    expect(output).toContain('data-tasktab="completed"');
    expect(output).not.toContain("/board?embedded=1");
    expect(output).toContain("工程治理");
    expect(output).toContain("任务总数（含待审核）");
    expect(output).toContain('nonce="safe-nonce"');
    const inlineScript = /<script nonce="safe-nonce">([\s\S]*?)<\/script>/.exec(output)?.[1];
    expect(inlineScript).toBeTruthy();
    expect(() => new vm.Script(inlineScript!)).not.toThrow();
    expect(output).not.toContain("<script src=");
  });

  it("builds newcomer project context from canonical docs with live task data", async () => {
    save("docs/README.md", [
      "# 项目文档索引",
      "| 主题 | 源文件 |",
      "| --- | --- |",
      "| 目标 | [愿景](product/vision.md) |",
      "| 需求 | [PRD](product/requirements.md) |",
      "| 架构 | [技术分层](architecture/overview.md) |",
      "| 路线图 | [版本](roadmap/releases.md) |",
    ].join("\n"));
    save("docs/product/vision.md",
      "# Neyna 长期愿景\n\n系统希望让用户拥有可信、可追溯的个人记忆与行动智能，而不是展示更多无证据功能。\n");
    save("docs/product/requirements.md", [
      "# 产品需求", "",
      "| ID | 需求 | 阶段 | 验收重点 | 对应 KR |",
      "| --- | --- | --- | --- | --- |",
      "| FR-001 | 来源可追溯 | P0 | 核验原始记录 | KR1.1 |",
      "| FR-002 | 记忆查询 | P0 | 引用支持 | KR1.3 |",
      "| NFR-001 | 隐私隔离 | 权限检查 |",
      "FR-001 重复说明不应重复计数。",
    ].join("\n"));
    save("docs/architecture/overview.md",
      "# 总体技术架构\n\nFlutter 前端接 Go Core，Desktop Agent Host 负责授权执行，不重复业务状态。\n");
    save("docs/roadmap/releases.md",
      "# 发布路线\n\nV0.1 先构建可验证的最小记忆输入与来源闭环。\n");
    save("docs/specs/memory/spec.md", "# 事件契约\n\n具体功能验收由 Spec 定义。\n");
    save("docs/architecture/decisions/README.md",
      "# 架构决策\n\n[ADR-0001](ADR-0001-example.md)\n");
    save("docs/architecture/decisions/ADR-0001-example.md",
      "# ADR-0001\n\n可追溯工程边界示例。\n");
    save("docs/README.md", fs.readFileSync(path.join(root, "docs/README.md"), "utf8") +
      "\n[关键设计决策](architecture/decisions/README.md)\n");
    const project = projectContext(root);
    expect(project.name).toBe(path.basename(root));
    expect(project.projectStatus).toBe("documented");
    expect(project.vision.title).toBe("Neyna 长期愿景");
    expect(project.vision.summary).toContain("可信、可追溯");
    expect(project.requirements.frCount).toBe(2);
    expect(project.requirements.nfrCount).toBe(1);
    expect(project.requirements.items).toEqual([
      { id: "FR-001", title: "来源可追溯", stage: "P0", acceptance: "核验原始记录" },
      { id: "FR-002", title: "记忆查询", stage: "P0", acceptance: "引用支持" },
      { id: "NFR-001", title: "隐私隔离", stage: "NFR", acceptance: "权限检查" },
    ]);
    expect(project.documents.some((d) => d.path === "docs/specs/memory/spec.md")).toBe(true);
    expect(project.documents.some((d) => d.path === "docs/architecture/decisions/ADR-0001-example.md"))
      .toBe(true);
    expect(readProjectDoc(root, "docs/product/vision.md").markdown).toContain("个人记忆");
    const server = createDevControlBoardServer(ledger!);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const bound = server.address();
      const base = "http://127.0.0.1:" + (bound && typeof bound === "object" ? bound.port : 0);
      const context = await (await fetch(base + "/api/project")).json();
      expect(context.vision.title).toBe("Neyna 长期愿景");
      const document = await (await fetch(base +
        "/api/docs?path=docs%2Farchitecture%2Foverview.md")).json();
      expect(document.markdown).toContain("Go Core");
      expect((await fetch(base + "/api/docs?path=docs%2Fhistory-session%2Fprivate.md")).status).toBe(404);
      expect((await fetch(base + "/api/docs?path=docs%2Fproduct%2Fmissing.md")).status).toBe(404);
      save("docs/product/vision.md", "# 最新愿景\n\n根据 Owner 变更后的单一源文件内容实时更新。\n");
      expect((await (await fetch(base + "/api/project")).json()).vision.title).toBe("最新愿景");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("disallows path traversal, symlink escapes and private session docs", () => {
    save("docs/README.md", "# 索引\n\n[安全](engineering/quality-gates.md)");
    save("docs/engineering/quality-gates.md", "# 门禁\n\n正常的工程规范。");
    save("docs/history-session/private.md", "# private");
    expect(() => safeProjectDocument(root, "../README.md")).toThrow();
    expect(() => safeProjectDocument(root, "docs/../../.neyna/devcontrol-plan.json")).toThrow();
    expect(() => safeProjectDocument(root, "docs/history-session/private.md")).toThrow();
    expect(() => readProjectDoc(root, "docs/history-session/private.md")).toThrow();
    save("private.md", "sensitive");
    fs.symlinkSync(path.join(root, "private.md"), path.join(root, "docs/engineering/leak.md"));
    expect(() => safeProjectDocument(root, "docs/engineering/leak.md")).toThrow();
    expect(() => readProjectDoc(root, "docs/engineering/leak.md")).toThrow();
  });

  it("rejects newly generated progress Markdown even under a broadly allowed docs directory", () => {
    create({
      id: "NEYNA-280", allowedPaths: ["docs/engineering/**"],
    });
    ledger!.approve("NEYNA-280", "owner");
    const claim = ledger!.claim("NEYNA-280", "agent");
    save("docs/engineering/agent-daily-progress.md", "auto-generated status");
    git("add", "docs/engineering/agent-daily-progress.md");
    const scope = ledger!.checkStaged();
    expect(scope.passed).toBe(false);
    expect(scope.deniedFiles).toEqual([]);
    expect(scope.unapprovedDocs).toEqual(["docs/engineering/agent-daily-progress.md"]);
    // Even skipping the Hook must not allow automatic task verification.
    commit("bypass Git hook");
    ledger!.report("NEYNA-280", claim.leaseToken, {
      kind: "test", reference: "docs validation",
    }, true);
    ledger!.complete("NEYNA-280", claim.leaseToken, {
      summary: "Agent generated an unapproved progress file",
      implementation: "Created a process-only status Markdown rather than recording the result in SQLite.",
      verification: "Expect the scope and verification gates to reject the document addition.",
    });
    const result = ledger!.verify("NEYNA-280", claim.leaseToken);
    expect(result.passed).toBe(false);
    expect(result.unapprovedDocs).toEqual(["docs/engineering/agent-daily-progress.md"]);
  });

  it("allows explicitly approved durable docs and formal feature specifications", () => {
    create({
      id: "NEYNA-281",
      allowedPaths: ["docs/engineering/approved.md", "docs/specs/**"],
    });
    ledger!.approve("NEYNA-281", "owner");
    ledger!.claim("NEYNA-281", "agent");
    save("docs/engineering/approved.md", "authorized durable operating instructions");
    save("docs/specs/example/spec.md", "required specification");
    git("add", "docs/engineering/approved.md", "docs/specs/example/spec.md");
    expect(ledger!.checkStaged().passed).toBe(true);
    expect(ledger!.checkStaged().unapprovedDocs).toEqual([]);
  });

  it("blocks nonstandard process notes hidden in an approved Spec directory", () => {
    create({
      id: "NEYNA-282",
      allowedPaths: ["docs/specs/**"],
    });
    ledger!.approve("NEYNA-282", "owner");
    ledger!.claim("NEYNA-282", "agent");
    save("docs/specs/example/daily-handoff.md", "not an approved Spec");
    git("add", "docs/specs/example/daily-handoff.md");
    const result = ledger!.checkStaged();
    expect(result.passed).toBe(false);
    expect(result.unapprovedDocs).toEqual(["docs/specs/example/daily-handoff.md"]);
  });

  it("stores detailed completion as versioned SQLite records, not Markdown", () => {
    create();
    ledger!.approve("NEYNA-200", "owner");
    const claim = ledger!.claim("NEYNA-200", "agent");
    save("tests/contracts/implemented.json", "{}");
    commit("actual delivery");
    const report = {
      summary: "Text ingestion finished and reviewed",
      implementation: "Added idempotent event contract examples and a negative payload.",
      verification: "Ran test suite, all expected conditions passed.",
      remaining: "Future work: integrate Core database transactions.",
    };
    const first = ledger!.complete("NEYNA-200", claim.leaseToken, report);
    expect(first.revision).toBe(1);
    expect(() => ledger!.complete("NEYNA-200", "wrong", report)).toThrow(/lease/i);
    expect(() => ledger!.complete("NEYNA-200", claim.leaseToken, {
      ...report, summary: "",
    })).toThrow(/must be nonempty/);
    const second = ledger!.complete("NEYNA-200", claim.leaseToken, {
      ...report, summary: "Text ingestion finished after review update",
    });
    expect(second.revision).toBe(2);
    expect(ledger!.trace("NEYNA-200").completionHistory.length).toBe(2);
    expect(ledger!.trace("NEYNA-200").completion.summary).toBe(second.summary);
    expect(fs.existsSync(path.join(root, "docs/tasks/NEYNA-200.md"))).toBe(false);
    expect(ledger!.board().columns.inProgress.some((t: any) => t.id === "NEYNA-200")).toBe(true);
  });

  it("rejects stale completion notes when later commits change the code", () => {
    create();
    ledger!.approve("NEYNA-200", "owner");
    const claim = ledger!.claim("NEYNA-200", "agent");
    save("tests/contracts/one.json", "{}");
    commit("first delivery");
    ledger!.report("NEYNA-200", claim.leaseToken, { kind: "test", reference: "tested" }, true);
    ledger!.complete("NEYNA-200", claim.leaseToken, {
      summary: "Completed first scoped delivery",
      implementation: "Implemented one event contract in the test fixture.",
      verification: "Validated isolated test runner against the current Git HEAD.",
    });
    save("tests/contracts/two.json", "{}");
    commit("second delivery");
    const stale = ledger!.verify("NEYNA-200", claim.leaseToken);
    expect(stale.passed).toBe(false);
    expect(stale.reason).toMatch(/older Git commit/);
    expect(ledger!.get("NEYNA-200").status).toBe("in_review");
  });

  it("groups SQLite task statuses into exactly three Kanban columns", () => {
    create();
    ledger!.approve("NEYNA-200", "owner");
    ledger!.claim("NEYNA-200", "agent");
    const board = ledger!.board();
    expect(Object.keys(board.columns)).toEqual(["todo", "inProgress", "done"]);
    expect(board.columns.todo.some((row: any) => row.id === "F1")).toBe(true);
    expect(board.columns.inProgress.some((row: any) => row.id === "NEYNA-200")).toBe(true);
    expect(board.columns.done.some((row: any) => row.id === "F0")).toBe(true);
    expect(board.current).toBe("NEYNA-200");
    expect(board.columns.inProgress[0]).not.toHaveProperty("token");
    expect(board.counts.todo + board.counts.inProgress + board.counts.done).toBe(4);
  });

  it("serves a local read-only board with safe HTTP defaults", async () => {
    const server = createDevControlBoardServer(ledger!);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const bound = server.address();
      const base = "http://127.0.0.1:" + (bound && typeof bound === "object" ? bound.port : 0);
      const page = await fetch(base + "/");
      expect(page.status).toBe(200);
      const meta = await (await fetch(base + "/api/meta")).json();
      expect(meta.version).toBe((await import("../../version.js")).VERSION);
      expect(meta.workspaceSchemaVersion).toBe(WORKSPACE_SCHEMA_VERSION);
      expect(meta.root).toBe(root);
      expect(await page.text()).toContain("mcp-probe-kit · 研发工作台");
      expect(page.headers.get("content-security-policy")).toContain("script-src 'nonce-");
      expect(page.headers.get("content-security-policy")).toContain("frame-src 'self'");
      expect(page.headers.get("x-frame-options")).toBe("DENY");
      const legacyPage = await fetch(base + "/board");
      expect(await legacyPage.text()).toContain("研发任务看板");
      expect(legacyPage.headers.get("x-frame-options")).toBe("SAMEORIGIN");
      const embedded = await fetch(base + "/board?embedded=1");
      expect(await embedded.text()).toContain('class="embedded"');
      const boardResponse = await fetch(base + "/api/board");
      expect(boardResponse.status).toBe(200);
      expect((await boardResponse.json()).columns.done[0].id).toBe("F0");
      const detailResponse = await fetch(base + "/api/tasks/F1");
      expect((await detailResponse.json()).task.id).toBe("F1");
      const proposal = ledger!.saveFeature({
        name: "ui-session", description: "Record project history in its native subsystem",
        layout: "flat", plan: {}, draft: null,
      });
      expect(proposal.revision).toBe(1);
      const featureList = await (await fetch(base + "/api/features")).json();
      expect(featureList.features.some((f: any) => f.name === "ui-session")).toBe(true);
      const exported = await fetch(base + "/api/features/ui-session/export?format=markdown");
      expect(exported.headers.get("content-disposition")).toContain("feature-ui-session.md");
      expect(await exported.text()).toContain("Record project history");
      const boot = bootstrapHistorySession(root, {
        session_key: "board-history", initial_user_input: "History Session project decision",
      });
      checkpointHistorySession(root, {
        session_key: "board-history", expected_path: boot.current_path, turn_id: "note",
        decisions: ["Keep History Session separate from global memory"],
      });
      const sessions = await (await fetch(base + "/api/history?q=History")).json();
      expect(sessions.total).toBeGreaterThan(0);
      const historyPage = await (await fetch(base + "/api/history/1?max_bytes=512")).json();
      expect(historyPage.content).toContain("History Session");
      expect((await fetch(base + "/api/history/99")).status).toBe(404);
      expect((await (await fetch(base + "/api/work-items")).json()).items).toEqual([]);
      const bug = ledger!.recordWorkItem({kind:"bug",title:"Board fetch fails",description:"Reproduce broken board read"});
      const bugResponse = await fetch(base + "/api/bugs/" + bug.id);
      expect(bugResponse.status).toBe(200);
      const bugDetails = await bugResponse.json();
      expect(bugDetails.steps).toHaveLength(8);
      expect(bugDetails.steps[0].title).toContain("现象");
      expect(bugDetails.steps[0].status).toBe("pending");
      expect((await fetch(base + "/api/bugs/BUG-AAAAAAAAAAAAAAA")).status).toBe(404);
      expect((await fetch(base + "/api/bugs/" + bug.id, {method:"POST"})).status).toBe(405);
      expect((await fetch(base + "/api/tasks/not-valid")).status).toBe(404);
      expect((await fetch(base + "/api/board", { method: "POST" })).status).toBe(405);
      const hostileHostStatus = await new Promise<number>((resolve, reject) => {
        const req = http.get(base + "/api/board", { headers: { Host: "evil.example:1234" } }, (res) => {
          res.resume();
          res.on("end", () => resolve(res.statusCode ?? 0));
        });
        req.on("error", reject);
      });
      expect(hostileHostStatus).toBe(403);
      expect((await fetch(base + "/api/missing")).status).toBe(404);
      expect(boardResponse.headers.get("access-control-allow-origin")).toBeNull();
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("creates draft child tasks that cannot be claimed before explicit approval", () => {
    create({ id: "NEYNA-200", title: "Parent" });
    create({ id: "NEYNA-201", parentId: "NEYNA-200", title: "Child" });
    expect(ledger!.get("NEYNA-201").status).toBe("draft");
    expect(() => ledger!.claim("NEYNA-201", "agent")).toThrow(/ready|draft/i);
    ledger!.approve("NEYNA-201", "owner");
    expect(ledger!.claim("NEYNA-201", "agent").task.status).toBe("in_progress");
    expect(ledger!.trace("NEYNA-201").audit.some((x: any) => x.event === "approved")).toBe(true);
  });

  it("disallows cycles, changes of approved dependencies and unverified prerequisites", () => {
    create({ id: "NEYNA-210" });
    create({ id: "NEYNA-211", dependsOn: ["NEYNA-210"] });
    expect(() => ledger!.addDependency("NEYNA-210", "NEYNA-211", "agent")).toThrow(/cycle/i);
    ledger!.approve("NEYNA-211", "owner");
    expect(() => ledger!.addDependency("NEYNA-211", "F1", "agent")).toThrow(/before approval/i);
    expect(() => ledger!.claim("NEYNA-211", "agent")).toThrow(/depends on/i);
  });

  it("imports parent-child spec manifest with stable IDs and dependencies as drafts", () => {
    create({ id: "NEYNA-220" });
    const manifestPath = "docs/specs/memory/spec-manifest.json";
    save(manifestPath, JSON.stringify({
      layout: "parent-child",
      subspecs: [
        { id: "foundation", title: "Foundation", fr: ["FR-001"] },
        { id: "client", title: "Client", fr: ["FR-002"], dependsOn: ["foundation"] },
      ],
    }));
    const input = {
      manifestPath, parentTaskId: "NEYNA-220", idPrefix: "NEYNA-230",
      allowedPaths: ["tests/contracts/**"], requiredGates: ["docs"],
      planId: "feature-memory-abc",
    };
    const result = ledger!.importSpec(input);
    expect(result.importedIds).toEqual(["NEYNA-230-FOUNDATION", "NEYNA-230-CLIENT"]);
    expect(ledger!.get("NEYNA-230-CLIENT").dependsOn).toEqual(["NEYNA-230-FOUNDATION"]);
    expect(ledger!.get("NEYNA-230-CLIENT").planId).toBe("feature-memory-abc");
    expect(ledger!.get("NEYNA-230-CLIENT").status).toBe("draft");
    expect(ledger!.importSpec(input).importedIds).toEqual(result.importedIds);
    // Reordering upstream parent-child specs must not rename project tasks.
    save(manifestPath, JSON.stringify({
      layout: "parent-child",
      subspecs: [
        { id: "client", title: "Client", fr: ["FR-002"], dependsOn: ["foundation"] },
        { id: "foundation", title: "Foundation", fr: ["FR-001"] },
      ],
    }));
    expect(ledger!.importSpec(input).importedIds).toEqual(["NEYNA-230-CLIENT", "NEYNA-230-FOUNDATION"]);
  });

  it("rolls back an import if a later child conflicts with an existing task", () => {
    create({ id: "NEYNA-250" });
    create({ id: "NEYNA-260-BETA", title: "Conflicting existing task" });
    const manifestPath = "docs/specs/cycle/spec-manifest.json";
    save(manifestPath, JSON.stringify({
      layout: "parent-child",
      subspecs: [
        { id: "alpha", title: "Alpha", fr: ["FR-001"] },
        { id: "beta", title: "Beta", fr: ["FR-002"], dependsOn: ["alpha"] },
      ],
    }));
    const original = ledger!.list().length;
    expect(() => ledger!.importSpec({
      manifestPath, parentTaskId: "NEYNA-250", idPrefix: "NEYNA-260",
      allowedPaths: ["tests/contracts/**"], requiredGates: ["docs"],
    })).toThrow(/conflict/i);
    expect(ledger!.list().length).toBe(original);
  });

  it("never recommends an unverified parent over its eligible child", () => {
    create({ id: "NEYNA-270", title: "Parent" });
    create({ id: "NEYNA-271", parentId: "NEYNA-270", title: "Child", dependsOn: ["F0"] });
    ledger!.approve("NEYNA-270", "owner");
    ledger!.approve("NEYNA-271", "owner");
    const next = ledger!.next();
    expect(next.blocked).toContainEqual({
      id: "NEYNA-270", blockedBy: [], unverifiedChildren: ["NEYNA-271"],
    });
    expect(next.nextTask.id).not.toBe("NEYNA-270");
  });

  it("respects an active lease in next, renews it and releases only an untouched task", () => {
    create();
    ledger!.approve("NEYNA-200", "owner");
    const claimed = ledger!.claim("NEYNA-200", "agent", 600);
    expect(ledger!.next().nextTask.id).toBe("NEYNA-200");
    const renewed = ledger!.renew("NEYNA-200", claimed.leaseToken, 1200);
    expect(renewed.baseHead).toBe(claimed.baseHead);
    expect(renewed.expiresAt).toBeGreaterThan(Date.now() + 1190_000);
    expect(() => ledger!.renew("NEYNA-200", "wrong-token")).toThrow(/token/i);
    const released = ledger!.release("NEYNA-200", claimed.leaseToken);
    expect(released.released).toBe(true);
    expect(ledger!.get("NEYNA-200").status).toBe("ready");
    expect(ledger!.next().activeLease).toBeNull();
  });

  it("defers a submitted device gate without passing it, releases the singleton and preserves original Git evidence after other tasks commit", () => {
    create({id:"NEYNA-200",requiredGates:["ios_device_e2e"]});
    create({id:"NEYNA-201",requiredGates:["docs"]});
    ledger!.approve("NEYNA-200","owner");
    ledger!.approve("NEYNA-201","owner");
    const first=ledger!.claim("NEYNA-200","audio-agent");
    save("tests/contracts/audio-session.json",'{"realSession":true}');
    commit("implement offline-device session");
    const originalHead=git("rev-parse","HEAD");
    ledger!.report("NEYNA-200",first.leaseToken,{
      kind:"flutter_test",reference:"Actual Flutter local tests pass; device absent",
    },true);
    ledger!.complete("NEYNA-200",first.leaseToken,{
      summary:"Real device session implementation committed for independent iPhone tests",
      implementation:"Committed explicit audio session without fabricated hardware evidence",
      verification:"Flutter tests pass, physical iPhone unavailable",
      remaining:"Real iPhone acceptance is pending; its Gate is NOT passed",
    });
    expect(() => ledger!.deferVerification({
      id:"NEYNA-200",leaseToken:"wrong",gate:"ios_device_e2e",
      reason:"Physical iPhone is disconnected and real tests must be replayed",
    })).toThrow(/lease/i);
    const deferred=ledger!.deferVerification({
      id:"NEYNA-200",leaseToken:first.leaseToken,gate:"ios_device_e2e",
      reason:"Physical iPhone unavailable; rerun real signed device XCTest once it returns",
    });
    expect(deferred.leaseReleased).toBe(true);
    expect(deferred.gatePassed).toBe(false);
    expect(ledger!.get("NEYNA-200").status).toBe("in_review");
    expect(ledger!.get("NEYNA-200").pendingVerification.gate).toBe("ios_device_e2e");
    expect(ledger!.board().counts.pendingVerification).toBe(1);
    expect(ledger!.next().activeLease).toBeNull();
    expect(ledger!.next().nextTask?.id).not.toBe("NEYNA-200");
    expect(() => ledger!.claim("NEYNA-200","other-agent")).toThrow(/resume-verification/i);

    const second=ledger!.claim("NEYNA-201","other-agent");
    save("tests/contracts/other-delivery.json",'{"nextTask":true}');
    commit("independent second task after iPhone unavailable");
    ledger!.report("NEYNA-201",second.leaseToken,{
      kind:"unit_test",reference:"Real test of next task succeeded",
    },true);
    ledger!.complete("NEYNA-201",second.leaseToken,{
      summary:"Independent next task was finished on the same main branch",
      implementation:"A separate implementation was committed after the deferred task",
      verification:"Real docs gate available and executed successfully",
    });
    recordAcceptanceReview('NEYNA-201',second.leaseToken,'docs',
      'Real test of next task succeeded');
    expect(ledger!.verify("NEYNA-201",second.leaseToken).passed).toBe(true);
    const laterHead=git("rev-parse","HEAD");
    expect(laterHead).not.toBe(originalHead);
    const resumed=ledger!.resumeVerification("NEYNA-200","audio-agent");
    expect(resumed.baseHead).toBe(first.baseHead);
    expect(resumed.originalCompletionHead).toBe(originalHead);
    expect(ledger!.get("NEYNA-200").pendingVerification).toBeNull();
    expect(ledger!.taskClosureStatus('NEYNA-200').nextAction).toBe('self-review');
    const handoff=ledger!.handoffReview('NEYNA-200',{
      leaseToken:resumed.leaseToken,actor:'audio-agent',
      reason:'Original deferred audio submission remains unmodified and needs an independent review',
    });
    expect(handoff.completionHead).toBe(originalHead);
    expect(handoff.currentHead).toBe(laterHead);
    expect(ledger!.taskClosureStatus('NEYNA-200').nextAction).toBe('self-review');
    expect(ledger!.independentTaskReview('NEYNA-200',handoff.ticket,{
      reviewer:'independent-device-reviewer',outcome:'passed',
      findings:'Inspected the original audio delivery commit and confirmed later commits only changed an unrelated fixture.',
      evidenceReference:'Actual Flutter local tests pass; device absent',
    }).outcome).toBe('passed');
    expect(ledger!.taskClosureStatus('NEYNA-200').nextAction).toBe('gate-review');
    const missingPhysicalGate=ledger!.verify("NEYNA-200",resumed.leaseToken);
    expect(missingPhysicalGate.passed).toBe(false);
    expect(missingPhysicalGate.files).toEqual(["tests/contracts/audio-session.json"]);
    expect(missingPhysicalGate.reason).toBeUndefined(); // not a stale Git head or wrong diff
    const reviewedGate=ledger!.verifyReviewedTask('NEYNA-200',handoff.ticket);
    expect(reviewedGate.passed).toBe(false); // No actual iPhone: Gate is not waived.
    expect(reviewedGate.nextAction).toBe('task-closure-status');
    expect(reviewedGate.files).toEqual(['tests/contracts/audio-session.json']);
    expect(ledger!.get("NEYNA-200").status).toBe("in_review");
    expect(ledger!.trace("NEYNA-200").verificationDeferral.completion_head)
      .toBe(originalHead);
  });

  it('re-defers a safely resumed physical Gate without changing its original commit or other task files',()=>{
    create({id:'NEYNA-200',requiredGates:['ios_device_e2e']});
    ledger!.approve('NEYNA-200','owner');
    const claimed=ledger!.claim('NEYNA-200','responsible-agent');
    save('tests/contracts/frozen-original.json','{"real":"unchanged"}');
    commit('freeze original delivery for external test');
    const frozenHead=git('rev-parse','HEAD');
    ledger!.report('NEYNA-200',claimed.leaseToken,{
      kind:'local_test',reference:'Real local test passed; physical device required later',
    },true);
    ledger!.complete('NEYNA-200',claimed.leaseToken,{
      summary:'Original task is committed for a later real device test',
      implementation:'Only the approved in-scope source was committed',
      verification:'Local tests passed but physical device Gate is pending',
    });
    ledger!.deferVerification({id:'NEYNA-200',leaseToken:claimed.leaseToken,
      gate:'ios_device_e2e',reason:'Physical device not available for acceptance test'});
    save('other-project/independent.txt','do not delete unrelated files\n');
    git('add','other-project/independent.txt');
    git('-c','user.name=Fixture','-c','user.email=test@example.invalid',
      'commit','-qm','another scoped task delivered unrelated work');
    const resumed=ledger!.resumeVerification('NEYNA-200','responsible-agent');
    expect(()=>ledger!.deferVerification({id:'NEYNA-200',leaseToken:'wrong',
      gate:'ios_device_e2e',reason:'The iPhone still requires actual user permission'}))
      .toThrow(/lease/i);
    const again=ledger!.deferVerification({id:'NEYNA-200',leaseToken:resumed.leaseToken,
      gate:'ios_device_e2e',reason:'A real iPhone test was attempted but OS local network consent was not granted'});
    expect(again).toMatchObject({redeferred:true,gatePassed:false,leaseReleased:true,
      originalHead:frozenHead});
    expect(ledger!.taskClosureStatus('NEYNA-200')).toMatchObject({
      nextAction:'resume-verification',completionHead:frozenHead});
    expect(ledger!.next().activeLease).toBeNull();
    expect(fs.readFileSync(path.join(root,'other-project/independent.txt'),'utf8'))
      .toContain('do not delete');
  });

  it("cannot defer unfinished code, an unrelated gate or user-dirty files", () => {
    create({id:"NEYNA-200",requiredGates:["ios_device_e2e"]});
    ledger!.approve("NEYNA-200","owner");
    const first=ledger!.claim("NEYNA-200","audio-agent");
    save("tests/contracts/audio.json",'{"real":true}');
    commit("submit audio code");
    const reason="Device unavailable; need real independently reviewed iPhone Gate";
    expect(() => ledger!.deferVerification({
      id:"NEYNA-200",leaseToken:first.leaseToken,
      gate:"ios_device_e2e",reason,
    })).toThrow(/review|completed|completion/i);
    ledger!.report("NEYNA-200",first.leaseToken,{
      kind:"flutter_test",reference:"Executed local Flutter suite",
    },true);
    ledger!.complete("NEYNA-200",first.leaseToken,{
      summary:"Real code committed while external iPhone was disconnected",
      implementation:"User action bound to actual audio session API",
      verification:"Local tests pass; physical test pending",
    });
    expect(() => ledger!.deferVerification({
      id:"NEYNA-200",leaseToken:first.leaseToken,
      gate:"docs",reason,
    })).toThrow(/declared|cannot be deferred/i);
    save("tests/contracts/dirty.json",'{"uncommitted":true}');
    expect(() => ledger!.deferVerification({
      id:"NEYNA-200",leaseToken:first.leaseToken,
      gate:"ios_device_e2e",reason,
    })).toThrow(/dirty|manifest|untracked/i);
    expect(ledger!.get("NEYNA-200").pendingVerification).toBeNull();
    expect(ledger!.next().activeLease?.taskId).toBe("NEYNA-200");
  });

  it("explicitly preserves byte-identical later tracked and untracked work on main without stashing or weakening the real device Gate", () => {
    create({id:"NEYNA-200",requiredGates:["ios_device_e2e"]});
    create({id:"NEYNA-201",requiredGates:["docs"]});
    ledger!.approve("NEYNA-200","owner");
    ledger!.approve("NEYNA-201","owner");
    const old=ledger!.claim("NEYNA-200","audio-agent");
    save("tests/contracts/capture.json",'{"session":true}');
    commit("frozen explicit audio session");
    ledger!.report("NEYNA-200",old.leaseToken,{
      kind:"flutter_test",reference:"Local Flutter tests pass, device absent",
    },true);
    ledger!.complete("NEYNA-200",old.leaseToken,{
      summary:"Captured a real frozen implementation for a device test",
      implementation:"Committed bounded native session work",
      verification:"Only local Flutter tests; true iPhone gate still unavailable",
    });
    save("tests/contracts/capture.json",'{"session":true,"laterWork":"uncommitted"}');
    save("tests/contracts/future.json",'{"futureTask":true}');
    save("README.md","preserve pre-existing tracked edits exactly\n");
    const unchanged=git("status","--porcelain=v1");
    expect(() => ledger!.deferVerification({
      id:"NEYNA-200",leaseToken:old.leaseToken,
      gate:"ios_device_e2e",
      reason:"Real device unavailable, restore physical iPhone before verifying",
    })).toThrow(/dirty|worktree|untracked|manifest/i);
    const deferred=ledger!.deferVerification({
      id:"NEYNA-200",leaseToken:old.leaseToken,gate:"ios_device_e2e",
      reason:"Physical iPhone is absent, verification is held until it returns",
      preserveExistingWorktree:true,
    });
    expect(deferred.gatePassed).toBe(false);
    expect(deferred.leaseReleased).toBe(true);
    expect(deferred.preservedUncommittedFiles).toBe(3);
    expect(ledger!.get("NEYNA-200").status).toBe("in_review");
    const record=ledger!.trace("NEYNA-200").verificationDeferral;
    const fingerprint=JSON.parse(record.preserved_worktree_json) as {
      path:string;sha256:string;size:number;
    }[];
    expect(fingerprint.map(file=>file.path).sort()).toEqual([
      "README.md","tests/contracts/capture.json","tests/contracts/future.json",
    ]);
    expect(fingerprint.every(item=>item.sha256.length===64)).toBe(true);
    expect(git("status","--porcelain=v1")).toBe(unchanged);
    expect(ledger!.next().activeLease).toBeNull();
    expect(ledger!.claim("NEYNA-201","next-agent").task.id).toBe("NEYNA-201");
  });

  it("cannot hide a staged index in a deferred verification manifest", () => {
    create({id:"NEYNA-200",requiredGates:["ios_device_e2e"]});
    ledger!.approve("NEYNA-200","owner");
    const old=ledger!.claim("NEYNA-200","audio-agent");
    save("tests/contracts/capture.json",'{"session":true}');
    commit("original submission");
    ledger!.report("NEYNA-200",old.leaseToken,{
      kind:"flutter_test",reference:"Real simulator tests, physical iPhone absent",
    },true);
    ledger!.complete("NEYNA-200",old.leaseToken,{
      summary:"Actual audio session delivery",
      implementation:"Native permission and consent controls committed",
      verification:"Only simulator tests passed",
    });
    save("tests/contracts/new-staged.json",'{"staged":true}');
    git("add","tests/contracts/new-staged.json");
    expect(() => ledger!.deferVerification({
      id:"NEYNA-200",leaseToken:old.leaseToken,
      gate:"ios_device_e2e",
      reason:"Device disconnected, rerun real capture before acceptance",
      preserveExistingWorktree:true,
    })).toThrow(/staged|index/i);
    expect(ledger!.get("NEYNA-200").pendingVerification).toBeNull();
  });

  it("refuses to resume deferred verification when a later task rewrites its original files", () => {
    create({id:"NEYNA-200",requiredGates:["ios_device_e2e"]});
    ledger!.approve("NEYNA-200","owner");
    const first=ledger!.claim("NEYNA-200","audio-agent");
    save("tests/contracts/audio-session.json",'{"sample":1}');
    commit("frozen device task");
    ledger!.report("NEYNA-200",first.leaseToken,{
      kind:"flutter_test",reference:"Verified local file tests only",
    },true);
    ledger!.complete("NEYNA-200",first.leaseToken,{
      summary:"Device task completed without device validation",
      implementation:"Committed native-facing code",
      verification:"Device absent; later physical verification is required",
    });
    ledger!.deferVerification({
      id:"NEYNA-200",leaseToken:first.leaseToken,gate:"ios_device_e2e",
      reason:"No physical device connected; retry when the Owner provides one",
    });
    save("tests/contracts/audio-session.json",'{"sample":2}');
    commit("later source change must invalidate frozen device evidence");
    expect(() => ledger!.resumeVerification("NEYNA-200","audio-agent"))
      .toThrow(/modified|changed/i);
    expect(ledger!.get("NEYNA-200").pendingVerification).not.toBeNull();
    expect(ledger!.next().activeLease).toBeNull();
  });

  it("expired task reclaim preserves the original Git baseline and verification includes older commits", () => {
    create();
    ledger!.approve("NEYNA-200", "owner");
    const original = ledger!.claim("NEYNA-200", "agent-a");
    save("tests/contracts/one.json", "{}");
    commit("first session work");
    const require = createRequire(import.meta.url);
    const { DatabaseSync } = require("node:sqlite") as any;
    // Simulate time passing in this isolated SQLite test fixture.
    ledger!.close();
    const db = new DatabaseSync(path.join(root, ".neyna/state/devcontrol.sqlite3"));
    db.prepare("UPDATE dc_leases SET expires_at=0 WHERE singleton=1").run();
    db.close();
    ledger = new ProjectTaskLedger(root);
    const reclaimed = ledger!.claim("NEYNA-200", "agent-b");
    expect(reclaimed.baseHead).toBe(original.baseHead);
    expect(reclaimed.leaseToken).not.toBe(original.leaseToken);
    save("tests/contracts/two.json", "{}");
    commit("second session work");
    ledger!.report("NEYNA-200", reclaimed.leaseToken, {
      kind: "test", reference: "real verified test command",
    }, true);
    ledger!.complete("NEYNA-200", reclaimed.leaseToken, {
      summary: "Completed both interrupted implementation steps",
      implementation: "Retained the earlier Git base and included both commits.",
      verification: "Confirmed the full scoped diff and successful validation.",
    });
    recordAcceptanceReview('NEYNA-200',reclaimed.leaseToken,'docs',
      'real verified test command');
    const verified = ledger!.verify("NEYNA-200", reclaimed.leaseToken);
    expect(verified.passed).toBe(true);
    expect(verified.files).toContain("tests/contracts/one.json");
    expect(verified.files).toContain("tests/contracts/two.json");
  });

  it("refuses to release a lease after real code changes would lose Git provenance", () => {
    create();
    ledger!.approve("NEYNA-200", "owner");
    const claim = ledger!.claim("NEYNA-200", "agent");
    save("tests/contracts/changed.json", "{}");
    commit("partial work");
    expect(() => ledger!.release("NEYNA-200", claim.leaseToken)).toThrow(/renew or reclaim/i);
  });

  it("never executes a project-supplied validation script while checking a Gate", () => {
    // The project's own test command is intentionally hostile; the MCP is
    // only a ledger and must never execute it, even when the Gate is "docs".
    save("scripts/validate_docs.py",
      "from pathlib import Path\nPath('README.md').write_text('mutated by gate')\n");
    commit("record hostile project test script");
    create();ledger!.approve("NEYNA-200","owner");
    const claim=ledger!.claim("NEYNA-200","agent");
    save("tests/contracts/test.json","{}");commit("scoped task code");
    ledger!.report("NEYNA-200",claim.leaseToken,{
      kind:"test",reference:"project test evidence supplied externally",
    },true);
    ledger!.complete("NEYNA-200",claim.leaseToken,{
      summary:"Reported a scoped implementation and external project acceptance evidence",
      implementation:"Committed a reviewed contract fixture within the allowed task paths",
      verification:"The actual test process is the Agent's responsibility, not the DevControl MCP",
    });
    expect(ledger!.verify("NEYNA-200",claim.leaseToken)).toMatchObject({
      passed:false,results:{docs:{passed:false}},
    });
    recordAcceptanceReview("NEYNA-200",claim.leaseToken,"docs",
      "project test evidence supplied externally");
    expect(ledger!.verify("NEYNA-200",claim.leaseToken).passed).toBe(true);
    expect(fs.readFileSync(path.join(root,"README.md"),"utf8")).toBe("fixture\n");
  });

  it("blocks parent verification while any child is unverified", () => {
    create({ id: "NEYNA-240", allowedPaths: ["tests/contracts/**"] });
    create({ id: "NEYNA-241", parentId: "NEYNA-240" });
    ledger!.approve("NEYNA-240", "owner");
    const claim = ledger!.claim("NEYNA-240", "agent");
    save("tests/contracts/test.txt", "evidence");
    commit();
    ledger!.report("NEYNA-240", claim.leaseToken, { kind: "test", reference: "docs-ok" }, true);
    const result = ledger!.verify("NEYNA-240", claim.leaseToken);
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/Children/);
  });

  it("fails verification after out-of-scope changes even if local Git hook was bypassed", () => {
    create();
    ledger!.approve("NEYNA-200", "owner");
    const claim = ledger!.claim("NEYNA-200", "agent");
    save("apps/client/hijack.dart", "wrong scope");
    commit();
    ledger!.report("NEYNA-200", claim.leaseToken, { kind: "test", reference: "attempt" }, true);
    ledger!.complete("NEYNA-200", claim.leaseToken, {
      summary: "Attempted out-of-scope code change",
      implementation: "Changed a forbidden client-side path instead of the allowed test directory.",
      verification: "Expected DevControl to reject the committed diff even with a report.",
    });
    const result = ledger!.verify("NEYNA-200", claim.leaseToken);
    expect(result.passed).toBe(false);
    expect(result.denied).toContain("apps/client/hijack.dart");
  });

  it("refuses commits without an active lease and rejects staged paths outside scope", () => {
    create();
    ledger!.approve("NEYNA-200", "owner");
    expect(() => ledger!.checkStaged()).toThrow(/No active approved task lease/);
    ledger!.claim("NEYNA-200", "agent");
    save("apps/client/unauthorized.dart", "wrong");
    git("add", "apps/client/unauthorized.dart");
    expect(ledger!.checkStaged().passed).toBe(false);
    expect(ledger!.checkStaged().deniedFiles).toContain("apps/client/unauthorized.dart");
  });

  it("cannot mark a task verified without actual changes and actual gate success", () => {
    create();
    ledger!.approve("NEYNA-200", "owner");
    const claim = ledger!.claim("NEYNA-200", "agent");
    expect(() => ledger!.verify("NEYNA-200", claim.leaseToken)).toThrow(/Submit evidence/);
    save("tests/contracts/contract.go", "actual change");
    commit();
    ledger!.report("NEYNA-200", claim.leaseToken, { kind: "test", reference: "unit tests" }, true);
    expect(ledger!.verify("NEYNA-200", claim.leaseToken)).toMatchObject({
      passed: false, reason: "Missing structured completion report",
    });
    ledger!.complete("NEYNA-200", claim.leaseToken, {
      summary: "Implemented minimal contract tests",
      implementation: "Added a new test contract fixture and verified its Git scope.",
      verification: "Ran Python docs acceptance gate against the committed revision.",
    });
    expect(ledger!.verify('NEYNA-200',claim.leaseToken)).toMatchObject({passed:false,
      results:{docs:{passed:false}}});
    recordAcceptanceReview('NEYNA-200',claim.leaseToken,'docs','unit tests');
    const result = ledger!.verify("NEYNA-200", claim.leaseToken);
    expect(result.passed).toBe(true);
    expect(ledger!.get("NEYNA-200").status).toBe("verified");
    expect(ledger!.trace("NEYNA-200").evidence.length).toBe(1);
    expect(ledger!.trace("NEYNA-200").completion.summary).toBe("Implemented minimal contract tests");
  });

  it("replays migration without duplicating tasks", () => {
    const count = ledger!.list().length;
    ledger!.close();
    ledger = new ProjectTaskLedger(root);
    expect(ledger!.list().length).toBe(count);
  });
});
