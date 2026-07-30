import type {
  ToolAnnotations,
  ToolProtocolPolicy,
  ToolSkillRoute,
  ToolTaskPolicy,
  ToolsetType,
} from "./tool-definition.js";

export interface ToolCatalogEntry {
  name: string;
  annotations: ToolAnnotations;
  toolsets: Exclude<ToolsetType, "full">[];
  taskPolicy: ToolTaskPolicy;
  protocolPolicy: ToolProtocolPolicy;
  skillRoute: ToolSkillRoute;
}

interface CatalogOptions {
  name: string;
  title: string;
  readOnly: boolean;
  idempotent: boolean;
  openWorld: boolean;
  destructive?: boolean;
  toolsets?: Exclude<ToolsetType, "full">[];
  autoTask?: boolean;
  groupId: string;
  groupTitle: string;
  whenToCall: string;
}

function tool(options: CatalogOptions): ToolCatalogEntry {
  return {
    name: options.name,
    annotations: {
      title: options.title,
      readOnlyHint: options.readOnly,
      ...(options.readOnly ? {} : { destructiveHint: options.destructive ?? false }),
      idempotentHint: options.idempotent,
      openWorldHint: options.openWorld,
    },
    toolsets: options.toolsets ?? [],
    taskPolicy: {
      explicitRequest: true,
      autoEscalate: options.autoTask ?? false,
      synchronousFallback: true,
    },
    protocolPolicy: {
      legacy: true,
      modern: true,
    },
    skillRoute: {
      groupId: options.groupId,
      groupTitle: options.groupTitle,
      whenToCall: options.whenToCall,
    },
  };
}

const ORCHESTRATION = "编排入口 `start_*`（复杂任务的第一步）";
const ROUTING = "路由";
const PROJECT_SPEC = "项目与规格";
const CODE_ANALYSIS = "代码分析（可直接调，不必等 start_*）";
const GIT = "Git";
const UI = "UI 子工具（通常由 `start_ui` 串联）";
const MEMORY = "记忆（需 MEMORY 已配置）";
const INTERACTIVE = "交互";
const PLAN = "计划状态、恢复与收敛";

