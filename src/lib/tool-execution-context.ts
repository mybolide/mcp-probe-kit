export interface ToolExecutionContext {
  signal?: AbortSignal;
  reportProgress?: (progress: number, message: string) => Promise<void> | void;
  traceMeta?: unknown;
}

export function isAbortError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.name === "AbortError" || /aborted|cancel/i.test(error.message);
  }
  return false;
}

export function throwIfAborted(
  signal: AbortSignal | undefined,
  message: string = "操作已取消"
): void {
  if (!signal?.aborted) {
    return;
  }

  const err = new Error(message);
  err.name = "AbortError";
  throw err;
}

export async function reportToolProgress(
  context: ToolExecutionContext | undefined,
  progress: number,
  message: string
): Promise<void> {
  if (!context?.reportProgress) {
    return;
  }
  await context.reportProgress(progress, message);
}
