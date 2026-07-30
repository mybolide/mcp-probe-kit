#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { VERSION } from "./version.js";
import { resolveWorkspaceRootWithMeta } from "./lib/workspace-root.js";
import { createProbeServer } from "./server/create-server.js";

/** 启动日志标识：用于确认客户端是否加载当前 build。 */
const MCP_BUILD_TAG = "v4-server-split-20260730";

async function main(): Promise<void> {
  const { server, taskRuntimeReady } = createProbeServer();
  const recoveredTasks = await taskRuntimeReady;
  if (recoveredTasks.length > 0) {
    console.error(
      `[MCP Probe Kit] 已处理 ${recoveredTasks.length} 个重启遗留任务；不可恢复任务已明确标记 failed`
    );
  }
  await server.connect(new StdioServerTransport());

  const workspace = resolveWorkspaceRootWithMeta("");
  console.error(
    `MCP Probe Kit v${VERSION} 已启动 | build=${MCP_BUILD_TAG} | workspace=${workspace.root} | source=${workspace.source}`
  );
  if (workspace.warning) {
    console.error(`[MCP Probe Kit] ${workspace.warning}`);
  }
}

main().catch((error) => {
  console.error("服务器启动失败:", error);
  process.exit(1);
});
