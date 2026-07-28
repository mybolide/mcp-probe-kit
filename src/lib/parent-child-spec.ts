export type SpecLayout = 'flat' | 'parent-child';

export interface SubspecDefinition {
  id: string;
  title: string;
  fr: string[];
  dependsOn?: string[];
}

export interface ParentChildSpecManifest {
  layout: 'parent-child';
  subspecs: SubspecDefinition[];
}

const SUBSPEC_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FR_ID_RE = /^FR-\d+$/;
const MAX_SUBSPECS = 50;
const MAX_SUBSPEC_TITLE_LENGTH = 120;
const MAX_PATH_SEGMENT_LENGTH = 120;

export function normalizeFeatureName(value: unknown): string {
  const featureName = String(value ?? '').trim();
  if (!SUBSPEC_ID_RE.test(featureName)) {
    throw new Error('feature_name 必须是小写 kebab-case，且不能包含路径分隔符');
  }
  if (featureName.length > MAX_PATH_SEGMENT_LENGTH) {
    throw new Error(`feature_name 最多 ${MAX_PATH_SEGMENT_LENGTH} 个字符`);
  }
  return featureName;
}

export function normalizeDocsDir(value: unknown, fallback: string = 'docs'): string {
  const docsDir = String(value ?? fallback).trim().replace(/\\/g, '/') || fallback;
  const parts = docsDir.split('/');
  if (/^(?:[a-z]:|\/)/i.test(docsDir) || parts.some((part) => !part || part === '.' || part === '..')) {
    throw new Error('docs_dir 必须是项目内的相对目录，且不能包含 . 或 .. 路径段');
  }
  return parts.join('/');
}

function escapeMarkdownTableCell(value: string): string {
  return value.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
}

export function normalizeSpecLayout(value: unknown): SpecLayout {
  const layout = String(value ?? 'flat').trim().toLowerCase() || 'flat';
  if (layout === 'flat' || layout === 'parent-child') {
    return layout;
  }
  throw new Error('spec_layout 仅支持 flat 或 parent-child');
}

export function normalizeSubspecs(value: unknown, layout: SpecLayout): SubspecDefinition[] {
  if (layout === 'flat') {
    return [];
  }
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('spec_layout=parent-child 时必须提供至少一个 subspecs 项');
  }
  if (value.length > MAX_SUBSPECS) {
    throw new Error(`subspecs 最多允许 ${MAX_SUBSPECS} 项`);
  }

  const seenIds = new Set<string>();
  const subspecs = value.map((item, index) => normalizeSubspec(item, index, seenIds));
  validateSubspecDependencies(subspecs);
  assertAcyclicSubspecDependencies(subspecs);
  return subspecs;
}

function normalizeSubspec(item: unknown, index: number, seenIds: Set<string>): SubspecDefinition {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error(`subspecs[${index}] 必须是对象`);
  }
  const record = item as Record<string, unknown>;
  const id = String(record.id ?? '').trim();
  const title = String(record.title ?? '').trim();
  const fr = Array.isArray(record.fr) ? record.fr.map(String).map((value) => value.trim()).filter(Boolean) : [];
  const dependsOn = Array.isArray(record.dependsOn)
    ? record.dependsOn.map(String).map((value) => value.trim()).filter(Boolean)
    : [];
  if (!SUBSPEC_ID_RE.test(id) || id.length > MAX_PATH_SEGMENT_LENGTH) {
    throw new Error(`subspecs[${index}].id 必须是最多 ${MAX_PATH_SEGMENT_LENGTH} 字符的小写 kebab-case`);
  }
  if (seenIds.has(id)) throw new Error(`subspecs 存在重复 ID：${id}`);
  if (!title) throw new Error(`subspecs[${index}].title 不能为空`);
  if (title.length > MAX_SUBSPEC_TITLE_LENGTH) {
    throw new Error(`subspecs[${index}].title 最多 ${MAX_SUBSPEC_TITLE_LENGTH} 个字符`);
  }
  if (fr.length === 0 || fr.some((frId) => !FR_ID_RE.test(frId))) {
    throw new Error(`subspecs[${index}].fr 必须包含至少一个 FR-n`);
  }
  seenIds.add(id);
  return { id, title, fr: [...new Set(fr)], ...(dependsOn.length ? { dependsOn: [...new Set(dependsOn)] } : {}) };
}

function validateSubspecDependencies(subspecs: SubspecDefinition[]): void {
  const ids = new Set(subspecs.map((subspec) => subspec.id));
  for (const subspec of subspecs) {
    for (const dependency of subspec.dependsOn ?? []) {
      if (dependency === subspec.id || !ids.has(dependency)) {
        throw new Error(`子规格 ${subspec.id} 的依赖 ${dependency} 无效`);
      }
    }
  }
}

