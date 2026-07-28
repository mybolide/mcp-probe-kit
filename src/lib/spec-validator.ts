/**
 * 规格文档「填写后校验」闸门（P1）
 *
 * 目标：不依赖模型自觉。落盘后机械校验 requirements/design/tasks 的完整性，
 * 打回残留占位符、缺章节、无 FR、无验收标准、FR 未进覆盖矩阵等问题，
 * 让中等/偏弱模型也能被强制补全到可实现的程度。
 *
 * 本模块为纯逻辑、无 I/O，便于单测。
 */

export type SpecFileKey = 'requirements' | 'design' | 'tasks';

export interface SpecFileInput {
  requirements?: string | null;
  design?: string | null;
  tasks?: string | null;
}

export interface ParentChildSpecFileInput extends SpecFileInput {
  readme?: string | null;
  manifest?: string | null;
  subspecs?: Record<string, { spec?: string | null; tasks?: string | null }>;
}

export interface SpecIssue {
  file: SpecFileKey | 'cross';
  severity: 'error' | 'warning';
  code: string;
  message: string;
}

export interface SpecValidationReport {
  passed: boolean;
  errorCount: number;
  warningCount: number;
  issues: SpecIssue[];
  /** 从 requirements 提取的需求 ID（FR-1、FR-2…） */
  frIds: string[];
  summary: string;
}

/** 匹配未填写的占位符：`[填写：xxx]` / `[填写:xxx]` / 裸 `[填写]` 都算 */
const PLACEHOLDER_RE = /\[填写[：:]?[^\]]*\]/g;

