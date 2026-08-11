import {
  initProject,
  gencommit,
  codeReview,
  codeInsight,
  architecture,
  gentest,
  refactor,
  initProjectContext,
  workflow,
  addFeature,
  checkSpec,
  fixBug,
  estimate,
  startFeature,
  startBugfix,
  startOnboard,
  startRalph,
  interview,
  askUser,
  uiDesignSystem,
  uiSearch,
  syncUiData,
  startUi,
  startProduct,
  gitWorkReport,
  searchMemory,
  readMemoryAsset,
  memorizeAsset,
  deleteMemoryAsset,
  updateMemoryAsset,
  scanAndExtractPatterns,
  planHeartbeat,
  resumePlanTool,
  converge,
} from "../tools/index.js";
import { ToolSchema } from "@modelcontextprotocol/core";
import { listMemoryAssets } from "../tools/list_memory_assets.js";
import type { Tool } from "@modelcontextprotocol/server";
import { allToolSchemas } from "../schemas/index.js";
import { getOutputSchemaForTool, shouldIncludeOutputSchemaInToolsList } from "../lib/output-schema-registry.js";
import { TOOL_CATALOG } from "./tool-catalog.js";
import { resolveToolsetNames, type ToolsetResolutionOptions } from "../lib/toolset-manager.js";
import { buildMcpAppToolMeta } from "../lib/mcp-apps.js";
import { APP_ONLY_TOOL_NAME_SET } from "./tool-visibility.js";
import type {
  RegisteredToolHandler,
  RegisteredToolSchema,
  ToolDefinition,
  ToolsetType,
} from "./tool-definition.js";

const appOnlyHandlers: Record<string, RegisteredToolHandler> = {
  list_memory_assets: async (args) => listMemoryAssets(args),
};

const appOnlySchemas: Record<string, RegisteredToolSchema> = {
  list_memory_assets: {
    name: 'list_memory_assets',
    description:
      'Memory Center 专用浏览动作。按更新时间列出记忆摘要，支持类型、状态、项目、标签和分页过滤；仅供 MCP App 调用。',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: '每页数量，默认 50，最大 200' },
        offset: { type: 'number', description: '分页偏移量，默认 0' },
        type: { type: 'string', description: '按记忆类型过滤' },
        status: {
          type: 'string',
          enum: ['active', 'stale', 'expired', 'superseded', 'retracted'],
          description: '按记忆状态过滤',
        },
        source_project: { type: 'string', description: '按来源项目过滤' },
        tags: { type: 'array', items: { type: 'string' }, description: '必须同时包含的标签' },
        include_inactive: { type: 'boolean', description: '是否包含非 active 记忆，默认 true' },
      },
      additionalProperties: true,
    },
  },
};

const handlers: Record<string, RegisteredToolHandler> = {
  init_project: async (args, context) => initProject(args as never, context),
  gencommit: async (args) => gencommit(args as never),
  code_review: async (args) => codeReview(args as never),
  code_insight: async (args, context) => codeInsight(args as never, context),
  architecture: async (args, context) => architecture(args as never, context),
  gentest: async (args) => gentest(args as never),
  refactor: async (args) => refactor(args as never),
  init_project_context: async (args, context) => initProjectContext(args as never, context),
  workflow: async (args, context) => workflow(args as never, context),
  add_feature: async (args) => addFeature(args as never),
  check_spec: async (args) => checkSpec(args as never),
  fix_bug: async (args) => fixBug(args as never),
  estimate: async (args) => estimate(args as never),
  start_feature: async (args, context) => startFeature(args as never, context),
  start_bugfix: async (args, context) => startBugfix(args as never, context),
  start_onboard: async (args, context) => startOnboard(args as never, context),
  start_ralph: async (args, context) => startRalph(args as never, context),
  interview: async (args) => interview(args as never),
  ask_user: async (args) => askUser(args as never),
  ui_design_system: async (args) => uiDesignSystem(args as never),
  ui_search: async (args) => uiSearch(args as never),
  sync_ui_data: async (args, context) => syncUiData(args as never, context),
  start_ui: async (args, context) => startUi(args as never, context),
  start_product: async (args, context) => startProduct((args ?? {}) as never, context),
  git_work_report: async (args) => gitWorkReport(args as never),
  search_memory: async (args) => searchMemory(args as never),
  read_memory_asset: async (args) => readMemoryAsset(args as never),
  memorize_asset: async (args) => memorizeAsset(args as never),
  delete_memory_asset: async (args) => deleteMemoryAsset(args as never),
  update_memory_asset: async (args) => updateMemoryAsset(args as never),
  scan_and_extract_patterns: async (args) => scanAndExtractPatterns(args as never),
  plan_heartbeat: async (args) => planHeartbeat(args),
  resume_plan: async (args) => resumePlanTool(args),
  converge: async (args) => converge(args),
};

