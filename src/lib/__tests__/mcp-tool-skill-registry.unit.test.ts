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
    expect(content).toContain("`converge` 未通过就把候选经验正式写入 `memorize_asset`");
    expect(content).toContain("已有已验证 MemoryCandidate，且 **converge passed=true** 后正式沉淀");
  });

  it("关键工具的顶层描述明确复杂功能路由与上下文汇总要求", () => {
    const byName = new Map(allToolSchemas.map((tool) => [tool.name, tool]));
    expect(byName.get("start_feature")?.description).toContain("parent-child");
    expect(byName.get("start_feature")?.description).toContain("当前对话已确认的完整");
    expect(byName.get("workflow")?.description).toContain("完整任务意图");
    expect(byName.get("add_feature")?.description).toContain("不是复杂功能的首个入口");
  });
});
