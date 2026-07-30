import { SRC8_METHODOLOGY, resolveAnalysisMode } from './src8-core.js';

export type Src8InputEvidence = {
  type: 'symptom' | 'timeline' | 'stack' | 'code' | 'comparison';
  detail: string;
  source: string;
};

export type Src8ExecutionPlanStep = {
  id: string;
  tool?: string;
  action?: string;
  args?: Record<string, unknown>;
  outputs?: string[];
  when?: string;
  dependsOn?: string[];
  note?: string;
};

export type Src8ExecutionPlan = {
  mode: 'delegated';
  methodology: typeof SRC8_METHODOLOGY;
  steps: Src8ExecutionPlanStep[];
};

export type BuildSrc8DelegatedPlanInput = {
  error_message: string;
  stack_trace?: string;
  analysis_mode?: string;
  code_context?: string;
  project_root?: string;
  file_path?: string;
  /** 默认 true；控制是否包含 SRC-8 记忆候选准备步骤，保留旧字段名兼容调用方 */
  includeGentest?: boolean;
  includeMemorize?: boolean;
};

export function buildSrc8DelegatedPlan(
  input: BuildSrc8DelegatedPlanInput
): Src8ExecutionPlan {
  const analysisMode = resolveAnalysisMode(input.analysis_mode);
  const includeGentest = input.includeGentest !== false;
  const includeMemorize = input.includeMemorize !== false;
  const steps: Src8ExecutionPlanStep[] = [
    {
      id: 'src8-1',
      action:
        'SRC-1 明确差距（PLAN）：写清理想行为、实际行为、可观察 gap；禁止只有情绪无差距',
      outputs: ['BugAnalysis.tbp.phenomenon', 'BugAnalysis.summary'],
      note: '写入 structuredContent.bugfixInput.phenomenon；反模式：「坏了/卡了」',
    },
    {
      id: 'src8-2',
      tool: 'code_insight',
      when: '边界/调用链不清，或需收敛影响面',
      args: {
        mode: 'auto',
        query: input.error_message,
        ...(input.stack_trace ? { task_context: input.stack_trace } : {}),
        ...(input.project_root ? { project_root: input.project_root } : {}),
      },
      outputs: ['BugAnalysis.tbp.boundary', 'BugAnalysis.tbp.timeline'],
      dependsOn: ['src8-1'],
      note: '图谱缺失时先执行 init_project_context；再读本步输出收敛边界',
    },
    {
      id: 'src8-3',
      action:
        'SRC-3 验收契约（PLAN）：定义 SMART 验收（failing test 变绿 / repro 命令 / 明确手动步骤）',
      outputs: ['BugAnalysis.testPlan'],
      dependsOn: ['src8-1'],
    },
    {
      id: 'src8-4',
      action:
        'SRC-4 把握真因（PLAN）：按 rootCauseWorksheet 完成 4a~4e，输出 rootCauseAnalysis 与因果句',
      outputs: [
        'rootCauseAnalysis',
        'BugAnalysis.rootCause',
        'BugAnalysis.tbp.rootCauseStatement',
        'BugAnalysis.tbp.ruledOut',
      ],
      dependsOn: ['src8-1', 'src8-2', 'src8-3'],
      note: '硬门禁：本步闭合前禁止改代码；见 structuredContent.rootCauseWorksheet',
    },
    {
      id: 'src8-5',
      action: 'SRC-5 制定对策（PLAN）：最小 patch，评估有效性/可行性/回归风险',
      outputs: ['BugAnalysis.fixPlan', 'BugAnalysis.tbp.repair'],
      dependsOn: ['src8-4'],
    },
    {
      id: 'src8-6',
      action: 'SRC-6 贯彻修复（DO）：复现门禁通过后改代码，改动仅限 Bug 范围',
      when: 'rootCauseWorksheet 已闭合且复现/failing test 已就绪',
      outputs: ['BugAnalysis.affectedFiles', '代码补丁'],
      dependsOn: ['src8-5'],
      note: '三次修复仍失败 → 回 src8-2 或 src8-4，不得盲试',
    },
  ];
  steps.push(buildEvaluationStep(input, includeGentest));
  steps.push(buildMemoryCandidateStep(input, includeMemorize));
  return { mode: 'delegated', methodology: analysisMode, steps };
}

function buildEvaluationStep(
  input: BuildSrc8DelegatedPlanInput,
  includeGentest: boolean
): Src8ExecutionPlanStep {
  if (!includeGentest) {
    return {
      id: 'src8-7',
      action: 'SRC-7 评价双轨（CHECK）：对照验收契约验证，并复盘过程证据缺口',
      outputs: ['BugAnalysis.summary（含验证结论）'],
      dependsOn: ['src8-6'],
    };
  }
  return {
    id: 'src8-7',
    tool: 'gentest',
    when: 'SRC-6 代码已修改',
    args: {
      code: '[修复后的代码]',
      framework: '[按项目上下文选择 vitest/jest/mocha]',
      ...(input.file_path ? { file_path: input.file_path } : {}),
      ...(input.project_root ? { project_root: input.project_root } : {}),
    },
    outputs: ['回归测试代码'],
    dependsOn: ['src8-6'],
    note: 'SRC-7 评价双轨（结果轨）：对照 Step 3 验收契约',
  };
}

