export type WorkflowScenario =
  | 'feature'
  | 'bugfix'
  | 'ui'
  | 'product'
  | 'ralph'
  | 'architecture'
  | 'explore'
  | 'commit'
  | 'work_report'
  | 'test'
  | 'review'
  | 'refactor'
  | 'onboard'
  | 'spec'
  | 'memory'
  | 'unknown';

export type WorkflowRoutingSource =
  | 'explicit'
  | 'guide'
  | 'delivery-rules'
  | 'keyword-scores'
  | 'fallback';

export type WorkflowRoutingCandidateStatus =
  | 'selected'
  | 'conflict'
  | 'suppressed';

export interface WorkflowRoutingCandidate {
  scenario: Exclude<WorkflowScenario, 'unknown'>;
  score: number;
  matchedRuleIds: string[];
  status: WorkflowRoutingCandidateStatus;
  suppressedBy?: Exclude<WorkflowScenario, 'unknown'>;
  reason: string;
}

export interface WorkflowRoutingDecision {
  source: WorkflowRoutingSource;
  selectedScenario: Exclude<WorkflowScenario, 'unknown'> | null;
  conflict: boolean;
  requiresClarification: boolean;
  reason: string;
  candidates: WorkflowRoutingCandidate[];
}

export interface WorkflowRouteResult {
  scenario: WorkflowScenario;
  confidence: 'high' | 'medium' | 'low';
  routingDecision: WorkflowRoutingDecision;
}