function assertAcyclicSubspecDependencies(subspecs: SubspecDefinition[]): void {
  const byId = new Map(subspecs.map((subspec) => [subspec.id, subspec]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string, chain: string[]): void => {
    if (visiting.has(id)) {
      throw new Error(`subspecs 存在循环依赖：${[...chain, id].join(' -> ')}`);
    }
    if (visited.has(id)) {
      return;
    }
    visiting.add(id);
    for (const dependency of byId.get(id)?.dependsOn ?? []) {
      visit(dependency, [...chain, id]);
    }
    visiting.delete(id);
    visited.add(id);
  };
  for (const subspec of subspecs) {
    visit(subspec.id, []);
  }
}

export function parseParentChildManifest(value: string | null | undefined): ParentChildSpecManifest | null {
  if (!value?.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (parsed.layout !== 'parent-child') {
      return null;
    }
    return {
      layout: 'parent-child',
      subspecs: normalizeSubspecs(parsed.subspecs, 'parent-child'),
    };
  } catch {
    return null;
  }
}

export function buildParentChildSpecArtifacts(
  docsDir: string,
  featureName: string,
  description: string,
  subspecs: SubspecDefinition[],
) {
  const root = `${docsDir}/specs/${featureName}`;
  const manifest: ParentChildSpecManifest = { layout: 'parent-child', subspecs };
  const frRows = [...new Set(subspecs.flatMap((subspec) => subspec.fr))]
    .map((frId) => `| ${frId} | [填写：需求摘要] | ${subspecs.filter((subspec) => subspec.fr.includes(frId)).map((subspec) => subspec.id).join(', ')} |`)
    .join('\n');
  const subspecIndex = subspecs
    .map((subspec) => `| ${subspec.id} | ${escapeMarkdownTableCell(subspec.title)} | ${subspec.fr.join(', ')} | ${(subspec.dependsOn ?? []).join(', ') || '无'} |`)
    .join('\n');
  const childFiles = subspecs.flatMap((subspec) => [
    `${root}/subspecs/${subspec.id}/spec.md`,
    `${root}/subspecs/${subspec.id}/tasks.md`,
  ]);

  return {
    manifest,
    specPaths: [
      `${root}/README.md`,
      `${root}/requirements.md`,
      `${root}/design.md`,
      `${root}/tasks.md`,
      `${root}/spec-manifest.json`,
      ...childFiles,
    ],
    templates: {
      readme: `# ${featureName}\n\n## 原则\n\n${description}\n\nMCP 只返回本目录的写作计划和模板；Agent 在用户审阅后创建或更新实际文件。\n\n## 子规格索引\n\n| ID | 标题 | FR | 依赖 |\n|---|---|---|---|\n${subspecIndex}\n\n## 依赖关系\n\n按 spec-manifest.json 中 dependsOn 维护依赖。\n\n## 里程碑\n\n[填写：按子规格依赖与交付顺序定义里程碑]`,
      requirements: `# 需求文档：${featureName}\n\n## 功能概述\n\n${description}\n\n## 范围边界\n\n- In Scope: [填写：本次纳入]\n- Out of Scope: [填写：本次排除]\n\n## 需求列表\n\n| FR ID | 需求摘要 | 主子规格 |\n|---|---|---|\n${frRows}\n\n> 母规格维护 FR 注册与跨模块契约；每个子规格必须为其负责的 FR 编写 EARS 验收标准。\n\n## 非功能需求\n\n- [填写：跨模块非功能需求]\n\n## 依赖关系\n\n- 见 spec-manifest.json。`,
      design: `# 设计文档：${featureName}\n\n## 概述\n\n${description}\n\n## 技术方案\n\n记录跨子规格的架构与兼容性决策。\n\n## 文件结构\n\n由 Agent 根据代码图谱补充。\n\n## 设计决策\n\n记录跨模块决策，不重复子规格实现细节。`,
      tasks: `# 任务清单：${featureName}\n\n## 交付物清单\n\n- 子规格任务是唯一任务明细；本文件只维护阶段索引和引用矩阵。\n\n## 任务列表\n\n按子规格交付顺序补充阶段。\n\n## 需求覆盖矩阵\n\n| FR ID | 子规格 | 任务引用 | 状态 |\n|---|---|---|---|\n${subspecs.map((subspec) => subspec.fr.map((frId) => `| ${frId} | ${subspec.id} | [填写：${subspec.id}/任务 ID] | 未开始 |`).join('\n')).join('\n')}\n\n## 文件变更清单\n\n由各子规格汇总。\n\n## 子规格任务覆盖矩阵\n\n每个子规格 tasks.md 中的任务 ID 必须以 \`子规格 ID/任务 ID\` 形式回链到本表。`,
      manifest: JSON.stringify(manifest, null, 2),
      subspecs: Object.fromEntries(subspecs.map((subspec) => [subspec.id, {
        spec: `# 子规格：${subspec.title}\n\n## 范围\n\n[填写：本子模块范围]\n\n## 需求回链\n\n${subspec.fr.map((frId) => `- ${frId}`).join('\n')}\n\n## 验收标准（EARS）\n\n1. WHEN [填写：触发条件] THEN 系统 SHALL [填写：可测试响应]。\n\n## 涉及文件\n\n- [填写：根据代码图谱补充路径]\n\n## 不做项\n\n- [填写：明确排除项]\n\n## 设计要点\n\n[填写：实现约束]`,
        tasks: `# 子任务：${subspec.title}\n\n- [ ] 1.1 [填写：动词、对象和验收约束]\n  - 证据块: [填写：先读相关文件:行号]\n  - 涉及文件: [填写：路径]\n  - _需求: ${subspec.fr.join(', ')}_`,
      }])) as Record<string, { spec: string; tasks: string }>,
    },
  };
}