function countPlaceholders(content: string): number {
  const matches = content.match(PLACEHOLDER_RE);
  return matches ? matches.length : 0;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 标题行存在性（## 概述 等） */
function hasSection(content: string, name: string): boolean {
  const re = new RegExp(`^#{1,6}\\s+${escapeRegExp(name)}`, 'm');
  return re.test(content);
}

/** 提取去重后的 FR-n 需求 ID */
export function extractFrIds(content: string): string[] {
  const matches = content.match(/(?<![A-Z0-9])FR-\d+(?!\d)/g) || [];
  return [...new Set(matches)];
}

const REQUIRED_SECTIONS: Record<SpecFileKey, string[]> = {
  requirements: ['功能概述', '需求列表', '非功能需求', '依赖关系'],
  design: ['概述', '技术方案', '文件结构'],
  tasks: ['交付物清单', '任务列表', '需求覆盖矩阵', '文件变更清单'],
};

/**
 * 校验三份规格文档。传入各文件的全文（不存在传 null）。
 */
export function validateSpecDocuments(
  input: SpecFileInput,
  options: { requireAcceptance?: boolean } = {},
): SpecValidationReport {
  const issues: SpecIssue[] = [];
  const requirements = input.requirements ?? null;
  const design = input.design ?? null;
  const tasks = input.tasks ?? null;

  const checkFile = (key: SpecFileKey, content: string | null): void => {
    if (!content || !content.trim()) {
      issues.push({ file: key, severity: 'error', code: 'missing_file', message: `${key}.md 不存在或为空` });
      return;
    }
    const placeholders = countPlaceholders(content);
    if (placeholders > 0) {
      issues.push({
        file: key,
        severity: 'error',
        code: 'placeholder',
        message: `${key}.md 仍有 ${placeholders} 处未填写的「[填写：…]」占位`,
      });
    }
    for (const section of REQUIRED_SECTIONS[key]) {
      if (!hasSection(content, section)) {
        issues.push({ file: key, severity: 'error', code: 'missing_section', message: `${key}.md 缺少章节「${section}」` });
      }
    }
  };

  checkFile('requirements', requirements);
  checkFile('design', design);
  checkFile('tasks', tasks);

  // requirements：需有带 ID 的需求与 EARS 验收标准
  let frIds: string[] = [];
  if (requirements && requirements.trim()) {
    frIds = extractFrIds(requirements);
    if (frIds.length === 0) {
      issues.push({ file: 'requirements', severity: 'error', code: 'no_fr', message: 'requirements.md 未定义任何带稳定 ID 的需求（FR-1、FR-2…）' });
    }
    if (options.requireAcceptance !== false && !/SHALL/i.test(requirements)) {
      issues.push({ file: 'requirements', severity: 'error', code: 'no_acceptance', message: 'requirements.md 未发现 EARS 验收标准（应包含「SHALL」）' });
    }
  }

  // design：应引用 requirements 的 FR
  if (design && design.trim() && frIds.length > 0) {
    const designFr = extractFrIds(design);
    if (designFr.length === 0) {
      issues.push({ file: 'design', severity: 'warning', code: 'no_fr_ref', message: 'design.md 未引用任何 FR-id（应在「对应需求」标注本设计覆盖的需求）' });
    }
  }

  // 跨文档：每条 FR 都应在 tasks（含覆盖矩阵）出现，否则可能漏实现
  if (requirements && tasks && tasks.trim() && frIds.length > 0) {
    const taskFr = new Set(extractFrIds(tasks));
    const uncovered = frIds.filter((id) => !taskFr.has(id));
    if (uncovered.length > 0) {
      issues.push({
        file: 'cross',
        severity: 'error',
        code: 'uncovered_fr',
        message: `以下需求未在 tasks.md（含需求覆盖矩阵）出现，可能漏实现：${uncovered.join(', ')}`,
      });
    }
  }

  // tasks：详细度校验——每条任务应附「证据块」，避免宽泛任务导致 AI 偷懒
  if (tasks && tasks.trim()) {
    const taskItemCount = (tasks.match(/^\s*-\s*\[\s*\]\s*\d+\.\d+/gm) || []).length;
    const evidenceCount = (tasks.match(/证据块/g) || []).length;
    if (taskItemCount > 0 && evidenceCount < taskItemCount) {
      issues.push({
        file: 'tasks',
        severity: 'warning',
        code: 'thin_task',
        message: `tasks.md 有 ${taskItemCount} 条任务，但仅 ${evidenceCount} 条标注「证据块」；过于宽泛的任务易导致实现时偷懒/跳步`,
      });
    }
  }

  const errorCount = issues.filter((item) => item.severity === 'error').length;
  const warningCount = issues.filter((item) => item.severity === 'warning').length;
  const passed = errorCount === 0;
  const summary = passed
    ? `规格校验通过（${frIds.length} 条需求${warningCount ? `，${warningCount} 个提醒` : ''}）`
    : `规格校验未通过：${errorCount} 个必须修复的问题${warningCount ? `、${warningCount} 个提醒` : ''}`;

  return { passed, errorCount, warningCount, issues, frIds, summary };
}

function addIssue(issues: SpecIssue[], code: string, message: string): void {
  issues.push({ file: 'cross', severity: 'error', code, message });
}

function hasNamedSection(content: string, name: string): boolean {
  return hasSection(content, name);
}

interface TaskBlock {
  id: string;
  content: string;
}

function extractTaskBlocks(content: string): TaskBlock[] {
  const blocks: TaskBlock[] = [];
  let current: { id: string; lines: string[] } | undefined;
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*-\s*\[[ xX]\]\s*(\d+\.\d+)\b/);
    if (match?.[1]) {
      if (current) blocks.push({ id: current.id, content: current.lines.join('\n') });
      current = { id: match[1], lines: [line] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) blocks.push({ id: current.id, content: current.lines.join('\n') });
  return blocks;
}

function extractSectionBody(content: string, name: string): string {
  const lines = content.split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp(`^#{1,6}\\s+${escapeRegExp(name)}\\s*$`).test(line));
  if (start < 0) {
    return '';
  }
  const section: string[] = [];
  for (let index = start + 1; index < lines.length && !/^#{1,6}\s+/.test(lines[index] ?? ''); index += 1) {
    section.push(lines[index] ?? '');
  }
  return section.join('\n').trim();
}

function extractSectionBullets(content: string, name: string): string[] {
  return extractSectionBody(content, name)
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*-\s+(.+)$/)?.[1]?.trim())
    .filter((item): item is string => typeof item === 'string' && !/^(无|暂无|不涉及)$/i.test(item));
}

function parseManifest(content: string | null | undefined): ParentChildSpecManifest | null {
  if (!content?.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(content) as { layout?: unknown; subspecs?: unknown };
    if (parsed.layout !== 'parent-child') {
      return null;
    }
    return { layout: 'parent-child', subspecs: normalizeSubspecs(parsed.subspecs, 'parent-child') };
  } catch {
    return null;
  }
}

