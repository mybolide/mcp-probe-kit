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

  test("从 package.json 的 node --test 脚本识别 node:test，不默认编造 Jest", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gentest-node-test-"));
    const sourceDir = path.join(dir, "src");
    const testDir = path.join(dir, "test");
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({
      type: "module",
      scripts: { test: "node --test" },
    }), "utf-8");
    const sourcePath = path.join(sourceDir, "math.js");
    fs.writeFileSync(sourcePath, "export const add = (a, b) => a + b;\n", "utf-8");
    fs.writeFileSync(
      path.join(testDir, "math.test.js"),
      "import test from 'node:test';\nimport assert from 'node:assert/strict';\n",
      "utf-8",
    );

    try {
      const result = await gentest({ file_path: sourcePath, project_root: dir });
      const structured = (result as any).structuredContent;
      const text = String(result.content[0].text);
      expect(structured.gentestInput.framework).toBe("node:test");
      expect(structured.gentestInput.frameworkSource).toBe("package-script");
      expect(text).toContain("🧪 **测试框架**：node:test");
      expect(text).toContain("node:assert/strict");
      expect(text).not.toContain("测试框架**：jest");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("无框架证据时返回未识别，不默认 Jest", async () => {
    const result = await gentest({ code: "export const value = 1;" });
    const structured = (result as any).structuredContent;
    expect(structured.gentestInput.frameworkSource).toBe("unresolved");
    expect(structured.gentestInput.framework).toContain("未识别");
    expect(String(result.content[0].text)).not.toContain("测试框架**：jest");
  });
});
