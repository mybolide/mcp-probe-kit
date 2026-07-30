import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CallToolResultSchema,
  CreateTaskResultSchema,
  GetTaskResultSchema,
} from "@modelcontextprotocol/core";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { createProbeServer } from "../../server/create-server.js";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("Legacy Task protocol integration", () => {
  it("通过 tools/call 创建任务并从 tasks/result 取得等价工具结果", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "mcp-probe-task-"));
    cleanup.push(projectRoot);

    const { server } = createProbeServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client(
      { name: "task-integration", version: "1.0.0" },
      {
        capabilities: {
          tasks: { requests: { tools: { call: {} } } },
        } as never,
      }
    );

    await server.connect(serverTransport);
    await client.connect(clientTransport);

    try {
      const created = CreateTaskResultSchema.parse(
        await client.request({
          method: "tools/call",
          params: {
            name: "workflow",
            arguments: {
              intent: "实现订单导出功能",
              scenario: "feature",
              project_root: projectRoot,
            },
            task: { ttl: 60_000 },
          },
        } as never, CreateTaskResultSchema)
      );

      expect(created.task.taskId).toBeTruthy();

      const terminal = await waitForTerminalTask(client, created.task.taskId);
      expect(terminal.status).toBe("completed");

      const result = CallToolResultSchema.parse(
        await client.request({
          method: "tasks/result",
          params: { taskId: created.task.taskId },
        } as never, CallToolResultSchema)
      );
      expect(result.isError ?? false).toBe(false);
      expect(result.structuredContent).toMatchObject({
        scenario: "feature",
        firstTool: "start_feature",
        firstToolArgsHint: { spec_layout: "auto" },
      });
    } finally {
      await client.close();
      await server.close();
    }
  });
});

async function waitForTerminalTask(client: Client, taskId: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const task = GetTaskResultSchema.parse(
      await client.request({
        method: "tasks/get",
        params: { taskId },
      } as never, GetTaskResultSchema)
    );
    if (["completed", "failed", "cancelled"].includes(task.status)) return task;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`任务未在预期时间内结束: ${taskId}`);
}
