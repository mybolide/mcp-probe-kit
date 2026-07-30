import { isAbortError } from "../lib/tool-execution-context.js";
import { createTaskRecord, type InternalTaskStore } from "./task-store.js";
import {
  TERMINAL_TASK_STATUSES,
  type CreateInternalTaskInput,
  type InternalTaskExecutor,
  type InternalTaskRecord,
  type InternalTaskRecoveryDecision,
  type InternalTaskRuntimeOptions,
  type InternalTaskStatus,
} from "./task-types.js";

const ALLOWED_TRANSITIONS: Record<InternalTaskStatus, InternalTaskStatus[]> = {
  queued: ["working", "cancelled", "failed"],
  working: ["input_required", "completed", "failed", "cancelled"],
  input_required: ["working", "cancelled", "failed"],
  completed: [],
  failed: ["queued"],
  cancelled: ["queued"],
};

export class InternalTaskRuntime {
  private readonly now: () => Date;
  private readonly idFactory: () => string;
  private readonly controllers = new Map<string, AbortController>();
  private readonly inFlight = new Map<string, Promise<InternalTaskRecord>>();

  constructor(
    private readonly store: InternalTaskStore,
    options: InternalTaskRuntimeOptions = {}
  ) {
    this.now = options.now ?? (() => new Date());
    this.idFactory = options.idFactory ?? defaultTaskId;
  }

  async create(input: CreateInternalTaskInput): Promise<InternalTaskRecord> {
    if (!input.taskType.trim()) throw new Error("taskType 不能为空");
    if (input.idempotencyKey) {
      const existing = await this.store.findByIdempotencyKey(input.idempotencyKey);
      if (existing) return existing;
    }
    return this.store.create(
      createTaskRecord(input, { taskId: this.idFactory(), now: this.now() })
    );
  }

  async get(taskId: string): Promise<InternalTaskRecord | null> {
    return this.store.get(taskId);
  }

  async start<TResult>(
    taskId: string,
    executor: InternalTaskExecutor<TResult>
  ): Promise<InternalTaskRecord<TResult>> {
    const existingFlight = this.inFlight.get(taskId);
    if (existingFlight) return existingFlight as Promise<InternalTaskRecord<TResult>>;

    const controller = new AbortController();
    this.controllers.set(taskId, controller);
    const promise = this.prepareAndExecute(taskId, executor, controller);
    this.inFlight.set(taskId, promise as Promise<InternalTaskRecord>);
    try {
      return await promise;
    } finally {
      this.inFlight.delete(taskId);
      this.controllers.delete(taskId);
    }
  }

  private async prepareAndExecute<TResult>(
    taskId: string,
    executor: InternalTaskExecutor<TResult>,
    controller: AbortController
  ): Promise<InternalTaskRecord<TResult>> {
    try {
      const task = await this.requireTask(taskId);
      if (task.status === "completed") return task as InternalTaskRecord<TResult>;
      if (task.status === "working") {
        throw new Error(`任务 ${taskId} 已处于 working，但当前进程没有执行句柄`);
      }
      if (task.status === "input_required") {
        await this.transition(task, "working", { message: "继续执行" });
      } else if (task.status === "failed" || task.status === "cancelled") {
        await this.transition(task, "queued", {
          progress: 0,
          message: "重新排队",
          error: undefined,
          result: undefined,
          completedAt: undefined,
        });
      }
      return this.execute(taskId, executor, controller);
    } catch (error) {
      const latest = await this.requireTask(taskId);
      if (latest.status === "cancelled") {
        return latest as InternalTaskRecord<TResult>;
      }
      throw error;
    }
  }

  async cancel(taskId: string, reason = "任务已取消"): Promise<InternalTaskRecord> {
    const task = await this.requireTask(taskId);
    if (TERMINAL_TASK_STATUSES.has(task.status)) return task;
    this.controllers.get(taskId)?.abort(reason);
    return this.transition(task, "cancelled", {
      message: reason,
      completedAt: this.now().toISOString(),
      error: { code: "TASK_CANCELLED", message: reason, recoverable: true },
    });
  }

