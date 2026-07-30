import { InternalTaskRuntime } from "./task-runtime.js";
import type {
  BackgroundTaskExecution,
  TaskAdapterRequest,
} from "./task-adapter-types.js";
import type {
  InternalTaskError,
  InternalTaskRecord,
  InternalTaskStatus,
} from "./task-types.js";

export type ModernTaskStatus =
  | "working"
  | "input_required"
  | "completed"
  | "failed"
  | "cancelled";

export interface ModernTaskEnvelope<TResult = unknown> {
  taskId: string;
  status: ModernTaskStatus;
  progress: number;
  statusMessage?: string;
  result?: TResult;
  error?: InternalTaskError;
  createdAt: string;
  updatedAt: string;
}

export interface ModernTaskExecution<TResult = unknown>
  extends BackgroundTaskExecution<TResult> {
  task: ModernTaskEnvelope<TResult>;
}

export class ModernTaskAdapter {
  constructor(private readonly runtime: InternalTaskRuntime) {}

  async start<TResult>(
    request: TaskAdapterRequest<TResult>
  ): Promise<ModernTaskExecution<TResult>> {
    const internal = await this.runtime.create(request);
    return {
      internalTaskId: internal.taskId,
      task: toModernTaskEnvelope(internal as InternalTaskRecord<TResult>),
      completion: this.runtime.start(internal.taskId, request.executor),
    };
  }

  async get<TResult>(taskId: string): Promise<ModernTaskEnvelope<TResult> | null> {
    const task = await this.runtime.get(taskId);
    return task ? toModernTaskEnvelope(task as InternalTaskRecord<TResult>) : null;
  }

  async cancel(taskId: string, reason?: string): Promise<ModernTaskEnvelope> {
    return toModernTaskEnvelope(await this.runtime.cancel(taskId, reason));
  }
}

export function toModernTaskEnvelope<TResult>(
  task: InternalTaskRecord<TResult>
): ModernTaskEnvelope<TResult> {
  return {
    taskId: task.taskId,
    status: mapModernStatus(task.status),
    progress: task.progress,
    statusMessage: task.message,
    result: task.result,
    error: task.error,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

function mapModernStatus(status: InternalTaskStatus): ModernTaskStatus {
  return status === "queued" ? "working" : status;
}
