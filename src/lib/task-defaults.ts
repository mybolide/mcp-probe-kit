/**
 * 长耗时工具可选走 MCP Task，避免阻塞 stdio 宿主。
 * 默认关闭：多数 Agent 客户端不会轮询 task 结果，自动升级会导致 code_insight 等“报错/无结果”。
 */

import { TOOL_CATALOG } from '../server/tool-catalog.js';

const AUTO_TASK_TOOLS = new Set(
  TOOL_CATALOG.filter((entry) => entry.taskPolicy.autoEscalate).map((entry) => entry.name)
);

export function isAutoTaskTool(toolName: string): boolean {
  return AUTO_TASK_TOOLS.has(toolName);
}

function isTruthyEnv(value: string | undefined): boolean {
  return Boolean(value && /^(1|true|yes|on)$/i.test(value.trim()));
}

export function isAutoTaskEnabled(): boolean {
  if (isTruthyEnv(process.env.MCP_DISABLE_AUTO_TASK)) {
    return false;
  }
  return isTruthyEnv(process.env.MCP_ENABLE_AUTO_TASK);
}

export function shouldAutoEscalateToTask(toolName: string, hasExplicitTaskRequest: boolean): boolean {
  if (hasExplicitTaskRequest) {
    return false;
  }
  return isAutoTaskEnabled() && isAutoTaskTool(toolName);
}
