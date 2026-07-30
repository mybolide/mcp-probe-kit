import { describe, expect, it } from "vitest";
import { InMemoryInternalTaskStore } from "../task-store.js";
import { InternalTaskRuntime } from "../task-runtime.js";

function createRuntime(store = new InMemoryInternalTaskStore()) {
  let id = 0;
  let now = Date.parse("2026-07-30T06:00:00.000Z");
  return {
    store,
    runtime: new InternalTaskRuntime(store, {
      idFactory: () => `task-${++id}`,
      now: () => new Date((now += 1000)),
    }),
  };
}

describe("InternalTaskRuntime", () => {
  it("执行合法状态转换并保存结果", async () => {
    const { runtime } = createRuntime();
    const created = await runtime.create({ taskType: "code_insight" });
    const result = await runtime.start(created.taskId, async (context) => {
      await context.reportProgress(42.4, "分析中");
      return { ok: true };
    });

    expect(result.status).toBe("completed");
    expect(result.progress).toBe(100);
    expect(result.result).toEqual({ ok: true });
    expect(result.attempt).toBe(1);
  });

  it("相同 idempotencyKey 返回同一任务", async () => {
    const { runtime } = createRuntime();
    const first = await runtime.create({ taskType: "tests", idempotencyKey: "suite-1" });
    const second = await runtime.create({ taskType: "tests", idempotencyKey: "suite-1" });
    expect(second.taskId).toBe(first.taskId);
  });

  it("重复 start 复用同一执行 Promise", async () => {
    const { runtime } = createRuntime();
    const task = await runtime.create({ taskType: "batch" });
    let calls = 0;
    let release!: () => void;
    const blocker = new Promise<void>((resolve) => (release = resolve));
    const executor = async () => {
      calls += 1;
      await blocker;
      return "done";
    };

    const first = runtime.start(task.taskId, executor);
    const second = runtime.start(task.taskId, executor);
    release();
    const [a, b] = await Promise.all([first, second]);

    expect(calls).toBe(1);
    expect(a).toEqual(b);
  });

  it("执行异常进入 failed 并允许重新运行", async () => {
    const { runtime } = createRuntime();
    const task = await runtime.create({ taskType: "scan" });
    const failed = await runtime.start(task.taskId, async () => {
      throw new Error("boom");
    });
    expect(failed.status).toBe("failed");
    expect(failed.error?.code).toBe("TASK_EXECUTION_FAILED");

    const recovered = await runtime.start(task.taskId, async () => "ok");
    expect(recovered.status).toBe("completed");
    expect(recovered.attempt).toBe(2);
  });

  it("取消会中止执行并保留 cancelled 状态", async () => {
    const { runtime } = createRuntime();
    const task = await runtime.create({ taskType: "deep-analysis" });
    const running = runtime.start(task.taskId, async ({ signal }) => {
      await new Promise<void>((resolve, reject) => {
        signal.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
      return "never";
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    await runtime.cancel(task.taskId, "用户取消");
    const result = await running;
    expect(result.status).toBe("cancelled");
    expect(result.error?.code).toBe("TASK_CANCELLED");
  });

  it("并发晚到 Progress 不能把 cancelled 覆盖回 working", async () => {
    let releaseProgress!: () => void;
    let progressWriteStarted!: () => void;
    const progressGate = new Promise<void>((resolve) => (releaseProgress = resolve));
    const progressStarted = new Promise<void>((resolve) => (progressWriteStarted = resolve));

    class DelayedProgressStore extends InMemoryInternalTaskStore {
      override async saveIfStatus(task: Parameters<InMemoryInternalTaskStore["saveIfStatus"]>[0], expectedStatus: Parameters<InMemoryInternalTaskStore["saveIfStatus"]>[1]) {
        if (expectedStatus === "working" && task.progress === 50) {
          progressWriteStarted();
          await progressGate;
        }
        return super.saveIfStatus(task, expectedStatus);
      }
    }

    const { runtime } = createRuntime(new DelayedProgressStore());
    const task = await runtime.create({ taskType: "progress-race" });
    const running = runtime.start(task.taskId, async ({ reportProgress }) => {
      await reportProgress(50, "late");
      return "done";
    });

    await progressStarted;
    await runtime.cancel(task.taskId, "用户取消");
    releaseProgress();

    const result = await running;
    expect(result.status).toBe("cancelled");
    expect((await runtime.get(task.taskId))?.status).toBe("cancelled");
  });

  it("服务恢复时可重新执行或明确标记不可恢复", async () => {
    const store = new InMemoryInternalTaskStore();
    const first = createRuntime(store);
    const resumable = await first.runtime.create({ taskType: "resumable" });
    const lost = await first.runtime.create({ taskType: "lost" });

    const second = createRuntime(store);
    const results = await second.runtime.recoverInterrupted((task) =>
      task.taskId === resumable.taskId
        ? { executor: async () => "restored" }
        : { reason: "缺少恢复描述" }
    );

    expect(results.find((item) => item.taskId === resumable.taskId)?.status).toBe("completed");
    const lostResult = results.find((item) => item.taskId === lost.taskId);
    expect(lostResult?.status).toBe("failed");
    expect(lostResult?.error?.code).toBe("TASK_NOT_RECOVERABLE");
  });
});
