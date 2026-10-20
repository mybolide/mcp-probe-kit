import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { initProject } from "../../tools/init_project.js";
import { ProjectTaskLedger } from "../task-ledger.js";
import { projectOnboarding } from "../project-onboarding.js";
import { dispatchDevControl } from "../command.js";
import { projectHtml } from "../project-html.js";
import { createDevControlBoardServer } from "../board-server.js";

const roots: string[] = [];
function fixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "devcontrol-onboard-"));
  roots.push(root);
  execFileSync("git", ["init", "-q"], { cwd: root });
  return root;
}
function put(root: string, file: string, text: string): void {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text);
}
function commit(root: string): void {
  execFileSync("git", ["add", "-A"], { cwd: root });
  execFileSync("git", ["-c", "user.name=Test", "-c",
    "user.email=test@example.invalid", "commit", "-qm", "baseline"], { cwd: root });
}
afterEach(() => roots.splice(0).forEach(root =>
  fs.rmSync(root, { recursive: true, force: true })));

describe("DevControl project-first onboarding", () => {
  it("initializes a fresh Git project once without inventing plans or Markdown", async () => {
    const root = fixture();
    const first = await initProject({ project_root: root, project_name: "Unbuilt App",
      input: "An app idea not yet signed off" });
    expect(first.isError).toBeFalsy();
    expect(first.structuredContent?.summary).toContain("DevControl");
    const db = path.join(root, ".mcp-probe-kit/state/devcontrol.sqlite3");
    expect(fs.existsSync(db)).toBe(true);
    expect(fs.existsSync(path.join(root, "docs"))).toBe(false);
    let ledger = new ProjectTaskLedger(root);
    const state = projectOnboarding(root, ledger.list());
    expect(state.kind).toBe("new");
    expect(state.readiness).toBe("needs_baseline");
    expect(state.steps.every(step => step.status === "missing")).toBe(true);
    expect(dispatchDevControl(ledger, "onboard")).toEqual(state);
    expect(ledger.list()).toHaveLength(0);
    ledger.close();
    const again = await initProject({ project_root: root, project_name: "Unbuilt App",
      input: "An app idea not yet signed off" });
    expect(again.structuredContent?.summary).toContain("DevControl");
    ledger = new ProjectTaskLedger(root);
    expect(ledger.list()).toHaveLength(0);
    expect(projectOnboarding(root, ledger.list())).toEqual(state);
    ledger.close();
    expect(fs.existsSync(path.join(root, "docs", "specs", "unbuilt-app", "tasks.md"))).toBe(false);
  });

  it("does not call scattered approved tasks a full 0-to-1 development plan", () => {
    const root = fixture();
    for (const [file, value] of [
      ["docs/product/vision.md", "# Project goal\nAn existing product goal and scope."],
      ["docs/CONSTITUTION.md", "# Rules\nAn established engineering constitution."],
      ["docs/product/requirements.md", "# Scope\nTestable product requirements and acceptance."],
      ["docs/architecture/overview.md", "# Design\nA baseline with independent subsystem ownership."],
    ]) put(root, file, value);
    commit(root);
    const ledger = new ProjectTaskLedger(root);
    ledger.create({ id: "AP-01", title: "Approved isolated task",
      allowedPaths: ["src/**"], requiredGates: ["docs"] }, "agent");
    ledger.approve("AP-01", "owner");
    const result = projectOnboarding(root, ledger.list());
    expect(result.approvedTaskCount).toBe(1);
    expect(result.readiness).toBe("needs_plan");
    expect(result.steps.find(s => s.id === "plan")?.status).toBe("missing");
    ledger.close();
  });

  it("preserves existing code, source documents and approved SQLite tasks across re-entry", async () => {
    const root = fixture();
    put(root, "src/main.ts", "export const running = true;\n");
    put(root, "docs/product/vision.md", "# Existing goals\nA grounded purpose with owner decisions.\n");
    put(root, "docs/CONSTITUTION.md", "# Governance\nExisting project restrictions and review rules.\n");
    put(root, "docs/product/requirements.md", "# Requirements\nExisting requirements and verification criteria.\n");
    put(root, "docs/architecture/overview.md", "# Architecture\nExisting system boundaries and critical constraints.\n");
    put(root, "docs/roadmap/zero-to-one-plan.md", "# Development plan\nApproved staged tasks and prerequisite ordering.\n");
    commit(root);
    const before = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root }).toString().trim();
    let ledger = new ProjectTaskLedger(root);
    ledger.create({
      id: "APP-01", title: "Verify existing application",
      allowedPaths: ["src/**"], requiredGates: ["docs"],
    }, "agent-onboarding-fixture");
    ledger.approve("APP-01", "owner-confirmed");
    expect(projectOnboarding(root, ledger.list())).toMatchObject({
      kind: "existing", readiness: "ready_for_review",
      taskCount: 1, approvedTaskCount: 1,
    });
    ledger.close();
    for (let i = 0; i < 2; i++) {
      const initialized = await initProject({ project_root: root, project_name: "Already Built" });
      expect(initialized.isError).toBeFalsy();
      expect(initialized.structuredContent?.pendingFiles).toEqual([]);
    }
    ledger = new ProjectTaskLedger(root);
    expect(ledger.list().map(t => [t.id, t.status])).toEqual([["APP-01", "ready"]]);
    ledger.close();
    expect(fs.readFileSync(path.join(root, "src/main.ts"), "utf8"))
      .toBe("export const running = true;\n");
    expect(execFileSync("git", ["rev-parse", "HEAD"], { cwd: root }).toString().trim())
      .toBe(before);
    expect(fs.existsSync(path.join(root, "docs/specs/already-built/tasks.md"))).toBe(false);
  });

  it("recognizes nonstandard existing documents but never marks unapproved task drafts as a plan", () => {
    const root = fixture();
    put(root, "docs/project-context.md", "# Legacy project context\nAn existing confirmed objective and domain.\n");
    put(root, "docs/constitution.md", "# Constitution\nExisting development standards and gates.\n");
    put(root, "docs/requirements.md", "# Requirements\nRequirements and testable acceptance.\n");
    put(root, "docs/architecture.md", "# Architecture\nA meaningful technical baseline.\n");
    commit(root);
    const ledger = new ProjectTaskLedger(root);
    ledger.create({ id: "LEGACY-01", title: "Suggested work",
      allowedPaths: ["src/**"], requiredGates: ["docs"] }, "agent-onboarding-fixture");
    const state = projectOnboarding(root, ledger.list());
    expect(state.kind).toBe("existing");
    expect(state.readiness).toBe("needs_plan");
    expect(state.steps.slice(0, 4).map(s => s.status)).toEqual([
      "present", "present", "present", "present",
    ]);
    expect(state.steps[4].status).toBe("missing");
    ledger.close();
    expect(projectHtml("unit-nonce")).toContain("onboarding-panel");
    expect(projectHtml("unit-nonce")).toContain("/api/onboarding");
  });

  it("serves project-specific onboarding over a strictly read-only HTTP API", async () => {
    const root = fixture();
    const ledger = new ProjectTaskLedger(root);
    const server = createDevControlBoardServer(ledger);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      const base = "http://127.0.0.1:" + port;
      const response = await fetch(base + "/api/onboarding");
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toMatchObject({ kind: "new", readiness: "needs_baseline",
        taskCount: 0, readOnly: true });
      expect(json.steps).toHaveLength(5);
      expect((await fetch(base + "/api/onboarding", { method: "POST" })).status).toBe(405);
      const html = await (await fetch(base)).text();
      expect(html).toContain('id="onboarding-steps"');
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
      ledger.close();
    }
  });
});
