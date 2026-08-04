/**
 * Canonical Skill 的非工具级规则与兼容导出。
 * 工具名称、分组和「何时调用」由 `src/server/tool-catalog.ts` 生成。
 */

import { TOOL_CATALOG } from "../server/tool-catalog.js";

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

/** 意图速查：用户信号 → 第一个应调的 MCP */
export interface McpIntentQuickEntry {
  signal: string;
  firstTool: string;
}

export const MCP_INTENT_QUICK_LOOKUP: McpIntentQuickEntry[] = [
  { signal: "完整交付新功能、功能增强或跨模块能力", firstTool: "start_feature" },
  { signal: "完整修复 Bug，并完成回归、审查和收敛", firstTool: "start_bugfix" },
  { signal: "只做 Bug 根因分析或使用 SRC-8 方法", firstTool: "fix_bug" },
  { signal: "完整交付页面、组件或 UI 交互", firstTool: "start_ui" },
  { signal: "只查 UI 模式或生成设计系统", firstTool: "ui_search / ui_design_system" },
  { signal: "不熟代码、架构、调用链、影响面", firstTool: "code_insight" },
  { signal: "只生成测试策略或测试候选", firstTool: "gentest" },
  { signal: "只审查指定代码或 diff", firstTool: "code_review" },
  { signal: "新项目上手、熟悉仓库", firstTool: "start_onboard" },
  { signal: "产品方案、PRD、原型", firstTool: "start_product" },
  { signal: "长周期自主迭代（Ralph）", firstTool: "start_ralph" },
  { signal: "缺 AGENTS.md / 项目上下文", firstTool: "init_project_context" },
  { signal: "全新空仓库脚手架", firstTool: "init_project" },
  { signal: "写 commit message", firstTool: "gencommit" },
  { signal: "代码评审、安全检查", firstTool: "code_review" },
  { signal: "重构、整理代码", firstTool: "refactor（大改前先 code_insight）" },
  { signal: "估算工时、排期", firstTool: "estimate" },
  { signal: "校验规格是否写全", firstTool: "check_spec" },
  { signal: "查历史踩坑、可复用经验", firstTool: "search_memory" },
  { signal: "需求不清楚、要澄清", firstTool: "ask_user 或 interview" },
  { signal: "工作报告、周报、git 汇总", firstTool: "git_work_report" },
  { signal: "不确定用哪个 MCP", firstTool: "workflow" },
];

/** Agent 调 MCP 前的参数构造纪律。 */
export const MCP_SKILL_ARGUMENT_RULES = [
  "用户只说“继续 / 开始 / 往下做”时，先结合当前对话、已有 Spec 和用户已确认决定，重建完整任务摘要；禁止把短确认语原样传给 `workflow.intent` 或 `start_*.description`。",
  "先判断当前目标是一个明确的单项能力，还是需要完整交付；单项能力直接调用对应工具，完整交付才使用 `start_*`。",
  "完整新功能交付调用 `start_feature`，并传 `description=<完整范围摘要>`、`spec_layout=auto` 和明确的 `project_root`；让编排器决定 flat 或 parent-child。",
  "跨模块、多阶段、大版本或架构升级不得直接调用 `add_feature`；只有布局和 `subspecs` 已明确时，才按 `start_feature` 返回的 plan 调用它。",
  "工具参数必须表达当前任务事实，不要只复制用户最后一条消息；当前项目代码和已落盘 Spec 优先于历史记忆。",
  "只有需要持续状态、跨会话恢复或正式交付的 Delegated Plan 才要求 `plan_heartbeat`；单次只读分析不强制创建 Plan。",
  "拿到托管 Delegated Plan 后首次调用 `plan_heartbeat` 时附完整 plan；每完成、跳过或阻塞步骤后更新检查点。",
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
    label: "新功能",
    chain: "start_feature → plan_heartbeat → add_feature → check_spec（通过）→ 写代码 → gentest → code_review → converge（通过）→ memorize_asset（可选）→ gencommit",
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
    label: "大重构",
    chain: "code_insight（impact）→ refactor → plan_heartbeat → gentest → code_review → converge",
  },
  {
    label: "会话中断后继续",
    chain: "resume_plan → 执行 nextStepId → plan_heartbeat → 最终 converge",
  },
] as const;

export const MCP_SKILL_AVOID_RULES = [
  "有对应 MCP 却**直接大段写实现**",
  "把 `workflow` 当作所有任务的强制入口",
  "把 `start_*` 当作所有原子能力的上级，导致单项分析也被强制套入完整流程",
  "把用户的“继续 / 开始 / 往下做”原样当作 `workflow.intent` 或 `start_feature.description`",
  "大型跨模块需求绕过 `start_feature` 直接手写单体 Spec",
  "`check_spec` **未通过**就写功能代码",
  "长流程执行步骤后**不** `plan_heartbeat`，导致中断后无法恢复",
  "托管交付流程在 `converge` 未通过时就把候选经验正式写入 `memorize_asset`",
  "`delete_memory_asset` 不带 `confirm: true`",
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
