import { describe, expect, test } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { refactor } from "../refactor.js";

describe("refactor 单元测试", () => {
  test("传入 code 时注入待重构内容并标明 guidance 模式", async () => {
    const sample = "function f(x){if(x){if(x>0){return x*2}}return 0}\n";
    const result = await refactor({ code: sample, goal: "reduce_complexity" });

    expect(result.isError).toBeFalsy();
    const text = String(result.content[0].text);
    expect(text).toContain("return x*2");
    expect(text).toMatch(/指南型|guidance/i);

    const structured = (result as any).structuredContent;
    expect(structured.mode).toBe("guidance");
    expect(structured.refactorInput.received).toBe(true);
    expect(structured.refactorInput.goal).toBe("reduce_complexity");
    expect(structured.refactorInput.code).toContain("return x*2");
  });

  test("未传 code/file_path 时明确提示 Agent 需先获取代码", async () => {
    const result = await refactor({ goal: "improve_readability" });
    const text = String(result.content[0].text);
    expect(text).toMatch(/未提供 code/);
    expect((result as any).structuredContent.refactorInput.received).toBe(false);
  });

  test("file_path 可读时注入文件内容", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "refactor-"));
    const filePath = path.join(dir, "legacy.js");
    fs.writeFileSync(filePath, "const MAGIC = 42;\n", "utf-8");

    try {
      const result = await refactor({ file_path: filePath, project_root: dir });
      const text = String(result.content[0].text);
      expect(text).toContain("MAGIC = 42");
      expect((result as any).structuredContent.refactorInput.file).toBe(filePath);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