function checkChildSpec(
  id: string,
  definition: SubspecDefinition,
  child: { spec?: string | null; tasks?: string | null } | undefined,
  parentFrIds: Set<string>,
  parentTasks: string,
  issues: SpecIssue[],
): void {
  if (!child) {
    addIssue(issues, 'missing_subspec', `subspecs/${id}/ 未按 spec-manifest.json 创建`);
    return;
  }
  const spec = child.spec ?? '';
  const tasks = child.tasks ?? '';
  checkChildSpecDocument(id, definition, spec, parentFrIds, issues);
  checkChildTasks(id, definition, tasks, parentTasks, issues);
}

function checkChildSpecDocument(
  id: string,
  definition: SubspecDefinition,
  spec: string,
  parentFrIds: Set<string>,
  issues: SpecIssue[],
): void {
  if (!spec.trim()) {
    addIssue(issues, 'missing_subspec_spec', `subspecs/${id}/spec.md 不存在或为空`);
    return;
  }
  for (const section of ['范围', '需求回链', '涉及文件', '不做项']) {
    if (!hasNamedSection(spec, section)) {
      addIssue(issues, 'missing_subspec_section', `subspecs/${id}/spec.md 缺少章节「${section}」`);
    } else if (!extractSectionBody(spec, section)) {
      addIssue(issues, 'empty_subspec_section', `subspecs/${id}/spec.md 章节「${section}」不能为空`);
    }
  }
  if (countPlaceholders(spec) > 0) addIssue(issues, 'subspec_placeholder', `subspecs/${id}/spec.md 仍有未填写占位符`);
  if (!/SHALL/i.test(spec)) addIssue(issues, 'missing_subspec_acceptance', `subspecs/${id}/spec.md 缺少 EARS 验收标准（应包含 SHALL）`);
  const childFrIds = new Set(extractFrIds(spec));
  for (const frId of definition.fr) {
    if (!childFrIds.has(frId)) addIssue(issues, 'missing_subspec_fr_backlink', `subspecs/${id}/spec.md 未回链 ${frId}`);
  }
  for (const frId of childFrIds) {
    if (!parentFrIds.has(frId)) {
      addIssue(issues, 'unknown_subspec_fr', `subspecs/${id}/spec.md 引用了母规格不存在的 ${frId}`);
    }
  }
}

function checkChildTasks(
  id: string,
  definition: SubspecDefinition,
  tasks: string,
  parentTasks: string,
  issues: SpecIssue[],
): void {
  if (!tasks.trim()) {
    addIssue(issues, 'missing_subspec_tasks', `subspecs/${id}/tasks.md 不存在或为空`);
    return;
  }
  if (countPlaceholders(tasks) > 0) {
    addIssue(issues, 'subspec_task_placeholder', `subspecs/${id}/tasks.md 仍有未填写占位符`);
  }
  const taskBlocks = extractTaskBlocks(tasks);
  if (taskBlocks.length === 0) {
    addIssue(issues, 'missing_subspec_task', `subspecs/${id}/tasks.md 未定义编号任务`);
  }
  for (const task of taskBlocks) {
    if (!/证据块\s*[:：]/.test(task.content)) {
      addIssue(issues, 'missing_task_evidence', `subspecs/${id}/tasks.md 的任务 ${task.id} 必须包含证据块`);
    }
    const blockFrIds = extractFrIds(task.content);
    if (blockFrIds.length === 0) {
      addIssue(issues, 'missing_task_fr', `subspecs/${id}/tasks.md 的任务 ${task.id} 必须回链至少一个 FR-n`);
    }
    for (const frId of blockFrIds) {
      if (!definition.fr.includes(frId)) {
        addIssue(issues, 'unknown_task_fr', `subspecs/${id}/tasks.md 的任务 ${task.id} 回链了本子规格未负责的 ${frId}`);
      }
    }
  }
  const taskFrIds = new Set(extractFrIds(tasks));
  for (const frId of definition.fr) {
    if (!taskFrIds.has(frId)) {
      addIssue(issues, 'missing_subspec_task_fr', `subspecs/${id}/tasks.md 未回链本子规格负责的 ${frId}`);
    }
  }
  for (const task of taskBlocks) {
    const reference = `${id}/${task.id}`;
    if (!new RegExp(`(?<![a-z0-9-])${escapeRegExp(reference)}(?!\\d)`, 'i').test(parentTasks)) {
      addIssue(issues, 'unreferenced_subspec_task', `母 tasks.md 未引用子任务 ${id}/${task.id}`);
    }
  }
}

