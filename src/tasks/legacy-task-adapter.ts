import { InternalTaskRuntime } from "./task-runtime.js";
import type {
  BackgroundTaskExecution,
  TaskAdapterRequest,
} from "./task-adapter-types.js";
import type { InternalTaskError, InternalTaskRecord } from "./task-types.js";

export interface LegacyProtocolTask {
  taskId: string;
  status: string;
  [key: string]: unknown;
}

export interface LegacyProtocolTaskStore {
  createTask(options: { ttl?: number }): Promise<LegacyProtocolTask>;
  getTask(taskId: string): Promise<LegacyProtocolTask | null>;
  updateTaskStatus(taskId: string, status: string, message?: string): Promise<unknown>;
  storeTaskResult(
    taskId: string,
    status: "completed" | "failed",
    result: unknown
  ): Promise<unknown>;
}

export interface LegacyTaskAdapterOptions<TResult> {
  taskStore: LegacyProtocolTaskStore;
  ttl?: number;
  externalSignal?: AbortSignal;
  pollIntervalMs?: number;
  reportProgress?: (progress: number, message: string) => Promise<void> | void;
  failureResult: (error: InternalTaskError) => unknown;
}

export interface LegacyTaskExecution<TResult = unknown>
  extends BackgroundTaskExecution<TResult> {
  task: LegacyProtocolTask;
}

export class LegacyTaskAdapter {
  constructor(private readonly runtime: InternalTaskRuntime) {}

  async start<TResult>(
    request: TaskAdapterRequest<TResult>,
    options: LegacyTaskAdapterOptions<TResult>
  ): Promise<LegacyTaskExecution<TResult>> {
    const protocolTask = await options.taskStore.createTask({ ttl: options.ttl });
    const internal = await this.runtime.create({
      ...request,
      ttlMs: request.ttlMs ?? options.ttl,
      idempotencyKey: request.idempotencyKey ?? `legacy:${protocolTask.taskId}`,
      metadata: {
        ...request.metadata,
        legacyTaskId: protocolTask.taskId,
      },
    });

    const abortFromRequest = () => {
      void this.runtime.cancel(internal.taskId, "请求连接已取消");
    };
    options.externalSignal?.addEventListener("abort", abortFromRequest, { once: true });

    const cancelWatcher = setInterval(() => {
      void this.cancelWhenProtocolTaskCancelled(
        options.taskStore,
        protocolTask.taskId,
        internal.taskId
      );
    }, options.pollIntervalMs ?? 400);

    const completion = this.runtime
      .start(internal.taskId, async (context) =>
        request.executor({
          ...context,
          reportProgress: async (progress, message) => {
            await context.reportProgress(progress, message);
            const internalLatest = await this.runtime.get(internal.taskId);
            if (!internalLatest || isInternalTerminal(internalLatest.status)) return;
            const latest = await options.taskStore.getTask(protocolTask.taskId);
            if (!latest || isLegacyTerminal(latest.status)) return;
            await options.reportProgress?.(progress, message ?? "任务执行中");
            await options.taskStore.updateTaskStatus(
              protocolTask.taskId,
              "working",
              `[${normalizeProgress(progress)}%] ${message ?? "任务执行中"}`
            );
          },
        })
      )
      .then(async (task) => {
        await this.storeProtocolResult(protocolTask.taskId, task, options);
        return task;
      })
      .finally(() => {
        clearInterval(cancelWatcher);
        options.externalSignal?.removeEventListener("abort", abortFromRequest);
      });

    return {
      task: protocolTask,
      internalTaskId: internal.taskId,
      completion,
    };
  }

  private async cancelWhenProtocolTaskCancelled(
    store: LegacyProtocolTaskStore,
    protocolTaskId: string,
    internalTaskId: string
  ): Promise<void> {
    try {
      const latest = await store.getTask(protocolTaskId);
      if (latest?.status === "cancelled") {
        await this.runtime.cancel(internalTaskId, "客户端取消任务");
      }
    } catch {
      // Polling errors do not decide task completion.
    }
  }

  private async storeProtocolResult<TResult>(
    protocolTaskId: string,
    task: InternalTaskRecord<TResult>,
    options: LegacyTaskAdapterOptions<TResult>
  ): Promise<void> {
    const latest = await options.taskStore.getTask(protocolTaskId);
    if (!latest || isLegacyTerminal(latest.status)) return;

    if (task.status === "completed") {
      await options.taskStore.storeTaskResult(protocolTaskId, "completed", task.result);
      return;
    }

    if (task.status === "cancelled") {
      await options.taskStore.updateTaskStatus(
        protocolTaskId,
        "cancelled",
        task.message ?? "任务已取消"
      );
      return;
    }

    const error = task.error ?? {
      code: "TASK_EXECUTION_FAILED",
      message: task.message ?? "任务执行失败",
      recoverable: true,
    };
    await options.taskStore.storeTaskResult(
      protocolTaskId,
      "failed",
      options.failureResult(error)
    );
  }
}

function isLegacyTerminal(status: string): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function isInternalTerminal(status: string): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function normalizeProgress(progress: number): number {
  return Math.max(0, Math.min(100, Math.round(progress)));
}
