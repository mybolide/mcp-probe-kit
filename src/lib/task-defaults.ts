/**
 * 长耗时工具默认走 MCP Task，避免阻塞 stdio 宿主。
 */

const AUTO_TASK_TOOLS = new Set(['code_insight', 'scan_and_extract_patterns']);

export function isAutoTaskTool(toolName: string): boolean {
  return AUTO_TASK_TOOLS.has(toolName);
}

export function isAutoTaskEnabled(): boolean {
  const raw = process.env.MCP_DISABLE_AUTO_TASK?.trim();
  if (raw && /^(1|true|yes|on)$/i.test(raw)) {
    return false;
  }
  return true;
}

export function shouldAutoEscalateToTask(toolName: string, hasExplicitTaskRequest: boolean): boolean {
  if (hasExplicitTaskRequest) {
    return false;
  }
  return isAutoTaskEnabled() && isAutoTaskTool(toolName);
}
