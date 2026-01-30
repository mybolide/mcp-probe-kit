import { renderGuidanceHeader } from "./guidance.js";

export interface OrchestrationHeaderOptions {
  tool: string;
  goal: string;
  tasks: string[];
  outputs?: string[];
  notes?: string[];
}

const DEFAULT_OUTPUTS = [
  "严格按 delegated plan 顺序调用工具或执行手动步骤",
  "产出内容需落盘到计划路径，或在汇总中明确说明",
  "完成后输出总结：产物路径、关键结果、风险/待确认项、下一步",
];

const DEFAULT_NOTES = ["仅生成执行计划，不直接执行工具调用"];

export function renderOrchestrationHeader(options: OrchestrationHeaderOptions): string {
  return renderGuidanceHeader({
    tool: options.tool,
    goal: options.goal,
    tasks: options.tasks,
    outputs: options.outputs ?? DEFAULT_OUTPUTS,
    notes: options.notes ?? DEFAULT_NOTES,
  });
}