export const TOOL_CATALOG: readonly ToolCatalogEntry[] = [
  tool({
    name: "start_feature",
    title: "新功能开发编排",
    readOnly: true,
    idempotent: false,
    openWorld: true,
    toolsets: ["workflow"],
    groupId: "orchestration",
    groupTitle: ORCHESTRATION,
    whenToCall:
      "任何**新功能 / 增强 / 大版本升级**的首选入口；先把当前对话已确认的完整范围汇总到 description，默认 `spec_layout=auto`，复杂多模块需求先拆 parent-child 子规格，再指引 `add_feature` → `check_spec` → 实现",
  }),
  tool({
    name: "start_bugfix",
    title: "Bug 修复编排",
    readOnly: true,
    idempotent: false,
    openWorld: true,
    toolsets: ["workflow"],
    groupId: "orchestration",
    groupTitle: ORCHESTRATION,
    whenToCall: "任何 **Bug / 报错**；指引 `fix_bug`（真因）→ `gentest` → 测试",
  }),
  tool({
    name: "start_ui",
    title: "UI 开发编排",
    readOnly: true,
    idempotent: false,
    openWorld: true,
    toolsets: ["ui", "workflow"],
    groupId: "orchestration",
    groupTitle: ORCHESTRATION,
    whenToCall: "任何 **UI / 页面 / 组件**；指引设计系统、模板检索、实现约束",
  }),
  tool({
    name: "start_onboard",
    title: "项目上手编排",
    readOnly: true,
    idempotent: false,
    openWorld: true,
    toolsets: ["workflow"],
    groupId: "orchestration",
    groupTitle: ORCHESTRATION,
    whenToCall: "**新成员 / 新仓库**快速建立心智模型",
  }),
  tool({
    name: "start_product",
    title: "产品设计编排",
    readOnly: true,
    idempotent: true,
    openWorld: false,
    toolsets: ["workflow"],
    groupId: "orchestration",
    groupTitle: ORCHESTRATION,
    whenToCall: "从 0 做**产品方案**（PRD、原型思路）",
  }),
  tool({
    name: "start_ralph",
    title: "Ralph 循环开发编排",
    readOnly: true,
    idempotent: true,
    openWorld: false,
    toolsets: ["workflow"],
    groupId: "orchestration",
    groupTitle: ORCHESTRATION,
    whenToCall: "需要**多轮自主迭代**、长任务循环时",
  }),
  tool({
    name: "workflow",
    title: "开发工作流路由",
    readOnly: true,
    idempotent: true,
    openWorld: false,
    toolsets: ["core", "workflow"],
    groupId: "routing",
    groupTitle: ROUTING,
    whenToCall:
      "**不确定**该用哪个 MCP；或担心 Agent 跳过 MCP 直接写代码时。intent 必须是完整任务摘要，不是“继续/开始”等最后一句",
  }),
  tool({
    name: "init_project_context",
    title: "生成项目上下文",
    readOnly: false,
    idempotent: true,
    openWorld: false,
    toolsets: ["core", "workflow"],
    groupId: "project-spec",
    groupTitle: PROJECT_SPEC,
    whenToCall: "没有 **AGENTS.md**、`docs/project-context/`、图谱索引；大改前缺上下文",
  }),
  tool({
    name: "init_project",
    title: "初始化项目",
    readOnly: false,
    idempotent: true,
    openWorld: false,
    toolsets: ["core", "workflow"],
    groupId: "project-spec",
    groupTitle: PROJECT_SPEC,
    whenToCall: "**空目录**需要初始化项目结构",
  }),
  tool({
    name: "add_feature",
    title: "生成功能规格模板",
    readOnly: true,
    idempotent: true,
    openWorld: false,
    toolsets: ["core", "workflow"],
    groupId: "project-spec",
    groupTitle: PROJECT_SPEC,
    whenToCall:
      "仅在规格布局已确定时生成 `docs/specs/<feature>/`；复杂需求不得把它当首个入口，通常由 `start_feature` 的 plan 触发",
  }),
  tool({
    name: "check_spec",
    title: "规格完整性校验",
    readOnly: true,
    idempotent: true,
    openWorld: false,
    toolsets: ["core", "workflow"],
    groupId: "project-spec",
    groupTitle: PROJECT_SPEC,
    whenToCall: "规格写完后、**写实现代码前**；或 Bug 修完要过规格闸门",
  }),
  tool({
    name: "estimate",
    title: "工作量估算",
    readOnly: true,
    idempotent: true,
    openWorld: false,
    toolsets: ["core", "workflow"],
    groupId: "project-spec",
    groupTitle: PROJECT_SPEC,
    whenToCall: "需要**故事点 / 工时 / 风险**评估（通常在 `add_feature` 之后）",
  }),
  tool({
    name: "code_insight",
    title: "代码图谱洞察",
    readOnly: true,
    idempotent: false,
    openWorld: true,
    autoTask: true,
    toolsets: ["core", "workflow"],
    groupId: "code-analysis",
    groupTitle: CODE_ANALYSIS,
    whenToCall:
      "读不懂代码、找入口、看**调用链 / 影响面**；大重构前；`mode=impact` 评估改动范围",
  }),
  tool({
    name: "fix_bug",
    title: "Bug 真因分析指南",
    readOnly: true,
    idempotent: true,
    openWorld: false,
    toolsets: ["core", "workflow"],
    groupId: "code-analysis",
    groupTitle: CODE_ANALYSIS,
    whenToCall: "需要 **TBP 真因分析**指南（通常由 `start_bugfix` 触发）",
  }),
  tool({
    name: "gentest",
    title: "生成测试",
    readOnly: true,
    idempotent: true,
    openWorld: false,
    toolsets: ["core", "workflow"],
    groupId: "code-analysis",
    groupTitle: CODE_ANALYSIS,
    whenToCall: "需要**补测试 / 回归用例**（Bug 修复后、功能完成后）",
  }),
  tool({
    name: "code_review",
    title: "代码审查",
    readOnly: true,
    idempotent: true,
    openWorld: false,
    toolsets: ["core", "workflow"],
    groupId: "code-analysis",
    groupTitle: CODE_ANALYSIS,
    whenToCall: "用户要**审查**指定文件或 diff（含安全项）",
  }),
  tool({
    name: "refactor",
    title: "重构建议",
    readOnly: true,
    idempotent: true,
    openWorld: false,
    toolsets: ["core", "workflow"],
    groupId: "code-analysis",
    groupTitle: CODE_ANALYSIS,
    whenToCall: "需要**分步重构计划**；范围大时先 `code_insight`",
  }),
  tool({
    name: "gencommit",
    title: "生成提交信息",
    readOnly: true,
    idempotent: true,
    openWorld: false,
    toolsets: ["core", "workflow"],
    groupId: "git",
    groupTitle: GIT,
    whenToCall: "变更完成，需要**规范 commit message**",
  }),
  tool({
    name: "git_work_report",
    title: "Git 工作报告指南",
    readOnly: true,
    idempotent: true,
    openWorld: false,
    groupId: "git",
    groupTitle: GIT,
    whenToCall: "需要基于 git 历史的**工作报告 / 周报**",
  }),
  tool({
    name: "ui_design_system",
    title: "生成设计系统",
    readOnly: true,
    idempotent: true,
    openWorld: false,
    toolsets: ["ui", "workflow"],
    groupId: "ui",
    groupTitle: UI,
    whenToCall: "需要**设计 token / 组件规范**",
  }),
  tool({
    name: "ui_search",
    title: "搜索 UI/UX 数据",
    readOnly: true,
    idempotent: true,
    openWorld: false,
    toolsets: ["ui", "workflow"],
    groupId: "ui",
    groupTitle: UI,
    whenToCall: "需要搜 **UI/UX 模板、模式**",
  }),
  tool({
    name: "sync_ui_data",
    title: "同步 UI 数据",
    readOnly: false,
    idempotent: true,
    openWorld: true,
    toolsets: ["ui", "workflow"],
    groupId: "ui",
    groupTitle: UI,
    whenToCall: "UI 内嵌数据过期，需要**同步缓存**",
  }),
  tool({
    name: "search_memory",
    title: "检索共享记忆",
    readOnly: true,
    idempotent: false,
    openWorld: true,
    toolsets: ["workflow"],
    groupId: "memory",
    groupTitle: MEMORY,
    whenToCall: "主动查**历史经验**；`start_*` 未覆盖时补查",
  }),
  tool({
    name: "read_memory_asset",
    title: "读取记忆资产",
    readOnly: true,
    idempotent: true,
    openWorld: true,
    toolsets: ["workflow"],
    groupId: "memory",
    groupTitle: MEMORY,
    whenToCall: "`search_memory` 命中后需要**读全文**",
  }),
  tool({
    name: "memorize_asset",
    title: "沉淀记忆资产",
    readOnly: false,
    idempotent: true,
    openWorld: true,
    toolsets: ["workflow"],
    groupId: "memory",
    groupTitle: MEMORY,
    whenToCall: "已有已验证 MemoryCandidate，且 **converge passed=true** 后正式沉淀成功或负面经验",
  }),
  tool({
    name: "update_memory_asset",
    title: "更新记忆资产",
    readOnly: false,
    idempotent: true,
    openWorld: true,
    toolsets: ["workflow"],
    groupId: "memory",
    groupTitle: MEMORY,
    whenToCall: "修正已有记忆条目",
  }),
  tool({
    name: "delete_memory_asset",
    title: "删除记忆资产",
    readOnly: false,
    destructive: true,
    idempotent: true,
    openWorld: true,
    toolsets: ["workflow"],
    groupId: "memory",
    groupTitle: MEMORY,
    whenToCall: "删除错误记忆（需 `confirm: true`）",
  }),
  tool({
    name: "scan_and_extract_patterns",
    title: "扫描并提取模式",
    readOnly: true,
    idempotent: true,
    openWorld: false,
    autoTask: true,
    toolsets: ["workflow"],
    groupId: "memory",
    groupTitle: MEMORY,
    whenToCall: "从代码库**批量提取**可复用模式并建议沉淀",
  }),
  tool({
    name: "plan_heartbeat",
    title: "记录计划检查点",
    readOnly: false,
    idempotent: true,
    openWorld: false,
    toolsets: ["workflow"],
    groupId: "plan-control",
    groupTitle: PLAN,
    whenToCall: "执行 Delegated Plan 后记录完成步骤、证据、未决事项和 revision；首次调用附完整 plan",
  }),
  tool({
    name: "resume_plan",
    title: "恢复计划",
    readOnly: true,
    idempotent: true,
    openWorld: false,
    toolsets: ["workflow"],
    groupId: "plan-control",
    groupTitle: PLAN,
    whenToCall: "会话中断、重启或切换 Agent 后，按 plan_id 恢复下一可执行步骤",
  }),
  tool({
    name: "converge",
    title: "计划收敛闸门",
    readOnly: false,
    idempotent: true,
    openWorld: false,
    toolsets: ["workflow"],
    groupId: "plan-control",
    groupTitle: PLAN,
    whenToCall: "实现与验证完成后，检查需求/规格/实现/测试/审查证据；通过后才正式沉淀记忆",
  }),
  tool({
    name: "ask_user",
    title: "向用户提问",
    readOnly: true,
    idempotent: true,
    openWorld: false,
    toolsets: ["workflow"],
    groupId: "interactive",
    groupTitle: INTERACTIVE,
    whenToCall: "目标模糊、缺关键信息，需要**向用户提问**",
  }),
  tool({
    name: "interview",
    title: "需求访谈",
    readOnly: true,
    idempotent: true,
    openWorld: false,
    toolsets: ["workflow"],
    groupId: "interactive",
    groupTitle: INTERACTIVE,
    whenToCall: "需要结构化**需求访谈**",
  }),
] as const;

export function getToolCatalogEntry(name: string): ToolCatalogEntry | undefined {
  return TOOL_CATALOG.find((entry) => entry.name === name);
}
