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
import { allToolSchemas } from "./schemas/index.js";
import { getToolParamsGuide } from "./resources/index.js";

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

// 定义工具列表 - 从 schemas 导入
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: allToolSchemas,
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
      {
        uri: "probe://tool-params-guide",
        name: "工具参数指南",
        description: "所有工具的参数说明和使用示例，帮助 AI 正确传参",
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
              toolCount: allToolSchemas.length,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  if (uri === "probe://tool-params-guide") {
    return {
      contents: [
        {
          uri,
          mimeType: "application/json",
          text: JSON.stringify(getToolParamsGuide(VERSION), null, 2),
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
