import type { DocumentLocale, ProjectContextLayout } from "./project-context-layout.js";
import { relativeLink } from "./project-context-layout.js";

export interface AgentsMdTemplateInput {
  layout: ProjectContextLayout;
  locale: DocumentLocale;
  projectName: string;
  projectVersion: string;
  description: string;
  language: string;
  framework?: string;
  category: string;
  docs: Array<{ file: string; title: string; purpose: string }>;
  projectRootPosix: string;
  graphReady: boolean;
  /** @deprecated kept for callers; memory rules are always included in AGENTS.md */
  memoryEnabled?: boolean;
}

function link(layout: ProjectContextLayout, targetRel: string): string {
  return relativeLink(layout.indexPath, targetRel);
}

function memorySection(locale: DocumentLocale): string {
  if (locale === "zh-CN") {
    return `
记忆（需 MEMORY_QDRANT_URL 等已配置）：
- 检索：\`start_feature\` / \`start_bugfix\` / \`start_ui\` 会自动搜记忆；命中后用 \`read_memory_asset\` 读全文再动手
- Bug 修完验证通过后 → **必须** \`memorize_asset\` type=\`bugfix\` tags=\`bugfix,root-cause\`（现象+根因+改法）
- 功能/UI 有可复用产出 → \`memorize_asset\` type=\`pattern\`/\`component\``;
  }

  return `
Memory (requires MEMORY_* env):
- Search: \`start_feature\` / \`start_bugfix\` / \`start_ui\` auto-search; use \`read_memory_asset\` on hits before coding
- After verified bugfix → MUST \`memorize_asset\` type=\`bugfix\` tags=\`bugfix,root-cause\` (symptom + root cause + fix)
- Reusable feature/UI → \`memorize_asset\` type=\`pattern\`/\`component\``;
}

/**
 * Ultra-compact AGENTS.md body (inside mcp-probe block).
 */
export function generateAgentsMdInner(input: AgentsMdTemplateInput): string {
  const { layout, locale } = input;
  const graph = link(layout, layout.latestMarkdownPath);
  const ctxIndex = link(layout, layout.legacyIndexPath);

  if (locale === "zh-CN") {
    return `## MCP（必须先调）
需已配置 mcp-probe-kit。\`start_*\` 若返回 delegated plan，逐步执行完再结束。

- 新功能 → \`start_feature\`（会先搜记忆）
- Bug → \`start_bugfix\`（会先搜记忆）
- UI → \`start_ui\`（会先搜记忆）
- 不熟代码 / 影响面 → \`code_insight\`（context / impact / auto）
- 缺上下文 → \`init_project_context\`
- 提交 → \`gencommit\`

上下文：写代码前先读 [project-context](${ctxIndex})（链到 \`${layout.modularDir}/\` 各文档）
图谱：大改前读 [latest](${graph})；过期 \`code_insight\` mode=auto save_to_docs=true${memorySection(locale)}`;
  }

  return `## MCP (call first)
Requires mcp-probe-kit. Complete every \`start_*\` delegated plan step before done.

- Feature → \`start_feature\` (searches memory first)
- Bug → \`start_bugfix\` (searches memory first)
- UI → \`start_ui\` (searches memory first)
- Unfamiliar code / impact → \`code_insight\` (context / impact / auto)
- Missing context → \`init_project_context\`
- Commit → \`gencommit\`

Context: before coding read [project-context](${ctxIndex}) (links to \`${layout.modularDir}/\`)
Graph: read [latest](${graph}) before large changes; refresh \`code_insight\` mode=auto save_to_docs=true${memorySection(locale)}`;
}

export function generateAgentsMdTemplate(input: AgentsMdTemplateInput): string {
  return generateAgentsMdInner(input);
}
