/**
 * 由 mcp-tool-skill-registry 生成 Skill 正文（勿在此硬编码工具表）。
 * 本仓库 dogfood 文件由 `npm run sync-workflow-skill`（prebuild）自动写入。
 */

import { VERSION } from "../version.js";
import {
  MCP_INTENT_QUICK_LOOKUP,
  MCP_SKILL_AVOID_RULES,
  MCP_SKILL_COMMON_FLOWS,
  MCP_TOOL_SKILL_GROUPS,
} from "./mcp-tool-skill-registry.js";
import { formatSkillVersionMarker } from "./workflow-skill-version.js";

export const MCP_PROBE_SKILL_REL_PATH = ".agents/skills/mcp-probe-kit/SKILL.md";

/** @deprecated 旧路径，仅用于检测并升级 AGENTS.md 引用 */
export const LEGACY_WORKFLOW_SKILL_REL_PATH = ".agents/skills/workflow/SKILL.md";

function renderIntentQuickLookup(): string {
  const rows = MCP_INTENT_QUICK_LOOKUP.map(
    (entry) => `| ${entry.signal} | \`${entry.firstTool}\` |`
  ).join("\n");
  return `| 用户说什么 / 什么情况 | 第一个 MCP |
|----------------------|------------|
${rows}`;
}

function renderToolGroups(): string {
  return MCP_TOOL_SKILL_GROUPS.map((group) => {
    const rows = group.tools
      .map((tool) => `| \`${tool.name}\` | ${tool.whenToCall} |`)
      .join("\n");
    const note = group.note ? `\n\n*${group.note}*` : "";
    return `### ${group.title}

| MCP | 何时调用 |
|-----|----------|
${rows}${note}`;
  }).join("\n\n");
}

function renderCommonFlows(): string {
  return MCP_SKILL_COMMON_FLOWS.map((flow) => `**${flow.label}**：\`${flow.chain}\``).join(
    "\n\n"
  );
}

function renderAvoidRules(): string {
  return MCP_SKILL_AVOID_RULES.map((rule) => `- ${rule}`).join("\n");
}

export function generateWorkflowSkillBody(skillVersion: string = VERSION): string {
  return `# MCP 调用时机 — mcp-probe-kit

> 本 Skill 只回答一件事：**什么情况 → 调哪个 MCP**。不是开发流程剧本。
> 由 mcp-probe-kit 自动安装；支持 MCP 的 Agent 客户端可从 \`.agents/skills/\` 加载。

## 总规则

1. **先查下表**，有对应 MCP 就先调，再写代码 / 改文件
2. **拿不准** → \`workflow\`：\`{ "intent": "<用户原话>" }\`
3. \`start_*\` 会列出后续该调的 MCP；按返回逐步调用即可

---

## 意图速查（第一个该调的 MCP）

${renderIntentQuickLookup()}

---

## 全工具：何时调用

${renderToolGroups()}

---

## 常见链路（只是调用顺序参考）

${renderCommonFlows()}

---

## 不要

${renderAvoidRules()}

---

*mcp-probe-kit 按版本自动同步（当前 \`${skillVersion}\`）。路径：\`${MCP_PROBE_SKILL_REL_PATH}\`*
`;
}

export function generateWorkflowSkillContent(skillVersion: string = VERSION): string {
  const versionMarker = formatSkillVersionMarker(skillVersion);
  return `${versionMarker}

${generateWorkflowSkillBody(skillVersion)}

${versionMarker}
`;
}
