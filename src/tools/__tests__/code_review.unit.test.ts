import { describe, expect, test } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { codeReview } from "../code_review.js";

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
});
