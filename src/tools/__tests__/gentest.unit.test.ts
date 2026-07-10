import { describe, expect, test } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { gentest } from "../gentest.js";

describe("gentest 单元测试", () => {
  test("传入 code 时注入待测内容并标明 guidance 模式", async () => {
    const sample = "export function add(a: number, b: number) { return a + b; }\n";
    const result = await gentest({ code: sample, framework: "vitest" });

    expect(result.isError).toBeFalsy();
    const text = String(result.content[0].text);
    expect(text).toContain("return a + b");
    expect(text).toMatch(/指南型|guidance/i);

    const structured = (result as any).structuredContent;
    expect(structured.mode).toBe("guidance");
    expect(structured.gentestInput.received).toBe(true);
    expect(structured.gentestInput.framework).toBe("vitest");
    expect(structured.gentestInput.code).toContain("add");
  });

  test("未传 code/file_path 时明确提示 Agent 需先获取代码", async () => {
    const result = await gentest({ framework: "jest" });
    const text = String(result.content[0].text);
    expect(text).toMatch(/未提供 code/);
    expect((result as any).structuredContent.gentestInput.received).toBe(false);
  });

  test("file_path 可读时注入文件内容", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gentest-"));
    const filePath = path.join(dir, "math.ts");
    fs.writeFileSync(filePath, "export const mul = (a: number, b: number) => a * b;\n", "utf-8");

    try {
      const result = await gentest({ file_path: filePath, project_root: dir });
      const text = String(result.content[0].text);
      expect(text).toContain("a * b");
      expect((result as any).structuredContent.gentestInput.file).toBe(filePath);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
