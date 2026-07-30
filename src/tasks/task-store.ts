import * as fs from "node:fs";
import * as path from "node:path";
import type {
  CreateInternalTaskInput,
  InternalTaskRecord,
  InternalTaskStatus,
} from "./task-types.js";

export interface InternalTaskStore {
  create(task: InternalTaskRecord): Promise<InternalTaskRecord>;
  get(taskId: string): Promise<InternalTaskRecord | null>;
  findByIdempotencyKey(key: string): Promise<InternalTaskRecord | null>;
  save(task: InternalTaskRecord): Promise<InternalTaskRecord>;
  saveIfStatus(
    task: InternalTaskRecord,
    expectedStatus: InternalTaskStatus
  ): Promise<InternalTaskRecord | null>;
  listByStatus(statuses: InternalTaskStatus[]): Promise<InternalTaskRecord[]>;
}

export class JsonFileInternalTaskStore implements InternalTaskStore {
  private readonly tasks = new Map<string, InternalTaskRecord>();
  private readonly idempotency = new Map<string, string>();

  constructor(private readonly filePath: string) {
    this.load();
  }

  async create(task: InternalTaskRecord): Promise<InternalTaskRecord> {
    if (this.tasks.has(task.taskId)) throw new Error(`任务已存在: ${task.taskId}`);
    if (task.idempotencyKey) {
      const existingId = this.idempotency.get(task.idempotencyKey);
      const existing = existingId ? this.tasks.get(existingId) : undefined;
      if (existing) return cloneTask(existing);
    }
    this.tasks.set(task.taskId, cloneTask(task));
    if (task.idempotencyKey) this.idempotency.set(task.idempotencyKey, task.taskId);
    this.persist();
    return cloneTask(task);
  }

  async get(taskId: string): Promise<InternalTaskRecord | null> {
    const task = this.tasks.get(taskId);
    return task ? cloneTask(task) : null;
  }

  async findByIdempotencyKey(key: string): Promise<InternalTaskRecord | null> {
    const taskId = this.idempotency.get(key);
    return taskId ? this.get(taskId) : null;
  }

  async save(task: InternalTaskRecord): Promise<InternalTaskRecord> {
    if (!this.tasks.has(task.taskId)) throw new Error(`任务不存在: ${task.taskId}`);
    this.tasks.set(task.taskId, cloneTask(task));
    if (task.idempotencyKey) this.idempotency.set(task.idempotencyKey, task.taskId);
    this.persist();
    return cloneTask(task);
  }

  async saveIfStatus(
    task: InternalTaskRecord,
    expectedStatus: InternalTaskStatus
  ): Promise<InternalTaskRecord | null> {
    const current = this.tasks.get(task.taskId);
    if (!current) throw new Error(`任务不存在: ${task.taskId}`);
    if (current.status !== expectedStatus) return null;
    this.tasks.set(task.taskId, cloneTask(task));
    if (task.idempotencyKey) this.idempotency.set(task.idempotencyKey, task.taskId);
    this.persist();
    return cloneTask(task);
  }

  async listByStatus(statuses: InternalTaskStatus[]): Promise<InternalTaskRecord[]> {
    const allowed = new Set(statuses);
    return [...this.tasks.values()].filter((task) => allowed.has(task.status)).map(cloneTask);
  }

  private load(): void {
    if (!fs.existsSync(this.filePath)) return;
    const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf-8")) as {
      version?: number;
      tasks?: InternalTaskRecord[];
    };
    if (parsed.version !== 1 || !Array.isArray(parsed.tasks)) {
      throw new Error(`不支持的 Task Store 格式: ${this.filePath}`);
    }
    for (const task of parsed.tasks) {
      this.tasks.set(task.taskId, cloneTask(task));
      if (task.idempotencyKey) this.idempotency.set(task.idempotencyKey, task.taskId);
    }
  }

  private persist(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(
      tempPath,
      JSON.stringify({ version: 1, tasks: [...this.tasks.values()] }, null, 2),
      "utf-8"
    );
    fs.renameSync(tempPath, this.filePath);
  }
}

export class InMemoryInternalTaskStore implements InternalTaskStore {
  private readonly tasks = new Map<string, InternalTaskRecord>();
  private readonly idempotency = new Map<string, string>();

  async create(task: InternalTaskRecord): Promise<InternalTaskRecord> {
    if (this.tasks.has(task.taskId)) {
      throw new Error(`任务已存在: ${task.taskId}`);
    }

    if (task.idempotencyKey) {
      const existingId = this.idempotency.get(task.idempotencyKey);
      if (existingId) {
        const existing = this.tasks.get(existingId);
        if (existing) return cloneTask(existing);
      }
      this.idempotency.set(task.idempotencyKey, task.taskId);
    }

    this.tasks.set(task.taskId, cloneTask(task));
    return cloneTask(task);
  }

  async saveIfStatus(
    task: InternalTaskRecord,
    expectedStatus: InternalTaskStatus
  ): Promise<InternalTaskRecord | null> {
    const current = this.tasks.get(task.taskId);
    if (!current) throw new Error(`任务不存在: ${task.taskId}`);
    if (current.status !== expectedStatus) return null;
    this.tasks.set(task.taskId, cloneTask(task));
    if (task.idempotencyKey) this.idempotency.set(task.idempotencyKey, task.taskId);
    return cloneTask(task);
  }

  async get(taskId: string): Promise<InternalTaskRecord | null> {
    const task = this.tasks.get(taskId);
    return task ? cloneTask(task) : null;
  }

  async findByIdempotencyKey(key: string): Promise<InternalTaskRecord | null> {
    const taskId = this.idempotency.get(key);
    if (!taskId) return null;
    return this.get(taskId);
  }

  async save(task: InternalTaskRecord): Promise<InternalTaskRecord> {
    if (!this.tasks.has(task.taskId)) {
      throw new Error(`任务不存在: ${task.taskId}`);
    }
    this.tasks.set(task.taskId, cloneTask(task));
    if (task.idempotencyKey) this.idempotency.set(task.idempotencyKey, task.taskId);
    return cloneTask(task);
  }

  async listByStatus(statuses: InternalTaskStatus[]): Promise<InternalTaskRecord[]> {
    const allowed = new Set(statuses);
    return [...this.tasks.values()].filter((task) => allowed.has(task.status)).map(cloneTask);
  }
}

export function createTaskRecord(
  input: CreateInternalTaskInput,
  options: { taskId: string; now: Date }
): InternalTaskRecord {
  const createdAt = options.now.toISOString();
  return {
    taskId: options.taskId,
    taskType: input.taskType,
    idempotencyKey: input.idempotencyKey,
    status: "queued",
    progress: 0,
    metadata: input.metadata ? structuredClone(input.metadata) : undefined,
    createdAt,
    updatedAt: createdAt,
    expiresAt:
      input.ttlMs && input.ttlMs > 0
        ? new Date(options.now.getTime() + input.ttlMs).toISOString()
        : undefined,
    attempt: 0,
  };
}

function cloneTask(task: InternalTaskRecord): InternalTaskRecord {
  return structuredClone(task);
}
