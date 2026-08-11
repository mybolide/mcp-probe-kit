import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { CallToolResultSchema } from "@modelcontextprotocol/core";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createProbeServer } from "../../server/create-server.js";
import type { ProtocolMode } from "../protocol-capabilities.js";
import { isMemoryEnabled } from "../../lib/memory-config.js";

const cleanup: string[] = [];

beforeEach(() => {
  vi.stubEnv('MCP_TOOLSET', 'compact');
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("SDK v2 dual-era stdio", () => {
  it("auto 模式优先协商 Modern，并保持 tools/resources 可用", async () => {
    const session = await connectClient("auto", "auto");
    try {
      expect(session.client.getProtocolEra()).toBe("modern");
      expect(session.client.getServerCapabilities()).not.toHaveProperty("tasks");
      const tools = await session.client.listTools();
      expect(tools.tools).toHaveLength(isMemoryEnabled() ? 30 : 24);
      expect(tools.tools.map((tool) => tool.name)).toEqual(
        expect.arrayContaining(['plan_heartbeat', 'resume_plan', 'converge'])
      );

      const resources = await session.client.listResources();
      expect(resources.resources.map((resource) => resource.uri)).toContain(
        "probe://status"
      );
      const status = await session.client.readResource({ uri: "probe://status" });
      const statusContent = status.contents[0];
      if (!statusContent || !("text" in statusContent)) {
        throw new Error("probe://status 未返回文本内容");
      }
      const payload = JSON.parse(statusContent.text);
      expect(payload.protocol).toMatchObject({
        mode: "auto",
        era: "modern",
        features: {
          inputRequired: false,
          legacyTasks: false,
          modernTasks: false,
          progress: false,
          apps: false,
        },
      });
    } finally {
      await session.close();
    }
  });

  it("Modern 客户端通过 input_required 一次性补全需求并取得 steady plan", async () => {
    const session = await connectClient("auto", "modern", {
      elicitationAction: "accept",
    });
    const projectRoot = await mkdtemp(join(tmpdir(), "mcp-input-modern-"));
    cleanup.push(projectRoot);

    try {
      const status = await session.client.readResource({ uri: "probe://status" });
      const statusContent = status.contents[0];
      if (!statusContent || !("text" in statusContent)) {
        throw new Error("probe://status 未返回文本内容");
      }
      expect(JSON.parse(statusContent.text).protocol.features.inputRequired).toBe(
        true
      );

      const result = await session.client.callTool({
        name: "start_feature",
        arguments: {
          feature_name: "user-auth",
          description: "用户认证功能",
          requirements_mode: "loop",
          loop_question_budget: 2,
          project_root: projectRoot,
        },
      });

      expect(session.elicitationCalls()).toBe(1);
      expect(result.isError ?? false).toBe(false);
      expect(result.structuredContent).not.toMatchObject({ mode: "loop" });
      expect(result.structuredContent).toMatchObject({
        metadata: {
          plan: {
            workflow: "feature",
            contractVersion: "2.0.0",
          },
        },
      });
    } finally {
      await session.close();
    }
  });

  it("Legacy 客户端通过 SDK shim 完成同一 requirements loop", async () => {
    const session = await connectClient("auto", "legacy", {
      elicitationAction: "accept",
    });
    const projectRoot = await mkdtemp(join(tmpdir(), "mcp-input-legacy-"));
    cleanup.push(projectRoot);

    try {
      const result = await session.client.callTool({
        name: "start_feature",
        arguments: {
          feature_name: "user-auth",
          description: "用户认证功能",
          requirements_mode: "loop",
          loop_question_budget: 2,
          project_root: projectRoot,
        },
      });

      expect(session.elicitationCalls()).toBe(1);
      expect(result.isError ?? false).toBe(false);
      expect(result.structuredContent).not.toMatchObject({ mode: "loop" });
      expect(result.structuredContent).toMatchObject({
        metadata: { plan: { workflow: "feature" } },
      });
    } finally {
      await session.close();
    }
  });

  it("未声明 elicitation 能力时保留结构化 loop 降级", async () => {
    const session = await connectClient("auto", "modern");
    const projectRoot = await mkdtemp(join(tmpdir(), "mcp-input-fallback-"));
    cleanup.push(projectRoot);

    try {
      const result = await session.client.callTool({
        name: "start_feature",
        arguments: {
          feature_name: "user-auth",
          description: "用户认证功能",
          requirements_mode: "loop",
          loop_question_budget: 2,
          project_root: projectRoot,
        },
      });

      expect(result.isError ?? false).toBe(false);
      expect(result.structuredContent).toMatchObject({
        mode: "loop",
        stopConditions: { ready: false },
      });
      expect(
        Array.isArray(
          (result.structuredContent as Record<string, unknown>)?.openQuestions
        )
      ).toBe(true);
    } finally {
      await session.close();
    }
  });

  it("用户拒绝需求澄清时返回明确错误，不继续生成计划", async () => {
    const session = await connectClient("auto", "modern", {
      elicitationAction: "decline",
    });
    const projectRoot = await mkdtemp(join(tmpdir(), "mcp-input-decline-"));
    cleanup.push(projectRoot);

    try {
      const result = await session.client.callTool({
        name: "start_feature",
        arguments: {
          feature_name: "user-auth",
          description: "用户认证功能",
          requirements_mode: "loop",
          project_root: projectRoot,
        },
      });

      expect(session.elicitationCalls()).toBe(1);
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain("拒绝提供需求澄清信息");
    } finally {
      await session.close();
    }
  });

  it("auto 服务端接受 Legacy 客户端并保留 Task 兼容路径", async () => {
    const session = await connectClient("auto", "legacy");
    const projectRoot = await mkdtemp(join(tmpdir(), "mcp-dual-legacy-"));
    cleanup.push(projectRoot);

    try {
      expect(session.client.getProtocolEra()).toBe("legacy");
      expect(session.client.getServerCapabilities()).toHaveProperty(
        "tasks.requests.tools.call"
      );
      const created = CallToolResultSchema.parse(
        await session.client.request(
          {
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
          } as never,
          CallToolResultSchema
        )
      );
      expect(created).toHaveProperty("task.taskId");
    } finally {
      await session.close();
    }
  });

  it("Modern 客户端请求 Task 时同步降级并返回正常工具结果", async () => {
    const session = await connectClient("auto", "modern");
    const projectRoot = await mkdtemp(join(tmpdir(), "mcp-dual-modern-"));
    cleanup.push(projectRoot);

    try {
      const result = CallToolResultSchema.parse(
        await session.client.request(
          {
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
          } as never,
          CallToolResultSchema
        )
      );

      expect(result).not.toHaveProperty("task");
      expect(result.isError ?? false).toBe(false);
      expect(result.structuredContent).toMatchObject({
        firstTool: "start_feature",
        firstToolArgsHint: { spec_layout: "auto" },
      });
    } finally {
      await session.close();
    }
  });

  it("modern-only 服务端拒绝 Legacy opening", async () => {
    await expect(connectClient("modern", "legacy")).rejects.toThrow();
  });

  it("legacy-only 服务端拒绝 Modern pin", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const runtime = createProbeServer({ protocolMode: "legacy" });
    await runtime.server.connect(serverTransport);

    const client = createClient("modern");
    try {
      await expect(client.connect(clientTransport)).rejects.toThrow();
    } finally {
      await client.close().catch(() => undefined);
      await runtime.server.close().catch(() => undefined);
    }
  });
});

type ClientMode = "auto" | "legacy" | "modern";
type ElicitationAction = "accept" | "decline" | "cancel";

interface ClientOptions {
  elicitationAction?: ElicitationAction;
}

async function connectClient(
  serverMode: ProtocolMode,
  clientMode: ClientMode,
  options: ClientOptions = {}
) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const handle = serveStdio(
    () => createProbeServer({ protocolMode: serverMode }).server,
    {
      transport: serverTransport,
      ...(serverMode === "modern" ? { legacy: "reject" as const } : {}),
    }
  );
  const client = createClient(clientMode, options);
  let elicitationCalls = 0;
  const elicitationAction = options.elicitationAction;
  if (elicitationAction) {
    client.setRequestHandler("elicitation/create", async (request) => {
      elicitationCalls += 1;
      if (elicitationAction !== "accept") {
        return { action: elicitationAction };
      }

      if (!("requestedSchema" in request.params)) {
        throw new Error("测试只接受 form elicitation");
      }
      const schema = request.params.requestedSchema;
      const propertyNames =
        schema && typeof schema === "object" && "properties" in schema
          ? Object.keys(schema.properties ?? {})
          : [];
      return {
        action: "accept",
        content: Object.fromEntries(
          propertyNames.map((key, index) => [key, `补充回答 ${index + 1}`])
        ),
      };
    });
  }

  try {
    await client.connect(clientTransport);
  } catch (error) {
    await client.close().catch(() => undefined);
    await handle.close().catch(() => undefined);
    throw error;
  }

  return {
    client,
    elicitationCalls: () => elicitationCalls,
    close: async () => {
      await client.close().catch(() => undefined);
      await handle.close().catch(() => undefined);
    },
  };
}

function createClient(mode: ClientMode, options: ClientOptions = {}): Client {
  const client = new Client(
    { name: `dual-era-${mode}`, version: "1.0.0" },
    {
      capabilities: options.elicitationAction ? { elicitation: {} } : {},
    }
  );
  client.setVersionNegotiation({
    mode:
      mode === "modern"
        ? { pin: "2026-07-28" }
        : mode,
  });
  return client;
}
