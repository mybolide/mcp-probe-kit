import type { DocumentLocale, ProjectContextLayout } from "./project-context-layout.js";
import { relativeLink } from "./project-context-layout.js";
import {
  formatAgentsSkillReference,
  formatAgentsSkillReferenceEn,
} from "./agents-skill-ref.js";
import { MCP_PROBE_SKILL_REL_PATH } from "./workflow-skill-template.js";
import { renderV5AgentsMd } from './v5-sqlite-guidance.js';

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

function historySection(locale: DocumentLocale): string {
  if (locale === "zh-CN") {
    return `
会话历史（默认开启；\`MCP_HISTORY_SESSION=0|false|off\` 关闭；详见 Skill「History Session 读写规则」）：
- **写**：新对话先 \`history_session_bootstrap\`（无宿主 key 时服务器铸 \`hs_<uuid>\` 开新档，禁止写入共享 \`project-active\`）；每轮最终回复前 \`history_session_checkpoint\`（必须回传上次 \`session_key\`/\`expected_path\` + \`raw_user_input\`/\`user_intent\`）
- **检查点最低清单**：\`findings\`/\`decisions\`/\`files_changed\`/\`tests\`/\`runtime_state\`/\`next_actions\` 须写满（无内容用明确占位句，禁止空数组交差）
- **读**：先用 bootstrap 有界 state；精确旧上下文再 \`history_session_search\` → \`history_session_read\`；不要全量灌历史
- 历史文件模式在 docs/history-session/；Git+Node22 的 History Session 默认落项目 SQLite 的 hs_* 表；实时运行库/旧文件通常忽略，只有项目 Owner 明确批准且用一致性 SQLite 备份的协作项目才能将完整会话提交 Git（不能提交 WAL/活跃租约）；与 Memory/Qdrant 分离，继续时先 resume_plan`;
  }

  return `
History Session (default ON; disable with \`MCP_HISTORY_SESSION=0|false|off\`; see Skill “History Session” rules):
- **Write**: bootstrap at conversation start (server mints \`hs_<uuid>\` when the host has no session id — do not share \`project-active\`); checkpoint before each final reply (echo prior \`session_key\`/\`expected_path\` + \`raw_user_input\`/\`user_intent\`)
- **Minimum checkpoint**: fill \`findings\`/\`decisions\`/\`files_changed\`/\`tests\`/\`runtime_state\`/\`next_actions\` (use explicit placeholders when empty — no bare empty arrays)
- **Read**: bounded bootstrap state first; \`history_session_search\` → \`history_session_read\` for exact older context
- Legacy archives under docs/history-session/; Git+Node22 defaults to project SQLite hs_* history. Live state and legacy files are ignored unless the project Owner authorizes consistent full SQLite Git snapshots; never commit WAL or active leases. Separate from Memory/Qdrant; resume_plan first when continuing`;
}

function memorySection(locale: DocumentLocale): string {
  if (locale === "zh-CN") {
    return `
记忆（需 MEMORY_QDRANT_URL 等已配置）：
- 检索：\`start_*\` 命中后**自动注入**历史经验全文；中途补查可用 \`search_memory\`；单条精读仍可用 \`read_memory_asset\`
- 沉淀：跨仓库共享**勿填** source_project/source_path；路径写进 content；summary 写检索关键词
- 修正：已有资产可用 \`update_memory_asset\` 按 asset_id 原地更新（保留 ID）
- 清理：过时/错误/重复沉淀可用 \`delete_memory_asset\`（删除前建议 \`read_memory_asset\` 确认）
- Bug 每轮验证后先准备成功/失败/证伪/回归候选并写入 \`plan_heartbeat\`；\`converge\` 通过后再 \`memorize_asset\`
- 功能/UI 验证后先准备候选并写入 \`plan_heartbeat\`；\`converge\` 通过后再 \`memorize_asset\` type=\`pattern\`/\`component\``;
  }

  return `
Memory (requires MEMORY_* env):
- Search: \`start_*\` auto-injects full memory hits; use \`search_memory\` mid-task; \`read_memory_asset\` for a specific id
- Store: do NOT use source_project/source_path for cross-repo pools; put paths in content; write keyword-rich summary
- Update: fix existing entries in place with \`update_memory_asset\` by asset_id (preserves ID)
- Cleanup: remove stale/wrong/duplicate entries with \`delete_memory_asset\` (confirm via \`read_memory_asset\` first)
- After each verification, prepare successful or negative memory candidates and record them in \`plan_heartbeat\`; persist with \`memorize_asset\` only after \`converge\` passes
- For reusable feature/UI output, prepare a candidate first; after convergence persist it as \`pattern\`/\`component\``;
}

