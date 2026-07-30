import { describe, expect, it } from "vitest";
import { LegacyTaskAdapter, type LegacyProtocolTaskStore } from "../legacy-task-adapter.js";
import { ModernTaskAdapter } from "../modern-task-adapter.js";
import { InMemoryInternalTaskStore } from "../task-store.js";
import { InternalTaskRuntime } from "../task-runtime.js";
import { SyncTaskAdapter } from "../sync-task-adapter.js";

class FakeLegacyStore implements LegacyProtocolTaskStore {
  readonly tasks = new Map<string, { taskId: string; status: string; result?: unknown }>();

  async createTask() {
    const task = { taskId: `legacy-${this.tasks.size + 1}`, status: "working" };
    this.tasks.set(task.taskId, task);
    return task;
  }

  async getTask(taskId: string) {
    return this.tasks.get(taskId) ?? null;
  }

  async updateTaskStatus(taskId: string, status: string) {
    const task = this.tasks.get(taskId);
    if (task) task.status = status;
  }

  async storeTaskResult(
    taskId: string,
    status: "completed" | "failed",
    result: unknown
  ) {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = status;
      task.result = result;
    }
  }
}

function runtime(prefix: string) {
  let id = 0;
  return new InternalTaskRuntime(new InMemoryInternalTaskStore(), {
    idFactory: () => `${prefix}-${++id}`,
  });
}

describe("Task adapters", () => {
  it("同步、Legacy、Modern 三条路径返回等价业务结果", async () => {
    const executor = async ({ reportProgress }: { reportProgress: (n: number, m?: string) => Promise<void> }) => {
      await reportProgress(50, "half");
      return { value: 42 };
    };

    const sync = await new SyncTaskAdapter(runtime("sync")).execute({
      taskType: "analysis",
      executor,
    });

    const modernExecution = await new ModernTaskAdapter(runtime("modern")).start({
      taskType: "analysis",
      executor,
    });
    const modern = await modernExecution.completion;

    const legacyStore = new FakeLegacyStore();
    const legacyExecution = await new LegacyTaskAdapter(runtime("legacy")).start(
      { taskType: "analysis", executor },
      {
        taskStore: legacyStore,
        failureResult: (error) => ({ error }),
        pollIntervalMs: 5,
      }
    );
    const legacy = await legacyExecution.completion;

    expect(sync.result).toEqual({ value: 42 });
    expect(modern.result).toEqual(sync.result);
    expect(legacy.result).toEqual(sync.result);
    expect(legacyStore.tasks.get(legacyExecution.task.taskId)?.result).toEqual(sync.result);
  });

  it("Legacy Task TTL 同步写入 Internal Task", async () => {
    const taskRuntime = runtime("legacy");
    const store = new FakeLegacyStore();
    const execution = await new LegacyTaskAdapter(taskRuntime).start(
      { taskType: "ttl", executor: async () => "ok" },
      {
        taskStore: store,
        ttl: 60_000,
        failureResult: (error) => ({ error }),
        pollIntervalMs: 5,
      }
    );

    const internal = await taskRuntime.get(execution.internalTaskId);
    expect(internal?.expiresAt).toBeTruthy();
    await execution.completion;
  });

  it("Modern Adapter 将 queued 映射为 working", async () => {
    let release!: () => void;
    const wait = new Promise<void>((resolve) => (release = resolve));
    const adapter = new ModernTaskAdapter(runtime("modern"));
    const execution = await adapter.start({
      taskType: "long",
      executor: async () => {
        await wait;
        return "done";
      },
    });

    expect(execution.task.status).toBe("working");
    release();
    await execution.completion;
  });

  it("Legacy Adapter 将内部失败转换为协议失败结果", async () => {
    const store = new FakeLegacyStore();
    const execution = await new LegacyTaskAdapter(runtime("legacy")).start(
      {
        taskType: "failure",
        executor: async () => {
          throw new Error("boom");
        },
      },
      {
        taskStore: store,
        failureResult: (error) => ({ code: error.code, message: error.message }),
        pollIntervalMs: 5,
      }
    );

    const task = await execution.completion;
    expect(task.status).toBe("failed");
    expect(store.tasks.get(execution.task.taskId)).toMatchObject({
      status: "failed",
      result: { code: "TASK_EXECUTION_FAILED", message: "boom" },
    });
  });

  it("Legacy Adapter 将请求断开映射为 cancelled，而不是非法结果状态", async () => {
    const store = new FakeLegacyStore();
    const controller = new AbortController();
    const execution = await new LegacyTaskAdapter(runtime("legacy")).start(
      {
        taskType: "cancel",
        executor: async ({ signal }) =>
          new Promise<string>((_resolve, reject) => {
            signal.addEventListener("abort", () => {
              const error = new Error("aborted");
              error.name = "AbortError";
              reject(error);
            });
          }),
      },
      {
        taskStore: store,
        externalSignal: controller.signal,
        failureResult: (error) => ({ error }),
        pollIntervalMs: 5,
      }
    );

    controller.abort();
    const task = await execution.completion;
    expect(task.status).toBe("cancelled");
    expect(store.tasks.get(execution.task.taskId)).toMatchObject({ status: "cancelled" });
    expect(store.tasks.get(execution.task.taskId)?.result).toBeUndefined();
  });

  it("任务完成后的晚到 Progress 不再向协议层发送", async () => {
    const store = new FakeLegacyStore();
    const emitted: number[] = [];
    let lateProgress!: () => Promise<void>;
    const execution = await new LegacyTaskAdapter(runtime("legacy")).start(
      {
        taskType: "late-progress",
        executor: async (context) => {
          await context.reportProgress(20, "working");
          lateProgress = () => context.reportProgress(100, "late");
          return "done";
        },
      },
      {
        taskStore: store,
        failureResult: (error) => ({ error }),
        reportProgress: (progress) => {
          emitted.push(progress);
        },
        pollIntervalMs: 5,
      }
    );

    await execution.completion;
    await lateProgress();
    expect(emitted).toEqual([20]);
  });
});
