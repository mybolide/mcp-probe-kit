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

const ORCHESTRATION = "完整交付编排 `start_*`（按需使用）";
const ROUTING = "可选首工具路由";
const PROJECT_SPEC = "项目与规格";
const CODE_ANALYSIS = "代码分析（可直接调，不必等 start_*）";
const GIT = "Git";
const UI = "UI 独立能力（可直接调用，也可由 `start_ui` 组合）";
const MEMORY = "记忆（需 MEMORY 已配置）";
const INTERACTIVE = "交互";
const PLAN = "长任务状态、恢复与正式收敛（按需）";

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
      "需要从需求、规格、实施、测试、审查到收敛完成**完整新功能交付**时使用；先把当前对话确认的完整范围汇总到 description，默认 `spec_layout=auto`，复杂多模块需求使用 parent-child；仅做规格、影响分析或测试时可直接调用对应能力",
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
    whenToCall:
      "需要从现象、SRC-8 真因、修复、回归、审查到收敛完成**完整 Bug 交付**时使用；只做根因分析时直接调用 `fix_bug`",
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
    whenToCall:
      "需要从视觉方向、页面结构、实现、桌面/移动验收到正式收敛完成**完整 UI 交付**时使用；只查模式或生成设计系统时直接调用 UI 能力",
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
    whenToCall: "需要**有界多轮迭代**、每轮 Heartbeat/测试/Diff 证据和最终 Converge 的完整长任务时；不用于后台无人值守循环",
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
      "Agent 阅读 Skill 后仍**不确定第一个工具**时使用；返回建议，不执行工具、不维护任务生命周期。intent 必须是完整任务摘要",
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
    name: "architecture",
    title: "ARC-8 架构推理与变更",
    readOnly: true,
    idempotent: false,
    openWorld: true,
    autoTask: true,
    toolsets: ["core", "workflow"],
    groupId: "code-analysis",
    groupTitle: CODE_ANALYSIS,
    whenToCall:
      "需要评估或设计模块边界、依赖方向、数据所有权、公共契约、迁移回滚或实施漂移时直接调用；支持 `assess|design|validate|drift`，完整功能、Bug 和重构流程只按需组合它",
  }),
  tool({
    name: "fix_bug",
    title: "SRC-8 Bug 根因分析",
    readOnly: true,
    idempotent: true,
    openWorld: false,
    toolsets: ["core", "workflow"],
    groupId: "code-analysis",
    groupTitle: CODE_ANALYSIS,
    whenToCall:
      "需要独立执行 **SRC-8 根因分析与修复方法**时直接调用；完整 Bug 交付中由 `start_bugfix` 编排或展开同一方法核心",
  }),
  tool({
    name: "gentest",
    title: "测试设计与候选",
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
    whenToCall: "用户要审查指定代码、真实 Git diff，或核验 Plan 声明范围、测试、公共契约、架构漂移与当前 revision 是否一致",
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
    whenToCall: "主动查**历史经验**；默认只返回 active，审计失效记录时显式 `include_inactive=true`，并结合 ranking 解释核对证据与适用边界",
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
    whenToCall:
      "托管交付流程在 **converge passed=true** 后沉淀 MemoryCandidate；用户明确进行独立记忆管理时也可直接调用。默认拒绝同身份冲突，确认替代时用 `conflict_policy=supersede`，确需并行结论时显式 `allow_parallel`",
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
    whenToCall: "修正已有记忆、撤回错误结论或建立 supersede 关系；历史关系不可清除，retracted/负面结论必须保留 evidence",
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
    whenToCall: "硬删除未关联的错误/重复/无价值资产（需 `confirm: true`）；参与 supersede 链的资产只能用 update_memory_asset 撤回",
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
    whenToCall:
      "执行需要持续状态、跨会话恢复或正式交付的 Delegated Plan 时记录步骤、证据、作用域、产物、候选、验收结果、运行证据和 revision；首次调用附完整 plan，单次只读能力不强制使用",
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
    whenToCall:
      "托管交付实现与验证完成后，按 Plan 自己声明的 requiredEvidenceKinds（例如需求、测试、审查）、qualityGates、步骤和未决项进行收敛；通过后才允许该流程正式沉淀记忆。单次只读分析和独立记忆管理不强制进入收敛",
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
