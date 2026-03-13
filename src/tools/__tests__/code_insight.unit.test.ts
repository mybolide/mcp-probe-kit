import { describe, expect, test } from "vitest";
import { codeInsight, resolveCodeInsightQuery } from "../code_insight.js";
import * as os from "node:os";
import * as fs from "node:fs";
import * as path from "node:path";

describe("code_insight 单元测试", () => {
  test("mode 非法时返回错误", async () => {
    const result = await codeInsight({
      mode: "unknown-mode",
      query: "auth",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/不支持的 mode/i);
  });

  test("bridge 禁用时返回降级结果（非硬错误）", async () => {
    const prev = process.env.MCP_ENABLE_GITNEXUS_BRIDGE;
    process.env.MCP_ENABLE_GITNEXUS_BRIDGE = "0";

    try {
      const result = await codeInsight({
        mode: "query",
        query: "authentication middleware",
      });

      expect(result.isError).toBe(false);
      expect("structuredContent" in result).toBe(true);
      const structured = (result as any).structuredContent;
      expect(structured.status).toBe("degraded");
      expect(structured.provider).toBe("gitnexus");
    } finally {
      if (prev === undefined) {
        delete process.env.MCP_ENABLE_GITNEXUS_BRIDGE;
      } else {
        process.env.MCP_ENABLE_GITNEXUS_BRIDGE = prev;
      }
    }
  });

  test("当前目录为家目录时提示传入 project_root", async () => {
    const prev = process.env.MCP_ENABLE_GITNEXUS_BRIDGE;
    process.env.MCP_ENABLE_GITNEXUS_BRIDGE = "1";

    try {
      const result = await codeInsight({
        mode: "query",
        query: "authentication middleware",
        project_root: os.homedir(),
      });

      expect(result.isError).toBe(false);
      expect("structuredContent" in result).toBe(true);
      const structured = (result as any).structuredContent;
      expect(structured.status).toBe("degraded");
      if (structured.warnings.includes("bridge_disabled")) {
        expect(structured.summary).toMatch(/bridge/i);
      } else {
        expect(structured.warnings).toContain("project_root_required");
        expect(structured.summary).toMatch(/project_root/i);
      }
    } finally {
      if (prev === undefined) {
        delete process.env.MCP_ENABLE_GITNEXUS_BRIDGE;
      } else {
        process.env.MCP_ENABLE_GITNEXUS_BRIDGE = prev;
      }
    }
  });

  test("auto 模式在缺少 query/target 时使用项目概览默认查询", () => {
    const resolved = resolveCodeInsightQuery({
      mode: "auto",
      query: "",
      target: "",
      input: "",
    });

    expect(resolved.finalTarget).toBe("");
    expect(resolved.finalQuery).toMatch(/核心流程/);
    expect(resolved.finalQuery).toMatch(/依赖关系/);
  });

  test("返回 docs 保存指引而不直接代写文件", async () => {
    const prev = process.env.MCP_ENABLE_GITNEXUS_BRIDGE;
    process.env.MCP_ENABLE_GITNEXUS_BRIDGE = "0";
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "code-insight-docs-"));

    try {
      const result = await codeInsight({
        mode: "auto",
        project_root: projectRoot,
      });

      expect(result.isError).toBe(false);
      const text = String((result as any).content?.[0]?.text || "");
      const structured = (result as any).structuredContent;
      expect(text).toMatch(/delegated plan/);
      expect(text).toMatch(/不要只口头总结而不写文件/);
      expect(text).toMatch(/docs\/graph-insights\/latest\.md/);
      expect(text).toMatch(/docs\/project-context\.md/);
      expect(structured.projectDocs.latestMarkdownFilePath).toContain("/docs/graph-insights/latest.md");
      expect(structured.projectDocs.archiveMarkdownFilePath).toContain("/docs/graph-insights/");
      expect(structured.projectDocs.projectContextFilePath).toContain("/docs/project-context.md");
      expect(structured.projectDocs.navigationSnippet).toMatch(/代码图谱洞察/);
      expect(structured.plan.mode).toBe("delegated");
      expect(structured.plan.steps[0].outputs[0]).toContain("/docs/project-context.md");
      const updateIndexStep = structured.plan.steps.find((step: any) => step.id === "update-project-context-index");
      expect(updateIndexStep.note).toMatch(/代码图谱洞察/);
      expect(fs.existsSync(path.join(projectRoot, "docs", "graph-insights", "latest.md"))).toBe(false);
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
      if (prev === undefined) {
        delete process.env.MCP_ENABLE_GITNEXUS_BRIDGE;
      } else {
        process.env.MCP_ENABLE_GITNEXUS_BRIDGE = prev;
      }
    }
  });
});
