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
  fix, gensql, resolveConflict, genui, explain, convert, cssOrder, genreadme, split, analyzeProject
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
        description: "【套壳鉴定】执行套壳探针检测，返回 JSON 指纹",
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
        description: "【初始化配置】在 .cursor/settings.json 中写入推荐的 AI 配置",
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
        description: "【初始化工程】按照 Spec-Driven Development 方式创建项目结构和任务分解，参考 https://github.com/github/spec-kit",
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
        description: "【生成提交】分析代码变更并生成规范的 Git commit 消息（支持 emoji）",
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
        description: "【调试助手】分析错误并生成调试策略和解决方案",
        inputSchema: {
          type: "object",
          properties: {
            error: {
              type: "string",
              description: "错误信息（错误消息、堆栈跟踪）",
            },
            context: {
              type: "string",
              description: "相关代码或场景描述",
            },
          },
          required: [],
        },
      },
      {
        name: "genapi",
        description: "【生成文档】为代码生成 API 文档（支持 Markdown、OpenAPI、JSDoc 格式）",
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "需要生成文档的代码",
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
        description: "【代码审查】全面审查代码质量、安全性、性能和最佳实践",
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "需要审查的代码",
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
        description: "【生成测试】为代码生成完整的测试用例（支持 Jest/Vitest/Mocha）",
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "需要测试的代码",
            },
            framework: {
              type: "string",
              description: "测试框架：jest, vitest, mocha（默认 jest）",
            },
          },
          required: [],
        },
      },
      {
        name: "genpr",
        description: "【生成 PR】分析变更并生成规范的 Pull Request 描述",
        inputSchema: {
          type: "object",
          properties: {
            branch: {
              type: "string",
              description: "分支名称",
            },
            commits: {
              type: "string",
              description: "Commit 历史",
            },
          },
          required: [],
        },
      },
      {
        name: "check_deps",
        description: "【依赖检查】分析项目依赖的健康度（版本、安全漏洞、体积）",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "gendoc",
        description: "【生成注释】为代码生成详细的 JSDoc/TSDoc 注释",
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "需要生成注释的代码",
            },
            style: {
              type: "string",
              description: "注释风格：jsdoc, tsdoc, javadoc（默认 jsdoc）",
            },
            lang: {
              type: "string",
              description: "语言：zh, en（默认 zh）",
            },
          },
          required: [],
        },
      },
      {
        name: "genchangelog",
        description: "【生成 Changelog】根据 commit 历史生成 CHANGELOG.md",
        inputSchema: {
          type: "object",
          properties: {
            version: {
              type: "string",
              description: "版本号（如：v1.2.0）",
            },
            from: {
              type: "string",
              description: "起始 commit/tag",
            },
            to: {
              type: "string",
              description: "结束 commit/tag（默认 HEAD）",
            },
          },
          required: [],
        },
      },
      {
        name: "refactor",
        description: "【重构建议】分析代码并提供重构建议和实施计划",
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
          required: [],
        },
      },
      {
        name: "perf",
        description: "【性能分析】分析代码性能瓶颈并提供优化建议",
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "需要性能分析的代码",
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
        description: "【自动修复】自动修复代码问题（Lint、TypeScript、格式化等）",
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
        description: "【SQL 生成器】根据描述生成 SQL 查询语句",
        inputSchema: {
          type: "object",
          properties: {
            description: {
              type: "string",
              description: "需求描述",
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
        description: "【Git 冲突解决】分析并解决 Git 冲突",
        inputSchema: {
          type: "object",
          properties: {
            conflicts: {
              type: "string",
              description: "冲突内容（git diff 或冲突文件内容）",
            },
          },
          required: [],
        },
      },
      {
        name: "genui",
        description: "【UI 组件生成器】生成 React/Vue UI 组件代码",
        inputSchema: {
          type: "object",
          properties: {
            description: {
              type: "string",
              description: "组件描述",
            },
            framework: {
              type: "string",
              description: "框架：react, vue, html（默认 react）",
            },
          },
          required: [],
        },
      },
      {
        name: "explain",
        description: "【代码解释器】详细解释代码逻辑和原理",
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "需要解释的代码",
            },
            context: {
              type: "string",
              description: "上下文信息",
            },
          },
          required: [],
        },
      },
      {
        name: "convert",
        description: "【代码转换器】转换代码格式/框架（JS→TS、Class→Hooks 等）",
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "源代码",
            },
            from: {
              type: "string",
              description: "源格式/框架",
            },
            to: {
              type: "string",
              description: "目标格式/框架",
            },
          },
          required: [],
        },
      },
      {
        name: "css_order",
        description: "【CSS 顺序】按规则书写或重排 CSS 属性顺序",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "genreadme",
        description: "【README 生成器】根据项目代码生成 README.md 文档",
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
        description: "【文件拆分】将大文件拆分成多个小文件或小组件",
        inputSchema: {
          type: "object",
          properties: {
            file: {
              type: "string",
              description: "文件内容或路径",
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
        description: "【项目分析】深度分析项目结构、代码质量和架构，帮助AI快速理解老项目",
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

