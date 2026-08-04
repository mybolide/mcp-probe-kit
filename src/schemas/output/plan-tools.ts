const evidenceKindSchema = {
  type: 'string',
  enum: ['requirements', 'spec', 'implementation', 'test', 'review', 'memory', 'other'],
} as const;

export const PlanHeartbeatResultSchema = {
  type: 'object',
  properties: {
    stored: { type: 'boolean' },
    planId: { type: 'string' },
    status: { type: 'string' },
    currentStepId: { type: 'string' },
    completedStepIds: { type: 'array', items: { type: 'string' } },
    skippedSteps: { type: 'array', items: { type: 'object', additionalProperties: true } },
    unresolvedItems: { type: 'array', items: { type: 'string' } },
    evidenceCount: { type: 'number' },
    declaredScope: { type: 'object', additionalProperties: true },
    artifactCount: { type: 'number' },
    memoryCandidateCount: { type: 'number' },
    architectureCandidateCount: { type: 'number' },
    acceptanceResultCount: { type: 'number' },
    runtimeEvidenceCount: { type: 'number' },
    lastVerifiedRevision: { type: 'string' },
    statePath: { type: 'string' },
    updatedAt: { type: 'string' },
  },
  required: ['stored', 'planId', 'status', 'completedStepIds', 'statePath'],
} as const;

export const ResumePlanResultSchema = {
  type: 'object',
  properties: {
    found: { type: 'boolean' },
    record: { type: 'object', additionalProperties: true },
    readyStepIds: { type: 'array', items: { type: 'string' } },
    blockedSteps: { type: 'array', items: { type: 'object', additionalProperties: true } },
    nextStepId: { type: 'string' },
    nextAction: { type: 'string' },
    resumeContext: { type: 'object', additionalProperties: true },
  },
  required: ['found', 'readyStepIds', 'blockedSteps', 'nextAction'],
} as const;

export const ConvergeResultSchema = {
  type: 'object',
  properties: {
    passed: { type: 'boolean' },
    planId: { type: 'string' },
    status: { type: 'string' },
    blockers: { type: 'array', items: { type: 'string' } },
    missingEvidenceKinds: { type: 'array', items: evidenceKindSchema },
    requiredEvidenceKinds: { type: 'array', items: evidenceKindSchema },
    requiredQualityGates: { type: 'array', items: { type: 'string' } },
    missingQualityGates: { type: 'array', items: { type: 'string' } },
    incompleteStepIds: { type: 'array', items: { type: 'string' } },
    memoryWriteAllowed: { type: 'boolean' },
    nextAction: { type: 'string' },
    specGate: { type: 'object', additionalProperties: true },
    checkedAt: { type: 'string' },
  },
  required: ['passed', 'planId', 'status', 'blockers', 'memoryWriteAllowed', 'nextAction'],
} as const;
