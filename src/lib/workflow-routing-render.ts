import type { WorkflowRoutingDecision } from './workflow-routing-contract.js';

export function renderWorkflowRoutingDetails(
  routing: WorkflowRoutingDecision | undefined,
): string {
  if (!routing) return '';
  if (!routing.conflict) return `**路由依据**: ${routing.reason}`;

  const candidates = routing.candidates
    .filter((candidate) => candidate.status !== 'suppressed')
    .map((candidate) => `\`${candidate.scenario}\``)
    .join('、');
  return [
    `**路由冲突**: ${routing.reason}`,
    `**候选场景**: ${candidates}`,
    '**处理**: 先澄清本次首要交付目标，不按规则顺序猜测。',
  ].join('\n');
}
