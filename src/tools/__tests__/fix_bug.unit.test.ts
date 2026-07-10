import { describe, expect, test } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fixBug } from "../fix_bug.js";

describe("fix_bug 单元测试", () => {
  test("返回 SRC-8 delegated plan、真因工作表与门禁", async () => {
    const result = await fixBug({
      error_message: "登录提交后页面白屏",
      stack_trace: "TypeError at src/auth/login.ts:45:12",
      expected_behavior: "提示错误",
      actual_behavior: "白屏",
      success_sample: "错误密码时表单正常提示",
      verification_target: "原复现步骤通过且 auth 单测绿",
    });

    expect(result.isError).toBe(false);
    const structured = (result as any).structuredContent;
    const text = String(result.content[0].text);

    expect(structured.mode).toBe("delegated");
    expect(structured.methodology).toBe("src8");
    expect(structured.metadata.plan.mode).toBe("delegated");
    expect(structured.metadata.plan.steps.map((s: any) => s.id)).toEqual([
      "src8-1",
      "src8-2",
      "src8-3",
      "src8-4",
      "src8-5",
      "src8-6",
      "src8-7",
      "src8-8",
    ]);
    expect(structured.src8Checklist).toHaveLength(8);
    expect(structured.rootCauseWorksheet.substeps).toHaveLength(5);
    expect(structured.src8Gate.blockCodeChangeUntilStep).toBe(4);
    expect(structured.attributionLayers.some((l: any) => l.id === "agent_behavior")).toBe(true);
    expect(text).toMatch(/SRC-8/);
    expect(text).not.toMatch(/方法论渊源/);
    expect(text).not.toMatch(/docs\/src8-methodology/);
    expect(text).toMatch(/rootCauseAnalysis|真因工作表/);
    expect(text).toMatch(/metadata\.plan/);
    expect(structured.bugfixInput.hasVerificationTarget).toBe(true);
  });

  test("支持 code_context 进入证据链", async () => {
    const result = await fixBug({
      error_message: "接口成功但前端未生效",
      code_context: "auth flow summary",
    });
    const structured = (result as any).structuredContent;
    expect(structured.bugfixInput.evidence.some((item: any) => item.source === "code_context")).toBe(true);
  });

  test("file_path 可读时注入代码上下文", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fix-bug-"));
    const filePath = path.join(dir, "handler.ts");
    fs.writeFileSync(filePath, "throw new Error('boom');\n", "utf-8");

    try {
      const result = await fixBug({
        error_message: "handler 抛错",
        file_path: filePath,
        project_root: dir,
      });
      const structured = (result as any).structuredContent;
      expect(structured.bugfixInput.code_context).toContain("boom");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
