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
  initProject, gencommit, debug, genapi,
  codeReview, gentest, genpr, checkDeps, gendoc, genchangelog, refactor, perf,
  gensql, resolveConflict, genreadme, analyzeProject,
  initProjectContext, addFeature, securityScan, fixBug, estimate, genMock,
  startFeature, startBugfix, startReview, startRelease, startRefactor, startOnboard, startApi, startDoc,
  startRalph, interview, askUser,
  uiDesignSystem, initComponentCatalog, uiSearch, syncUiData, renderUi, startUi
} from "./tools/index.js";
import { VERSION, NAME } from "./version.js";
import { allToolSchemas } from "./schemas/index.js";
import { getToolParamsGuide } from "./resources/index.js";
import { filterTools, getToolsetFromEnv, getToolsetSize } from "./lib/toolset-manager.js";
import { getTasksManager } from "./lib/tasks-manager.js";

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
      // 新增 MCP 2025-11-25 能力声明
      tasks: {},
    },
  }
);

// 定义工具列表 - 从 schemas 导入，并根据工具集过滤
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const toolset = getToolsetFromEnv();
  const filteredTools = filterTools(allToolSchemas, toolset);
  
  console.error(`[MCP Probe Kit] 当前工具集: ${toolset} (${filteredTools.length}/${allToolSchemas.length} 个工具)`);
  
  return {
    tools: filteredTools,
  };
});

// 处理工具调用
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
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
      case "gensql":
        return await gensql(args);
      case "resolve_conflict":
        return await resolveConflict(args);
      case "genreadme":
        return await genreadme(args);
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
      case "start_ralph":
        return await startRalph(args);
      // 访谈工具
      case "interview":
        return await interview(args);
      case "ask_user":
        return await askUser(args);
      // UI/UX Pro Max 工具
      case "ui_design_system":
        return await uiDesignSystem(args);
      case "init_component_catalog":
        return await initComponentCatalog(args);
      case "ui_search":
        return await uiSearch(args);
      case "sync_ui_data":
        return await syncUiData(args);
      case "render_ui":
        return await renderUi(args);
      case "start_ui":
        return await startUi(args);
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

// ============================================
// Tasks API 端点
// ============================================

// 获取任务状态
server.setRequestHandler({ method: "tasks/get" } as any, async (request: any) => {
  try {
    const { taskId } = request.params;
    const tasksManager = getTasksManager();
    const task = tasksManager.getTask(taskId);
    
    return {
      task,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get task: ${errorMessage}`);
  }
});

// 获取任务结果
server.setRequestHandler({ method: "tasks/result" } as any, async (request: any) => {
  try {
    const { taskId } = request.params;
    const tasksManager = getTasksManager();
    const result = tasksManager.getTaskResult(taskId);
    
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get task result: ${errorMessage}`);
  }
});

// 取消任务
server.setRequestHandler({ method: "tasks/cancel" } as any, async (request: any) => {
  try {
    const { taskId } = request.params;
    const tasksManager = getTasksManager();
    tasksManager.cancelTask(taskId);
    
    return {
      _meta: {},
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to cancel task: ${errorMessage}`);
  }
});

// 列出所有任务
server.setRequestHandler({ method: "tasks/list" } as any, async () => {
  try {
    const tasksManager = getTasksManager();
    const tasks = tasksManager.listTasks();
    
    return {
      tasks,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to list tasks: ${errorMessage}`);
  }
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
