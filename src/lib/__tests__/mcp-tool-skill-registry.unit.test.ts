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
    expect(content).toContain("## 参数构造纪律");
    expect(content).toContain("禁止把短确认语原样传给");
    expect(content).toContain("spec_layout=auto");
    expect(content).toContain("不得直接调用 `add_feature`");
    expect(content).toContain("明确单项能力直接调用对应工具");
    expect(content).toContain("只有拿不准首工具时");
    expect(content).toContain("独立能力不是必须被编排");
    expect(content).toContain("托管交付流程在 `converge` 未通过时");
    expect(content).toContain("用户明确进行独立记忆管理时也可直接调用");
    expect(content).not.toContain("复杂任务的第一步");
  });

  it("区分完整交付编排与可直接调用的独立能力", () => {
    const content = generateWorkflowSkillContent("0.0.0-test");

    expect(content).toContain("完整交付编排 `start_*`（按需使用）");
    expect(content).toContain("只做 Bug 根因分析或使用 SRC-8 方法");
    expect(content).toContain("fix_bug；不要求先 start_bugfix");
    expect(content).toContain("code_insight；若后续转为完整交付");
    expect(content).toContain("把 `workflow` 当作所有任务的强制入口");
    expect(content).toContain("把 `start_*` 当作所有原子能力的上级");
  });

  it("关键工具的顶层描述明确复杂功能路由与上下文汇总要求", () => {
    const byName = new Map(allToolSchemas.map((tool) => [tool.name, tool]));
    expect(byName.get("start_feature")?.description).toContain("parent-child");
    expect(byName.get("start_feature")?.description).toContain("当前对话已确认的完整");
    expect(byName.get("workflow")?.description).toContain("完整任务意图");
    expect(byName.get("add_feature")?.description).toContain("不是复杂功能的首个入口");
  });
});
