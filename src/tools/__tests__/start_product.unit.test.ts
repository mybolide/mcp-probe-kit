import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { startProduct } from '../start_product.js';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

function makeProjectRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'start-product-'));
  tempDirs.push(root);
  return root;
}

describe('start_product', () => {
  test('从 description 的结构化段落提取目标用户和核心约束', async () => {
    const root = makeProjectRoot();
    const result = await startProduct({
      product_name: 'rc4 acceptance product',
      project_root: root,
      description: [
        '目标：为开发团队提供一个只读的项目状态摘要面板。',
        '',
        '目标用户：',
        'TypeScript 项目维护者',
        '',
        '核心约束：',
        '- 不修改业务数据',
        '- 不引入登录系统',
        '- 仅展示已有状态',
      ].join('\n'),
    });

    expect(result.isError).toBe(false);
    if (!('structuredContent' in result) || !result.structuredContent) {
      throw new Error('missing structuredContent');
    }
    const metadata = result.structuredContent.metadata as Record<string, unknown>;
    expect(metadata.productBrief).toEqual({
      targetUsers: 'TypeScript 项目维护者',
      constraints: '不修改业务数据；不引入登录系统；仅展示已有状态',
    });
    const plan = metadata.plan as Record<string, unknown>;
    expect(plan.workflowVersion).toBe('4.0.0');
    expect(result.content[0]?.text).toContain('目标用户：TypeScript 项目维护者');
  });

  test('显式参数优先于 description 提取结果', async () => {
    const root = makeProjectRoot();
    const result = await startProduct({
      product_name: 'explicit product',
      project_root: root,
      description: '目标用户：旧用户\n核心约束：旧约束',
      target_users: '显式用户',
      constraints: '显式约束',
    });

    expect(result.isError).toBe(false);
    if (!('structuredContent' in result) || !result.structuredContent) {
      throw new Error('missing structuredContent');
    }
    const metadata = result.structuredContent.metadata as Record<string, unknown>;
    expect(metadata.productBrief).toEqual({
      targetUsers: '显式用户',
      constraints: '显式约束',
    });
  });

  test('生成产品产物证据驱动的正式 Plan，而不是软件实现 Plan', async () => {
    const root = makeProjectRoot();
    const result = await startProduct({
      product_name: 'product closure',
      project_root: root,
      description: '为项目维护者提供只读状态看板。\n目标用户：项目维护者\n核心约束：不修改业务数据',
    });

    expect(result.isError).toBe(false);
    if (!('structuredContent' in result) || !result.structuredContent) {
      throw new Error('missing structuredContent');
    }
    const structured = result.structuredContent as any;
    const plan = structured.metadata.plan;
    const ids = plan.steps.map((step: any) => step.id);
    const byId = new Map<string, any>(
      plan.steps.map((step: any) => [step.id, step] as [string, any]),
    );

    expect(plan).toMatchObject({
      contractVersion: '2.0.0',
      workflow: 'product',
      requiredEvidenceKinds: ['requirements', 'review'],
    });
    expect(plan.declaredScope).toMatchObject({
      productName: 'product closure',
      softwareImplementationRequired: false,
      includeDesignSystem: true,
    });
    expect(plan.qualityGates).toEqual([
      'product-brief-complete',
      'product-requirements-accepted',
      'product-prototype-consistent',
      'product-visual-accepted',
      'product-package-reviewed',
    ]);
    expect(ids).toEqual(expect.arrayContaining([
      'brief',
      'clarify',
      'prd',
      'prd-review',
      'prototype-docs',
      'design-contract',
      'save-design-system',
      'html-prototype',
      'prototype-acceptance',
      'package-review',
      'update-context',
    ]));
    expect(byId.get('design-contract')).toMatchObject({
      tool: 'ui_design_system',
      dependsOn: ['prd-review'],
      outputs: [],
    });
    expect(byId.get('save-design-system')).toMatchObject({
      type: 'agent_action',
      dependsOn: ['design-contract'],
    });
    expect(byId.get('html-prototype')).toMatchObject({
      tool: 'start_ui',
      dependsOn: ['prototype-docs', 'save-design-system'],
    });
    expect(byId.get('html-prototype').completionEvidence).toEqual(expect.arrayContaining([
      '记录子 plan_id',
      '子 Plan converge passed=true',
    ]));
    expect(ids).not.toContain('code-review');
    expect(ids).not.toContain('test');
    expect(structured.steps).toHaveLength(plan.steps.length);
    expect(structured.nextSteps.at(-1)).toContain('converge');
    expect(result.content[0]?.text).toContain('plan_heartbeat');
    expect(result.content[0]?.text).toContain('resume_plan');
    expect(result.content[0]?.text).toContain('converge');
  });

  test('skip_design_system 时移除设计系统步骤并调整子计划依赖', async () => {
    const root = makeProjectRoot();
    const result = await startProduct({
      product_name: 'no design product',
      project_root: root,
      description: '为内部运营生成可交互原型。',
      skip_design_system: true,
    });
    if (!('structuredContent' in result) || !result.structuredContent) {
      throw new Error('missing structuredContent');
    }
    const plan = (result.structuredContent as any).metadata.plan;
    const byId = new Map<string, any>(
      plan.steps.map((step: any) => [step.id, step] as [string, any]),
    );

    expect(plan.declaredScope.includeDesignSystem).toBe(false);
    expect(byId.has('design-contract')).toBe(false);
    expect(byId.has('save-design-system')).toBe(false);
    expect(byId.get('html-prototype').dependsOn).toEqual(['prototype-docs']);
  });

  test('拒绝逃出项目根目录的 docs_dir 和 requirements_file', async () => {
    const root = makeProjectRoot();
    const invalidDocs = await startProduct({
      project_root: root,
      description: '产品描述',
      docs_dir: '../outside',
    });
    expect(invalidDocs.isError).toBe(true);
    expect(invalidDocs.content[0]?.text).toContain('docs_dir');

    const invalidRequirement = await startProduct({
      project_root: root,
      requirements_file: '../outside.md',
    });
    expect(invalidRequirement.isError).toBe(true);
    expect(invalidRequirement.content[0]?.text).toContain('requirements_file');
  });
});
