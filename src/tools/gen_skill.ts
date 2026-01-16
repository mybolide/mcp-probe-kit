/**
 * gen_skill - 生成 Agent Skills 文档
 */

// 工具分类定义
const TOOL_CATEGORIES: Record<string, string[]> = {
  basic: ["detect_shell", "init_setting", "init_project", "css_order"],
  generation: ["gencommit", "gentest", "genapi", "gendoc", "genpr", "genchangelog", "genreadme", "gensql", "genui", "gen_mock"],
  analysis: ["code_review", "security_scan", "perf", "explain", "analyze_project", "check_deps", "debug"],
  refactoring: ["refactor", "fix", "convert", "split", "resolve_conflict"],
  workflow: ["fix_bug", "estimate", "design2code"],
  context: ["init_project_context", "add_feature"],
  orchestration: ["start_feature", "start_bugfix", "start_review", "start_release", "start_refactor", "start_onboard", "start_api", "start_doc"],
};

// 工具元数据
interface ToolMeta {
  name: string;
  description: string;
  usage: string;
  params: string;
  related: string[];
}

const TOOL_METADATA: Record<string, ToolMeta> = {
  detect_shell: {
    name: "detect-shell",
    description: "检测 AI 应用环境指纹，识别是否为套壳产品",
    usage: "当需要检测 AI 应用是否为套壳产品时使用",
    params: "nonce（可选）: 随机字符串\nskip_network（可选）: 是否跳过网络探测",
    related: [],
  },
  init_setting: {
    name: "init-setting",
    description: "初始化 Cursor IDE 配置",
    usage: "当需要初始化 Cursor IDE 的 AI 配置时使用",
    params: "project_path（可选）: 项目根目录路径",
    related: ["init_project"],
  },
  init_project: {
    name: "init-project",
    description: "创建新项目结构和任务分解",
    usage: "当需要创建新项目或初始化项目结构时使用",
    params: "input: 项目需求描述\nproject_name: 项目名称",
    related: ["init_setting", "init_project_context"],
  },
  css_order: {
    name: "css-order",
    description: "重排 CSS 属性顺序",
    usage: "当需要整理 CSS 属性顺序时使用",
    params: "无参数",
    related: [],
  },
  gencommit: {
    name: "gencommit",
    description: "分析代码变更生成 Git commit 消息",
    usage: "当需要生成规范的 Git commit 消息时使用",
    params: "changes（可选）: 代码变更内容\ntype（可选）: 提交类型",
    related: ["genpr", "genchangelog"],
  },
  gentest: {
    name: "gentest",
    description: "生成单元测试代码（Jest/Vitest/Mocha）",
    usage: "当需要为代码生成单元测试时使用",
    params: "code: 需要测试的代码\nframework（可选）: 测试框架",
    related: ["code_review", "start_api"],
  },
  genapi: {
    name: "genapi",
    description: "生成 API 文档（Markdown/OpenAPI/JSDoc）",
    usage: "当需要为 API 生成文档时使用",
    params: "code: API 代码\nformat（可选）: 文档格式",
    related: ["gendoc", "genreadme", "start_doc"],
  },
  gendoc: {
    name: "gendoc",
    description: "生成代码注释（JSDoc/TSDoc/Javadoc）",
    usage: "当需要为代码添加注释时使用",
    params: "code: 需要生成注释的代码\nstyle（可选）: 注释风格\nlang（可选）: 注释语言",
    related: ["genapi", "start_doc"],
  },
  genpr: {
    name: "genpr",
    description: "生成 Pull Request 描述",
    usage: "当需要生成 PR 描述时使用",
    params: "branch: 当前分支名称\ncommits: Commit 历史",
    related: ["gencommit", "genchangelog", "start_release"],
  },
  genchangelog: {
    name: "genchangelog",
    description: "根据 commit 历史生成 CHANGELOG",
    usage: "当需要生成或更新 CHANGELOG 时使用",
    params: "version: 版本号\nfrom（可选）: 起始 commit/tag\nto（可选）: 结束 commit/tag",
    related: ["gencommit", "genpr", "start_release"],
  },
  genreadme: {
    name: "genreadme",
    description: "生成 README 文档",
    usage: "当需要生成项目 README 文档时使用",
    params: "project_info: 项目信息或代码\nstyle（可选）: 风格",
    related: ["genapi", "start_doc"],
  },
  gensql: {
    name: "gensql",
    description: "根据自然语言生成 SQL 语句",
    usage: "当需要根据描述生成 SQL 查询时使用",
    params: "description: 查询需求描述\ndialect（可选）: 数据库类型",
    related: [],
  },
  genui: {
    name: "genui",
    description: "生成 UI 组件代码（React/Vue/HTML）",
    usage: "当需要生成 UI 组件时使用",
    params: "description: 组件功能描述\nframework（可选）: 框架",
    related: ["design2code"],
  },
  gen_mock: {
    name: "gen-mock",
    description: "根据 TypeScript 类型或 JSON Schema 生成 Mock 数据",
    usage: "当需要生成测试数据或 Mock 数据时使用",
    params: "schema: 数据结构定义\ncount（可选）: 生成数量\nformat（可选）: 输出格式",
    related: ["gentest", "start_api"],
  },
  code_review: {
    name: "code-review",
    description: "审查代码质量、安全性、性能",
    usage: "当需要审查代码质量时使用",
    params: "code: 代码片段或文件内容\nfocus（可选）: 审查重点",
    related: ["security_scan", "perf", "start_review"],
  },
  security_scan: {
    name: "security-scan",
    description: "专项安全漏洞扫描",
    usage: "当需要专项安全检查时使用",
    params: "code: 需要扫描的代码\nlanguage（可选）: 编程语言\nscan_type（可选）: 扫描类型",
    related: ["code_review", "start_review"],
  },
  perf: {
    name: "perf",
    description: "分析性能瓶颈",
    usage: "当需要分析代码性能问题时使用",
    params: "code: 需要性能分析的代码\ntype（可选）: 分析类型",
    related: ["code_review", "start_review"],
  },
  explain: {
    name: "explain",
    description: "解释代码逻辑和实现原理",
    usage: "当需要理解代码逻辑时使用",
    params: "code: 需要解释的代码片段\ncontext（可选）: 补充说明",
    related: [],
  },
  analyze_project: {
    name: "analyze-project",
    description: "分析项目结构、技术栈、架构模式",
    usage: "当需要了解项目整体情况时使用",
    params: "project_path（可选）: 项目路径\nmax_depth（可选）: 目录树最大深度",
    related: ["init_project_context", "start_onboard"],
  },
  check_deps: {
    name: "check-deps",
    description: "检查依赖健康度",
    usage: "当需要检查项目依赖状态时使用",
    params: "无参数",
    related: ["security_scan"],
  },
  debug: {
    name: "debug",
    description: "分析错误信息和堆栈，定位问题根因",
    usage: "当遇到错误需要定位问题时使用",
    params: "error: 完整错误信息\ncontext（可选）: 相关代码片段",
    related: ["fix_bug", "start_bugfix"],
  },
  refactor: {
    name: "refactor",
    description: "分析代码结构提供重构建议",
    usage: "当需要重构代码但不确定如何进行时使用",
    params: "code: 需要重构的代码\ngoal（可选）: 重构目标",
    related: ["code_review", "start_refactor"],
  },
  fix: {
    name: "fix",
    description: "自动修复可机械化问题（Lint/TS/格式化）",
    usage: "当需要自动修复代码格式或类型问题时使用",
    params: "code: 需要修复的代码\ntype（可选）: 修复类型",
    related: ["fix_bug"],
  },
  convert: {
    name: "convert",
    description: "转换代码格式或框架",
    usage: "当需要转换代码格式或迁移框架时使用",
    params: "code: 源代码\nfrom: 源格式/框架\nto: 目标格式/框架",
    related: [],
  },
  split: {
    name: "split",
    description: "拆分大文件为小模块",
    usage: "当文件过大需要拆分时使用",
    params: "file: 文件完整内容或路径\nstrategy（可选）: 拆分策略",
    related: ["refactor"],
  },
  resolve_conflict: {
    name: "resolve-conflict",
    description: "分析 Git 合并冲突",
    usage: "当遇到 Git 合并冲突需要解决时使用",
    params: "conflicts: 冲突文件内容或 git diff 输出",
    related: [],
  },
  fix_bug: {
    name: "fix-bug",
    description: "指导 Bug 修复流程",
    usage: "当需要系统性修复 Bug 时使用",
    params: "error_message: 完整错误消息\nstack_trace（可选）: 完整调用栈",
    related: ["debug", "fix", "start_bugfix"],
  },
  estimate: {
    name: "estimate",
    description: "估算开发工作量",
    usage: "当需要评估开发任务工作量时使用",
    params: "task_description: 任务描述\ncode_context（可选）: 相关代码",
    related: ["start_feature"],
  },
  design2code: {
    name: "design2code",
    description: "设计稿转代码",
    usage: "当需要将设计稿转换为代码时使用",
    params: "input: 设计稿图片 URL/描述/HTML\nframework（可选）: 目标框架",
    related: ["genui"],
  },
  init_project_context: {
    name: "init-project-context",
    description: "生成项目上下文文档",
    usage: "当需要记录项目上下文供后续开发参考时使用",
    params: "docs_dir（可选）: 文档目录",
    related: ["analyze_project", "start_onboard"],
  },
  add_feature: {
    name: "add-feature",
    description: "生成新功能规格文档",
    usage: "当需要为新功能生成规格文档时使用",
    params: "feature_name: 功能名称\ndescription: 功能描述",
    related: ["start_feature", "estimate"],
  },
  start_feature: {
    name: "start-feature",
    description: "新功能开发编排",
    usage: "当需要完整的新功能开发流程时使用",
    params: "feature_name: 功能名称\ndescription: 功能描述",
    related: ["add_feature", "estimate", "init_project_context"],
  },
  start_bugfix: {
    name: "start-bugfix",
    description: "Bug 修复编排",
    usage: "当需要完整的 Bug 修复流程时使用",
    params: "error_message: 错误信息\nstack_trace（可选）: 堆栈跟踪",
    related: ["debug", "fix_bug", "gentest"],
  },
  start_review: {
    name: "start-review",
    description: "代码全面体检",
    usage: "当需要全面检查代码质量时使用",
    params: "code: 需要审查的代码\nlanguage（可选）: 编程语言",
    related: ["code_review", "security_scan", "perf"],
  },
  start_release: {
    name: "start-release",
    description: "发布准备编排",
    usage: "当准备发布新版本时使用",
    params: "version: 版本号\nfrom_tag（可选）: 起始 tag",
    related: ["genchangelog", "genpr"],
  },
  start_refactor: {
    name: "start-refactor",
    description: "代码重构编排",
    usage: "当需要系统性重构代码时使用",
    params: "code: 需要重构的代码\ngoal（可选）: 重构目标",
    related: ["refactor", "code_review", "gentest"],
  },
  start_onboard: {
    name: "start-onboard",
    description: "快速上手编排",
    usage: "当需要快速了解一个项目时使用",
    params: "project_path（可选）: 项目路径\ndocs_dir（可选）: 文档目录",
    related: ["analyze_project", "init_project_context"],
  },
  start_api: {
    name: "start-api",
    description: "API 开发编排",
    usage: "当需要完整的 API 开发流程时使用",
    params: "code: API 代码\nlanguage（可选）: 编程语言",
    related: ["genapi", "gen_mock", "gentest"],
  },
  start_doc: {
    name: "start-doc",
    description: "文档补全编排",
    usage: "当需要一次性补全项目文档时使用",
    params: "code: 代码或项目信息\nstyle（可选）: 注释风格",
    related: ["gendoc", "genreadme", "genapi"],
  },
};

