import { describe, expect, test, afterEach } from 'vitest';
import { isAutoTaskTool, shouldAutoEscalateToTask } from '../task-defaults.js';

const originalDisable = process.env.MCP_DISABLE_AUTO_TASK;
const originalEnable = process.env.MCP_ENABLE_AUTO_TASK;

afterEach(() => {
  if (originalDisable === undefined) {
    delete process.env.MCP_DISABLE_AUTO_TASK;
  } else {
    process.env.MCP_DISABLE_AUTO_TASK = originalDisable;
  }
  if (originalEnable === undefined) {
    delete process.env.MCP_ENABLE_AUTO_TASK;
  } else {
    process.env.MCP_ENABLE_AUTO_TASK = originalEnable;
  }
});

describe('task-defaults', () => {
  test('code_insight 与 scan 属于自动 Task 工具', () => {
    expect(isAutoTaskTool('code_insight')).toBe(true);
    expect(isAutoTaskTool('scan_and_extract_patterns')).toBe(true);
    expect(isAutoTaskTool('search_memory')).toBe(false);
  });

  test('默认不自动升级为 Task，避免 Agent 客户端拿不到同步结果', () => {
    delete process.env.MCP_DISABLE_AUTO_TASK;
    delete process.env.MCP_ENABLE_AUTO_TASK;
    expect(shouldAutoEscalateToTask('code_insight', false)).toBe(false);
    expect(shouldAutoEscalateToTask('code_insight', true)).toBe(false);
  });

  test('MCP_ENABLE_AUTO_TASK=1 时开启自动 Task', () => {
    process.env.MCP_ENABLE_AUTO_TASK = '1';
    expect(shouldAutoEscalateToTask('code_insight', false)).toBe(true);
    expect(shouldAutoEscalateToTask('code_insight', true)).toBe(false);
  });

  test('MCP_DISABLE_AUTO_TASK=1 时强制关闭自动 Task', () => {
    process.env.MCP_ENABLE_AUTO_TASK = '1';
    process.env.MCP_DISABLE_AUTO_TASK = '1';
    expect(shouldAutoEscalateToTask('code_insight', false)).toBe(false);
  });
});
