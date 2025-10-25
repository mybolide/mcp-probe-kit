#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { detectShell, initSetting, initProject, gencommit, debug, genapi } from "./tools/index.js";

// 创建MCP服务器实例
const server = new Server(
  {
    name: "mcp-probe-kit",
    version: "1.0.0",
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
        description: "【生成提交】分析代码变更并生成规范的 Git commit 消息",
        inputSchema: {
          type: "object",
          properties: {
            changes: {
              type: "string",
              description: "代码变更内容（可选，默认使用 git diff）",
            },
            type: {
              type: "string",
              description: "提交类型：feat, fix, docs, style, refactor, test, chore",
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
                name: "mcp-probe-kit",
                version: "1.0.0",
                description: "Cursor 开发增强工具集",
              },
              tools: {
                detect_shell: "enabled",
                init_setting: "enabled",
                init_project: "enabled",
                gencommit: "enabled",
                debug: "enabled",
                genapi: "enabled",
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

main().catch((error) => {
  console.error("服务器启动失败:", error);
  process.exit(1);
});

