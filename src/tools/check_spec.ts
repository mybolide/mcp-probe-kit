import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseArgs, getString } from '../utils/parseArgs.js';
import { okStructured } from '../lib/response.js';
import { handleToolError } from '../utils/error-handler.js';
import { resolveWorkspaceRoot } from '../lib/workspace-root.js';
import { validateSpecDocuments, type SpecIssue } from '../lib/spec-validator.js';

/**
 * check_spec 工具（P1「填写后校验」闸门）
 *
 * 读取 docs/specs/{feature_name}/{requirements,design,tasks}.md，
 * 机械校验完整性。未通过则列出逐条待修项并要求补全后重跑，通过前不应进入实现。
 */

const DEFAULT_DOCS_DIR = 'docs';

function readIfExists(filePath: string): string | null {
  try {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : null;
  } catch {
    return null;
  }
}

function formatIssue(issue: SpecIssue): string {
  const tag = issue.severity === 'error' ? '必须修复' : '提醒';
  return `- [${tag}] (${issue.file}) ${issue.message}`;
}

export async function checkSpec(args: any) {
  try {
    const parsed = parseArgs<{
      feature_name?: string;
      docs_dir?: string;
      project_root?: string;
      input?: string;
    }>(args, {
      defaultValues: {
        feature_name: '',
        docs_dir: DEFAULT_DOCS_DIR,
      },
      primaryField: 'feature_name',
      fieldAliases: {
        feature_name: ['name', 'feature', 'spec', '功能名', '功能名称', '规格'],
        docs_dir: ['dir', 'output', '目录', '文档目录'],
        project_root: ['projectRoot', 'project_path', 'projectPath', 'root', '项目路径', '项目根目录'],
      },
    });

    const featureName = getString(parsed.feature_name);
    const docsDir = getString(parsed.docs_dir) || DEFAULT_DOCS_DIR;
    const projectRoot = resolveWorkspaceRoot(getString(parsed.project_root));

    if (!featureName) {
      throw new Error('请提供 feature_name（要校验的规格目录名，对应 docs/specs/<feature_name>/）');
    }

    const specDir = path.join(projectRoot, docsDir, 'specs', featureName);
    const report = validateSpecDocuments({
      requirements: readIfExists(path.join(specDir, 'requirements.md')),
      design: readIfExists(path.join(specDir, 'design.md')),
      tasks: readIfExists(path.join(specDir, 'tasks.md')),
    });

    const relDir = `${docsDir}/specs/${featureName}`;
    const issueLines = report.issues.length > 0
      ? report.issues.map(formatIssue).join('\n')
      : '- 无';

    const text = report.passed
      ? `# ✅ 规格校验通过：${featureName}

${report.summary}

**需求清单**: ${report.frIds.join(', ') || '（未发现 FR）'}
${report.warningCount > 0 ? `\n仍有 ${report.warningCount} 个提醒（非阻塞，建议处理）：\n${issueLines}\n` : ''}
**下一步**: 规格已具备可实现性，可进入实现/估算阶段。`
      : `# ❌ 规格校验未通过：${featureName}

${report.summary}

## 待修复（${relDir}）
${issueLines}

## 处理方式
1. 按上述每一条补全 \`${relDir}/\` 下的 requirements.md / design.md / tasks.md
2. **重新运行** \`check_spec\`（同样的 feature_name）直到通过
3. **校验通过前不要开始写实现代码** —— 这是为了确保需求被完整实现，而不是写到一半才发现规格有缺口`;

    return okStructured(text, report);
  } catch (error) {
    return handleToolError(error, 'check_spec');
  }
}
