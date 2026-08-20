/**
 * Agent-facing guidance for persisting cross-repo shared knowledge (not project-scoped notes).
 */

export const MEMORY_SHARED_KNOWLEDGE_RULE =
  '沉淀跨项目可复用知识，不是项目私有笔记。禁止传 source_project / source_path / file_path（别名 project）。仓库名与路径仅可放在 content 末尾【来源参考】一行；summary 写检索关键词+结论，name/description 抽象化。';

export const MEMORY_CANDIDATE_PREP_NOTE =
  '候选面向跨仓库共享：勿填 source_project/source_path；name/summary 抽象化，路径仅放 content 末尾【来源参考】';

export const MEMORY_PERSISTENCE_CHECKLIST = [
  '不传 source_project / source_path / file_path',
  'summary = 关键词 + 结论（不含仓库名/路径）',
  'content = 抽象根因/模式/验证；可选【来源参考】一行',
  '负面记忆须有 evidence + applicability',
].join('\n- ');

export const MEMORIZE_ASSET_TOOL_DESCRIPTION =
  '沉淀跨项目可复用知识到共享记忆库（不是项目私有笔记）。支持成功经验及 failed_approach、false_root_cause、regression_case 负面记忆；负面记忆必须附 evidence，并建议填写 applicability。禁止传 source_project / source_path / file_path；仓库名与路径仅可写在 content 末尾【来源参考】。长流程应先准备 MemoryCandidate，并仅在 converge passed=true 后正式写入。';

export const MEMORIZE_ASSET_WHEN_TO_CALL =
  '托管交付流程在 **converge passed=true** 后沉淀 MemoryCandidate；用户明确进行独立记忆管理时也可直接调用。沉淀跨项目知识：**禁止** source_project / source_path / file_path；summary 写关键词+结论，content 抽象化。默认拒绝同身份冲突，确认替代时用 `conflict_policy=supersede`，确需并行结论时显式 `allow_parallel`';

export const CONVERGE_MEMORY_NEXT_ACTION =
  `收敛通过。沉淀记忆前请确认：\n- ${MEMORY_PERSISTENCE_CHECKLIST}\n然后调用 memorize_asset（或 scan_and_extract_patterns 后再沉淀）。`;

export const SCAN_PATTERN_PERSIST_HINT =
  '候选需抽象化后再 memorize_asset；勿原样沉淀文件路径到 name/summary；勿传 source_project。';

export function appendMemoryCandidatePrepNote(note: string): string {
  return `${note}；${MEMORY_CANDIDATE_PREP_NOTE}`;
}

export function assertNoProjectScopedMemoryFields(input: {
  sourceProject?: string;
  sourcePath?: string;
  filePath?: string;
}): void {
  const forbidden: string[] = [];
  if (input.sourceProject?.trim()) forbidden.push('source_project');
  if (input.sourcePath?.trim()) forbidden.push('source_path');
  if (input.filePath?.trim()) forbidden.push('file_path');
  if (forbidden.length === 0) {
    return;
  }
  throw new Error(
    `共享记忆库禁止项目范围字段: ${forbidden.join(', ')}。${MEMORY_SHARED_KNOWLEDGE_RULE}`,
  );
}
