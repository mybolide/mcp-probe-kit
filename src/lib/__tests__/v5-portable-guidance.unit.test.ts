import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {afterEach, describe, expect, it} from 'vitest';
import {ensureMcpProbeKitBootstrap} from '../workflow-skill-installer.js';
import {resolveWorkspaceRootWithMeta} from '../workspace-root.js';
import {generateWorkflowSkillContent, MCP_PROBE_SKILL_REL_PATH} from '../workflow-skill-template.js';
import {renderV5AgentsMd} from '../v5-sqlite-guidance.js';
import {renderV5DevControlActionReference} from '../v5-agent-action-reference.js';
import {SKILL_GUIDANCE_REVISION} from '../workflow-skill-version.js';
import {VERSION} from '../../version.js';

const roots:string[]=[];
afterEach(()=>{
  for(const root of roots.splice(0)) fs.rmSync(root,{recursive:true,force:true});
});

describe('portable generated v5 project guidance',()=>{
  it('installs managed guidance at a non-Git parent without reparenting to a child repository',()=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'portable-multi-git-workspace-'));
    roots.push(root);
    const client=path.join(root,'client');
    const server=path.join(root,'server');
    fs.mkdirSync(client);
    fs.mkdirSync(server);
    for(const child of [client,server])
      execFileSync('git',['init','-q',child],{timeout:3000,windowsHide:true});
    fs.writeFileSync(path.join(root,'AGENTS.md'),
      '# Workspace owner rules\nKeep both child repositories independent.\n');
    expect(fs.existsSync(path.join(root,'.git'))).toBe(false);
    expect(resolveWorkspaceRootWithMeta(root)).toMatchObject({
      root,source:'explicit',explicitHonored:true,
    });
    const result=ensureMcpProbeKitBootstrap(root);
    expect(result.skill.skillRelPath).toBe(MCP_PROBE_SKILL_REL_PATH);
    expect(fs.existsSync(path.join(root,MCP_PROBE_SKILL_REL_PATH))).toBe(true);
    expect(fs.readFileSync(path.join(root,'AGENTS.md'),'utf8'))
      .toContain('Keep both child repositories independent.');
    expect(fs.existsSync(path.join(root,'.git'))).toBe(false);
    for(const child of [client,server]){
      expect(fs.existsSync(path.join(child,'.git'))).toBe(true);
      expect(fs.existsSync(path.join(child,'AGENTS.md'))).toBe(false);
    }
  });

  it('uses Git-root-relative CLI and guidance examples, with a safe MCP discovery fallback',()=>{
    const skill=generateWorkflowSkillContent(VERSION);
    const actions=renderV5DevControlActionReference();
    const agents=renderV5AgentsMd('zh-CN','@.agents/skills/mcp-probe-kit/SKILL.md');
    for(const generated of [skill,actions,agents]){
      expect(generated).not.toContain('/ABSOLUTE/');
      expect(generated).not.toContain('/Users/');
      expect(generated).not.toContain('/home/');
      expect(generated).toContain('project_root');
    }
    expect(skill).toContain('probe install-agent --project-root .');
    expect(skill).toContain('./.mcp-probe-kit/bin/probe devcontrol next --project-root .');
    expect(agents).toContain('probe install-agent --project-root .');
    expect(agents).toContain('@.agents/skills/mcp-probe-kit/SKILL.md');
    expect(actions).toContain('{"action":"next","input":{}}');
    expect(skill).toContain('real absolute');
    expect(agents).toContain('绝对');
  });

  it('upgrades old same-version managed guidance without rewriting user-owned rules',()=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'portable-mcp-guidance-'));
    roots.push(root);
    execFileSync('git',['init','-q',root],{timeout:3000,windowsHide:true});
    fs.writeFileSync(path.join(root,'AGENTS.md'),
      '# User rules\nNever skip real tests.\n','utf8');
    const first=ensureMcpProbeKitBootstrap(root);
    expect(first.skill.created).toBe(true);
    const skillPath=path.join(root,MCP_PROBE_SKILL_REL_PATH);
    const agentsPath=path.join(root,'AGENTS.md');
    const skill=fs.readFileSync(skillPath,'utf8');
    const agents=fs.readFileSync(agentsPath,'utf8');
    expect(skill).toContain(SKILL_GUIDANCE_REVISION);
    expect(agents).toContain(SKILL_GUIDANCE_REVISION);
    expect(agents).toContain('Never skip real tests.');
    expect(skill).not.toContain(root);
    expect(agents).not.toContain(root);

    const old='v5-sqlite-devcontrol-20261102-owned-guidance-r19';
    fs.writeFileSync(skillPath,skill.replaceAll(SKILL_GUIDANCE_REVISION,old),'utf8');
    fs.writeFileSync(agentsPath,agents.replaceAll(SKILL_GUIDANCE_REVISION,old),'utf8');
    const refreshed=ensureMcpProbeKitBootstrap(root);
    expect(refreshed.skill.updated).toBe(true);
    expect(refreshed.agentsMd.updated).toBe(true);
    expect(fs.readFileSync(skillPath,'utf8')).toBe(skill);
    expect(fs.readFileSync(agentsPath,'utf8')).toBe(agents);
    const repeat=ensureMcpProbeKitBootstrap(root);
    expect(repeat.skill.updated).toBe(false);
    expect(repeat.agentsMd.updated).toBe(false);
  });
});
