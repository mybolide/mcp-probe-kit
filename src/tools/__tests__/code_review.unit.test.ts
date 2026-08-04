import { describe, expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { codeReview } from "../code_review.js";
import { buildDelegatedPlanContract } from "../../lib/delegated-plan-contract.js";
import { JsonPlanStore } from "../../plans/plan-store.js";
import type { PlanHeartbeatRecord } from "../../plans/plan-types.js";

function git(root: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  }).trim();
}

function makeGitRepo(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "code-review-git-"));
  git(root, ["init"]);
  git(root, ["config", "user.email", "test@example.com"]);
  git(root, ["config", "user.name", "Test User"]);
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "app.ts"), "export const value = 1;\n", "utf8");
  git(root, ["add", "."]);
  git(root, ["commit", "-m", "initial"]);
  return root;
}

describe("code_review 单元测试", () => {
  test("传入 code 时注入待审内容，并标明由 Agent 生成 issues", async () => {
    const sample = "const api_key = 'sk-live-abcdefgh';\n// TODO: fix\n";
    const result = await codeReview({ code: sample, focus: "security" });

    expect(result.isError).toBeFalsy();
    const text = String(result.content[0].text);
    expect(text).toContain("sk-live-abcdefgh");
    expect(text).toContain("Agent 必须输出的 JSON");
    expect(text).toMatch(/指南型|guidance/i);
    expect(text).not.toMatch(/静态扫描结果/);

    const meta = (result as any)._meta;
    const structured = (result as any).structuredContent;
    expect(structured.mode).toBe("guidance");
    expect(structured.reviewInput.received).toBe(true);
    expect(structured.reviewInput.code).toContain("sk-live-abcdefgh");
    expect(meta?.note).toMatch(/Agent/);
  });

  test("未传 code/file_path 时明确提示 Agent 需先获取代码", async () => {
    const result = await codeReview({ focus: "quality" });
    const text = String(result.content[0].text);
    expect(text).toMatch(/未提供 code/);
    expect((result as any).structuredContent.reviewInput.received).toBe(false);
  });

  test("file_path 可读时注入文件内容", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "code-review-"));
    const filePath = path.join(dir, "sample.ts");
    fs.writeFileSync(filePath, "eval(input);\n", "utf-8");

    try {
      const result = await codeReview({ file_path: filePath, project_root: dir });
      const text = String(result.content[0].text);
      expect(text).toContain("eval(input)");
      expect((result as any).structuredContent.reviewInput.file).toBe(filePath);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("提供 project_root 且无 code/file_path 时自动注入真实 Git diff", async () => {
    const root = makeGitRepo();
    fs.writeFileSync(path.join(root, "src", "app.ts"), "export const value = 2;\n", "utf8");

    try {
      const result = await codeReview({ project_root: root, focus: "quality" });
      const structured = (result as any).structuredContent;
      const text = String(result.content[0].text);

      expect(result.isError).toBeFalsy();
      expect(structured.reviewInput.source).toBe("git-diff");
      expect(structured.reviewInput.code).toContain("value = 2");
      expect(structured.diffEvidence).toMatchObject({
        available: true,
        mode: "auto",
      });
      expect(structured.diffEvidence.changedFiles).toContainEqual(expect.objectContaining({
        path: "src/app.ts",
        status: "M",
      }));
      expect(text).toContain("Git / Plan Evidence");
      expect(text).toContain("真实 Git diff");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("plan_id 对照真实 diff 并报告越界、测试和 revision 缺口", async () => {
    const root = makeGitRepo();
    const plan = buildDelegatedPlanContract({
      planId: "feature-code-review-plan",
      workflow: "feature",
      workflowVersion: "4.0.0",
      objective: "only change src/allowed",
      declaredScope: { paths: ["src/allowed"] },
      steps: [{ id: "implementation", type: "agent_action", action: "implement" }],
    });
    const now = new Date().toISOString();
    const record: PlanHeartbeatRecord = {
      schemaVersion: "1.0.0",
      planId: plan.planId,
      plan,
      status: "active",
      completedStepIds: ["implementation"],
      skippedSteps: [],
      unresolvedItems: [],
      evidence: [],
      declaredScope: { paths: ["src/allowed"] },
      artifacts: [],
      memoryCandidates: [],
      architectureCandidates: [],
      acceptanceResults: [],
      runtimeEvidence: [],
      lastVerifiedRevision: "stale-revision",
      createdAt: now,
      updatedAt: now,
    };
    await new JsonPlanStore(root).write(record);
    fs.writeFileSync(path.join(root, "src", "app.ts"), "export const value = 3;\n", "utf8");

    try {
      const result = await codeReview({
        project_root: root,
        plan_id: plan.planId,
      });
      const structured = (result as any).structuredContent;

      expect(structured.planContext).toMatchObject({
        planId: plan.planId,
        workflow: "feature",
      });
      expect(structured.consistency.outOfScopeFiles).toEqual(["src/app.ts"]);
      expect(structured.consistency.findings).toEqual(expect.arrayContaining([
        expect.objectContaining({ severity: "high", category: "scope" }),
        expect.objectContaining({ severity: "high", category: "test" }),
        expect.objectContaining({ severity: "high", category: "revision" }),
      ]));
      expect(String(result.content[0].text)).toContain("Deterministic Consistency Findings");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("拒绝非法 diff_mode 与不完整 range", async () => {
    const root = makeGitRepo();
    try {
      const invalidMode = await codeReview({ project_root: root, diff_mode: "forever" });
      expect(invalidMode.isError).toBe(true);
      expect(String(invalidMode.content[0].text)).toContain("diff_mode");

      const invalidRange = await codeReview({ project_root: root, diff_mode: "range" });
      expect(invalidRange.isError).toBeFalsy();
      expect((invalidRange as any).structuredContent.diffEvidence).toMatchObject({
        available: false,
        mode: "range",
      });
      expect((invalidRange as any).structuredContent.evidenceWarnings.join(" ")).toContain("base_ref");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
