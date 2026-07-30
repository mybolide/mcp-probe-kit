import type { McpProbeKitBootstrapResult } from "../lib/workflow-skill-installer.js";
import type { ToolResult } from "./runtime-types.js";
import { GraphSnapshotStore } from "../resources/graph-snapshot-store.js";
import { UiAppResourceStore } from "../resources/ui-app-resource-store.js";

export class ResultDecorator {
  constructor(
    readonly traceMetaKey: string,
    readonly graphStore: GraphSnapshotStore,
    readonly uiStore: UiAppResourceStore
  ) {}

  getTraceMeta(meta: unknown): unknown {
    if (!meta || typeof meta !== "object") return undefined;
    const record = meta as Record<string, unknown>;
    return this.traceMetaKey in record ? record[this.traceMetaKey] : record.trace;
  }

  withTraceMeta(result: ToolResult, traceMeta: unknown): ToolResult {
    if (traceMeta === undefined) return result;
    return {
      ...result,
      _meta: {
        ...(result._meta ?? {}),
        [this.traceMetaKey]: traceMeta,
      },
    };
  }

  decorate(
    toolName: string,
    args: unknown,
    raw: ToolResult,
    traceMeta: unknown,
    bootstrap: McpProbeKitBootstrapResult | null
  ): ToolResult {
    let result = this.withTraceMeta(raw, traceMeta);
    result = withBootstrapMeta(result, bootstrap);
    result = this.graphStore.decorate(toolName, result);
    result = this.uiStore.decorate(toolName, args, result);
    return result;
  }
}

function withBootstrapMeta(
  result: ToolResult,
  bootstrap: McpProbeKitBootstrapResult | null
): ToolResult {
  if (!bootstrap) return result;
  const base =
    result.structuredContent &&
    typeof result.structuredContent === "object" &&
    !Array.isArray(result.structuredContent)
      ? (result.structuredContent as Record<string, unknown>)
      : {};

  return {
    ...result,
    structuredContent: {
      ...base,
      mcp_probe_bootstrap: {
        projectRoot: bootstrap.projectRoot,
        skill: bootstrap.skill,
        agentsMd: bootstrap.agentsMd,
        harness: bootstrap.harness ?? null,
        workspaceWarning: bootstrap.workspaceWarning ?? null,
      },
    },
  };
}
