import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { allToolSchemas } from "../../schemas/index.js";
import { isV5Tool } from "../v5-tool-policy.js";
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
  test("v5 拒绝 init_project 旧流程但允许独立生成 Agent 引导", async () => {
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

      await expect(executeRegisteredTool("init_project", args, { bootstrap }))
        .rejects.toThrow("V5_SQLITE_ONLY");
      expect(fs.readFileSync(path.join(root, "AGENTS.md"), "utf8")).toContain("SQLite + DevControl");
      expect(fs.existsSync(path.join(root, ".agents/skills/mcp-probe-kit/SKILL.md"))).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("v5 拒绝旧 init_project_context，但不丢弃现有 AGENTS.md", async () => {
    const parent = path.join(process.cwd(), ".mcp-probe-kit", "test-tmp");
    fs.mkdirSync(parent, { recursive: true });
    const root = fs.mkdtempSync(path.join(parent, "tool-registry-init-context-"));
    try {
      fs.writeFileSync(path.join(root, "AGENTS.md"), "# user rules\n", "utf8");
      const bootstrap = ensureMcpProbeKitBootstrap(root);
      expect(bootstrap.agentsMd.updated).toBe(true);

      await expect(executeRegisteredTool("init_project_context", { project_root: root }, { bootstrap }))
        .rejects.toThrow("V5_SQLITE_ONLY");
      expect(fs.readFileSync(path.join(root, "AGENTS.md"), "utf8")).toContain("# user rules");
      expect(fs.readFileSync(path.join(root, "AGENTS.md"), "utf8")).toContain("SQLite + DevControl");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test("覆盖全部现有工具且名称唯一", () => {
    const definitions = listToolDefinitions();
    const names = definitions.map((definition) => definition.name);

    expect(names).toHaveLength(allToolSchemas.filter(({ name }) => isV5Tool(name)).length);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(allToolSchemas.filter(({ name }) => isV5Tool(name)).map((tool) => tool.name));
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
    expect(listToolDefinitionsForToolset("compact", { memoryEnabled: false, historyEnabled: false })).toHaveLength(10);
    expect(listToolDefinitionsForToolset("compact", { memoryEnabled: false, historyEnabled: true })).toHaveLength(15);
    expect(listToolDefinitionsForToolset("compact", { memoryEnabled: true, historyEnabled: false })).toHaveLength(16);
    expect(listToolDefinitionsForToolset("compact", { memoryEnabled: true, historyEnabled: true })).toHaveLength(21);
    expect(listToolDefinitionsForToolset("core")).toHaveLength(8);
    expect(listToolDefinitionsForToolset("ui")).toHaveLength(3);
    expect(listToolDefinitionsForToolset("workflow")).toHaveLength(23);
    expect(listToolDefinitionsForToolset("full")).toHaveLength(24);
    expect(getToolDefinition("git_work_report")?.toolsets).toEqual([]);
    expect(getToolDefinition("devcontrol")?.annotations?.readOnlyHint).toBe(false);
    expect(getToolDefinition("plan_heartbeat")).toBeUndefined();
    expect(getToolDefinition("resume_plan")).toBeUndefined();
    expect(getToolDefinition("converge")).toBeUndefined();
    expect(getToolDefinition("memorize_asset")?.skillRoute.whenToCall).toContain("converge passed=true");
  });

  test("tools/list 形态保留 Schema 与 Annotation", () => {
    const definition = getToolDefinition("devcontrol");
    expect(definition).toBeDefined();
    const listed = prepareRegisteredToolForList(definition!);

    expect(listed.name).toBe("devcontrol");
    expect(listed.description).toContain("SQLite");
    expect(listed.inputSchema).toBeDefined();
    expect(listed.annotations).toEqual(TOOL_ANNOTATIONS.devcontrol);
  });

  test("Registry tools/list 与 v3 适配链逐工具等价", () => {
    for (const schema of allToolSchemas) {
      const definition = getToolDefinition(schema.name);
      if (!isV5Tool(schema.name)) {
        expect(definition).toBeUndefined();
        continue;
      }
      expect(definition, `missing definition: ${schema.name}`).toBeDefined();
      expect(prepareRegisteredToolForList(definition!)).toEqual(
        prepareToolForToolsList(schema)
      );
    }
  });
  test("compact omits internal entries and app-only tools stay outside the model registry", () => {
    const compactNames = listToolDefinitionsForToolset("compact", {
      memoryEnabled: false,
      historyEnabled: false,
    }).map((definition) => definition.name);
    expect(compactNames).toEqual(
      expect.arrayContaining(["devcontrol", "gencommit", "architecture"])
    );
    expect(compactNames).not.toEqual(
      expect.arrayContaining(["add_feature", "resume_plan", "start_feature", "ask_user"])
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
    const definition = getToolDefinition("devcontrol");
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
    expect(listed._meta?.ui).toMatchObject({
      resourceUri: 'ui://mcp-probe-kit/devcontrol-workbench',
      visibility: ['model', 'app'],
    });
    expect(
      prepareRegisteredToolForList(definition!, {
        clientCapabilities: {},
        uiAppsEnabled: true,
      })._meta?.ui
    ).toBeUndefined();
  });

});
