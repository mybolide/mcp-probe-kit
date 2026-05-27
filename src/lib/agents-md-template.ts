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
- 检索：\`start_*\` 命中后**自动注入**历史经验全文；中途补查可用 \`search_memory\`；单条精读仍可用 \`read_memory_asset\`
- 沉淀：跨仓库共享**勿填** source_project/source_path；路径写进 content；summary 写检索关键词
- Bug 修完验证通过 → **必须** \`memorize_asset\` type=\`bugfix\` tags=\`bugfix,root-cause\`（content 含【现象】【根因】【修复】【验证】）
- 功能/UI 可复用产出 → \`memorize_asset\` type=\`pattern\`/\`component\``;
  }

  return `
Memory (requires MEMORY_* env):
- Search: \`start_*\` auto-injects full memory hits; use \`search_memory\` mid-task; \`read_memory_asset\` for a specific id
- Store: do NOT use source_project/source_path for cross-repo pools; put paths in content; write keyword-rich summary
- After verified bugfix → MUST \`memorize_asset\` type=\`bugfix\` (sections: symptom, root cause, fix, verification)
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
