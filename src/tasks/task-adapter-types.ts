import type {
  InternalTaskExecutor,
  InternalTaskRecord,
} from "./task-types.js";

export interface TaskAdapterRequest<TResult = unknown> {
  taskType: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
  ttlMs?: number;
  executor: InternalTaskExecutor<TResult>;
}

export interface BackgroundTaskExecution<TResult = unknown> {
  internalTaskId: string;
  completion: Promise<InternalTaskRecord<TResult>>;
}
