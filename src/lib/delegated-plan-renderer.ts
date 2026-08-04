export interface RenderablePlanStep {
  id: string;
  type?: string;
  tool?: string;
  action?: string;
  args?: Record<string, unknown>;
  outputs?: string[];
  when?: string;
  requiredInputs?: string[];
  expectedOutputs?: string[];
  completionEvidence?: string[];
  qualityGates?: string[];
  note?: string;
}

function stringifyArgs(args: Record<string, unknown> | undefined): string {
  if (!args || Object.keys(args).length === 0) return '';
  return `\n\n\`\`\`json\n${JSON.stringify(args, null, 2)}\n\`\`\``;
}

function renderList(label: string, values: string[] | undefined): string {
  if (!values || values.length === 0) return '';
  return `\n- **${label}**: ${values.map((value) => `\`${value}\``).join('、')}`;
}

/**
 * Render one delegated plan from its structured source of truth.
 * Text guidance must not maintain a second, drifting copy of tool/action steps.
 */
export function renderDelegatedPlanSteps(steps: readonly RenderablePlanStep[]): string {
  return steps
    .map((step, index) => {
      const heading = `### ${index + 1}. ${step.id}`;
      const when = step.when ? `\n- **执行条件**: ${step.when}` : '';
      const outputs = renderList('预期输出', step.expectedOutputs ?? step.outputs);
      const evidence = renderList('完成证据', step.completionEvidence);
      const gates = renderList('质量闸门', step.qualityGates);
      const note = step.note ? `\n- **说明**: ${step.note}` : '';

      if (step.type === 'tool' || step.tool) {
        return `${heading}\n- **调用 MCP 工具**: \`${step.tool}\`${when}${stringifyArgs(step.args)}${outputs}${evidence}${gates}${note}`;
      }

      return `${heading}\n- **Agent 操作**: ${step.action ?? '执行该步骤'}${when}${renderList('所需输入', step.requiredInputs)}${outputs}${evidence}${gates}${note}`;
    })
    .join('\n\n');
}

export function renderDelegatedPlanStateProtocol(input: {
  planId: string;
  projectRoot?: string;
}): string {
  const rootInstruction = input.projectRoot
    ? `，并固定传入 \`project_root=${input.projectRoot}\``
    : '';
  return `## 状态回写协议

- Workbench 进度只读取 Plan 检查点，不会根据聊天文本、Git diff 或“已经做完”的描述猜测完成状态。
- 开始执行前必须调用 \`plan_heartbeat\`，传入 \`plan_id=${input.planId}\`、完整 \`structuredContent.metadata.plan\`${rootInstruction}，建立首个检查点。
- 每完成、跳过或阻断一个步骤，立即再次调用 \`plan_heartbeat\`；\`completed_step_ids\` 必须是累计集合，并同步真实证据、未决项和当前 revision。
- \`resume_plan\` 只读取检查点并计算下一步；它不会替代 \`plan_heartbeat\`，也不会自动把代码变更识别为已完成。
- 全部步骤与证据回写后再调用 \`converge\`。`;
}

export function collectDelegatedPlanToolReferences(
  steps: readonly RenderablePlanStep[],
): string[] {
  return [...new Set(steps.flatMap((step) => (step.tool ? [step.tool] : [])))];
}
