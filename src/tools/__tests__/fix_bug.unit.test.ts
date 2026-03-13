import { describe, expect, test } from "vitest";
import { fixBug } from "../fix_bug.js";

describe("fix_bug 单元测试", () => {
  test("返回 TBP8 结构化输出", async () => {
    const result = await fixBug({
      error_message: "登录提交后页面白屏",
      stack_trace: "TypeError: Cannot read property 'token' of undefined at src/auth/login.ts:45:12",
      expected_behavior: "提示错误并保持页面可交互",
      actual_behavior: "页面白屏，无法继续操作",
    });

    expect(result.isError).toBe(false);
    expect("structuredContent" in result).toBe(true);
    const structured = (result as any).structuredContent;
    expect(structured.analysisMode).toBe("tbp8");
    expect(structured.tbp.phenomenon).toMatch(/页面白屏|登录提交/);
    expect(Array.isArray(structured.tbp.timeline)).toBe(true);
    expect(structured.tbp.timeline.length).toBeGreaterThan(0);
    expect(Array.isArray(structured.tbp.repair)).toBe(true);
    expect(structured.affectedFiles).toContain("src/auth/login.ts");
  });

  test("支持 code_context 并进入证据链", async () => {
    const result = await fixBug({
      error_message: "接口返回成功但前端没生效",
      code_context: "图谱摘要: auth flow\n图谱线索: query: src/modules/record/index.js",
    });

    expect(result.isError).toBe(false);
    const structured = (result as any).structuredContent;
    expect(structured.tbp.evidence.some((item: any) => item.source === "code_context")).toBe(true);
    expect(structured.fixPlan.steps[0]).toMatch(/TBP-1/);
  });
});
