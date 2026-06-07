/**
 * 工具注解（MCP Tool Annotations）集中映射
 *
 * 注解是给客户端的「提示」（非安全保证）：客户端据此决定是否自动放行、是否提示用户等。
 * - readOnlyHint:    工具不改动其环境（不写用户源码/项目状态）
 * - idempotentHint:  相同入参重复调用无额外副作用
 * - destructiveHint: 可能做破坏性更新（仅在非只读时有意义）
 * - openWorldHint:   会与外部实体交互（HTTP/外部进程），结果可能非确定
 *
 * 分类：
 *  - 只读指南型：仅基于输入/内嵌数据计算并返回指南/计划，不碰用户源码、不触外部
 *  - 只读+openWorld：查 Qdrant / 跑 gitnexus 分析 / 结果随仓库或外部变化
 *  - 写型：落盘 / 写记忆 / 写缓存（均为非破坏性追加，destructive=false）
 */

export interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export const TOOL_ANNOTATIONS: Record<string, ToolAnnotations> = {
  // —— 只读指南型（可安全自动放行）——
  init_project: { title: '初始化项目', readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  gencommit: { title: '生成提交信息', readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  code_review: { title: '代码审查', readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  gentest: { title: '生成测试', readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  refactor: { title: '重构建议', readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  fix_bug: { title: 'Bug 真因分析指南', readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  add_feature: { title: '生成功能规格模板', readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  estimate: { title: '工作量估算', readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  check_spec: { title: '规格完整性校验', readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  interview: { title: '需求访谈', readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  ask_user: { title: '向用户提问', readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  git_work_report: { title: 'Git 工作报告指南', readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  ui_design_system: { title: '生成设计系统', readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  ui_search: { title: '搜索 UI/UX 数据', readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  start_product: { title: '产品设计编排', readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  // 返回脚本/文件内容 + delegated plan，由 Agent 落盘 .ralph/——工具自身不写
  start_ralph: { title: 'Ralph 循环开发编排', readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  // 只读扫描本地代码、返回候选模式；不写记忆（存储是 memorize_asset 的事）
  scan_and_extract_patterns: { title: '扫描并提取模式', readOnlyHint: true, idempotentHint: true, openWorldHint: false },

  // —— 只读 + 触外部 / 非确定 ——
  search_memory: { title: '检索共享记忆', readOnlyHint: true, idempotentHint: false, openWorldHint: true },
  read_memory_asset: { title: '读取记忆资产', readOnlyHint: true, idempotentHint: true, openWorldHint: true },
  start_ui: { title: 'UI 开发编排', readOnlyHint: true, idempotentHint: false, openWorldHint: true },
  start_onboard: { title: '项目上手编排', readOnlyHint: true, idempotentHint: false, openWorldHint: true },
  code_insight: { title: '代码图谱洞察', readOnlyHint: true, idempotentHint: false, openWorldHint: true },
  start_feature: { title: '新功能开发编排', readOnlyHint: true, idempotentHint: false, openWorldHint: true },
  start_bugfix: { title: 'Bug 修复编排', readOnlyHint: true, idempotentHint: false, openWorldHint: true },

  // —— 写型（工具自身落盘 / 写记忆 / 写缓存，非破坏）——
  init_project_context: { title: '生成项目上下文', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }, // 自己写 docs/.mcp-probe/layout.json（其余为指令）
  memorize_asset: { title: '沉淀记忆资产', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }, // 写 Qdrant
  sync_ui_data: { title: '同步 UI 数据', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }, // 下载 + 写缓存
};

/**
 * 把注解合并进工具定义（用于 ListTools 返回前）。
 */
export function withToolAnnotations<T extends { name: string }>(
  tool: T
): T & { annotations?: ToolAnnotations } {
  const annotations = TOOL_ANNOTATIONS[tool.name];
  return annotations ? { ...tool, annotations } : tool;
}
