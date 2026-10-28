/**
 * 所有工具 Schema 的统一导出
 */

import { gitToolSchemas } from "./git-tools.js";
import { codeAnalysisToolSchemas } from "./code-analysis-tools.js";
import { codeGenToolSchemas } from "./code-gen-tools.js";
import { interviewToolSchemas } from "./interview-tools.js";
import { uiUxSchemas } from "./ui-ux-schemas.js";
import { memoryToolSchemas } from "./memory-tools.js";
import { historySessionToolSchemas } from "./history-session-tools.js";
import { architectureToolSchemas } from "./architecture-tools.js";
import { devcontrolToolSchemas } from "./devcontrol-tools.js";
import { isV5Tool } from '../server/v5-tool-policy.js';

// 合并所有工具 schemas；Tool Catalog/Registry 会在模块加载和测试中校验一一覆盖。
export const allToolSchemas = [
  ...devcontrolToolSchemas,
  ...gitToolSchemas,
  ...codeAnalysisToolSchemas,
  ...codeGenToolSchemas,
  ...interviewToolSchemas.filter(({ name }) => isV5Tool(name)),
  ...uiUxSchemas.filter(({ name }) => isV5Tool(name)),
  ...memoryToolSchemas,
  ...historySessionToolSchemas,
  ...architectureToolSchemas,
];
