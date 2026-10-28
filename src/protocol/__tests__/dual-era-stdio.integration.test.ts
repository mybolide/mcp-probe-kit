import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { CallToolResultSchema } from "@modelcontextprotocol/core";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createProbeServer } from "../../server/create-server.js";
import type { ProtocolMode } from "../protocol-capabilities.js";
import { isMemoryEnabled } from "../../lib/memory-config.js";
import { isHistorySessionEnabled } from "../../lib/history-session-config.js";

function expectedCompactToolCount(): number {
  let count = 10;
  if (isHistorySessionEnabled()) count += 5;
  if (isMemoryEnabled()) count += 6;
  return count;
}

const cleanup: string[] = [];
async function createGitProject(prefix: string): Promise<string> {
  const project = await mkdtemp(join(tmpdir(), prefix));
  cleanup.push(project);
  execFileSync('git', ['init', '-q', project], { windowsHide: true, timeout: 3000 });
  return project;
}

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
      expect(tools.tools).toHaveLength(expectedCompactToolCount());
      expect(tools.tools.map((tool) => tool.name)).toEqual(
        expect.arrayContaining(['devcontrol', 'history_session_bootstrap', 'history_session_checkpoint'])
      );
      for (const retired of ['start_feature', 'workflow', 'plan_heartbeat', 'resume_plan', 'converge']) {
        expect(tools.tools.map((tool) => tool.name)).not.toContain(retired);
      }

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

  it("Modern 客户端直接创建 v5 SQLite 需求草稿，不再生成旧 delegated plan", async () => {
    const session = await connectClient("auto", "modern", {
      elicitationAction: "accept",
    });
    const projectRoot = await createGitProject("mcp-input-modern-");

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
        name: "devcontrol",
        arguments: {
          action: "feature-create",
          project_root: projectRoot,
          input: { name: "user-auth", description: "用户认证功能" },
        },
      });

      expect(session.elicitationCalls()).toBe(0);
      expect(result.isError ?? false).toBe(false);
      expect(result.structuredContent).toMatchObject({
        name: "user-auth", status: "draft", revision: 1,
      });
      const stored = await session.client.callTool({ name: "devcontrol",
        arguments: {action: "feature-get", project_root: projectRoot, input: {name: "user-auth"}} });
      expect(stored.isError ?? false).toBe(false);
      expect(stored.structuredContent).toMatchObject({name:"user-auth",revision:1});
    } finally {
      await session.close();
    }
  });

  it("Legacy 客户端通过兼容 SDK 创建相同的 v5 SQLite Feature", async () => {
    const session = await connectClient("auto", "legacy", {
      elicitationAction: "accept",
    });
    const projectRoot = await createGitProject("mcp-input-legacy-");

    try {
      const result = await session.client.callTool({
        name: "devcontrol",
        arguments: {
          action: "feature-create",
          project_root: projectRoot,
          input: {name:"user-auth",description:"用户认证功能"},
        },
      });

      expect(session.elicitationCalls()).toBe(0);
      expect(result.isError ?? false).toBe(false);
      expect(result.structuredContent).toMatchObject({name:"user-auth",revision:1,status:"draft"});
    } finally {
      await session.close();
    }
  });

  it("未声明 elicitation 能力时 v5 仍接受结构化 SQLite 需求及设计", async () => {
    const session = await connectClient("auto", "modern");
    const projectRoot = await createGitProject("mcp-input-fallback-");

    try {
      const result = await session.client.callTool({
        name: "devcontrol",
        arguments: {
          action: "feature-create",
          project_root: projectRoot,
          input: {name:"user-auth",description:"User sign-in with explicit credential validation"},
        },
      });
      expect(result.isError ?? false).toBe(false);
      const save = await session.client.callTool({name:"devcontrol",arguments:{
        action:"feature-save",project_root:projectRoot,input:{
          name:"user-auth",architectureImpact:false,sections:{
            requirements:"FR-1: Users can sign in with a validated credential.",
            design:"Authentication handler returns explicit authorization errors and a session token.",
            tasks:"Implement the single credential-validation outcome and verify rejected credentials.",
          },
        },
      }});
      expect(save.isError ?? false).toBe(false);
      expect(save.structuredContent).toMatchObject({name:"user-auth",revision:2});
    } finally {
      await session.close();
    }
  });

  it("即使 Host 拒绝 elicitation，v5 仍只接受显式输入，不会自动伪造需求", async () => {
    const session = await connectClient("auto", "modern", {
      elicitationAction: "decline",
    });
    const projectRoot = await createGitProject("mcp-input-decline-");

    try {
      const result = await session.client.callTool({
        name: "devcontrol",
        arguments: {
          action:"feature-create",
          project_root: projectRoot,
          input:{name:"user-auth",description:"User sign-in draft awaiting full requirements"},
        },
      });

      expect(session.elicitationCalls()).toBe(0);
      expect(result.isError ?? false).toBe(false);
      expect(result.structuredContent).toMatchObject({status:"draft"});
      const validate = await session.client.callTool({name:"devcontrol",arguments:{
        action:"feature-validate",project_root:projectRoot,input:{name:"user-auth"},
      }});
      expect(validate.structuredContent).not.toMatchObject({passed:true});
    } finally {
      await session.close();
    }
  });

  it("auto 服务端接受 Legacy 客户端并保留 Task 兼容路径", async () => {
    const session = await connectClient("auto", "legacy");
    const projectRoot = await createGitProject("mcp-dual-legacy-");

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
              name: "devcontrol",
              arguments: {
                action:"next",
                project_root: projectRoot,
                input:{},
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
    const projectRoot = await createGitProject("mcp-dual-modern-");

    try {
      const result = CallToolResultSchema.parse(
        await session.client.request(
          {
            method: "tools/call",
            params: {
              name: "devcontrol",
              arguments: {
                action:"next",
                project_root: projectRoot,
                input:{},
              },
              task: { ttl: 60_000 },
            },
          } as never,
          CallToolResultSchema
        )
      );

      expect(result).not.toHaveProperty("task");
      expect(result.isError ?? false).toBe(false);
      expect(result.structuredContent).toBeTruthy();
      expect(JSON.stringify(result.structuredContent)).not.toContain("start_feature");
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
