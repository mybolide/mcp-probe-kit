import { describe, expect, it } from 'vitest';
import { generateAgentsMdInner } from '../agents-md-template.js';
import { resolveProjectContextLayout } from '../project-context-layout.js';

const layout = resolveProjectContextLayout(process.cwd());

const baseInput = {
  layout,
  locale: 'zh-CN' as const,
  projectName: 'demo',
  projectVersion: '1.0.0',
  description: 'test',
  language: 'TypeScript',
  category: 'library',
  docs: [],
  projectRootPosix: '/repo',
  graphReady: false,
};

describe('generateAgentsMdInner', () => {
  it('includes memory workflow in zh-CN template', () => {
    const md = generateAgentsMdInner({ ...baseInput });
    expect(md).toContain('记忆');
    expect(md).toContain('start_bugfix');
    expect(md).toContain('memorize_asset');
    expect(md).toContain('mcp-probe-kit/SKILL.md');
    expect(md).toContain('@.agents/skills/mcp-probe-kit/SKILL.md');
    expect(md).toContain('待 Agent 落盘');
    expect(md).toContain('bugfix');
    expect(md).toContain('search_memory');
    expect(md).toContain('自动注入');
  });
});
