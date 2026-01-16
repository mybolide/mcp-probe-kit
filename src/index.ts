#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { 
  detectShell, initSetting, initProject, gencommit, debug, genapi,
  codeReview, gentest, genpr, checkDeps, gendoc, genchangelog, refactor, perf,
  fix, gensql, resolveConflict, genui, explain, convert, cssOrder, genreadme, split, analyzeProject,
  initProjectContext, addFeature, securityScan, fixBug, estimate, genMock, design2code,
  startFeature, startBugfix, startReview, startRelease, startRefactor, startOnboard, startApi, startDoc,
  genSkill
} from "./tools/index.js";
import { VERSION, NAME } from "./version.js";

// 创建MCP服务器实例
const server = new Server(
  {
    name: NAME,
    version: VERSION,
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// 定义工具列表
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "detect_shell",
        description: "检测 AI 应用环境指纹，识别是否为套壳产品；返回 JSON 检测报告；仅基于环境指纹判断，不做法律/归因结论",
        inputSchema: {
          type: "object",
          properties: {
            nonce: {
              type: "string",
              description: "可选的随机字符串用于哈希校验，默认为 iclaude-4.5|2025-10-25|guyu|boot",
            },
            skip_network: {
              type: "boolean",
              description: "是否跳过网络探测（默认 false）",
            },
          },
          required: [],
        },
      },
      {
        name: "init_setting",
        description: "初始化 Cursor IDE 配置，写入推荐的 AI 设置到 .cursor/settings.json",
        inputSchema: {
          type: "object",
          properties: {
            project_path: {
              type: "string",
              description: "项目根目录的完整路径（默认使用当前工作区路径）",
            },
          },
          required: [],
        },
      },
      {
        name: "init_project",
        description: "创建新项目结构和任务分解，按 Spec-Driven Development 方式生成需求/设计/任务文档",
        inputSchema: {
          type: "object",
          properties: {
            input: {
              type: "string",
              description: "项目需求描述（可以是文字描述或文件内容）",
            },
            project_name: {
              type: "string",
              description: "项目名称",
            },
          },
          required: [],
        },
      },
      {
        name: "gencommit",
        description: "分析代码变更生成 Git commit 消息，支持 Conventional Commits 和 emoji；输出文本，不执行提交",
        inputSchema: {
          type: "object",
          properties: {
            changes: {
              type: "string",
              description: "代码变更内容（可选，默认使用 git diff）",
            },
            type: {
              type: "string",
              description: "提交类型：fixed, fix, feat, docs, style, chore, refactor, test",
            },
          },
          required: [],
        },
      },
      {
        name: "debug",
        description: "分析错误信息和堆栈，定位问题根因，输出调试策略和解决方案；仅分析定位，不修复代码",
        inputSchema: {
          type: "object",
          properties: {
            error: {
              type: "string",
              description: "完整错误信息，包含错误消息、堆栈跟踪、触发位置",
            },
            context: {
              type: "string",
              description: "相关代码片段、复现步骤或运行环境描述",
            },
          },
          required: [],
        },
      },
      {
        name: "genapi",
        description: "生成 API 文档（Markdown/OpenAPI/JSDoc），包含参数说明与示例；基于现有接口定义/路由/注释推断；输出文本，不修改业务代码",
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "API 代码（路由定义/Controller/接口函数），包含参数类型和返回值",
            },
            format: {
              type: "string",
              description: "文档格式：markdown, openapi, jsdoc（默认 markdown）",
            },
          },
          required: [],
        },
      },
      {
        name: "code_review",
        description: "审查代码质量、安全性、性能，输出结构化问题清单（severity/category/file/line/suggestion）；仅分析，不自动修改代码",
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "代码片段、文件完整内容或 git diff；支持多文件拼接",
            },
            focus: {
              type: "string",
              description: "审查重点：quality, security, performance, all（默认 all）",
            },
          },
          required: [],
        },
      },
      {
        name: "gentest",
        description: "生成单元测试代码（Jest/Vitest/Mocha），包含边界用例和 mock；默认跟随项目现有测试框架与语言；输出代码，不运行测试",
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "需要测试的代码（函数/类/模块），包含完整签名和依赖导入",
            },
            framework: {
              type: "string",
              description: "测试框架：jest, vitest, mocha（默认跟随项目现有框架，若无法检测则 jest）",
            },
          },
          required: [],
        },
      },
      {
        name: "genpr",
        description: "生成 Pull Request 描述，包含变更摘要、影响范围、测试说明；输出文本，不创建 PR",
        inputSchema: {
          type: "object",
          properties: {
            branch: {
              type: "string",
              description: "当前分支名称（如 feature/user-auth）",
            },
            commits: {
              type: "string",
              description: "Commit 历史（git log 输出或 commit 消息列表）",
            },
          },
          required: [],
        },
      },
      {
        name: "check_deps",
        description: "检查依赖健康度（版本过期/安全漏洞/体积），输出升级建议（含潜在 breaking 风险）；仅分析，不自动升级",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "gendoc",
        description: "生成代码注释（JSDoc/TSDoc/Javadoc），补全参数/返回值/异常/示例；输出代码，不改变逻辑",
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "需要生成注释的代码（函数/类/模块），包含完整签名",
            },
            style: {
              type: "string",
              description: "注释风格：jsdoc, tsdoc, javadoc（默认 jsdoc）",
            },
            lang: {
              type: "string",
              description: "注释语言：zh, en（默认 zh）",
            },
          },
          required: [],
        },
      },
      {
        name: "genchangelog",
        description: "根据 commit 历史生成 CHANGELOG，按 feat/fix/breaking 分类；输出文本，不打 tag",
        inputSchema: {
          type: "object",
          properties: {
            version: {
              type: "string",
              description: "版本号（如 v1.2.0）",
            },
            from: {
              type: "string",
              description: "起始 commit hash 或 tag（如 v1.0.0 或 abc1234）",
            },
            to: {
              type: "string",
              description: "结束 commit hash 或 tag（默认 HEAD）",
            },
          },
          required: [],
        },
      },
      {
        name: "refactor",
        description: "分析代码结构提供重构建议，输出重构步骤和风险评估；仅建议，不自动重构",
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "需要重构的代码，包含完整上下文和依赖关系",
            },
            goal: {
              type: "string",
              description: "重构目标：improve_readability, reduce_complexity, extract_function, extract_class, remove_duplication, simplify_conditionals, improve_naming",
            },
          },
          required: [],
        },
      },
      {
        name: "perf",
        description: "分析性能瓶颈（算法/内存/数据库/React渲染），输出结构化瓶颈清单（evidence/fix/impact）；如需全面审查请用 start_review",
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "需要性能分析的代码，包含循环、数据库查询、渲染逻辑等关键路径",
            },
            type: {
              type: "string",
              description: "分析类型：algorithm, memory, react, database, all（默认 all）",
            },
          },
          required: [],
        },
      },
      {
        name: "fix",
        description: "自动修复可机械化问题（Lint/TS/格式化/导入/未使用变量），输出补丁（unified diff）；不做业务逻辑改动",
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "需要修复的代码",
            },
            type: {
              type: "string",
              description: "修复类型：lint, type, format, import, unused, all（默认 all）",
            },
          },
          required: [],
        },
      },
      {
        name: "gensql",
        description: "根据自然语言生成 SQL 语句（PostgreSQL/MySQL/SQLite）；输出文本，不执行查询",
        inputSchema: {
          type: "object",
          properties: {
            description: {
              type: "string",
              description: "查询需求的自然语言描述，包含表名、字段、条件、排序等要求",
            },
            dialect: {
              type: "string",
              description: "数据库类型：postgres, mysql, sqlite（默认 postgres）",
            },
          },
          required: [],
        },
      },
      {
        name: "resolve_conflict",
        description: "分析 Git 合并冲突，理解双方意图，输出补丁（unified diff）；需人工确认后应用",
        inputSchema: {
          type: "object",
          properties: {
            conflicts: {
              type: "string",
              description: "冲突文件内容（包含 <<<<<<< ======= >>>>>>> 标记）或 git diff 输出",
            },
          },
          required: [],
        },
      },
      {
        name: "genui",
        description: "生成 UI 组件代码（React/Vue/HTML），包含 Props 和样式；默认跟随项目现有前端栈与组件风格；输出代码",
        inputSchema: {
          type: "object",
          properties: {
            description: {
              type: "string",
              description: "组件功能描述，包含交互行为、状态、样式要求",
            },
            framework: {
              type: "string",
              description: "框架：react, vue, html（默认跟随项目现有框架，若无法检测则 react）",
            },
          },
          required: [],
        },
      },
      {
        name: "explain",
        description: "解释代码逻辑和实现原理，包含执行流程、关键概念；输出文本，不修改代码",
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "需要解释的代码片段，包含必要的上下文（导入、类型定义）",
            },
            context: {
              type: "string",
              description: "补充说明（如业务背景、技术栈、想了解的重点）",
            },
          },
          required: [],
        },
      },
      {
        name: "convert",
        description: "转换代码格式或框架（JS→TS/Class→Hooks/Vue2→Vue3），保持逻辑不变；输出代码",
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "源代码，包含完整的导入和类型定义",
            },
            from: {
              type: "string",
              description: "源格式/框架（如 js, ts, vue2, vue3, class, hooks, options-api, composition-api）",
            },
            to: {
              type: "string",
              description: "目标格式/框架（如 js, ts, vue2, vue3, class, hooks, options-api, composition-api）",
            },
          },
          required: [],
        },
      },
      {
        name: "css_order",
        description: "重排 CSS 属性顺序，按布局→盒模型→视觉→其他规则整理；输出文本",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "genreadme",
        description: "生成 README（介绍/安装/使用/脚本/FAQ）；输出文本；如需 OpenAPI 请用 genapi 或 start_doc",
        inputSchema: {
          type: "object",
          properties: {
            project_info: {
              type: "string",
              description: "项目信息或代码",
            },
            style: {
              type: "string",
              description: "风格：standard, minimal, detailed（默认 standard）",
            },
          },
          required: [],
        },
      },
      {
        name: "split",
        description: "拆分大文件为小模块，按类型/功能/组件策略拆分；尽量保持对外导出与行为不变；输出代码",
        inputSchema: {
          type: "object",
          properties: {
            file: {
              type: "string",
              description: "文件完整内容（推荐）或相对路径；内容需包含所有导入导出",
            },
            strategy: {
              type: "string",
              description: "拆分策略：auto, type, function, component, feature（默认 auto）",
            },
          },
          required: [],
        },
      },
      {
        name: "analyze_project",
        description: "分析项目结构、技术栈、架构模式，输出项目全景报告；如需生成上下文文档请用 init_project_context",
        inputSchema: {
          type: "object",
          properties: {
            project_path: {
              type: "string",
              description: "项目路径（默认当前目录）",
            },
            max_depth: {
              type: "number",
              description: "目录树最大深度（默认 5）",
            },
            include_content: {
              type: "boolean",
              description: "是否包含文件内容（默认 true）",
            },
          },
          required: [],
        },
      },
      {
        name: "init_project_context",
        description: "生成项目上下文文档（技术栈/架构/编码规范），供后续开发参考；如需分析项目请先用 analyze_project",
        inputSchema: {
          type: "object",
          properties: {
            docs_dir: {
              type: "string",
              description: "文档目录（默认 docs）",
            },
          },
          required: [],
        },
      },
      {
        name: "add_feature",
        description: "生成新功能规格文档（需求/设计/任务清单），基于项目上下文；如需完整流程请用 start_feature",
        inputSchema: {
          type: "object",
          properties: {
            feature_name: {
              type: "string",
              description: "功能名称（kebab-case 格式，如 user-auth）",
            },
            description: {
              type: "string",
              description: "功能描述",
            },
            docs_dir: {
              type: "string",
              description: "文档目录（默认 docs）",
            },
          },
          required: ["feature_name", "description"],
        },
      },
      {
        name: "security_scan",
        description: "专项安全漏洞扫描（注入/认证/加密/敏感数据），输出结构化风险清单（severity/type/location/fix）；如需全面审查请用 start_review",
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "需要扫描的代码，包含完整上下文（导入、配置、数据库操作等）",
            },
            language: {
              type: "string",
              description: "编程语言（默认自动检测）",
            },
            scan_type: {
              type: "string",
              description: "扫描类型：all, injection, auth, crypto, sensitive_data（默认 all）",
            },
          },
          required: ["code"],
        },
      },
      {
        name: "fix_bug",
        description: "指导 Bug 修复流程，输出根因分析+修复方案+验证步骤；不保证自动修改代码，如要自动改可配合 fix",
        inputSchema: {
          type: "object",
          properties: {
            error_message: {
              type: "string",
              description: "完整错误消息，包含错误类型和描述",
            },
            stack_trace: {
              type: "string",
              description: "完整调用栈，包含文件路径和行号",
            },
            steps_to_reproduce: {
              type: "string",
              description: "复现步骤（操作序列或测试用例）",
            },
            expected_behavior: {
              type: "string",
              description: "期望行为（正确的输出或状态）",
            },
            actual_behavior: {
              type: "string",
              description: "实际行为（错误的输出或状态）",
            },
          },
          required: ["error_message"],
        },
      },
      {
        name: "estimate",
        description: "估算开发工作量，输出故事点、时间范围（乐观/正常/悲观）、风险点；仅估算，不生成代码",
        inputSchema: {
          type: "object",
          properties: {
            task_description: {
              type: "string",
              description: "任务描述（功能需求、技术要求、验收标准）",
            },
            code_context: {
              type: "string",
              description: "相关代码、现有实现或架构文档，用于评估复杂度",
            },
            team_size: {
              type: "number",
              description: "团队规模（默认 1）",
            },
            experience_level: {
              type: "string",
              description: "经验水平：junior, mid, senior（默认 mid）",
            },
          },
          required: ["task_description"],
        },
      },
      {
        name: "gen_mock",
        description: "根据 TypeScript 类型或 JSON Schema 生成 Mock 数据；输出文本，不写入数据库",
        inputSchema: {
          type: "object",
          properties: {
            schema: {
              type: "string",
              description: "数据结构定义（TypeScript interface 或 JSON Schema），字段名应有语义便于生成真实数据",
            },
            count: {
              type: "number",
              description: "生成数量（默认 1，最大 1000）",
            },
            format: {
              type: "string",
              description: "输出格式：json, typescript, javascript, csv（默认 json）",
            },
            locale: {
              type: "string",
              description: "语言区域：zh-CN, en-US（默认 zh-CN）",
            },
            seed: {
              type: "number",
              description: "随机种子（用于可重复生成，相同种子产生相同数据）",
            },
          },
          required: ["schema"],
        },
      },
      {
        name: "design2code",
        description: "设计稿转代码（图片URL/描述/HTML→Vue/React），1:1 还原布局和样式；默认输出与项目一致的框架与样式方案；输出代码",
        inputSchema: {
          type: "object",
          properties: {
            input: {
              type: "string",
              description: "设计稿图片 URL、base64 编码图片、设计稿文字描述或 HTML 源码（三选一）",
            },
            framework: {
              type: "string",
              description: "目标框架：vue, react（默认跟随项目现有框架，若无法检测则 vue）",
            },
            style_solution: {
              type: "string",
              description: "样式方案：tailwind, css-modules, styled-components（默认 tailwind）",
            },
            component_type: {
              type: "string",
              description: "组件类型：page（页面级）, component（通用组件）（默认 page）",
            },
          },
          required: ["input"],
        },
      },
      // ========== 智能编排工具 ==========
      {
        name: "start_feature",
        description: "新功能开发编排：检查上下文→生成规格→估算工作量；若只需规格文档请用 add_feature",
        inputSchema: {
          type: "object",
          properties: {
            feature_name: {
              type: "string",
              description: "功能名称（kebab-case 格式）",
            },
            description: {
              type: "string",
              description: "功能描述",
            },
            docs_dir: {
              type: "string",
              description: "文档目录（默认 docs）",
            },
          },
          required: ["feature_name", "description"],
        },
      },
      {
        name: "start_bugfix",
        description: "Bug 修复编排：检查上下文→分析定位→修复方案→生成测试；若只需定位与调试策略请用 debug；若只需修复流程指导请用 fix_bug",
        inputSchema: {
          type: "object",
          properties: {
            error_message: {
              type: "string",
              description: "错误信息",
            },
            stack_trace: {
              type: "string",
              description: "堆栈跟踪",
            },
          },
          required: ["error_message"],
        },
      },
      {
        name: "start_review",
        description: "代码全面体检：代码审查+安全扫描+性能分析，输出综合报告；若只需单项请用对应工具",
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "需要审查的代码，建议提供完整文件或模块以便全面分析",
            },
            language: {
              type: "string",
              description: "编程语言（默认自动检测）",
            },
          },
          required: ["code"],
        },
      },
      {
        name: "start_release",
        description: "发布准备编排：生成 Changelog→生成 PR 描述；若只需单项请用 genchangelog 或 genpr",
        inputSchema: {
          type: "object",
          properties: {
            version: {
              type: "string",
              description: "版本号（如 v1.2.0）",
            },
            from_tag: {
              type: "string",
              description: "起始 tag（默认上个版本）",
            },
            branch: {
              type: "string",
              description: "分支名称",
            },
          },
          required: ["version"],
        },
      },
      {
        name: "start_refactor",
        description: "代码重构编排：审查现状→重构建议→生成测试；若只需建议请用 refactor",
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "需要重构的代码",
            },
            goal: {
              type: "string",
              description: "重构目标：improve_readability, reduce_complexity, extract_function 等",
            },
          },
          required: ["code"],
        },
      },
      {
        name: "start_onboard",
        description: "快速上手编排：分析项目→生成上下文文档；若只需分析请用 analyze_project",
        inputSchema: {
          type: "object",
          properties: {
            project_path: {
              type: "string",
              description: "项目路径（默认当前目录）",
            },
            docs_dir: {
              type: "string",
              description: "文档目录（默认 docs）",
            },
          },
          required: [],
        },
      },
      {
        name: "start_api",
        description: "API 开发编排：生成文档→生成 Mock→生成测试；若只需单项请用对应生成工具",
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "API 代码（路由/Controller/Service），包含完整的请求响应定义",
            },
            language: {
              type: "string",
              description: "编程语言（默认自动检测）",
            },
            format: {
              type: "string",
              description: "文档格式：markdown, openapi（默认 markdown）",
            },
          },
          required: ["code"],
        },
      },
      {
        name: "start_doc",
        description: "文档补全编排：注释→README→API 文档；若只需单项文档请用对应生成工具",
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "代码或项目信息",
            },
            style: {
              type: "string",
              description: "注释风格：jsdoc, tsdoc（默认 jsdoc）",
            },
            lang: {
              type: "string",
              description: "语言：zh, en（默认 zh）",
            },
          },
          required: ["code"],
        },
      },
      {
        name: "gen_skill",
        description: "生成 Agent Skills 文档，为 MCP Probe Kit 工具生成符合开放标准的技能文档；输出到 skills/ 目录，用户可自行修改扩展",
        inputSchema: {
          type: "object",
          properties: {
            scope: {
              type: "string",
              description: "生成范围：all（全部）, basic, generation, analysis, refactoring, workflow, context, orchestration（默认 all）",
            },
            tool_name: {
              type: "string",
              description: "指定单个工具名称（如 code_review），优先级高于 scope",
            },
            output_dir: {
              type: "string",
              description: "输出目录（默认 skills）",
            },
            lang: {
              type: "string",
              description: "文档语言：zh, en（默认 zh）",
            },
          },
          required: [],
        },
      },
    ],
  };
});

