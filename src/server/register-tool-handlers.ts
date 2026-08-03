import {
  CallToolResultSchema,
  ProgressNotificationSchema,
} from "@modelcontextprotocol/core";
import type {
  CallToolResult,
  ListToolsResult,
  Server,
} from "@modelcontextprotocol/server";
import { CLIENT_CAPABILITIES_META_KEY } from "@modelcontextprotocol/server";
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
import { LegacyTaskWireStore } from "../protocol/legacy-task-wire-store.js";
import { resolveProtocolEra } from "../protocol/protocol-capabilities.js";
import {
  applyRequirementsInputResponses,
  buildRequirementsInputRequired,
  isRequirementsLoopRequest,
  supportsFormElicitation,
} from "../protocol/requirements-input-bridge.js";
import {
  executeRegisteredTool,
  isAppOnlyTool,
  listToolDefinitions,
  listToolDefinitionsForToolset,
  prepareRegisteredToolForList,
} from "./tool-registry.js";
import { supportsMcpApps } from "../lib/mcp-apps.js";
import { ResultDecorator } from "./result-decorator.js";
import type { ToolResult } from "./runtime-types.js";

export interface ToolHandlerOptions {
  progressNotificationsEnabled: boolean;
  uiAppsEnabled: boolean;
  taskRuntime: InternalTaskRuntime;
  legacyTaskStore: LegacyTaskWireStore;
}

