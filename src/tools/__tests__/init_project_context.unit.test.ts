import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { initProjectContext } from "../init_project_context.js";

describe("init_project_context 单元测试", () => {
  test("MCP 仅写入 AGENTS.md 与 layout.json", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-probe-kit-init-"));
    const result = await initProjectContext({
      docs_dir: "docs",
      project_root: projectRoot,
    });

    expect(result.isError).toBeFalsy();
    expect("structuredContent" in result).toBe(true);
    if (!("structuredContent" in result)) {
      throw new Error("structuredContent 缺失");
    }

    const structured = (result as any).structuredContent;
    expect(structured.writtenFiles.some((f: any) => f.path === "AGENTS.md")).toBe(true);
    expect(structured.writtenFiles.some((f: any) => f.path === "docs/.mcp-probe/layout.json")).toBe(
      true
    );
    expect(structured.pendingFiles.some((f: any) => f.path === "docs/project-context.md")).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, "docs", ".mcp-probe", "layout.json"))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, "AGENTS.md"))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, "docs", "project-context.md"))).toBe(false);
    expect(fs.existsSync(path.join(projectRoot, "docs", "project-context", "tech-stack.md"))).toBe(
      false
    );

    const plan = structured.metadata?.plan;
    expect(plan?.mode).toBe("delegated");
    expect(structured.summary).toMatch(/写作计划/);
    expect(structured.summary).not.toMatch(/^生成 .*项目上下文/);
    expect(structured.nextSteps?.[0]).toMatch(/不会自动生成完整/);

    const legacyDoc = structured.documentation?.find(
      (doc: any) => doc.path === "docs/project-context.md"
    );
    expect(legacyDoc).toMatchObject({
      exists: false,
      written: false,
      agent_action_required: true,
    });

    const agentsDoc = structured.documentation?.find((doc: any) => doc.path === "AGENTS.md");
    expect(agentsDoc).toMatchObject({
      exists: true,
      written: true,
      agent_action_required: false,
    });

    expect(plan.steps.map((step: any) => step.id)).toEqual([
      "write-modular-docs",
      "bootstrap-code-insight",
      "persist-graph-docs",
    ]);

    const text = result.content[0].text;
    expect(text).toMatch(/文件落盘状态/);
    expect(text).toMatch(/尚未创建/);
  });

  test("输出文本包含 AGENTS.md 与 MCP 触发规则", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-probe-kit-init-"));
    const result = await initProjectContext({
      project_root: projectRoot,
    });

    const text = result.content[0].text;
    expect(text).toMatch(/AGENTS\.md/);
    expect(text).toMatch(/文件落盘状态/);
  });

  test("已存在 project-context 分类文档时跳过重写 modular", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-probe-kit-context-"));
    fs.mkdirSync(path.join(projectRoot, "docs", "project-context"), { recursive: true });
    fs.writeFileSync(path.join(projectRoot, "docs", "project-context.md"), "# existing context\n", "utf8");

    const result = await initProjectContext({
      docs_dir: "docs",
      project_root: projectRoot,
    });

    expect(result.isError).toBeFalsy();
    const structured = (result as any).structuredContent;
    expect(structured.metadata?.legacyProjectContextExists).toBe(true);
    expect(structured.metadata?.plan?.steps.map((step: any) => step.id)).toEqual([
      "bootstrap-code-insight",
      "persist-graph-docs",
    ]);
    expect(structured.pendingFiles.every((f: any) => !f.path.startsWith("docs/project-context"))).toBe(
      true
    );
    expect(structured.summary).toMatch(/保留现有分类文档/);

    const legacyDoc = structured.documentation?.find(
      (doc: any) => doc.path === "docs/project-context.md"
    );
    expect(legacyDoc).toMatchObject({
      exists: true,
      written: true,
      agent_action_required: false,
    });

    const graphDoc = structured.documentation?.find(
      (doc: any) => doc.path === "docs/graph-insights/latest.md"
    );
    expect(graphDoc).toMatchObject({
      exists: false,
      written: false,
      agent_action_required: true,
    });

    expect(fs.readFileSync(path.join(projectRoot, "docs", "project-context.md"), "utf8")).toBe(
      "# existing context\n"
    );
    expect(fs.existsSync(path.join(projectRoot, "AGENTS.md"))).toBe(true);

    const text = result.content[0].text;
    expect(text).toMatch(/保留/);
  });

  test("已有 AGENTS.md 时 merge 而非覆盖", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-probe-kit-agents-"));
    fs.writeFileSync(path.join(projectRoot, "AGENTS.md"), "# Custom rules\n", "utf8");

    const result = await initProjectContext({
      project_root: projectRoot,
    });

    const agents = fs.readFileSync(path.join(projectRoot, "AGENTS.md"), "utf8");
    expect(agents).toContain("# Custom rules");
    expect(agents).toMatch(/mcp-probe:context/);
    expect((result as any).structuredContent.metadata?.agentsMdMergeMode).not.toBe("replaced");
  });
});
