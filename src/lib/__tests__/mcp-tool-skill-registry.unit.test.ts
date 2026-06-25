import { describe, expect, it } from "vitest";
import { allToolSchemas } from "../../schemas/index.js";
import {
  formatSkillRegistryMismatchMessage,
  listMcpToolSkillRegistryNames,
  validateMcpToolSkillRegistry,
} from "../mcp-tool-skill-registry.js";
import { generateWorkflowSkillContent } from "../workflow-skill-template.js";

describe("mcp-tool-skill-registry", () => {
  it("与 allToolSchemas 工具名一一对应", () => {
    const registered = allToolSchemas.map((tool) => tool.name).sort();
    const result = validateMcpToolSkillRegistry(registered);

    expect(result.ok, formatSkillRegistryMismatchMessage(result)).toBe(true);
    expect(listMcpToolSkillRegistryNames().length).toBe(registered.length);
  });

  it("生成的 Skill 正文包含每个注册工具", () => {
    const content = generateWorkflowSkillContent("0.0.0-test");
    for (const name of listMcpToolSkillRegistryNames()) {
      expect(content).toContain(`\`${name}\``);
    }
  });
});