export function registerToolHandlers(
  server: Server,
  decorator: ResultDecorator,
  options: ToolHandlerOptions
): void {
  const legacyTaskAdapter = new LegacyTaskAdapter(options.taskRuntime);
  const syncTaskAdapter = new SyncTaskAdapter(options.taskRuntime);

  server.setRequestHandler("tools/list", async (_request, ctx): Promise<ListToolsResult> => {
    const toolset = getToolsetFromEnv();
    const clientCapabilities =
      server.getClientCapabilities() ??
      (ctx.mcpReq.envelope as Record<string, unknown> | undefined)?.[
        CLIENT_CAPABILITIES_META_KEY
      ];
    const definitions = listToolDefinitionsForToolset(toolset);
    const modelTools = definitions.map((definition) =>
      prepareRegisteredToolForList(definition, {
        clientCapabilities,
        uiAppsEnabled: options.uiAppsEnabled,
      })
    );
    // App-only actions remain callable by a negotiated MCP App through
    // tools/call, but must never be returned from tools/list. Some clients
    // ignore `_meta.ui.visibility: ['app']` and expose every listed tool to
    // the model, which leaks app-only actions into the Agent tool surface.
    const tools = modelTools;
    const payloadBytes = Buffer.byteLength(JSON.stringify({ tools }), "utf8");
    console.error(
      `[MCP Probe Kit] 当前工具集: ${toolset} (${modelTools.length}/${listToolDefinitions().length} 模型工具) | tools/list ≈ ` +
        `${(payloadBytes / 1024).toFixed(1)} KB`
    );
    return { tools };
  });

  server.setRequestHandler("tools/call", async (request, ctx) => {
    const { name, arguments: args } = request.params;
    const clientCapabilities =
      server.getClientCapabilities() ??
      (ctx.mcpReq.envelope as Record<string, unknown> | undefined)?.[
        CLIENT_CAPABILITIES_META_KEY
      ];
    if (
      isAppOnlyTool(name) &&
      (!options.uiAppsEnabled || !supportsMcpApps(clientCapabilities))
    ) {
      return toProtocolToolResult(
        makeToolError(`工具 ${name} 仅允许通过已协商的 MCP App 调用`)
      );
    }
    let taskRequest = request.params.task;
    const traceMeta = decorator.getTraceMeta(ctx.mcpReq._meta);
    const protocolEra = resolveProtocolEra(server.getNegotiatedProtocolVersion());
    const inputApplication = applyRequirementsInputResponses(
      name,
      args,
      ctx.mcpReq.inputResponses
    );
    const effectiveArgs = inputApplication.args;

    if (inputApplication.cancelled) {
      return toProtocolToolResult(
        decorator.withTraceMeta(makeToolError(inputApplication.cancelled), traceMeta)
      );
    }

    if (isRequirementsLoopRequest(name, args) || ctx.mcpReq.inputResponses) {
      taskRequest = undefined;
    }

    if (shouldAutoEscalateToTask(name, Boolean(taskRequest))) {
      taskRequest = taskRequest ?? {};
    }

    const emitProgress = async (progress: number, message: string) => {
      if (!options.progressNotificationsEnabled) return;
      const progressToken = ctx.mcpReq._meta?.progressToken;
      if (progressToken === undefined) return;

      try {
        await ctx.mcpReq.notify(
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
      if (protocolEra === "modern") {
        const fallback = await syncTaskAdapter.execute({
          taskType: name,
          metadata: {
            protocolMode: "modern-sync-fallback",
            reason: "Modern Tasks Extension 尚未启用",
          },
          executor: async (taskContext) => {
            const { bootstrap, result } = await executeTool(name, effectiveArgs, {
              signal: taskContext.signal,
              traceMeta,
              reportProgress: async (progress, message) => {
                await taskContext.reportProgress(progress, message);
                await emitProgress(normalizeProgress(progress), message);
              },
            });
            ensureValidResult(name, result);
            return decorator.decorate(
              name,
              effectiveArgs,
              result,
              traceMeta,
              bootstrap
            );
          },
        });

        if (fallback.status === "completed" && fallback.result) {
          return toProtocolToolResult(fallback.result);
        }
        return toProtocolToolResult(
          decorator.withTraceMeta(
            makeToolError(fallback.error?.message ?? fallback.message ?? "任务执行失败"),
            traceMeta
          )
        );
      }

      const execution = await legacyTaskAdapter.start(
        {
          taskType: name,
          metadata: { protocolMode: "legacy" },
          executor: async (taskContext) => {
            const { bootstrap, result } = await executeTool(name, effectiveArgs, {
              signal: taskContext.signal,
              traceMeta,
              reportProgress: taskContext.reportProgress,
            });
            ensureValidResult(name, result);
            return decorator.decorate(
              name,
              effectiveArgs,
              result,
              traceMeta,
              bootstrap
            );
          },
        },
        {
          taskStore: options.legacyTaskStore,
          ttl: taskRequest.ttl,
          externalSignal: ctx.mcpReq.signal,
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

      return toProtocolToolResult(
        decorator.withTraceMeta({ task: execution.task }, traceMeta)
      );
    }

    const context: ToolExecutionContext = {
      signal: ctx.mcpReq.signal,
      traceMeta,
      reportProgress: async (progress, message) => {
        await emitProgress(normalizeProgress(progress), message);
      },
    };

    try {
      ensureNotAborted(ctx.mcpReq.signal, name);
      const { bootstrap, result } = await executeTool(name, effectiveArgs, context);
      ensureValidResult(name, result);
      ensureNotAborted(ctx.mcpReq.signal, name);
      const inputRequiredResult = buildRequirementsInputRequired(
        result,
        supportsFormElicitation(
          server,
          (ctx.mcpReq.envelope as Record<string, unknown> | undefined)?.[
            CLIENT_CAPABILITIES_META_KEY
          ]
        )
      );
      if (inputRequiredResult) return inputRequiredResult;
      return toProtocolToolResult(
        decorator.decorate(name, effectiveArgs, result, traceMeta, bootstrap)
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return toProtocolToolResult(
        decorator.withTraceMeta(makeToolError(message), traceMeta)
      );
    }
  });
}

async function executeTool(
  name: string,
  args: unknown,
  context?: ToolExecutionContext
): Promise<{ bootstrap: McpProbeKitBootstrapResult | null; result: ToolResult }> {
  const bootstrap = isAppOnlyTool(name)
    ? null
    : ensureMcpProbeKitBootstrapForToolCall(name, args);
  logBootstrap(bootstrap);
  const result = (await executeRegisteredTool(name, args, {
    ...context,
    bootstrap,
  })) as ToolResult;
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

function toProtocolToolResult(result: ToolResult): CallToolResult {
  const parsed = CallToolResultSchema.safeParse(result);
  if (!parsed.success) {
    throw new Error(`工具结果不符合 MCP v2 Schema: ${parsed.error.message}`);
  }
  return parsed.data;
}
