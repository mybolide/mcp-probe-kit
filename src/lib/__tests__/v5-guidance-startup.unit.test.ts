import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, test } from 'vitest';
import { V5_DEVC_ACTIONS, V5_DEVC_ACTION_GROUPS } from '../../devcontrol/action-catalog.js';
import { ensureMcpProbeKitBootstrapAtStartup, ensureMcpProbeKitBootstrap } from '../workflow-skill-installer.js';
import { renderV5DevControlActionReference } from '../v5-agent-action-reference.js';
import { renderV5AgentsMd } from '../v5-sqlite-guidance.js';
import { generateWorkflowSkillContent, MCP_PROBE_SKILL_REL_PATH } from '../workflow-skill-template.js';
import { formatAgentsContextVersionMarker, SKILL_GUIDANCE_MARKER, SKILL_GUIDANCE_REVISION } from '../workflow-skill-version.js';
import { VERSION } from '../../version.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive:true, force:true });
});
function tempGitProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-v5-guidance-'));
  roots.push(root);
  execFileSync('git', ['init', '-q', root], { timeout:3000, windowsHide:true });
  return root;
}

describe('v5 generated Skill and startup AGENTS guidance', () => {
  test('source-derived action catalog covers all guided v5 operations once, and Skill documents all', () => {
    const all = V5_DEVC_ACTION_GROUPS.flatMap(group => [...group.actions]);
    expect(all).toEqual(V5_DEVC_ACTIONS);
    expect(all.length).toBeGreaterThanOrEqual(74);
    expect(new Set(all).size).toBe(all.length);
    const doc = renderV5DevControlActionReference();
    const skill = generateWorkflowSkillContent(VERSION);
    expect(skill).toContain('DevControl operation reference');
    expect(skill).toContain('On every MCP startup');
    expect(skill).toContain('guidance');
    expect(skill).toContain('`self-review`');
    expect(skill).toContain('`reviewMode:"self"`');
    expect(skill).toContain('A separate Reviewer is OPTIONAL');
    expect(skill).toContain('refresh-protected-worktree');
    expect(skill).not.toContain('arrange `review-handoff` → independent');
    for (const action of all) {
      expect(doc).toContain('`' + action + '`');
      expect(skill).toContain('`' + action + '`');
    }
    for (const legacy of ['`start_feature`', '`resume_plan`', '`plan_heartbeat`']) {
      expect(doc).not.toContain(legacy);
    }
  });

  test.each(['zh-CN', 'en'])('%s managed AGENTS points to current action reference and startup freshness check', locale => {
    const text = renderV5AgentsMd(locale, '@.agents/skills/mcp-probe-kit/SKILL.md');
    expect(text).toContain('DevControl operation reference');
    expect(text).toContain(String(V5_DEVC_ACTIONS.length));
    expect(text).toContain(SKILL_GUIDANCE_REVISION);
    expect(text).toContain('history_session_bootstrap');
    expect(text).toContain('feature-task-approve');
    expect(text).toContain('gate-review');
    expect(text).toContain('self-review');
    expect(text).toContain('refresh-protected-worktree');
    expect(text).toMatch(/reviewMode=self|reviewMode:self/);
    expect(text).not.toContain('DIFFERENT reviewer perform review-submit');
    expect(text).not.toContain('**不同的独立 Reviewer**');
  });

  test('startup upgrades outdated same-version Skill and managed AGENTS, preserves user rules, then stays byte-identical', () => {
    const root = tempGitProject();
    const skillPath = path.join(root, MCP_PROBE_SKILL_REL_PATH);
    const agentsPath = path.join(root, 'AGENTS.md');
    fs.mkdirSync(path.dirname(skillPath), { recursive:true });
    const stale = generateWorkflowSkillContent(VERSION)
      .replace(SKILL_GUIDANCE_REVISION, 'v5-older-guidance');
    fs.writeFileSync(skillPath, stale, 'utf8');
    const outside = '# User rules\nDo not rewrite custom instructions.\n';
    fs.writeFileSync(agentsPath, [
      '<!-- mcp-probe:context begin -->',
      formatAgentsContextVersionMarker(VERSION),
      '## MCP (call first)',
      'OUTDATED v4 workflow guidance',
      '<!-- mcp-probe:context end -->',
      '',
      outside,
    ].join('\n'), 'utf8');

    const first = ensureMcpProbeKitBootstrapAtStartup(root);
    expect(first.error).toBeUndefined();
    expect(first.bootstrap?.skill.updated).toBe(true);
    expect(first.bootstrap?.agentsMd.updated).toBe(true);
    const updatedSkill = fs.readFileSync(skillPath, 'utf8');
    const updatedAgents = fs.readFileSync(agentsPath, 'utf8');
    expect(updatedSkill).toContain('<!-- ' + SKILL_GUIDANCE_MARKER + ': ' + SKILL_GUIDANCE_REVISION + ' -->');
    expect(updatedSkill).toContain('DevControl operation reference');
    expect(updatedAgents).toContain('DevControl operation reference');
    expect(updatedSkill).toContain('A separate Reviewer is OPTIONAL');
    expect(updatedAgents).toContain('self-review');
    expect(updatedAgents).toContain('refresh-protected-worktree');
    expect(updatedAgents).toContain(outside.trim());
    expect(updatedAgents).not.toContain('OUTDATED v4 workflow guidance');
    expect((updatedAgents.match(/mcp-probe:context begin/g) ?? [])).toHaveLength(1);

    const second = ensureMcpProbeKitBootstrapAtStartup(root);
    expect(second.bootstrap?.skill.updated).toBe(false);
    expect(second.bootstrap?.agentsMd.updated).toBe(false);
    expect(fs.readFileSync(skillPath, 'utf8')).toBe(updatedSkill);
    expect(fs.readFileSync(agentsPath, 'utf8')).toBe(updatedAgents);
  });

  test('previous evidence-policy guidance at package 5.0.0 is automatically upgraded on another project', () => {
    const root=tempGitProject();
    const skillPath=path.join(root,MCP_PROBE_SKILL_REL_PATH);
    const agentsPath=path.join(root,'AGENTS.md');
    fs.mkdirSync(path.dirname(skillPath),{recursive:true});
    const previousRevision='v5-sqlite-devcontrol-20261029-action-guide';
    const existingSkill=generateWorkflowSkillContent(VERSION)
      .replace(SKILL_GUIDANCE_REVISION,previousRevision)
      .replace('DevControl NEVER\n   executes project-specific tests','DevControl can execute project-specific tests');
    fs.writeFileSync(skillPath,existingSkill,'utf8');
    const custom='# Keep user project coding standards intact\nNo secrets in Git.\n';
    const priorAgents=[
      '<!-- mcp-probe:context begin -->',
      formatAgentsContextVersionMarker(VERSION),
      '<!-- '+SKILL_GUIDANCE_MARKER+': '+previousRevision+' -->',
      'Old Gate instruction: MCP launches XCTest and Flutter.',
      '<!-- mcp-probe:context end -->','',custom,
    ].join('\n');
    fs.writeFileSync(agentsPath,priorAgents,'utf8');
    const first=ensureMcpProbeKitBootstrapAtStartup(root);
    expect(first.error).toBeUndefined();
    expect(first.bootstrap?.skill.updated).toBe(true);
    expect(first.bootstrap?.agentsMd.updated).toBe(true);
    const skill=fs.readFileSync(skillPath,'utf8');
    const agents=fs.readFileSync(agentsPath,'utf8');
    expect(skill).toContain(SKILL_GUIDANCE_REVISION);
    expect(skill).toContain('DevControl NEVER');
    expect(skill).toContain('`task-closure-status`');
    expect(agents).toContain(SKILL_GUIDANCE_REVISION);
    expect(agents).toContain('gate-review');
    expect(agents).toContain('All legacy Gate names are acceptance criteria');
    expect(agents).not.toContain('Old Gate instruction');
    expect(agents).toContain(custom.trim());
    const second=ensureMcpProbeKitBootstrap(root);
    expect(second.skill.updated).toBe(false);
    expect(second.agentsMd.updated).toBe(false);
    expect(fs.readFileSync(skillPath,'utf8')).toBe(skill);
    expect(fs.readFileSync(agentsPath,'utf8')).toBe(agents);
  });

  test('first-time new projects get evidence-only instructions without writing workflow documents', () => {
    const root=tempGitProject();
    const result=ensureMcpProbeKitBootstrapAtStartup(root);
    expect(result.bootstrap?.skill.created).toBe(true);
    expect(result.bootstrap?.agentsMd.created).toBe(true);
    const skill=fs.readFileSync(path.join(root,MCP_PROBE_SKILL_REL_PATH),'utf8');
    const agents=fs.readFileSync(path.join(root,'AGENTS.md'),'utf8');
    expect(skill).toContain('DevControl NEVER');
    expect(skill).toContain('`review-submit`');
    expect(skill).toContain('`self-review`');
    expect(agents).toContain('self-review');
    expect(agents).toContain('OPTIONAL');
    expect(agents).toContain(SKILL_GUIDANCE_REVISION);
    expect(fs.existsSync(path.join(root,'docs','requirements.md'))).toBe(false);
  });

  test('first explicit project tool call performs the same revision check when startup could not locate workspace', () => {
    const root = tempGitProject();
    const first = ensureMcpProbeKitBootstrap(root);
    expect(first.skill.created).toBe(true);
    const skill = fs.readFileSync(path.join(root, MCP_PROBE_SKILL_REL_PATH), 'utf8');
    expect(skill).toContain(SKILL_GUIDANCE_REVISION);
    const second = ensureMcpProbeKitBootstrap(root);
    expect(second.skill.updated).toBe(false);
    expect(second.agentsMd.updated).toBe(false);
  });
});
