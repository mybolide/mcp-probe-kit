import { parseArgs, getString } from "../utils/parseArgs.js";
import { okStructured } from "../lib/response.js";
import { loadTemplate, normalizeTemplateProfile } from "../lib/template-loader.js";
import { handleToolError } from "../utils/error-handler.js";
import type { FeatureSpec } from "../schemas/output/project-tools.js";

/**
 * add_feature 工具
 *
 * 功能：为已有项目添加新功能的规格文档
 * 模式：指令生成器 — MCP 返回模板与要求，由调用方 Agent 按模板落盘
 * 
 * 输出文件：
 * - docs/specs/{feature_name}/requirements.md - 需求文档
 * - docs/specs/{feature_name}/design.md - 设计文档
 * - docs/specs/{feature_name}/tasks.md - 任务清单
 */

// 默认文档目录
const DEFAULT_DOCS_DIR = "docs";

type TemplateProfileResolved = 'guided' | 'strict';
type TemplateProfileRequest = 'guided' | 'strict' | 'auto';

function decideTemplateProfile(description: string): TemplateProfileResolved {
  const text = description || '';
  const lengthScore = text.length >= 200 ? 2 : text.length >= 120 ? 1 : 0;
  const structureSignals = [
    /(^|\n)\s*#{1,3}\s+\S+/m,
    /(^|\n)\s*[-*]\s+\S+/m,
    /(^|\n)\s*\d+\.\s+\S+/m,
    /需求|验收|接口|API|数据库|模型|字段|流程|架构|权限|角色|非功能/m,
  ];
  const signalScore = structureSignals.reduce((score, regex) => score + (regex.test(text) ? 1 : 0), 0);

  if (lengthScore >= 1 && signalScore >= 2) {
    return 'strict';
  }
  return 'guided';
}

function resolveTemplateProfile(rawProfile: string, description: string): {
  requested: TemplateProfileRequest;
  resolved: TemplateProfileResolved;
  warning?: string;
  reason?: string;
} {
  const normalized = rawProfile.trim().toLowerCase();
  if (!normalized || normalized === 'auto') {
    const resolved = decideTemplateProfile(description);
    return {
      requested: 'auto',
      resolved,
      reason: resolved === 'strict' ? '需求结构化且较完整' : '需求较简略或需更多指导',
    };
  }

  if (normalized === 'guided' || normalized === 'strict') {
    return {
      requested: normalized as TemplateProfileRequest,
      resolved: normalizeTemplateProfile(normalized) as TemplateProfileResolved,
    };
  }

  return {
    requested: 'auto',
    resolved: normalizeTemplateProfile(normalized) as TemplateProfileResolved,
    warning: `模板档位 "${rawProfile}" 不支持，已回退为 ${normalizeTemplateProfile(normalized)}`,
  };
}

/**
 * 从自然语言输入中提取功能名和描述
 * @param input - 自然语言输入
 * @returns 提取的功能名和描述
 */