const CATEGORY_NAMES: Record<string, string> = {
  basic: "基础工具",
  generation: "生成工具",
  analysis: "分析工具",
  refactoring: "重构工具",
  workflow: "工作流工具",
  context: "上下文工具",
  orchestration: "编排工具",
};

// Agent Skills 标准模板
const SKILL_TEMPLATE = `---
name: skill-name
description: 技能描述，说明做什么、什么时候用（最多1024字符）
compatibility: claude, gemini, opencode
metadata:
  author: mcp-probe-kit
  version: 1.0.0
  mcp-tool: tool_name
---

# skill-name

## 功能描述

详细描述技能的功能和用途。

## 使用场景

说明什么情况下应该使用这个技能。

## 参数说明

\`\`\`
param1: 参数1说明
param2（可选）: 参数2说明
\`\`\`

## 调用示例

调用 MCP 工具 \`tool_name\`：

\`\`\`json
{
  "tool": "tool_name",
  "arguments": {
    "param1": "value1"
  }
}
\`\`\`

## 相关工具

\`related_tool_1\`, \`related_tool_2\`
`;

function generateSkillMd(toolId: string, lang: "zh" | "en"): string {
  const meta = TOOL_METADATA[toolId];
  if (!meta) return "";

  const isZh = lang === "zh";
  const relatedTools = meta.related.length > 0
    ? meta.related.map(t => "`" + t + "`").join(", ")
    : isZh ? "无" : "None";

  const lines = [
    "---",
    `name: ${meta.name}`,
    `description: ${meta.description}`,
    "compatibility: claude, gemini, opencode",
    "metadata:",
    "  author: mcp-probe-kit",
    "  version: 1.0.0",
    `  mcp-tool: ${toolId}`,
    "---",
    "",
    `# ${meta.name}`,
    "",
    `## ${isZh ? "功能描述" : "Description"}`,
    "",
    meta.description,
    "",
    `## ${isZh ? "使用场景" : "When to Use"}`,
    "",
    meta.usage,
    "",
    `## ${isZh ? "参数说明" : "Parameters"}`,
    "",
    "```",
    meta.params,
    "```",
    "",
    `## ${isZh ? "调用示例" : "Example"}`,
    "",
    `${isZh ? "调用 MCP 工具" : "Call MCP tool"} \`${toolId}\`：`,
    "",
    "```json",
    "{",
    `  "tool": "${toolId}",`,
    "  \"arguments\": {",
    `    // ${isZh ? "根据参数说明填写" : "Fill in according to parameters"}`,
    "  }",
    "}",
    "```",
    "",
    `## ${isZh ? "相关工具" : "Related Tools"}`,
    "",
    relatedTools,
    "",
    "---",
    "",
    `*${isZh ? "由 MCP Probe Kit gen_skill 工具生成" : "Generated by MCP Probe Kit gen_skill tool"}*`,
  ];

  return lines.join("\n");
}

