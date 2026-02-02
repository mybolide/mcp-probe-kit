/**
 * 结构化输出 Schema 索引 (v3.0 - 20 个工具)
 * 统一导出所有工具的结构化输出 Schema 和类型定义
 */

// 核心开发工具
export * from './core-tools.js';

// 工作流编排工具
export * from './workflow-tools.js';

// 项目管理工具
export * from './project-tools.js';

// UI/UX 工具
export * from './ui-ux-tools.js';

// 产品设计工具
export * from './product-design-tools.js';

// 辅助工具
export * from './helper-tools.js';

// 从主 Schema 文件导出基础 Schema（P0 工具）
export {
  CommitMessageSchema,
  WorkflowReportSchema,
  BugFixReportSchema,
  FeatureReportSchema,
  UIReportSchema,
  OnboardingReportSchema,
  RalphLoopReportSchema,
  RequirementsLoopSchema,
  // 类型定义
  CommitMessage,
  WorkflowStep,
  Artifact,
  WorkflowReport,
  BugFixReport,
  FeatureReport,
  UIReport,
  OnboardingReport,
  RalphLoopReport,
  RequirementsLoopReport,
} from '../structured-output.js';

/**
 * Schema 映射表 (v3.0 - 20 个工具)
 * 工具名称 -> Schema 对象
 */
export const SCHEMA_MAP = {
  // 编排工具（6 个）
  start_feature: 'FeatureReportSchema',
  start_bugfix: 'BugFixReportSchema',
  start_onboard: 'OnboardingReportSchema',
  start_ui: 'UIReportSchema',
  start_product: 'WorkflowReportSchema',
  start_ralph: 'RalphLoopReportSchema',
  
  // 日常工具（9 个）
  gencommit: 'CommitMessageSchema',
  code_review: 'CodeReviewReportSchema',
  gentest: 'TestSuiteSchema',
  refactor: 'RefactorPlanSchema',
  fix_bug: 'BugAnalysisSchema',
  add_feature: 'FeatureSpecSchema',
  init_project: 'ProjectInitSchema',
  init_project_context: 'ProjectContextSchema',
  estimate: 'EstimateSchema',
  
  // 交互工具（2 个）
  interview: 'InterviewReportSchema',
  ask_user: 'UserQuestionSchema',
  
  // UI/UX 工具（3 个）
  ui_design_system: 'DesignSystemSchema',
  ui_search: 'UISearchResultSchema',
  sync_ui_data: 'SyncReportSchema',
} as const;

/**
 * 获取工具的 Schema 名称
 */
export function getSchemaName(toolName: string): string | undefined {
  return SCHEMA_MAP[toolName as keyof typeof SCHEMA_MAP];
}

/**
 * 检查工具是否支持结构化输出
 */
export function supportsStructuredOutput(toolName: string): boolean {
  return toolName in SCHEMA_MAP;
}

/**
 * 获取所有支持结构化输出的工具列表
 */
export function getSupportedTools(): string[] {
  return Object.keys(SCHEMA_MAP);
}
