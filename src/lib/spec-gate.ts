import * as fs from 'node:fs';
import * as path from 'node:path';

export interface SpecGateContext {
  featureName: string;
  docsDir: string;
  specDir: string;
  detected: boolean;
}

export function specArtifactsExist(
  projectRoot: string,
  docsDir: string,
  featureName: string
): boolean {
  const specDir = path.join(projectRoot, docsDir, 'specs', featureName);
  return (
    fs.existsSync(path.join(specDir, 'requirements.md')) ||
    fs.existsSync(path.join(specDir, 'design.md')) ||
    fs.existsSync(path.join(specDir, 'tasks.md'))
  );
}

/**
 * 解析 Bug 修复关联的 feature_name：
 * 1) 显式传入优先
 * 2) specs 下仅有一个目录时自动采用
 * 3) 错误描述中唯一匹配某个 spec 目录名
 */
export function resolveBugfixFeatureName(
  explicitFeatureName: string,
  projectRoot: string,
  docsDir: string,
  hintText: string
): string | null {
  const explicit = explicitFeatureName.trim();
  if (explicit) {
    return explicit;
  }

  const specsRoot = path.join(projectRoot, docsDir, 'specs');
  if (!fs.existsSync(specsRoot)) {
    return null;
  }

  const dirs = fs
    .readdirSync(specsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  if (dirs.length === 1) {
    return dirs[0] ?? null;
  }

  const lowerHint = hintText.toLowerCase();
  const matched = dirs.filter((name) => {
    const lowerName = name.toLowerCase();
    if (lowerHint.includes(lowerName)) {
      return true;
    }
    return lowerName
      .split(/[-_]+/)
      .filter((part) => part.length > 3)
      .some((part) => lowerHint.includes(part));
  });

  return matched.length === 1 ? (matched[0] ?? null) : null;
}

export function resolveBugfixSpecGate(input: {
  featureName?: string;
  projectRoot: string;
  docsDir: string;
  hintText: string;
}): SpecGateContext | null {
  const featureName = resolveBugfixFeatureName(
    input.featureName ?? '',
    input.projectRoot,
    input.docsDir,
    input.hintText
  );

  if (!featureName || !specArtifactsExist(input.projectRoot, input.docsDir, featureName)) {
    return null;
  }

  return {
    featureName,
    docsDir: input.docsDir,
    specDir: `${input.docsDir}/specs/${featureName}`,
    detected: !input.featureName?.trim(),
  };
}

export function buildCheckSpecPlanStep(featureName: string, docsDir: string) {
  return {
    id: 'check-spec',
    tool: 'check_spec',
    when: '修复与回归测试通过后，且本次 Bug 关联功能规格存在时',
    args: {
      feature_name: featureName,
      docs_dir: docsDir,
    },
    outputs: [`${docsDir}/specs/${featureName}/`],
    note: '若修复改动影响 requirements/design/tasks，先更新规格文档再重跑 check_spec；未通过不得视为修复闭环',
  };
}

export function renderSpecGatePromptSection(specGate: SpecGateContext): string {
  const detectNote = specGate.detected
    ? `\n- 自动识别关联规格: \`${specGate.specDir}/\``
    : `\n- 关联规格: \`${specGate.specDir}/\``;

  return `

## 📐 步骤 3: 规格闸门（修复后）

**调用**: \`check_spec\`
\`\`\`json
{ "feature_name": "${specGate.featureName}", "docs_dir": "${specGate.docsDir}" }
\`\`\`
${detectNote}
**未通过**：按报告补全 requirements/design/tasks 后**重跑 check_spec**；规格与实现不一致时不得结案。`;
}
