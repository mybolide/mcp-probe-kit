import { InternalTaskRuntime } from "./task-runtime.js";
import type { TaskAdapterRequest } from "./task-adapter-types.js";
import type { InternalTaskRecord } from "./task-types.js";

export class SyncTaskAdapter {
  constructor(private readonly runtime: InternalTaskRuntime) {}

  async execute<TResult>(
    request: TaskAdapterRequest<TResult>
  ): Promise<InternalTaskRecord<TResult>> {
    const task = await this.runtime.create(request);
    return this.runtime.start(task.taskId, request.executor);
  }
}
