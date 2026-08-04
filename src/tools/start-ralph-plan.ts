import {
  buildDelegatedPlanContract,
  createDelegatedPlanId,
  type DelegatedPlanContract,
  type DelegatedPlanStep,
} from '../lib/delegated-plan-contract.js';
import { buildMemoryPlanStep } from '../lib/memory-orchestration.js';
import type { RalphLoopReport, WorkflowStep } from '../schemas/structured-output.js';
import type { RalphConfig } from './start-ralph-config.js';
import type { RalphGeneratedFiles } from './start-ralph-templates.js';

export interface BuildRalphPlanInput {
  config: RalphConfig;
  files: RalphGeneratedFiles;
  memoryEnabled: boolean;
  memoryRecallSteps: DelegatedPlanStep[];
}

export function createRalphPlanId(config: RalphConfig): string {
  return createDelegatedPlanId(
    'ralph',
    `${config.goal}:${config.maxIterations}:${config.maxMinutes}`,
  );
}

function chainSteps(steps: DelegatedPlanStep[], initialDependency?: string): DelegatedPlanStep[] {
  let dependency = initialDependency;
  return steps.map((step) => {
    const result = dependency && (!step.dependsOn || step.dependsOn.length === 0)
      ? { ...step, dependsOn: [dependency] }
      : { ...step };
    dependency = step.id;
    return result;
  });
}

function buildRoundSteps(config: RalphConfig, firstDependency: string): DelegatedPlanStep[] {
  const rounds: DelegatedPlanStep[] = [];
  let dependency = firstDependency;
  for (let round = 1; round <= config.maxIterations; round += 1) {
    const id = `round-${round}`;
    rounds.push({
      id,
      type: 'agent_action',
      action: 'execute_bounded_ralph_round',
      dependsOn: [dependency],
      when: round === 1
        ? '基线已验证且用户允许开始第一轮'
        : `上一轮未满足完成条件、未触发停止条件，且用户在确认轮次允许继续`,
      requiredInputs: [
        `.ralph/PROMPT.md`,
        `.ralph/@fix_plan.md`,
        `.ralph/PROGRESS.md`,
        `本轮编号 ${round}/${config.maxIterations}`,
        `候选测试命令：${config.testCommand}`,
        '上一轮 Plan 状态、真实 diff、测试证据和未决项',
      ],
      expectedOutputs: [
        '恰好一个聚焦变更，或明确的无修改分析/阻断结果',
        '真实测试/检查命令、工作目录、退出码和通过数量',
        'Git revision、diff 摘要、changed lines 和当前未决项',
        '更新后的 .ralph/@fix_plan.md 与 .ralph/PROGRESS.md',
      ],
      completionEvidence: [
        `runtimeEvidence 包含 round=${round}、status、revision、diffLines、testCommand、testExitCode、summary、nextStep 和 stopReason`,
        '本轮结束后立即调用 plan_heartbeat，completed_step_ids/skipped_step_ids 使用累计集合',
        '若触发安全停止，剩余轮次必须按同一 stop reason 跳过，且 unresolvedItems 记录未完成目标',
      ],
      outputs: ['.ralph/@fix_plan.md', '.ralph/PROGRESS.md'],
      note: `一轮只允许一个主要假设或一个聚焦改动。连续三次失败必须停止盲试并返回分析；不得后台执行。`,
    });
    dependency = id;
  }
  return rounds;
}

