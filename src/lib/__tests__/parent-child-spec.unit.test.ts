import { describe, expect, test } from 'vitest';
import { buildParentChildSpecArtifacts, normalizeSubspecs } from '../parent-child-spec.js';

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
});
