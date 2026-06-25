/**
 * MCP 工具「何时调用」注册表 — Skill 模板唯一真相源。
 *
 * **增删改工具时必同步本文件**（`npm run verify-workflow-skill` / prebuild 会校验）。
 * 与 `src/schemas/*` 的 `allToolSchemas` 工具名必须一一对应。
 */

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
  { signal: "新功能、加模块、做需求", firstTool: "start_feature" },
  { signal: "Bug、报错、异常、排查、不生效", firstTool: "start_bugfix" },
  { signal: "页面、组件、样式、UI、交互", firstTool: "start_ui" },
  { signal: "不熟代码、架构、调用链、影响面", firstTool: "code_insight" },
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

export const MCP_TOOL_SKILL_GROUPS: McpToolSkillGroup[] = [
  {
    id: "orchestration",
    title: "编排入口 `start_*`（复杂任务的第一步）",
    tools: [
      {
        name: "start_feature",
        whenToCall:
          "任何**新功能 / 增强**；会先搜记忆，再指引 `add_feature` → `check_spec` → 实现",
      },
      {
        name: "start_bugfix",
        whenToCall: "任何 **Bug / 报错**；指引 `fix_bug`（真因）→ `gentest` → 测试",
      },
      {
        name: "start_ui",
        whenToCall: "任何 **UI / 页面 / 组件**；指引设计系统、模板检索、实现约束",
      },
      {
        name: "start_onboard",
        whenToCall: "**新成员 / 新仓库**快速建立心智模型",
      },
      {
        name: "start_product",
        whenToCall: "从 0 做**产品方案**（PRD、原型思路）",
      },
      {
        name: "start_ralph",
        whenToCall: "需要**多轮自主迭代**、长任务循环时",
      },
    ],
  },
  {
    id: "routing",
    title: "路由",
    tools: [
      {
        name: "workflow",
        whenToCall: "**不确定**该用哪个 MCP；或担心 Agent 跳过 MCP 直接写代码时",
      },
    ],
  },
  {
    id: "project-spec",
    title: "项目与规格",
    tools: [
      {
        name: "init_project_context",
        whenToCall:
          "没有 **AGENTS.md**、`docs/project-context/`、图谱索引；大改前缺上下文",
      },
      {
        name: "init_project",
        whenToCall: "**空目录**需要初始化项目结构",
      },
      {
        name: "add_feature",
        whenToCall: "需要生成 `docs/specs/<feature>/` 规格（通常由 `start_feature` 触发）",
      },
      {
        name: "check_spec",
        whenToCall: "规格写完后、**写实现代码前**；或 Bug 修完要过规格闸门",
      },
      {
        name: "estimate",
        whenToCall: "需要**故事点 / 工时 / 风险**评估（通常在 `add_feature` 之后）",
      },
    ],
  },
  {
    id: "code-analysis",
    title: "代码分析（可直接调，不必等 start_*）",
    tools: [
      {
        name: "code_insight",
        whenToCall:
          "读不懂代码、找入口、看**调用链 / 影响面**；大重构前；`mode=impact` 评估改动范围",
      },
      {
        name: "fix_bug",
        whenToCall: "需要 **TBP 真因分析**指南（通常由 `start_bugfix` 触发）",
      },
      {
        name: "gentest",
        whenToCall: "需要**补测试 / 回归用例**（Bug 修复后、功能完成后）",
      },
      {
        name: "code_review",
        whenToCall: "用户要**审查**指定文件或 diff（含安全项）",
      },
      {
        name: "refactor",
        whenToCall: "需要**分步重构计划**；范围大时先 `code_insight`",
      },
    ],
  },
  {
    id: "git",
    title: "Git",
    tools: [
      {
        name: "gencommit",
        whenToCall: "变更完成，需要**规范 commit message**",
      },
      {
        name: "git_work_report",
        whenToCall: "需要基于 git 历史的**工作报告 / 周报**",
      },
    ],
  },
  {
    id: "ui",
    title: "UI 子工具（通常由 `start_ui` 串联）",
    tools: [
      {
        name: "ui_design_system",
        whenToCall: "需要**设计 token / 组件规范**",
      },
      {
        name: "ui_search",
        whenToCall: "需要搜 **UI/UX 模板、模式**",
      },
      {
        name: "sync_ui_data",
        whenToCall: "UI 内嵌数据过期，需要**同步缓存**",
      },
    ],
  },
  {
    id: "memory",
    title: "记忆（需 MEMORY 已配置）",
    tools: [
      {
        name: "search_memory",
        whenToCall: "主动查**历史经验**；`start_*` 未覆盖时补查",
      },
      {
        name: "read_memory_asset",
        whenToCall: "`search_memory` 命中后需要**读全文**",
      },
      {
        name: "memorize_asset",
        whenToCall: "Bug **验证通过**后沉淀；有可复用 pattern/component",
      },
      {
        name: "update_memory_asset",
        whenToCall: "修正已有记忆条目",
      },
      {
        name: "delete_memory_asset",
        whenToCall: "删除错误记忆（需 `confirm: true`）",
      },
      {
        name: "scan_and_extract_patterns",
        whenToCall: "从代码库**批量提取**可复用模式并建议沉淀",
      },
    ],
  },
  {
    id: "interactive",
    title: "交互",
    tools: [
      {
        name: "ask_user",
        whenToCall: "目标模糊、缺关键信息，需要**向用户提问**",
      },
      {
        name: "interview",
        whenToCall: "需要结构化**需求访谈**",
      },
    ],
  },
];

export const MCP_SKILL_COMMON_FLOWS = [
  {
    label: "新功能",
    chain: "start_feature → add_feature → check_spec（通过）→ 写代码 → gentest → gencommit",
  },
  {
    label: "修 Bug",
    chain: "start_bugfix → fix_bug → 改代码 → gentest → 跑测试 → memorize_asset（type=bugfix）",
  },
  {
    label: "不熟代码",
    chain: "code_insight → 再 start_feature / start_bugfix",
  },
  {
    label: "大重构",
    chain: "code_insight（impact）→ refactor → gentest → code_review",
  },
] as const;

export const MCP_SKILL_AVOID_RULES = [
  "有对应 MCP 却**直接大段写实现**",
  "`check_spec` **未通过**就写功能代码",
  "Bug 修完**不** `memorize_asset`",
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