function generateReadme(tools: string[], lang: "zh" | "en"): string {
  const isZh = lang === "zh";
  const lines: string[] = [];

  lines.push(`# ${isZh ? "MCP Probe Kit 技能文档" : "MCP Probe Kit Skills"}`);
  lines.push("");
  lines.push(isZh 
    ? "本目录包含 MCP Probe Kit 所有工具的 Agent Skills 文档，符合 [Agent Skills 开放标准](https://agentskills.io)。"
    : "This directory contains Agent Skills documentation for all MCP Probe Kit tools, following the [Agent Skills open standard](https://agentskills.io).");
  lines.push("");
  lines.push(`## ${isZh ? "使用方法" : "Usage"}`);
  lines.push("");
  lines.push(isZh
    ? "将 `skills/` 目录复制到你的项目中，AI 助手会自动发现并使用这些技能。"
    : "Copy the `skills/` directory to your project, and AI assistants will automatically discover and use these skills.");
  lines.push("");
  lines.push(`## ${isZh ? "技能列表" : "Skills List"}`);
  lines.push("");

  for (const [category, categoryTools] of Object.entries(TOOL_CATEGORIES)) {
    const categoryName = isZh ? CATEGORY_NAMES[category] : category.charAt(0).toUpperCase() + category.slice(1);
    const filteredTools = categoryTools.filter(t => tools.includes(t));
    
    if (filteredTools.length === 0) continue;
    
    lines.push(`### ${categoryName}`);
    lines.push("");
    lines.push(`| ${isZh ? "技能" : "Skill"} | ${isZh ? "描述" : "Description"} |`);
    lines.push("|------|------|");
    
    for (const toolId of filteredTools) {
      const meta = TOOL_METADATA[toolId];
      if (meta) {
        const desc = meta.description.length > 40 ? meta.description.slice(0, 40) + "..." : meta.description;
        lines.push(`| [${meta.name}](./${meta.name}/SKILL.md) | ${desc} |`);
      }
    }
    lines.push("");
  }

  lines.push(`## ${isZh ? "自定义" : "Customization"}`);
  lines.push("");
  lines.push(isZh
    ? "你可以根据项目需求修改这些技能文档，添加项目特定的上下文和指导。"
    : "You can modify these skill documents according to your project needs, adding project-specific context and guidance.");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(`*${isZh ? "由 MCP Probe Kit gen_skill 工具生成" : "Generated by MCP Probe Kit gen_skill tool"}*`);

  return lines.join("\n");
}