export function buildRalphPlan(input: BuildRalphPlanInput): DelegatedPlanContract {
  const { config, files } = input;
  const recallSteps = chainSteps(input.memoryRecallSteps);
  const instructionsDependency = recallSteps.at(-1)?.id;
  const instructionStep: DelegatedPlanStep = {
    id: 'project-instructions',
    type: 'agent_action',
    action: 'read_project_instructions_and_constraints',
    ...(instructionsDependency ? { dependsOn: [instructionsDependency] } : {}),
    requiredInputs: ['AGENTS.md、项目 Skill、README、开发/测试规范和生成文件规则（存在时）'],
    expectedOutputs: ['当前项目命令、目录、测试、生成文件、禁止事项和用户约束清单'],
    completionEvidence: ['记录实际读取路径；不存在时明确记录'],
    outputs: [],
  };
  const planId = createRalphPlanId(config);
  const roundSteps = buildRoundSteps(config, 'write-files');
  const lastRoundId = roundSteps.at(-1)?.id ?? 'write-files';
  const memoryStep = input.memoryEnabled
    ? [{
        ...buildMemoryPlanStep('default'),
        dependsOn: ['final-status'],
      } as DelegatedPlanStep]
    : [];

  return buildDelegatedPlanContract({
    planId,
    workflow: 'ralph',
    workflowVersion: '4.0.0',
    objective: `在最多 ${config.maxIterations} 轮、${config.maxMinutes} 分钟内，以小步验证方式完成：${config.goal}`,
    declaredScope: {
      projectRoot: config.projectRoot,
      goal: config.goal,
      mode: config.mode,
      completionPromise: config.completionPromise,
      testCommandCandidate: config.testCommand,
      cliCommand: config.cliCommand,
      maxIterations: config.maxIterations,
      maxMinutes: config.maxMinutes,
      confirmEvery: config.confirmEvery,
      confirmTimeout: config.confirmTimeout,
      maxSameOutput: config.maxSameOutput,
      maxDiffLines: config.maxDiffLines,
      cooldownSeconds: config.cooldownSeconds,
      backgroundExecution: false,
      helperScriptOptional: true,
    },
    qualityGates: [
      'ralph-baseline-verified',
      'ralph-round-evidence-complete',
      'ralph-final-tests-passed',
      'ralph-final-review-complete',
      'ralph-stop-reason-recorded',
    ],
    globalRules: [
      'start_ralph 只生成 Plan、模板和可选前台脚本，不运行循环、不创建后台进程、不修改业务代码',
      '每轮只处理一个主要假设或一个聚焦改动，并在轮末立即写 plan_heartbeat',
      '模型输出中的完成信号不是成功证据；必须以真实测试、diff、revision 和验收结果独立验证',
      'STOP、用户拒绝/超时、最大轮次/时间、重复输出、diff 超限、命令失败或三次失败属于安全停止，不等于成功',
      '安全停止后记录 stop reason、未决项并跳过剩余轮次；没有完成目标时不得 converge passed=true',
      'normal 模式仍受轮次、时间和前台执行边界约束，只降低确认频率，不允许无限或后台执行',
    ],
    completionCriteria: [
      '基线状态、正确测试命令和完成条件已验证',
      '每个已执行或跳过轮次都有稳定结构的 runtimeEvidence 和 Heartbeat 记录',
      '完成承诺由最终真实测试和项目证据独立验证，而不是仅依赖 Agent 声明',
      '最终真实 diff 已完成 code_review，且高优先级问题已关闭或记录为阻断',
      '涉及架构边界或 ArchitectureCandidate 时已完成 architecture drift；否则记录跳过理由',
      'final-status 已记录唯一停止原因、完成状态、剩余工作和收敛决定',
    ],
    memoryPolicy: {
      recallBeforeExecution: input.memoryEnabled,
      extractAfterValidation: input.memoryEnabled,
    },
    steps: [
      ...recallSteps,
      instructionStep,
      {
        id: 'context',
        type: 'tool',
        tool: 'init_project_context',
        dependsOn: ['project-instructions'],
        when: '缺少可信的项目上下文或命令/架构索引',
        args: { project_root: config.projectRoot },
        expectedOutputs: ['docs/project-context.md'],
        completionEvidence: ['项目上下文指向当前真实 project_root'],
        outputs: ['docs/project-context.md'],
      },
      {
        id: 'impact',
        type: 'tool',
        tool: 'code_insight',
        dependsOn: ['context'],
        args: {
          mode: 'impact',
          query: config.goal,
          project_root: config.projectRoot,
          include_tests: true,
          include_content: false,
          save_to_docs: false,
        },
        expectedOutputs: ['目标相关入口、依赖、消费者、测试和影响面，或明确 degraded 证据'],
        completionEvidence: ['记录图谱状态、证据来源、歧义和未知项'],
        outputs: [],
      },
      {
        id: 'baseline',
        type: 'agent_action',
        action: 'verify_ralph_baseline_and_completion_contract',
        dependsOn: ['impact'],
        requiredInputs: [
          '项目指令、当前 Git 状态、影响分析和相关规格/验收标准',
          `候选测试命令：${config.testCommand}`,
          `完成承诺：${config.completionPromise}`,
        ],
        expectedOutputs: ['可信的基线 revision、工作树状态、测试命令、当前测试结果和可验证完成条件'],
        completionEvidence: [
          'acceptanceResults 包含 gateId=ralph-baseline-verified',
          '测试命令来源、cwd、退出码和当前失败已记录',
        ],
        qualityGates: ['ralph-baseline-verified'],
        outputs: [],
      },
      {
        id: 'write-files',
        type: 'agent_action',
        action: 'write_ralph_control_files',
        dependsOn: ['baseline'],
        requiredInputs: ['metadata.generatedFiles 中的精确文件内容'],
        expectedOutputs: [
          '.ralph/PROMPT.md',
          '.ralph/@fix_plan.md',
          '.ralph/PROGRESS.md',
          files.safeScriptPath,
          files.normalScriptPath,
        ],
        completionEvidence: ['文件逐字来自工具输出，脚本未被自动启动'],
        outputs: [
          '.ralph/PROMPT.md',
          '.ralph/@fix_plan.md',
          '.ralph/PROGRESS.md',
          files.safeScriptPath,
          files.normalScriptPath,
        ],
      },
      ...roundSteps,
      {
        id: 'round-evidence',
        type: 'agent_action',
        action: 'audit_ralph_round_evidence',
        dependsOn: [lastRoundId],
        requiredInputs: ['Plan runtimeEvidence、PROGRESS.md、Git revisions、tests 和 skipped rounds'],
        expectedOutputs: ['轮次连续性、证据完整性、重复输出、失败次数和停止条件审计'],
        completionEvidence: ['acceptanceResults 包含 gateId=ralph-round-evidence-complete'],
        qualityGates: ['ralph-round-evidence-complete'],
        outputs: [],
      },
      {
        id: 'final-test',
        type: 'agent_action',
        action: 'run_final_ralph_verification',
        dependsOn: ['round-evidence'],
        when: '目标可能已经完成；若安全停止且目标未完成，则记录阻断并不得通过此 gate',
        requiredInputs: ['完成承诺、最终工作树、最终测试/构建/检查命令和相关验收标准'],
        expectedOutputs: ['最终命令、cwd、退出码、通过数量和完成承诺逐项验证结果'],
        completionEvidence: ['acceptanceResults 包含 gateId=ralph-final-tests-passed'],
        qualityGates: ['ralph-final-tests-passed'],
        outputs: [],
      },
      {
        id: 'review',
        type: 'tool',
        tool: 'code_review',
        dependsOn: ['final-test'],
        args: { project_root: config.projectRoot, focus: 'all' },
        expectedOutputs: ['真实 diff 的正确性、安全性、可维护性和回归风险审查'],
        completionEvidence: [
          'acceptanceResults 包含 gateId=ralph-final-review-complete',
          '高优先级问题已关闭或记录为 unresolved blocker',
        ],
        qualityGates: ['ralph-final-review-complete'],
        outputs: [],
      },
      {
        id: 'architecture-drift',
        type: 'tool',
        tool: 'architecture',
        dependsOn: ['review'],
        when: '轮次使用或生成了 ArchitectureCandidate/ADR，或真实 diff 改变模块边界、公共契约、数据所有权时',
        args: {
          mode: 'drift',
          description: `核验 Ralph 迭代是否偏离已确认架构：${config.goal}`,
          project_root: config.projectRoot,
          baseline: '[填入 ArchitectureCandidate/ADR；不适用时按理由跳过]',
          diff: '[填入最终真实 Git diff 或 revision 摘要]',
          collect_evidence: true,
        },
        expectedOutputs: ['架构漂移结果，或不适用的明确跳过理由'],
        completionEvidence: ['存在架构证据时已完成 drift；不存在时记录 skip reason'],
        outputs: [],
      },
      {
        id: 'final-status',
        type: 'agent_action',
        action: 'record_ralph_final_status_and_stop_reason',
        dependsOn: ['architecture-drift'],
        requiredInputs: ['全部轮次证据、最终测试、review、架构结果和未决项'],
        expectedOutputs: ['唯一 stop reason、completionPromiseMet、remainingWork、convergenceDecision 和最终 PROGRESS.md'],
        completionEvidence: [
          'acceptanceResults 包含 gateId=ralph-stop-reason-recorded',
          '只有真实完成时 convergenceDecision=ready；安全停止/阻断时 unresolvedItems 非空',
        ],
        qualityGates: ['ralph-stop-reason-recorded'],
        outputs: ['.ralph/PROGRESS.md'],
      },
      ...memoryStep,
    ],
  });
}

