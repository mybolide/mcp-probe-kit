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

/** 匹配未填写的占位符，如 `[填写：xxx]` / `[填写:xxx]` */
const PLACEHOLDER_RE = /\[填写[：:][^\]]*\]/g;

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
  const matches = content.match(/\bFR-\d+\b/g) || [];
  return [...new Set(matches)];
}

const REQUIRED_SECTIONS: Record<SpecFileKey, string[]> = {
  requirements: ['功能概述', '需求列表', '非功能需求', '依赖关系'],
  design: ['概述', '技术方案', '文件结构'],
  tasks: ['任务列表', '需求覆盖矩阵'],
};

/**
 * 校验三份规格文档。传入各文件的全文（不存在传 null）。
 */
export function validateSpecDocuments(input: SpecFileInput): SpecValidationReport {
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
    if (!/SHALL/i.test(requirements)) {
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

  const errorCount = issues.filter((item) => item.severity === 'error').length;
  const warningCount = issues.filter((item) => item.severity === 'warning').length;
  const passed = errorCount === 0;
  const summary = passed
    ? `规格校验通过（${frIds.length} 条需求${warningCount ? `，${warningCount} 个提醒` : ''}）`
    : `规格校验未通过：${errorCount} 个必须修复的问题${warningCount ? `、${warningCount} 个提醒` : ''}`;

  return { passed, errorCount, warningCount, issues, frIds, summary };
}