// 处理工具调用
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "detect_shell":
        return await detectShell(args);

      case "init_setting":
        return await initSetting(args);

      case "init_project":
        return await initProject(args);

      case "gencommit":
        return await gencommit(args);

      case "debug":
        return await debug(args);

      case "genapi":
        return await genapi(args);

      case "code_review":
        return await codeReview(args);

      case "gentest":
        return await gentest(args);

      case "genpr":
        return await genpr(args);

      case "check_deps":
        return await checkDeps(args);

      case "gendoc":
        return await gendoc(args);

      case "genchangelog":
        return await genchangelog(args);

      case "refactor":
        return await refactor(args);

      case "perf":
        return await perf(args);

      case "fix":
        return await fix(args);

      case "gensql":
        return await gensql(args);

      case "resolve_conflict":
        return await resolveConflict(args);

      case "genui":
        return await genui(args);

      case "explain":
        return await explain(args);

      case "convert":
        return await convert(args);

      case "css_order":
        return await cssOrder(args);

      case "genreadme":
        return await genreadme(args);

      case "split":
        return await split(args);

      case "analyze_project":
        return await analyzeProject(args);

      case "init_project_context":
        return await initProjectContext(args);

      case "add_feature":
        return await addFeature(args);

      case "security_scan":
        return await securityScan(args);

      case "fix_bug":
        return await fixBug(args);

      case "estimate":
        return await estimate(args);

      case "gen_mock":
        return await genMock(args);

      case "design2code":
        return await design2code(args);

      // 智能编排工具
      case "start_feature":
        return await startFeature(args);

      case "start_bugfix":
        return await startBugfix(args);

      case "start_review":
        return await startReview(args);

      case "start_release":
        return await startRelease(args);

      case "start_refactor":
        return await startRefactor(args);

      case "start_onboard":
        return await startOnboard(args);

      case "start_api":
        return await startApi(args);

      case "start_doc":
        return await startDoc(args);

      case "gen_skill":
        return await genSkill(args);

      default:
        throw new Error(`未知工具: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: `错误: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

// 定义资源列表
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: "probe://status",
        name: "服务器状态",
        description: "MCP Probe Kit 服务器当前状态",
        mimeType: "application/json",
      },
    ],
  };
});

