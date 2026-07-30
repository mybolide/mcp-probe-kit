import {
  initProject,
  gencommit,
  codeReview,
  codeInsight,
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
} from "../tools/index.js";
import { allToolSchemas } from "../schemas/index.js";
import { getOutputSchemaForTool, shouldIncludeOutputSchemaInToolsList } from "../lib/output-schema-registry.js";
import { TOOL_CATALOG } from "./tool-catalog.js";
import type {
  RegisteredToolHandler,
  RegisteredToolSchema,
  ToolDefinition,
  ToolsetType,
} from "./tool-definition.js";

const handlers: Record<string, RegisteredToolHandler> = {
  init_project: async (args) => initProject(args as never),
  gencommit: async (args) => gencommit(args as never),
  code_review: async (args) => codeReview(args as never),
  code_insight: async (args, context) => codeInsight(args as never, context),
  gentest: async (args) => gentest(args as never),
  refactor: async (args) => refactor(args as never),
  init_project_context: async (args) => initProjectContext(args as never),
  workflow: async (args) => workflow(args as never),
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

export function listToolDefinitionsForToolset(toolset: ToolsetType): readonly ToolDefinition[] {
  if (toolset === "full") {
    return TOOL_DEFINITIONS;
  }
  return TOOL_DEFINITIONS.filter((definition) => definition.toolsets.includes(toolset));
}

export function prepareRegisteredToolForList(definition: ToolDefinition): RegisteredToolSchema {
  const tool: RegisteredToolSchema & {
    annotations?: ToolDefinition["annotations"];
    outputSchema?: ToolDefinition["outputSchema"];
  } = {
    ...definition.schema,
    ...(definition.annotations ? { annotations: definition.annotations } : {}),
  };

  if (shouldIncludeOutputSchemaInToolsList() && definition.outputSchema) {
    tool.outputSchema = definition.outputSchema;
  }

  return tool;
}

export async function executeRegisteredTool(
  name: string,
  args: unknown,
  context?: Parameters<RegisteredToolHandler>[1]
) {
  return requireToolDefinition(name).handler(args, context);
}
