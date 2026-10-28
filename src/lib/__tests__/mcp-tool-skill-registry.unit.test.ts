import { describe, expect, it } from "vitest";
import { allToolSchemas } from "../../schemas/index.js";
import { isV5Tool } from "../../server/v5-tool-policy.js";
import {
  formatSkillRegistryMismatchMessage,
  listMcpToolSkillRegistryNames,
  validateMcpToolSkillRegistry,
} from "../mcp-tool-skill-registry.js";
import { generateWorkflowSkillContent } from "../workflow-skill-template.js";

describe("mcp-tool-skill-registry", () => {
  it("与 allToolSchemas 工具名一一对应", () => {
    const registered = allToolSchemas.filter(({ name }) => isV5Tool(name)).map((tool) => tool.name).sort();
    const result = validateMcpToolSkillRegistry(registered);

    expect(result.ok, formatSkillRegistryMismatchMessage(result)).toBe(true);
    expect(listMcpToolSkillRegistryNames().length).toBe(registered.length);
  });

  it("生成的 Skill 正文包含每个注册工具", () => {
    const content = generateWorkflowSkillContent("0.0.0-test");
    for (const name of listMcpToolSkillRegistryNames()) {
      expect(content).toContain(`\`${name}\``);
    }
    expect(content).toContain("The only project-development workflow");
    expect(content).toContain("SQLite + DevControl");
    expect(content).toContain("Owner");
    expect(content).toContain("Plan");
    expect(content).toContain("real tests");
    expect(content).toContain("not accepted");
    expect(content).not.toContain("先调用 `resume_plan`");
  });

  it("v5 不再把 v4 编排当做研发入口，同时保留原子辅助能力", () => {
    const content = generateWorkflowSkillContent("0.0.0-test");

    expect(content).toContain("v4 file-backed");
    expect(content).toContain("devcontrol");
    expect(content).toContain("code_insight");
    expect(content).toContain("fix_bug");
    expect(content).toContain("history_session_bootstrap");
    expect(content).toContain("MCP_HISTORY_STORAGE=files");
  });

  it("顶层 DevControl schema 明确唯一 SQLite 权威与 Agent 独立职责", () => {
    const byName = new Map(allToolSchemas.map((tool) => [tool.name, tool]));
    expect(byName.get("devcontrol")?.description).toContain("SQLite");
    expect(byName.get("devcontrol")?.description).toContain("approved frozen task contracts");
    expect(byName.get("devcontrol")?.description).toContain("Agent reviews");
    expect(isV5Tool("start_feature")).toBe(false);
  });
});
