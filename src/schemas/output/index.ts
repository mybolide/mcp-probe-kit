/**
 * 结构化输出 Schema 索引
 * 统一导出所有工具的结构化输出 Schema 和类型定义
 */

// 核心开发工具 (7 个)
export * from './core-tools.js';

// 代码生成工具 (12 个)
export * from './generation-tools.js';

// 工作流编排工具 (5 个)
export * from './workflow-tools.js';

// 项目管理工具 (8 个)
export * from './project-tools.js';

// UI/UX 工具 (6 个)
export * from './ui-ux-tools.js';

// 辅助工具 (3 个)
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
} from '../structured-output.js';

/**
 * Schema 映射表
 * 工具名称 -> Schema 对象
 */
export const SCHEMA_MAP = {
  // P0 工具（已完成）
  gencommit: 'CommitMessageSchema',
  start_feature: 'FeatureReportSchema',
  start_bugfix: 'BugFixReportSchema',
  start_ui: 'UIReportSchema',
  start_onboard: 'OnboardingReportSchema',
  start_ralph: 'RalphLoopReportSchema',
  
  // 核心开发工具
  code_review: 'CodeReviewReportSchema',
  debug: 'DebugReportSchema',
  fix_bug: 'BugAnalysisSchema',
  gentest: 'TestSuiteSchema',
  refactor: 'RefactorPlanSchema',
  security_scan: 'SecurityReportSchema',
  perf: 'PerformanceReportSchema',
  
  // 代码生成工具
  gendoc: 'DocumentationSchema',
  genapi: 'APIDocumentationSchema',
  gensql: 'SQLQuerySchema',
  genreadme: 'ReadmeSchema',
  genui: 'UIComponentSchema',
  gen_mock: 'MockDataSchema',
  genchangelog: 'ChangelogSchema',
  genpr: 'PullRequestSchema',
  fix: 'CodeFixSchema',
  explain: 'ExplanationSchema',
  convert: 'ConversionSchema',
  css_order: 'CSSOrderSchema',
  
  // 工作流编排工具
  start_review: 'ReviewWorkflowSchema',
  start_release: 'ReleaseWorkflowSchema',
  start_refactor: 'RefactorWorkflowSchema',
  start_api: 'APIWorkflowSchema',
  start_doc: 'DocWorkflowSchema',
  
  // 项目管理工具
  init_project: 'ProjectInitSchema',
  init_project_context: 'ProjectContextSchema',
  add_feature: 'FeatureSpecSchema',
  analyze_project: 'ProjectAnalysisSchema',
  estimate: 'EstimateSchema',
  check_deps: 'DependencyReportSchema',
  split: 'SplitPlanSchema',
  resolve_conflict: 'ConflictResolutionSchema',
  
  // UI/UX 工具
  ui_design_system: 'DesignSystemSchema',
  ui_search: 'UISearchResultSchema',
  sync_ui_data: 'SyncReportSchema',
  design2code: 'Design2CodeSchema',
  init_component_catalog: 'ComponentCatalogSchema',
  render_ui: 'RenderResultSchema',
  
  // 辅助工具
  detect_shell: 'ShellDetectionSchema',
  init_setting: 'SettingInitSchema',
  gen_skill: 'SkillDocSchema',
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
