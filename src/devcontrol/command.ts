import fs from "node:fs";
import path from "node:path";
import { ProjectTaskLedger, DevControlError, type CreateWorkItem, type CompletionReport } from "./task-ledger.js";
import { serveDevControlStdio } from "./mcp-stdio.js";
import { serveDevControlBoard } from "./board-server.js";
import { ensureProjectWorkspaceRunning } from "./workspace-process.js";
import { projectOnboarding } from "./project-onboarding.js";
import { reviewReleasePlan } from "./release-plan.js";
import { resolveWorkbenchLocale } from "./i18n.js";
import { hookStatus, installHook } from "./git-gate.js";
import {
  configureWorkspaceAccess, lanAddresses, workspaceAccess, WORKSPACE_START_PORT,
} from "./workspace-access.js";

type FlagMap = Map<string, string | boolean>;

function stringFlag(flags: FlagMap, key: string): string | undefined {
  const value = flags.get(key);
  return typeof value === "string" ? value : undefined;
}

function jsonInput(flags: FlagMap): Record<string, any> {
  const inline = stringFlag(flags, "json");
  const file = stringFlag(flags, "input");
  if (inline && file) throw new DevControlError("MULTIPLE_INPUTS", "Use either --json or --input");
  const raw = inline ?? (file ? fs.readFileSync(path.resolve(file), "utf8") : "{}");
  const decoded: unknown = JSON.parse(raw);
  if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
    throw new DevControlError("INVALID_INPUT", "Input must be a JSON object");
  }
  return decoded as Record<string, any>;
}