function buildMemoryCandidateStep(
  input: BuildSrc8DelegatedPlanInput,
  includeMemorize: boolean
): Src8ExecutionPlanStep {
  if (!includeMemorize) {
    return {
      id: 'src8-8',
      action: 'SRC-8 巩固传播（ACT）：补回归测试并写 preventionMeasures',
      outputs: ['BugAnalysis.preventionMeasures'],
      dependsOn: ['src8-7'],
    };
  }
  return {
    id: 'src8-8',
    action: 'SRC-8 巩固传播（ACT）：准备成功/失败/证伪/回归记忆候选',
    when: '验证通过',
    args: {
      type: '[bugfix | failed_approach | false_root_cause | regression_case]',
      tags: '[bugfix,root-cause 或 negative-memory]',
      summary: `[关键词] ${input.error_message.slice(0, 80)}`,
      content: '【现象】【根因】【修复】【验证】',
      evidence: ['[测试、日志、反例或监控证据]'],
      applicability: '[适用条件、边界和不适用场景]',
    },
    outputs: ['待收敛的 MemoryCandidate'],
    dependsOn: ['src8-7'],
    note: '只准备候选并写入 plan_heartbeat 证据；converge passed=true 后再调用 memorize_asset',
  };
}

export type MergeBugfixOrchestrationPlanInput = {
  src8Input: BuildSrc8DelegatedPlanInput;
  preambleSteps?: Src8ExecutionPlanStep[];
  appendSteps?: Src8ExecutionPlanStep[];
  /** 为 true 时不在 src8 内嵌记忆候选步骤，由 appendSteps 提供 */
  deferMemorize?: boolean;
};

export function mergeBugfixOrchestrationPlan(
  input: MergeBugfixOrchestrationPlanInput
): Src8ExecutionPlan {
  const src8 = buildSrc8DelegatedPlan({
    ...input.src8Input,
    includeMemorize: input.deferMemorize
      ? false
      : input.src8Input.includeMemorize,
  });
  return {
    mode: 'delegated',
    methodology: resolveAnalysisMode(input.src8Input.analysis_mode),
    steps: [
      ...(input.preambleSteps ?? []),
      ...src8.steps,
      ...(input.appendSteps ?? []),
    ],
  };
}

export function renderSrc8PlanSummaryMarkdown(plan: Src8ExecutionPlan): string {
  const lines = [
    '## 📋 SRC-8 执行计划（delegated）',
    '',
    '严格按 `structuredContent.metadata.plan.steps` 顺序执行，完成每步 `outputs` 后再进入下一步：',
    '',
  ];
  for (const step of plan.steps) {
    const kind = step.tool ? `tool: \`${step.tool}\`` : 'action';
    lines.push(`### ${step.id} — ${kind}`);
    if (step.action) lines.push(step.action);
    if (step.tool && step.args) {
      lines.push('```json', JSON.stringify(step.args, null, 2), '```');
    }
    if (step.when) lines.push(`- **when**: ${step.when}`);
    if (step.dependsOn?.length) {
      lines.push(`- **dependsOn**: ${step.dependsOn.join(', ')}`);
    }
    if (step.outputs?.length) lines.push(`- **outputs**: ${step.outputs.join(', ')}`);
    if (step.note) lines.push(`- **note**: ${step.note}`);
    lines.push('');
  }
  return lines.join('\n');
}

export function buildSrc8EvidenceFromInput(input: {
  error_message: string;
  stack_trace?: string;
  code_context?: string;
  steps_to_reproduce?: string;
  expected_behavior?: string;
  actual_behavior?: string;
  success_sample?: string;
  verification_target?: string;
}): Src8InputEvidence[] {
  const evidence: Src8InputEvidence[] = [
    { type: 'symptom', detail: input.error_message, source: 'error_message' },
  ];
  if (input.steps_to_reproduce) {
    evidence.push({ type: 'timeline', detail: input.steps_to_reproduce, source: 'steps_to_reproduce' });
  }
  if (input.stack_trace) {
    evidence.push({ type: 'stack', detail: input.stack_trace, source: 'stack_trace' });
  }
  if (input.code_context) {
    evidence.push({ type: 'code', detail: input.code_context, source: 'code_context' });
  }
  if (input.expected_behavior) {
    evidence.push({ type: 'comparison', detail: `期望: ${input.expected_behavior}`, source: 'expected_behavior' });
  }
  if (input.actual_behavior) {
    evidence.push({ type: 'comparison', detail: `实际: ${input.actual_behavior}`, source: 'actual_behavior' });
  }
  if (input.success_sample) {
    evidence.push({ type: 'comparison', detail: `成功样本: ${input.success_sample}`, source: 'success_sample' });
  }
  if (input.verification_target) {
    evidence.push({ type: 'comparison', detail: `验收目标: ${input.verification_target}`, source: 'verification_target' });
  }
  return evidence;
}

export { resolveAnalysisMode } from './src8-core.js';
