const WorkflowScenarioSchema = {
  type: 'string',
  enum: [
    'feature',
    'bugfix',
    'ui',
    'product',
    'ralph',
    'architecture',
    'explore',
    'commit',
    'work_report',
    'test',
    'review',
    'refactor',
    'onboard',
    'spec',
    'memory',
    'unknown',
  ],
} as const;

const RoutableWorkflowScenarioSchema = {
  type: 'string',
  enum: WorkflowScenarioSchema.enum.filter((value) => value !== 'unknown'),
} as const;

const WorkflowRoutingCandidateSchema = {
  type: 'object',
  properties: {
    scenario: RoutableWorkflowScenarioSchema,
    score: { type: 'number' },
    matchedRuleIds: { type: 'array', items: { type: 'string' } },
    status: { type: 'string', enum: ['selected', 'conflict', 'suppressed'] },
    suppressedBy: RoutableWorkflowScenarioSchema,
    reason: { type: 'string' },
  },
  required: ['scenario', 'score', 'matchedRuleIds', 'status', 'reason'],
} as const;

export const WorkflowRoutingResultSchema = {
  type: 'object',
  properties: {
    scenario: WorkflowScenarioSchema,
    scenarioLabel: { type: 'string' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    summary: { type: 'string' },
    firstTool: {
      anyOf: [{ type: 'string' }, { type: 'null' }],
    },
    firstToolArgsHint: {
      anyOf: [{ type: 'object', additionalProperties: true }, { type: 'null' }],
    },
    phases: { type: 'array', items: { type: 'object', additionalProperties: true } },
    avoid: { type: 'array', items: { type: 'string' } },
    memoryNotes: { type: 'array', items: { type: 'string' } },
    selectionGuide: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          signal: { type: 'string' },
          firstTool: { type: 'string' },
          note: { type: 'string' },
        },
        required: ['signal', 'firstTool'],
      },
    },
    agentSelectionRules: { type: 'array', items: { type: 'string' } },
    routingDecision: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          enum: ['explicit', 'guide', 'delivery-rules', 'keyword-scores', 'fallback'],
        },
        selectedScenario: {
          anyOf: [RoutableWorkflowScenarioSchema, { type: 'null' }],
        },
        conflict: { type: 'boolean' },
        requiresClarification: { type: 'boolean' },
        reason: { type: 'string' },
        candidates: { type: 'array', items: WorkflowRoutingCandidateSchema },
      },
      required: [
        'source',
        'selectedScenario',
        'conflict',
        'requiresClarification',
        'reason',
        'candidates',
      ],
    },
    projectSkill: { type: 'object', additionalProperties: true },
    agentsMd: { type: 'object', additionalProperties: true },
    handles: { type: 'object', additionalProperties: true },
  },
  required: [
    'scenario',
    'scenarioLabel',
    'confidence',
    'summary',
    'firstTool',
    'phases',
    'avoid',
    'memoryNotes',
    'routingDecision',
  ],
} as const;
