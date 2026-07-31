export const COMPACT_MODEL_TOOL_NAMES = [
  'start_feature',
  'start_bugfix',
  'start_ui',
  'start_onboard',
  'start_product',
  'start_ralph',
  'workflow',
  'init_project_context',
  'init_project',
  'check_spec',
  'estimate',
  'code_insight',
  'gentest',
  'code_review',
  'refactor',
  'gencommit',
  'git_work_report',
  'ui_design_system',
  'ui_search',
  'plan_heartbeat',
  'resume_plan',
  'converge',
  'interview',
] as const;

export const MEMORY_MODEL_TOOL_NAMES = [
  'search_memory',
  'read_memory_asset',
  'memorize_asset',
  'update_memory_asset',
  'delete_memory_asset',
  'scan_and_extract_patterns',
] as const;

export const APP_ONLY_TOOL_NAMES = ['list_memory_assets'] as const;

export const COMPACT_MODEL_TOOL_NAME_SET = new Set<string>(COMPACT_MODEL_TOOL_NAMES);
export const MEMORY_MODEL_TOOL_NAME_SET = new Set<string>(MEMORY_MODEL_TOOL_NAMES);
export const APP_ONLY_TOOL_NAME_SET = new Set<string>(APP_ONLY_TOOL_NAMES);
