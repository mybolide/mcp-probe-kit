import { randomUUID } from "node:crypto";
import type {
  LegacyProtocolTask,
  LegacyProtocolTaskStore,
} from "../tasks/legacy-task-adapter.js";

type LegacyTaskStatus =
  | "working"
  | "input_required"
  | "completed"
  | "failed"
  | "cancelled";

interface StoredLegacyTask extends LegacyProtocolTask {
  status: LegacyTaskStatus;
  result?: unknown;
  expiresAt?: number;
}

export class LegacyTaskWireStore implements LegacyProtocolTaskStore {
  private readonly tasks = new Map<string, StoredLegacyTask>();

  async createTask(options: { ttl?: number | null }): Promise<LegacyProtocolTask> {
    this.pruneExpired();
    const now = new Date().toISOString();
    const ttl = options.ttl ?? null;
    const task: StoredLegacyTask = {
      taskId: randomUUID().replaceAll("-", ""),
      status: "working",
      ttl,
      createdAt: now,
      lastUpdatedAt: now,
      pollInterval: 250,
      ...(typeof ttl === "number" ? { expiresAt: Date.now() + ttl } : {}),
    };
    this.tasks.set(task.taskId, task);
    return cloneTask(task);
  }

  async getTask(taskId: string): Promise<LegacyProtocolTask | null> {
    this.pruneExpired();
    const task = this.tasks.get(taskId);
    return task ? cloneTask(task) : null;
  }

  async updateTaskStatus(
    taskId: string,
    status: string,
    message?: string
  ): Promise<void> {
    const task = this.requireTask(taskId);
    task.status = normalizeStatus(status);
    task.lastUpdatedAt = new Date().toISOString();
    task.statusMessage = message;
  }

  async storeTaskResult(
    taskId: string,
    status: "completed" | "failed",
    result: unknown
  ): Promise<void> {
    const task = this.requireTask(taskId);
    task.status = status;
    task.result = result;
    task.lastUpdatedAt = new Date().toISOString();
  }

  async getTaskResult(taskId: string): Promise<unknown> {
    const task = this.requireTask(taskId);
    if (task.status !== "completed" && task.status !== "failed") {
      throw new Error(`任务尚未完成: ${taskId} (${task.status})`);
    }
    if (task.result === undefined) {
      throw new Error(`任务结果不存在: ${taskId}`);
    }
    return structuredClone(task.result);
  }

  async listTasks(): Promise<LegacyProtocolTask[]> {
    this.pruneExpired();
    return [...this.tasks.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(cloneTask);
  }

  async cancelTask(taskId: string): Promise<LegacyProtocolTask> {
    const task = this.requireTask(taskId);
    if (!isTerminal(task.status)) {
      task.status = "cancelled";
      task.statusMessage = "任务已由客户端取消";
      task.lastUpdatedAt = new Date().toISOString();
    }
    return cloneTask(task);
  }

  private requireTask(taskId: string): StoredLegacyTask {
    this.pruneExpired();
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`任务不存在或已过期: ${taskId}`);
    return task;
  }

  private pruneExpired(): void {
    const now = Date.now();
    for (const [taskId, task] of this.tasks) {
      if (task.expiresAt !== undefined && task.expiresAt <= now) {
        this.tasks.delete(taskId);
      }
    }
  }
}

function normalizeStatus(status: string): LegacyTaskStatus {
  if (
    status === "working" ||
    status === "input_required" ||
    status === "completed" ||
    status === "failed" ||
    status === "cancelled"
  ) {
    return status;
  }
  throw new Error(`不支持的 Legacy Task 状态: ${status}`);
}

function isTerminal(status: LegacyTaskStatus): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function cloneTask(task: StoredLegacyTask): LegacyProtocolTask {
  const { result: _result, expiresAt: _expiresAt, ...protocolTask } = task;
  return structuredClone(protocolTask);
}
