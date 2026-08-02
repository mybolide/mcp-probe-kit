#!/usr/bin/env node

import {
  serveStdio,
  StdioServerTransport,
} from "@modelcontextprotocol/server/stdio";
import { VERSION } from "./version.js";
import { ensureMcpProbeKitBootstrapAtStartup } from "./lib/workflow-skill-installer.js";
import { createProbeServer } from "./server/create-server.js";
import { getProtocolModeFromEnv } from "./protocol/protocol-capabilities.js";
import type { InternalTaskRecord } from "./tasks/task-types.js";
import { runCommandLine } from "./cli/command-line.js";

/** 启动日志标识：用于确认客户端是否加载当前 build。 */
const MCP_BUILD_TAG = "v4-cli-fallback-20260802";

async function main(): Promise<void> {
  const cliExitCode = await runCommandLine(process.argv.slice(2));
  if (cliExitCode !== null) {
    process.exitCode = cliExitCode;
    return;
  }
  await runMcpServer();
}

async function runMcpServer(): Promise<void> {
  const protocolMode = getProtocolModeFromEnv();
  const startup = ensureMcpProbeKitBootstrapAtStartup();
  reportStartupBootstrap(startup);

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

  console.error(
    `MCP Probe Kit v${VERSION} 已启动 | build=${MCP_BUILD_TAG} | protocol=${protocolMode} | workspace=${startup.workspace.root} | source=${startup.workspace.source}`
  );
  if (startup.workspace.warning) {
    console.error(`[MCP Probe Kit] ${startup.workspace.warning}`);
  }
}

function reportStartupBootstrap(
  startup: ReturnType<typeof ensureMcpProbeKitBootstrapAtStartup>
): void {
  if (startup.error) {
    console.error(`[MCP Probe Kit] 启动时同步 Skill 失败，将在首次工具调用时重试: ${startup.error}`);
    return;
  }
  const bootstrap = startup.bootstrap;
  if (!bootstrap) return;
  if (bootstrap.skill.created) {
    console.error(
      `[MCP Probe Kit] 启动时已创建 Skill: ${bootstrap.skill.skillRelPath} (v${bootstrap.skill.version})`
    );
  } else if (bootstrap.skill.updated) {
    console.error(
      `[MCP Probe Kit] 启动时已升级 Skill: ${bootstrap.skill.skillRelPath} ${bootstrap.skill.previousVersion ?? "?"} -> v${bootstrap.skill.version}`
    );
  }
  if (bootstrap.agentsMd.created) {
    console.error(`[MCP Probe Kit] 启动时已创建 AGENTS.md: ${bootstrap.agentsMd.path}`);
  } else if (bootstrap.agentsMd.updated) {
    console.error(`[MCP Probe Kit] 启动时已更新 AGENTS.md: ${bootstrap.agentsMd.path}`);
  }
  const cliChanges = bootstrap.cliFallback?.files.filter(
    (file) => file.created || file.updated
  );
  if (cliChanges && cliChanges.length > 0) {
    console.error(
      `[MCP Probe Kit] 已同步 CLI 降级启动器: ${bootstrap.cliFallback?.packageSpec} (${cliChanges.length} files)`
    );
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

process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") {
    process.exit(0);
  }
});

main().catch((error) => {
  console.error("服务器启动失败:", error);
  process.exit(1);
});
