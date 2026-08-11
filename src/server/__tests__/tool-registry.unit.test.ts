import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { allToolSchemas } from "../../schemas/index.js";
import { TOOL_ANNOTATIONS } from "../../lib/tool-annotations.js";
import { prepareToolForToolsList } from "../../lib/output-schema-registry.js";
import { MCP_TOOL_SKILL_GROUPS } from "../../lib/mcp-tool-skill-registry.js";
import {
  getToolDefinition,
  listAppOnlyToolNames,
  listToolDefinitions,
  listToolDefinitionsForToolset,
  prepareAppOnlyToolsForList,
  prepareRegisteredToolForList,
  executeRegisteredTool,
} from "../tool-registry.js";
import { ensureMcpProbeKitBootstrap } from "../../lib/workflow-skill-installer.js";

describe("Tool Registry", () => {
  test("init_project 保留预调用 bootstrap 的真实首次写入状态", async () => {
    const parent = path.join(process.cwd(), ".mcp-probe-kit", "test-tmp");
    fs.mkdirSync(parent, { recursive: true });
    const root = fs.mkdtempSync(path.join(parent, "tool-registry-init-project-"));
    try {
      const args = {
        input: "Create a minimal task CLI",
        project_name: "registry-fixture",
        project_root: root,
      };
      const bootstrap = ensureMcpProbeKitBootstrap(root);
      expect(bootstrap.skill.created).toBe(true);
      expect(bootstrap.agentsMd.created).toBe(true);

      const result = await executeRegisteredTool("init_project", args, { bootstrap });
      const structured = (result as any).structuredContent;
      const text = ((result as any).content ?? [])
        .map((item: any) => item?.text ?? "")
        .join("\n");

      expect(structured.bootstrap.skillCreated).toBe(true);
      expect(structured.bootstrap.agentsCreated).toBe(true);
      expect(structured.writtenFiles).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ".agents/skills/mcp-probe-kit/SKILL.md", action: "created" }),
          expect.objectContaining({ path: "AGENTS.md", action: "created" }),
        ])
      );
      expect(text).toContain("本次已创建");
      expect(text).not.toContain("本次无需写入或更新");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("init_project_context 保留预调用 bootstrap 对 AGENTS.md 的真实更新状态", async () => {
    const parent = path.join(process.cwd(), ".mcp-probe-kit", "test-tmp");
    fs.mkdirSync(parent, { recursive: true });
    const root = fs.mkdtempSync(path.join(parent, "tool-registry-init-context-"));
    try {
      fs.writeFileSync(path.join(root, "AGENTS.md"), "# user rules\n", "utf8");
      const bootstrap = ensureMcpProbeKitBootstrap(root);
      expect(bootstrap.agentsMd.updated).toBe(true);

      const result = await executeRegisteredTool(
        "init_project_context",
        { project_root: root },
        { bootstrap },
      );
      const structured = (result as any).structuredContent;
      const agentsDelivery = structured.writtenFiles.find((file: any) => file.path === "AGENTS.md");
      const text = ((result as any).content ?? [])
        .map((item: any) => item?.text ?? "")
        .join("\n");

      expect(agentsDelivery?.action).toBe("updated");
      expect(text).toContain("本次已更新");
      expect(text).not.toContain("AGENTS.md — 已跳过（已存在）");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

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
    expect(listToolDefinitionsForToolset("compact", { memoryEnabled: false })).toHaveLength(24);
    expect(listToolDefinitionsForToolset("compact", { memoryEnabled: true })).toHaveLength(30);
    expect(listToolDefinitionsForToolset("core")).toHaveLength(13);
    expect(listToolDefinitionsForToolset("ui")).toHaveLength(4);
    expect(listToolDefinitionsForToolset("workflow")).toHaveLength(33);
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
  test("compact omits internal entries and app-only tools stay outside the model registry", () => {
    const compactNames = listToolDefinitionsForToolset("compact", {
      memoryEnabled: false,
    }).map((definition) => definition.name);
    expect(compactNames).toEqual(
      expect.arrayContaining(["start_product", "gencommit", "converge", "architecture"])
    );
    expect(compactNames).not.toEqual(
      expect.arrayContaining(["add_feature", "fix_bug", "sync_ui_data", "ask_user"])
    );
    expect(listAppOnlyToolNames()).toEqual(["list_memory_assets"]);
    expect(listToolDefinitions().some((definition) => definition.name === "list_memory_assets")).toBe(false);
    const appTools = prepareAppOnlyToolsForList({
      clientCapabilities: {
        extensions: {
          "io.modelcontextprotocol/ui": {
            mimeTypes: ["text/html;profile=mcp-app"],
          },
        },
      },
      uiAppsEnabled: true,
    });
    expect(appTools).toHaveLength(1);
    expect(appTools[0]).toMatchObject({
      name: "list_memory_assets",
      _meta: {
        ui: {
          resourceUri: "ui://mcp-probe-kit/memory-center",
          visibility: ["app"],
        },
      },
    });
  });

  test("tools/list attaches official UI metadata only for negotiated app clients", () => {
    const definition = getToolDefinition("start_feature");
    expect(definition).toBeDefined();
    const capabilities = {
      extensions: {
        "io.modelcontextprotocol/ui": {
          mimeTypes: ["text/html;profile=mcp-app"],
        },
      },
    };
    const listed = prepareRegisteredToolForList(definition!, {
      clientCapabilities: capabilities,
      uiAppsEnabled: true,
    });
    expect(listed._meta).toMatchObject({
      ui: {
        resourceUri: "ui://mcp-probe-kit/feature-workbench",
        visibility: ["model", "app"],
      },
    });
    expect(
      prepareRegisteredToolForList(definition!, {
        clientCapabilities: {},
        uiAppsEnabled: true,
      })._meta?.ui
    ).toBeUndefined();
  });

});
