#!/usr/bin/env node
/**
 * 校验 MCP Skill 注册表与 allToolSchemas 一致。
 * prebuild 自动调用；增删工具后若失败，请更新 src/lib/mcp-tool-skill-registry.ts
 */

import { allToolSchemas } from "../src/schemas/index.ts";
import {
  formatSkillRegistryMismatchMessage,
  validateMcpToolSkillRegistry,
} from "../src/lib/mcp-tool-skill-registry.ts";

const registeredToolNames = allToolSchemas.map((tool) => tool.name).sort();
const result = validateMcpToolSkillRegistry(registeredToolNames);

if (!result.ok) {
  console.error("[verify-workflow-skill] FAIL\n");
  console.error(formatSkillRegistryMismatchMessage(result));
  process.exit(1);
}

console.log(
  `[verify-workflow-skill] OK — ${registeredToolNames.length} tools synced with mcp-tool-skill-registry`
);
