/**
 * Canonical Skill 的非工具级规则与兼容导出。
 * 工具名称、分组和「何时调用」由 `src/server/tool-catalog.ts` 生成。
 */

import { TOOL_CATALOG } from "../server/tool-catalog.js";
import {
  WORKFLOW_SELECTION_GUIDE,
  type WorkflowSelectionGuideEntry,
} from "./workflow-selection-guide.js";

export interface McpToolSkillEntry {
  name: string;
  /** Skill 表格「何时调用」列（中文） */
  whenToCall: string;
}

export interface McpToolSkillGroup {
  id: string;
  title: string;
  note?: string;
  tools: McpToolSkillEntry[];
}

/** Agent 工具选择速查；用于 Skill/AGENTS/workflow 兜底指南，不做文本分类。 */
export type McpIntentQuickEntry = WorkflowSelectionGuideEntry;
export const MCP_INTENT_QUICK_LOOKUP: McpIntentQuickEntry[] = WORKFLOW_SELECTION_GUIDE;

/** Agent 调 MCP 前的参数构造纪律。 */
export const MCP_SKILL_ARGUMENT_RULES = [
  "用户只说“继续 / 开始 / 往下做”且存在最近的 Delegated Plan 或已知 plan_id 时，直接调用 `resume_plan` 恢复检查点并从 nextStepId 继续；`mustContinue=true` 时禁止只汇报恢复结果，必须立即执行 nextStep/nextTool 并逐步 heartbeat；plan_id 丢失时只传 project_root，由工具自动选择最近的 active/blocked Plan；只有不存在可恢复 Plan 时，才结合当前对话、已有 Spec 和用户已确认决定下一工具。不要先调用 `workflow` 做意图识别。",
  "先判断当前目标是一个明确的单项能力，还是需要完整交付；单项能力直接调用对应工具，完整交付才使用 `start_*`。",
  "用户在开发途中表达的建议、新思路、不同技术选型默认是**候选而非立即执行命令**。先用 DevControl idea-capture 存入 SQLite，宿主 Agent 阅读产品目标/历史/真实代码与冻结工作项独立评估合理性、替代方案、依赖、风险、回归和插入时机，再 idea-assess → 不同审核标签的 idea-review → 用户明确授权 idea-decide(explicitAuthorization=true)。approved_for_planning 仅表示可另行发起全版变更 Review；不得直接改冻结任务/抢跑代码，不要把MCP结构检查误认为产品价值判断。用户明确指示的当前已批准任务仍按现有 execution-contract 执行，无需每句话都建立 idea。",
  "完整功能交付调用 `start_feature`，传真实项目根与完整范围摘要；它只返回委托工作流模板，业务需求澄清、技术决策和拆分始终由 Agent 负责。Git/Node22 DevControl 项目使用 SQLite Feature 与完整版本原子任务，不要求生成 Spec Markdown；显式 legacy files 模式才考虑 flat/parent-child Spec。",
  "跨模块、多阶段、大版本或架构升级由 Agent 从 PRD/ADR/代码规划整版一行一事 WorkItem，独立 Review 后交给 DevControl 审批；不要强制调用 `add_feature` 生成文件树。只有项目已显式选择 legacy files 模式且需求已明确时，才按返回的 plan 使用文件 Spec 工具。",
  "工具参数必须表达当前任务事实，不要只复制用户最后一条消息；当前项目代码和已落盘 Spec 优先于历史记忆。",
  "只有需要持续状态、跨会话恢复或正式交付的 Delegated Plan 才要求 `plan_heartbeat`；单次只读分析不强制创建 Plan。",
  "拿到托管 Delegated Plan 后首次调用 `plan_heartbeat` 时附完整 plan；每完成、跳过或阻塞步骤后更新检查点。",
  "History Session 默认开启：新对话先 `history_session_bootstrap`（传 `initial_user_input`；无宿主 session 可不传 `session_key`，落到项目当前档）；每轮最终回复前 `history_session_checkpoint`（回传 `session_key`/`expected_path`，必须带 `raw_user_input`）。检查点须按 Skill「最低填写清单」写满 findings/decisions/files_changed/tests/runtime_state/next_actions，禁止空数组交差。精确旧上下文用 `history_session_search` → `history_session_read`，不要把全量历史塞进 bootstrap。",
] as const;

export const MCP_TOOL_SKILL_GROUPS: McpToolSkillGroup[] = (() => {
  const groups = new Map<string, McpToolSkillGroup>();

  for (const entry of TOOL_CATALOG) {
    const { groupId, groupTitle, whenToCall } = entry.skillRoute;
    const group = groups.get(groupId) ?? {
      id: groupId,
      title: groupTitle,
      tools: [],
    };
    group.tools.push({ name: entry.name, whenToCall });
    groups.set(groupId, group);
  }

  return [...groups.values()];
})();

