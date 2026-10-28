import type {
  ToolAnnotations,
  ToolProtocolPolicy,
  ToolSkillRoute,
  ToolTaskPolicy,
  ToolsetType,
} from "./tool-definition.js";
import { MEMORIZE_ASSET_WHEN_TO_CALL } from "../lib/memory-persistence-guidance.js";

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

const CODE_ANALYSIS = "代码分析（独立能力，不管理 DevControl 任务状态）";
const GIT = "Git";
const UI = "UI 独立能力（正式研发流程由 SQLite DevControl 管理）";
const MEMORY = "记忆（需 MEMORY 已配置）";
const HISTORY = "项目 SQLite History（强制开启）";
const INTERACTIVE = "交互";

export const TOOL_CATALOG: readonly ToolCatalogEntry[] = [
  tool({
    name: 'devcontrol',
    title: 'v5 项目研发管理 (SQLite)',
    readOnly: false,
    idempotent: false,
    openWorld: false,
    toolsets: ['core', 'workflow'],
    groupId: 'devcontrol',
    groupTitle: 'SQLite DevControl 项目治理',
    whenToCall: 'v5 唯一需求/Feature/Bug/Idea/计划/任务审批/claim/complete/report/verify 入口。先恢复 History 和项目账本；仅在任务已获 Owner 冻结批准、Agent 独立复核后编码并执行真实 Gate。',
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
    whenToCall: MEMORIZE_ASSET_WHEN_TO_CALL,
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
    name: "history_session_bootstrap",
    title: "初始化/恢复会话历史",
    readOnly: false,
    idempotent: true,
    openWorld: false,
    toolsets: ["workflow"],
    groupId: "history-session",
    groupTitle: HISTORY,
    whenToCall: "新对话开始时**先 bootstrap**（传真实 initial_user_input；无宿主 session 第一次省略 session_key 后保存返回值）；Git/Node22 项目默认使用本地 SQLite hs_*，旧版 docs/history-session/ 文件模式仍支持，返回路径可能是虚拟读取定位符；不要提交活跃历史数据库",
  }),
  tool({
    name: "history_session_checkpoint",
    title: "写入会话检查点",
    readOnly: false,
    idempotent: true,
    openWorld: false,
    toolsets: ["workflow"],
    groupId: "history-session",
    groupTitle: HISTORY,
    whenToCall:
      "每轮最终回复前写入检查点；必须回传 session_key/expected_path + raw_user_input/user_intent；按 Skill 最低清单填 findings/decisions/files_changed/tests/runtime_state/next_actions，禁止空数组交差；旧版文件后端支持软轮转，Node22 SQLite 不需要生成 Markdown 档案",
  }),
  tool({
    name: "history_session_validate",
    title: "校验会话历史",
    readOnly: false,
    idempotent: true,
    openWorld: false,
    toolsets: ["workflow"],
    groupId: "history-session",
    groupTitle: HISTORY,
    whenToCall: "编号缺口、重复 key 或派生状态损坏时校验；`repair=true` 可重建 state/manifest",
  }),
  tool({
    name: "history_session_search",
    title: "搜索会话历史",
    readOnly: true,
    idempotent: true,
    openWorld: false,
    toolsets: ["workflow"],
    groupId: "history-session",
    groupTitle: HISTORY,
    whenToCall: "跨会话需要定位旧档时按关键词搜索；再配合 history_session_read 取原文",
  }),
  tool({
    name: "history_session_read",
    title: "读取会话历史",
    readOnly: true,
    idempotent: true,
    openWorld: false,
    toolsets: ["workflow"],
    groupId: "history-session",
    groupTitle: HISTORY,
    whenToCall: "`history_session_search` 命中后按 number/path **分页读取**无损 Markdown 原文",
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
] as const;

export function getToolCatalogEntry(name: string): ToolCatalogEntry | undefined {
  return TOOL_CATALOG.find((entry) => entry.name === name);
}
