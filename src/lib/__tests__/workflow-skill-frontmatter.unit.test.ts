import { describe, expect, test } from "vitest";
import {
  formatSkillFrontmatter,
  generateWorkflowSkillContent,
  MCP_PROBE_SKILL_NAME,
} from "../workflow-skill-template.js";
import {
  formatSkillVersionMarker,
  parseSkillInstalledVersion,
  skillFrontmatterNeedsUpgrade,
  skillContentNeedsUpgrade,
} from "../workflow-skill-version.js";

describe("workflow-skill frontmatter", () => {
  test("生成的 Skill 以 YAML frontmatter 开头", () => {
    const content = generateWorkflowSkillContent("3.6.6");
    expect(content.startsWith("---\n")).toBe(true);
    expect(content).toContain(`name: ${MCP_PROBE_SKILL_NAME}`);
    expect(content).toContain("description: >-");
    expect(content).toContain('mcp-probe-kit-version: "3.6.6"');
    expect(content).toContain("# MCP 调用时机");
    expect(content).not.toContain(formatSkillVersionMarker("3.6.6"));
  });

  test("从 frontmatter 解析版本", () => {
    const header = formatSkillFrontmatter("3.6.5");
    expect(parseSkillInstalledVersion(`${header}\n\n# body`)).toBe("3.6.5");
  });

  test("旧 HTML 注释版本仍可解析", () => {
    const legacy = `${formatSkillVersionMarker("3.6.3")}\n# old\n`;
    expect(parseSkillInstalledVersion(legacy)).toBe("3.6.3");
  });

  test("缺 frontmatter 时触发升级", () => {
    const legacy = `${formatSkillVersionMarker("9.9.9")}\n# body\n`;
    expect(skillFrontmatterNeedsUpgrade(legacy)).toBe(true);
    expect(skillContentNeedsUpgrade(legacy, "3.6.6")).toBe(true);
  });

  test("同版本标准 frontmatter 不升级", () => {
    const content = generateWorkflowSkillContent("3.6.6");
    expect(skillContentNeedsUpgrade(content, "3.6.6")).toBe(false);
  });
});
