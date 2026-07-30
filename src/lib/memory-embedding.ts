import type { MemoryStatus } from './memory-model.js';

export interface MemoryEmbeddingInput {
  name: string;
  type: string;
  description: string;
  summary: string;
  tags: string[];
  usage?: string;
  evidence?: string[];
  applicability?: string;
  status?: MemoryStatus;
  content: string;
}

export function buildMemoryEmbeddingInput(input: MemoryEmbeddingInput): string {
  return [
    `name: ${input.name}`,
    `type: ${input.type}`,
    `description: ${input.description}`,
    `summary: ${input.summary}`,
    input.tags.length > 0 ? `tags: ${input.tags.join(', ')}` : '',
    input.usage ? `usage: ${input.usage}` : '',
    input.applicability ? `applicability: ${input.applicability}` : '',
    input.evidence && input.evidence.length > 0
      ? `evidence: ${input.evidence.join(' | ')}`
      : '',
    input.status ? `status: ${input.status}` : '',
    `content:\n${input.content}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}