export async function genSkill(args: any) {
  try {
    const scope = args?.scope || "all";
    const toolName = args?.tool_name;
    const outputDir = args?.output_dir || "skills";
    const lang = args?.lang || "zh";
    const isZh = lang === "zh";

    let toolsToGenerate: string[] = [];

    if (toolName) {
      if (!TOOL_METADATA[toolName]) {
        throw new Error(`未知工具: ${toolName}`);
      }
      toolsToGenerate = [toolName];
    } else if (scope === "all") {
      toolsToGenerate = Object.keys(TOOL_METADATA);
    } else {
      const categoryTools = TOOL_CATEGORIES[scope];
      if (!categoryTools) {
        throw new Error(`未知分类: ${scope}，可选值: ${Object.keys(TOOL_CATEGORIES).join(", ")}`);
      }
      toolsToGenerate = categoryTools;
    }

    const files: { path: string; content: string }[] = [];

    for (const toolId of toolsToGenerate) {
      const meta = TOOL_METADATA[toolId];
      if (!meta) continue;
      files.push({
        path: `${outputDir}/${meta.name}/SKILL.md`,
        content: generateSkillMd(toolId, lang as "zh" | "en"),
      });
    }

    files.push({
      path: `${outputDir}/README.md`,
      content: generateReadme(toolsToGenerate, lang as "zh" | "en"),
    });

    // 构建输出
    const outputLines: string[] = [];
    
    outputLines.push(`# ${isZh ? "Agent Skills 生成指南" : "Agent Skills Generation Guide"}`);
    outputLines.push("");
    outputLines.push(`## ${isZh ? "Agent Skills 标准模板" : "Agent Skills Standard Template"}`);
    outputLines.push("");
    outputLines.push(isZh 
      ? "以下是符合 [Agent Skills 开放标准](https://agentskills.io) 的 SKILL.md 模板："
      : "The following is a SKILL.md template that conforms to the [Agent Skills open standard](https://agentskills.io):");
    outputLines.push("");
    outputLines.push("```markdown");
    outputLines.push(SKILL_TEMPLATE);
    outputLines.push("```");
    outputLines.push("");
    outputLines.push(`### ${isZh ? "格式要求" : "Format Requirements"}`);
    outputLines.push("");
    outputLines.push(`| ${isZh ? "字段" : "Field"} | ${isZh ? "要求" : "Requirement"} |`);
    outputLines.push("|------|------|");
    outputLines.push(`| name | ${isZh ? "必填，最多64字符，小写字母+数字+连字符" : "Required, max 64 chars, lowercase+numbers+hyphens"} |`);
    outputLines.push(`| description | ${isZh ? "必填，最多1024字符" : "Required, max 1024 chars"} |`);
    outputLines.push(`| compatibility | ${isZh ? "可选，支持的平台" : "Optional, supported platforms"} |`);
    outputLines.push(`| metadata | ${isZh ? "可选，额外元数据" : "Optional, additional metadata"} |`);
    outputLines.push("");
    outputLines.push(`### ${isZh ? "目录结构" : "Directory Structure"}`);
    outputLines.push("");
    outputLines.push("```");
    outputLines.push("skills/");
    outputLines.push("└── skill-name/");
    outputLines.push(`    ├── SKILL.md          # ${isZh ? "核心文件（必须）" : "Core file (required)"}`);
    outputLines.push(`    ├── scripts/          # ${isZh ? "可执行脚本（可选）" : "Scripts (optional)"}`);
    outputLines.push(`    └── references/       # ${isZh ? "参考文档（可选）" : "References (optional)"}`);
    outputLines.push("```");
    outputLines.push("");
    outputLines.push(`## ${isZh ? "生成范围" : "Scope"}`);
    outputLines.push("");
    outputLines.push(`${isZh ? "本次生成" : "Generated"} **${toolsToGenerate.length}** ${isZh ? "个工具的技能文档" : "skill documents"}`);
    outputLines.push("");
    outputLines.push(`## ${isZh ? "请创建以下文件" : "Please Create Files"}`);
    outputLines.push("");

    for (const file of files) {
      outputLines.push(`### \`${file.path}\``);
      outputLines.push("");
      outputLines.push("```markdown");
      outputLines.push(file.content);
      outputLines.push("```");
      outputLines.push("");
    }

    return {
      content: [{ type: "text", text: outputLines.join("\n") }],
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `❌ 生成失败: ${errorMsg}` }],
      isError: true,
    };
  }
}
