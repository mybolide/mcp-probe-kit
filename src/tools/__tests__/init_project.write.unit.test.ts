import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { initProject } from "../init_project.js";

describe("init_project 落盘边界", () => {
  test("仅写入 Skill 与 AGENTS.md，docs 由 Agent 创建", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-probe-init-project-"));
    const result = await initProject({
      project_name: "Demo App",
      project_root: projectRoot,
      input: "一个简单的演示应用",
    });

    expect(result.isError).toBeFalsy();
    const structured = (result as any).structuredContent;
    expect(structured.summary).toBe(
      "已生成项目初始化写作计划，请 Agent 按指南落盘 docs/specs/scripts/src"
    );
    expect(structured.nextSteps[0]).toContain("MCP 仅写入 Skill 与 AGENTS.md");
    expect(structured.nextSteps[0]).toContain("Agent 须按指南手动落盘");
    expect(structured.writtenFiles.length).toBe(2);
    expect(structured.pendingFiles.length).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(projectRoot, "AGENTS.md"))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, "docs", "project-context.md"))).toBe(false);
    expect(fs.existsSync(path.join(projectRoot, "docs", "specs", "demo-app", "requirements.md"))).toBe(
      false
    );
  });
});
