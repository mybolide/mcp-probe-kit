import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { initProject } from "../init_project.js";

function resultText(result: any): string {
  return (result.content ?? []).map((item: any) => item.text ?? "").join("\n");
}

describe("init_project 落盘边界", () => {
  test("仅写入 Skill 与 AGENTS.md，docs 由 Agent 创建", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-probe-init-project-"));
    try {
      const result = await initProject({
        project_name: "Demo App",
        project_root: projectRoot,
        input: "一个简单的演示应用",
      });

      expect(result.isError).toBeFalsy();
      const structured = (result as any).structuredContent;
      const text = resultText(result);
      expect(structured.summary).toBe(
        "已生成项目初始化写作计划，请 Agent 按指南落盘 docs/specs/scripts/src"
      );
      expect(structured.nextSteps[0]).toContain("MCP 的自动写入范围仅限 Skill 与 AGENTS.md");
      expect(structured.nextSteps[0]).toContain("Agent 须按指南手动落盘");
      expect(structured.writtenFiles.length).toBe(2);
      expect(structured.writtenFiles.every((file: any) => file.action === "created")).toBe(true);
      expect(structured.structure.writtenFiles).toHaveLength(2);
      expect(text).toContain("本次已创建");
      expect(text).toContain("MCP 已完成必要的创建或更新");
      expect(structured.pendingFiles.length).toBeGreaterThan(0);
      expect(fs.existsSync(path.join(projectRoot, "AGENTS.md"))).toBe(true);
      expect(fs.existsSync(path.join(projectRoot, "docs", "project-context.md"))).toBe(false);
      expect(fs.existsSync(path.join(projectRoot, "docs", "specs", "demo-app", "requirements.md"))).toBe(
        false
      );
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test("幂等调用如实说明文件已存在且本次没有写入", async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-probe-init-project-idempotent-"));
    try {
      const args = {
        project_name: "Demo App",
        project_root: projectRoot,
        input: "一个简单的演示应用",
      };
      await initProject(args);
      const second = await initProject(args);
      const structured = (second as any).structuredContent;
      const text = resultText(second);

      expect(second.isError).toBeFalsy();
      expect(structured.bootstrap.skillCreated).toBe(false);
      expect(structured.bootstrap.skillUpdated).toBe(false);
      expect(structured.bootstrap.agentsCreated).toBe(false);
      expect(structured.bootstrap.agentsUpdated).toBe(false);
      expect(structured.writtenFiles.every((file: any) => file.action === "skipped")).toBe(true);
      expect(structured.structure.writtenFiles).toEqual([]);
      expect(structured.nextSteps[0]).toContain("自动写入范围仅限");
      expect(text).toContain("已存在且无需更新");
      expect(text).toContain("本次无需写入或更新");
      expect(text).not.toContain("已完成服务端写入");
      expect(text).not.toContain("已由 mcp-probe-kit 写入");
      expect(text).not.toContain("MCP 已写入 Skill 与 AGENTS.md");
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  test("拒绝用户家目录且不会改动已有托管文件", async () => {
    const home = os.homedir();
    const protectedFiles = [
      path.join(home, "AGENTS.md"),
      path.join(home, ".agents", "skills", "mcp-probe-kit", "SKILL.md"),
      path.join(home, ".mcp-probe-kit", "bin", "probe.cmd"),
      path.join(home, ".mcp-probe-kit", "bin", "probe"),
    ];
    const snapshot = (file: string) =>
      fs.existsSync(file) && fs.statSync(file).isFile()
        ? fs.readFileSync(file).toString("base64")
        : null;
    const before = protectedFiles.map(snapshot);

    const result = await initProject({
      project_name: "Must Not Write Home",
      project_root: home,
      input: "受保护路径回归测试",
    });

    expect(result.isError).toBe(true);
    expect(resultText(result)).toMatch(/用户家目录|独立的项目子目录/);
    expect((result as any).structuredContent.error_code).toBe("INIT_PROJECT_REJECTED");
    expect(protectedFiles.map(snapshot)).toEqual(before);
  });
});