const STEP_LABELS: Record<string, string> = {
  'recall-memory': '召回循环开发经验',
  'project-instructions': '读取项目指令',
  context: '建立项目上下文',
  impact: '分析影响范围',
  baseline: '验证基线与完成条件',
  'write-files': '写入 Ralph 控制文件',
  'round-evidence': '审计轮次证据',
  'final-test': '执行最终验证',
  review: '审查最终 Diff',
  'architecture-drift': '核验架构漂移',
  'final-status': '记录最终停止状态',
  'prepare-memory': '准备循环经验候选',
};

function reportSteps(plan: DelegatedPlanContract): WorkflowStep[] {
  return plan.steps.map((step) => ({
    name: STEP_LABELS[step.id]
      ?? (step.id.startsWith('round-') ? `执行 Ralph ${step.id.replace('round-', '第 ')} 轮` : step.action ?? step.tool ?? step.id),
    status: 'pending',
    description: step.note
      ?? (step.expectedOutputs?.length ? `预期输出：${step.expectedOutputs.join('；')}` : '待执行'),
  }));
}

export function buildRalphReport(
  plan: DelegatedPlanContract,
  config: RalphConfig,
  files: RalphGeneratedFiles,
): RalphLoopReport {
  return {
    summary: `Ralph 有界循环开发：${config.goal}`,
    status: 'pending',
    steps: reportSteps(plan),
    artifacts: [
      { path: '.ralph/PROMPT.md', type: 'doc', purpose: '每轮执行、证据和状态回写契约' },
      { path: '.ralph/@fix_plan.md', type: 'doc', purpose: '有界任务分解和发现项' },
      { path: '.ralph/PROGRESS.md', type: 'doc', purpose: '轮次证据与最终停止状态' },
      { path: files.safeScriptPath, type: 'config', purpose: '可选前台安全辅助脚本' },
      { path: files.normalScriptPath, type: 'config', purpose: '仍受硬上限约束的前台普通模式脚本' },
    ],
    nextSteps: [
      `调用 plan_heartbeat，传入 plan_id=${plan.planId}、完整 metadata.plan 与 project_root=${config.projectRoot}`,
      ...plan.steps.map((step) => `${step.tool ? `调用 ${step.tool}` : `执行 ${step.action ?? step.id}`}，随后累计回写 plan_heartbeat`),
      `仅在全部完成条件、质量门禁和未决项闭合后调用 converge --plan_id=${plan.planId} --project_root=${config.projectRoot}`,
    ],
    loopPolicy: {
      maxIterations: config.maxIterations,
      maxMinutes: config.maxMinutes,
      confirmEvery: config.confirmEvery,
      cooldownSeconds: config.cooldownSeconds,
    },
    iterations: [],
    stopConditions: {
      reason: 'not_started',
      metConditions: [],
    },
    safetyChecks: [
      { check: 'foreground-only', passed: true, message: '工具不执行脚本，辅助脚本拒绝后台/非交互启动' },
      { check: 'max-iterations', passed: true, message: `硬上限 ${config.maxIterations} 轮` },
      { check: 'max-minutes', passed: true, message: `硬上限 ${config.maxMinutes} 分钟` },
      { check: 'confirmation', passed: true, message: `每 ${config.confirmEvery} 轮确认，超时 ${config.confirmTimeout} 秒停止` },
      { check: 'repetition-and-diff', passed: true, message: `重复 ${config.maxSameOutput} 次或 diff 超过 ${config.maxDiffLines} 行停止` },
    ],
    metadata: {
      plan,
      generatedFiles: {
        '.ralph/PROMPT.md': files.prompt,
        '.ralph/@fix_plan.md': files.fixPlan,
        '.ralph/PROGRESS.md': files.progress,
        [files.safeScriptPath]: files.safeScript,
        [files.normalScriptPath]: files.normalScript,
      },
      backgroundExecution: false,
      helperScriptOptional: true,
    },
  };
}
