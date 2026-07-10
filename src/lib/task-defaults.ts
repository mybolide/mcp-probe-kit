/**
 * 长耗时工具可选走 MCP Task，避免阻塞 stdio 宿主。
 * 默认关闭：多数 Agent 客户端不会轮询 task 结果，自动升级会导致 code_insight 等“报错/无结果”。
 */

const AUTO_TASK_TOOLS = new Set(['code_insight', 'scan_and_extract_patterns']);

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
