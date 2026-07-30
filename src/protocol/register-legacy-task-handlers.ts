import type { Server } from "@modelcontextprotocol/server";
import {
  CancelTaskResultSchema,
  GetTaskPayloadResultSchema,
  GetTaskResultSchema,
  ListTasksResultSchema,
} from "@modelcontextprotocol/core";
import { z } from "zod";
import { resolveProtocolEra } from "./protocol-capabilities.js";
import { LegacyTaskWireStore } from "./legacy-task-wire-store.js";

const TaskIdParamsSchema = z.object({ taskId: z.string().min(1) });
const ListTasksParamsSchema = z.object({ cursor: z.string().optional() }).optional();

export function registerLegacyTaskHandlers(
  server: Server,
  store: LegacyTaskWireStore
): void {
  server.setRequestHandler(
    "tasks/get",
    { params: TaskIdParamsSchema, result: GetTaskResultSchema },
    async ({ taskId }) => {
      assertLegacyEra(server, "tasks/get");
      const task = await store.getTask(taskId);
      if (!task) throw new Error(`任务不存在或已过期: ${taskId}`);
      return task;
    }
  );

  server.setRequestHandler(
    "tasks/result",
    { params: TaskIdParamsSchema, result: GetTaskPayloadResultSchema },
    async ({ taskId }) => {
      assertLegacyEra(server, "tasks/result");
      return (await store.getTaskResult(taskId)) as Record<string, unknown>;
    }
  );

  server.setRequestHandler(
    "tasks/list",
    { params: ListTasksParamsSchema, result: ListTasksResultSchema },
    async () => {
      assertLegacyEra(server, "tasks/list");
      return { tasks: await store.listTasks() };
    }
  );

  server.setRequestHandler(
    "tasks/cancel",
    { params: TaskIdParamsSchema, result: CancelTaskResultSchema },
    async ({ taskId }) => {
      assertLegacyEra(server, "tasks/cancel");
      return store.cancelTask(taskId);
    }
  );
}

function assertLegacyEra(server: Server, method: string): void {
  const era = resolveProtocolEra(server.getNegotiatedProtocolVersion());
  if (era !== "legacy") {
    throw new Error(`${method} 仅用于 Legacy Task 兼容路径`);
  }
}