  async recoverInterrupted(
    resolver: (
      task: InternalTaskRecord
    ) => Promise<InternalTaskRecoveryDecision> | InternalTaskRecoveryDecision
  ): Promise<InternalTaskRecord[]> {
    const interrupted = await this.store.listByStatus(["queued", "working", "input_required"]);
    const recovered: InternalTaskRecord[] = [];

    for (const task of interrupted) {
      const decision = await resolver(task);
      if (decision.executor) {
        if (task.status === "working" || task.status === "input_required") {
          await this.forceSave({
            ...task,
            status: "queued",
            progress: 0,
            message: "服务重启后恢复排队",
            updatedAt: this.now().toISOString(),
          });
        }
        recovered.push(await this.start(task.taskId, decision.executor));
        continue;
      }

      recovered.push(
        await this.transition(task, "failed", {
          message: decision.reason ?? "服务重启后无法恢复任务",
          completedAt: this.now().toISOString(),
          error: {
            code: "TASK_NOT_RECOVERABLE",
            message: decision.reason ?? "服务重启后无法恢复任务",
            recoverable: false,
          },
        })
      );
    }

    return recovered;
  }

  private async execute<TResult>(
    taskId: string,
    executor: InternalTaskExecutor<TResult>,
    controller: AbortController
  ): Promise<InternalTaskRecord<TResult>> {
    try {
      let task = await this.requireTask(taskId);
      task = await this.transition(task, "working", {
        startedAt: task.startedAt ?? this.now().toISOString(),
        attempt: task.attempt + 1,
        message: "任务执行中",
      });
      if (controller.signal.aborted) {
        const error = new Error("任务执行已取消");
        error.name = "AbortError";
        throw error;
      }
      const result = await executor({
        taskId,
        signal: controller.signal,
        reportProgress: async (progress, message) => {
          const latest = await this.requireTask(taskId);
          if (TERMINAL_TASK_STATUSES.has(latest.status)) return;
          await this.store.saveIfStatus(
            {
              ...latest,
              progress: normalizeProgress(progress),
              message: message ?? latest.message,
              updatedAt: this.now().toISOString(),
            },
            latest.status
          );
        },
        requireInput: async (message) => {
          const latest = await this.requireTask(taskId);
          if (latest.status !== "working") return;
          await this.transition(latest, "input_required", { message });
        },
      });

      const latest = await this.requireTask(taskId);
      if (latest.status === "cancelled") return latest as InternalTaskRecord<TResult>;
      return (await this.transition(latest, "completed", {
        progress: 100,
        result,
        message: "任务完成",
        completedAt: this.now().toISOString(),
        error: undefined,
      })) as InternalTaskRecord<TResult>;
    } catch (error) {
      const latest = await this.requireTask(taskId);
      if (latest.status === "cancelled" || isAbortError(error)) {
        if (latest.status === "cancelled") return latest as InternalTaskRecord<TResult>;
        return (await this.transition(latest, "cancelled", {
          message: "任务执行已取消",
          completedAt: this.now().toISOString(),
          error: { code: "TASK_CANCELLED", message: "任务执行已取消", recoverable: true },
        })) as InternalTaskRecord<TResult>;
      }

      const message = error instanceof Error ? error.message : String(error);
      return (await this.transition(latest, "failed", {
        message,
        completedAt: this.now().toISOString(),
        error: { code: "TASK_EXECUTION_FAILED", message, recoverable: true },
      })) as InternalTaskRecord<TResult>;
    }
  }

  private async transition(
    task: InternalTaskRecord,
    next: InternalTaskStatus,
    patch: Partial<InternalTaskRecord>
  ): Promise<InternalTaskRecord> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await this.requireTask(task.taskId);
      if (current.status === next) return current;
      if (!ALLOWED_TRANSITIONS[current.status].includes(next)) {
        throw new Error(`非法任务状态转换: ${current.status} -> ${next}`);
      }
      const saved = await this.store.saveIfStatus(
        {
          ...current,
          ...patch,
          status: next,
          updatedAt: this.now().toISOString(),
        },
        current.status
      );
      if (saved) return saved;
    }
    throw new Error(`任务状态并发更新冲突: ${task.taskId}`);
  }

  private async forceSave(task: InternalTaskRecord): Promise<InternalTaskRecord> {
    return this.store.save(task);
  }

  private async requireTask(taskId: string): Promise<InternalTaskRecord> {
    const task = await this.store.get(taskId);
    if (!task) throw new Error(`任务不存在: ${taskId}`);
    return task;
  }
}

function normalizeProgress(progress: number): number {
  return Math.max(0, Math.min(100, Math.round(progress)));
}

function defaultTaskId(): string {
  return `task-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}
