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

export function collectDelegatedPlanToolReferences(
  steps: readonly RenderablePlanStep[],
): string[] {
  return [...new Set(steps.flatMap((step) => (step.tool ? [step.tool] : [])))];
}