/** 校验已由 Agent 落盘的 parent-child 规格；MCP 不写入或修复任何业务文件。 */
export function validateParentChildSpecDocuments(input: ParentChildSpecFileInput): SpecValidationReport & { subspecIds: string[] } {
  const base = validateSpecDocuments(input, { requireAcceptance: false });
  const issues = [...base.issues];
  const manifest = parseManifest(input.manifest);
  if (!manifest) {
    addIssue(issues, 'invalid_manifest', 'spec-manifest.json 缺失、不是 JSON，或 layout 不是 parent-child');
    return buildParentChildReport(base.frIds, issues, []);
  }

  const readme = input.readme ?? '';
  if (countPlaceholders(readme) > 0) {
    addIssue(issues, 'parent_readme_placeholder', 'README.md 仍有未填写占位符');
  }
  for (const section of ['原则', '子规格索引', '依赖关系', '里程碑']) {
    if (!hasNamedSection(readme, section)) {
      addIssue(issues, 'missing_parent_readme_section', `README.md 缺少章节「${section}」`);
    } else if (!extractSectionBody(readme, section)) {
      addIssue(issues, 'empty_parent_readme_section', `README.md 章节「${section}」不能为空`);
    }
  }

  const mappedFrIds = new Set(manifest.subspecs.flatMap((subspec) => subspec.fr));
  for (const frId of base.frIds) {
    if (!mappedFrIds.has(frId)) {
      addIssue(issues, 'unmapped_parent_fr', `母 requirements.md 的 ${frId} 未映射到任何子规格`);
    }
  }

  const parentFrIds = new Set(base.frIds);
  const outOfScopeOwners = new Map<string, string>();
  for (const subspec of manifest.subspecs) {
    if (!readme.includes(subspec.id)) {
      addIssue(issues, 'missing_parent_index_entry', `README.md 子规格索引未引用 ${subspec.id}`);
    }
    for (const frId of subspec.fr) {
      if (!parentFrIds.has(frId)) {
        addIssue(issues, 'unknown_manifest_fr', `spec-manifest.json 中 ${subspec.id} 映射了母规格不存在的 ${frId}`);
      }
    }
    const child = input.subspecs?.[subspec.id];
    checkChildSpec(subspec.id, subspec, child, parentFrIds, input.tasks ?? '', issues);
    for (const item of extractSectionBullets(child?.spec ?? '', '不做项')) {
      const key = item.toLowerCase().replace(/[。；;，,\s]+$/g, '');
      const owner = outOfScopeOwners.get(key);
      if (owner && owner !== subspec.id) {
        addIssue(issues, 'duplicate_out_of_scope', `子规格 ${owner} 与 ${subspec.id} 重复声明不做项：「${item}」`);
      } else {
        outOfScopeOwners.set(key, subspec.id);
      }
    }
  }

  return buildParentChildReport(base.frIds, issues, manifest.subspecs.map((subspec) => subspec.id));
}

function buildParentChildReport(frIds: string[], issues: SpecIssue[], subspecIds: string[]) {
  const errorCount = issues.filter((item) => item.severity === 'error').length;
  const warningCount = issues.filter((item) => item.severity === 'warning').length;
  return {
    passed: errorCount === 0,
    errorCount,
    warningCount,
    issues,
    frIds,
    subspecIds,
    summary: errorCount === 0
      ? `分层规格校验通过（${frIds.length} 条需求，${subspecIds.length} 个子规格）`
      : `分层规格校验未通过：${errorCount} 个必须修复的问题${warningCount ? `、${warningCount} 个提醒` : ''}`,
  };
}
import { normalizeSubspecs, type ParentChildSpecManifest, type SubspecDefinition } from './parent-child-spec.js';
