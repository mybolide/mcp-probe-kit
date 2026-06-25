#!/usr/bin/env node
/**
 * 从 mcp-tool-skill-registry 生成并写入本仓库 dogfood Skill 文件。
 * prebuild 自动调用；改注册表后 build 即更新 .agents/skills/mcp-probe-kit/SKILL.md
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  generateWorkflowSkillContent,
  MCP_PROBE_SKILL_REL_PATH,
} from "../src/lib/workflow-skill-template.ts";
import { VERSION } from "../src/version.ts";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const targetPath = join(rootDir, MCP_PROBE_SKILL_REL_PATH);
const nextContent = generateWorkflowSkillContent(VERSION);
const previousContent = existsSync(targetPath) ? readFileSync(targetPath, "utf8") : null;

if (previousContent === nextContent) {
  console.log(`[sync-workflow-skill] 已是最新 (${MCP_PROBE_SKILL_REL_PATH}, v${VERSION})`);
} else {
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, nextContent, "utf8");
  console.log(`[sync-workflow-skill] 已更新 ${MCP_PROBE_SKILL_REL_PATH} (v${VERSION})`);
}
