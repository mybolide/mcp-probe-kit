import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

export type TemplateProfile = 'guided' | 'strict';
export type TemplateSource = 'project' | 'repo' | 'embedded';

export interface TemplateValidationResult {
  passed: boolean;
  missingSections: string[];
  missingFields: string[];
  warnings: string[];
}

export interface TemplateLoadResult {
  content: string;
  source: TemplateSource;
  validation: TemplateValidationResult;
}

interface TemplateValidationRule {
  requiredSections: string[];
  requiredFields: string[];
  minAcceptanceCount?: number;
}

interface TemplateRequest {
  category: string;
  name: string;
  profile: TemplateProfile;
  file: string;
  variables?: Record<string, string>;
  projectRoot?: string;
  packageRoot?: string;
}

const DEFAULT_PROFILE: TemplateProfile = 'guided';

const TEMPLATE_VALIDATORS: Record<string, TemplateValidationRule> = {
  'specs/feature/requirements.md': {
    requiredSections: ['功能概述', '需求列表', '非功能需求', '依赖关系'],
    requiredFields: ['用户故事', '验收标准'],
    minAcceptanceCount: 1,
  },
  'specs/feature/design.md': {
    requiredSections: ['概述', '技术方案', '数据模型', 'API 设计', '文件结构', '设计决策', '风险评估'],
    requiredFields: ['技术选型'],
  },
  'specs/feature/tasks.md': {
    requiredSections: ['概述', '任务列表', '检查点', '文件变更清单'],
    requiredFields: ['阶段 1', '阶段 2', '阶段 3'],
  },
};

