/**
 * 由 mcp-tool-skill-registry 生成 Skill 正文（勿在此硬编码工具表）。
 * 本仓库 dogfood 文件由 `npm run sync-workflow-skill`（prebuild）自动写入。
 */

import { VERSION } from "../version.js";
import {
  MCP_INTENT_QUICK_LOOKUP,
  MCP_SKILL_ARGUMENT_RULES,
  MCP_SKILL_AVOID_RULES,
  MCP_SKILL_COMMON_FLOWS,
  MCP_TOOL_SKILL_GROUPS,
} from "./mcp-tool-skill-registry.js";
import { SKILL_VERSION_FRONTMATTER_KEY } from "./workflow-skill-version.js";

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

function renderArgumentRules(): string {
  return MCP_SKILL_ARGUMENT_RULES.map((rule) => `- ${rule}`).join("\n");
}

export function generateWorkflowSkillBody(skillVersion: string = VERSION): string {
  return `# MCP 调用时机 — mcp-probe-kit

> 本 Skill 负责：**什么情况调哪个 MCP，以及调用前如何构造完整参数**。不是开发流程剧本。
> 由 mcp-probe-kit 自动安装；支持 MCP 的 Agent 客户端可从 \`.agents/skills/\` 加载。

## 总规则

1. **先查下表**，有对应 MCP 就先调，再写代码 / 改文件
2. **拿不准** → \`workflow\`：\`{ "intent": "<结合当前对话整理的完整任务摘要>" }\`
3. \`start_*\` 会列出后续该调的 MCP；按返回逐步调用即可

## 参数构造纪律

${renderArgumentRules()}

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

export const MCP_PROBE_SKILL_NAME = "mcp-probe-kit";

export const MCP_PROBE_SKILL_DESCRIPTION = `在已配置 mcp-probe-kit 的项目中，于新功能、Bug、UI、重构或提交前读取；统一选择首个 MCP、汇总当前对话构造完整参数，并让复杂功能通过 start_feature 自动采用 flat 或 parent-child Spec。仅负责工具路由与参数纪律，不承载完整研发流程。Routes coding intent, builds complete MCP arguments, and selects flat or parent-child specs for complex features.`;

export function formatSkillFrontmatter(skillVersion: string = VERSION): string {
  return `---
name: ${MCP_PROBE_SKILL_NAME}
description: >-
  ${MCP_PROBE_SKILL_DESCRIPTION}
${SKILL_VERSION_FRONTMATTER_KEY}: "${skillVersion}"
---`;
}

export function generateWorkflowSkillContent(skillVersion: string = VERSION): string {
  return `${formatSkillFrontmatter(skillVersion)}

${generateWorkflowSkillBody(skillVersion)}
`;
}
