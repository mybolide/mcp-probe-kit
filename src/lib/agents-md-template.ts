import type { DocumentLocale, ProjectContextLayout } from "./project-context-layout.js";
import { relativeLink } from "./project-context-layout.js";
import {
  formatAgentsSkillReference,
  formatAgentsSkillReferenceEn,
} from "./agents-skill-ref.js";
import { MCP_PROBE_SKILL_REL_PATH } from "./workflow-skill-template.js";

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
  contextReady?: boolean;
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
- 修正：已有资产可用 \`update_memory_asset\` 按 asset_id 原地更新（保留 ID）
- 清理：过时/错误/重复沉淀可用 \`delete_memory_asset\`（删除前建议 \`read_memory_asset\` 确认）
- Bug 修完验证通过 → **必须** \`memorize_asset\` type=\`bugfix\` tags=\`bugfix,root-cause\`（content 含【现象】【根因】【修复】【验证】）
- 功能/UI 可复用产出 → \`memorize_asset\` type=\`pattern\`/\`component\``;
  }

  return `
Memory (requires MEMORY_* env):
- Search: \`start_*\` auto-injects full memory hits; use \`search_memory\` mid-task; \`read_memory_asset\` for a specific id
- Store: do NOT use source_project/source_path for cross-repo pools; put paths in content; write keyword-rich summary
- Update: fix existing entries in place with \`update_memory_asset\` by asset_id (preserves ID)
- Cleanup: remove stale/wrong/duplicate entries with \`delete_memory_asset\` (confirm via \`read_memory_asset\` first)
- After verified bugfix → MUST \`memorize_asset\` type=\`bugfix\` (sections: symptom, root cause, fix, verification)
- Reusable feature/UI → \`memorize_asset\` type=\`pattern\`/\`component\``;
}

/**
 * Ultra-compact AGENTS.md body (inside mcp-probe block).
 */
export function generateAgentsMdInner(input: AgentsMdTemplateInput): string {
  const { layout, locale } = input;
  const contextReady = input.contextReady === true;
  const graphReady = input.graphReady === true;
  const graph = link(layout, layout.latestMarkdownPath);
  const ctxIndex = link(layout, layout.legacyIndexPath);
  const skillLink = link(layout, MCP_PROBE_SKILL_REL_PATH);

  const contextLineZh = contextReady
    ? `上下文：写代码前先读 [project-context](${ctxIndex})（链到 \`${layout.modularDir}/\` 各文档）`
    : `上下文：待 Agent 落盘后读 [project-context](${ctxIndex})（可先 \`init_project_context\` + 按模板写 \`${layout.modularDir}/\`）`;
  const graphLineZh = graphReady
    ? `图谱：大改前读 [latest](${graph})；过期 \`code_insight\` mode=auto save_to_docs=true`
    : `图谱：待 \`code_insight\` 落盘后读 [latest](${graph})（save_to_docs=true，由 Agent 写入）`;

  if (locale === "zh-CN") {
    return `## MCP（必须先调）
需已配置 mcp-probe-kit。${formatAgentsSkillReference(skillLink)}（首次 MCP 调用自动创建 Skill 文件）。

- 不确定用哪个 MCP → \`workflow\`（返回 firstTool）
- 新功能 → \`start_feature\`（会先搜记忆）
- Bug → \`start_bugfix\`（会先搜记忆）
- UI → \`start_ui\`（会先搜记忆）
- 不熟代码 / 影响面 → \`code_insight\`（context / impact / auto）
- 缺上下文 → \`init_project_context\`
- 提交 → \`gencommit\`

${contextLineZh}
${graphLineZh}${memorySection(locale)}`;
  }

  const contextLineEn = contextReady
    ? `Context: before coding read [project-context](${ctxIndex}) (links to \`${layout.modularDir}/\`)`
    : `Context: read [project-context](${ctxIndex}) after Agent creates it (\`init_project_context\` + templates)`;
  const graphLineEn = graphReady
    ? `Graph: read [latest](${graph}) before large changes; refresh \`code_insight\` mode=auto save_to_docs=true`
    : `Graph: read [latest](${graph}) after Agent saves code_insight output (save_to_docs=true)`;

  return `## MCP (call first)
Requires mcp-probe-kit. ${formatAgentsSkillReferenceEn(skillLink)} (Skill file auto-created on first MCP call).

- Unsure which MCP → \`workflow\` (returns firstTool)
- Feature → \`start_feature\` (searches memory first)
- Bug → \`start_bugfix\` (searches memory first)
- UI → \`start_ui\` (searches memory first)
- Unfamiliar code / impact → \`code_insight\` (context / impact / auto)
- Missing context → \`init_project_context\`
- Commit → \`gencommit\`

${contextLineEn}
${graphLineEn}${memorySection(locale)}`;
}

export function generateAgentsMdTemplate(input: AgentsMdTemplateInput): string {
  return generateAgentsMdInner(input);
}
