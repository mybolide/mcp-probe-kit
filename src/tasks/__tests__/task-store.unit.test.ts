import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { JsonFileInternalTaskStore } from "../task-store.js";
import { InternalTaskRuntime } from "../task-runtime.js";

const cleanup: string[] = [];

afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("JsonFileInternalTaskStore", () => {
  it("跨 Runtime 保留任务，并将不可恢复的重启遗留任务明确标记 failed", async () => {
    const root = mkdtempSync(join(tmpdir(), "mcp-task-store-"));
    cleanup.push(root);
    const filePath = join(root, "tasks.json");

    const firstRuntime = new InternalTaskRuntime(new JsonFileInternalTaskStore(filePath), {
      idFactory: () => "persisted-task",
    });
    await firstRuntime.create({ taskType: "deep-analysis", idempotencyKey: "same-task" });

    const secondRuntime = new InternalTaskRuntime(new JsonFileInternalTaskStore(filePath));
    const recovered = await secondRuntime.recoverInterrupted(() => ({
      reason: "执行器无法从磁盘重建",
    }));

    expect(recovered).toHaveLength(1);
    expect(recovered[0]).toMatchObject({
      taskId: "persisted-task",
      status: "failed",
      error: {
        code: "TASK_NOT_RECOVERABLE",
        message: "执行器无法从磁盘重建",
        recoverable: false,
      },
    });

    const reloaded = await new JsonFileInternalTaskStore(filePath).get("persisted-task");
    expect(reloaded?.status).toBe("failed");
  });

  it("条件写入拒绝用旧状态覆盖新状态", async () => {
    const root = mkdtempSync(join(tmpdir(), "mcp-task-cas-"));
    cleanup.push(root);
    const store = new JsonFileInternalTaskStore(join(root, "tasks.json"));
    const runtime = new InternalTaskRuntime(store, { idFactory: () => "cas-task" });
    const created = await runtime.create({ taskType: "analysis" });
    await runtime.cancel(created.taskId);

    const staleWrite = await store.saveIfStatus(
      { ...created, status: "working", updatedAt: new Date().toISOString() },
      "queued"
    );
    expect(staleWrite).toBeNull();
    expect((await store.get(created.taskId))?.status).toBe("cancelled");
  });
});
