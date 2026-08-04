/**
 * tools/list 的 outputSchema 兼容注册表。
 * 工具元数据主入口为 Tool Registry；本文件暂时保留输出 Schema 的独立映射。
 */

import { BugAnalysisSchema } from '../schemas/output/core-tools.js';
import { GuidanceResultSchema } from '../schemas/output/guidance-tools.js';
import {
  FeatureSpecSchema,
  ProjectInitSchema,
  ProjectContextSchema,
} from '../schemas/output/project-tools.js';
import { WorkflowRoutingResultSchema } from '../schemas/output/workflow-routing.js';
import {
  DesignSystemSchema,
  UISearchResultSchema,
  SyncReportSchema,
} from '../schemas/output/ui-ux-tools.js';
import { InterviewReportSchema } from '../schemas/output/product-design-tools.js';
import {
  CommitGuidanceSchema,
  FeatureReportSchema,
  BugFixReportSchema,
  UIReportSchema,
  OnboardingReportSchema,
  RalphLoopReportSchema,
  WorkflowReportSchema,
  RequirementsLoopSchema,
} from '../schemas/structured-output.js';
import {
  MemorySearchSchema,
  MemoryAssetDetailSchema,
  MemorizeResultSchema,
  DeleteMemoryResultSchema,
  UpdateMemoryResultSchema,
  PatternExtractionSchema,
} from '../schemas/output/memory-tools.js';
import { CodeInsightSchema } from '../schemas/output/code-insight-tools.js';
import { ArchitectureResultSchema } from '../schemas/output/architecture-tools.js';
import {
  ConvergeResultSchema,
  PlanHeartbeatResultSchema,
  ResumePlanResultSchema,
} from '../schemas/output/plan-tools.js';
import { withToolAnnotations } from './tool-annotations.js';

type JsonSchema = Record<string, unknown>;

const SpecValidationReportSchema: JsonSchema = {
  type: 'object',
  properties: {
    passed: { type: 'boolean' },
    errorCount: { type: 'number' },
    warningCount: { type: 'number' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          severity: { type: 'string', enum: ['error', 'warning'] },
          code: { type: 'string' },
          message: { type: 'string' },
        },
        required: ['file', 'severity', 'message'],
      },
    },
    frIds: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: ['passed', 'errorCount', 'warningCount', 'issues', 'summary'],
};

const UserQuestionSchema: JsonSchema = {
  type: 'object',
  properties: {
    question: { type: 'string' },
    options: { type: 'array', items: { type: 'string' } },
    context: { type: 'string' },
  },
  required: ['question'],
};

const OUTPUT_SCHEMA_BY_TOOL: Record<string, JsonSchema> = {
  workflow: WorkflowRoutingResultSchema as JsonSchema,
  gencommit: CommitGuidanceSchema as JsonSchema,
  git_work_report: GuidanceResultSchema as JsonSchema,
  code_insight: CodeInsightSchema as JsonSchema,
  architecture: ArchitectureResultSchema as JsonSchema,
  code_review: GuidanceResultSchema as JsonSchema,
  fix_bug: BugAnalysisSchema as JsonSchema,
  gentest: GuidanceResultSchema as JsonSchema,
  refactor: GuidanceResultSchema as JsonSchema,
  add_feature: FeatureSpecSchema as JsonSchema,
  check_spec: SpecValidationReportSchema as JsonSchema,
  estimate: GuidanceResultSchema as JsonSchema,
  start_feature: FeatureReportSchema as JsonSchema,
  start_bugfix: BugFixReportSchema as JsonSchema,
  start_onboard: OnboardingReportSchema as JsonSchema,
  start_ui: UIReportSchema as JsonSchema,
  start_product: WorkflowReportSchema as JsonSchema,
  start_ralph: RalphLoopReportSchema as JsonSchema,
  init_project: ProjectInitSchema as JsonSchema,
  init_project_context: ProjectContextSchema as JsonSchema,
  interview: InterviewReportSchema as JsonSchema,
  ask_user: UserQuestionSchema as JsonSchema,
  ui_design_system: DesignSystemSchema as JsonSchema,
  ui_search: UISearchResultSchema as JsonSchema,
  sync_ui_data: SyncReportSchema as JsonSchema,
  search_memory: MemorySearchSchema as JsonSchema,
  read_memory_asset: MemoryAssetDetailSchema as JsonSchema,
  memorize_asset: MemorizeResultSchema as JsonSchema,
  delete_memory_asset: DeleteMemoryResultSchema as JsonSchema,
  update_memory_asset: UpdateMemoryResultSchema as JsonSchema,
  scan_and_extract_patterns: PatternExtractionSchema as JsonSchema,
  plan_heartbeat: PlanHeartbeatResultSchema as JsonSchema,
  resume_plan: ResumePlanResultSchema as JsonSchema,
  converge: ConvergeResultSchema as JsonSchema,
};

export function getOutputSchemaForTool(toolName: string): JsonSchema | undefined {
  return OUTPUT_SCHEMA_BY_TOOL[toolName];
}

/** Cursor 等对 tools/list 体积敏感时，默认不在列表里附带 outputSchema（调用仍返回 structuredContent） */
export function shouldIncludeOutputSchemaInToolsList(): boolean {
  const raw = process.env.MCP_INCLUDE_OUTPUT_SCHEMA;
  if (raw === undefined) {
    return false;
  }
  return /^(1|true|yes|on)$/i.test(raw.trim());
}

export function withOutputSchema<T extends { name: string }>(
  tool: T
): T & { outputSchema?: JsonSchema } {
  const outputSchema = getOutputSchemaForTool(tool.name);
  return outputSchema ? { ...tool, outputSchema } : tool;
}

/** tools/list 返回前的最终形态（默认省略 outputSchema 以兼容 Cursor lease） */
export function prepareToolForToolsList<T extends { name: string }>(tool: T) {
  const annotated = withToolAnnotations(tool);
  return shouldIncludeOutputSchemaInToolsList() ? withOutputSchema(annotated) : annotated;
}
