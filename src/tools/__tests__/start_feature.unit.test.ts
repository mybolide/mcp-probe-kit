import { describe, test, expect } from 'vitest';
import { startFeature as startFeatureTool } from '../start_feature.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ProjectTaskLedger } from '../../devcontrol/task-ledger.js';

// Legacy test cases exercise plan templates only. Without this wrapper,
// omitted project_root resolves to the real Neyna host workspace and these
// fixtures silently pollute the user's project SQLite database.
// The explicit sqlite integration test below still exercises the real default.
const startFeature = (args: any) => startFeatureTool({
  ...args,
  storage_mode: args?.storage_mode ?? 'files',
});

function structured(result: Awaited<ReturnType<typeof startFeature>>): any {
  if (!('structuredContent' in result)) throw new Error('structuredContent 缺失');
  return result.structuredContent;
}

describe('start_feature 单元测试', () => {
  test('Git/Node22 下默认 auto 仅交付 SQLite Feature，不输出文件式 Spec 模板', async () => {
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'probe-default-sqlite-only-'));
    execFileSync('git',['init','-q'],{cwd:root});
    try{
      const result=await startFeatureTool({
        feature_name:'sqlite-default-feature',
        description:'Verify default auto storage does not request Markdown Spec files',
        project_root:root,
      });
      expect(result.isError).not.toBe(true);
      const data=structured(result);
      expect(data.metadata.projectFeature.storage).toBe('project-sqlite');
      expect(data.metadata.specDraft.specOutputs).toEqual([]);
      expect(data.metadata.specDraft.structuredContent).toBeNull();
      expect(result.content[0].text).toContain('无需任务 Markdown');
      const db=new ProjectTaskLedger(root);
      try{
        expect(db.getFeature('sqlite-default-feature').draft.specOutputs).toEqual([]);
      }finally{db.close();}
      expect(fs.existsSync(path.join(root,'docs/specs'))).toBe(false);
    }finally{fs.rmSync(root,{recursive:true,force:true});}
  });
  test('缺少必填参数时返回错误', async () => {
    const result = await startFeature({});
    expect(result.isError).toBe(true);
  });

  test('明确 Git 项目时 start_feature 默认把 Feature 和执行计划持久化到独立 SQLite', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'probe-feature-native-'));
    execFileSync('git', ['init', '-q'], { cwd: root });
    try {
      const result = await startFeature({
        feature_name: 'native-memory',
        description: '为本地工程写入可追溯的功能规划和分层职责测试。',
        project_root: root, storage_mode: 'sqlite', spec_layout: 'flat',
      });
      expect(result.isError).not.toBe(true);
      const value = structured(result);
      expect(value.metadata.projectFeature.storage).toBe('project-sqlite');
      expect(value.metadata.specDraft.specOutputs).toEqual([]);
      expect(value.metadata.specDraft.guidance).toContain('不得生成');
      expect(value.metadata.specDraft.guidance).not.toContain('创建三个文件');
      expect(value.metadata.plan.steps.find((item: any) => item.id === 'check-spec').action)
        .toBe('validate_project_sqlite_feature');
      const admission = value.metadata.plan.steps.find((item: any) => item.id === 'devcontrol-execution-admission');
      expect(admission.type).toBe('agent_action');
      expect(admission.requiredInputs.join(' ')).toContain('release-work-approve');
      expect(value.metadata.plan.steps.find((item: any) => item.id === 'implement').dependsOn)
        .toContain('devcontrol-execution-admission');
      expect(value.metadata.plan.steps.find((item: any) => item.id === 'implement').action)
        .toBe('implement_only_claimed_devcontrol_leaf');
      const ids=value.metadata.plan.steps.map((item: any)=>item.id);
      expect(ids).toEqual(expect.arrayContaining([
        'release-scope-collect','release-work-split','release-work-agent-review','release-work-stage',
        'release-work-review','release-work-owner-approval',
      ]));
      const independent=value.metadata.plan.steps.find((item:any)=>
        item.id==='release-work-agent-review');
      expect(independent.action).toContain('independently_critique');
      expect(independent.requiredInputs.join(' ')).toContain('ORIGINAL');
      expect(independent.requiredInputs.join(' ')).toContain('six generic dimensions');
      expect(value.metadata.plan.steps.find((item:any)=>item.id==='release-work-stage').dependsOn)
        .toContain('release-work-agent-review');
      expect(independent.note).toContain('MCP is business-agnostic');
      expect(value.metadata.plan.steps.find((item: any)=>item.id==='release-work-review').dependsOn)
        .toContain('release-work-stage');
      expect(value.metadata.plan.steps.find((item: any)=>item.id==='devcontrol-execution-admission').dependsOn)
        .toContain('release-work-owner-approval');
      const db = new ProjectTaskLedger(root);
      try {
        expect(db.databasePath).toBe(path.join(root, '.mcp-probe-kit/state/devcontrol.sqlite3'));
        expect(db.getFeature('native-memory').status).toBe('draft');
        expect(db.getFeature('native-memory').plan.planId).toBe(value.metadata.plan.planId);
        expect(db.listFeatures()).toHaveLength(1);
        expect(db.getFeature('native-memory').revision).toBe(1);
        expect(db.getFeature('native-memory').draft.specOutputs).toEqual([]);
        expect(db.getFeature('native-memory').draft.guidance).not.toContain('requirements.md');
      } finally { db.close(); }
      expect(fs.existsSync(path.join(root,'docs/specs/native-memory/requirements.md'))).toBe(false);
      expect(execFileSync('git', ['status','--porcelain'], {cwd:root,encoding:'utf8'})).toBe('');
    } finally { fs.rmSync(root,{ recursive:true, force:true }); }
  });

  test('复杂需求默认 auto 触发 parent-child 并要求先拆分再回到 start_feature', async () => {
    const result = await startFeature({
      feature_name: 'mcp-v4',
      description: '跨模块协议、工具注册、Memory、Task Runtime 和兼容性矩阵的多阶段升级',
    });
    const value = structured(result);
    const plan = value.metadata.plan;
    const decomposition = plan.steps.find((step: any) => step.id === 'decompose-spec');
    const resume = plan.steps.find((step: any) => step.id === 'resume-with-subspecs');

    expect(value.metadata.layoutDecision.resolved).toBe('parent-child');
    expect(decomposition.type).toBe('agent_action');
    expect(resume.tool).toBe('start_feature');
    expect(resume.args.spec_layout).toBe('parent-child');
    expect(resume.args.subspecs).toMatch(/SubspecDefinition/);
    expect(plan.steps.some((step: any) => step.tool === 'add_feature')).toBe(false);
  });

  test('提供 subspecs 时生成内嵌 parent-child 规格草稿', async () => {
    const result = await startFeature({
      feature_name: 'commerce-v3',
      description: '商业系统版本升级',
      subspecs: [
        { id: 'foundation', title: '基础能力', fr: ['FR-1'] },
        { id: 'orders', title: '订单能力', fr: ['FR-2'], dependsOn: ['foundation'] },
      ],
    });
    const value = structured(result);
    const plan = value.metadata.plan;
    expect(value.metadata.layoutDecision.resolved).toBe('parent-child');
    expect(value.metadata.specDraft).toBeTruthy();
    expect(plan.steps.some((step: any) => step.id === 'write-spec')).toBe(true);
    expect(plan.steps.some((step: any) => step.id === 'decompose-spec')).toBe(false);
    expect(plan.steps.some((step: any) => step.tool === 'add_feature')).toBe(false);
  });

  test('flat 计划闭环且只引用 compact 可见工具', async () => {
    const result = await startFeature({
      feature_name: 'user-auth',
      description: '用户认证功能',
      docs_dir: 'docs',
      storage_mode: 'files',
    });
    const value = structured(result);
    const plan = value.metadata.plan;
    const tools = plan.steps.flatMap((step: any) => step.tool ? [step.tool] : []);
    const writeSpec = plan.steps.find((step: any) => step.id === 'write-spec');

    expect(plan.mode).toBe('delegated');
    expect(plan.contractVersion).toBe('2.0.0');
    expect(tools).toContain('init_project_context');
    expect(tools).toContain('check_spec');
    expect(tools).toContain('estimate');
    expect(tools).toContain('code_review');
    expect(tools).not.toContain('add_feature');
    expect(plan.steps.map((step: any) => step.id)).toEqual(
      expect.arrayContaining(['write-spec', 'check-spec', 'estimate', 'implement', 'test', 'review']),
    );
    expect(plan.steps.find((step: any) => step.id === 'implement').dependsOn)
      .toEqual(expect.arrayContaining(['check-spec', 'estimate']));
    expect(plan.declaredScope.projectRoot).toBeTruthy();
    expect(writeSpec.type).toBe('agent_action');
    expect(writeSpec.expectedOutputs).toContain('docs/specs/user-auth/requirements.md');
    expect(value.metadata.specDraft.structuredContent).toBeTruthy();
  });

  test('输出文本由 structured plan 渲染且没有隐藏工具指导', async () => {
    const result = await startFeature({ feature_name: 'user-auth', description: '用户认证功能', storage_mode: 'files' });
    const text = result.content[0].text;
    expect(text).toMatch(/执行计划/);
    expect(text).toMatch(/check_spec/);
    expect(text).toMatch(/estimate/);
    expect(text).toMatch(/graph-insights\/latest\.md/);
    expect(text).toMatch(/structuredContent\.metadata\.specDraft/);
    expect(text).toMatch(/状态回写协议/);
    expect(text).toMatch(/plan_heartbeat/);
    expect(text).toMatch(/resume_plan.*不会替代/s);
    expect(text).not.toMatch(/调用 MCP 工具.*add_feature/);
  });

  test('template_profile 被内嵌规格草稿采用', async () => {
    const result = await startFeature({
      feature_name: 'user-auth',
      description: '用户认证功能',
      template_profile: 'strict',
    });
    const value = structured(result);
    expect(value.metadata.specDraft.templateProfile).toBe('strict');
  });

  test('parent-child 布局与 subspecs 被内嵌规格草稿采用', async () => {
    const result = await startFeature({
      feature_name: 'commerce-v2',
      description: 'v2 版本升级',
      spec_layout: 'parent-child',
      subspecs: [{ id: '01-foundation', title: '数据底座', fr: ['FR-1'] }],
    });
    const value = structured(result);
    const draft = value.metadata.specDraft;
    expect(draft.specLayout).toBe('parent-child');
    expect(draft.subspecs).toEqual([{ id: '01-foundation', title: '数据底座', fr: ['FR-1'] }]);
    expect(draft.specOutputs).toContain('docs/specs/commerce-v2/subspecs/01-foundation/spec.md');
  });

  test('parent-child 拒绝无效子规格依赖', async () => {
    const result = await startFeature({
      feature_name: 'commerce-v2',
      description: 'v2 版本升级',
      spec_layout: 'parent-child',
      subspecs: [{ id: '01-foundation', title: '数据底座', fr: ['FR-1'], dependsOn: ['missing'] }],
    });
    expect(result.isError).toBe(true);
  });

  test('loop 模式使用 Agent 原生澄清并回到可见 start_feature', async () => {
    const result = await startFeature({
      feature_name: 'user-auth',
      description: '用户认证功能',
      requirements_mode: 'loop',
      loop_question_budget: 3,
    });
    const value = structured(result);
    const tools = value.metadata.plan.steps.flatMap((step: any) => step.tool ? [step.tool] : []);
    expect(value.mode).toBe('loop');
    expect(tools).toContain('start_feature');
    expect(tools).not.toContain('ask_user');
    expect(value.metadata.plan.steps.find((step: any) => step.id === 'loop-1').type).toBe('agent_action');
  });

  test('拒绝逃出规格目录的 feature_name', async () => {
    const result = await startFeature({ feature_name: '../../escape', description: '非法路径测试' });
    expect(result.isError).toBe(true);
  });
});