/**
 * Ultra-compact AGENTS.md body (inside mcp-probe block).
 */
export function generateAgentsMdInner(input: AgentsMdTemplateInput): string {
  const { layout, locale } = input;
  return renderV5AgentsMd(locale, locale === 'zh-CN'
    ? formatAgentsSkillReference(link(layout, MCP_PROBE_SKILL_REL_PATH))
    : formatAgentsSkillReferenceEn(link(layout, MCP_PROBE_SKILL_REL_PATH)));
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

- 用户只说“继续 / 开始 / 往下做” → **先调用 \`resume_plan\`**；已知 \`plan_id\` 则传入，未知则只传 \`project_root\` 自动恢复最近的 active/blocked Plan；未确认无可恢复 Plan 前，禁止先用 Bash 探索、调用 \`workflow\` 或重新调用 \`start_*\`；恢复成功且 \`mustContinue=true\` 后禁止只汇报“已恢复”，必须立即执行 \`nextStep/nextTool\`，每步后调用 \`plan_heartbeat\`，直到阻断、取消或收敛
- 不确定用哪个 MCP → \`workflow\`（只返回工具选择指南；由 Agent 自己判断，必要时再澄清）
- 当前会话看不到 MCP 工具 → 读取 Skill 的“执行通道与自动降级”，通过 \`.mcp-probe-kit/bin/probe.*\` 调用同版本 CLI；不要要求用户安装
- 新功能 → \`start_feature\`（会先搜记忆）
- Bug → \`start_bugfix\`（会先搜记忆）
- UI → \`start_ui\`（会先搜记忆）
- 不熟代码 / 影响面 → \`code_insight\`（context / impact / auto）
- 缺上下文 → \`init_project_context\`
- 提交 → \`gencommit\`

- **DevControl 任务质量**：详见 Skill 的 \`task-detail-v1\`：按任务类型写真实目标、约束和验证依据；不为了填满字段编造内容；逐任务独立复审后才能批准新规划
- **冻结任务范围调整**：发现原 \`allowedPaths\` 无法覆盖真实 Gate 必需文件，先按 Skill 的 \`release-work-scope-*\` 独立评审并获得 Owner 明确批准，不允许修改未授权路径或取消 Gate
- **架构工件冻结**：数据库 Schema、API 契约或安全策略经过正式评审、提交后，用 \`artifact-stage\` → \`artifact-independent-review\` → Owner \`artifact-approve\` 绑定文件哈希和受控目录；定版后任何变更须新版本复审，\`artifact-check\` / Git check / verify 阻止未批准改动。未经批准的设计草案不能提前标为定版

**Git + Node22 DevControl 工作流（仅在项目实际启用时）**：start_feature/start_bugfix 只提供委托计划，业务方案和整版原子 WorkItem 由 Agent 阅读原始需求、SQLite Feature/决策、代码后自主规划并独立复审；不默认生成 docs/specs 或 ADR/任务 Markdown。**新想法先充分评估，不统一禁止立即纳入，也不统一立即实施**：先分析合理性、替代方案、影响、依赖与排期；符合现有已批准任务目标/文件范围/Gate的合理补充可直接纳入当前已领取任务，超出合同则通过版本变更Review和明确授权后在合理依赖节点执行，idea-capture → Agent idea-assess（采纳/延期/拒绝及合适任务位置）→ 独立 idea-review → Owner 明确授权才 idea-decide(explicitAuthorization=true)；approved_for_planning 不自动生成可执行任务：within_task 必须遵守现有已领取任务合同才可立即落实；需新增工作或调整冻结范围/依赖则走单独整版变更Review和批准；合理但非本期则延期，不合理则拒绝。整版 review/stage，经明确批准才 approve；每次 next/execution-contract/claim 一项。**纯决策**：新任务 type=decision、allowedPaths=[]、requiredGates=[sqlite_decision]，claim 后 decision-save/get → complete/report/verify，不写 Markdown/不为验收强制 Git 提交；已冻结旧决策可显式 decision-save 兼容迁移。**代码任务**：实际测试、check、正常 Git Hook 提交、complete/report/verify。SQLite 决策验证不等于 G2 方案批准/产品发布。History 真正落库，完整 SQLite 只按 Owner 授权的一致性 Git 快照共享，不能提交运行中的 WAL/租约。详见 Skill。

**本地未发布 MCP 版本约束**：Skill、AGENTS.md、runtime.json 与实际运行的包必须统一版本。项目使用本地 local-verify 构建时，runtime.json.localOnly=true，启动器只执行同版本构建；缺失或版本不匹配应立即报错，禁止回退旧 4.x 或等待 npm 下载尚未发布的版本。可设置 MCP_PROBE_LOCAL_ONLY=1 强制本地模式；禁止为了通过 npx 而改低版本号。

${contextLineZh}
${graphLineZh}${historySection(locale)}${memorySection(locale)}`;
  }

  const contextLineEn = contextReady
    ? `Context: before coding read [project-context](${ctxIndex}) (links to \`${layout.modularDir}/\`)`
    : `Context: read [project-context](${ctxIndex}) after Agent creates it (\`init_project_context\` + templates)`;
  const graphLineEn = graphReady
    ? `Graph: read [latest](${graph}) before large changes; refresh \`code_insight\` mode=auto save_to_docs=true`
    : `Graph: read [latest](${graph}) after Agent saves code_insight output (save_to_docs=true)`;

  return `## MCP (call first)
Requires mcp-probe-kit. ${formatAgentsSkillReferenceEn(skillLink)} (Skill file auto-created on first MCP call).

- User says only “continue / start / keep going” → **call \`resume_plan\` first**; pass \`plan_id\` when known, otherwise pass only \`project_root\` to recover the latest active/blocked Plan. Do not explore with Bash, call \`workflow\`, or restart with \`start_*\` until no resumable Plan is confirmed. When recovery returns \`mustContinue=true\`, do not stop after reporting recovery; execute \`nextStep/nextTool\` immediately, call \`plan_heartbeat\` after each step, and continue until blocked, cancelled, or converged
- Unsure which MCP → \`workflow\` (returns a tool-selection guide only; the Agent decides, and clarifies only when needed)
- MCP tools missing from this Agent session → follow the Skill CLI fallback and call \`.mcp-probe-kit/bin/probe.*\`; do not ask the user to install it
- Feature → \`start_feature\` (searches memory first)
- Bug → \`start_bugfix\` (searches memory first)
- UI → \`start_ui\` (searches memory first)
- Unfamiliar code / impact → \`code_insight\` (context / impact / auto)
- Missing context → \`init_project_context\`
- Commit → \`gencommit\`

- **DevControl task quality**: follow \`task-detail-v1\` in the Skill; require relevant, source-backed acceptance and independent review per task, not filler or all-fields checklists
- **Frozen work scope**: if required Gate prerequisites fall outside \`allowedPaths\`, require reviewed \`release-work-scope-*\` amendment and explicit Owner approval; never bypass or weaken the Gate
- **Frozen architecture artifacts**: use independently reviewed, explicitly Owner-approved \`artifact-*\` SHA-256 baselines for schema, protocols and policy files; subsequent edits and new guarded files need approved revisions and must pass staged Git and verify checks

**Git + Node22 DevControl (only when enabled)**: Agent owns decisions, whole-release atomic planning and independent review. **Evaluate new ideas instead of automatically blocking or implementing them**: assess value/alternatives/dependencies/test risk and insertion timing; a beneficial change already covered by the active approved task's original acceptance, file scope and gates may be implemented NOW under its valid claim; otherwise use a reviewed release amendment before new scope/order; idea-capture → agent idea-assess (adopt/defer/reject, target stage/task) → independent idea-review → explicit Owner idea-decide(explicitAuthorization=true) with exact review hash. An approved idea may enter the currently claimed task if and only if its existing contract already permits it; if scope, acceptance or frozen dependencies would change, require a separately reviewed and authorized whole-release amendment. Approval alone never grants write permissions or creates tasks; defer uncertain value and reject unsuitable ideas. start_feature/start_bugfix only return workflows. Store Feature and review in SQLite, review/stage then explicitly approve the release; claim ONE task. For **decision** tasks use type=decision, allowedPaths=[], requiredGates=[sqlite_decision], then decision-save/get → complete/report/verify in SQLite, no mandatory ADR Markdown/Git commit. For **code** tasks use real tests, check, normal Git commit, complete/report/verify. Recorded decisions are not G2 approval. Share SQLite only by Owner-approved consistent snapshots, never live WAL/leases. See Skill.

**Unpublished local MCP versions**: the Skill, AGENTS.md, runtime.json, and running package must agree on the exact version. A project with a matching local-verify build sets runtime.json.localOnly=true; fail fast if the local candidate is missing or mismatched. Never silently downgrade to an older published version or query npm for an unpublished build. MCP_PROBE_LOCAL_ONLY=1 explicitly disables npm fallback.

${contextLineEn}
${graphLineEn}${historySection(locale)}${memorySection(locale)}`;
}

export function generateAgentsMdTemplate(input: AgentsMdTemplateInput): string {
  return generateAgentsMdInner(input);
}
