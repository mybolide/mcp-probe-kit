import { describe, expect, test } from "vitest";
import {
  ATTRIBUTION_LAYERS,
  buildRootCauseWorksheet,
  buildSrc8Checklist,
  buildSrc8DelegatedPlan,
  buildSrc8EvidenceFromInput,
  mergeBugfixOrchestrationPlan,
  renderSrc8GateRules,
  renderTbpInspirationSection,
  resolveAnalysisMode,
} from "../../lib/src8-guidance.js";

describe("src8-guidance 单元测试", () => {
  test("buildSrc8Checklist 为 8 步且 Step 4 为 root_cause", () => {
    const checklist = buildSrc8Checklist();
    expect(checklist).toHaveLength(8);
    expect(checklist[0].id).toBe("clarify_gap");
    expect(checklist[3].id).toBe("root_cause");
    expect(checklist[3].inspiredByTbpStep).toBe(4);
    expect(checklist.every((item) => item.inspiredByTbpStep >= 1)).toBe(true);
  });

  test("buildRootCauseWorksheet 含 4a~4e 子步", () => {
    const ws = buildRootCauseWorksheet({ hasComparisonSample: false });
    expect(ws.substeps.map((s) => s.id)).toEqual(["4a", "4b", "4c", "4d", "4e"]);
    expect(ws.template.evidenceGaps.length).toBeGreaterThan(0);
  });

  test("归因层含 agent_behavior", () => {
    expect(ATTRIBUTION_LAYERS.some((l) => l.id === "agent_behavior")).toBe(true);
  });

  test("renderTbpInspirationSection 说明借鉴关系", () => {
    const text = renderTbpInspirationSection();
    expect(text).toMatch(/丰田 TBP/);
    expect(text).toMatch(/不是.*逐字翻译/);
  });

  test("resolveAnalysisMode 兼容 tbp8 别名", () => {
    expect(resolveAnalysisMode("tbp8")).toBe("src8");
    expect(resolveAnalysisMode("src8")).toBe("src8");
  });

  test("renderSrc8GateRules 强调 Step 4 工作表", () => {
    expect(renderSrc8GateRules()).toMatch(/rootCauseWorksheet|真因工作表/);
  });

  test("buildSrc8EvidenceFromInput 支持验收目标", () => {
    const evidence = buildSrc8EvidenceFromInput({
      error_message: "err",
      verification_target: "test green",
    });
    expect(evidence.some((e) => e.source === "verification_target")).toBe(true);
  });

  test("buildSrc8DelegatedPlan 产出 8 步 delegated plan", () => {
    const plan = buildSrc8DelegatedPlan({ error_message: "boom" });
    expect(plan.mode).toBe("delegated");
    expect(plan.steps.map((s) => s.id)).toEqual([
      "src8-1",
      "src8-2",
      "src8-3",
      "src8-4",
      "src8-5",
      "src8-6",
      "src8-7",
      "src8-8",
    ]);
    expect(plan.steps.find((s) => s.id === "src8-4")?.dependsOn).toContain("src8-3");
  });

  test("mergeBugfixOrchestrationPlan 可前置上下文步骤", () => {
    const plan = mergeBugfixOrchestrationPlan({
      src8Input: { error_message: "err" },
      preambleSteps: [{ id: "context", tool: "init_project_context", outputs: [] }],
    });
    expect(plan.steps[0].id).toBe("context");
    expect(plan.steps.some((s) => s.id === "src8-1")).toBe(true);
  });
});
