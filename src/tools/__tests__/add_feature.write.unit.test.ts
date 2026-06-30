import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { addFeature } from "../add_feature.js";

describe("add_feature 不落盘", () => {
  test("仅返回模板与 pendingFiles，不写 specs 文件", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-probe-add-feature-"));
    const cwd = process.cwd();
    process.chdir(projectRoot);

    try {
      const result = await addFeature({
        feature_name: "user-auth",
        description: "用户登录与注册",
      });

      expect(result.isError).toBeFalsy();
      const structured = (result as any).structuredContent;
      expect(structured.summary).toBe("已生成功能规格写作计划：user-auth");
      expect(structured.pendingFiles).toHaveLength(3);
      expect(structured.specPaths).toHaveLength(3);
      expect(structured.writtenFiles).toBeUndefined();
      expect((result as any)._meta?.note).toMatch(/不代写文件/);
      expect(fs.existsSync(path.join(projectRoot, "docs", "specs", "user-auth", "requirements.md"))).toBe(
        false
      );
      const text = String(result.content[0].text);
      expect(text).toMatch(/由 Agent 落盘/);
      expect(text).toMatch(/MCP \*\*不会\*\*写入磁盘/);
    } finally {
      process.chdir(cwd);
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
