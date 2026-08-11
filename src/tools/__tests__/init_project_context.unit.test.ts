import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { initProjectContext } from "../init_project_context.js";

describe("init_project_context 单元测试", () => {
  test("文件系统根目录使用明确保护语义拒绝，不继续进入 mkdir 写路径", async () => {
    const filesystemRoot = path.parse(path.resolve(process.cwd())).root;
    const result = await initProjectContext({ project_root: filesystemRoot });
    const text = ((result as any).content ?? [])
      .map((item: any) => item?.text ?? "")
      .join("\n");

    expect((result as any).isError).toBe(true);
    expect(text).toMatch(/文件系统根目录不允许作为 MCP 项目写入根目录/);
    expect(text).not.toMatch(/EPERM|EACCES/);
  });

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

  test("重复调用对未变化的托管文件报告 skipped，不伪报本次更新", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-probe-kit-idempotent-"));
    const first = await initProjectContext({ project_root: projectRoot });
    const agentsPath = path.join(projectRoot, "AGENTS.md");
    const manifestPath = path.join(projectRoot, "docs", ".mcp-probe", "layout.json");
    const firstAgents = fs.readFileSync(agentsPath, "utf8");
    const firstManifest = fs.readFileSync(manifestPath, "utf8");

    const second = await initProjectContext({ project_root: projectRoot });
    const structured = (second as any).structuredContent;
    const byPath = new Map(
      structured.writtenFiles.map((file: any) => [file.path, file.action]),
    );
    const text = second.content[0].text;

    expect(first.isError).toBeFalsy();
    expect(second.isError).toBeFalsy();
    expect(byPath.get("AGENTS.md")).toBe("skipped");
    expect(byPath.get("docs/.mcp-probe/layout.json")).toBe("skipped");
    expect(fs.readFileSync(agentsPath, "utf8")).toBe(firstAgents);
    expect(fs.readFileSync(manifestPath, "utf8")).toBe(firstManifest);
    expect(text).toContain("已存在且无需更新");
    expect(text).not.toContain("AGENTS.md 已由 MCP 写入");
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


  test("高版本 AGENTS 托管块不得被当前版本降级", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-probe-kit-agents-high-"));
    const higherVersionAgents = [
      '<!-- mcp-probe:context begin — generated by newer kit -->',
      '<!-- mcp-probe:context-version: 9.9.9 -->',
      '## MCP from newer version',
      'KEEP_HIGH_AGENTS',
      '<!-- mcp-probe:context end -->',
      '',
      '# User rules',
      'keep custom rules',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(projectRoot, 'AGENTS.md'), higherVersionAgents, 'utf8');

    const result = await initProjectContext({ project_root: projectRoot });
    const agents = fs.readFileSync(path.join(projectRoot, 'AGENTS.md'), 'utf8');

    expect(result.isError).toBeFalsy();
    expect(agents).toBe(higherVersionAgents);
    const structured = (result as any).structuredContent;
    const agentsDelivery = structured.writtenFiles.find((file: any) => file.path === 'AGENTS.md');
    expect(structured.metadata?.agentsMdMergeMode).toBe('preserved-higher-version');
    expect(agentsDelivery?.action).toBe('skipped');
    expect(result.content[0].text).toContain('已存在且无需更新');
    expect(result.content[0].text).not.toContain('本次已更新');
  });
});
