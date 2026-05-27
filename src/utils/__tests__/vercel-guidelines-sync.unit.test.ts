import { describe, expect, it } from 'vitest';
import { parseVercelGuidelinesMarkdown } from '../vercel-guidelines-sync.js';
import * as fs from 'fs';
import * as path from 'path';

describe('vercel-guidelines-sync', () => {
  it('parses MUST/SHOULD/NEVER rules from markdown', () => {
    const sample = `# Title

## Interactions

### Keyboard

- MUST: Visible focus rings
- NEVER: outline: none without replacement

## Animation

- SHOULD: Prefer CSS animations
`;

    const records = parseVercelGuidelinesMarkdown(sample);
    expect(records).toHaveLength(3);
    expect(records[0].level).toBe('MUST');
    expect(records[0].section).toBe('Interactions');
    expect(records[0].category).toBe('ui-guidelines-vercel');
    expect(records[1].level).toBe('NEVER');
  });

  it('parses bundled fallback markdown file', () => {
    const fallback = path.join(process.cwd(), 'scripts', 'data', 'vercel-web-interface-guidelines.md');
    const markdown = fs.readFileSync(fallback, 'utf-8');
    const records = parseVercelGuidelinesMarkdown(markdown);
    expect(records.length).toBeGreaterThan(50);
    expect(records.some((item) => item.rule.includes('prefers-reduced-motion'))).toBe(true);
  });
});
