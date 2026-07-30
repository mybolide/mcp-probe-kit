#!/usr/bin/env node

import {
  serveStdio,
  StdioServerTransport,
} from "@modelcontextprotocol/server/stdio";
import { VERSION } from "./version.js";
import { resolveWorkspaceRootWithMeta } from "./lib/workspace-root.js";
import { createProbeServer } from "./server/create-server.js";
import { getProtocolModeFromEnv } from "./protocol/protocol-capabilities.js";
import type { InternalTaskRecord } from "./tasks/task-types.js";

/** 启动日志标识：用于确认客户端是否加载当前 build。 */
const MCP_BUILD_TAG = "v4-sdk2-dual-era-20260730";

async function main(): Promise<void> {
  const protocolMode = getProtocolModeFromEnv();

  if (protocolMode === "legacy") {
    const runtime = createProbeServer({ protocolMode });
    await reportRecoveredTasks(runtime.taskRuntimeReady);
    await runtime.server.connect(new StdioServerTransport());
  } else {
    serveStdio(
      () => {
        const runtime = createProbeServer({ protocolMode });
        void reportRecoveredTasks(runtime.taskRuntimeReady).catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[MCP Probe Kit] Task 恢复失败: ${message}`);
        });
        return runtime.server;
      },
      protocolMode === "modern" ? { legacy: "reject" } : undefined
    );
  }

  const workspace = resolveWorkspaceRootWithMeta("");
  console.error(
    `MCP Probe Kit v${VERSION} 已启动 | build=${MCP_BUILD_TAG} | protocol=${protocolMode} | workspace=${workspace.root} | source=${workspace.source}`
  );
  if (workspace.warning) {
    console.error(`[MCP Probe Kit] ${workspace.warning}`);
  }
}

async function reportRecoveredTasks(
  taskRuntimeReady: Promise<InternalTaskRecord[]>
): Promise<void> {
  const recoveredTasks = await taskRuntimeReady;
  if (recoveredTasks.length > 0) {
    console.error(
      `[MCP Probe Kit] 已处理 ${recoveredTasks.length} 个重启遗留任务；不可恢复任务已明确标记 failed`
    );
  }
}

main().catch((error) => {
  console.error("服务器启动失败:", error);
  process.exit(1);
});
