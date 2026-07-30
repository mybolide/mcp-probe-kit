export type InternalTaskStatus =
  | "queued"
  | "working"
  | "input_required"
  | "completed"
  | "failed"
  | "cancelled";

export interface InternalTaskError {
  code: string;
  message: string;
  recoverable: boolean;
}

export interface InternalTaskRecord<TResult = unknown> {
  taskId: string;
  taskType: string;
  idempotencyKey?: string;
  status: InternalTaskStatus;
  progress: number;
  message?: string;
  result?: TResult;
  error?: InternalTaskError;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  expiresAt?: string;
  attempt: number;
}

export interface CreateInternalTaskInput {
  taskType: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
  ttlMs?: number;
}

export interface InternalTaskExecutionContext {
  taskId: string;
  signal: AbortSignal;
  reportProgress(progress: number, message?: string): Promise<void>;
  requireInput(message: string): Promise<void>;
}

export type InternalTaskExecutor<TResult = unknown> = (
  context: InternalTaskExecutionContext
) => Promise<TResult>;

export interface InternalTaskRecoveryDecision<TResult = unknown> {
  executor?: InternalTaskExecutor<TResult>;
  reason?: string;
}

export interface InternalTaskRuntimeOptions {
  now?: () => Date;
  idFactory?: () => string;
}

export const TERMINAL_TASK_STATUSES = new Set<InternalTaskStatus>([
  "completed",
  "failed",
  "cancelled",
]);
