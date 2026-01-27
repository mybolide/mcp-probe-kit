/**
 * Tasks 管理器
 * 实现 MCP 2025-11-25 Tasks API
 * 
 * 支持长时间运行的工具任务化执行：
 * - 创建任务
 * - 查询任务状态
 * - 获取任务结果
 * - 取消任务
 * - 列出任务
 */

import { randomUUID } from 'crypto';

/**
 * 任务状态
 */
export type TaskStatus = 'working' | 'completed' | 'failed' | 'cancelled';

/**
 * 任务元数据
 */
export interface TaskMetadata {
  taskId: string;
  status: TaskStatus;
  statusMessage?: string;
  createdAt: string;
  lastUpdatedAt: string;
  ttl?: number;
  pollInterval?: number;
}

/**
 * 任务结果
 */
export interface TaskResult {
  content: Array<{
    type: string;
    text?: string;
    [key: string]: any;
  }>;
  isError?: boolean;
  structuredContent?: any;
  _meta?: Record<string, any>;
}

/**
 * 任务数据
 */
interface Task {
  metadata: TaskMetadata;
  result?: TaskResult;
  executor?: Promise<TaskResult>;
  expiresAt?: number;
}

/**
 * Tasks 管理器类
 */
export class TasksManager {
  private tasks: Map<string, Task> = new Map();
  private cleanupInterval?: NodeJS.Timeout;

  constructor() {
    // 每分钟清理过期任务
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredTasks();
    }, 60000);
  }

  /**
   * 创建新任务
   * 
   * @param ttl - 任务生存时间（毫秒），null 表示无限
   * @param pollInterval - 建议的轮询间隔（毫秒）
   * @returns 任务元数据
   */
  createTask(ttl?: number | null, pollInterval: number = 5000): TaskMetadata {
    const taskId = randomUUID();
    const now = new Date().toISOString();
    
    const metadata: TaskMetadata = {
      taskId,
      status: 'working',
      statusMessage: 'The operation is now in progress.',
      createdAt: now,
      lastUpdatedAt: now,
      pollInterval,
    };

    if (ttl !== null && ttl !== undefined) {
      metadata.ttl = ttl;
    }

    const task: Task = {
      metadata,
    };

    // 设置过期时间
    if (ttl) {
      task.expiresAt = Date.now() + ttl;
    }

    this.tasks.set(taskId, task);
    
    console.error(`[Tasks] Created task ${taskId} (TTL: ${ttl || 'unlimited'}ms)`);
    
    return metadata;
  }

  /**
   * 更新任务状态
   * 
   * @param taskId - 任务 ID
   * @param status - 新状态
   * @param statusMessage - 状态消息
   */
  updateTaskStatus(
    taskId: string,
    status: TaskStatus,
    statusMessage?: string
  ): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    task.metadata.status = status;
    task.metadata.lastUpdatedAt = new Date().toISOString();
    
    if (statusMessage) {
      task.metadata.statusMessage = statusMessage;
    }

    console.error(`[Tasks] Updated task ${taskId} status: ${status}`);
  }

  /**
   * 设置任务结果
   * 
   * @param taskId - 任务 ID
   * @param result - 任务结果
   */
  setTaskResult(taskId: string, result: TaskResult): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    task.result = result;
    task.metadata.status = result.isError ? 'failed' : 'completed';
    task.metadata.lastUpdatedAt = new Date().toISOString();
    
    console.error(`[Tasks] Set result for task ${taskId}`);
  }

  /**
   * 获取任务元数据
   * 
   * @param taskId - 任务 ID
   * @returns 任务元数据
   */
  getTask(taskId: string): TaskMetadata {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    return task.metadata;
  }

  /**
   * 获取任务结果
   * 
   * @param taskId - 任务 ID
   * @returns 任务结果
   */
  getTaskResult(taskId: string): TaskResult {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (task.metadata.status === 'working') {
      throw new Error(`Task is still in progress: ${taskId}`);
    }

    if (!task.result) {
      throw new Error(`Task result not available: ${taskId}`);
    }

    return task.result;
  }

  /**
   * 取消任务
   * 
   * @param taskId - 任务 ID
   */
  cancelTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (task.metadata.status !== 'working') {
      throw new Error(`Task is not in progress: ${taskId}`);
    }

    task.metadata.status = 'cancelled';
    task.metadata.statusMessage = 'Task was cancelled by user.';
    task.metadata.lastUpdatedAt = new Date().toISOString();
    
    console.error(`[Tasks] Cancelled task ${taskId}`);
  }

  /**
   * 列出所有任务
   * 
   * @returns 任务元数据列表
   */
  listTasks(): TaskMetadata[] {
    return Array.from(this.tasks.values()).map(task => task.metadata);
  }

  /**
   * 执行异步任务
   * 
   * @param taskId - 任务 ID
   * @param executor - 任务执行函数
   */
  async executeTask(
    taskId: string,
    executor: () => Promise<TaskResult>
  ): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    try {
      console.error(`[Tasks] Executing task ${taskId}...`);
      const result = await executor();
      this.setTaskResult(taskId, result);
      console.error(`[Tasks] Task ${taskId} completed successfully`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Tasks] Task ${taskId} failed:`, errorMessage);
      
      this.setTaskResult(taskId, {
        content: [
          {
            type: 'text',
            text: `Task failed: ${errorMessage}`,
          },
        ],
        isError: true,
      });
    }
  }

  /**
   * 清理过期任务
   */
  private cleanupExpiredTasks(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [taskId, task] of this.tasks.entries()) {
      if (task.expiresAt && task.expiresAt < now) {
        this.tasks.delete(taskId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.error(`[Tasks] Cleaned up ${cleanedCount} expired tasks`);
    }
  }

  /**
   * 销毁管理器
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.tasks.clear();
  }
}

// 全局单例
let globalTasksManager: TasksManager | null = null;

/**
 * 获取全局 Tasks 管理器实例
 */
export function getTasksManager(): TasksManager {
  if (!globalTasksManager) {
    globalTasksManager = new TasksManager();
  }
  return globalTasksManager;
}
