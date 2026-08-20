import { describe, expect, test } from 'vitest';
import {
  appendMemoryCandidatePrepNote,
  assertNoProjectScopedMemoryFields,
  CONVERGE_MEMORY_NEXT_ACTION,
  MEMORIZE_ASSET_TOOL_DESCRIPTION,
} from '../memory-persistence-guidance.js';

describe('memory-persistence-guidance', () => {
  test('memorize 工具描述强调跨项目共享且禁止项目字段', () => {
    expect(MEMORIZE_ASSET_TOOL_DESCRIPTION).toContain('跨项目');
    expect(MEMORIZE_ASSET_TOOL_DESCRIPTION).toContain('禁止传 source_project');
  });

  test('converge 通过后给出沉淀 checklist', () => {
    expect(CONVERGE_MEMORY_NEXT_ACTION).toContain('沉淀记忆前请确认');
    expect(CONVERGE_MEMORY_NEXT_ACTION).toContain('source_project');
    expect(CONVERGE_MEMORY_NEXT_ACTION).toContain('memorize_asset');
  });

  test('appendMemoryCandidatePrepNote 追加共享知识规则', () => {
    const note = appendMemoryCandidatePrepNote('先写 plan_heartbeat');
    expect(note).toContain('先写 plan_heartbeat');
    expect(note).toContain('跨仓库共享');
  });

  test('assertNoProjectScopedMemoryFields 拒绝非空项目字段', () => {
    expect(() =>
      assertNoProjectScopedMemoryFields({ sourceProject: 'acme/api' }),
    ).toThrow(/source_project/);
    expect(() =>
      assertNoProjectScopedMemoryFields({ filePath: 'src/foo.ts' }),
    ).toThrow(/file_path/);
    expect(() =>
      assertNoProjectScopedMemoryFields({ sourceProject: '', filePath: '' }),
    ).not.toThrow();
  });
});
