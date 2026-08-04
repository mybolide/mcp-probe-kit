import { describe, expect, test } from 'vitest';
import { getOutputSchemaForTool } from '../output-schema-registry.js';

describe('workflow routing output schema', () => {
  test('workflow 注册独立 routingDecision 输出契约', () => {
    const schema = getOutputSchemaForTool('workflow') as any;

    expect(schema).toBeTruthy();
    expect(schema.required).toContain('routingDecision');
    expect(schema.properties.routingDecision.required).toEqual(
      expect.arrayContaining([
        'source',
        'selectedScenario',
        'conflict',
        'requiresClarification',
        'reason',
        'candidates',
      ]),
    );
    expect(schema.properties.routingDecision.properties.candidates.items.properties.status.enum)
      .toEqual(['selected', 'conflict', 'suppressed']);
  });
});
