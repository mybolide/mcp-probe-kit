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
  it('generates v5 SQLite + DevControl only guidance in zh-CN, without replacing user-owned docs', () => {
    const md = generateAgentsMdInner({ ...baseInput });
    expect(md).toContain('SQLite + DevControl');
    expect(md).toContain('start_bugfix');
    expect(md).toContain('不支持 v4');
    expect(md).toContain('mcp-probe-kit/SKILL.md');
    expect(md).toContain('@.agents/skills/mcp-probe-kit/SKILL.md');
    expect(md).toContain('idea-capture');
    expect(md).toContain('plan-approve');
    expect(md).toContain('claim');
    expect(md).toContain('complete');
    expect(md).toContain('verify');
    expect(md).toContain('history_session_bootstrap');
    expect(md).toContain('history_session_checkpoint');
    expect(md).toContain('resume_plan');
    expect(md).toContain('不支持 v4');
    expect(md).not.toContain('先调用 `resume_plan`');
  });
});
