export interface WorkflowSelectionGuideEntry {
  signal: string;
  firstTool: string;
  note?: string;
}

/**
 * Agent-facing fallback guide.
 *
 * This is intentionally descriptive rather than predictive: workflow does
 * not classify arbitrary user text. The Agent reads the guide together with
 * tool descriptions and chooses the tool itself.
 */
export const WORKFLOW_SELECTION_GUIDE: WorkflowSelectionGuideEntry[] = [
  { signal: '完整交付新功能、功能增强或跨模块能力', firstTool: 'start_feature' },
  { signal: '完整修复 Bug，并完成回归、审查和收敛', firstTool: 'start_bugfix' },
  { signal: '只做 Bug 根因分析或使用 SRC-8 方法', firstTool: 'fix_bug' },
  { signal: '架构评估、架构设计、数据所有权、迁移回滚或架构漂移', firstTool: 'architecture' },
  { signal: '完整交付页面、组件或 UI 交互', firstTool: 'start_ui' },
  { signal: '只查 UI 模式或生成设计系统', firstTool: 'ui_search / ui_design_system' },
  { signal: '不熟代码、找入口、调用链、依赖或影响面', firstTool: 'code_insight' },
  { signal: '只生成测试策略、测试设计或候选用例', firstTool: 'gentest' },
  { signal: '只审查指定代码、真实 diff 或 PR', firstTool: 'code_review' },
  { signal: '新成员上手、熟悉仓库和开发上下文', firstTool: 'start_onboard' },
  { signal: '产品方案、PRD、目标用户、范围或原型方向', firstTool: 'start_product' },
  { signal: '需要有界多轮自主迭代并逐轮留证', firstTool: 'start_ralph' },
  { signal: '缺 AGENTS.md、项目上下文或图谱索引', firstTool: 'init_project_context' },
  { signal: '全新空仓库需要初始化项目结构', firstTool: 'init_project' },
  { signal: '写 commit message', firstTool: 'gencommit' },
  { signal: '重构、整理代码或制定重构步骤', firstTool: 'refactor', note: '范围大时先 code_insight' },
  { signal: '估算工时、故事点、排期或风险', firstTool: 'estimate' },
  { signal: '校验已有规格是否完整', firstTool: 'check_spec' },
  { signal: '查询历史踩坑、已保存方案或可复用经验', firstTool: 'search_memory' },
  { signal: '需求本身不清楚，缺关键事实，需要向用户提问', firstTool: 'ask_user / interview' },
  { signal: '工作报告、周报或 Git 工作汇总', firstTool: 'git_work_report' },
  { signal: '用户只说继续/开始/往下做且可能存在未完成 Plan', firstTool: 'resume_plan' },
];

export const WORKFLOW_AGENT_SELECTION_RULES = [
  '先由 Agent 根据完整对话语义和工具 description 判断任务，不要把 workflow 当作中央意图识别器。',
  '单项能力直接调用对应工具；需要完整交付流程时才调用 start_*。',
  '一句话包含多个独立交付时，由 Agent 拆分目标或先澄清执行顺序；不要让某一个工具静默吞掉其他交付。',
  '主任务内部的测试、规格、分析等从属步骤由 Agent 按主任务流程组合，不必拆成多个独立工作流。',
  '仍无法判断时，读取本选择指南和当前 Host 的 tool descriptions；缺关键事实时再向用户澄清。',
] as const;