function extractFeatureInfo(input: string): { name: string; description: string } {
  // 移除常见的引导词
  let text = input
    .replace(/^(添加|实现|开发|创建|新增|生成|构建|做|要|想要|需要|帮我|请|麻烦)/i, "")
    .trim();
  
  // 移除结尾的"功能"、"模块"等词
  text = text.replace(/(功能|模块|特性|组件|系统|服务)$/i, "").trim();
  
  // 如果文本很短（少于20个字符），直接作为功能名
  if (text.length < 20) {
    const name = text
      .toLowerCase()
      .replace(/[\s\u4e00-\u9fa5]+/g, "-") // 将空格和中文替换为连字符
      .replace(/[^a-z0-9-]/g, "") // 移除非字母数字和连字符
      .replace(/-+/g, "-") // 合并多个连字符
      .replace(/^-|-$/g, ""); // 移除首尾连字符
    
    return {
      name: name || "new-feature",
      description: input,
    };
  }
  
  // 如果文本较长，尝试提取关键词作为功能名
  // 提取前几个关键词
  const words = text.split(/[\s,，、]+/).filter(w => w.length > 0);
  const keyWords = words.slice(0, 3).join(" ");
  
  const name = keyWords
    .toLowerCase()
    .replace(/[\s\u4e00-\u9fa5]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  
  return {
    name: name || "new-feature",
    description: input,
  };
}

/**
 * add_feature 工具实现
 * 
 * @param args - 工具参数
 * @param args.feature_name - 功能名称（必填，kebab-case 格式）
 * @param args.description - 功能描述（必填）
 * @param args.docs_dir - 文档目录，默认 "docs"
 * @returns MCP 响应，包含功能规格生成指南
 */
export async function addFeature(args: any) {
  try {
    // 智能参数解析，支持自然语言输入
    const parsedArgs = parseArgs<{
      feature_name?: string;
      description?: string;
      docs_dir?: string;
      template_profile?: string;
      input?: string;
    }>(args, {
      defaultValues: {
        feature_name: "",
        description: "",
        docs_dir: DEFAULT_DOCS_DIR,
        template_profile: "auto",
      },
      primaryField: "input", // 纯文本输入默认映射到 input 字段
      fieldAliases: {
        feature_name: ["name", "feature", "功能名", "功能名称"],
        description: ["desc", "requirement", "描述", "需求"],
        docs_dir: ["dir", "output", "目录", "文档目录"],
        template_profile: ["profile", "mode", "模板档位", "模板模式", "模板级别"],
      },
    });

    let featureName = getString(parsedArgs.feature_name);
    let description = getString(parsedArgs.description);
    const docsDir = getString(parsedArgs.docs_dir) || DEFAULT_DOCS_DIR;
    const rawProfile = getString(parsedArgs.template_profile);

    // 如果是纯自然语言输入（input 字段有值但 feature_name 和 description 为空）
    const input = getString(parsedArgs.input);
    if (input && !featureName && !description) {
      // 智能提取功能名和描述
      // 尝试从自然语言中提取功能名（通常是关键词）
      const extracted = extractFeatureInfo(input);
      featureName = extracted.name;
      description = extracted.description;
    }

    // 如果只有 description 没有 feature_name，尝试从 description 提取
    if (!featureName && description) {
      const extracted = extractFeatureInfo(description);
      featureName = extracted.name;
      if (!description || description === featureName) {
        description = extracted.description;
      }
    }

    // 验证必填参数
    if (!featureName || !description) {
      throw new Error(
        "请提供功能名称和描述。\n\n" +
        "示例用法：\n" +
        "- 自然语言：'添加用户认证功能'\n" +
        "- 详细描述：'实现用户登录、注册和密码重置功能'\n" +
        "- JSON格式：{\"feature_name\": \"user-auth\", \"description\": \"用户认证功能\"}"
      );
    }

    const profileDecision = resolveTemplateProfile(rawProfile, description);
    const templateProfile = profileDecision.resolved;

    const templateVars = {
      feature_name: featureName,
      description,
      docs_dir: docsDir,
    };

    const [requirementsTemplate, designTemplate, tasksTemplate] = await Promise.all([
      loadTemplate({
        category: 'specs',
        name: 'feature',
        profile: templateProfile,
        file: 'requirements.md',
        variables: templateVars,
      }),
      loadTemplate({
        category: 'specs',
        name: 'feature',
        profile: templateProfile,
        file: 'design.md',
        variables: templateVars,
      }),
      loadTemplate({
        category: 'specs',
        name: 'feature',
        profile: templateProfile,
        file: 'tasks.md',
        variables: templateVars,
      }),
    ]);

    const validationWarnings: string[] = [];
    if (profileDecision.warning) {
      validationWarnings.push(profileDecision.warning);
    }

    const combinedValidation = {
      requirements: requirementsTemplate.validation,
      design: designTemplate.validation,
      tasks: tasksTemplate.validation,
      warnings: validationWarnings,
    };

    const formatValidation = (label: string, validation: { passed: boolean; missingSections: string[]; missingFields: string[]; warnings: string[] }) => {
      if (validation.passed) {
        return `- ${label}: 通过`;
      }
      const parts: string[] = [];
      if (validation.missingSections.length > 0) {
        parts.push(`缺少章节: ${validation.missingSections.join(', ')}`);
      }
      if (validation.missingFields.length > 0) {
        parts.push(`缺少字段: ${validation.missingFields.join(', ')}`);
      }
      if (validation.warnings.length > 0) {
        parts.push(`警告: ${validation.warnings.join('；')}`);
      }
      return `- ${label}: 未通过（${parts.join(' / ')}）`;
    };

    const fenceOpen = "````markdown";
    const fenceClose = "````";
    const guide = `# 添加新功能指南（模板驱动）

## 🎯 任务目标

为项目添加新功能：**${featureName}**

**功能描述**: ${description}

**模板档位**: ${templateProfile}${profileDecision.requested === 'auto' ? '（自动）' : ''}
${profileDecision.requested === 'auto' && profileDecision.reason ? `**选择理由**: ${profileDecision.reason}` : ''}

---

## 📋 前置检查

1. 检查文件 \`${docsDir}/project-context.md\` 是否存在
2. 如果存在，读取并参考其中的技术栈、架构模式、编码规范
3. 如果不存在，建议先运行 \`init_project_context\` 工具

---

## ✅ 模板校验结果

${formatValidation('requirements.md', requirementsTemplate.validation)}
${formatValidation('design.md', designTemplate.validation)}
${formatValidation('tasks.md', tasksTemplate.validation)}
${combinedValidation.warnings.length > 0 ? `- 其他警告: ${combinedValidation.warnings.join('；')}` : ''}

---

## 📝 创建文档（由 Agent 落盘）

MCP **不会**写入磁盘。请根据下方模板，在 \`${docsDir}/specs/${featureName}/\` 创建三个文件并替换占位符。

### 文件 1: requirements.md

**文件路径**: \`${docsDir}/specs/${featureName}/requirements.md\`
**模板来源**: ${requirementsTemplate.source}

${fenceOpen}
${requirementsTemplate.content}
${fenceClose}

---

### 文件 2: design.md

**文件路径**: \`${docsDir}/specs/${featureName}/design.md\`
**模板来源**: ${designTemplate.source}

${fenceOpen}
${designTemplate.content}
${fenceClose}

---

### 文件 3: tasks.md

**文件路径**: \`${docsDir}/specs/${featureName}/tasks.md\`
**模板来源**: ${tasksTemplate.source}

${fenceOpen}
${tasksTemplate.content}
${fenceClose}

---

## ✅ 完成后检查

- [ ] \`${docsDir}/specs/${featureName}/requirements.md\` 已创建
- [ ] \`${docsDir}/specs/${featureName}/design.md\` 已创建
- [ ] \`${docsDir}/specs/${featureName}/tasks.md\` 已创建
- [ ] 所有占位符已替换
- [ ] 内容与项目上下文一致（如有）

---

*指南版本: 1.1.0*
*工具: MCP Probe Kit - add_feature*
`;

    const specPaths = [
      `${docsDir}/specs/${featureName}/requirements.md`,
      `${docsDir}/specs/${featureName}/design.md`,
      `${docsDir}/specs/${featureName}/tasks.md`,
    ];
    const pendingFiles = specPaths.map((specPath) => ({
      path: specPath,
      reason: "由 Agent 根据本工具返回的模板写入",
    }));

    const structuredData: FeatureSpec = {
      summary: `已生成功能规格写作计划：${featureName}`,
      featureName,
      requirements: ["见 requirements.md 模板"],
      tasks: [{ id: "1", title: "按模板创建 specs 文档", description: "将下方模板落盘并补充真实内容" }],
      pendingFiles,
      specPaths,
    };

    return okStructured(guide, structuredData, {
      schema: (await import("../schemas/output/project-tools.js")).FeatureSpecSchema,
      note: "本工具返回模板与要求，不代写文件；Agent 须按指南创建 specs",
      template: {
        profile: templateProfile,
        requested: profileDecision.requested,
        validation: combinedValidation,
      },
    });
  } catch (error) {
    return handleToolError(error, 'add_feature');
  }
}
