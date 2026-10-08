import { TOOL_CATALOG } from "./tool-catalog.js";
import { allToolSchemas } from "../schemas/index.js";
import type { ToolsetType } from "./tool-definition.js";
import {
  APP_ONLY_TOOL_NAMES,
  COMPACT_MODEL_TOOL_NAMES,
  HISTORY_SESSION_MODEL_TOOL_NAMES,
  MEMORY_MODEL_TOOL_NAMES,
} from "./tool-visibility.js";

type JsonRecord = Record<string, unknown>;

/** Current MCP revision advertised in tools-manifest (not the handshake pin). */
export const MANIFEST_PROTOCOL_CURRENT = "2026-07-28";
/** Legacy handshake revision still served in dual-era auto/legacy modes. */
export const MANIFEST_PROTOCOL_LEGACY = "2025-11-25";
export const MANIFEST_SUPPORTED_PROTOCOLS = [
  MANIFEST_PROTOCOL_LEGACY,
  MANIFEST_PROTOCOL_CURRENT,
] as const;

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
  "history-session": {
    id: "history-session",
    description: "Lossless session history archive tools",
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
  const historyConditional = [...HISTORY_SESSION_MODEL_TOOL_NAMES];
  const memoryConditional = [...MEMORY_MODEL_TOOL_NAMES];
  const compactWithHistory = [...compact, ...historyConditional];
  const compactWithMemory = [...compact, ...memoryConditional];
  const compactWithHistoryAndMemory = [...compact, ...historyConditional, ...memoryConditional];
  const appOnly = [...APP_ONLY_TOOL_NAMES];
  const core = namesForToolset("core");
  const ui = namesForToolset("ui");
  const workflow = namesForToolset("workflow");
  const memory = namesForGroup("memory");
  const historySession = namesForGroup("history-session");

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
        description: `${compact.length} base model tools (before History/Memory conditionals)`,
        count: compact.length,
        tools: compact,
        note: "Base compact names; History Session is ON by default and adds 5 tools at tools/list time",
      },
      compactWithHistory: {
        description: `${compactWithHistory.length} model tools when History Session is enabled (default)`,
        count: compactWithHistory.length,
        tools: compactWithHistory,
      },
      compactWithMemory: {
        description: `${compactWithMemory.length} model tools when Memory is configured (History off)`,
        count: compactWithMemory.length,
        tools: compactWithMemory,
      },
      compactWithHistoryAndMemory: {
        description: `${compactWithHistoryAndMemory.length} model tools when History (default) and Memory are both enabled`,
        count: compactWithHistoryAndMemory.length,
        tools: compactWithHistoryAndMemory,
      },
      historyConditional: {
        description: `${historyConditional.length} conditionally visible History Session tools (default ON)`,
        count: historyConditional.length,
        tools: historyConditional,
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
      historySession: {
        description: `${historySession.length} history-session tools`,
        count: historySession.length,
        tools: historySession,
      },
      ui: {
        description: `${ui.length} UI/UX tools (recommend using start_ui unified entry)`,
        count: ui.length,
        tools: ui,
      },
      workflow: {
        description: `${workflow.length} workflow tools (includes core + orchestration + interactive + UI + memory + history)`,
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
    protocol: MANIFEST_PROTOCOL_CURRENT,
    supportedProtocols: [...MANIFEST_SUPPORTED_PROTOCOLS],
    totalTools: generated.totalTools,
    toolsets: generated.toolsets,
    categories: generated.categories,
    ...(structuredOutput ? { structuredOutput } : {}),
  };
}
