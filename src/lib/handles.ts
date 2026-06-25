/**
 * 统一 Handle 约定：供 Agent 从 structuredContent 直接取 ID/URI，无需从长文本解析。
 */

export type MemoryAssetHandleTool =
  | 'read_memory_asset'
  | 'update_memory_asset'
  | 'delete_memory_asset';

export interface MemoryAssetHandle {
  id: string;
  tool: MemoryAssetHandleTool;
  name?: string;
  type?: string;
  summary?: string;
}

export interface ToolHandles {
  memory_assets?: MemoryAssetHandle[];
  graph_snapshot?: string | null;
  graph_resource?: string | null;
}

export interface MemoryHandleInput {
  id: string;
  name?: string;
  type?: string;
  summary?: string;
}

export function buildMemoryAssetHandles(
  items: MemoryHandleInput[],
  tool: MemoryAssetHandleTool = 'read_memory_asset'
): MemoryAssetHandle[] {
  return items
    .filter((item) => typeof item.id === 'string' && item.id.trim().length > 0)
    .map((item) => ({
      id: item.id.trim(),
      tool,
      ...(item.name ? { name: item.name } : {}),
      ...(item.type ? { type: item.type } : {}),
      ...(item.summary ? { summary: item.summary } : {}),
    }));
}

export function mergeHandles(base: ToolHandles = {}, patch: Partial<ToolHandles> = {}): ToolHandles {
  return {
    ...base,
    ...patch,
    memory_assets: patch.memory_assets ?? base.memory_assets,
    graph_snapshot: patch.graph_snapshot !== undefined ? patch.graph_snapshot : base.graph_snapshot,
    graph_resource: patch.graph_resource !== undefined ? patch.graph_resource : base.graph_resource,
  };
}

export function attachHandles<T extends Record<string, unknown>>(
  structured: T,
  handles: ToolHandles
): T & { handles: ToolHandles };

export function attachHandles<T extends object>(
  structured: T,
  handles: ToolHandles
): T & { handles: ToolHandles };

export function attachHandles(structured: object, handles: ToolHandles): object & { handles: ToolHandles } {
  const record =
    structured && typeof structured === 'object' && !Array.isArray(structured)
      ? (structured as Record<string, unknown>)
      : {};

  const existing =
    record.handles && typeof record.handles === 'object' && !Array.isArray(record.handles)
      ? (record.handles as ToolHandles)
      : {};

  return {
    ...record,
    handles: mergeHandles(existing, handles),
  } as object & { handles: ToolHandles };
}

export const DEFAULT_GRAPH_RESOURCE_URI = 'probe://graph/latest';