const EMBEDDED_TEMPLATES: Record<string, string> = {
  'specs/feature/guided/requirements.md': `# 需求文档：{feature_name}

## 功能概述

{description}

## 术语定义

- **[术语1]**: [填写：定义]
- **[术语2]**: [填写：定义]

---

## 需求列表

### 需求 1: [填写：需求标题]

**用户故事:** 作为 [填写：角色]，我想要 [填写：功能]，以便 [填写：目标]。

#### 验收标准

1. WHEN [填写：触发条件] THEN 系统 SHALL [填写：响应]
2. WHILE [填写：状态条件] THE 系统 SHALL [填写：响应]
3. IF [填写：异常条件] THEN 系统 SHALL [填写：处理方式]

---

## 非功能需求

### 性能要求
- [填写：性能相关需求]

### 安全要求
- [填写：安全相关需求]

### 兼容性要求
- [填写：兼容性相关需求]

---

## 依赖关系

- [填写：列出与其他功能的依赖]

---

## 检查清单

- [ ] 需求覆盖核心场景与边界场景
- [ ] 验收标准使用 EARS 格式
- [ ] 非功能需求明确
- [ ] 依赖关系完整
`,
  'specs/feature/guided/design.md': `# 设计文档：{feature_name}

## 概述

{description}

本设计文档描述 {feature_name} 功能的技术实现方案。

---

## 技术方案

### 技术选型

| 类别 | 选择 | 理由 |
|------|------|------|
| [填写：类别] | [填写：技术] | [填写：选择理由] |

### 架构设计

[填写：描述功能的架构设计，参考项目现有架构]

\`\`\`
[填写：架构图或流程图，使用 ASCII 或 Mermaid]
\`\`\`

---

## 数据模型

[填写：如果功能涉及数据存储，描述数据模型]

---

## API 设计

[填写：如果功能涉及 API，描述 API 设计]

---

## 文件结构

[填写：描述功能涉及的文件和目录]

\`\`\`
[项目目录]/
├── [填写：新增文件1]
├── [填写：新增文件2]
└── [填写：修改文件]
\`\`\`

---

## 设计决策

### 决策 1: [填写：决策标题]

**问题**: [填写：描述面临的问题]

**选项**:
1. [填写：选项 A]: [填写：描述]
2. [填写：选项 B]: [填写：描述]

**决策**: 选择 [填写：选项]

**理由**: [填写：解释选择的理由]

---

## 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| [填写：风险描述] | [填写：高/中/低] | [填写：缓解措施] |

---

## 检查清单

- [ ] 技术方案与现有架构一致
- [ ] 数据模型与接口定义清晰
- [ ] 关键设计决策已记录
`,
  'specs/feature/guided/tasks.md': `# 任务清单：{feature_name}

## 概述

实现 {feature_name} 功能的任务分解。

---

## 任务列表

### 阶段 1: 准备工作

- [ ] 1.1 [填写：任务标题]
  - [填写：具体操作说明]
  - _需求: [填写：对应的需求编号]_

---

### 阶段 2: 核心实现

- [ ] 2.1 [填写：任务标题]
  - [填写：具体操作说明]
  - _需求: [填写：对应的需求编号]_

---

### 阶段 3: 集成测试

- [ ] 3.1 [填写：任务标题]
  - [填写：具体操作说明]
  - _需求: [填写：对应的需求编号]_

---

## 检查点

- [ ] 阶段 1 完成后：[填写：验证内容]
- [ ] 阶段 2 完成后：[填写：验证内容]
- [ ] 阶段 3 完成后：[填写：验证内容]

---

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| [填写：文件路径] | 新建/修改 | [填写：说明] |

---

## 检查清单

- [ ] 任务分阶段合理
- [ ] 每项任务可执行且可验证
- [ ] 任务与需求一一对应
`,
  'specs/feature/strict/requirements.md': `# 需求文档：{feature_name}

## 功能概述

{description}

---

## 需求列表

### 需求 1: [填写：需求标题]

**用户故事:** 作为 [填写：角色]，我想要 [填写：功能]，以便 [填写：目标]。

#### 验收标准

1. WHEN [填写：触发条件] THEN 系统 SHALL [填写：响应]
2. IF [填写：异常条件] THEN 系统 SHALL [填写：处理方式]

---

## 非功能需求

- [填写：性能/安全/兼容性]

---

## 依赖关系

- [填写：列出依赖]
`,
  'specs/feature/strict/design.md': `# 设计文档：{feature_name}

## 概述

{description}

---

## 技术方案

### 技术选型

| 类别 | 选择 | 理由 |
|------|------|------|
| [填写：类别] | [填写：技术] | [填写：理由] |

### 架构设计

[填写：架构说明]

---

## 数据模型

[填写：数据结构或表设计]

---

## API 设计

| 方法 | 路径 | 描述 |
|------|------|------|
| [填写：GET/POST/...] | [填写：/path] | [填写：描述] |

---

## 文件结构

[填写：涉及的文件]

---

## 设计决策

### 决策 1: [填写：决策标题]

**问题**: [填写：问题]
**选项**: [填写：选项]
**决策**: [填写：结论]

---

## 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| [填写：风险描述] | [填写：高/中/低] | [填写：缓解措施] |
`,
  'specs/feature/strict/tasks.md': `# 任务清单：{feature_name}

## 概述

实现 {feature_name} 的任务分解。

---

## 任务列表

### 阶段 1: 准备工作

- [ ] 1.1 [填写：任务标题]

---

### 阶段 2: 核心实现

- [ ] 2.1 [填写：任务标题]

---

### 阶段 3: 集成测试

- [ ] 3.1 [填写：任务标题]

---

## 检查点

- [ ] 阶段 1 完成后：[填写：验证内容]
- [ ] 阶段 2 完成后：[填写：验证内容]
- [ ] 阶段 3 完成后：[填写：验证内容]

---

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| [填写：文件路径] | 新建/修改 | [填写：说明] |
`,
};

export function normalizeTemplateProfile(input?: string): TemplateProfile {
  const normalized = (input || '').toLowerCase().trim();
  if (normalized === 'strict') {
    return 'strict';
  }
  return DEFAULT_PROFILE;
}