// 读取资源
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri === "probe://status") {
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(
            {
              status: "running",
              timestamp: new Date().toISOString(),
              serverInfo: {
                name: NAME,
                version: VERSION,
                description: "Cursor 开发增强工具集",
              },
              tools: {
                detect_shell: "enabled",
                init_setting: "enabled",
                init_project: "enabled",
                gencommit: "enabled",
                debug: "enabled",
                genapi: "enabled",
                code_review: "enabled",
                gentest: "enabled",
                genpr: "enabled",
                check_deps: "enabled",
                gendoc: "enabled",
                genchangelog: "enabled",
                refactor: "enabled",
                perf: "enabled",
                fix: "enabled",
                gensql: "enabled",
                resolve_conflict: "enabled",
                genui: "enabled",
                explain: "enabled",
                convert: "enabled",
                css_order: "enabled",
                genreadme: "enabled",
                split: "enabled",
                analyze_project: "enabled",
                init_project_context: "enabled",
                add_feature: "enabled",
                security_scan: "enabled",
                fix_bug: "enabled",
                estimate: "enabled",
                gen_mock: "enabled",
                design2code: "enabled",
                // 智能编排
                start_feature: "enabled",
                start_bugfix: "enabled",
                start_review: "enabled",
                start_release: "enabled",
                start_refactor: "enabled",
                start_onboard: "enabled",
                start_api: "enabled",
                start_doc: "enabled",
                gen_skill: "enabled",
              },
            },
            null,
            2
          ),
        },
      ],
    };
  }

  throw new Error(`未知资源: ${uri}`);
});

// 启动服务器
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Probe Kit 服务器已启动");
}

// 启动服务器
main().catch((error) => {
  console.error("服务器启动失败:", error);
  process.exit(1);
});

