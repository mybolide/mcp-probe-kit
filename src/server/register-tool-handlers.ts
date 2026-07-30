import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ProgressNotificationSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { getToolsetFromEnv } from "../lib/toolset-manager.js";
import { shouldAutoEscalateToTask } from "../lib/task-defaults.js";
import {
  ensureMcpProbeKitBootstrapForToolCall,
  type McpProbeKitBootstrapResult,
} from "../lib/workflow-skill-installer.js";
import type { ToolExecutionContext } from "../lib/tool-execution-context.js";
import {
  LegacyTaskAdapter,
  type LegacyProtocolTask,
  type LegacyProtocolTaskStore,
} from "../tasks/legacy-task-adapter.js";
import { SyncTaskAdapter } from "../tasks/sync-task-adapter.js";
import type { InternalTaskRuntime } from "../tasks/task-runtime.js";
import {
  executeRegisteredTool,
  listToolDefinitions,
  listToolDefinitionsForToolset,
  prepareRegisteredToolForList,
} from "./tool-registry.js";
import { ResultDecorator } from "./result-decorator.js";
import type { ToolResult } from "./runtime-types.js";

export interface ToolHandlerOptions {
  progressNotificationsEnabled: boolean;
  taskRuntime: InternalTaskRuntime;
}

export function registerToolHandlers(
  server: Server,
  decorator: ResultDecorator,
  options: ToolHandlerOptions
): void {
  const legacyTaskAdapter = new LegacyTaskAdapter(options.taskRuntime);
  const syncTaskAdapter = new SyncTaskAdapter(options.taskRuntime);

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const toolset = getToolsetFromEnv();
    const definitions = listToolDefinitionsForToolset(toolset);
    const tools = definitions.map(prepareRegisteredToolForList);
    const payloadBytes = Buffer.byteLength(JSON.stringify({ tools }), "utf8");
    console.error(
      `[MCP Probe Kit] 当前工具集: ${toolset} (${tools.length}/${listToolDefinitions().length} 个工具) | tools/list ≈ ${(payloadBytes / 1024).toFixed(1)} KB`
    );
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const { name, arguments: args } = request.params;
    let taskRequest = request.params.task;
    const traceMeta = decorator.getTraceMeta(extra._meta);

    if (shouldAutoEscalateToTask(name, Boolean(taskRequest))) {
      taskRequest = taskRequest ?? {};
    }

    const emitProgress = async (progress: number, message: string) => {
      if (!options.progressNotificationsEnabled) return;
      const progressToken = extra._meta?.progressToken;
      if (progressToken === undefined) return;

      try {
        await extra.sendNotification(
          ProgressNotificationSchema.parse({
            method: "notifications/progress",
            params: {
              progressToken,
              progress,
              total: 100,
              message,
              ...(traceMeta === undefined
                ? {}
                : { _meta: { [decorator.traceMetaKey]: traceMeta } }),
            },
          })
        );
      } catch (error) {
        const messageText = error instanceof Error ? error.message : String(error);
        console.error(`[MCP Probe Kit] progress notification failed: ${messageText}`);
      }
    };

    if (taskRequest) {
      if (!extra.taskStore) {
        const fallback = await syncTaskAdapter.execute({
          taskType: name,
          metadata: { protocolMode: "sync-fallback" },
          executor: async (taskContext) => {
            const { bootstrap, result } = await executeTool(name, args, {
              signal: taskContext.signal,
              traceMeta,
              reportProgress: async (progress, message) => {
                await taskContext.reportProgress(progress, message);
                await emitProgress(normalizeProgress(progress), message);
              },
            });
            ensureValidResult(name, result);
            return decorator.decorate(name, args, result, traceMeta, bootstrap);
          },
        });

        if (fallback.status === "completed" && fallback.result) return fallback.result;
        return decorator.withTraceMeta(
          makeToolError(fallback.error?.message ?? fallback.message ?? "任务执行失败"),
          traceMeta
        );
      }

      const execution = await legacyTaskAdapter.start(
        {
          taskType: name,
          metadata: { protocolMode: "legacy" },
          executor: async (taskContext) => {
            const { bootstrap, result } = await executeTool(name, args, {
              signal: taskContext.signal,
              traceMeta,
              reportProgress: taskContext.reportProgress,
            });
            ensureValidResult(name, result);
            return decorator.decorate(name, args, result, traceMeta, bootstrap);
          },
        },
        {
          taskStore: wrapLegacyTaskStore(extra.taskStore),
          ttl: extra.taskRequestedTtl ?? taskRequest.ttl,
          externalSignal: extra.signal,
          reportProgress: async (progress, message) => {
            await emitProgress(normalizeProgress(progress), message);
          },
          failureResult: (error) =>
            decorator.withTraceMeta(makeToolError(error.message), traceMeta),
        }
      );

      void execution.completion.catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[MCP Probe Kit] task execution failed: ${message}`);
      });

      return decorator.withTraceMeta({ task: execution.task }, traceMeta);
    }

    const context: ToolExecutionContext = {
      signal: extra.signal,
      traceMeta,
      reportProgress: async (progress, message) => {
        await emitProgress(normalizeProgress(progress), message);
      },
    };

    try {
      ensureNotAborted(extra.signal, name);
      const { bootstrap, result } = await executeTool(name, args, context);
      ensureValidResult(name, result);
      ensureNotAborted(extra.signal, name);
      return decorator.decorate(name, args, result, traceMeta, bootstrap);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return decorator.withTraceMeta(makeToolError(message), traceMeta);
    }
  });
}

async function executeTool(
  name: string,
  args: unknown,
  context?: ToolExecutionContext
): Promise<{ bootstrap: McpProbeKitBootstrapResult | null; result: ToolResult }> {
  const bootstrap = ensureMcpProbeKitBootstrapForToolCall(name, args);
  logBootstrap(bootstrap);
  const result = (await executeRegisteredTool(name, args, context)) as ToolResult;
  return { bootstrap, result };
}

function logBootstrap(bootstrap: McpProbeKitBootstrapResult | null): void {
  if (bootstrap?.workspaceWarning) console.error(`[MCP Probe Kit] ${bootstrap.workspaceWarning}`);
  if (bootstrap?.skill.created) {
    console.error(
      `[MCP Probe Kit] 已创建 MCP Skill: ${bootstrap.skill.skillRelPath} (v${bootstrap.skill.version})`
    );
  } else if (bootstrap?.skill.updated) {
    console.error(
      `[MCP Probe Kit] 已升级 MCP Skill: ${bootstrap.skill.skillRelPath} ${bootstrap.skill.previousVersion ?? "?"} → v${bootstrap.skill.version}`
    );
  }
  if (bootstrap?.agentsMd.created) {
    console.error(`[MCP Probe Kit] 已创建 AGENTS.md（含 Skill 引用）: ${bootstrap.agentsMd.path}`);
  } else if (bootstrap?.agentsMd.updated) {
    console.error(`[MCP Probe Kit] 已更新 AGENTS.md（添加 Skill 引用）: ${bootstrap.agentsMd.path}`);
  }
}

function ensureValidResult(name: string, result: unknown): asserts result is ToolResult {
  if (!result || typeof result !== "object") {
    throw new Error(`工具 ${name} 返回了无效响应`);
  }
}

function ensureNotAborted(signal: AbortSignal, name: string): void {
  if (signal.aborted) throw new Error(`工具执行已取消: ${name}`);
}

function normalizeProgress(progress: number): number {
  return Math.max(0, Math.min(100, Math.round(progress)));
}

function makeToolError(errorMessage: string): ToolResult {
  return {
    content: [{ type: "text", text: `错误: ${errorMessage}` }],
    isError: true,
  };
}

function wrapLegacyTaskStore(
  taskStore: NonNullable<Parameters<Parameters<Server["setRequestHandler"]>[1]>[1]["taskStore"]>
): LegacyProtocolTaskStore {
  return {
    createTask: async (options) =>
      (await taskStore.createTask(options)) as LegacyProtocolTask,
    getTask: async (taskId) =>
      ((await taskStore.getTask(taskId)) as LegacyProtocolTask | undefined) ?? null,
    updateTaskStatus: async (taskId, status, message) =>
      taskStore.updateTaskStatus(taskId, status as never, message),
    storeTaskResult: async (taskId, status, result) =>
      taskStore.storeTaskResult(taskId, status as never, result as never),
  };
}