export function dispatchDevControl(
  ledger: ProjectTaskLedger, operation: string, input: Record<string, any> = {},
): Record<string, unknown> {
  switch (operation) {
    case "release-work-plan": return ledger.releaseWorkPlan(String(input.release ?? ledger.primaryRelease()));
    case "release-work-review": return ledger.reviewReleaseWork(input.plan);
    case "release-work-stage": return ledger.stageReleaseWork(input.plan,String(input.actor??""),
      input.expectedPreviousHash);
    case "release-work-approve": return ledger.approveReleaseWork(String(input.release),
      String(input.expectedHash));
    case "release-work-scope-review": return ledger.reviewReleaseWorkScopeAmendment(input.proposal);
    case "release-work-scope-stage": return ledger.stageReleaseWorkScopeAmendment(
      input.proposal,String(input.actor??""));
    case "release-work-scope-get": return {
      release:String(input.release),proposal:ledger.releaseWorkScopeAmendment(String(input.release))};
    case "release-work-scope-independent-review": return ledger.reviewStagedReleaseWorkScopeAmendment(
      String(input.release),input.review,String(input.expectedProposalHash));
    case "release-work-scope-approve": return ledger.approveReleaseWorkScopeAmendment(input as never);
    case "release-work-scope-withdraw": return ledger.withdrawReleaseWorkScopeAmendment(input as never);
    case "release-work-incremental-review": return ledger.reviewReleaseWorkIncremental(input.proposal);
    case "release-work-incremental-stage": return ledger.stageReleaseWorkIncremental(
      input.proposal,String(input.actor??""));
    case "release-work-incremental-get": return {
      release:String(input.release),
      proposal:ledger.releaseWorkIncrementalAmendment(String(input.release))};
    case "release-work-incremental-independent-review": return ledger.reviewStagedReleaseWorkIncremental(
      String(input.release),input.review,String(input.expectedProposalHash));
    case "release-work-incremental-approve": return ledger.approveReleaseWorkIncremental(input as never);
    case "release-work-incremental-withdraw": return ledger.withdrawReleaseWorkIncremental(input as never);
    case "pause-for-reviewed-incremental": return ledger.pauseForReviewedIncremental(input as never);
    case "artifact-get": return ledger.governedArtifact(String(input.id));
    case "artifact-check": return ledger.checkGovernedArtifacts();
    case "artifact-stage": return ledger.stageGovernedArtifact(input.manifest,
      Number(input.baseRevision),String(input.baseHash??""),String(input.actor??""));
    case "artifact-independent-review": return ledger.independentlyReviewGovernedArtifact(
      String(input.id),input.review,String(input.expectedProposalHash));
    case "artifact-approve": return ledger.approveGovernedArtifact(input as never);
    case "release-plan": return ledger.releasePlan(String(input.release ?? ledger.primaryRelease()));
    case "plan-review": return { ...reviewReleasePlan(input.plan) };
    case "plan-propose": return ledger.proposeReleasePlan(input.plan, String(input.actor ?? ""));
    case "plan-revise": return ledger.proposeReleasePlan(
      input.plan, String(input.actor ?? ""), String(input.expectedPreviousHash ?? ""),
    );
    case "plan-approve": return ledger.approveReleasePlan(
      String(input.release), String(input.approvedBy), String(input.expectedHash),
    );
    case "onboard": return { ...projectOnboarding(ledger.root, ledger.list(),
      ledger.hasReviewedProductPlan()) };
    case "next": return ledger.next();
    case "features": return { features: ledger.listFeatures() };
    case "feature-get": return ledger.getFeature(String(input.name));
    case "feature-save": return ledger.reviseFeature(
      String(input.name), input.sections, String(input.actor ?? "agent"),
      input.architectureImpact, input.topLevelDocument,
    );
    case "feature-validate": return ledger.validateFeature(String(input.name));
    case "feature-task-brief": return ledger.featureTaskBrief(String(input.name));
    case "feature-task-plan": return ledger.featureTaskPlan(String(input.name));
    case "feature-task-plans": return {plans:ledger.listFeatureTaskPlans()};
    case "feature-task-review": return ledger.reviewFeatureTasks(
      String(input.name), input.expectedFeatureRevision, input.plan,
    );
    case "feature-task-stage": return ledger.stageFeatureTasks(
      String(input.name), input.expectedFeatureRevision, input.plan,
      String(input.actor ?? ""), input.expectedPreviousHash,
    );
    case "feature-task-propose": return ledger.proposeFeatureTasks(
      String(input.name), input.expectedFeatureRevision, input.plan,
      String(input.actor ?? ""), input.expectedPreviousHash,
    );
    case "feature-task-approve": return ledger.approveFeatureTasks(
      String(input.name), String(input.approvedBy ?? ""), String(input.expectedHash ?? ""),
    );
    case "feature-export": return {
      name: String(input.name), format: input.format ?? "markdown",
      content: ledger.exportFeature(String(input.name), input.format ?? "markdown"),
    };
    case "work-items": return { items: ledger.listWorkItems(input.kind) };
    case "bug-get": return ledger.bugDetail(String(input.id));
    case "bug-step-save": return ledger.updateBugStep({
      id: String(input.id), step: input.step, status: input.status,
      summary: input.summary, evidence: input.evidence,
      actor: input.actor, expectedRevision: input.expectedRevision,
    });
    case "bug-task-link": return ledger.linkBugTask(
      String(input.id), String(input.taskId), input.role, String(input.actor ?? ""),
    );
    case "work-record": return ledger.recordWorkItem({
      kind: input.kind, title: input.title, description: input.description,
      featureName: input.featureName, topLevelDocument: input.topLevelDocument,
      sourceRef: input.sourceRef,
    });
    case "architecture-sync": return ledger.syncArchitecture(
      String(input.id), String(input.reviewer ?? ""),
    );
    case "board-data": return ledger.board();
    case "status":
    case "list": return { tasks: ledger.list() };
    case "get": return ledger.get(String(input.id));
    case "local-developer": return ledger.localDeveloper();
    case "execution-contract": return ledger.executionContract(String(input.id));
    case "task-detail-audit": return ledger.taskDetailAudit(String(input.id));
    case "decision-get": return ledger.getDecision(String(input.id));
    case "idea-capture": return ledger.captureIdea({
      release:input.release,title:input.title,description:input.description,
      sourceRef:input.sourceRef,submittedBy:input.submittedBy,
    });
    case "idea-list": return ledger.listIdeas(input.release);
    case "idea-get": return ledger.getIdea(String(input.id));
    case "idea-assess": return ledger.assessIdea(
      String(input.id),input.assessment,input.expectedRevision);
    case "idea-review": return ledger.reviewIdea(
      String(input.id),input.review,input.expectedRevision);
    case "idea-decide": return ledger.decideIdea(String(input.id),{
      disposition:input.disposition,approvedBy:input.approvedBy,
      expectedRevision:input.expectedRevision,
      expectedReviewHash:input.expectedReviewHash,reason:input.reason,
      explicitAuthorization:input.explicitAuthorization,
    });
    case "decision-save": return ledger.recordDecision(
      String(input.id),String(input.leaseToken),{
        question:input.question,decision:input.decision,
        rationale:input.rationale,alternatives:input.alternatives,
        consequences:input.consequences,verificationPlan:input.verificationPlan,
        status:input.status,expectedRevision:input.expectedRevision,
      });
    case "hook-status": return { ...hookStatus(ledger.root) };
    case "hook-install": return { ...installHook(ledger.root, path.resolve(process.argv[1]??"")) };
    case "create": return ledger.create(input as CreateWorkItem, String(input.actor ?? "agent-proposal"));
    case "subtask": {
      if (!input.parentId) throw new DevControlError("PARENT_REQUIRED", "Subtask needs parentId");
      return ledger.create(input as CreateWorkItem, String(input.actor ?? "agent-proposal"));
    }
    case "import-spec": return ledger.importSpec(input as never);
    case "dependency": return ledger.addDependency(
      String(input.id), String(input.dependsOn), String(input.actor ?? "agent-proposal"),
    );
    case "complete": return ledger.complete(
      String(input.id), String(input.leaseToken), input as CompletionReport,
    );
    case "approve": return ledger.approve(String(input.id), String(input.approvedBy));
    case "claim": return ledger.claim(
      String(input.id), String(input.agent), Number(input.ttlSeconds ?? 1800),
    );
    case "renew": return ledger.renew(
      String(input.id), String(input.leaseToken), Number(input.ttlSeconds ?? 1800),
    );
    case "release": return ledger.release(String(input.id), String(input.leaseToken));
    case "pause-for-scope": return ledger.pauseForScopeAmendment(
      String(input.id),String(input.leaseToken),String(input.reason??""),
      input.existingDirtyFiles);
    case "check": return ledger.checkStaged();
    case "report": return ledger.report(
      String(input.id), String(input.leaseToken),
      { kind: String(input.kind), reference: String(input.reference) },
      input.readyForReview === true,
    );
    case "verify": return ledger.verify(String(input.id), String(input.leaseToken));
    case "trace": return ledger.trace(String(input.id));
    default: throw new DevControlError("UNKNOWN_ACTION", `Unsupported DevControl operation: ${operation}`);
  }
}

