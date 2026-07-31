export const GuidanceResultSchema = {
  type: 'object',
  properties: {
    mode: { type: 'string', enum: ['guidance'] },
    summary: { type: 'string' },
    input: { type: 'object', additionalProperties: true },
    instructions: { type: 'array', items: { type: 'string' } },
    outputContract: { type: 'object', additionalProperties: true },
    boundaries: { type: 'array', items: { type: 'string' } },
    nextSteps: { type: 'array', items: { type: 'string' } },
  },
  required: ['mode', 'summary', 'instructions', 'outputContract', 'boundaries'],
  additionalProperties: true,
} as const;

export interface GuidanceResult {
  mode: 'guidance';
  summary: string;
  input?: Record<string, unknown>;
  instructions: string[];
  outputContract: Record<string, unknown>;
  boundaries: string[];
  nextSteps?: string[];
}