function buildRegistry(): ToolDefinition[] {
  const seen = new Set<string>();
  const catalogByName = new Map(TOOL_CATALOG.map((entry) => [entry.name, entry]));

  const definitions = allToolSchemas.map((rawSchema) => {
    const schema = rawSchema as RegisteredToolSchema;
    if (seen.has(schema.name)) {
      throw new Error(`Tool Schema 存在重复工具: ${schema.name}`);
    }
    seen.add(schema.name);

    const catalogEntry = catalogByName.get(schema.name);
    if (!catalogEntry) {
      throw new Error(`Tool Registry 缺少 Catalog: ${schema.name}`);
    }

    const handler = handlers[schema.name];
    if (!handler) {
      throw new Error(`Tool Registry 缺少 Handler: ${schema.name}`);
    }

    return {
      name: schema.name,
      schema,
      handler,
      annotations: catalogEntry.annotations,
      outputSchema: getOutputSchemaForTool(catalogEntry.name),
      toolsets: [...catalogEntry.toolsets],
      taskPolicy: catalogEntry.taskPolicy,
      protocolPolicy: catalogEntry.protocolPolicy,
      skillRoute: catalogEntry.skillRoute,
    } satisfies ToolDefinition;
  });

  const schemaNames = new Set(definitions.map((definition) => definition.name));
  const catalogOnlyNames = [...catalogByName.keys()].filter((name) => !schemaNames.has(name));
  if (catalogOnlyNames.length > 0) {
    throw new Error(`Tool Registry 存在无 Schema 的 Catalog: ${catalogOnlyNames.join(", ")}`);
  }

  const handlerOnlyNames = Object.keys(handlers).filter((name) => !schemaNames.has(name));
  if (handlerOnlyNames.length > 0) {
    throw new Error(`Tool Registry 存在无 Schema 的 Handler: ${handlerOnlyNames.join(", ")}`);
  }

  return definitions;
}

const TOOL_DEFINITIONS = buildRegistry();
const TOOL_DEFINITION_BY_NAME = new Map(
  TOOL_DEFINITIONS.map((definition) => [definition.name, definition])
);

export function listToolDefinitions(): readonly ToolDefinition[] {
  return TOOL_DEFINITIONS;
}

export function getToolDefinition(name: string): ToolDefinition | undefined {
  return TOOL_DEFINITION_BY_NAME.get(name);
}

export function requireToolDefinition(name: string): ToolDefinition {
  const definition = getToolDefinition(name);
  if (!definition) {
    throw new Error(`未知工具: ${name}`);
  }
  return definition;
}

export function listToolDefinitionsForToolset(
  toolset: ToolsetType,
  options: ToolsetResolutionOptions = {},
): readonly ToolDefinition[] {
  const names = resolveToolsetNames(toolset, options);
  if (names === "all") return TOOL_DEFINITIONS;
  const allowed = new Set(names);
  return TOOL_DEFINITIONS.filter((definition) => allowed.has(definition.name));
}

export interface PrepareRegisteredToolOptions {
  clientCapabilities?: unknown;
  uiAppsEnabled?: boolean;
}

export function prepareRegisteredToolForList(
  definition: ToolDefinition,
  options: PrepareRegisteredToolOptions = {},
): Tool {
  const appMeta = buildMcpAppToolMeta(
    definition.name,
    options.clientCapabilities,
    options.uiAppsEnabled === true,
  );
  const tool: RegisteredToolSchema & {
    annotations?: ToolDefinition["annotations"];
    outputSchema?: ToolDefinition["outputSchema"];
    _meta?: Record<string, unknown>;
  } = {
    ...definition.schema,
    ...(definition.annotations ? { annotations: definition.annotations } : {}),
    ...(appMeta ? { _meta: appMeta } : {}),
  };

  if (shouldIncludeOutputSchemaInToolsList() && definition.outputSchema) {
    tool.outputSchema = definition.outputSchema;
  }

  const parsed = ToolSchema.safeParse(tool);
  if (!parsed.success) {
    throw new Error(
      `工具 ${definition.name} 不符合 MCP v2 Tool Schema: ${parsed.error.message}`
    );
  }
  return parsed.data;
}

export function prepareAppOnlyToolsForList(
  options: PrepareRegisteredToolOptions = {},
): Tool[] {
  return Object.entries(appOnlySchemas).flatMap(([name, schema]) => {
    const appMeta = buildMcpAppToolMeta(
      name,
      options.clientCapabilities,
      options.uiAppsEnabled === true,
      ['app'],
    );
    if (!appMeta) return [];
    const parsed = ToolSchema.safeParse({ ...schema, _meta: appMeta });
    if (!parsed.success) {
      throw new Error(
        `App-only 工具 ${name} 不符合 MCP v2 Tool Schema: ${parsed.error.message}`,
      );
    }
    return [parsed.data];
  });
}

export function listAppOnlyToolNames(): readonly string[] {
  return Object.keys(appOnlyHandlers);
}

export function isAppOnlyTool(name: string): boolean {
  return APP_ONLY_TOOL_NAME_SET.has(name) && Boolean(appOnlyHandlers[name]);
}

export async function executeRegisteredTool(
  name: string,
  args: unknown,
  context?: Parameters<RegisteredToolHandler>[1]
) {
  const appOnlyHandler = appOnlyHandlers[name];
  if (appOnlyHandler) return appOnlyHandler(args, context);
  return requireToolDefinition(name).handler(args, context);
}
