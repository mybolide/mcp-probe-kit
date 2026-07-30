import { describe, expect, test } from "vitest";
import { allToolSchemas } from "../../schemas/index.js";
import { TOOL_ANNOTATIONS } from "../../lib/tool-annotations.js";
import { prepareToolForToolsList } from "../../lib/output-schema-registry.js";
import { MCP_TOOL_SKILL_GROUPS } from "../../lib/mcp-tool-skill-registry.js";
import {
  getToolDefinition,
  listToolDefinitions,
  listToolDefinitionsForToolset,
  prepareRegisteredToolForList,
} from "../tool-registry.js";

describe("Tool Registry", () => {
  test("覆盖全部现有工具且名称唯一", () => {
    const definitions = listToolDefinitions();
    const names = definitions.map((definition) => definition.name);

    expect(names).toHaveLength(allToolSchemas.length);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(allToolSchemas.map((tool) => tool.name));
  });

  test("每个工具都具备 Handler、Annotation、Skill 路由与双协议策略", () => {
    const skillNames = new Set(
      MCP_TOOL_SKILL_GROUPS.flatMap((group) => group.tools.map((tool) => tool.name))
    );

    for (const definition of listToolDefinitions()) {
      expect(typeof definition.handler).toBe("function");
      expect(definition.annotations).toEqual(TOOL_ANNOTATIONS[definition.name]);
      expect(skillNames.has(definition.name)).toBe(true);
      expect(definition.skillRoute.whenToCall.length).toBeGreaterThan(0);
      expect(definition.protocolPolicy).toEqual({ legacy: true, modern: true });
      expect(definition.taskPolicy.synchronousFallback).toBe(true);
    }
  });

  test("工具集过滤保持既有数量与成员关系", () => {
    expect(listToolDefinitionsForToolset("core")).toHaveLength(12);
    expect(listToolDefinitionsForToolset("ui")).toHaveLength(4);
    expect(listToolDefinitionsForToolset("workflow")).toHaveLength(32);
    expect(listToolDefinitionsForToolset("full")).toHaveLength(allToolSchemas.length);
    expect(getToolDefinition("git_work_report")?.toolsets).toEqual([]);
    expect(getToolDefinition("plan_heartbeat")?.annotations?.readOnlyHint).toBe(false);
    expect(getToolDefinition("resume_plan")?.annotations?.readOnlyHint).toBe(true);
    expect(getToolDefinition("converge")?.annotations?.readOnlyHint).toBe(false);
    expect(getToolDefinition("memorize_asset")?.skillRoute.whenToCall).toContain("converge passed=true");
  });

  test("tools/list 形态保留 Schema 与 Annotation", () => {
    const definition = getToolDefinition("start_feature");
    expect(definition).toBeDefined();
    const listed = prepareRegisteredToolForList(definition!);

    expect(listed.name).toBe("start_feature");
    expect(listed.description).toContain("parent-child");
    expect(listed.inputSchema).toBeDefined();
    expect(listed.annotations).toEqual(TOOL_ANNOTATIONS.start_feature);
  });

  test("Registry tools/list 与 v3 适配链逐工具等价", () => {
    for (const schema of allToolSchemas) {
      const definition = getToolDefinition(schema.name);
      expect(definition, `missing definition: ${schema.name}`).toBeDefined();
      expect(prepareRegisteredToolForList(definition!)).toEqual(
        prepareToolForToolsList(schema)
      );
    }
  });
});
