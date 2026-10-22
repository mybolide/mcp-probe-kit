/** SRC-8 is a diagnostic workflow, not eight automatically executable coding tasks. */
export const SRC8_STEPS = [
  "明确现象与预期差距",
  "调查时间线与故障边界",
  "建立复现与验收契约",
  "真因分析与证据排除",
  "制定可验证的修复对策",
  "按批准的修复任务实施",
  "回归测试与防复发验证",
  "总结收敛与经验归档",
] as const;

export type BugStepStatus = "pending" | "in_progress" | "blocked" | "completed";

export interface BugStepUpdate {
  id: string;
  step: number;
  status: BugStepStatus;
  summary: string;
  evidence: string[];
  actor: string;
  expectedRevision: number;
}