function findPackageRoot(startDir: string): string {
  let current = startDir;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(current, 'package.json'))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return startDir;
}

function getPackageRoot(): string {
  const moduleFile = fileURLToPath(import.meta.url);
  const moduleDir = dirname(moduleFile);
  return findPackageRoot(moduleDir);
}

function buildTemplateKey(category: string, name: string, file: string): string {
  return `${category}/${name}/${file}`;
}

function getValidator(category: string, name: string, file: string): TemplateValidationRule | undefined {
  const key = buildTemplateKey(category, name, file);
  return TEMPLATE_VALIDATORS[key];
}

function validateTemplate(content: string, rule?: TemplateValidationRule): TemplateValidationResult {
  const missingSections: string[] = [];
  const missingFields: string[] = [];
  const warnings: string[] = [];

  if (rule) {
    for (const section of rule.requiredSections) {
      const sectionPattern = new RegExp(`^#{1,6}\\s+${escapeRegExp(section)}\\s*$`, 'm');
      if (!sectionPattern.test(content)) {
        missingSections.push(section);
      }
    }

    for (const field of rule.requiredFields) {
      if (!content.includes(field)) {
        missingFields.push(field);
      }
    }

    if (rule.minAcceptanceCount) {
      const count = countMatches(content, /验收标准/g);
      if (count < rule.minAcceptanceCount) {
        warnings.push(`验收标准数量不足（至少 ${rule.minAcceptanceCount}）`);
      }
    }
  }

  const hasUnresolved = /{[a-z_]+}/i.test(content);
  if (hasUnresolved) {
    warnings.push('存在未替换的占位符');
  }

  const passed = missingSections.length === 0 && missingFields.length === 0 && warnings.length === 0;

  return {
    passed,
    missingSections,
    missingFields,
    warnings,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countMatches(content: string, pattern: RegExp): number {
  const matches = content.match(pattern);
  return matches ? matches.length : 0;
}

function renderTemplate(content: string, variables?: Record<string, string>): { rendered: string; unresolved: string[] } {
  let rendered = content;
  if (variables) {
    for (const [key, value] of Object.entries(variables)) {
      rendered = rendered.split(`{${key}}`).join(value);
    }
  }

  const unresolved = rendered.match(/{[a-z_]+}/gi) || [];
  return { rendered, unresolved };
}

async function readFileIfExists(filePath: string): Promise<string | null> {
  try {
    await fs.access(filePath);
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    return null;
  }
}

export async function loadTemplate(request: TemplateRequest): Promise<TemplateLoadResult> {
  const projectRoot = request.projectRoot || process.cwd();
  const packageRoot = request.packageRoot || getPackageRoot();
  const templateRelPath = join('templates', request.category, request.name, request.profile, request.file);

  const projectTemplatePath = resolve(projectRoot, templateRelPath);
  const repoTemplatePath = resolve(packageRoot, templateRelPath);

  let content = await readFileIfExists(projectTemplatePath);
  let source: TemplateSource = 'project';

  if (!content) {
    content = await readFileIfExists(repoTemplatePath);
    source = 'repo';
  }

  if (!content) {
    const embeddedKey = `${request.category}/${request.name}/${request.profile}/${request.file}`;
    content = EMBEDDED_TEMPLATES[embeddedKey] || '';
    source = 'embedded';
  }

  const { rendered, unresolved } = renderTemplate(content, request.variables);
  const rule = getValidator(request.category, request.name, request.file);
  const validation = validateTemplate(rendered, rule);

  if (unresolved.length > 0) {
    validation.passed = false;
    validation.warnings.push(`未替换占位符: ${Array.from(new Set(unresolved)).join(', ')}`);
  }

  if (!content) {
    validation.passed = false;
    validation.warnings.push('模板内容为空，已使用空模板作为占位');
  }

  return {
    content: rendered,
    source,
    validation,
  };
}
