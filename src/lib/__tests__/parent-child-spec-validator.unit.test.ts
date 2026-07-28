import { describe, expect, test } from 'vitest';
import { extractFrIds, validateParentChildSpecDocuments } from '../spec-validator.js';

const requirements = `# 需求
## 功能概述
## 需求列表
### FR-1
WHEN 请求 THEN 系统 SHALL 返回计划。
### FR-2
WHEN 请求 THEN 系统 SHALL 校验子规格。
## 非功能需求
## 依赖关系`;

const design = `# 设计
## 概述
对应需求: FR-1, FR-2
## 技术方案
## 文件结构`;

const parentTasks = `# 任务
## 交付物清单
## 任务列表
## 需求覆盖矩阵
FR-1
FR-2
## 文件变更清单
## 子规格任务覆盖矩阵
- 01-foundation/1.1
- 06-inventory-ledger/1.1`;

const readme = `# 母规格
## 原则
保持 v1 兼容。
## 子规格索引
01-foundation
06-inventory-ledger
## 依赖关系
06 依赖 01。
## 里程碑
先底座，再库存。`;

function childSpec(fr: string) {
  return `# 子规格
## 范围
实现 ${fr}。
## 需求回链
${fr}
WHEN 请求 THEN 系统 SHALL 完成 ${fr}。
## 涉及文件
- src/example.ts
## 不做项
- 不做 ${fr} 以外模块`;
}

function childTasks(fr: string) {
  return `# 子任务
- [ ] 1.1 实现 ${fr}
  - 证据块: src/example.ts:1
  - _需求: ${fr}_`;
}

const manifest = JSON.stringify({
  layout: 'parent-child',
  subspecs: [
    { id: '01-foundation', title: '数据底座', fr: ['FR-1'] },
    { id: '06-inventory-ledger', title: '库存台账', fr: ['FR-2'], dependsOn: ['01-foundation'] },
  ],
});

describe('parent-child 规格校验', () => {
  test('识别 Markdown 强调标记中的 FR ID', () => {
    expect(extractFrIds('_需求: FR-1_')).toEqual(['FR-1']);
  });

  test('有效的母子规格通过并汇总子规格', () => {
    const report = validateParentChildSpecDocuments({
      requirements,
      design,
      tasks: parentTasks,
      readme,
      manifest,
      subspecs: {
        '01-foundation': { spec: childSpec('FR-1'), tasks: childTasks('FR-1') },
        '06-inventory-ledger': { spec: childSpec('FR-2'), tasks: childTasks('FR-2') },
      },
    });

    expect(report.passed).toBe(true);
    expect(report.subspecIds).toEqual(['01-foundation', '06-inventory-ledger']);
  });

  test('拦截未映射的母 FR、缺失子规格和任务引用断链', () => {
    const report = validateParentChildSpecDocuments({
      requirements: requirements.replace('## 非功能需求', `### FR-3
WHEN 请求 THEN 系统 SHALL 保留兼容性。
## 非功能需求`),
      design,
      tasks: parentTasks.replace('06-inventory-ledger/1.1', ''),
      readme,
      manifest: JSON.stringify({
        layout: 'parent-child',
        subspecs: [
          { id: '01-foundation', title: '数据底座', fr: ['FR-1'] },
          { id: '06-inventory-ledger', title: '库存台账', fr: ['FR-2'] },
        ],
      }),
      subspecs: {
        '01-foundation': { spec: childSpec('FR-1'), tasks: childTasks('FR-1') },
      },
    });

    expect(report.passed).toBe(false);
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'unmapped_parent_fr' }),
      expect.objectContaining({ code: 'missing_subspec' }),
    ]));
  });

  test('拦截跨子规格重复的不做项', () => {
    const repeatedSpec = childSpec('FR-1').replace('不做 FR-1 以外模块', '不做报表导出');
    const report = validateParentChildSpecDocuments({
      requirements,
      design,
      tasks: parentTasks,
      readme,
      manifest,
      subspecs: {
        '01-foundation': { spec: repeatedSpec, tasks: childTasks('FR-1') },
        '06-inventory-ledger': {
          spec: childSpec('FR-2').replace('不做 FR-2 以外模块', '不做报表导出'),
          tasks: childTasks('FR-2'),
        },
      },
    });

    expect(report.passed).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({ code: 'duplicate_out_of_scope' }));
  });

  test('拦截子任务缺失本子规格 FR 回链', () => {
    const report = validateParentChildSpecDocuments({
      requirements,
      design,
      tasks: parentTasks,
      readme,
      manifest,
      subspecs: {
        '01-foundation': { spec: childSpec('FR-1'), tasks: childTasks('FR-2') },
        '06-inventory-ledger': { spec: childSpec('FR-2'), tasks: childTasks('FR-2') },
      },
    });

    expect(report.passed).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({ code: 'missing_subspec_task_fr' }));
  });

  test('逐任务校验证据块和 FR 回链，不能用其他任务的数量补齐', () => {
    const malformedTasks = `# 子任务
- [ ] 1.1 实现底座
  - 证据块: src/example.ts:1
  - 证据块: src/example.ts:2
  - _需求: FR-1_
- [ ] 1.2 补充迁移`;
    const report = validateParentChildSpecDocuments({
      requirements,
      design,
      tasks: `${parentTasks}\n- 01-foundation/1.2`,
      readme,
      manifest,
      subspecs: {
        '01-foundation': { spec: childSpec('FR-1'), tasks: malformedTasks },
        '06-inventory-ledger': { spec: childSpec('FR-2'), tasks: childTasks('FR-2') },
      },
    });

    expect(report.passed).toBe(false);
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'missing_task_evidence', message: expect.stringContaining('1.2') }),
      expect.objectContaining({ code: 'missing_task_fr', message: expect.stringContaining('1.2') }),
    ]));
  });
});
