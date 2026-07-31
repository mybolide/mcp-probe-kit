import { TOOL_CATALOG } from "./tool-catalog.js";
import { allToolSchemas } from "../schemas/index.js";
import type { ToolsetType } from "./tool-definition.js";
import {
  APP_ONLY_TOOL_NAMES,
  COMPACT_MODEL_TOOL_NAMES,
  MEMORY_MODEL_TOOL_NAMES,
} from "./tool-visibility.js";

type JsonRecord = Record<string, unknown>;

const CATEGORY_ALIASES: Record<string, { id: string; description: string }> = {
  orchestration: {
    id: "orchestration",
    description: "Intelligent orchestration tools",
  },
  routing: {
    id: "routing",
    description: "Agent intent routing tools",
  },
  "project-spec": {
    id: "project-management",
    description: "Project management and specification tools",
  },
  "code-analysis": {
    id: "code-analysis",
    description: "Code analysis tools",
  },
  git: {
    id: "git",
    description: "Git tools",
  },
  ui: {
    id: "ui-ux",
    description: "UI/UX tools (excluding orchestration tools)",
  },
  memory: {
    id: "memory-cursor-history",
    description: "Memory tools",
  },
  interactive: {
    id: "interactive",
    description: "Interactive tools",
  },
};

function namesForToolset(toolset: Exclude<ToolsetType, "full">): string[] {
  const catalogByName = new Map(TOOL_CATALOG.map((entry) => [entry.name, entry]));
  return allToolSchemas
    .map((schema) => schema.name)
    .filter((name) => catalogByName.get(name)?.toolsets.includes(toolset));
}

function namesForGroup(groupId: string): string[] {
  const catalogByName = new Map(TOOL_CATALOG.map((entry) => [entry.name, entry]));
  return allToolSchemas
    .map((schema) => schema.name)
    .filter((name) => catalogByName.get(name)?.skillRoute.groupId === groupId);
}

export function buildToolManifestSections() {
  const compact = [...COMPACT_MODEL_TOOL_NAMES];
  const memoryConditional = [...MEMORY_MODEL_TOOL_NAMES];
  const compactWithMemory = [...compact, ...memoryConditional];
  const appOnly = [...APP_ONLY_TOOL_NAMES];
  const core = namesForToolset("core");
  const ui = namesForToolset("ui");
  const workflow = namesForToolset("workflow");
  const memory = namesForGroup("memory");

  const categories: Record<string, JsonRecord> = {};
  const seenGroups = new Set<string>();
  for (const entry of TOOL_CATALOG) {
    const groupId = entry.skillRoute.groupId;
    if (seenGroups.has(groupId)) continue;
    seenGroups.add(groupId);

    const alias = CATEGORY_ALIASES[groupId] ?? {
      id: groupId,
      description: entry.skillRoute.groupTitle,
    };
    const tools = namesForGroup(groupId);
    categories[alias.id] = {
      description: `${alias.description} (${tools.length})`,
      tools,
    };
  }

  return {
    totalTools: TOOL_CATALOG.length,
    toolsets: {
      compact: {
        description: `${compact.length} default model tools`,
        count: compact.length,
        tools: compact,
        note: "Default model-visible surface",
      },
      compactWithMemory: {
        description: `${compactWithMemory.length} model tools when Memory is configured`,
        count: compactWithMemory.length,
        tools: compactWithMemory,
      },
      memoryConditional: {
        description: `${memoryConditional.length} conditionally visible Memory tools`,
        count: memoryConditional.length,
        tools: memoryConditional,
      },
      appOnly: {
        description: `${appOnly.length} MCP Apps-only tools hidden from the model`,
        count: appOnly.length,
        tools: appOnly,
      },
      core: {
        description: `${core.length} core tools (daily high-frequency)`,
        count: core.length,
        tools: core,
      },
      memory: {
        description: `${memory.length} memory tools`,
        count: memory.length,
        tools: memory,
      },
      ui: {
        description: `${ui.length} UI/UX tools (recommend using start_ui unified entry)`,
        count: ui.length,
        tools: ui,
      },
      workflow: {
        description: `${workflow.length} workflow tools (includes core + orchestration + interactive + UI + memory)`,
        count: workflow.length,
        tools: workflow,
      },
      full: {
        description: `All ${TOOL_CATALOG.length} tools`,
        count: TOOL_CATALOG.length,
        note: "Compatibility/debugging surface selected with MCP_TOOLSET=full",
      },
    },
    categories,
  };
}

export function mergeToolManifest(existing: JsonRecord, version: string): JsonRecord {
  const generated = buildToolManifestSections();
  const structuredOutput =
    existing.structuredOutput && typeof existing.structuredOutput === "object"
      ? { ...(existing.structuredOutput as JsonRecord), version }
      : undefined;

  return {
    ...existing,
    version,
    totalTools: generated.totalTools,
    toolsets: generated.toolsets,
    categories: generated.categories,
    ...(structuredOutput ? { structuredOutput } : {}),
  };
}
