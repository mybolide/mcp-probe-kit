import { describe, expect, test } from 'vitest';
import {
  buildParentChildSpecArtifacts,
  normalizeSubspecs,
  resolveSpecLayoutDecision,
} from '../parent-child-spec.js';

describe('parent-child 输入边界', () => {
  test('限制子规格数量，避免生成超大 MCP 响应', () => {
    const subspecs = Array.from({ length: 51 }, (_, index) => ({
      id: `module-${index + 1}`,
      title: `模块 ${index + 1}`,
      fr: [`FR-${index + 1}`],
    }));

    expect(() => normalizeSubspecs(subspecs, 'parent-child')).toThrow(/最多|50/);
  });

  test('限制子规格标题长度', () => {
    expect(() => normalizeSubspecs([
      { id: 'inventory', title: 'x'.repeat(121), fr: ['FR-1'] },
    ], 'parent-child')).toThrow(/title|120/);
  });

  test('转义子规格索引中的 Markdown 表格分隔符', () => {
    const artifacts = buildParentChildSpecArtifacts('docs', 'commerce-v2', '升级', [
      { id: 'inventory', title: '库存|台账', fr: ['FR-1'] },
    ]);

    expect(artifacts.templates.readme).toContain('库存\\|台账');
  });

  test('复杂多阶段需求在 auto 模式下选择 parent-child', () => {
    const decision = resolveSpecLayoutDecision({
      requested: 'auto',
      description: `MCP v4 架构升级，包含多个阶段与跨模块交付：
- R1 Tool Registry 与 dispatcher
- R2 Canonical Skill 和 delegated workflow
- R3 Memory / Qdrant 学习闭环
- R4 Legacy / Modern 双协议兼容
- R5 Task Runtime、progress 与 cancellation
- R6 conformance 测试矩阵`,
    });

    expect(decision.resolved).toBe('parent-child');
    expect(decision.score).toBeGreaterThanOrEqual(4);
    expect(decision.requiresSubspecDefinition).toBe(true);
  });

  test('简单局部功能在 auto 模式下保持 flat', () => {
    const decision = resolveSpecLayoutDecision({
      requested: 'auto',
      description: '为用户列表增加一个按邮箱搜索的输入框。',
    });

    expect(decision.resolved).toBe('flat');
    expect(decision.requiresSubspecDefinition).toBe(false);
  });

  test('已提供子规格时 auto 直接选择 parent-child', () => {
    const decision = resolveSpecLayoutDecision({
      requested: 'auto',
      description: '版本升级',
      subspecs: [{ id: 'core', title: '核心', fr: ['FR-1'] }],
    });

    expect(decision.resolved).toBe('parent-child');
    expect(decision.requiresSubspecDefinition).toBe(false);
  });

  test('显式 flat 覆盖复杂度自动判断', () => {
    const decision = resolveSpecLayoutDecision({
      requested: 'flat',
      description: '包含 Tool Registry、Memory、双协议和 Task Runtime 的大型架构升级',
      subspecs: [{ id: 'core', title: '核心', fr: ['FR-1'] }],
    });

    expect(decision.resolved).toBe('flat');
    expect(decision.reasons).toContain('调用方显式指定 flat');
  });
});
