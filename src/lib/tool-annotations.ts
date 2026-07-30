/**
 * MCP Tool Annotations 兼容适配层。
 *
 * 单一事实源位于 `src/server/tool-catalog.ts`；本文件只为现有调用方保留
 * `TOOL_ANNOTATIONS` 与 `withToolAnnotations` 接口。
 */

import { TOOL_CATALOG } from "../server/tool-catalog.js";
import type { ToolAnnotations } from "../server/tool-definition.js";

export type { ToolAnnotations } from "../server/tool-definition.js";

export const TOOL_ANNOTATIONS: Record<string, ToolAnnotations> = Object.fromEntries(
  TOOL_CATALOG.map((entry) => [entry.name, entry.annotations])
);

/** 把注解合并进工具定义（用于 ListTools 返回前）。 */
export function withToolAnnotations<T extends { name: string }>(
  tool: T
): T & { annotations?: ToolAnnotations } {
  const annotations = TOOL_ANNOTATIONS[tool.name];
  return annotations ? { ...tool, annotations } : tool;
}
