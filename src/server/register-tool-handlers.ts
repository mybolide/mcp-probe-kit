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
import { isAbortError, type ToolExecutionContext } from "../lib/tool-execution-context.js";
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
}

export function registerToolHandlers(
  server: Server,
  decorator: ResultDecorator,
  options: ToolHandlerOptions
): void {
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
        return decorator.withTraceMeta(
          makeToolError("服务器未启用任务存储，无法创建任务"),
          traceMeta
        );
      }

      const task = await extra.taskStore.createTask({
        ttl: extra.taskRequestedTtl ?? taskRequest.ttl,
      });
      const taskAbortController = new AbortController();
      const cancelWatcher = setInterval(() => {
        void (async () => {
          try {
            const latestTask = await extra.taskStore?.getTask(task.taskId);
            if (latestTask?.status === "cancelled" && !taskAbortController.signal.aborted) {
              taskAbortController.abort();
            }
          } catch {
            // ignore watcher errors
          }
        })();
      }, 400);

      const onRequestAbort = () => taskAbortController.abort();
      extra.signal.addEventListener("abort", onRequestAbort, { once: true });

      const taskContext: ToolExecutionContext = {
        signal: taskAbortController.signal,
        traceMeta,
        reportProgress: async (progress, message) => {
          const normalized = normalizeProgress(progress);
          await emitProgress(normalized, message);
          try {
            await extra.taskStore?.updateTaskStatus(
              task.taskId,
              "working",
              `[${normalized}%] ${message}`
            );
          } catch {
            // task may have reached a terminal status
          }
        },
      };

      void executeTaskInBackground({
        name,
        args,
        taskId: task.taskId,
        context: taskContext,
        traceMeta,
        decorator,
        taskStore: extra.taskStore,
      })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[MCP Probe Kit] task execution failed: ${message}`);
        })
        .finally(() => {
          clearInterval(cancelWatcher);
          extra.signal.removeEventListener("abort", onRequestAbort);
        });

      return decorator.withTraceMeta({ task }, traceMeta);
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

async function executeTaskInBackground(options: {
  name: string;
  args: unknown;
  taskId: string;
  context: ToolExecutionContext;
  traceMeta: unknown;
  decorator: ResultDecorator;
  taskStore: NonNullable<Parameters<Parameters<Server["setRequestHandler"]>[1]>[1]["taskStore"]>;
}) {
  const { name, args, taskId, context, traceMeta, decorator, taskStore } = options;
  try {
    const { bootstrap, result: rawResult } = await executeTool(name, args, context);
    ensureValidResult(name, rawResult);
    const result = decorator.decorate(name, args, rawResult, traceMeta, bootstrap);
    const latestTask = await taskStore.getTask(taskId);
    if (!latestTask || isTerminalTaskStatus(latestTask.status)) return;
    await taskStore.storeTaskResult(taskId, result.isError ? "failed" : "completed", result as never);
  } catch (error) {
    const latestTask = await taskStore.getTask(taskId);
    if (!latestTask || isTerminalTaskStatus(latestTask.status)) return;
    const message = isAbortError(error)
      ? `工具执行已取消: ${name}`
      : error instanceof Error
        ? error.message
        : String(error);
    await taskStore.storeTaskResult(
      taskId,
      "failed",
      decorator.withTraceMeta(makeToolError(message), traceMeta) as never
    );
  }
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

function isTerminalTaskStatus(status: string): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}