export async function runDevControlCli(positionals: string[], flags: FlagMap): Promise<number> {
  const root = path.resolve(stringFlag(flags, "project-root") ?? process.cwd());
  const operation = positionals[0]?.trim() ?? "next";
  if (operation === "lan-enable" || operation === "lan-disable") {
    const access = configureWorkspaceAccess(root, {
      lanEnabled: operation === "lan-enable",
    });
    process.stdout.write(JSON.stringify({
      ok: true, operation, lanEnabled: access.lanEnabled,
      basePort: access.basePort, addresses: lanAddresses(),
      message: "MCP startup applies this project LAN setting. All private LAN readers can access the read-only workspace without logging in.",
    }, null, 2) + "\n");
    return 0;
  }
  if (operation === "lan-access") {
    const access = workspaceAccess(root);
    process.stdout.write(JSON.stringify({
      ok: true, operation,
      lanEnabled: access.lanEnabled, basePort: access.basePort,
      addresses: lanAddresses(),
      warning: "No login: any device on an allowed private LAN can read project information. HTTP is not encrypted. Disable LAN or use a trusted VPN/HTTPS proxy on untrusted networks.",
    }, null, 2) + "\n");
    return 0;
  }
  if (operation === "serve") {
    await serveDevControlStdio(root);
    return 0;
  }
  if (operation === "board") {
    const rawPort = stringFlag(flags, "port") ?? String(WORKSPACE_START_PORT);
    const port = Number(rawPort);
    if (!Number.isSafeInteger(port) || port < 0 || port > 65535) {
      throw new DevControlError("INVALID_PORT", "Board port must be between 0 and 65535");
    }
    await serveDevControlBoard(root, port);
    return 0;
  }
  if (operation === "workspace-status" || operation === "workspace-link") {
    const result = await ensureProjectWorkspaceRunning(root);
    if(operation==="workspace-link"){
      const raw=stringFlag(flags,"lang");
      const language=raw?resolveWorkbenchLocale(raw):null;
      const suffix=(language?"?lang="+encodeURIComponent(language):"")+"#tasks";
      process.stdout.write(JSON.stringify({ok:true,operation,
        localUrl:result.url+suffix,
        lanUrls:result.lanEnabled?lanAddresses().map(ip=>
          "http://"+ip+":"+result.port+"/"+suffix):[],
        language:language??"browser-preference",
      },null,2)+"\n");
      return 0;
    }
    process.stdout.write(JSON.stringify({ ok: true, operation, result }, null, 2) + "\n");
    return 0;
  }
  const ledger = new ProjectTaskLedger(root);
  try {
    const input = jsonInput(flags);
    const result = dispatchDevControl(ledger, operation, input);
    process.stdout.write(JSON.stringify({ ok: true, operation, result }, null, 2) + "\n");
    // A read-only depth audit can report a legacy task's missing explanation
    // without turning successful inspection into a CLI or workflow failure.
    if (operation === "task-detail-audit") return 0;
    return "passed" in result && result.passed === false ? 1 : 0;
  } finally {
    ledger.close();
  }
}