export const MCP_SKILL_COMMON_FLOWS = [
  {
    label: "开发中收到新想法",
    chain: "分析意图（是讨论/候选/明确执行授权）→ idea-capture(候选) → Agent独立影响评估 idea-assess → idea-review(真实任务锚点/4维) → Owner明确授权才 idea-decide(true) → 后续单独全版变更评审；不改现有冻结计划/任务顺序",
  },
  {
    label: "新功能",
    chain: "Git/Node22 DevControl: start_feature → Agent完整版本规划 → feature-save/validate → release-work-review/stage → 整版批准 → next/execution-contract/claim单任务 → 真实测试/check/commit/complete/report/verify → converge；legacy files 模式另行采用 add_feature/check_spec",
  },
  {
    label: "完整修 Bug",
    chain: "start_bugfix（编排并展开 fix_bug / SRC-8）→ plan_heartbeat → 改代码 → gentest → 跑测试 → code_review → converge（通过）→ memorize_asset（成功或负面记忆）",
  },
  {
    label: "只做根因分析",
    chain: "fix_bug；不要求先 start_bugfix，不要求建立完整 Plan",
  },
  {
    label: "只理解代码",
    chain: "code_insight；若后续转为完整交付，再进入对应 start_*",
  },
  {
    label: "只设计测试",
    chain: "gentest；测试候选生成后仍需由 Agent 真实落盘和执行",
  },
  {
    label: "独立架构工作",
    chain: "architecture assess → architecture design（按需）→ validate / drift；不要求先 start_*",
  },
  {
    label: "大重构",
    chain: "code_insight（impact）→ refactor → plan_heartbeat → gentest → code_review → converge",
  },
  {
    label: "会话中断后继续",
    chain: "resume_plan → 执行 nextStepId → plan_heartbeat → 最终 converge",
  },
  {
    label: "会话历史交接",
    chain: "history_session_bootstrap → …工作… → history_session_checkpoint；跨会话 search → read",
  },
] as const;

export const MCP_SKILL_AVOID_RULES = [
  "把用户随口提出的技术建议/产品灵感立刻当作已批准的开发指令，跳过替代方案、依赖/安全/测试影响评估和独立 Review，直接修改冻结任务或改变正在执行的单工作项",
  "有对应 MCP 却**直接大段写实现**",
  "把 `workflow` 当作所有任务的强制入口",
  "把 `start_*` 当作所有原子能力的上级，导致单项分析也被强制套入完整流程",
  "把用户的“继续 / 开始 / 往下做”交给 `workflow` 做意图识别，或原样当作 `start_feature.description`",
  "Git/Node22 DevControl 项目未经 Agent 整版规划和复审、未经明确批准就绕过 SQLite ReleaseWorkPlan 直接开始实现；显式 legacy files 项目则不得把大型跨模块需求写成单体 Spec",
  "`check_spec` **未通过**就写功能代码",
  "长流程执行步骤后**不** `plan_heartbeat`，导致中断后无法恢复",
  "托管交付流程在 `converge` 未通过时就把候选经验正式写入 `memorize_asset`",
  "`delete_memory_asset` 不带 `confirm: true`",
  "History 开启时跳过 `history_session_bootstrap` / 最终回复前不 `history_session_checkpoint`",
  "自行编造 `session_key`（只回传服务器铸出的 handle；漏传会开新档而不是合并）",
  "把 History Session 当成 Memory/Qdrant；跨仓库可复用经验仍走 `search_memory` / `memorize_asset`",
  "忽略 bootstrap/轮转后返回的新 `expected_path`，继续用旧路径 checkpoint",
  "`history_session_checkpoint` 只填空数组或省略 `raw_user_input`/`user_intent`/`next_actions`（不满足最低填写清单）",
] as const;

export function listMcpToolSkillRegistryNames(): string[] {
  return MCP_TOOL_SKILL_GROUPS.flatMap((group) => group.tools.map((tool) => tool.name));
}

export function validateMcpToolSkillRegistry(registeredToolNames: string[]): {
  ok: boolean;
  missingInRegistry: string[];
  extraInRegistry: string[];
  duplicateInRegistry: string[];
} {
  const registryNames = listMcpToolSkillRegistryNames();
  const registered = new Set(registeredToolNames);
  const registrySet = new Set(registryNames);

  const duplicates = registryNames.filter(
    (name, index) => registryNames.indexOf(name) !== index
  );

  const missingInRegistry = registeredToolNames.filter((name) => !registrySet.has(name));
  const extraInRegistry = registryNames.filter((name) => !registered.has(name));

  return {
    ok:
      missingInRegistry.length === 0 &&
      extraInRegistry.length === 0 &&
      duplicates.length === 0,
    missingInRegistry,
    extraInRegistry,
    duplicateInRegistry: [...new Set(duplicates)],
  };
}

export function formatSkillRegistryMismatchMessage(result: ReturnType<typeof validateMcpToolSkillRegistry>): string {
  const lines = [
    "MCP Skill 注册表与 allToolSchemas 不一致。",
    "增删工具时请同步更新 src/lib/mcp-tool-skill-registry.ts",
    "",
  ];

  if (result.missingInRegistry.length > 0) {
    lines.push(`注册表缺少（已注册 MCP 工具但未写 whenToCall）: ${result.missingInRegistry.join(", ")}`);
  }
  if (result.extraInRegistry.length > 0) {
    lines.push(`注册表多余（工具已删但注册表未清）: ${result.extraInRegistry.join(", ")}`);
  }
  if (result.duplicateInRegistry.length > 0) {
    lines.push(`注册表重复: ${result.duplicateInRegistry.join(", ")}`);
  }

  return lines.join("\n");
}
