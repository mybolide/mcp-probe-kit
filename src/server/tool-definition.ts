import type { ToolExecutionContext } from "../lib/tool-execution-context.js";

export type ToolsetType = "core" | "ui" | "workflow" | "full";

export interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export type JsonSchema = Record<string, unknown>;

export interface RegisteredToolSchema {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  [key: string]: unknown;
}

export interface RegisteredToolResult {
  content?: unknown;
  isError?: boolean;
  structuredContent?: unknown;
  _meta?: Record<string, unknown>;
}

export type RegisteredToolHandler = (
  args: unknown,
  context?: ToolExecutionContext
) => Promise<RegisteredToolResult>;

export interface ToolTaskPolicy {
  /** 客户端显式请求 Task 时是否允许。当前 Legacy runtime 对所有工具开放。 */
  explicitRequest: boolean;
  /** 是否允许根据环境变量自动提升为异步 Task。 */
  autoEscalate: boolean;
  /** 不支持 Task 的客户端是否必须保留同步执行兜底。 */
  synchronousFallback: boolean;
}

export interface ToolProtocolPolicy {
  legacy: boolean;
  modern: boolean;
}

export interface ToolSkillRoute {
  groupId: string;
  groupTitle: string;
  whenToCall: string;
}

export interface ToolDefinition {
  name: string;
  schema: RegisteredToolSchema;
  handler: RegisteredToolHandler;
  annotations?: ToolAnnotations;
  outputSchema?: JsonSchema;
  toolsets: Exclude<ToolsetType, "full">[];
  taskPolicy: ToolTaskPolicy;
  protocolPolicy: ToolProtocolPolicy;
  skillRoute: ToolSkillRoute;
}
