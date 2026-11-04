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
    const english=renderV5AgentsMd('en','@.agents/skills/mcp-probe-kit/SKILL.md');
    for(const generated of [skill,actions,agents,english]){
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
    expect(english).toContain('Git-free workspace');
    expect(skill).toContain('Git is OPTIONAL');
    for(const generated of [skill,actions,agents]){
      expect(generated).not.toContain('/ABSOLUTE/GIT/PROJECT');
      expect(generated).not.toContain("target Git project's managed Skill");
    }
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

  it('generates current full-scope deferred review guidance for Skill and both AGENTS locales',()=>{
    const guidance=[
      generateWorkflowSkillContent(VERSION),
      renderV5AgentsMd('zh-CN','@.agents/skills/mcp-probe-kit/SKILL.md'),
      renderV5AgentsMd('en','@.agents/skills/mcp-probe-kit/SKILL.md'),
    ];
    for(const generated of guidance){
      expect(generated).toContain(SKILL_GUIDANCE_REVISION);
      expect(generated).toContain('resume-verification');
      expect(generated).toContain('overlappingPaths');
      expect(generated).toContain('reviewedHead');
      expect(generated).toMatch(/original (frozen )?patch|原冻结补丁/);
      expect(generated).toMatch(/frozen (scope|allowed paths)|冻结范围|冻结允许范围/);
      expect(generated).toContain('quarantineUnknown');
      expect(generated).toContain('reviewedHashes');
      expect(generated).toContain('verifiedIndependentDeliveries');
      for(const action of ['task-content-get','task-content-stage','task-content-check',
        'task-content-review','task-content-approve','task-content-withdraw'])
        expect(generated).toContain(action);
      for(const action of ['decision-request-save','decision-request-list',
        'decision-request-get','decision-request-respond','decision-request-withdraw'])
        expect(generated).toContain(action);
    }
  });

  it('upgrades a prior r31 installation at the same package version without losing user AGENTS rules',()=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'portable-r31-to-r32-'));
    roots.push(root);
    execFileSync('git',['init','-q',root],{timeout:3000,windowsHide:true});
    fs.writeFileSync(path.join(root,'AGENTS.md'),'# Owner rules\nPreserve original test receipts.\n');
    ensureMcpProbeKitBootstrap(root);
    const skillPath=path.join(root,MCP_PROBE_SKILL_REL_PATH);
    const agentsPath=path.join(root,'AGENTS.md');
    const previous='v5-sqlite-devcontrol-20261103-deferred-scope-r31';
    for(const file of [skillPath,agentsPath]){
      fs.writeFileSync(file,fs.readFileSync(file,'utf8').replaceAll(SKILL_GUIDANCE_REVISION,previous));
    }
    const upgraded=ensureMcpProbeKitBootstrap(root);
    expect(upgraded.skill.updated).toBe(true);
    expect(upgraded.agentsMd.updated).toBe(true);
    expect(fs.readFileSync(skillPath,'utf8')).toContain(SKILL_GUIDANCE_REVISION);
    const agents=fs.readFileSync(agentsPath,'utf8');
    expect(agents).toContain(SKILL_GUIDANCE_REVISION);
    expect(agents).toContain('Preserve original test receipts.');
    const repeat=ensureMcpProbeKitBootstrap(root);
    expect(repeat.skill.updated).toBe(false);
    expect(repeat.agentsMd.updated).toBe(false);
  });

  it('upgrades r32 Skill and AGENTS to r33 even when MCP still reports package 5.0.0',()=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'portable-recovery-r32-r33-'));
    roots.push(root);
    execFileSync('git',['init','-q',root],{timeout:3000,windowsHide:true});
    fs.writeFileSync(path.join(root,'AGENTS.md'),
      '# User source rules\nDo not delete other Agent files or skip real Gates.\n');
    ensureMcpProbeKitBootstrap(root);
    const skill=path.join(root,MCP_PROBE_SKILL_REL_PATH);
    const agents=path.join(root,'AGENTS.md');
    const previous='v5-sqlite-devcontrol-20261103-deferred-scope-r32';
    for(const file of [skill,agents])
      fs.writeFileSync(file,fs.readFileSync(file,'utf8').replaceAll(SKILL_GUIDANCE_REVISION,previous));
    const result=ensureMcpProbeKitBootstrap(root);
    expect(result.skill.updated).toBe(true);
    expect(result.agentsMd.updated).toBe(true);
    for(const file of [skill,agents]){
      const text=fs.readFileSync(file,'utf8');
      expect(text).toContain(SKILL_GUIDANCE_REVISION);
      expect(text).toContain('quarantineUnknown');
      expect(text).toContain('reviewedHashes');
      expect(text).toContain('verifiedIndependentDeliveries');
    }
    expect(fs.readFileSync(agents,'utf8'))
      .toContain('Do not delete other Agent files or skip real Gates.');
    const repeat=ensureMcpProbeKitBootstrap(root);
    expect(repeat.skill.updated).toBe(false);
    expect(repeat.agentsMd.updated).toBe(false);
  });
});
